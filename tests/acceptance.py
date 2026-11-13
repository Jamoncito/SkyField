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

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--base",default="http://localhost:8080")
    parser.add_argument("--channel",default=None)
    parser.add_argument("--output",type=Path,default=Path(".local/evidence"))
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
        page.get_by_role("button",name="Crear cuenta").click()
        page.get_by_label("Nombre visible").fill("Productor de prueba")
        page.get_by_label("Correo electrónico").fill(email)
        page.get_by_label("Contraseña").fill(password)
        page.get_by_role("button",name="Crear cuenta").click()
        expect(page.get_by_role("heading",name="Planifica tu próxima rotación")).to_be_visible(timeout=20000)
        expect(page.get_by_role("button",name="Explorar lote piloto")).to_be_visible()
        page.screenshot(path=args.output/"panel.png")

        client=httpx.Client(base_url=base+"/api",timeout=20,headers={"Origin":base})
        for cookie in context.cookies():
            client.cookies.set(cookie["name"],cookie["value"])
        client.headers["X-CSRF-Token"]=client.get("/me").raise_for_status().json()["csrf"]
        pilot=client.get("/fields").raise_for_status().json()[0]
        assert pilot["area_ha"] is None
        aid=pilot["id"]
        pilot_csv=Path("data/reference/NASA_POWER_PT_priner_2015_2025.csv")
        page.route("https://tiles.openfreemap.org/**",lambda route:route.abort())
        page.get_by_role("button",name="Explorar lote piloto").click()
        expect(page.get_by_role("heading",name="Ubicación del lote")).to_be_visible()
        expect(page.get_by_role("button",name="Mostrar OpenFreeMap")).to_be_visible(timeout=20000)
        expect(page.get_by_role("button",name="Dibujar terreno")).to_be_enabled(timeout=20000)
        page.screenshot(path=args.output/"lote.png")
        page.get_by_role("button",name="Analizar",exact=True).click()
        page.get_by_label("Cultivo anterior").select_option("maize")
        page.get_by_label("Disponibilidad de riego").select_option("rainfed")
        page.get_by_label("Activar supuestos de ensayo").check()
        page.get_by_role("button",name="Analizar rotaciones").click()
        expect(page.get_by_role("heading",name="Alternativas de rotación")).to_be_visible(timeout=75000)
        runid=page.url.rstrip("/").split("/")[-1]
        data=client.get("/analyses/"+runid).raise_for_status().json()["result"]
        assert data["source"]["rows"]==4018 and data["source"]["missing_days"]==0
        assert abs(data["source"]["mean_annual_rain_mm"]-1174.83)<.01
        assert abs(data["source"]["mean_temp_c"]-26.13)<.01
        assert data["status"]=="Exploratorio" and data["trial"]
        assert len(data["alternatives"])==3 and data["alternatives"][0]["metrics"]["historical"]["deficit_mm"]>0
        expect(page.locator(".js-plotly-plot").first).to_be_visible(timeout=20000)
        page.screenshot(path=args.output/"comparacion.png",full_page=True)
        page.get_by_role("button",name="Sensibilidad",exact=True).click()
        expect(page.get_by_text("Hipótesis",exact=False)).to_be_visible()

        page.get_by_role("button",name="Generar informe").click()
        link=page.get_by_role("link",name="Descargar PDF")
        expect(link).to_be_visible(timeout=90000)
        with page.expect_download() as download_pdf:
            link.click()
        download_pdf.value.save_as(args.output/"informe.pdf")
        with page.expect_download() as download_csv:
            page.get_by_role("link",name="Descargar CSV").click()
        download_csv.value.save_as(args.output/"metricas.csv")
        reportid=link.get_attribute("href").split("/")[-2]
        pdf=PdfReader(args.output/"informe.pdf")
        assert len(pdf.pages)==2
        assert "Informe de rotación agrícola" in pdf.pages[0].extract_text()
        assert "Productor de prueba" in pdf.pages[0].extract_text()
        with (args.output/"metricas.csv").open(encoding="utf-8",newline="") as input_csv:
            report_rows=list(csv.DictReader(input_csv))
        assert report_rows[0]["rotation_id"]==data["alternatives"][0]["id"]
        assert float(report_rows[0]["value"])==data["alternatives"][0]["metrics"]["historical"]["deficit_mm"]
        assert client.get(f"/reports/{reportid}/daily").raise_for_status().text.startswith("run_id,scenario_id,rotation_id")

        other=httpx.Client(base_url=base+"/api",timeout=20,headers={"Origin":base})
        user=other.post("/auth/register",json={"email":f"other-{key}@example.org","name":"Otra cuenta","password":password}).raise_for_status().json()
        other.headers["X-CSRF-Token"]=user["csrf"]
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
        expect(draw).to_be_enabled(timeout=20000)
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

        denied=browser.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True)
        denied.add_init_script("navigator.geolocation.getCurrentPosition = (_, fail) => fail({code:1});")
        denied.add_cookies(context.cookies())
        dp=denied.new_page()
        dp.goto(base+"/lotes/nuevo")
        dp.get_by_role("button",name="Ir a mi ubicación").click()
        expect(dp.get_by_text("Permiso denegado",exact=False)).to_be_visible()
        page.get_by_role("button",name="Productor",exact=False).click()
        page.get_by_role("button",name="Cerrar sesión").click()
        expect(page.get_by_role("heading",name="Bienvenido a Júpiter Jr")).to_be_visible()
        page.get_by_label("Correo electrónico").fill(email)
        page.get_by_label("Contraseña").fill(password)
        page.get_by_role("button",name="Iniciar sesión").click()
        expect(page.get_by_role("heading",name="Planifica tu próxima rotación")).to_be_visible()
        assert not errors,errors
        print("Aceptación web/API correcta · piloto, escenarios, PDF, CSV, aislamiento e importaciones")
        print("Análisis",runid,"· Informe",reportid,"· Evidencia",args.output)
        browser.close()

if __name__=="__main__":
    main()
