"""Auditable evidence completeness, kept separate from predictive skill."""
from datetime import date
from math import isfinite


def evidence_quality(output, inputs, site, assessed_on):
    source = output.get("source") or {}
    rows = source.get("rows") or 0
    missing = source.get("missing_days") or 0
    incomplete = source.get("incomplete_days") or 0
    coverage = max(0, rows-incomplete) / max(1, rows+missing)
    measured = all(inputs.get(k) is not None for k in ("theta_fc", "theta_wp", "depth_m"))
    regional = bool(output.get("regional_retention"))
    soil_score = 25 if measured else 15 if regional else 5 if output.get("trial") else 0
    budgets = [r.get("economics", {}) for r in output.get("alternatives", [])]
    complete = max((sum(all(c.get(k) is not None for k in
                    ("price_bob_t", "yield_t_ha", "cost_bob_ha")) for c in b.get("campaigns", []))
                    for b in budgets), default=0)
    context = output.get("enso") or {}
    samples = min((m.get("n", 0) for m in context.get("months", [])), default=0)
    weather = output.get("weather") or {}
    valid_days = sum(all(d.get(k) is not None and isfinite(d[k]) for k in
                     ("temperature_2m_min", "temperature_2m_max", "precipitation_sum"))
                     for d in weather.get("days", []))
    components = [
        dict(key="climate", label="Integridad del histórico climático", points=round(30*coverage), maximum=30,
             detail=f"{rows} registros, {missing} días ausentes y {incomplete} incompletos."),
        dict(key="soil", label="Retención y profundidad del suelo", points=soil_score, maximum=25,
             detail="Retención y profundidad declaradas por el usuario." if measured else
                    "Retención regional estimada con profundidad declarada." if regional else
                    "Parámetros de ensayo para entradas pendientes." if output.get("trial") else
                    "Faltan propiedades necesarias para el balance."),
        dict(key="budget", label="Presupuesto de la alternativa más completa", points=round(20*min(complete,3)/3), maximum=20,
             detail=f"{complete} de 3 campañas con precio, rendimiento y costo."),
        dict(key="enso", label="Serie para asociación ENSO", points=15 if samples>=30 else 8 if samples>=20 else 0, maximum=15,
             detail=f"Mínimo de {samples} años por mes en el ajuste."),
        dict(key="weather", label="Integridad del pronóstico consultado", points=round(10*min(valid_days,7)/7), maximum=10,
             detail=f"{valid_days} de 7 días con temperatura y lluvia disponibles."),
    ]
    warnings = []
    if not measured:
        warnings.append("La retención del suelo requiere contraste con mediciones locales.")
    if any(m.get(case, {}).get("extrapolated") for m in context.get("months", []) for case in ("elnino", "lanina")):
        warnings.append("Parte del contraste ENSO extrapola el rango observado del índice.")
    market = output.get("economics", {}).get("market", {})
    used = {c.get("crop") for b in budgets for c in b.get("campaigns", [])}
    old = []
    for price in market.get("national", []):
        if price.get("crop") not in used:
            continue
        stamp = price.get("date", "")
        try:
            age = (date.fromisoformat(str(assessed_on)[:10])-date.fromisoformat(stamp[:10])).days
        except ValueError:
            age = 366
        if age > 90:
            old.append(price["product"])
    if old:
        warnings.append("Hay precios de referencia con más de 90 días. Actualiza las ofertas del comprador.")
    if complete < 3:
        warnings.append("La utilidad necesita completar costos, precios y rendimientos de las tres campañas.")
    warnings.append("El clima representa una grilla regional y el cálculo utiliza un punto representativo del lote.")
    score = sum(c["points"] for c in components)
    return dict(version="evidence-readiness-1", score=score, maximum=100, components=components,
                assessed_on=str(assessed_on)[:10], warnings=warnings,
                level="Con datos de suelo declarados" if measured and coverage>=.95 else "Evidencia regional" if coverage>=.95 else "Evidencia incompleta",
                validation="Pendiente de calibración predictiva con observaciones de campo",
                interpretation="El índice resume integridad y disponibilidad de entradas con pesos de diseño explícitos. La precisión predictiva requiere contrastar pronósticos y resultados con mediciones independientes.",
                point=[site["lon"], site["lat"]])
