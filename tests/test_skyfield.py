import math
from datetime import date, timedelta

import numpy as np
import pytest
from pydantic import ValidationError

from jupiter.api import EconomicSettings, PerennialInput
from jupiter.catalog import catalog
from jupiter.db import PILOT
from jupiter.economics import market_database, perennial_cashflow, rotation_budget
from jupiter.outlook import climate_context, ensemble_period, fit_association
from jupiter.model import et0, project, simulate_window


def test_dated_prices_and_cao_campaigns():
    market = market_database()
    soy = next(row for row in market["national"] if row["crop"]=="soy")
    assert soy["bob_t"] == pytest.approx(265/46*1000,abs=.01)
    assert soy["usd_t"] == pytest.approx(soy["bob_t"]/11.67,abs=.01)
    assert soy["date"] == "2026-11-12"
    assert market["comparisons"][0]["difference_usd_t"] == pytest.approx(soy["usd_t"]-448.18)
    assert len(market["agriculture"]["campaigns"]) == 13
    assert {"coffee","cacao","vanilla","pitaya","acai"} <= {c["code"] for c in catalog()}


def test_budget_units_missing_costs_zero_and_break_even():
    market = market_database()
    default = rotation_budget(["soy","maize","sorghum"],[11,11,11],{},market)
    assert default["revenue_bob_ha"] > 0
    assert default["net_bob_ha"] is None
    settings = dict(bob_per_usd=10,budgets={code:dict(sale_bob_t=1000,yield_t_ha=2,cost_bob_ha=1500)
                                          for code in ("soy","maize","sorghum")})
    budget = rotation_budget(["soy","maize","sorghum"],[11,11,11],settings,market,area=5)
    assert budget["net_bob_ha"] == 1500
    assert budget["net_usd_ha"] == 150
    assert budget["net_field_bob"] == 7500
    assert budget["roi_pct"] == pytest.approx(100/3,abs=.01)
    assert budget["downside_bob_ha"] == -1560
    assert budget["campaigns"][0]["break_even_price"] == 750
    assert budget["campaigns"][0]["break_even_yield"] == 1.5
    settings["budgets"]["soy"]["cost_bob_ha"] = 0
    assert rotation_budget(["soy"],[11],settings,market)["net_bob_ha"] == 2000
    assert rotation_budget(["cover"],[11],{},market)["net_bob_ha"] is None


def test_enso_fit_controls_time_and_real_reference_series():
    years = np.arange(1981,2026)
    index = np.sin(years)*2
    values = 100+.5*(years-years.mean())+10*index
    fit = fit_association(years,index,values,2)
    assert fit["delta"] == pytest.approx(20)
    assert fit["trend_decade"] == pytest.approx(5)
    assert fit["n"] == 45
    context = climate_context(*PILOT)
    assert context["status"] == "available",context
    assert len(context["months"]) == 12
    assert all(m["n"]==45 for m in context["months"])
    assert all(math.isfinite(m["elnino"]["rain_pct"]) for m in context["months"])


def test_ensemble_aggregates_paths_before_quantiles():
    daily = dict(precipitation_sum=[0,100],temperature_2m_mean=[20,30],
                 precipitation_sum_member01=[100,0],temperature_2m_mean_member01=[30,20],
                 precipitation_sum_member02=[None,2],temperature_2m_mean_member02=[None,2])
    values = ensemble_period(daily,[0,1])
    assert values["rain_mm"] == [100,100,100]
    assert values["temp_c"] == [25,25,25]
    assert values["members"] == 2


def test_financial_validation_and_perennial_waiting_years():
    with pytest.raises(ValidationError):
        EconomicSettings(budgets={"soy":{"cost_bob_ha":float("nan")}})
    with pytest.raises(ValidationError):
        EconomicSettings(budgets={"unknown":{"cost_bob_ha":1}})
    with pytest.raises(ValidationError):
        EconomicSettings(bob_per_usd=0)
    body = PerennialInput(crop="vanilla",establishment_bob_ha=10000,annual_cost_bob_ha=1000,
                          sale_bob_t=20000,yield_t_ha=.2,first_harvest_year=3,horizon_years=6,discount_pct=0)
    result = perennial_cashflow(body)
    assert [row["flow_bob_ha"] for row in result["rows"]] == [-10000,-1000,-1000,3000,3000,3000,3000]
    assert result["npv_bob_ha"] == 0
    assert result["payback_year"] == 6


def test_enso_daily_trace_and_vectorized_metrics_agree():
    inputs=dict(plant_month=11,irrigation="rainfed",irrigation_mm=None,warming_c=1,
                enso_factors={"elnino":[dict(rain_factor=.7+.03*month,warming_c=.2*month) for month in range(12)]})
    rows=[dict(date=date(2020,11,1)+timedelta(days=d),tmean_c=26,tmin_c=20,tmax_c=34,
               rh_pct=70,wind2m_ms=2,solar_mj_m2_day=20,precip_mm_day=3) for d in range(1095)]
    warming=np.array([inputs['enso_factors']['elnino'][r['date'].month-1]['warming_c'] for r in rows])
    demand=et0(rows,-17.18,250,warming)
    climate=[(r,float(e),r['precip_mm_day']*inputs['enso_factors']['elnino'][r['date'].month-1]['rain_factor']) for r,e in zip(rows,demand)]
    choices=[('a',['soy','maize','sorghum']),('b',['sorghum','soy','maize'])]
    profile=dict(theta_fc=.29,theta_wp=.14,depth_m=.85)
    expected=[project(climate,2020,sequence,inputs,profile,'elnino',trace=True)[0] for _,sequence in choices]
    assert simulate_window(climate,2020,choices,inputs,profile,'elnino')==expected
