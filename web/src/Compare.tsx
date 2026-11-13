import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, ArrowLeft, ArrowRight, CloudRain, Download, Droplets, FileText, Layers, Leaf,
  LoaderCircle, Thermometer } from 'lucide-react';
import { api,errorText,n,post } from './client';
import { ClimateChart, Plot } from './Chart';
import type { Job, Option, Run, RunSummary, Task } from './types';
import type { Go } from './App';

type Scenario = 'historical'|'sensitivity';
const metricTitles={deficit_mm:'Déficit hídrico',stress_days:'Días con déficit',cover_pct:'Cobertura estimada',irrigation_mm:'Riego simulado'};
const units={deficit_mm:'mm',stress_days:'días',cover_pct:'%',irrigation_mm:'mm'};
type Metric = keyof typeof units;

export function Compare({id,summary,go,refresh}:{id:string;summary?:RunSummary;go:Go;refresh:()=>Promise<void>}) {
  const [run,setRun]=useState<Run>(),[job,setJob]=useState<Job>(),[error,setError]=useState('');
  const [choice,setChoice]=useState(''),[scenario,setScenario]=useState<Scenario>('historical');
  const [report,setReport]=useState<Task>(),[reportJob,setReportJob]=useState<Job>(),[reportError,setReportError]=useState('');
  const [busy,setBusy]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>{
    let active=true;
    let timer:number;
    const poll=async()=>{
      try{
        const get=await api<Run>('/analyses/'+id);
        if(!active)return;setRun(get);setError('');
        if(get.result){setChoice(current=>current||get.result!.alternatives[0]?.id||'');return;}
        const key=summary?.job_id??(await api<RunSummary[]>('/analyses')).find(x=>x.id===id)?.job_id;
        if(!key)throw new Error('No se encontró el trabajo de este análisis.');
        const progress=await api<Job>('/jobs/'+key);
        if(!active)return;setJob(progress);
        if(!['failed','cancelled'].includes(progress.status))timer=window.setTimeout(poll,1400);
      }catch(e){if(active)setError(errorText(e));}
    };
    void poll();return()=>{active=false;clearTimeout(timer);};
  },[id,summary?.job_id,retry]);
  useEffect(()=>{
    if(!report)return;
    let active=true;
    let timer:number;
    const poll=async()=>{
      try {
        const j=await api<Job>('/jobs/'+report.job_id);if(!active)return;setReportJob(j);
        if(j.status==='queued'||j.status==='running')timer=window.setTimeout(poll,1400);
        if(j.status==='done')void refresh();
      }catch(e){if(active)setReportError(errorText(e));}
    };
    void poll();return()=>{active=false;clearTimeout(timer);};
  },[report]);
  async function makeReport(){
    setBusy(true);setReportError('');setReportJob(undefined);
    try{setReport(await post<Task>('/analyses/'+id+'/reports',{rotation_id:choice}));}
    catch(e){setReportError(errorText(e));}finally{setBusy(false);}
  }
  async function action(j:Job,verb:'retry'|'cancel',isReport=false) {
    try{await post('/jobs/'+j.id+'/'+verb);
      if(isReport&&report)setReport({...report});else setRetry(retry+1);
    }catch(e){(isReport?setReportError:setError)(errorText(e));}
  }
  const data=run?.result;
  const selected=data?.alternatives.find(x=>x.id===choice);
  const metrics=selected?.metrics[scenario];

  return <>
    <button className="back-link" onClick={()=>go('/comparar')}><ArrowLeft size={16}/> Comparaciones</button>
    <div className="page-heading"><div><h1>{run?.field.name??'Comparación de rotaciones'}</h1><p>Resultados para tres campañas{run?' · versión '+run.field.version+' del lote':''}</p></div>{data&&<span className="chip amber"><FlaskIcon/> Exploratorio</span>}</div>
    {error&&<section className="card panel"><p className="error" role="alert">{error}</p><button className="button secondary" onClick={()=>setRetry(retry+1)}>Volver a cargar</button></section>}
    {!data&&!error&&<section className="card panel job-panel">
      {job&&['failed','cancelled'].includes(job.status)?<AlertTriangle className="amber-text" size={26}/>:<LoaderCircle className="spin green" size={28}/>}
      <h2>{job?.status==='failed'?'El análisis requiere atención':job?.status==='cancelled'?'Análisis cancelado':'Preparando la comparación'}</h2>
      <p aria-live="polite">{job?.error??'Consultando el historial climático y evaluando las secuencias.'}</p>
      {job&&!['failed','cancelled'].includes(job.status)&&<progress max={100} value={job.progress}>{job.progress}%</progress>}
      <div className="button-row">{job&&(job.status==='failed'||job.status==='cancelled')&&<button className="button primary" onClick={()=>void action(job,'retry')}>Reintentar</button>}
        {job&&(job.status==='queued'||job.status==='running')&&<button className="button secondary" onClick={()=>void action(job,'cancel')}>Cancelar</button>}
        {run&&<button className="button secondary" onClick={()=>go('/lotes/'+run.field.id)}>Abrir lote</button>}</div>
    </section>}
    {data&&<>
      <div className="notice prominent"><AlertTriangle size={19}/><div><strong>Catálogo ilustrativo</strong><div>{data.trial?'El ensayo completa entradas faltantes con supuestos identificados.':'El cálculo depende de las entradas disponibles. Los indicadores con datos faltantes quedan pendientes.'}</div></div></div>
      <div className="metrics result-metrics">
        <Kpi Icon={CloudRain} title="Lluvia media anual" value={n(data.source.mean_annual_rain_mm,2)} unit="mm" detail={data.source.start+' a '+data.source.end}/>
        <Kpi Icon={Thermometer} title="Temperatura media" value={n(data.source.mean_temp_c,2)} unit="°C" detail={data.source.source_class}/>
        <Kpi Icon={Layers} title="Días de clima" value={n(data.source.rows)} unit="" detail={data.source.missing_days+' ausentes · '+data.source.incomplete_days+' incompletos'}/>
      </div>
      <section className="card panel"><div className="section-head"><div><h2>Alternativas de rotación</h2><p>{data.alternatives.length} alternativas mostradas de {data.candidate_count} secuencias candidatas.</p></div>
        <div className="segments" role="group" aria-label="Escenario"><button aria-pressed={scenario==='historical'} onClick={()=>setScenario('historical')}>Histórico</button><button aria-pressed={scenario==='sensitivity'} onClick={()=>setScenario('sensitivity')}>Sensibilidad</button></div></div>
        {scenario==='sensitivity'&&<p className="notice">Hipótesis {n(run?.inputs.rainfall_shift_pct,1)} % de lluvia y {n(run?.inputs.warming_c,1)} °C de temperatura.</p>}
        {data.alternatives.length?<div className="option-grid">{data.alternatives.map((r,i)=><OptionCard key={r.id} option={r} i={i} selected={choice===r.id} scenario={scenario} onSelect={()=>{setChoice(r.id);setReport(undefined);setReportJob(undefined);setReportError('');}}/>)}</div>:
          <p className="notice">Con los filtros actuales quedan menos de tres cultivos compatibles para una secuencia. Revisa el mes de siembra y los datos del perfil.</p>}
        <p className="reference">{data.reference?'Referencia asumida a partir del cultivo anterior · '+data.reference.names.join(' → ')+' · Déficit '+n(data.reference.metrics[scenario].deficit_mm,1)+' mm':'Referencia pendiente · declara el cultivo anterior para incluirla.'}</p>
      </section>
      {selected&&metrics&&<section className="card panel"><div className="section-head"><div><h2>Calendario de la alternativa elegida</h2><p>{selected.names.join(' → ')}</p></div>
        <Leaf className="green" size={22}/></div>
        <div className="calendar">{selected.calendar.map((c,i)=><div key={i}><small>CAMPAÑA {i+1}</small><b>{c.crop}</b><span>Siembra en {new Intl.DateTimeFormat('es',{month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(2020,c.month-1,1)))} · {c.duration} días</span></div>)}</div>
        {metrics.windows.length>0&&metrics.lowest_deficit_windows!==undefined&&<p className="muted">La opción tuvo el menor déficit de las alternativas mostradas en {metrics.lowest_deficit_windows} de {metrics.windows.length} ventanas. Se cuentan empates.</p>}
        <p className="muted">{metrics.windows.length?'Ventanas históricas de tres años con inicio en '+metrics.windows.join(', ')+(metrics.deficit_range?' · rango de déficit '+metrics.deficit_range.map(x=>n(x,1)).join(' a ')+' mm':''):'Balance diario pendiente para este escenario.'}</p>
      </section>}
      <div className="evidence-grid">
        <section className="card panel"><div className="section-head"><div><h2>Clima mensual histórico</h2><p>{data.source.product} · meses completos</p></div></div>
          <div className="legend"><span><i/> Lluvia acumulada</span><span><i/> Temperatura media</span></div><ClimateChart monthly={data.monthly}/></section>
        <section className="card panel"><div className="section-head"><div><h2>Déficit por alternativa</h2><p>Media de las ventanas disponibles · mm</p></div></div>
          {data.alternatives.some(r=>r.metrics[scenario].deficit_mm!==null)?<Plot label="Déficit hídrico por alternativa" data={[{type:'bar',x:data.alternatives.map((_,i)=>'Opción '+(i+1)),y:data.alternatives.map(r=>r.metrics[scenario].deficit_mm),marker:{color:data.alternatives.map(r=>r.id===choice?'#32775a':'#bed5a7')}}]} layout={{yaxis:{rangemode:'tozero',gridcolor:'#eef2eb'},showlegend:false}}/>:
            <div className="plot-empty"><Droplets size={28}/><p>Completa las entradas hídricas para calcular este indicador.</p></div>}</section>
      </div>
      <section className="card panel"><div className="section-head"><div><h2>Suelo y datos por confirmar</h2><p>{data.missing.length?data.missing.join(' · '):'Entradas para el cálculo declaradas por el productor.'}</p></div></div>
        {Object.entries(data.excluded).map(([crop,reasons])=><p className="notice" key={crop}><strong>{crop}</strong> {reasons.join(' ')}</p>)}
        {data.soil.length>0&&<details className="form-details"><summary>Muestras importadas ({data.soil.length} resultados)</summary><ul>{data.soil.map((s,i)=><li key={i}>{s.sample_code} · {s.sampled_on} · {s.depth_from_cm} a {s.depth_to_cm} cm · {s.variable} {s.value} {s.unit} · {s.method}</li>)}</ul></details>}
        {data.campaigns.length>0&&<details className="form-details"><summary>Campañas importadas ({data.campaigns.length})</summary><ul>{data.campaigns.map((c,i)=><li key={i}>{c.crop_code} · {c.cultivar} · {c.planting_date} a {c.harvest_date}</li>)}</ul></details>}
        <div className="two-col">{data.actions.map(a=><div className="action-item" key={a.item}><b>{a.item}</b><p>{a.reason}</p></div>)}</div>
        <details className="form-details"><summary>Procedencia y método</summary><p>{data.source.product} · {data.source.support} · {data.source.time_standard}</p><p>Modelo {data.version} · Catálogo {data.catalog_version} · Pesos agua {data.weights[0]*100} %, cobertura {data.weights[1]*100} % y diversidad {data.weights[2]*100} %.</p>
          <p className="hash">SHA-256 {data.source.sha256}</p><ul>{data.limitations.map(x=><li key={x}>{x}</li>)}</ul>
          <a href={data.catalog_source} target="_blank" rel="noreferrer">FAO 56</a></details>
      </section>
      {selected&&<section className="card panel export"><div className="section-head"><div><h2>Informe del análisis</h2><p>{selected.names.join(' → ')} · resumen histórico y sensibilidad</p></div>
        <button className="button primary" disabled={busy||reportJob?.status==='queued'||reportJob?.status==='running'} onClick={()=>void makeReport()}><FileText size={17}/>{busy?'Enviando…':'Generar informe'}<ArrowRight size={16}/></button></div>
        {reportError&&<p className="error" role="alert">{reportError}</p>}
        {reportJob&&(reportJob.status==='queued'||reportJob.status==='running')&&<p className="notice" aria-live="polite"><LoaderCircle className="spin" size={16}/> Generando PDF y CSV · {reportJob.progress}%</p>}
        {reportJob&&(reportJob.status==='failed'||reportJob.status==='cancelled')&&<div className="error">{reportJob.error??'Informe cancelado.'} <button className="text-button" onClick={()=>void action(reportJob,'retry',true)}>Reintentar</button></div>}
        {reportJob?.status==='done'&&report&&<div className="button-row"><a className="button primary" href={'/api/reports/'+report.target_id+'/pdf'}><Download size={16}/> Descargar PDF</a>
          <a className="button secondary" href={'/api/reports/'+report.target_id+'/csv'}>Descargar CSV</a><a className="button secondary" href={'/api/reports/'+report.target_id+'/daily'}>Serie diaria</a></div>}</section>}
    </>}
  </>;
}

function FlaskIcon(){return <Activity size={15}/>;}
function Kpi({Icon,title,value,unit,detail}:{Icon:typeof CloudRain;title:string;value:string;unit:string;detail:string}){
  return <section className="card metric"><span className="metric-icon"><Icon size={19}/></span><span className="metric-label">{title}</span><strong>{value} <small>{unit}</small></strong><span className="muted">{detail}</span></section>;
}
function OptionCard({option,i,selected,scenario,onSelect}:{option:Option;i:number;selected:boolean;scenario:Scenario;onSelect:()=>void}){
  return <button className={'option '+(selected?'selected':'')} aria-pressed={selected} onClick={onSelect}>
    <span className="option-top"><span>Opción {i+1}</span><b>{n(option.score,1)} pts</b></span><strong>{option.names.join(' → ')}</strong>
    <dl>{(['deficit_mm','stress_days','cover_pct'] as Metric[]).map(k=><div key={k}><dt>{metricTitles[k]}</dt><dd>{option.metrics[scenario][k]===null?'Pendiente':n(option.metrics[scenario][k],1)+' '+units[k]}</dd></div>)}</dl>
    <span className="option-bottom">{selected?'Seleccionada':'Seleccionar alternativa'} <ArrowRight size={15}/></span>
  </button>;
}
