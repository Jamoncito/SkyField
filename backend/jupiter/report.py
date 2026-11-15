import base64
import csv
from io import BytesIO
import os
import shutil
from pathlib import Path


from jinja2 import Environment, FileSystemLoader, select_autoescape
from playwright.sync_api import sync_playwright
from pypdf import PdfReader
import plotly.graph_objects as go
from plotly.subplots import make_subplots

from .climate import sha
from .db import ROOT, STORAGE
from .jobs import JobError
from .i18n import localize, translate
from .quality import evidence_quality

MONTHS = "Ene Feb Mar Abr May Jun Jul Ago Sep Oct Nov Dic".split()
METRICS = {"deficit_mm":("Déficit hídrico","mm"),"stress_days":("Días con déficit","días"),
           "cover_pct":("Cobertura media","%"),"irrigation_mm":("Riego simulado","mm"),
           "frost_days":("Días con mínima ≤0 °C","días"),"hot_days":("Días con máxima ≥35 °C","días"),
           "fallow_days":("Días fuera de cultivo simulado","días")}
TRACE = ["date","crop","rain_mm","et0_mm","etc_mm","eta_mm","deficit_mm","depletion_mm",
         "irrigation_mm","drainage_mm","runoff_mm","raw_mm"]

def embed(data, media="image/png"):
    return f"data:{media};base64,"+base64.b64encode(data).decode()

def map_figure(site):
    from math import cos, radians
    from PIL import Image, ImageDraw, ImageFont

    image = Image.new("RGB", (720,330), "#edf2e8")
    draw = ImageDraw.Draw(image)
    geo = site["geometry"]
    polys = ([geo["coordinates"]] if geo["type"] == "Polygon" else
             geo["coordinates"] if geo["type"] == "MultiPolygon" else [])
    lon, lat = site["lon"],site["lat"]
    points = [pair for p in polys for pair in p[0]]
    xscale, yscale = 111320*cos(radians(lat)),110540
    width = max((abs(x-lon)*xscale for x,_y in points),default=160)
    height = max((abs(y-lat)*yscale for _x,y in points),default=85)
    scale = min(275/max(width,1),120/max(height,1))
    for x in range(40,721,70):
        draw.line((x,0,x,330), fill="#d8e4d4")
    for y in range(35,331,65):
        draw.line((0,y,720,y), fill="#d8e4d4")
    for poly in polys:
        for i,ring in enumerate(poly):
            pixels = [(360+(x-lon)*xscale*scale,165-(y-lat)*yscale*scale) for x,y in ring]
            draw.polygon(pixels,fill="#aed49d" if i==0 else "#edf2e8",outline="#367058",width=3)
    if not polys:
        draw.ellipse((347,152,373,178),fill="#20624a",outline="white",width=3)
    bar = next(v for v in [100000,10000,1000,500,200,100,50,20,10,5,1,.1,.01] if scale*v <= 135)
    draw.line((39,293,39+scale*bar,293), fill="#235341",width=3)
    draw.text((39,269),f"{bar:g} m",fill="#235341",font=ImageFont.load_default_imagefont())
    draw.polygon([(665,36),(658,63),(672,63)],fill="#235341")
    draw.text((658,67),"N",fill="#235341",font=ImageFont.load_default_imagefont())
    buffer=BytesIO()
    image.save(buffer,format="PNG")
    return embed(buffer.getvalue())

def climate_figure(output, language="es"):
    chart = make_subplots(specs=[[{"secondary_y":True}]])
    months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split() if language=="en" else MONTHS
    chart.add_trace(go.Bar(x=months,y=[m["rain"] for m in output["monthly"]],
                           name=translate("Lluvia (mm)",language),marker_color="#b0d9a0"))
    chart.add_trace(go.Scatter(x=months,y=[m["temp"] for m in output["monthly"]],
                               name=translate("Temperatura (°C)",language),line=dict(color="#23624c",width=3),mode="lines+markers"),
                    secondary_y=True)
    chart.update_yaxes(title_text="mm",secondary_y=False)
    chart.update_yaxes(title_text="°C",secondary_y=True)
    chart.update_layout(width=800,height=305,margin=dict(l=57,r=50,t=20,b=62),
        paper_bgcolor="#ffffff",plot_bgcolor="#ffffff",font=dict(family="Arial",size=13,color="#183c2d"),
        legend=dict(orientation="h",x=0,y=-.21))
    return embed(chart.to_image(format="png",width=chart.layout.width,height=chart.layout.height,scale=1.5))

def alternatives_figure(output, language="es"):
    records = output["alternatives"]
    chart = make_subplots(rows=1,cols=2,subplot_titles=tuple(translate(s,language) for s in ("Déficit medio · mm","Cobertura estimada · %")))
    for col,metric,color in [(1,"deficit_mm","#3f765e"),(2,"cover_pct","#a6c880")]:
        chart.add_trace(go.Bar(x=[translate(f"Opción {i+1}",language) for i in range(len(records))],
            y=[r["metrics"]["historical"][metric] for r in records],marker_color=color),row=1,col=col)
    if all(r["metrics"]["historical"]["deficit_mm"] is None for r in records):
        chart.add_annotation(text="Datos pendientes",xref="x domain",yref="y domain",x=.5,y=.55,showarrow=False)
    chart.update_layout(width=800,height=250,margin=dict(l=44,r=30,t=43,b=42),showlegend=False,
        paper_bgcolor="#fff",plot_bgcolor="#f7faf5",font=dict(family="Arial",size=13,color="#183c2d"))
    return embed(chart.to_image(format="png",width=chart.layout.width,height=chart.layout.height,scale=1.5))

def clean(value):
    if isinstance(value,str) and (value.lstrip().startswith(("=","+","-","@")) or value.startswith(("\t","\r","\n"))):
        return "'"+value
    return value

def render(item, lease, progress):
    key = f"reports/{item['owner']}/{item['id']}/{lease}"
    folder = STORAGE / key
    folder.mkdir(parents=True,exist_ok=False)
    try:
        output = item["output"]
        if "quality" not in output:
            output = {**output,"quality":evidence_quality(output,item["inputs"],item["field_snapshot"],item["run_created"])}
        language = item.get("language", "es")
        selected = next(r for r in output["alternatives"] if r["id"]==item["rotation_id"])
        with (folder/"metrics.csv").open("w",encoding="utf-8",newline="") as stream:
            out=csv.writer(stream)
            out.writerow(["run_id","scenario_id","rotation_id","metric","value","unit","source_id","model_version"])
            records = [selected] + [r for r in output["alternatives"] if r["id"] != selected["id"]]
            if output["reference"]:
                records.append(output["reference"])
            for rec in records:
                for scenario in ("historical","sensitivity","elnino","lanina"):
                    metrics = rec["metrics"].get(scenario)
                    if metrics is None:
                        continue
                    for metric, (_,unit) in METRICS.items():
                        if metric not in metrics:
                            continue
                        out.writerow([clean(x) for x in [item["run_id"],scenario,rec["id"],metric,
                            metrics[metric],unit,output["dataset_id"],output["version"]]])
                if rec.get("economics"):
                    for metric,unit in [("revenue_bob_ha","BOB/ha"),("cost_bob_ha","BOB/ha"),
                                        ("net_bob_ha","BOB/ha"),("net_usd_ha","USD/ha"),
                                        ("roi_pct","%"),("downside_bob_ha","BOB/ha")]:
                        out.writerow([clean(x) for x in [item["run_id"],"economic_budget",rec["id"],metric,
                            rec["economics"][metric],unit,output["economics"]["market"]["sha256"],output["version"]]])
                    for i,campaign in enumerate(rec["economics"]["campaigns"]):
                        for metric,unit in [("price_bob_t","BOB/t"),("yield_t_ha","t/ha"),("cost_bob_ha","BOB/ha"),
                                            ("break_even_price","BOB/t"),("break_even_yield","t/ha")]:
                            out.writerow([clean(x) for x in [item["run_id"],f"economic_campaign_{i+1}",rec["id"],metric,
                                campaign[metric],unit,output["economics"]["market"]["sha256"],output["version"]]])
        with (folder/"daily.csv").open("w",encoding="utf-8",newline="") as stream:
            out=csv.writer(stream)
            out.writerow(["run_id","scenario_id","rotation_id","source_id","model_version",*TRACE])
            for scenario, series in item["daily"][selected["id"]].items():
                for row in series:
                    out.writerow([clean(x) for x in [item["run_id"],scenario,selected["id"],output["dataset_id"],output["version"],*row]])
        progress(30)
        logo_path = Path(os.getenv("JUPITER_LOGO",ROOT/"web/public/favicon.svg"))
        logo = embed(logo_path.read_bytes(),"image/svg+xml" if logo_path.suffix==".svg" else "image/png")
        env = Environment(loader=FileSystemLoader(Path(__file__).parent/"templates"),
                          autoescape=select_autoescape(["html"]))
        html = env.get_template("report.en.html" if language=="en" else "report.html").render(item=item,output=localize(output,language),selected=localize(selected,language),logo=logo,
            field=localize(item["field_snapshot"],language), chart=climate_figure(output,language),comparison=alternatives_figure(output,language),
            map_data=map_figure(item["field_snapshot"]),metrics={k:(translate(label,language),translate(unit,language)) for k,(label,unit) in METRICS.items()})
        progress(72)
        pdf = folder/"report.pdf"
        with sync_playwright() as pw:
            with pw.chromium.launch(channel=os.getenv("PLAYWRIGHT_CHANNEL"),args=["--no-sandbox"]) as browser:
                page = browser.new_page()
                page.route("**/*",lambda route:route.abort() if not route.request.url.startswith("data:") else route.continue_())
                page.set_content(html,wait_until="load")
                page.evaluate("document.fonts.ready")
                page.pdf(path=pdf, print_background=True,prefer_css_page_size=True,
                         display_header_footer=True,header_template="<span></span>",
                         footer_template='<div style="font:9px Arial;width:100%;padding:0 15mm;color:#52685b;display:flex;justify-content:space-between"><span>SkyField · '+translate("Planificación agrícola",language)+'</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>')
        document = PdfReader(pdf)
        if len(document.pages)<2 or "SkyField" not in (document.pages[0].extract_text() or ""):
            raise JobError("El PDF generado no pasó la verificación de lectura.",True)
        hashes = {k:sha(folder/f) for k,f in {"pdf":"report.pdf","csv":"metrics.csv","daily":"daily.csv"}.items()}
        return key,hashes
    except BaseException:
        shutil.rmtree(folder,ignore_errors=True)
        raise
