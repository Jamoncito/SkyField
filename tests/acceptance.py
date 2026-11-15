import argparse
import csv
from pathlib import Path
import secrets
import time

import httpx
from playwright.sync_api import expect, sync_playwright
from pypdf import PdfReader

def wait_job(client, task, expected="done", timeout=60):
    end=time.monotonic()+timeout
    last={}
    while time.monotonic()<end:
        response=client.get("/jobs/"+task["job_id"])
        response.raise_for_status()
        last=response.json()
        if last["status"] in {"done","failed","cancelled"}:
            assert last["status"]==expected,last
            return last
        time.sleep(.8)
    raise AssertionError(last)


def walk_tour(page,output,prefix="recorrido"):
    tour=page.get_by_role("dialog")
    expect(tour).to_be_visible(timeout=20000)
    for i in range(26):
        expect(tour.get_by_text(f"Tu primer lote · {i+1} de 26",exact=True)).to_be_visible()
        button=tour.get_by_role("button",name="Finalizar" if i==25 else "Siguiente",exact=True)
        expect(button).to_be_enabled(timeout=180000)
        page.wait_for_timeout(400)
        assert page.locator('.tour-spotlight').count()==1,i
        box=tour.bounding_box()
        assert box['x']>=0 and box['x']+box['width']<=page.viewport_size['width']+1
        if box['y']<0 or box['y']+box['height']>page.viewport_size['height']+1:
            page.screenshot(path=output/f'{prefix}-fallo-{i+1}.png')
            raise AssertionError((i,box,page.viewport_size))
        if i in (0,2,12,18,20,25):page.screenshot(path=output/f"{prefix}-{i+1}.png")
        if i==1:
            button.click()
            expect(tour.get_by_role('alert')).to_be_visible()
            expect(tour.get_by_text('Tu primer lote · 2 de 26',exact=True)).to_be_visible()
            page.get_by_label('Nombre del lote').fill('Mi primer piloto SkyField')
        if i==2:
            button.click()
            expect(tour.get_by_role('alert')).to_be_visible()
            page.get_by_role('button',name='Usar punto piloto de Santa Cruz',exact=True).click()
        if i==3:
            button.click()
            expect(tour.get_by_role('alert')).to_be_visible()
            page.get_by_role('button',name='Guardar',exact=True).click()
            page.wait_for_url('**/lotes/*')
            expect(page.locator('[data-saved="true"]')).to_be_visible(timeout=20000)
        if i==12:
            button.click()
            expect(tour.get_by_role('alert')).to_be_visible()
            page.get_by_label('Cultivo anterior').select_option('maize')
            page.get_by_label('Disponibilidad de riego').select_option('rainfed')
        if i==16:
            button.click()
            expect(tour.get_by_role('alert')).to_be_visible()
            page.get_by_label('Activar supuestos de ensayo').check()
        if i==18:
            button.click()
            expect(tour.get_by_role('alert')).to_be_visible()
            page.get_by_label('Costo de Soya',exact=True).fill('5000')
            page.get_by_label('Costo de Maíz',exact=True).fill('6500')
            page.get_by_label('Costo de Sorgo',exact=True).fill('3500')
        if i==19:
            page.get_by_role('button',name='Analizar rotaciones',exact=True).click()
        else:
            button.click()
    expect(tour).to_have_count(0)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--base",default="http://localhost:8080")
    parser.add_argument("--channel",default=None)
    parser.add_argument("--output",type=Path,default=Path(".local/evidence"))
    parser.add_argument("--soil",action="store_true",help="Also verify a live SoilGrids profile")
    args=parser.parse_args()
    args.output.mkdir(parents=True,exist_ok=True)
    base=args.base
    key=secrets.token_hex(5)
    password=secrets.token_urlsafe(18)
    email=f"jupiter-{key}@example.org"
    point=dict(type="Point",coordinates=[-63.272578418254845,-17.182537861479094])
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel=args.channel,args=["--enable-webgl","--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        context=browser.new_context(viewport={"width":1440,"height":1000},accept_downloads=True)
        page=context.new_page()
        errors=[]
        page.on("pageerror",lambda exc:errors.append(exc.stack or str(exc)))
        page.goto(base)
        image=page.request.get(base+'/skyfield-aerial.webp')
        assert image.headers['content-type'].startswith('image/webp')
        page.get_by_role("button",name="Crear cuenta").click()
        page.get_by_label("Nombre visible").fill("Productor de prueba")
        page.get_by_label("Correo electrónico").fill(email)
        page.get_by_label("Contraseña").fill(password)
        page.get_by_role("button",name="Crear cuenta").click()
        expect(page.get_by_role("heading",name="Hola, Productor")).to_be_visible(timeout=20000)
        walk_tour(page,args.output)
        page.reload()
        expect(page.get_by_role("button",name="Planificar mi rotación")).to_be_visible(timeout=20000)
        expect(page.get_by_role("dialog")).to_have_count(0)
        expect(page.get_by_role("button",name="Planificar mi rotación")).to_be_visible()
        page.screenshot(path=args.output/"panel.png")

        client=httpx.Client(base_url=base+"/api",timeout=20,headers={"Origin":base})
        for cookie in context.cookies():
            client.cookies.set(cookie["name"],cookie["value"])
        client.headers["X-CSRF-Token"]=client.get("/me").raise_for_status().json()["csrf"]
        assert client.post('/me/guide/start').raise_for_status().json()=={'show':False}
        catalog=client.get('/crops').raise_for_status().json()
        assert len(catalog)==24 and sum(c['simulated'] for c in catalog)==15
        assert {'coffee','cacao','vanilla','pitaya','acai'} <= {c['code'] for c in catalog}
        pilot=client.get("/fields").raise_for_status().json()[0]
        assert pilot["area_ha"] is None
        aid=pilot["id"]
        pilot_csv=Path("data/reference/NASA_POWER_PT_priner_2015_2025.csv")
        page.route("https://tiles.openfreemap.org/**",lambda route:route.abort())
        page.goto(base+'/lotes/'+aid)
        expect(page.get_by_role("heading",name="Ubicación del lote")).to_be_visible()
        expect(page.get_by_role("button",name="Mostrar OpenFreeMap")).to_be_visible(timeout=20000)
        expect(page.get_by_role("button",name="Dibujar terreno")).to_be_enabled(timeout=20000)
        page.get_by_label("Provincia, municipio o departamento").fill("Chiquitos")
        page.get_by_role("button",name="Chiquitos Provincia · Santa Cruz").click()
        expect(page.get_by_role("button",name="Confirmar punto")).to_be_visible()
        page.get_by_role("button",name="Coordenadas").click()
        page.get_by_label("Latitud",exact=True).fill("-17,182538")
        page.get_by_label("Longitud",exact=True).fill("-63,272578")
        page.get_by_role("button",name="Ubicar",exact=True).click()
        expect(page.get_by_text("Coordenadas ingresadas.",exact=False)).to_be_visible()
        page.get_by_role("button",name="Descargar mapa sin conexión").click()
        expect(page.get_by_text("Mapa de Santa Cruz guardado",exact=False)).to_be_visible(timeout=100000)
        context.set_offline(True)
        offline=context.new_page()
        offline.goto(base+"/mapa-sin-conexion")
        expect(offline.get_by_role("heading",name="Mapa sin conexión de Santa Cruz")).to_be_visible()
        expect(offline.get_by_role("button",name="Dibujar terreno")).to_be_enabled(timeout=20000)
        offline.get_by_label("Provincia, municipio o departamento").fill("Warnes")
        offline.get_by_role("button",name="Warnes Provincia · Santa Cruz").click()
        expect(offline.get_by_text("Warnes.",exact=False)).to_be_visible()
        expect(offline.get_by_text("GeoBolivia",exact=False)).to_be_attached()
        offline.screenshot(path=args.output/"santa-cruz-sin-conexion.png",full_page=True)
        offline.close()
        context.set_offline(False)
        page.get_by_text("Capas NASA por fecha").click()
        with page.expect_response(lambda r:"MODIS_Terra_L3_NDVI_Monthly" in r.url and r.ok, timeout=45000):
            page.get_by_label("Variable NASA",exact=True).select_option("ndvi")
        for code,identifier in [('temperature','MODIS_Terra_Land_Surface_Temp_Day'),
                                ('biomass','GEDI_ISS_L4B_Aboveground_Biomass_Density_Mean_201904-202303'),
                                ('elevation','SRTM_Color_Index')]:
            with page.expect_response(lambda r:identifier in r.url and r.ok,timeout=45000):
                page.get_by_label('Variable NASA',exact=True).select_option(code)
        page.get_by_label("Variable NASA",exact=True).select_option("")
        page.get_by_text("Capas NASA por fecha").click()
        if args.soil:
            page.get_by_role("button",name="Consultar suelo",exact=True).click()
            expect(page.get_by_text("Franco arcillo arenosa",exact=True)).to_be_visible(timeout=100000)
            soil=client.get(f"/fields/{aid}/soil-profile").raise_for_status().json()
            assert soil["ph_interval"] and soil["surface"]["sand"]>0
        page.screenshot(path=args.output/"lote.png")
        page.get_by_role("button",name="Analizar",exact=True).click()
        page.get_by_label("Cultivo anterior").select_option("maize")
        page.get_by_label("Disponibilidad de riego").select_option("rainfed")
        page.get_by_label("Activar supuestos de ensayo").check()
        page.get_by_label('Costo de Soya',exact=True).fill('5000')
        page.get_by_label('Costo de Maíz',exact=True).fill('6500')
        page.get_by_label('Costo de Sorgo',exact=True).fill('3500')
        page.get_by_role("button",name="Analizar rotaciones").click()
        expect(page.get_by_role("heading",name="Alternativas de rotación")).to_be_visible(timeout=140000)
        runid=page.url.rstrip("/").split("/")[-1]
        data=client.get("/analyses/"+runid).raise_for_status().json()["result"]
        assert data["source"]["rows"]==4018 and data["source"]["missing_days"]==0
        assert abs(data["source"]["mean_annual_rain_mm"]-1174.83)<.01
        assert abs(data["source"]["mean_temp_c"]-26.13)<.01
        assert data["status"]=="Exploratorio" and data["trial"]
        assert 3<=len(data["alternatives"])<=6 and data["alternatives"][0]["metrics"]["historical"]["deficit_mm"]>0
        assert data['enso']['status']=='available' and len(data['enso']['months'])==12
        assert data['alternatives'][0]['metrics']['elnino']['deficit_mm']>=0
        assert data['alternatives'][0]['metrics']['lanina']['deficit_mm']>=0
        assert data['economics']['evaluated']>0 and data['economics']['ranked_ids']
        assert len(data['weather']['days'])==7,data['weather']
        assert data['weather']['month']['members']==51,data['weather']
        assert data["candidate_count"]>24 and len(data["moisture"]["monthly"])==132
        assert len(data["climate_indicators"])==11 and data["alternatives"][0]["recommendation"]["reasons"]
        assert len(data['environment']['monthly'])==132 and len(data['environment']['trends'])==3
        assert data['alternatives'][0]['timeline']['historical']
        exposures=client.get('/field-exposure').raise_for_status().json()
        assert exposures[0]['id']==aid and 0<=exposures[0]['stress_pct']<=100
        page.get_by_role('button',name='Abrir mapa de lotes',exact=True).click()
        expect(page.get_by_label('Indicador en el mapa')).to_be_visible()
        page.get_by_label('Indicador en el mapa').select_option('hot_days')
        page.get_by_label('Indicador en el mapa').select_option('frost_days')
        if args.soil:
            assert data['regional_soil']['texture']=='Franco arcillo arenosa'
        expect(page.locator(".js-plotly-plot").first).to_be_visible(timeout=20000)
        page.screenshot(path=args.output/"comparacion.png",full_page=True)
        for width in (360, 390, 768, 1440):
            page.set_viewport_size({"width": width, "height": 900})
            try:
                page.wait_for_function("document.documentElement.scrollWidth === window.innerWidth", timeout=5000)
            except Exception:
                page.screenshot(path=args.output/f"overflow-{width}.png",full_page=True)
                overflow = page.evaluate("""() => [...document.querySelectorAll('main *')]
                    .filter(el => el.getBoundingClientRect().right > innerWidth + 1)
                    .map(el => ({tag:el.tagName,classes:el.className,width:el.getBoundingClientRect().width,
                                 text:el.textContent.slice(0,100)})).slice(0,20)""")
                raise AssertionError((width,overflow))
            if width == 390:
                page.screenshot(path=args.output/"comparacion-movil.png",full_page=True)
        page.get_by_role("button",name="Cambio personalizado",exact=True).first.click()
        expect(page.get_by_text("Hipótesis",exact=False)).to_be_visible()
        for scenario_label in ('Súper Niño · +2 °C RONI','Súper Niña · −2 °C RONI'):
            page.get_by_role('button',name=scenario_label,exact=True).first.click()
            expect(page.get_by_text('cambio del déficit hídrico acumulado',exact=True).first).to_be_visible()
        for horizon in ('30 días','Estacional','Año / ciclo','7 días'):
            page.get_by_role('button',name=horizon,exact=True).click()
            expect(page.get_by_role('button',name=horizon,exact=True)).to_have_attribute('aria-pressed','true')

        page.get_by_role("button",name="Generar informe").click()
        link=page.get_by_role("link",name="Descargar PDF")
        expect(link).to_be_visible(timeout=140000)
        with page.expect_download() as download_pdf:
            link.click()
        download_pdf.value.save_as(args.output/"informe.pdf")
        with page.expect_download() as download_csv:
            page.get_by_role("link",name="Descargar CSV").click()
        download_csv.value.save_as(args.output/"metricas.csv")
        reportid=link.get_attribute("href").split("/")[-2]
        pdf=PdfReader(args.output/"informe.pdf")
        assert len(pdf.pages)>=4
        assert any("Comparación de tendencias" in p.extract_text() for p in pdf.pages)
        assert any("Recomendaciones basadas en el análisis" in p.extract_text() for p in pdf.pages)
        assert any("Evaluación económica del lote" in p.extract_text() for p in pdf.pages)
        assert any("Cambio climático y sensibilidad ENSO" in p.extract_text() for p in pdf.pages)
        assert "Informe de rotación agrícola" in pdf.pages[0].extract_text()
        assert "Productor de prueba" in pdf.pages[0].extract_text()
        with (args.output/"metricas.csv").open(encoding="utf-8",newline="") as input_csv:
            report_rows=list(csv.DictReader(input_csv))
        selected_id=data['economics']['ranked_ids'][0]
        selected=next(r for r in data['alternatives'] if r['id']==selected_id)
        assert report_rows[0]["rotation_id"]==selected_id
        assert float(report_rows[0]["value"])==selected["metrics"]["historical"]["deficit_mm"]
        assert all('SkyField' in (p.extract_text()[:120]) for p in pdf.pages)
        assert client.get(f"/reports/{reportid}/daily").raise_for_status().text.startswith("run_id,scenario_id,rotation_id")

        page.goto(base+'/cultivos')
        page.get_by_label('Cultivo perenne',exact=True).select_option('vanilla')
        for name,value in {'establishment_bob_ha':'10000','annual_cost_bob_ha':'1000','sale_bob_t':'20000',
                           'yield_t_ha':'.2','first_harvest_year':'3','horizon_years':'6','discount_pct':'0'}.items():
            page.locator(f'[name="{name}"]').fill(value)
        page.get_by_role('button',name='Calcular flujo de caja',exact=True).click()
        expect(page.get_by_text('Año 6',exact=True)).to_be_visible()
        with page.expect_download() as budget_download:
            page.get_by_role('button',name='Descargar presupuesto CSV',exact=True).click()
        budget_download.value.save_as(args.output/'presupuesto-vainilla.csv')
        page.get_by_label('Año CAO').select_option('2023')
        page.get_by_role('button',name='Invierno',exact=True).click()
        page.get_by_label('Indicador CAO').select_option('yield_t_ha')
        page.screenshot(path=args.output/'cultivos-y-cao.png',full_page=True)
        page.locator('[name="sale_bob_t"]').fill('21000')
        expect(page.get_by_text('Año 6',exact=True)).to_have_count(0)
        page.goto(base)
        expect(page.locator('.finance-overview')).to_be_visible(timeout=20000)
        page.screenshot(path=args.output/'dashboard-completo.png',full_page=True)

        page.goto(base+f'/lotes/{aid}/analizar')
        page.get_by_label('Cultivo anterior').select_option('unknown')
        page.get_by_label('Disponibilidad de riego').select_option('rainfed')
        page.get_by_label('Activar supuestos de ensayo').check()
        page.get_by_label('Elegir un mes por campaña anual').check()
        page.get_by_label('Mes de campaña 2',exact=True).select_option('5')
        page.get_by_role('button',name='Analizar rotaciones',exact=True).click()
        expect(page.get_by_role('heading',name='Alternativas de rotación')).to_be_visible(timeout=140000)
        seasonal=client.get('/analyses/'+page.url.split('/')[-1]).raise_for_status().json()
        assert seasonal['inputs']['plant_months']==[11,5,11]
        assert [c['month'] for c in seasonal['result']['alternatives'][0]['calendar']]==[11,5,11]

        other=httpx.Client(base_url=base+"/api",timeout=20,headers={"Origin":base})
        user=other.post("/auth/register",json={"email":f"other-{key}@example.org","name":"Otra cuenta","password":password}).raise_for_status().json()
        other.headers["X-CSRF-Token"]=user["csrf"]
        assert all(f['id']!=aid for f in other.get('/field-exposure').raise_for_status().json())
        for path in (f"/fields/{aid}",f"/analyses/{runid}",f"/reports/{reportid}/pdf",f"/reports/{reportid}/csv"):
            assert other.get(path).status_code==404
        assert other.post(f"/fields/{aid}/analyses",json={}).status_code==404
        assert client.post("/fields",json={"name":"CSRF","geometry":point},headers={"Origin":"https://example.org"}).status_code==403

        with pilot_csv.open("rb") as stream:
            task=client.post(f"/fields/{aid}/imports",data={"kind":"climate"},files={"file":("power.csv",stream,"text/csv")}).raise_for_status().json()
        wait_job(client,task)
        assert other.get("/jobs/"+task["job_id"]).status_code==404
        with pilot_csv.open("rb") as stream:
            repeat=client.post(f"/fields/{aid}/imports",data={"kind":"climate"},files={"file":("power.csv",stream,"text/csv")}).raise_for_status().json()
        assert repeat["job_id"]==task["job_id"]
        site=client.post("/fields",json={"name":"Lote lejano de prueba","geometry":{"type":"Point","coordinates":[-66.19,-17.39]}}).raise_for_status().json()
        with pilot_csv.open("rb") as stream:
            foreign=client.post(f"/fields/{site['id']}/imports",data={"kind":"climate"},files={"file":("power.csv",stream,"text/csv")}).raise_for_status().json()
        assert "coordenadas" in wait_job(client,foreign,"failed")["error"]

        csv_header="date,tmean_c,tmin_c,tmax_c,rh_pct,wind2m_ms,solar_mj_m2_day,precip_mm_day\n"
        valid="2024-02-28,26,21,32,72,1.5,19,1.5\n"
        def load_file(payload):
            return client.post(f"/fields/{site['id']}/imports",data={"kind":"climate"},
                files={"file":("observado.csv",payload,"text/csv")}).raise_for_status().json()
        assert "duplicadas" in wait_job(client,load_file(csv_header+valid+valid),"failed")["error"]
        assert "Fila 3" in wait_job(client,load_file(csv_header+valid+valid.replace("2024-02-28","2023-02-29")),"failed")["error"]
        wait_job(client,load_file(csv_header+valid+valid.replace("2024-02-28","2024-03-01")))
        recs=client.get(f"/fields/{site['id']}/imports").raise_for_status().json()
        assert recs[0]["summary"]["missing_days"]==1

        bowtie={"type":"Polygon","coordinates":[[[-63.3,-17.12],[-63.31,-17.13],[-63.31,-17.12],[-63.3,-17.13],[-63.3,-17.12]]]}
        assert client.post("/fields",json={"name":"Autocruce","geometry":bowtie}).status_code==422

        # Draw a separate test perimeter through Terra Draw.
        page.goto(base+"/lotes/nuevo")
        canvas=page.locator(".maplibregl-canvas")
        draw=page.get_by_role("button",name="Dibujar terreno")
        try:
            expect(draw).to_be_enabled(timeout=30000)
        except Exception:
            page.screenshot(path=args.output/'fallo-nuevo-lote.png',full_page=True)
            print('NEW FIELD FAILURE',page.url,page.locator('body').inner_text(),errors)
            raise
        draw.click()
        box=canvas.bounding_box()
        verts=[(.37,.40),(.65,.40),(.65,.66),(.37,.66),(.37,.40)]
        for x,y in verts:
            px,py=box["x"]+box["width"]*x,box["y"]+box["height"]*y
            page.mouse.move(px,py,steps=4)
            page.mouse.click(px,py,delay=35)
            page.wait_for_timeout(180)
        page.get_by_label("Nombre del lote").fill("Perímetro dibujado de prueba")
        page.get_by_role("button",name="Guardar",exact=True).click()
        expect(page.get_by_role("heading",name="Perímetro dibujado de prueba")).to_be_visible()
        drawn=client.get("/fields/"+page.url.rstrip("/").split("/")[-1]).raise_for_status().json()
        assert drawn["geometry"]["type"]=="Polygon" and drawn["area_ha"]>0
        page.screenshot(path=args.output/"poligono.png",full_page=True)

        # A separate browser viewport and emulated geolocation exercise the mobile controls.
        mobile=browser.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True,
            geolocation={"latitude":-17.18,"longitude":-63.27,"accuracy":18},permissions=["geolocation"])
        mobile.add_cookies(context.cookies())
        m=mobile.new_page()
        m.route("https://tiles.openfreemap.org/**",lambda route:route.abort())
        m.goto(base+"/lotes/nuevo")
        expect(m.get_by_role("button",name="Mostrar OpenFreeMap")).to_be_visible(timeout=20000)
        expect(m.get_by_role("button",name="Dibujar terreno")).to_be_enabled(timeout=20000)
        m.get_by_role("button",name="Ir a mi ubicación").click()
        expect(m.get_by_text("Precisión estimada",exact=False)).to_be_visible(timeout=10000)
        m.get_by_role("button",name="Confirmar punto").click()
        m.get_by_label("Nombre del lote").fill("Punto GPS emulado")
        m.get_by_role("button",name="Guardar",exact=True).click()
        expect(m.get_by_role("heading",name="Punto GPS emulado")).to_be_visible()
        assert m.evaluate("document.documentElement.scrollWidth===window.innerWidth")
        m.screenshot(path=args.output/"movil.png",full_page=True)
        m.get_by_role('button',name='Productor',exact=False).click()
        m.get_by_role('button',name='Ver guía',exact=True).click()
        walk_tour(m,args.output,'recorrido-movil')
        m.get_by_role('button',name='Productor',exact=False).click()
        m.get_by_role('button',name='Ver guía',exact=True).click()
        m.get_by_role('button',name='Saltar recorrido',exact=True).click()
        expect(m.get_by_role('dialog')).to_have_count(0)

        denied=browser.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True)
        denied.add_init_script("navigator.geolocation.getCurrentPosition = (_, fail) => fail({code:1});")
        denied.add_cookies(context.cookies())
        dp=denied.new_page()
        dp.goto(base+"/lotes/nuevo")
        dp.get_by_role("button",name="Ir a mi ubicación").click()
        expect(dp.get_by_text("Permiso denegado",exact=False)).to_be_visible()
        page.get_by_role("button",name="Productor",exact=False).click()
        page.get_by_role("button",name="Cerrar sesión").click()
        expect(page.get_by_role("heading",name="Bienvenido a SkyField")).to_be_visible()
        page.get_by_label("Correo electrónico").fill(email)
        page.get_by_label("Contraseña").fill(password)
        page.get_by_role("button",name="Iniciar sesión").click()
        expect(page.get_by_role("heading",name="Hola, Productor")).to_be_visible()
        expect(page.get_by_role("dialog")).to_have_count(0)
        assert not errors,errors
        print("Aceptación web/API correcta · piloto, escenarios, PDF, CSV, aislamiento e importaciones")
        print("Análisis",runid,"· Informe",reportid,"· Evidencia",args.output)
        browser.close()

if __name__=="__main__":
    main()

