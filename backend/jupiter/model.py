import calendar
from datetime import date, timedelta
from itertools import permutations

import numpy as np

from .climate import COLS
from .jobs import JobError

VERSION = "water-balance-1.0.0"
CATALOG_VERSION = "fao56-illustrative-1"
FAO = "https://www.fao.org/4/x0490e/x0490e00.htm"
# FAO 56 tables 12 and 22 supply general parameter ranges. The exact stages,
# planting windows, cover candidate and limits below are calibration fixtures.
CROPS = {
    "soy": dict(name="Soya", family="Fabaceae", days=[20,30,55,25], kc=[.4,1.15,.5],
                root=.8, p=.5, window=[10,11,12,1], ph=[5.5,7.8], ec=5, cover=.86),
    "maize": dict(name="Maíz", family="Poaceae", days=[25,35,50,30], kc=[.3,1.2,.35],
                  root=1.1, p=.55, window=[9,10,11,12,1], ph=[5.5,7.8], ec=1.7, cover=.83),
    "sorghum": dict(name="Sorgo", family="Poaceae", days=[20,30,45,25], kc=[.3,1.05,.55],
                    root=1.2, p=.55, window=[10,11,12,1,2], ph=[5.5,8.3], ec=6.8, cover=.79),
    "cover": dict(name="Cobertura (mucuna)", family="Fabaceae", days=[20,30,30,15], kc=[.3,.95,.55],
                  root=.5, p=.5, window=[10,11,12,1,2], ph=[5,7.8], ec=None, cover=.93),
}
WEIGHTS = {"balanced":[.50,.30,.20],"water":[.78,.12,.10],"cover":[.23,.67,.10],"diversity":[.25,.15,.60]}

def et0(rows, latitude, elevation, warming=0):
    valid = np.array([all(row[c] is not None for c in COLS[:6]) for row in rows])
    t, low, high, rh, wind, solar = np.array(
        [[row[c] if row[c] is not None else np.nan for c in COLS[:6]] for row in rows],dtype=float).T
    t, low, high = t+warming, low+warming, high+warming
    j = np.array([row["date"].timetuple().tm_yday for row in rows])
    lat = np.radians(latitude)
    angle = 2*np.pi*j/365
    dr, decl = 1+.033*np.cos(angle), .409*np.sin(angle-1.39)
    omega = np.arccos(np.clip(-np.tan(lat)*np.tan(decl),-1,1))
    ra = (24*60/np.pi)*.0820*dr*(omega*np.sin(lat)*np.sin(decl)+np.cos(lat)*np.cos(decl)*np.sin(omega))
    rso = (.75+.00002*elevation)*ra

    def es(temp):
        return .6108 * np.exp(17.27*temp/(temp+237.3))

    sat = (es(low)+es(high))/2
    actual = sat * rh / 100
    relative_solar = np.divide(solar, rso, out=np.full_like(solar, .3), where=rso>.01)
    rnl = (4.903e-9 * ((high+273.16)**4+(low+273.16)**4)/2
           * (.34-.14*np.sqrt(actual)) * (1.35*np.clip(relative_solar,.3,1)-.35))
    net = .77*solar-rnl
    slope = 4098*es(t)/(t+237.3)**2
    gamma = .000665*(101.3*((293-.0065*elevation)/293)**5.26)
    calculated = (.408*slope*net+gamma*900/(t+273)*wind*(sat-actual))/(slope+gamma*(1+.34*wind))
    return np.where(valid, np.maximum(calculated,0), np.nan)

def water_day(storage, depth, fc, wp, p, rain, irrigation_limit, demand, runoff_fraction=.10):
    taw = (fc-wp)*depth*1000
    raw = p*taw
    runoff = runoff_fraction*rain
    infiltrated = rain-runoff
    irrigation = min(irrigation_limit, max(0, taw-raw-storage-infiltrated))
    available = storage+infiltrated+irrigation
    drainage = max(0, available-taw)
    usable = min(taw, available)
    stress = min(1, usable/max(taw-raw, .000001))
    actual = min(usable, demand*stress)
    return usable-actual, actual, irrigation, drainage, runoff, taw, raw

def monthly(rows):
    groups = {}
    for row in rows:
        key = (row["date"].year,row["date"].month)
        groups.setdefault(key,[]).append(row)
    table = []
    for month in range(1,13):
        rains, temps = [], []
        for (year, key), data in groups.items():
            if key != month or len(data) != calendar.monthrange(year,key)[1]:
                continue
            r = [x["precip_mm_day"] for x in data]
            t = [x["tmean_c"] for x in data]
            if None not in r:
                rains.append(sum(r))
            if None not in t:
                temps.append(float(np.mean(t)))
        table.append(dict(month=month,rain=round(float(np.mean(rains)),2) if rains else None,
                          temp=round(float(np.mean(temps)),2) if temps else None,
                          rain_years=len(rains), temp_years=len(temps)))
    return table

def sequences(inputs):
    viable = {}
    excluded = {}
    for code, crop in CROPS.items():
        reasons = []
        if inputs["plant_month"] not in crop["window"]:
            reasons.append("Mes de siembra fuera de la ventana ilustrativa.")
        if inputs["soil_ph"] is not None and not crop["ph"][0] <= inputs["soil_ph"] <= crop["ph"][1]:
            reasons.append("pH declarado fuera del intervalo ilustrativo.")
        if inputs["soil_ec"] is not None and crop["ec"] is not None and inputs["soil_ec"] > crop["ec"]:
            reasons.append("CE declarada supera el umbral ilustrativo.")
        if reasons:
            excluded[crop["name"]] = reasons
        else:
            viable[code] = crop
    # Three distinct crops, with a demonstration restriction against consecutive
    # soybeans on the transition from the previous crop.
    patterns = [p for p in permutations(viable, 3) if (p[0], inputs["previous"]) != ("soy","soy")]
    base = [inputs["previous"]]*3 if inputs["previous"] in CROPS else None
    return patterns, excluded, base

def growth(crop, day):
    initial, development, middle, late = crop["days"]
    lo, peak, end = crop["kc"]
    if day < initial:
        return lo, .15, .15
    if day < initial+development:
        f = (day-initial)/development
        return lo+(peak-lo)*f, .15+(crop["root"]-.15)*f, .15+(crop["cover"]-.15)*f
    if day < initial+development+middle:
        return peak, crop["root"], crop["cover"]
    f = min(1,(day-initial-development-middle)/late)
    return peak+(end-peak)*f, crop["root"], crop["cover"]*(1-.45*f)

def project(rows, planting_year, seq, inputs, profile, scenario, trace=False):
    planting = [date(planting_year+i, inputs["plant_month"], 1) for i in range(3)]
    full_depth = profile["depth_m"]
    fc, wp = profile["theta_fc"], profile["theta_wp"]
    monthly_coverage, total_deficit, stressed, irrigation_sum = [], 0., 0, 0.
    last_depth, root_water, outside_water = full_depth,.5*(fc-wp)*full_depth*1000,0.
    season = 0
    daily = []
    for row, demand0, rain0 in rows:
        day = row["date"]
        if season < 2 and day >= planting[season+1]:
            season += 1
        crop = CROPS[seq[season]]
        age = (day-planting[season]).days
        growing = 0 <= age < sum(crop["days"])
        kc, root, canopy = growth(crop, age) if growing else (.20, .20, .0)
        depth = min(root,full_depth)
        if depth > last_depth and full_depth > last_depth:
            transferred = outside_water * (depth-last_depth)/(full_depth-last_depth)
            root_water += transferred
            outside_water -= transferred
        if depth < last_depth:
            transferred = root_water * (last_depth-depth)/last_depth
            root_water -= transferred
            outside_water += transferred
        top, actual, irrigation, drain, runoff, taw, raw = water_day(
            root_water,depth,fc,wp,crop["p"],rain0,
            (inputs["irrigation_mm"] or 0) if growing and inputs["irrigation"]=="confirmed" else 0, demand0*kc)
        deep_capacity = (fc-wp)*(full_depth-depth)*1000
        retained = min(max(0,deep_capacity-outside_water),drain)
        outside_water += retained
        root_water,last_depth = top,depth
        deficit = max(0,demand0*kc-actual) if growing else 0
        monthly_coverage.append(canopy)
        total_deficit += deficit
        stressed += deficit > .1
        irrigation_sum += irrigation
        if trace:
            daily.append([day.isoformat(),seq[season] if growing else "fallow",round(rain0,3),round(demand0,3),
                          round(demand0*kc,3),round(actual,3),round(deficit,3),round(taw-top,3),
                          round(irrigation,3),round(drain-retained,3),round(runoff,3),round(raw,3)])
    return dict(scenario=scenario,year=planting_year, deficit_mm=round(total_deficit,2),
                stress_days=stressed, cover_pct=round(100*float(np.mean(monthly_coverage)),2),
                irrigation_mm=round(irrigation_sum,2)), daily

def windows(rows, inputs, elevation, latitude):
    mapping = {r["date"]: n for n,r in enumerate(rows)}
    span = range(rows[0]["date"].year, rows[-1]["date"].year-1)
    for scenario, rain_shift, warming in [
        ("historical",0,0), ("sensitivity", inputs["rainfall_shift_pct"], inputs["warming_c"])
    ]:
        demands = et0(rows, latitude, elevation, warming)
        for year in span:
            first = date(year,inputs["plant_month"],1)
            end = date(year+3,inputs["plant_month"],1)
            selected = [mapping.get(first+timedelta(days=i)) for i in range((end-first).days)]
            if any(i is None or not np.isfinite(demands[i]) or rows[i]["precip_mm_day"] is None for i in selected):
                continue
            yield scenario, year, [(rows[i],float(demands[i]), rows[i]["precip_mm_day"]*(1+rain_shift/100))
                                   for i in selected]

def run_model(rows, source, site, inputs):
    patterns, excluded, baseline = sequences(inputs)
    profile = {k: inputs[k] for k in ["theta_fc","theta_wp","depth_m"]}
    missing = [label for key,label in [("theta_fc","capacidad de campo"),("theta_wp","punto de marchitez"),
                                       ("depth_m","profundidad útil"),("soil_ph","pH"),("soil_ec","conductividad eléctrica")]
               if inputs[key] is None]
    if inputs["previous"] == "unknown":
        missing.append("cultivo anterior")
    if inputs["irrigation"] == "unknown":
        missing.append("disponibilidad de riego")
    if inputs["trial"]:
        defaults = {"theta_fc":.29,"theta_wp":.14,"depth_m":.85}
        profile = {k: defaults[k] if v is None else v for k,v in profile.items()}
    elevation = inputs["elevation_m"] if inputs["elevation_m"] is not None else source.get("elevation_m")
    if elevation is None:
        missing.append("elevación")
        if inputs["trial"]:
            elevation = 250.
    if elevation is None or None in profile.values() or (inputs["irrigation"] == "unknown" and not inputs["trial"]):
        candidates = []
    else:
        if profile["theta_wp"] >= profile["theta_fc"]:
            raise JobError("La retención de prueba combinada con tus valores es incompatible. Completa la capacidad y la marchitez.")
        candidates = list(windows(rows,inputs,elevation,site["lat"]))
    if not candidates:
        missing.append("ventanas aptas para balance hídrico")
    weights = WEIGHTS[inputs["priority"]]
    records, daily = [], {}
    choices = [(f"rotation-{'-'.join(seq)}", seq) for seq in patterns]
    if baseline:
        choices.append(("reference",baseline))
    for rotation_id, seq in choices:
        families = [CROPS[x]["family"] for x in seq]
        diversity = sum(a!=b for a,b in zip(families,families[1:]))/2
        metrics, samples = {}, {}
        for scenario in ("historical","sensitivity"):
            simulations = [project(data,year,seq,inputs,profile,scenario,trace=not samples.get(scenario))
                           for case,year,data in candidates if case==scenario]
            samples[scenario] = simulations[0][1] if simulations else []
            values = [item[0] for item in simulations]
            metrics[scenario] = {k:round(float(np.mean([v[k] for v in values])),2) if values else None
                                 for k in ("deficit_mm","stress_days","cover_pct","irrigation_mm")}
            metrics[scenario]["windows"] = [v["year"] for v in values]
            metrics[scenario]["window_results"] = values
            metrics[scenario]["deficit_range"] = [min(v["deficit_mm"] for v in values),
                max(v["deficit_mm"] for v in values)] if values else None
        historic = metrics["historical"]
        if historic["cover_pct"] is None:
            schematic = [growth(CROPS[c], day)[2] for c in seq for day in range(sum(CROPS[c]["days"]))]
            historic["cover_pct"] = round(100*sum(schematic)/(365*3),2)
        # Fixed anchors allow preferences to change the ordering without changing
        # the score of an option when a competing option is removed.
        terms = [None if historic["deficit_mm"] is None else max(0,1-historic["deficit_mm"]/1200),
                 min(1,historic["cover_pct"]/40), diversity]
        active = sum(w for w,x in zip(weights,terms) if x is not None)
        score = round(100*sum(w*x for w,x in zip(weights,terms) if x is not None)/active,1)
        records.append(dict(id=rotation_id, crops=list(seq), names=[CROPS[c]["name"] for c in seq],
                            families=families, diversity=diversity, score=score, metrics=metrics,
                            criteria=dict(zip(["water","cover","diversity"],terms)),
                            calendar=[dict(crop=CROPS[c]["name"], month=inputs["plant_month"],
                                           duration=sum(CROPS[c]["days"])) for c in seq]))
        daily[rotation_id] = samples
    reference = next((r for r in records if r["id"]=="reference"),None)
    ranked = sorted((r for r in records if r["id"]!="reference"),key=lambda r:(-r["score"],r["id"]))[:3]
    for case in ("historical", "sensitivity"):
        for record in ranked:
            metrics = record["metrics"][case]
            wins = 0
            for outcome in metrics["window_results"]:
                best = min(sample["deficit_mm"] for candidate in ranked
                           for sample in candidate["metrics"][case]["window_results"]
                           if sample["year"] == outcome["year"])
                wins += outcome["deficit_mm"] == best
            metrics["lowest_deficit_windows"] = wins
    values = dict(version=VERSION,catalog_version=CATALOG_VERSION,catalog_source=FAO,
                  alternatives=ranked,reference=reference,excluded=excluded,monthly=monthly(rows),
                  candidate_count=len(patterns),missing=missing,source=source,weights=weights,trial=inputs["trial"],
                  status="Exploratorio",profile=profile,elevation_m=elevation,
                  catalog_parameters=CROPS,
                  limitations=["Calendario, tolerancias, cobertura y cultivares de demostración. Validar con agronomía local.",
                    "Balance con humedad inicial al 50 %, escorrentía ilustrativa de 10 % y suelo uniforme.",
                    "La humedad relativa media aproxima la presión real de vapor. El clima es regional.",
                    "El escenario de sensibilidad aplica factores uniformes a la secuencia diaria histórica.",
                    "Los pesos sin dato hídrico se renormalizan sobre cobertura y diversidad.",
                    "La referencia, si existe, repite el cultivo anterior como supuesto explícito."],
                  actions=[{"item":"Muestreo de suelo por profundidad","reason":"Confirmar retención, pH, CE, textura y profundidad útil."},
                    {"item":"Revisar calendario y disponibilidad hídrica","reason":"Confirmar con el productor y un agrónomo las ventanas, cultivares, historial sanitario y caudal."}])
    kept = {r["id"] for r in ranked + ([reference] if reference else [])}
    return values, {k:v for k,v in daily.items() if k in kept}
