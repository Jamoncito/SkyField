"""Exercise visible startup failures without relying on an active session."""
import argparse
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--base',default='http://localhost:8080')
    parser.add_argument('--output',type=Path,default=Path('.local/evidence-recovery-ui'))
    args=parser.parse_args()
    args.output.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel='msedge')
        page=browser.new_page(viewport={'width':390,'height':844})
        page.route('**/assets/index-*.js',lambda route:route.abort())
        page.goto(args.base)
        expect(page.get_by_role('button',name='Reload',exact=True)).to_be_visible()
        expect(page.get_by_text('Some resources could not be downloaded.',exact=False)).to_be_visible()
        page.screenshot(path=args.output/'descarga-interrumpida.png')
        page.unroute('**/assets/index-*.js')
        page.route('**/api/me',lambda route:route.fulfill(status=503,json={'detail':'Servicio temporalmente ocupado.'}))
        page.reload()
        expect(page.get_by_text('Servicio temporalmente ocupado.',exact=True)).to_be_visible()
        page.screenshot(path=args.output/'servicio-temporalmente-ocupado.png')
        page.unroute('**/api/me')
        page.get_by_role('button',name='Retry',exact=True).click()
        expect(page.get_by_role('heading',name='Welcome to SkyField')).to_be_visible()
        browser.close()
    print('Recuperación de carga correcta · recursos, mensaje de servicio y reintento')


if __name__=='__main__':
    main()
