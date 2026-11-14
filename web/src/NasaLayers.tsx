const root='https://gibs.earthdata.nasa.gov';

export const nasaLayers={
  ndvi:{name:'Vegetación · NDVI MODIS Terra',id:'MODIS_Terra_L3_NDVI_Monthly',maxZoom:7,date:'2025-11-01',
    detail:'Compuesto mensual de 1 km. Menor verdor también puede reflejar cosecha, suelo descubierto, nubes o cambio de uso.'},
  smap:{name:'Humedad radicular · SMAP L4',id:'SMAP_L4_Analyzed_Root_Zone_Soil_Moisture',maxZoom:6,date:'2024-11-15',
    detail:'Estimación de humedad radicular de 9 km a las 12 UTC. Combina observaciones y un modelo.'},
  rain:{name:'Precipitación · GPM IMERG',id:'IMERG_Precipitation_Rate',maxZoom:6,date:'2025-11-15',
    detail:'Tasa media de precipitación del día, en mm/h, a escala regional.'},
};

export type NasaLayer=keyof typeof nasaLayers;
export function nasaTile(layer:NasaLayer,date:string){
  const item=nasaLayers[layer];
  const time=layer==='ndvi'?date.slice(0,7)+'-01':date;
  return `${root}/wmts/epsg3857/best/${item.id}/default/${time}/GoogleMapsCompatible_Level${item.maxZoom}/{z}/{y}/{x}.png`;
}

export function NasaControls({layer,date,onLayer,onDate,error}:{layer:NasaLayer|'';date:string;
  onLayer:(layer:NasaLayer|'')=>void;onDate:(date:string)=>void;error:boolean}){
  const selected=layer?nasaLayers[layer]:null;
  return <details className="nasa-controls"><summary>Capas NASA por fecha</summary>
    <div className="two-col form-gap"><label>Variable<select aria-label="Variable NASA" value={layer} onChange={e=>onLayer(e.target.value as NasaLayer|'')}>
      <option value="">Sin superposición</option>{Object.entries(nasaLayers).map(([id,entry])=><option key={id} value={id}>{entry.name}</option>)}</select></label>
      {selected&&<label>{layer==='ndvi'?'Mes de observación':'Fecha de observación'}<input type={layer==='ndvi'?'month':'date'} value={layer==='ndvi'?date.slice(0,7):date}
        onChange={e=>{if(e.target.value)onDate(layer==='ndvi'?e.target.value+'-01':e.target.value);}}/></label>}</div>
    {selected&&<p className="muted">{selected.detail} Capa visual de contexto. Requiere internet y puede tener píxeles o fechas sin cobertura. <a href={`${root}/legends/${selected.id}_H.svg`} target="_blank" rel="noreferrer">Ver escala de colores</a></p>}
    {error&&<p className="notice" role="status">La capa no respondió para toda esta vista o fecha. Prueba otra fecha.</p>}
  </details>;
}
