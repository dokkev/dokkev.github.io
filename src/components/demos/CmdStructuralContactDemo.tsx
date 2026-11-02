import { useEffect, useRef, useState } from 'react';

type Mode='normal'|'cyclic'|'lateral';
type Frame={time:number;indentation:number;lateral_displacement:number;force:number;lateral_force:number;patch_area_mm2:number;contact_patch:number[][][];contact_nodes:number[][];contact_faces:number[][];contact_area_mm2:number;partial_contact_faces:number;front_positions:number[][]};
type Pad={name:string;kind:'hybrid'|'compliant'|'solid';carrier_polygon:number[][];rest_front:number[][];front_faces:number[][];runs:Record<Mode,{duration:number;frames:Frame[]}>};
type Recording={metadata:{friction:number;sample_period:number};cases:Pad[]};
const COLORS=['#17695b','#b35b2b','#4e61a8'];
const LABELS:Record<Mode,string>={normal:'Normal load',cyclic:'Cyclic load',lateral:'Lateral load'};
const CONDITIONS:Record<Mode,string>={normal:'Smooth normal indentation: 0 → 2.4 mm.',cyclic:'Two normal loading cycles: 0 → 2.4 → 0 mm, with a 2 s period.',lateral:'Preload to 1.5 mm, then translate the platen 3 mm sideways at fixed indentation.'};
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
function sample(pad:Pad,mode:Mode,progress:number):Frame {
  const frames=pad.runs[mode].frames;
  return frames[Math.round(clamp(progress)*(frames.length-1))];
}
function Specimen({pad,frame,color}:{pad:Pad;frame:Frame;color:string}) {
  const xy=([x,z]:number[])=>[150+x*7,65+z*7];
  const poly=(face:number[],positions:number[][])=>face.map(i=>xy(positions[i]).join(',')).join(' ');
  const bottom=65+(14.005-frame.indentation*1000)*7,shift=frame.lateral_displacement*7000;
  // Union the x projections of the same triangles drawn in the top view.
  const intervals=frame.contact_faces.map(face=>{
    const x=face.map(j=>frame.contact_nodes[j][0]);
    return [Math.min(...x),Math.max(...x)];
  }).sort((a,b)=>a[0]-b[0]);
  const contactSpans:number[][]=[];
  for(const [lo,hi] of intervals){
    const last=contactSpans[contactSpans.length-1];
    if(last&&lo<=last[1]+1e-6)last[1]=Math.max(last[1],hi);
    else contactSpans.push([lo,hi]);
  }
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
    <g aria-label="Contact-region projection onto the platen, front view">
      {contactSpans.map(([lo,hi],i)=><g key={i}>
        <path d={`M${150+lo*7} ${bottom}H${150+hi*7}`} stroke="#fff" strokeWidth="6"/>
        <path d={`M${150+lo*7} ${bottom}H${150+hi*7}`} stroke="#d49a16" strokeWidth="3.5"><title>Contact-region front projection: {lo.toFixed(2)} to {hi.toFixed(2)} mm</title></path>
      </g>)}
    </g>
    <path d="M35 192H53" stroke="#d49a16" strokeWidth="3.5"/>
    <text x="60" y="196">Contact region · front projection</text>
  </svg>;
}
// Fixed across all structures and loading cases; recorded nodal forces peak below 0.03 N.
const CONTACT_FORCE_MAX=.03;
function Patch({frame,color}:{frame:Frame;color:string}) {
  return <svg className="cmd-contact-patch" viewBox="0 0 300 165" role="img" aria-label={`Reconstructed VBD contact surface: ${frame.contact_faces.length} active triangles, ${frame.contact_area_mm2.toFixed(1)} square millimeters at ${frame.time.toFixed(2)} seconds`}>
    <text x="150" y="17" textAnchor="middle">VBD contact region · top view</text>
    <rect x="45" y="40" width="210" height="84" fill="#f4f6f4" stroke="#aab5ad" strokeDasharray="3 3"/>
    {frame.contact_nodes.length===0&&<text x="150" y="87" textAnchor="middle">No active contact</text>}
    {frame.contact_faces.map((face,i)=>{
      const force=face.reduce((sum,j)=>sum+frame.contact_nodes[j][2],0)/3;
      const points=face.map(j=>`${150+frame.contact_nodes[j][0]*7},${82+frame.contact_nodes[j][1]*7}`).join(' ');
      return <polygon key={`face${i}`} points={points} fill={color} fillOpacity={.15+.85*clamp(force/CONTACT_FORCE_MAX)}><title>Active surface triangle; mean nodal normal force {force.toFixed(6)} N</title></polygon>;
    })}
    {frame.contact_nodes.map(([x,y,f],i)=><circle key={i} cx={150+x*7} cy={82+y*7} r=".7" fill="#263d32" fillOpacity=".5"><title>Active node: ({x.toFixed(3)}, {y.toFixed(3)}) mm; normal force {f.toFixed(6)} N</title></circle>)}
    {frame.contact_nodes.length>0&&frame.contact_faces.length===0&&<text x="150" y="33" textAnchor="middle">Contacts present; no fully active face</text>}
    {[0,.5,1].map((v,i)=><g key={v}><circle cx={49+i*78} cy="145" r="3" fill={color} fillOpacity={.15+.85*v}/><text x={57+i*78} y="149">{(v*CONTACT_FORCE_MAX).toFixed(3)} N</text></g>)}
  </svg>;
}
function Chart({data,mode,progress}:{data:Recording;mode:Mode;progress:number}) {
  const coordinate=(f:Frame)=>mode==='normal'?f.indentation*1000:mode==='lateral'?f.lateral_displacement*1000:f.time;
  const xmax=mode==='normal'?2.4:mode==='lateral'?3:4;
  const values=data.cases.flatMap(p=>p.runs[mode].frames.flatMap(f=>mode==='lateral'?[f.force,f.lateral_force]:[f.force]));
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
        <circle cx={x(coordinate(f))} cy={y(f.force)} r="4" fill={COLORS[i]}/>
        {mode==='lateral'&&<circle cx={x(coordinate(f))} cy={y(f.lateral_force)} r="3" fill={COLORS[i]}/>}
      </g>;
    })}
  </svg>;
}
export default function CmdStructuralContactDemo() {
  const [data,setData]=useState<Recording|null>(null),[failed,setFailed]=useState(false);
  const cache=useRef<Partial<Record<Mode,Recording>>>({});
  const [mode,setMode]=useState<Mode>('normal');
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
      <dl className="cmd-pad-metrics"><div><dt>Normal force</dt><dd>{frames[i].force.toFixed(3)} N</dd></div><div><dt>Contact region</dt><dd>{frames[i].contact_area_mm2.toFixed(1)} mm²</dd></div><div><dt>Indentation</dt><dd>{(frames[i].indentation*1000).toFixed(2)} mm</dd></div>{mode==='lateral'&&<div><dt>Lateral reaction</dt><dd>{frames[i].lateral_force.toFixed(3)} N</dd></div>}</dl>
    </div>)}</div>
    <p className="cmd-structure-note">Gold on the upper animation marks the contact region projected onto the platen in front view. Below: the same reconstructed VBD contact surface, viewed from above. Filled triangles retain the original surface mesh and have three force-bearing contact vertices. Dots show all active contact nodes. Fill intensity encodes mean nodal normal force on the same 0–0.030 N scale in every case; it is not pressure.</p>
    <div className="cmd-chart-legend">{data.cases.map((p,i)=><span key={p.kind} style={{color:COLORS[i]}}>● {p.name}</span>)}<span>{mode==='lateral'?'Continuous: normal · dashed: lateral reaction':'Normal contact force'}</span></div>
    <Chart data={data} mode={mode} progress={progress}/>
    <p className="cmd-force-caption">Each view uses the same recorded state, sampled every 0.05 s. Nodal normal forces are reconstructed from Newton contact records using the solver’s penalty stiffness and penetration depth, then accumulated at mesh nodes. Contact-region area sums the projected fully active triangles. Boundary triangles with only one or two active vertices remain unfilled, so the boundary is mesh-dependent. The dashed outline is the undeformed 30 × 12 mm footprint.</p>
  </section>;
}
