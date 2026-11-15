"""Forecast horizons and local ENSO associations with explicit spatial support."""
import calendar
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import numpy as np

from .db import PILOT, ROOT
from .external import public_json

POWER_MONTHLY = "https://power.larc.nasa.gov/api/temporal/monthly/point"
RONI_SOURCE = "https://www.cpc.ncep.noaa.gov/data/indices/RONI.ascii.txt"
SEASONS = "DJF JFM FMA MAM AMJ MJJ JJA JAS ASO SON OND NDJ".split()


def fit_association(years, index, values, target):
    """OLS controls for linear time trend, with a slope confidence interval."""
    year = np.asarray(years, dtype=float)
    x = np.column_stack([np.ones(len(year)), year - year.mean(), index])
    y = np.asarray(values, dtype=float)
    beta, _, rank, _ = np.linalg.lstsq(x, y, rcond=None)
    if rank < 3 or len(year) < 20:
        return None
    residual = y - x @ beta
    covariance = np.linalg.pinv(x.T @ x) * float(residual @ residual) / (len(year) - 3)
    delta = float(beta[2] * target)
    error = float(1.96 * abs(target) * np.sqrt(max(0, covariance[2, 2])))
    return dict(baseline=float(beta[0]), delta=delta, low=delta-error, high=delta+error,
                trend_decade=float(beta[1]*10), n=len(year),
                extrapolated=target < min(index) or target > max(index))


def climate_context(lon, lat):
    try:
        if abs(lon-PILOT[0]) < .0001 and abs(lat-PILOT[1]) < .0001:
            raw = json.loads((ROOT / "data/reference/NASA_POWER_monthly_1981_2025.json").read_text())
        else:
            raw = public_json(POWER_MONTHLY, dict(parameters="PRECTOTCORR,T2M", community="AG",
                              longitude=lon, latitude=lat, start=1981, end=2025, format="JSON"), ttl=2592000)
        indices = {}
        for line in (ROOT / "data/reference/NOAA_RONI.txt").read_text().splitlines()[1:]:
            season, year, anomaly = line.split()
            indices[int(year), SEASONS.index(season)+1] = float(anomaly)
        parameters = raw["properties"]["parameter"]
        months, factors = [], {"elnino":[], "lanina":[]}
        for month in range(1, 13):
            samples = []
            for year in range(1981, 2026):
                key = f"{year}{month:02}"
                rain = parameters["PRECTOTCORR"].get(key, -999)
                temp = parameters["T2M"].get(key, -999)
                if rain >= 0 and temp > -100 and (year, month) in indices:
                    samples.append((year, indices[year, month], rain*calendar.monthrange(year, month)[1], temp))
            years, enso, rain, temp = zip(*samples)
            entry = dict(month=month, rain_mm=round(float(np.mean(rain)), 2),
                         temp_c=round(float(np.mean(temp)), 2),
                         rain_range=[round(float(np.percentile(rain, q)), 2) for q in (10,90)], n=len(samples))
            for name, target in (("elnino", 2.), ("lanina", -2.)):
                r, t = fit_association(years, enso, rain, target), fit_association(years, enso, temp, target)
                if r is None or t is None or r["baseline"] <= 0:
                    raise ValueError("Serie insuficiente para ajustar ENSO")
                factor = float(np.clip(1+r["delta"]/r["baseline"], 0, 3))
                entry[name] = dict(rain_pct=round(100*(factor-1),2), temp_c=round(t["delta"],2),
                    rain_ci=[round(100*r[k]/r["baseline"],2) for k in ("low","high")],
                    extrapolated=r["extrapolated"], n=r["n"],
                    clipped=not np.isclose(factor, 1+r["delta"]/r["baseline"]))
                factors[name].append(dict(rain_factor=factor, warming_c=float(np.clip(t["delta"],-4,6))))
            entry["warming_decade_c"] = round(t["trend_decade"], 3)
            months.append(entry)
        return dict(status="available", start=1981, end=2025, months=months, factors=factors,
            point=[lon,lat], source="NASA POWER mensual + NOAA CPC RONI", source_url=POWER_MONTHLY,
            index_url=RONI_SOURCE, sha256=hashlib.sha256(json.dumps(raw,sort_keys=True).encode()).hexdigest(),
            method="Regresión por mes de lluvia o temperatura sobre RONI y año centrado. Contraste RONI +2 o −2 °C frente a RONI 0. Los factores mensuales perturban el clima diario histórico del lote durante las tres campañas como prueba de estrés sostenida. La duración real de un episodio necesita un pronóstico específico.",
            uncertainty="Asociación exploratoria regional. IC 95 % de la pendiente OLS bajo residuos independientes. La autocorrelación, teleconexiones y microclima añaden incertidumbre. Se marca extrapolación fuera del RONI observado. Lluvia limitada a 0–300 % de la base para estabilidad.",
            climate_change="La tendencia 1981–2025 describe el calentamiento local de la serie. La atribución al cambio climático exige estudios adicionales. El control personalizado permite ensayar calentamiento y cambios de lluvia por separado.")
    except Exception:
        # A remote source outage must not invalidate the established water balance.
        return dict(status="unavailable", reason="La serie ENSO mensual no está disponible. Puedes usar la sensibilidad personalizada.")


def quantiles(values):
    clean = [float(v) for v in values if v is not None and np.isfinite(v)]
    return [round(float(np.percentile(clean,q)),2) for q in (10,50,90)] if clean else None


def ensemble_period(daily, positions):
    rain, temperatures = [], []
    for member in [""]+[f"_member{i:02}" for i in range(1,51)]:
        r = daily.get("precipitation_sum"+member, [])
        t = daily.get("temperature_2m_mean"+member, [])
        if all(i < len(r) and r[i] is not None for i in positions):
            rain.append(sum(r[i] for i in positions))
        if all(i < len(t) and t[i] is not None for i in positions):
            temperatures.append(float(np.mean([t[i] for i in positions])))
    return dict(rain_mm=quantiles(rain), temp_c=quantiles(temperatures), members=len(rain), days=len(positions))


def weather_outlook(lon, lat):
    stamp = datetime.now(timezone.utc).isoformat()
    base = dict(latitude=lat, longitude=lon, timezone="America/La_Paz")
    urls = [
        ("short", "https://api.open-meteo.com/v1/forecast", {**base, "forecast_days":7,
         "daily":"temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,precipitation_probability_max,et0_fao_evapotranspiration,wind_speed_10m_max",
         "hourly":"relative_humidity_2m,dew_point_2m", "forecast_hours":24}),
        ("seasonal", "https://seasonal-api.open-meteo.com/v1/seasonal", {**base, "forecast_days":183,
         "daily":"temperature_2m_mean,precipitation_sum"})]
    def fetch(item):
        key,url,params = item
        try:
            raw = public_json(url,params,ttl=3600 if key=="short" else 21600)
            return key, raw
        except Exception:
            return key, None
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = dict(pool.map(fetch, urls))
    short = responses["short"]
    daily = []
    if short:
        values = short["daily"]
        for i,day in enumerate(values["time"]):
            daily.append({"date":day, **{name:values[name][i] for name in values if name!="time"}})
    seasonal = responses["seasonal"]
    monthly, near_month = [], None
    if seasonal and seasonal.get("daily",{}).get("time"):
        values = seasonal["daily"]
        times = values["time"]
        groups = {}
        for i,day in enumerate(times):
            groups.setdefault(day[:7], []).append(i)
        monthly = [dict(month=month, **ensemble_period(values,positions)) for month,positions in groups.items()]
        near_month = dict(start=times[0], end=times[min(29,len(times)-1)],
                          **ensemble_period(values,list(range(min(30,len(times))))))
    return dict(retrieved=stamp, point=[lon,lat], days=daily, month=near_month, seasonal=monthly,
                hourly=short.get("hourly") if short else None,
                source_url="https://open-meteo.com/en/docs", seasonal_url="https://open-meteo.com/en/docs/seasonal-forecast-api",
                short_status="available" if daily else "unavailable", seasonal_status="available" if monthly else "unavailable",
                method="7 días de pronóstico Open-Meteo. Perspectiva EC46/SEAS5 de 51 miembros a unos 36 km. P10–P90 expresa dispersión del conjunto. Se agrega cada trayectoria antes de calcular percentiles. Los meses parciales muestran sus días de cobertura.",
                interpretation="La perspectiva estacional orienta condiciones regionales y conserva sesgos del modelo. Para un año se usa la climatología histórica y escenarios de estrés. Revisa el boletín SENAMHI y mediciones locales antes de una operación.")
