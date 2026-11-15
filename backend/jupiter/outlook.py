"""Forecast horizons and local ENSO associations with explicit spatial support."""
import calendar
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone

import numpy as np

from .db import PILOT, ROOT
from .external import public_json

POWER_MONTHLY = "https://power.larc.nasa.gov/api/temporal/monthly/point"
RONI_SOURCE = "https://www.cpc.ncep.noaa.gov/data/indices/RONI.ascii.txt"
SEASONS = "DJF JFM FMA MAM AMJ MJJ JJA JAS ASO SON OND NDJ".split()


def fit_association(years, index, values, target):
    """OLS association with HAC uncertainty and chronological hindcast checks."""
    year = np.asarray(years, dtype=float)
    x = np.column_stack([np.ones(len(year)), year - year.mean(), index])
    y = np.asarray(values, dtype=float)
    if not np.isfinite(x).all() or not np.isfinite(y).all():
        return None
    beta, _, rank, _ = np.linalg.lstsq(x, y, rcond=None)
    if rank < 3 or len(year) < 20:
        return None
    residual = y - x @ beta
    # Newey-West accounts for short residual dependence across years within a
    # calendar month. This remains an approximate coefficient interval.
    scores = x * residual[:, None]
    meat = scores.T @ scores
    lag_count = min(3, len(year)-1)
    for lag in range(1, lag_count+1):
        cross = scores[lag:].T @ scores[:-lag]
        meat += (1-lag/(lag_count+1)) * (cross+cross.T)
    inverse = np.linalg.pinv(x.T @ x)
    covariance = inverse @ meat @ inverse * len(year)/(len(year)-3)
    delta = float(beta[2] * target)
    error = float(1.96 * abs(target) * np.sqrt(max(0, covariance[2, 2])))
    errors, reference_errors = [], []
    for cutoff in range(20, len(year)):
        train, observed = x[:cutoff], y[:cutoff]
        fitted, _, train_rank, _ = np.linalg.lstsq(train,observed,rcond=None)
        if train_rank < 3:
            continue
        trend_only = np.linalg.lstsq(train[:,:2],observed,rcond=None)[0]
        errors.append(float(y[cutoff]-x[cutoff]@fitted))
        reference_errors.append(float(y[cutoff]-x[cutoff,:2]@trend_only))
    mse = float(np.mean(np.square(errors))) if errors else None
    baseline_mse = float(np.mean(np.square(reference_errors))) if errors else None
    hindcast = dict(n=len(errors),mae=float(np.mean(np.abs(errors))) if errors else None,
                    rmse=float(np.sqrt(mse)) if mse is not None else None,
                    reference_rmse=float(np.sqrt(baseline_mse)) if baseline_mse is not None else None,
                    skill_pct=100*(1-mse/baseline_mse) if baseline_mse and baseline_mse>1e-12 else None)
    return dict(baseline=float(beta[0]), delta=delta, low=delta-error, high=delta+error,
                trend_decade=float(beta[1]*10), n=len(year),
                extrapolated=target < min(index) or target > max(index),hindcast=hindcast,
                interval_method="Newey-West HAC, rezago máximo de 3 años")


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
            entry["validation"] = dict(rain=r["hindcast"],temperature=t["hindcast"])
            months.append(entry)
        return dict(status="available", start=1981, end=2025, months=months, factors=factors,
            point=[lon,lat], source="NASA POWER mensual + NOAA CPC RONI", source_url=POWER_MONTHLY,
            index_url=RONI_SOURCE, sha256=hashlib.sha256(json.dumps(raw,sort_keys=True).encode()).hexdigest(),
            method="Regresión por mes de lluvia o temperatura sobre RONI y año centrado. Contraste RONI +2 o −2 °C frente a RONI 0. Los factores mensuales perturban el clima diario histórico del lote durante las tres campañas como prueba de estrés sostenida. La duración real de un episodio necesita un pronóstico específico.",
            uncertainty="Asociación exploratoria regional. Intervalo aproximado del 95 % con covarianza Newey-West HAC y hasta 3 rezagos anuales. Se verifica retrospectivamente cada año posterior a 20 años de entrenamiento, frente a una tendencia sin ENSO y usando RONI observado. La habilidad negativa indica mayor error que la referencia. Las teleconexiones, el tamaño muestral y el microclima añaden incertidumbre. Se marca extrapolación. Lluvia limitada a 0–300 % de la base.",
            climate_change="La tendencia 1981–2025 describe el calentamiento local de la serie. La atribución al cambio climático exige estudios adicionales. El control personalizado permite ensayar calentamiento y cambios de lluvia por separado.")
    except Exception:
        # A remote source outage must not invalidate the established water balance.
        return dict(status="unavailable", reason="La serie ENSO mensual no está disponible. Puedes usar la sensibilidad personalizada.")


def quantiles(values):
    clean = [float(v) for v in values if v is not None and np.isfinite(v)]
    return [round(float(np.percentile(clean,q)),2) for q in (10,50,90)] if clean else None


def ensemble_period(daily, positions):
    rain, temperatures = [], []
    if not positions:
        return dict(rain_mm=None,temp_c=None,members=0,rain_members=0,temp_members=0,days=0)
    for member in [""]+[f"_member{i:02}" for i in range(1,51)]:
        r = daily.get("precipitation_sum"+member, [])
        t = daily.get("temperature_2m_mean"+member, [])
        if all(i < len(r) and r[i] is not None and np.isfinite(r[i]) and r[i]>=0 for i in positions):
            rain.append(sum(r[i] for i in positions))
        if all(i < len(t) and t[i] is not None and np.isfinite(t[i]) and -90<=t[i]<=65 for i in positions):
            temperatures.append(float(np.mean([t[i] for i in positions])))
    return dict(rain_mm=quantiles(rain), temp_c=quantiles(temperatures), members=min(len(rain),len(temperatures)),
                rain_members=len(rain),temp_members=len(temperatures),days=len(positions))


def validated_forecast(raw):
    """Keep missing values explicit and reject malformed daily provider values."""
    values = raw.get("daily", {})
    units = raw.get("daily_units", {})
    limits = {"temperature_2m_max":(-90,65,"°C"),"temperature_2m_min":(-90,65,"°C"),
              "temperature_2m_mean":(-90,65,"°C"),"precipitation_sum":(0,2500,"mm"),
              "precipitation_probability_max":(0,100,"%"),"et0_fao_evapotranspiration":(0,50,"mm"),
              "wind_speed_10m_max":(0,500,"km/h")}
    rows, rejected, seen = [], 0, set()
    for i,stamp in enumerate(values.get("time", [])):
        try:
            date.fromisoformat(stamp)
        except (ValueError,TypeError):
            rejected += 1
            continue
        if stamp in seen:
            rejected += 1
            continue
        seen.add(stamp)
        row = {"date":stamp}
        for key,(low,high,unit) in limits.items():
            array = values.get(key, [])
            value = array[i] if i<len(array) else None
            valid = (isinstance(value,(int,float)) and not isinstance(value,bool) and
                     np.isfinite(value) and low<=value<=high and units.get(key,unit)==unit)
            row[key] = value if valid else None
            rejected += value is not None and not valid
        if (row["temperature_2m_min"] is not None and row["temperature_2m_max"] is not None
                and row["temperature_2m_min"]>row["temperature_2m_max"]):
            row["temperature_2m_min"] = row["temperature_2m_max"] = None
            rejected += 2
        rows.append(row)
    return sorted(rows,key=lambda r:r["date"]),rejected


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
    daily,rejected = validated_forecast(short) if short else ([],0)
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
                rejected_values=rejected,model_point=[short.get("longitude"),short.get("latitude")] if short else None,
                hourly=short.get("hourly") if short else None,
                source_url="https://open-meteo.com/en/docs", seasonal_url="https://open-meteo.com/en/docs/seasonal-forecast-api",
                short_status="available" if daily else "unavailable", seasonal_status="available" if monthly else "unavailable",
                method="7 días de pronóstico Open-Meteo. Perspectiva EC46/SEAS5 de 51 miembros a unos 36 km. P10–P90 expresa dispersión del conjunto. Se agrega cada trayectoria antes de calcular percentiles. Los meses parciales muestran sus días de cobertura.",
                interpretation="La perspectiva estacional orienta condiciones regionales y conserva sesgos del modelo. Para un año se usa la climatología histórica y escenarios de estrés. Revisa el boletín SENAMHI y mediciones locales antes de una operación.")
