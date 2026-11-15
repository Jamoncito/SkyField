"""Verify the English-first, field-specific dashboard and bilingual exports."""
import argparse
import json
import secrets
from pathlib import Path

import httpx
from playwright.sync_api import expect, sync_playwright
from pypdf import PdfReader
from acceptance import wait_job


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--base',default='http://localhost:8080')
    parser.add_argument('--output',type=Path,default=Path('.local/evidence-skyfield-2.1'))
    args=parser.parse_args()
    args.output.mkdir(parents=True,exist_ok=True)
    base=args.base
    password=secrets.token_urlsafe(20)
    email='bilingual-'+secrets.token_hex(6)+'@example.org'
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel='msedge')
        context=browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True)
        page=context.new_page()
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto(base)
        expect(page.get_by_role('heading',name='Welcome to SkyField')).to_be_visible(timeout=90000)
        assert page.locator('html').get_attribute('lang')=='en'
        page.get_by_role('button',name='Create account',exact=True).click()
        page.get_by_label('Display name').fill('Jupiter verification')
        page.get_by_label('Email',exact=True).fill(email)
        page.get_by_label('Password',exact=True).fill(password)
        page.get_by_role('button',name='Create account',exact=True).click()
        expect(page.get_by_role('dialog')).to_be_visible(timeout=30000)
        page.get_by_role('button',name='Skip tour',exact=True).click()
        client=httpx.Client(base_url=base+'/api',headers={'Origin':base},timeout=90)
        for c in context.cookies():client.cookies.set(c['name'],c['value'])
        client.headers['X-CSRF-Token']=client.get('/me').raise_for_status().json()['csrf']
        fields=[]
        for name,point in [('Santa Cruz pilot',[-63.272578418254845,-17.182537861479094]),
                           ('Second reference field',[-64.1,-18.1])]:
            fields.append(client.post('/fields',json={'name':name,'geometry':{'type':'Point','coordinates':point}}).raise_for_status().json())
        page.reload()
        try:
            expect(page.locator('.field-choice')).to_have_count(2,timeout=30000)
        except AssertionError:
            page.screenshot(path=args.output/'dashboard-failure.png',full_page=True)
            print(page.locator('body').inner_text()[:2000],errors,flush=True)
            raise
        expect(page.locator('.weather-panel')).to_have_count(0)
        page.screenshot(path=args.output/'field-selection-en.png',full_page=True)
        with page.expect_response('**/api/fields/'+fields[0]['id']+'/weather',timeout=90000) as response:
            page.get_by_role('button',name='Santa Cruz pilot',exact=False).click()
        weather=response.value.json()
        assert weather['point']==[-63.272578418254845,-17.182537861479094]
        expect(page.locator('.weather-days .weather-day')).to_have_count(7,timeout=20000)
        page.screenshot(path=args.output/'dashboard-weather-en.png',full_page=True)
        with page.expect_response('**/api/fields/'+fields[1]['id']+'/weather',timeout=90000) as response:
            page.get_by_role('button',name='Second reference field',exact=False).click()
        assert response.value.json()['point']==[-64.1,-18.1]
        expect(page.locator('.weather-location')).to_contain_text('-18.1',timeout=20000)
        task=client.post('/fields/'+fields[0]['id']+'/analyses',json={
            'previous':'maize','irrigation':'rainfed','trial':True,
            'economics':{'budgets':{'soy':{'cost_bob_ha':5000},'maize':{'cost_bob_ha':6500},'sorghum':{'cost_bob_ha':3500}}}
        }).raise_for_status().json()
        wait_job(client,task,timeout=240)
        run=client.get('/analyses/'+task['target_id']).raise_for_status().json()
        result=run['result']
        assert result['version']=='skyfield-water-2.1.0'
        assert all(m['validation']['rain']['n']==25 for m in result['enso']['months'])
        assert result['quality']['score']==sum(c['points'] for c in result['quality']['components'])
        page.goto(base+'/comparar/'+run['id'])
        expect(page.locator('.data-quality')).to_be_visible(timeout=30000)
        page.screenshot(path=args.output/'comparison-en.png',full_page=True)
        rotation=result['economics']['ranked_ids'][0]
        reports={}
        for language in ['en','es']:
            report=client.post('/analyses/'+run['id']+'/reports',json={'rotation_id':rotation,'language':language}).raise_for_status().json()
            wait_job(client,report,timeout=240)
            pdf=client.get('/reports/'+report['target_id']+'/pdf').raise_for_status().content
            path=args.output/f'report-{language}.pdf'
            path.write_bytes(pdf)
            reader=PdfReader(path)
            text='\n'.join(p.extract_text() or '' for p in reader.pages)
            assert all('SkyField' in (p.extract_text() or '')[:120] for p in reader.pages)
            assert len(reader.pages)>=8
            assert ('Data quality' in text or 'Evidence' in text or 'Input integrity' in text) if language=='en' else 'Integridad de entradas' in text
            reports[language]={'id':report['target_id'],'pages':len(reader.pages)}
        assert reports['en']['id']!=reports['es']['id']
        page.get_by_role('button',name='Español',exact=True).click()
        expect(page.get_by_role('heading',name='Calidad de la evidencia',exact=False)).to_have_count(0)
        expect(page.locator('.data-quality')).to_contain_text('Integridad de entradas',timeout=30000)
        assert page.locator('html').get_attribute('lang')=='es'
        page.screenshot(path=args.output/'comparison-es.png',full_page=True)
        page.get_by_role('button',name='English',exact=True).click()
        expect(page.locator('html')).to_have_attribute('lang','en')
        page.get_by_role('button',name='About',exact=True).click()
        expect(page.get_by_role('heading',name='About SkyField')).to_be_visible()
        expect(page.locator('.about-page')).to_contain_text('Jupiter')
        page.screenshot(path=args.output/'about-en.png',full_page=True)
        page.goto(base)
        page.get_by_role('button',name='Santa Cruz pilot',exact=False).click(timeout=20000)
        expect(page.locator('.finance-numbers strong').last).not_to_have_text('—',timeout=20000)
        page.screenshot(path=args.output/'dashboard-en.png',full_page=True)
        for width in [360,390,768,1440]:
            page.set_viewport_size({'width':width,'height':844 if width<800 else 1000})
            page.wait_for_timeout(250)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
        page.set_viewport_size({'width':390,'height':844})
        page.screenshot(path=args.output/'dashboard-mobile-en.png',full_page=True)
        assert not errors,errors
        (args.output/'verification.json').write_text(json.dumps({'run':run,'reports':reports,
            'synthetic_test_costs':{'soy':5000,'maize':6500,'sorghum':3500},'weather':weather,
            'browser_errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
        browser.close()
    print('Aceptación bilingüe correcta',run['id'],reports,flush=True)


if __name__=='__main__':main()
