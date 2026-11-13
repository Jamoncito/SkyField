import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, CloudSun, FileUp, FlaskConical, Info, MapPin, Save, Sprout } from 'lucide-react';
import { api,day,errorText,n,post } from './client';
import type { ImportRecord, Job, Shape, Site, Task } from './types';
import type { Go } from './App';

const Map=lazy(()=>import('./Map'));
const kindLabels={climate:'Clima',soil:'Suelo',campaigns:'Campañas'};

export function FieldEditor({id,analyzing,go,refresh}:{id:string|null;analyzing:boolean;go:Go;refresh:()=>Promise<void>}) {
  const [site,setSite]=useState<Site|null>(),[name,setName]=useState(''),[shape,setShape]=useState<Shape|null>(null);
  const [source,setSource]=useState('dibujo manual'),[error,setError]=useState(''),[saved,setSaved]=useState('');
  const [busy,setBusy]=useState(false),[dirty,setDirty]=useState(false);
  const [records,setRecords]=useState<ImportRecord[]>([]);
  const [loadError,setLoadError]=useState('');

  function load(){
    setLoadError('');
    if(!id){setSite(null);return;}
    void api<Site>('/fields/'+id).then(x=>{setSite(x);setName(x.name);setShape(x.geometry);setSource(x.source);}).catch(e=>setLoadError(errorText(e)));
  }
  function loadImports(){if(id)void api<ImportRecord[]>('/fields/'+id+'/imports').then(setRecords).catch(e=>setError(errorText(e)));}
  useEffect(()=>{load();loadImports();},[id]);

  async function save(e:FormEvent) {
    e.preventDefault();
    if(!shape){setError('Marca un punto o termina de dibujar el terreno.');return;}
    setBusy(true);setError('');setSaved('');
    try {
      const data={name,geometry:shape,source,version:site?.version};
      const item=id?await api<Site>('/fields/'+id,{method:'PATCH',body:JSON.stringify(data)}):await post<Site>('/fields',data);
      setSite(item);setName(item.name);setDirty(false);setSaved('Lote guardado.');void refresh();
      if(!id)go('/lotes/'+item.id);
    }catch(e){setError(errorText(e));}finally{setBusy(false);}
  }

  if(loadError)return <div className="card panel"><p role="alert">{loadError}</p><button className="button secondary" onClick={load}>Reintentar</button></div>;
  if(site===undefined)return <p className="muted loading">Cargando lote…</p>;
  if(analyzing&&site)return <AnalysisForm site={site} go={go}/>;
  return <>
    <button className="back-link" onClick={()=>go('/lotes')}><ArrowLeft size={16}/> Mis lotes</button>
    <div className="page-heading"><div><h1>{site?.name??'Nuevo lote'}</h1><p>{site?.pilot?'Punto piloto · Santa Cruz, Bolivia':'Ubicación y datos del terreno'}</p></div>
      {site&&<button className="button primary" disabled={dirty||site.multicell} onClick={()=>go('/lotes/'+site.id+'/analizar')}><Sprout size={18}/> Analizar <ArrowRight size={16}/></button>}</div>
    <form onSubmit={save}>
      <div className="editor-grid">
        <section className="card panel map-panel"><div className="section-head"><div><h2>Ubicación del lote</h2><p>Marca un punto o dibuja un perímetro para calcular el área.</p></div></div>
          <Suspense fallback={<div className="map-stage loading">Cargando editor de mapa…</div>}><Map initial={shape} onShape={(geo,s)=>{setShape(geo);setSource(s);setDirty(true);setSaved('');}}/></Suspense>
        </section>
        <section className="card panel field-info"><MapPin className="green" size={23}/><h2>Ficha del terreno</h2>
          <label>Nombre del lote<input value={name} onChange={e=>{setName(e.target.value);setDirty(true);}} minLength={2} maxLength={100} required placeholder="Ej. Lote norte"/></label>
          <dl className="facts"><div><dt>Geometría</dt><dd>{shape?.type==='Point'?'Punto':shape?'Perímetro':'Por definir'}</dd></div>
          <div><dt>Superficie</dt><dd>{site?.area_ha&&!dirty?n(site.area_ha,2)+' ha':shape&&shape.type!=='Point'?'Al guardar':'—'}</dd></div>
          <div><dt>Coordenadas</dt><dd>{shape?.type==='Point'?shape.coordinates.slice().reverse().map(x=>x.toFixed(6)+'°').join(', '):site&&!dirty?site.lat.toFixed(6)+'°, '+site.lon.toFixed(6)+'°':'—'}</dd></div>
          <div><dt>Versión guardada</dt><dd>{site?.version??'—'}</dd></div></dl>
          {site?.multicell ? <p className="notice"><Info size={17}/> El perímetro se marcó para evaluación multicelda. Usa un punto exploratorio o divide el terreno.</p> :
            site?.pilot&&<p className="notice"><CloudSun size={17}/> El CSV verificado cubre el punto piloto. Si cambias su ubicación se consultará su propia serie.</p>}
          {dirty&&site&&<p className="muted">Guarda los cambios para habilitar el análisis.</p>}
          {error&&<p className="error" role="alert">{error}</p>}{saved&&<p className="success" role="status">{saved}</p>}
          <button className="button primary" disabled={busy||(!dirty&&!!site)}><Save size={16}/> {busy?'Guardando…':'Guardar'}</button>
        </section>
      </div>
    </form>
    {site&&<Imports site={site} records={records} refresh={loadImports}/>}
  </>;
}

function Imports({site,records,refresh}:{site:Site;records:ImportRecord[];refresh:()=>void}) {
  const [open,setOpen]=useState(false),[kind,setKind]=useState<keyof typeof kindLabels>('climate');
  const [file,setFile]=useState<File|null>(null),[headers,setHeaders]=useState(''),[error,setError]=useState('');
  const [job,setJob]=useState<Job>(),[busy,setBusy]=useState(false),[taskId,setTaskId]=useState('');
  useEffect(()=>{
    if(!taskId)return;
    let active=true;
    let timer:number|undefined;
    const poll=async()=>{
      try{const j=await api<Job>('/jobs/'+taskId);if(!active)return;setJob(j);
        if(j.status==='queued'||j.status==='running')timer=window.setTimeout(poll,1300);else refresh();}
      catch(e){if(active)setError(errorText(e));}
    };
    void poll();return()=>{active=false;clearTimeout(timer);};
  },[taskId]);
  async function select(next:File|null) {
    setError('');setHeaders('');setFile(null);
    if(!next)return;
    if(next.size>20*1024*1024){setError('El CSV supera 20 MiB.');return;}
    try {
      const text=await next.slice(0,24000).text();
      const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/);
      const idx=lines[0]?.trim()==='-BEGIN HEADER-'?lines.findIndex(l=>l.trim()==='-END HEADER-')+1:0;
      if(!lines[idx])throw new Error('No pudimos detectar encabezados.');
      setHeaders(lines[idx]);setFile(next);
    }catch(e){setError(errorText(e));}
  }
  async function upload(e:FormEvent) {
    e.preventDefault();if(!file)return;
    setBusy(true);setError('');setJob(undefined);setTaskId('');
    const body=new FormData();body.append('kind',kind);body.append('file',file);
    try{const res=await api<Task>('/fields/'+site.id+'/imports',{method:'POST',body});setTaskId(res.job_id);}
    catch(e){setError(errorText(e));}finally{setBusy(false);}
  }
  return <section className="card panel"><div className="section-head"><div><h2>Datos del lote</h2><p>Importa las observaciones que usarás para revisar el análisis.</p></div>
    <button className="button secondary" onClick={()=>setOpen(!open)} aria-expanded={open}><FileUp size={17}/> Importar CSV</button></div>
    {open&&<form className="import-form" onSubmit={upload}><div className="two-col"><label>Tipo de datos<select value={kind} onChange={e=>{setKind(e.target.value as keyof typeof kindLabels);setError('');}}>
      {Object.entries(kindLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label>Archivo CSV<input type="file" accept=".csv,text/csv" onChange={e=>void select(e.target.files?.[0]??null)}/></label></div>
      <p className="muted">UTF-8, coma, decimal con punto y fechas AAAA-MM-DD. {kind!=='climate'&&<>Usa este identificador en field_id: <code>{site.id}</code></>}</p>
      {headers&&<p className="notice headers"><strong>Encabezados detectados</strong> {headers}</p>}
      {error&&<p className="error" role="alert">{error}</p>}
      {job&&<p className={job.status==='failed'?'error':'notice'} aria-live="polite">{job.status==='done'?'Importación completada.':job.error??('Proceso '+job.progress+' %')}</p>}
      <div className="button-row"><a className="button secondary" href={'/api/templates/'+kind}>Descargar plantilla</a>
        <button className="button primary" disabled={!file||busy||job?.status==='running'||job?.status==='queued'}>Cargar archivo</button></div>
    </form>}
    {records.map(r=><div key={r.id} className="import-row"><b>{kindLabels[r.kind as keyof typeof kindLabels]}</b> · {day(r.created)} · {r.summary?n(r.summary.rows)+' filas'+(r.summary.missing_days?' · '+r.summary.missing_days+' días ausentes':''):r.error??r.status}</div>)}
  </section>;
}

function AnalysisForm({site,go}:{site:Site;go:Go}) {
  const [irrigation,setIrrigation]=useState('unknown'),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [trial,setTrial]=useState(false);
  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();setBusy(true);setError('');
    const form=new FormData(e.currentTarget);
    const body:Record<string,unknown>={previous:form.get('previous'),priority:form.get('priority'),irrigation,trial};
    for(const k of ['irrigation_mm','theta_fc','theta_wp','depth_m','soil_ph','soil_ec','plant_month','elevation_m','rainfall_shift_pct','warming_c']){
      const value=form.get(k);if(value!=null&&value!=='')body[k]=Number(value);
    }
    try{const task=await post<Task>('/fields/'+site.id+'/analyses',body);go('/comparar/'+task.target_id);}
    catch(e){setError(errorText(e));}finally{setBusy(false);}
  }
  return <>
    <button className="back-link" onClick={()=>go('/lotes/'+site.id)}><ArrowLeft size={16}/> {site.name}</button>
    <div className="page-heading"><div><h1>Preparar análisis</h1><p>{site.name} · versión {site.version} del lote</p></div></div>
    <form className="analysis-layout" onSubmit={submit}>
      <section className="card panel"><div className="section-head"><div><h2>Manejo y objetivos</h2><p>Usa los datos que puedes confirmar del terreno.</p></div></div>
        <div className="two-col form-gap"><label>Cultivo anterior<select name="previous" defaultValue="unknown"><option value="unknown">No lo sé</option><option value="soy">Soya</option><option value="maize">Maíz</option><option value="sorghum">Sorgo</option><option value="cover">Cobertura (mucuna)</option></select></label>
        <label>Disponibilidad de riego<select value={irrigation} onChange={e=>setIrrigation(e.target.value)}><option value="unknown">No lo sé</option><option value="rainfed">Solo lluvia</option><option value="confirmed">Riego confirmado</option></select></label>
        {irrigation==='confirmed'&&<label>Riego máximo (mm/día)<input type="number" name="irrigation_mm" min=".1" max="100" step=".1" required/></label>}
        <label>Prioridad<select name="priority" defaultValue="balanced"><option value="balanced">Equilibrada</option><option value="water">Menor déficit de agua</option><option value="cover">Mayor cobertura</option><option value="diversity">Diversidad de familias</option></select></label>
        <label>Mes de siembra<select name="plant_month" defaultValue="11">{'Enero Febrero Marzo Abril Mayo Junio Julio Agosto Septiembre Octubre Noviembre Diciembre'.split(' ').map((m,i)=><option value={i+1} key={m}>{m}</option>)}</select></label></div>
        <details className="form-details"><summary>Perfil de suelo y elevación</summary><div className="two-col form-gap">
          <label>Capacidad de campo (m³/m³)<input type="number" name="theta_fc" min=".001" max=".8" step=".001" placeholder="Sin dato"/></label>
          <label>Punto de marchitez (m³/m³)<input type="number" name="theta_wp" min="0" max=".799" step=".001" placeholder="Sin dato"/></label>
          <label>Profundidad útil (m)<input type="number" name="depth_m" min=".1" max="3" step=".01" placeholder="Sin dato"/></label>
          <label>pH del suelo<input type="number" name="soil_ph" min="0" max="14" step=".01" placeholder="Sin dato"/></label>
          <label>Conductividad (dS/m)<input type="number" name="soil_ec" min="0" max="100" step=".01" placeholder="Sin dato"/></label>
          <label>Elevación medida (m)<input type="number" name="elevation_m" min="-450" max="8000" step="1" placeholder="Usar fuente climática si existe"/></label>
        </div></details>
        <details className="form-details"><summary>Sensibilidad hipotética</summary><div className="two-col form-gap">
          <label>Cambio de lluvia (%)<input type="number" name="rainfall_shift_pct" defaultValue="-15" min="-60" max="60" step=".1"/></label>
          <label>Cambio de temperatura (°C)<input type="number" name="warming_c" defaultValue="1" min="-4" max="6" step=".1"/></label></div></details>
      </section>
      <aside className="card panel analysis-aside"><span className="metric-icon"><FlaskConical size={22}/></span><h2>Evaluación exploratoria</h2><p>El catálogo inicial es ilustrativo. Los indicadores dependen del clima histórico y de los datos declarados.</p>
        <label className="check-label"><input type="checkbox" checked={trial} onChange={e=>setTrial(e.target.checked)}/><span><b>Activar supuestos de ensayo</b><small>Completa entradas hídricas faltantes con un perfil de prueba identificado.</small></span></label>
        {error&&<p className="error" role="alert">{error}</p>}
        <button className="button primary" disabled={busy||site.multicell}>{busy?'Enviando…':'Analizar rotaciones'}<ArrowRight size={17}/></button>
      </aside>
    </form>
  </>;
}
