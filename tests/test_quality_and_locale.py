import math
import numpy as np
import pytest
from pydantic import ValidationError

from jupiter.api import ReportInput
from jupiter.i18n import localize, translate
from jupiter.outlook import ensemble_period, fit_association, validated_forecast
from jupiter.quality import evidence_quality


def test_evidence_score_is_auditable_and_keeps_validation_explicit():
    output=dict(source=dict(rows=100,missing_days=0,incomplete_days=0),trial=True,
                alternatives=[],enso={},weather={})
    quality=evidence_quality(output,{},dict(lon=-63,lat=-17),'2026-11-15')
    assert quality['score']==35
    assert sum(c['points'] for c in quality['components'])==quality['score']
    assert 'calibración' in quality['validation']
    assert quality['point']==[-63,-17]
    measured=evidence_quality(output,dict(theta_fc=.3,theta_wp=.1,depth_m=1),dict(lon=-63,lat=-17),'2026-11-15')
    assert measured['score']==55
    assert 'declarados' in measured['level']


def test_hac_and_chronological_validation_use_held_out_years():
    years=np.arange(1981,2026)
    index=np.sin(years)
    values=100+.5*(years-years.mean())+10*index
    fit=fit_association(years,index,values,2)
    assert fit['delta']==pytest.approx(20)
    assert fit['hindcast']['n']==25
    assert fit['hindcast']['rmse']<1e-9
    assert fit['hindcast']['skill_pct']==pytest.approx(100)
    assert fit['low']<=fit['delta']<=fit['high']
    assert 'HAC' in fit['interval_method']
    assert fit_association(years,index,[math.nan]*45,2) is None


def test_forecast_rejects_units_ranges_duplicates_and_reversed_temperatures():
    raw=dict(daily={'time':['2026-11-15','2026-11-15','bad','2026-11-16'],
                    'temperature_2m_min':[30,20,20,20],'temperature_2m_max':[25,30,30,31],
                    'precipitation_sum':[-1,1,1,2],'precipitation_probability_max':[200,50,50,20]},
             daily_units={'temperature_2m_min':'°C','temperature_2m_max':'°C','precipitation_sum':'inches'})
    rows,rejected=validated_forecast(raw)
    assert len(rows)==2 and rejected>=5
    assert rows[0]['temperature_2m_min'] is None
    assert rows[1]['precipitation_sum'] is None
    assert rows[1]['temperature_2m_max']==31
    assert ensemble_period({},[])['members']==0
    assert ensemble_period({'precipitation_sum':[math.nan],'temperature_2m_mean':[20]},[0])['rain_mm'] is None


def test_translation_preserves_producer_records_and_translates_public_labels():
    raw={'name':'Maíz','field_name':'Soya','alternatives':[{'names':['Maíz','Soya']}],
         'crops':[{'code':'maize','name':'Maíz'}]}
    translated=localize(raw)
    assert translated['name']=='Maíz' and translated['field_name']=='Soya'
    assert translated['alternatives'][0]['names']==['Maize','Soybean']
    assert translated['crops'][0]['name']=='Maize'
    assert localize(raw,'es')==raw
    assert translate('Opción 3')=='Option 3'


def test_report_language_contract_rejects_unsupported_language():
    assert ReportInput(rotation_id='rotation-a',language='en').language=='en'
    assert ReportInput(rotation_id='rotation-a').language=='es'
    with pytest.raises(ValidationError):
        ReportInput(rotation_id='rotation-a',language='fr')
