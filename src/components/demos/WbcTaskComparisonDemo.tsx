import { memo, useEffect, useId, useState } from 'react';
import { renderToString } from 'katex';
import data from '../../lib/demos/data/wbc-task-comparison.json';
import WbcMeshScene from './WbcMeshScene';

type Method = 'qp' | 'hqp';
const norm = (v: number[]) => Math.hypot(...v);
const number = (v: number) => Math.abs(v) < 1e-5 ? '≈ 0' : v.toFixed(3);
const titles = {
  qp: ['Talos tracking cost', 'Feasible dynamics, torques, and point forces', 'The weighted QP solution'],
  hqp: ['Level 1 · hold CoM acceleration', 'Level 2 · reach while preserving level 1', 'Level 3 · posture while preserving both'],
};
const captions = {
  qp: [
    'These are contours of the actual Talos tracking cost on an affine two-dimensional slice of the 94-variable problem. The axes are slice coordinates u and v, not Cartesian robot coordinates. Curves connect commands with the same tracking cost.',
    'Every point in this plane satisfies floating-base dynamics and the two stationary-foot equalities. The blue polygon adds the actual torque, actuated-acceleration, and point-force inequalities. The rectangular plot window only crops the display.',
    'Expand the cost sublevel set until it touches the feasible polygon at the full weighted-QP solution (u=1, v=0). The hand gains a little acceleration by accepting nonzero CoM acceleration. The solve used all 94 variables; this picture is a slice, not a reduced two-variable controller.',
  ],
  hqp: [
    'First minimize the three-component CoM acceleration residual under the same dynamics and inequalities as QP. The hand is not an objective at this level. The displayed snapshot has zero initial velocity, so acceleration drift is zero.',
    'Next minimize the three-component hand residual while fixing Jcom a to the previous level’s achieved value. The CoM output remains unchanged to numerical tolerance; the remaining hand error is accepted.',
    'Finally minimize the scaled joint-posture acceleration residual while fixing both achieved task outputs. At this saturated snapshot the available freedom does not materially improve posture. All levels retain the common physical constraints.',
  ],
};
const formulas = {
  qp: [String.raw`\frac12\left(100\|J_{\rm com}a\|^2+\|J_ha-b_h\|^2+0.01\|Sa/10\|^2\right)`, String.raw`Ma+h=S^T\tau+J_c^TFf,\quad J_ca=0,\quad Gy\le g`, String.raw`y^*\in\arg\min_{y\in\mathcal F}f(y),\quad y=\begin{bmatrix}a_{38}\\\tau_{32}\\f_{24}\end{bmatrix}`],
  hqp: [String.raw`y_1\in\arg\min_{y\in\mathcal F}\|J_{\rm com}a\|^2`, String.raw`\min_{y\in\mathcal F}\|J_ha-b_h\|^2,\quad J_{\rm com}a=J_{\rm com}a_1`, String.raw`\min_{y\in\mathcal F}\|Sa/10\|^2,\quad \begin{bmatrix}J_{\rm com}\\J_h\end{bmatrix}a=\begin{bmatrix}J_{\rm com}a_1\\J_ha_2\end{bmatrix}`],
};
const Formula = memo(({expression}: {expression: string}) => <div className="nullspace-formula" dangerouslySetInnerHTML={{__html:renderToString(expression,{displayMode:true,throwOnError:true})}} />);

export function WbcTaskSnapshot() {
  return <figure className="wbc-task-snapshot"><WbcMeshScene frame={data.frame} goal={data.frame.hand_target} /><figcaption>One frozen Talos state: half-sitting, v = 0, both soles fixed. A hand target 0.30 m forward with Kp = 100 s⁻² requests 30 m/s². Mesh pose is fixed; support arrows show the weighted-QP result. This is one control update, not a trajectory or a stability demonstration.</figcaption></figure>;
}

export default function WbcTaskComparisonDemo({method}: {method: Method}) {
  const id=useId().replace(/:/g,'');
  const [step,setStep]=useState(0), [progress,setProgress]=useState(1);
  const initialOutput=method==='qp'?data.qp:data.hqp[0];
  const [from,setFrom]=useState({com:initialOutput.com,hand:initialOutput.hand});
  useEffect(()=>{
    let frame=0,start:number|undefined;
    const initial=progress;
    const tick=(now:number)=>{start??=now; const next=Math.min(1,initial+(now-start)/600); setProgress(next); if(next<1)frame=requestAnimationFrame(tick);};
    frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
  },[step]);
  const t=progress**3*(10+progress*(-15+6*progress));
  const selected=method==='qp' ? data.qp : data.hqp[step];
  const com=selected.com.map((n,i)=>from.com[i]+(n-from.com[i])*t);
  const hand=selected.hand.map((n,i)=>from.hand[i]+(n-from.hand[i])*t);
  const changeStep=(next:number)=>{setFrom({com,hand});setProgress(0);setStep(next);};
  const plot=(p:number[])=>[140+(p[0]+.4)*165,350-(p[1]+.4)*140];
  const path=(points:number[][])=>points.map((p,i)=>`${i?'L':'M'}${plot(p).join(',')}`).join(' ')+' Z';
  const H=data.slice.H, L11=Math.sqrt(H[0][0]), L21=H[1][0]/L11,L22=Math.sqrt(H[1][1]-L21*L21);
  const ellipse=(level:number)=>Array.from({length:180},(_,i)=>{const theta=2*Math.PI*i/179,s=Math.sqrt(2*level);const y=s*Math.sin(theta)/L22,x=(s*Math.cos(theta)-L21*y)/L11;return [data.slice.center[0]+x,data.slice.center[1]+y];});
  return <figure className="nullspace-demo wbc-task-comparison">
    <div className="nullspace-heading"><strong>{step+1} / 3 · {titles[method][step]}</strong><span>Talos · one computed control update</span></div>
    {method==='qp' && <svg viewBox="0 0 660 410" role="img" aria-label="Cost contours and feasible polygon on an affine slice of the actual 94-variable Talos QP">
      <defs><clipPath id={id}><rect x="140" y="45" width="363" height="305" /></clipPath></defs>
      <g clipPath={`url(#${id})`}>
        {step>=1 && <path d={path(data.slice.polygon)} fill="#2863b2" fillOpacity={.15*(step===1?t:1)} stroke="#2863b2" strokeWidth="2" />}
        {data.slice.contours.map((points,i)=><path key={i} d={path(points)} fill="none" stroke="#b56617" strokeOpacity=".35" />)}
        {step===2 && <path d={path(ellipse(data.slice.optimal_level*t))} fill="#b56617" fillOpacity=".06" stroke="#b56617" strokeWidth="3" />}
      </g>
      <path d="M140 350 H503 M140 350 V45" stroke="#89949b" fill="none" />
      <text x="165" y="380">u · slice coordinate</text><text x="145" y="25">v · slice coordinate</text>
      {[-.4,0,.5,1,1.4,1.8].map(n=><g key={n}><text x={plot([n,0])[0]-8} y="369">{n}</text><text x="105" y={plot([0,n])[1]+5}>{n}</text></g>)}
      {[[0,0],[1,0]].map((p,i)=><g key={i} opacity={step===0?.45:1}><circle cx={plot(p)[0]} cy={plot(p)[1]} r="5" fill={i===1?'#16735e':'#2863b2'} /><text x={plot(p)[0]+10} y={plot(p)[1]-10}>{['static','QP optimum',''][i]}</text></g>)}
      <text x="520" y="120" fill="#b56617">same cost</text><text x="520" y="145" fill="#b56617">on each curve</text>
      {step>=1 && <><text x="520" y="230" fill="#2863b2">feasible</text><text x="520" y="253" fill="#2863b2">slice</text></>}
    </svg>}
    {method==='hqp' && <div className="wbc-hqp-levels">{data.hqp.map((result,i)=><div key={i} className={step===i?'active':''}><strong>Level {i+1} · {['CoM','Hand','Posture'][i]}</strong><span>CoM residual: {number(norm(result.com))} m/s²</span><span>Hand residual: {result.hand_error.toFixed(3)} m/s²</span><span>{i===0?'Common physical constraints':i===1?'Preserve all 3 CoM outputs':'Preserve CoM + all 3 hand outputs'}</span></div>)}</div>}
    <Formula expression={formulas[method][step]} />
    <div className="wbc-task-metrics"><span>‖CoM acceleration‖ <strong>{number(norm(com))} m/s²</strong></span><span>Hand-x acceleration <strong>{number(hand[0])} / 30 m/s²</strong></span><span>Peak torque / URDF limit<strong>{`${(100*(method==='qp'?data.qp:data.hqp[step]).torque_ratio).toFixed(1)}%`}</strong></span></div>
    <figcaption>{captions[method][step]} Displayed values are rounded; calculations use full precision.</figcaption>
    <div className="nullspace-controls">
      <button type="button" disabled={step===0} onClick={()=>changeStep(step-1)}>← Previous</button>
      <button type="button" disabled={step===2} onClick={()=>changeStep(step+1)}>Next step →</button>
    </div>
  </figure>;
}
