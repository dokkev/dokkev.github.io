import { useEffect, useRef, useState } from 'react';

type Mode='normal'|'cyclic'|'lateral';
type Frame={time:number;indentation:number;lateral_displacement:number;force:number;lateral_force:number;patch_area_mm2:number;contact_patch:number[][][];contact_nodes:number[][];front_positions:number[][]};
type Pad={name:string;kind:'hybrid'|'compliant'|'solid';carrier_polygon:number[][];rest_front:number[][];front_faces:number[][];runs:Record<Mode,{duration:number;frames:Frame[]}>;drake_curve?:{indentation:number;force:number}[]};
type Recording={metadata:{friction:number;sample_period:number};cases:Pad[]};
const COLORS=['#17695b','#b35b2b','#4e61a8'];
const LABELS:Record<Mode,string>={normal:'Normal load',cyclic:'Cyclic load',lateral:'Lateral load'};
const CONDITIONS:Record<Mode,string>={normal:'Smooth normal indentation: 0 → 2.4 mm.',cyclic:'Two normal loading cycles: 0 → 2.4 → 0 mm, with a 2 s period.',lateral:'Preload to 1.5 mm, then translate the platen 3 mm sideways at fixed indentation.'};
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
function sample(pad:Pad,mode:Mode,progress:number):Frame {
  const frames=pad.runs[mode].frames,raw=clamp(progress)*(frames.length-1);
  const i=Math.min(frames.length-2,Math.floor(raw)),t=raw-i,a=frames[i],b=frames[i+1];
  const lerp=(key:'time'|'indentation'|'lateral_displacement'|'force'|'lateral_force')=>a[key]+t*(b[key]-a[key]);
  return {...(t<.5?a:b),time:lerp('time'),indentation:lerp('indentation'),lateral_displacement:lerp('lateral_displacement'),force:lerp('force'),lateral_force:lerp('lateral_force'),
    front_positions:a.front_positions.map((p,j)=>p.map((v,k)=>v+t*(b.front_positions[j][k]-v)))};
}
function Specimen({pad,frame,color}:{pad:Pad;frame:Frame;color:string}) {
  const xy=([x,z]:number[])=>[150+x*7,65+z*7];
  const poly=(face:number[],positions:number[][])=>face.map(i=>xy(positions[i]).join(',')).join(' ');
  const bottom=65+(14.005-frame.indentation*1000)*7,shift=frame.lateral_displacement*7000;
  return <svg className="cmd-structure-scene" viewBox="0 0 300 205" role="img" aria-label={`${pad.name} computed deformation`}>
    <polygon points={pad.carrier_polygon.map(p=>xy(p).join(',')).join(' ')} fill="#a5ada8" stroke="#5c695e" strokeWidth="1.5"/>
    <text x="150" y="28" textAnchor="middle">{pad.kind==='hybrid'?'Embedded T carrier · no void':'Fixed backing'}</text>
    {pad.front_faces.map((face,i)=><polygon key={`rest${i}`} points={poly(face,pad.rest_front)} fill="none" stroke="#a7b3ab" strokeOpacity=".2" strokeWidth=".6"/>)}
    {pad.front_faces.map((face,i)=>{
      const displacement=face.reduce((sum,j)=>sum+Math.hypot(pad.rest_front[j][0]-frame.front_positions[j][0],pad.rest_front[j][1]-frame.front_positions[j][1]),0)/3;
      return <polygon key={i} points={poly(face,frame.front_positions)} fill={color} fillOpacity={.18+.6*clamp(displacement/2.4)} stroke={color} strokeWidth=".35"/>;
    })}
    <rect x={31+shift} y={bottom} width="238" height="12" rx="2" fill="#535e59"/>
    {[0,1,2,3,4].map(i=><path key={i} d={`M${50+i*44+shift} ${bottom+3}v6`} stroke="#d4ddd6" strokeWidth="1.5"/>)}
  </svg>;
}
function Patch({frame,color}:{frame:Frame;color:string}) {
  const xy=([x,y]:number[])=>`${150+x*7},${82+y*7}`;
  return <svg className="cmd-contact-patch" viewBox="0 0 300 145" role="img" aria-label={`Top view of estimated contact patch, ${frame.patch_area_mm2.toFixed(1)} square millimeters`}>
    <text x="150" y="17" textAnchor="middle">Contact patch · top view</text>
    <rect x="45" y="40" width="210" height="84" fill="#f4f6f4" stroke="#aab5ad" strokeDasharray="3 3"/>
    {frame.contact_patch.length===0&&<text x="150" y="87" textAnchor="middle">No contact</text>}
    <path d={frame.contact_patch.map(r=>r.map((p,i)=>`${i?'L':'M'}${xy(p)}`).join(' ')+'Z').join(' ')} fill={color} fillOpacity=".6" fillRule="evenodd"/>
    {frame.contact_nodes.map(([x,y,f],i)=><circle key={i} cx={150+x*7} cy={82+y*7} r="1.1" fill="#263d32"><title>Normal contact force: {f.toFixed(4)} N</title></circle>)}
  </svg>;
}
function Chart({data,mode,progress,drake}:{data:Recording;mode:Mode;progress:number;drake:boolean}) {
  const coordinate=(f:Frame)=>mode==='normal'?f.indentation*1000:mode==='lateral'?f.lateral_displacement*1000:f.time;
  const xmax=mode==='normal'?2.4:mode==='lateral'?3:4;
  const values=data.cases.flatMap(p=>p.runs[mode].frames.flatMap(f=>mode==='lateral'?[f.force,f.lateral_force]:[f.force]));
  if(drake&&mode==='normal')data.cases.forEach(p=>p.drake_curve?.forEach(f=>values.push(f.force)));
  const ymax=Math.max(.1,Math.max(...values)*1.12),ymin=Math.min(0,Math.min(...values)*1.12);
  const x=(v:number)=>55+v/xmax*580,y=(v:number)=>210-(v-ymin)/(ymax-ymin)*165;
  const path=(p:number[][])=>p.map(([a,b],i)=>`${i?'L':'M'}${x(a)},${y(b)}`).join(' ');
  return <svg className="cmd-force-chart" viewBox="0 0 680 265" role="img" aria-label={`${LABELS[mode]} contact-force comparison`}>
    {[0,1,2,3,4].map(i=>ymin+(ymax-ymin)*i/4).map(v=><g key={v}><path d={`M55 ${y(v)}H635`} stroke="#e1e5e3"/><text x="45" y={y(v)+4} textAnchor="end">{v.toFixed(2)}</text></g>)}
    <text x="55" y="24">Contact force [N]</text>
    {[0,1,2,3,4].map(i=>i*xmax/4).map(v=><text key={v} x={x(v)} y="232" textAnchor="middle">{v.toFixed(1)}</text>)}
    <text x="635" y="255" textAnchor="end">{mode==='normal'?'Indentation [mm]':mode==='lateral'?'Platen translation [mm]':'Time [s]'}</text>
    {data.cases.map((p,i)=>{
      const frames=p.runs[mode].frames,f=sample(p,mode,progress);
      return <g key={p.kind}>
        <path d={path(frames.map(f=>[coordinate(f),f.force]))} stroke={COLORS[i]} strokeWidth="2.5" fill="none"/>
        {mode==='lateral'&&<path d={path(frames.map(f=>[coordinate(f),f.lateral_force]))} stroke={COLORS[i]} strokeWidth="2" strokeDasharray="5 4" fill="none"/>}
        {mode==='normal'&&drake&&p.drake_curve&&<path d={path(p.drake_curve.map(f=>[f.indentation*1000,f.force]))} stroke={COLORS[i]} strokeWidth="2" strokeDasharray="5 4" fill="none"/>}
        <circle cx={x(coordinate(f))} cy={y(f.force)} r="4" fill={COLORS[i]}/>
        {mode==='lateral'&&<circle cx={x(coordinate(f))} cy={y(f.lateral_force)} r="3" fill={COLORS[i]}/>}
      </g>;
    })}
  </svg>;
}
export default function CmdStructuralContactDemo() {
  const [data,setData]=useState<Recording|null>(null),[failed,setFailed]=useState(false);
  const cache=useRef<Partial<Record<Mode,Recording>>>({});
  const [mode,setMode]=useState<Mode>('normal'),[drake,setDrake]=useState(false);
  const [progress,setProgress]=useState(0),[playing,setPlaying]=useState(false);
  useEffect(()=>{
    if(cache.current[mode]){setData(cache.current[mode]!);return;}
    const abort=new AbortController();
    fetch(`/assets/demos/cmd/structural-${mode}.json`,{signal:abort.signal})
      .then(r=>{if(!r.ok)throw new Error();return r.json();})
      .then(value=>{if(!abort.signal.aborted){cache.current[mode]=value;setData(value);}})
      .catch(()=>{if(!abort.signal.aborted)setFailed(true);});
    return()=>abort.abort();
  },[mode]);
  useEffect(()=>{
    if(!playing)return;
    let handle=0,start:number|undefined;const initial=progress;
    const tick=(now:number)=>{start??=now;const next=Math.min(1,initial+(now-start)/8000);setProgress(next);if(next===1)setPlaying(false);else handle=requestAnimationFrame(tick);};
    handle=requestAnimationFrame(tick);return()=>cancelAnimationFrame(handle);
  },[playing,mode]);
  if(!data)return <section className="cmd-force-demo"><p>{failed?'Loading-case recording could not load.':'Loading computed contact cases…'}</p></section>;
  const change=(next:Mode)=>{setPlaying(false);setProgress(0);setFailed(false);setData(cache.current[next]??null);setMode(next);};
  const frames=data.cases.map(p=>sample(p,mode,progress));
  return <section className="cmd-force-demo" aria-label="Three structures under normal, cyclic, and lateral loading">
    <div className="cmd-force-heading"><strong>One outer shape, three internal structures</strong><span>Newton VBD · prescribed loading</span></div>
    <div className="cmd-force-modes" role="group" aria-label="Loading case">{(['normal','cyclic','lateral'] as Mode[]).map(m=><button key={m} type="button" aria-pressed={mode===m} onClick={()=>change(m)}>{LABELS[m]}</button>)}</div>
    <p className="cmd-force-condition">{CONDITIONS[mode]} Platen friction μ = {data.metadata.friction}.</p>
    <div className="cmd-force-playback"><button type="button" onClick={()=>{if(progress===1)setProgress(0);setPlaying(!playing);}}>{playing?'Pause':'Play'}</button><button type="button" onClick={()=>{setPlaying(false);setProgress(0);}}>↶ Reset</button><input type="range" min="0" max="1000" value={Math.round(progress*1000)} aria-label="Loading case playback time" onChange={e=>{setPlaying(false);setProgress(Number(e.target.value)/1000);}}/><span>{frames[0].time.toFixed(2)} s</span></div>
    <div className="cmd-pad-grid cmd-three-structures">{data.cases.map((pad,i)=><div key={pad.kind} className="cmd-pad" style={{borderTopColor:COLORS[i]}}>
      <h4>{pad.name}</h4><Specimen pad={pad} frame={frames[i]} color={COLORS[i]}/><Patch frame={frames[i]} color={COLORS[i]}/>
      <dl className="cmd-pad-metrics"><div><dt>Normal force</dt><dd>{frames[i].force.toFixed(3)} N</dd></div><div><dt>Patch estimate</dt><dd>{frames[i].patch_area_mm2.toFixed(1)} mm²</dd></div><div><dt>Indentation</dt><dd>{(frames[i].indentation*1000).toFixed(2)} mm</dd></div>{mode==='lateral'&&<div><dt>Lateral reaction</dt><dd>{frames[i].lateral_force.toFixed(3)} N</dd></div>}</dl>
    </div>)}</div>
    <p className="cmd-structure-note">Top: computed deformation. Below: projected surface-contact estimate; dots mark active contact nodes. The faint outline is the undeformed 30 × 12 mm footprint.</p>
    {mode==='normal'&&data.cases.every(p=>p.drake_curve)&&<label className="cmd-drake-toggle"><input type="checkbox" checked={drake} onChange={e=>setDrake(e.target.checked)}/>Overlay Drake nominal-geometry contact</label>}
    <div className="cmd-chart-legend">{data.cases.map((p,i)=><span key={p.kind} style={{color:COLORS[i]}}>● {p.name}</span>)}<span>{mode==='lateral'?'Continuous: normal · dashed: lateral reaction':mode==='normal'&&drake?'Continuous: Newton · dashed: Drake':'Normal contact force'}</span></div>
    <Chart data={data} mode={mode} progress={progress} drake={drake}/>
    <p className="cmd-force-caption">Computed dynamics with prescribed platen motion. Patch area clips the boundary mesh at the contact plane and includes the 5 μm contact radius; it is a mesh-dependent estimate. Shapes interpolate recorded samples; patch geometry uses the nearest sample with a simplified outline.</p>
  </section>;
}
