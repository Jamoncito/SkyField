"""Dated public prices and auditable enterprise budgets in BOB and USD."""
import hashlib
import json

from .db import ROOT


def market_database():
    data = json.loads((ROOT / "data/reference/markets.json").read_text(encoding="utf-8"))
    data["agriculture"] = json.loads((ROOT / "data/reference/cao-agriculture.json").read_text(encoding="utf-8"))
    fx = data["fx"]["bob_per_usd"]
    for price in data["national"]:
        factor = fx if price["currency"] == "USD" else 1
        price["bob_t"] = round(price["value"]*1000/price["kg_per_unit"]*factor, 2)
        price["usd_t"] = round(price["bob_t"]/fx, 2)
    data["comparisons"] = []
    for reference in data["international"]:
        price = next((p for p in data["national"] if p["crop"]==reference["crop"]), None)
        if price and reference["comparable"]:
            data["comparisons"].append(dict(product=price["product"],national_date=price["date"],
                national_usd_t=price["usd_t"],reference=reference["product"],reference_date=reference["date"],
                reference_usd_t=reference["usd_t"],difference_usd_t=round(price["usd_t"]-reference["usd_t"],2),
                difference_pct=round(100*(price["usd_t"]/reference["usd_t"]-1),2)))
    data["sha256"] = hashlib.sha256(json.dumps(data,sort_keys=True).encode()).hexdigest()
    return data


def crop_budget(code, month, settings, market):
    overrides = settings.get("budgets", {}).get(code, {})
    national = next((p for p in market["national"] if p["crop"] == code), None)
    season = "winter" if month in (4,5,6,7,8) else "summer"
    reference = next((c for c in market["agriculture"]["campaigns"] if c["crop"]==code and c["season"]==season), None)
    year = settings.get("yield_year", 2024)
    yield_value = reference["yield_t_ha"][market["agriculture"]["years"].index(year)] if reference else None
    sale = national["bob_t"] * (1-settings.get("farmgate_discount_pct",0)/100) if national else None
    if code == "cover":
        sale, yield_value = 0., 0.
    price = overrides.get("sale_bob_t")
    price = sale if price is None else price
    productivity = overrides.get("yield_t_ha")
    productivity = yield_value if productivity is None else productivity
    cost = overrides.get("cost_bob_ha")
    income = price*productivity if price is not None and productivity is not None else None
    net = income-cost if income is not None and cost is not None else None
    return dict(crop=code, month=month, price_bob_t=price, yield_t_ha=productivity, cost_bob_ha=cost,
                revenue_bob_ha=round(income,2) if income is not None else None,
                net_bob_ha=round(net,2) if net is not None else None,
                break_even_price=round(cost/productivity,2) if cost is not None and productivity and productivity>0 else None,
                break_even_yield=round(cost/price,3) if cost is not None and price and price>0 else None,
                price_origin="Precio pactado declarado" if overrides.get("sale_bob_t") is not None else
                    (national["market"]+" · "+national["date"] if national else "Precio pendiente"),
                yield_origin="Rendimiento declarado" if overrides.get("yield_t_ha") is not None else
                    (f"CAO {year}, {'invierno' if season=='winter' else 'verano'}, p. {reference['page']}" if reference else "Rendimiento pendiente"),
                cost_origin="Costo total declarado por el productor" if cost is not None else "Costo total pendiente")


def rotation_budget(crops, months, settings, market, area=None):
    rows = [crop_budget(code,month,settings,market) for code,month in zip(crops,months)]
    complete_revenue = all(row["revenue_bob_ha"] is not None for row in rows)
    complete_cost = all(row["cost_bob_ha"] is not None for row in rows)
    revenue = sum(row["revenue_bob_ha"] for row in rows) if complete_revenue else None
    cost = sum(row["cost_bob_ha"] for row in rows) if complete_cost else None
    net = revenue-cost if revenue is not None and cost is not None else None
    fx = settings.get("bob_per_usd") or market["fx"]["bob_per_usd"]
    downside = revenue*.8*.8-cost*1.2 if net is not None else None
    return dict(campaigns=rows, revenue_bob_ha=round(revenue,2) if revenue is not None else None,
                cost_bob_ha=round(cost,2) if cost is not None else None,
                net_bob_ha=round(net,2) if net is not None else None,
                net_usd_ha=round(net/fx,2) if net is not None else None,
                net_field_bob=round(net*area,2) if net is not None and area is not None else None,
                roi_pct=round(100*net/cost,2) if net is not None and cost and cost>0 else None,
                downside_bob_ha=round(downside,2) if downside is not None else None,
                missing=[dict(crop=r["crop"],price=r["price_bob_t"] is None,
                              yield_missing=r["yield_t_ha"] is None,cost=r["cost_bob_ha"] is None) for r in rows
                         if r["revenue_bob_ha"] is None or r["cost_bob_ha"] is None])


def economic_summary(records, settings, market):
    valid = [r for r in records if r["id"]!="reference" and r["economics"]["net_bob_ha"] is not None]
    ranked = sorted(valid,key=lambda r:(-r["economics"]["net_bob_ha"],-r["score"],r["id"]))
    gross = sorted((r for r in records if r["id"]!="reference" and r["economics"]["revenue_bob_ha"] is not None),
                   key=lambda r:(-r["economics"]["revenue_bob_ha"],-r["score"],r["id"]))
    return dict(settings=settings, market=market, ranked_ids=[r["id"] for r in ranked[:3]],
                revenue_ranked_ids=[r["id"] for r in gross[:3]], evaluated=len(valid),
                method="Ingreso = rendimiento × precio. Utilidad estimada = ingreso − costo total declarado. Se suman tres campañas anuales por hectárea, a precios constantes y sin descuento. ROI = utilidad/costo. El escenario adverso combina −20 % de rendimiento, −20 % de precio y +20 % de costos.",
                uncertainty="Los precios tienen fecha y mercado. El costo total debe incluir labores, insumos, cosecha, transporte, arriendo, financiamiento e impuestos. Los rendimientos CAO representan campañas regionales observadas. La utilidad depende de estos supuestos. Una respuesta de rendimiento al clima requiere calibración por cultivo y etapa.")


def perennial_cashflow(body):
    flows = [-body.establishment_bob_ha]
    for year in range(1,body.horizon_years+1):
        revenue = body.yield_t_ha*body.sale_bob_t if year>=body.first_harvest_year else 0
        flows.append(round(revenue-body.annual_cost_bob_ha,2))
    discounted = [flow/(1+body.discount_pct/100)**year for year,flow in enumerate(flows)]
    cumulative = 0
    rows = []
    for year,flow in enumerate(flows):
        cumulative += flow
        rows.append(dict(year=year,flow_bob_ha=flow,cumulative_bob_ha=round(cumulative,2)))
    payback = next((row["year"] for row in rows[1:] if row["cumulative_bob_ha"]>=0),None)
    return dict(crop=body.crop,rows=rows,npv_bob_ha=round(sum(discounted),2),payback_year=payback,
                inputs=body.model_dump(),method="Año 0 de establecimiento, costo anual constante e ingreso desde el primer año de cosecha declarado. Se supone rendimiento constante al iniciar producción. VAN descuenta los flujos a la tasa indicada. Ajusta edad, especie, poscosecha y comprador con un técnico local.")
