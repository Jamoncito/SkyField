import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl/dist/maplibre-gl-csp.js';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-csp-worker.js?url';
import type {StyleSpecification, Map as LibreMap, Marker as LibreMarker} from 'maplibre-gl';
import { TerraDraw, TerraDrawPointMode, TerraDrawPolygonMode, TerraDrawSelectMode } from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import { LocateFixed, MapPin, Pentagon, Pencil, Trash2, Layers, Check } from 'lucide-react';
import type { Shape } from './types';
import 'maplibre-gl/dist/maplibre-gl.css';

maplibregl.setWorkerUrl(workerUrl);

const PILOT:[number,number] = [-63.272578418,-17.182537861];
const local:StyleSpecification={version:8,sources:{},layers:[{id:'solid',type:'background',paint:{'background-color':'#e4ecdf'}}]};
const remote = import.meta.env.VITE_MAP_STYLE || 'https://tiles.openfreemap.org/styles/liberty';
const roundPosition = (p:number[]) => p.map(v=>Number(v.toFixed(8)));
function roundGeometry(geometry:Exclude<Shape,{type:'MultiPolygon'}>):Exclude<Shape,{type:'MultiPolygon'}> {
  if(geometry.type==='Point')return {...geometry,coordinates:roundPosition(geometry.coordinates)};
  return {...geometry,coordinates:geometry.coordinates.map(ring=>ring.map(roundPosition))};
}
type Mode = 'point'|'polygon'|'select';

export default function PlotMap({initial,onShape}:{initial:Shape|null; onShape:(shape:Shape|null,source:string)=>void}) {
  const mount = useRef<HTMLDivElement>(null);
  const map = useRef<LibreMap|null>(null);
  const draw = useRef<TerraDraw|null>(null);
  const gpsMarker = useRef<LibreMarker|null>(null);
  const shape = useRef(initial);
  const callback = useRef(onShape);
  callback.current=onShape;
  const [base,setBase]=useState(true);
  const [ready,setReady]=useState(false);
  const [mode,setMode]=useState<Mode>('select');
  const [gps,setGps]=useState<{lng:number;lat:number;accuracy:number}|null>(null);
  const [message,setMessage]=useState('');
  const [locating,setLocating]=useState(false);
  useEffect(()=>{
    const first = shape.current;
    const coords = first?.type==='Point' ? first.coordinates :
      first?.type==='Polygon' ? first.coordinates[0][0] : first?.coordinates[0][0][0];
    const instance = new maplibregl.Map({container:mount.current!,style:base?remote:local,
      center:coords?[coords[0],coords[1]]:PILOT,zoom:14,attributionControl:{compact:true},
      canvasContextAttributes:{antialias:true}});
    map.current=instance;
    instance.addControl(new maplibregl.NavigationControl({showCompass:true}),'top-right');
    instance.addControl(new maplibregl.ScaleControl({unit:'metric'}),'bottom-left');
    let changed=false;
    const useLocal = () => {
      if (!changed && base && !draw.current) {
        changed=true;
        setMessage('El mapa de fondo no respondió. Puedes dibujar sobre el fondo local.');
        setBase(false);
      }
    };
    const timeout=window.setTimeout(useLocal,7000);
    instance.on('error',event=>{if(!instance.isStyleLoaded()&&!("sourceId" in event))useLocal();});
    instance.once('load',()=>{
      clearTimeout(timeout);
      if (first && first.type!=='Point') {
        const bounds = new maplibregl.LngLatBounds();
        const polys = first.type==='Polygon'?[first.coordinates]:first.coordinates;
        polys.forEach(poly=>poly[0].forEach(p=>bounds.extend([p[0],p[1]])));
        instance.fitBounds(bounds,{padding:65,maxZoom:17,duration:0});
      }
      const tools = new TerraDraw({
        adapter:new TerraDrawMapLibreGLAdapter({map:instance,coordinatePrecision:8}),
        modes:[
          new TerraDrawPointMode({styles:{pointColor:'#258261',pointWidth:11}}),
          new TerraDrawPolygonMode({styles:{fillColor:'#72ab56',fillOpacity:.34,outlineColor:'#1b674d',outlineWidth:3}}),
          new TerraDrawSelectMode({flags:{point:{feature:{draggable:true}},polygon:{feature:{draggable:true,coordinates:{draggable:true,midpoints:true,deletable:true}}}}}),
        ]});
      draw.current=tools;
      tools.start();
      tools.setMode('select');
      const install = (geo:Shape) => {
        const shapes = geo.type==='MultiPolygon' ? geo.coordinates.map(coordinates=>({type:'Polygon' as const,coordinates})) : [geo];
        tools.addFeatures(shapes.map(geometry=>({type:'Feature',geometry:roundGeometry(geometry),properties:{mode:geometry.type==='Point'?'point':'polygon'}})));
      };
      if(shape.current)install(shape.current);
      const saveSnapshot = () => {
        const complete = tools.getSnapshot().filter(f=>!f.properties.midPoint && ['Point','Polygon'].includes(f.geometry.type) && ['point','polygon'].includes(String(f.properties.mode)));
        const geos = complete.map(f=>f.geometry as Shape);
        if(!geos.length)return;
        const polys=geos.filter(g=>g.type==='Polygon');
        const geo:Shape = polys.length>1 ? {type:'MultiPolygon',coordinates:polys.map(p=>p.coordinates)} : geos.at(-1)!;
        shape.current=geo;
        callback.current(geo,'dibujo manual');
      };
      tools.on('finish',()=>{saveSnapshot();tools.setMode('select');setMode('select');});
      tools.on('change',(_ids,type)=>{if(type==='update'&&tools.getMode()==='select')saveSnapshot();});
      setReady(true);
    });
    return ()=>{
      clearTimeout(timeout);
      draw.current?.stop();draw.current=null;
      gpsMarker.current?.remove();gpsMarker.current=null;
      instance.remove();map.current=null;
    };
  },[base]);

  function choose(next:Mode) {
    if(!draw.current)return;
    if(next!=='select') {
      draw.current.clear();
      shape.current=null;
      callback.current(null,'dibujo manual');
    }
    draw.current.setMode(next);
    setMode(next);
    setMessage(next==='polygon'?'Marca los vértices y vuelve al primero para cerrar.':next==='point'?'Toca el mapa para ubicar el punto.':'Selecciona la figura para mover el punto o editar sus vértices.');
  }

  function locate() {
    if (!window.isSecureContext || !navigator.geolocation) {
      setMessage('El GPS necesita localhost o HTTPS. Puedes marcar el punto manualmente.');
      return;
    }
    setLocating(true);setMessage('');
    navigator.geolocation.getCurrentPosition(({coords})=>{
      const result={lat:coords.latitude,lng:coords.longitude,accuracy:coords.accuracy};
      setGps(result);setLocating(false);
      map.current?.flyTo({center:[result.lng,result.lat],zoom:16});
      if(map.current) {
        gpsMarker.current?.remove();
        gpsMarker.current=new maplibregl.Marker({color:'#4c87bc'}).setLngLat([result.lng,result.lat]).addTo(map.current);
      }
      setMessage('Ubicación recibida. Confirma el punto o dibuja tu terreno.');
    },err=>{
      setLocating(false);
      setMessage(err.code===1?'Permiso denegado. Habilita la ubicación en el navegador o marca el punto en el mapa.':
        err.code===3?'La búsqueda agotó el tiempo. Reintenta o marca el punto en el mapa.':'El dispositivo no pudo obtener la ubicación. Puedes marcar el punto en el mapa.');
    },{enableHighAccuracy:true,maximumAge:15000,timeout:10000});
  }

  function confirm() {
    if(!gps||!draw.current)return;
    const point:Shape={type:'Point',coordinates:roundPosition([gps.lng,gps.lat])};
    draw.current.clear();
    draw.current.addFeatures([{type:'Feature',geometry:point,properties:{mode:'point'}}]);
    draw.current.setMode('select');setMode('select');
    shape.current=point;callback.current(point,'GPS confirmado');
    gpsMarker.current?.remove();setGps(null);setMessage('Punto GPS confirmado. Guarda el lote para conservarlo.');
  }

  return <div className="map-card">
    <div className="map-stage">
      <div className="map-canvas" ref={mount}/>
      <div className="map-tools">
        <button type="button" className="button map-btn" onClick={locate} disabled={locating}><LocateFixed size={17}/>{locating?'Buscando…':'Ir a mi ubicación'}</button>
        <button type="button" className={'button map-btn '+(mode==='polygon'?'pressed':'')} disabled={!ready} onClick={()=>choose('polygon')}><Pentagon size={16}/> Dibujar terreno</button>
        <button type="button" className={'button icon-btn '+(mode==='point'?'pressed':'')} aria-label="Marcar punto" title="Marcar punto" disabled={!ready} onClick={()=>choose('point')}><MapPin size={17}/></button>
        <button type="button" className="button icon-btn" aria-label="Editar figura" title="Editar figura" disabled={!ready} onClick={()=>choose('select')}><Pencil size={16}/></button>
        <button type="button" className="button icon-btn" aria-label="Borrar figura" title="Borrar figura" disabled={!ready} onClick={()=>{draw.current?.clear();shape.current=null;callback.current(null,'dibujo manual');}}><Trash2 size={16}/></button>
        <button type="button" className="button icon-btn" aria-label={base?'Usar fondo local':'Mostrar OpenFreeMap'} title={base?'Usar fondo local':'Mostrar OpenFreeMap'} onClick={()=>{setReady(false);setMode('select');setBase(!base);}}><Layers size={17}/></button>
      </div>
      {!base&&<span className="map-attribution">Fondo local · Geometría del productor</span>}
    </div>
    {(message||gps)&&<div className="map-message" aria-live="polite"><span>{message}{gps&&<> Precisión estimada ±{Math.round(gps.accuracy)} m.</>}</span>
      {gps&&<button className="button secondary" type="button" onClick={confirm} disabled={!ready}><Check size={16}/> Confirmar punto</button>}</div>}
  </div>;
}
