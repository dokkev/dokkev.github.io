import { memo, useEffect, useRef, useState } from 'react';
import { renderToString } from 'katex';
import data from '../../lib/demos/data/wbc-task-comparison.json';

const svd=data.np.svd;
const clamp=(t:number)=>Math.max(0,Math.min(1,t));
const smooth=(t:number)=>t*t*t*(10+t*(-15+6*t));
const norm=(v:number[])=>Math.hypot(...v);
const matvec=(A:number[][],v:number[])=>A.map(row=>row.reduce((sum,x,j)=>sum+x*v[j],0));
const fmt=(x:number)=>Math.abs(x)<1e-8?'≈ 0':x.toFixed(3);
const names=['The 38D acceleration request','Express it in the SVD basis','Reconstruct the two components','Remove primary-changing coefficients','Pass the result through the primary task','Solve the hand task in 23 coordinates'];
const captions=[
  'This is the foot-consistent Talos reach request. Each bar is one generalized acceleration coordinate. It reaches the requested hand acceleration but also changes CoM acceleration.',
  'Use the actual SVD of P = [Jc; Jcom]. Vᵀ changes coordinates: 15 coefficients α lie in the row space of P; 23 coefficients β lie in ker P. Changing basis does not change the acceleration request.',
  'Reconstruct a∥ = Vr α and a₀ = V₀ β in the original 38 coordinates. Their sum is the original request. The two components are orthogonal in the chosen Euclidean coordinate metric.',
  'Shrink α to zero while keeping β unchanged. The surviving vector is V₀ β = V₀V₀ᵀ a_raw = Np a_raw. The hand output changes because some of the original request interfered with the primary task.',
  'Multiply the surviving vector by P. All 12 foot outputs and all 3 CoM outputs vanish to numerical precision. The displayed output components are evaluated from the current reconstructed acceleration.',
  'Solve minβ ‖Jh V₀ β − bh‖². Only the 23 green coefficients change; α stays zero. Hand tracking improves while the primary outputs remain zero. The resulting 33.4 rad/s² peak joint acceleration exceeds the ±10 bound of QP/HQP; this equality-only NP solve does not enforce it.',
];
const expressions=[
  String.raw`a_{\rm raw}\in\mathbb R^{38},\qquad P=\begin{bmatrix}J_c\\J_{\rm com}\end{bmatrix}\in\mathbb R^{15\times38}`,
  String.raw`P=U\Sigma V_r^T,\quad V=[V_r\;V_0],\quad V^Ta_{\rm raw}=\begin{bmatrix}\alpha_{15}\\\beta_{23}\end{bmatrix}`,
  String.raw`a_{\rm raw}=\underbrace{V_r\alpha}_{a_\parallel}+\underbrace{V_0\beta}_{a_0},\quad V_r^TV_0=0`,
  String.raw`\begin{bmatrix}\alpha\\\beta\end{bmatrix}\longrightarrow\begin{bmatrix}0\\\beta\end{bmatrix},\qquad N_p=V_0V_0^T=I-P^\dagger P`,
  String.raw`P(V_0\beta)=\underbrace{PV_0}_{0}\beta=0`,
  String.raw`\beta^*=(J_hV_0)^\dagger b_h,\qquad a^*=V_0\beta^*,\qquad Pa^*=0`,
];
const Formula=memo(({expression}:{expression:string})=><div className="nullspace-formula" dangerouslySetInnerHTML={{__html:renderToString(expression,{displayMode:true,throwOnError:true})}} />);
const coefficientScale=Math.max(...svd.alpha.map(Math.abs),...svd.beta.map(Math.abs),...svd.beta_solved.map(Math.abs),...data.np.raw_acceleration.map(Math.abs));

export default function WbcNullspaceSvdDemo(){
  const [step,setStep]=useState(0),[phase,setPhase]=useState(0);
  const live=useRef(0);
  useEffect(()=>{
    let frame=0,start:number|undefined;
    const from=live.current;
    const tick=(now:number)=>{start??=now;const t=clamp((now-start)/600);const value=from+(step-from)*smooth(t);live.current=value;setPhase(value);if(t<1)frame=requestAnimationFrame(tick);};
    frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
  },[step]);
  const basis=clamp(phase),remove=clamp(phase-2),solve=clamp(phase-4);
  const alpha=svd.alpha.map(v=>v*(1-remove));
  const beta=svd.beta.map((v,i)=>v+(svd.beta_solved[i]-v)*solve);
  const parallel=matvec(svd.Vr,alpha),nullPart=matvec(svd.V0,beta);
  const acceleration=parallel.map((v,i)=>v+nullPart[i]);
  const primary=matvec(svd.P,acceleration),hand=matvec(svd.Jh,acceleration);
  const footLinear=[...primary.slice(0,3),...primary.slice(6,9)];
  const footAngular=[...primary.slice(3,6),...primary.slice(9,12)];
  const original=[...svd.alpha,...svd.beta],coefficients=[...alpha,...beta];
  const reconstructOpacity=clamp(phase-1)*(1-clamp(phase-3));
  const outputsOpacity=clamp(phase-3);
  const strip=(values:number[],x:number,y:number,color:string)=>values.map((value,i)=><rect key={i} x={x+i*7} y={Math.min(y,y-value/coefficientScale*48)} width="5" height={Math.max(.7,Math.abs(value/coefficientScale*48))} fill={color}><title>Acceleration coordinate {i+1}: {value.toFixed(6)}</title></rect>);
  return <figure className="nullspace-demo wbc-task-comparison wbc-svd-demo">
    <div className="nullspace-heading"><strong>{step+1} / 6 · {names[step]}</strong><span>Talos SVD · rank 15 · nullity 23</span></div>
    <svg viewBox="0 0 660 425" role="img" aria-label={names[step]}>
      <g fill="#f6f8fa" stroke="#b9c6ce"><rect x="18" y="20" width="154" height="48" rx="6"/><rect x="250" y="20" width="155" height="48" rx="6"/><rect x="480" y="20" width="160" height="48" rx="6"/></g>
      <g fill="#253540" textAnchor="middle"><text x="95" y="50">a_raw · 38 × 1</text><text x="327" y="50">Vᵀ · 38 × 38</text><text x="560" y="50">[ α₁₅ ; β₂₃ ]</text><text x="210" y="50">→</text><text x="444" y="50">→</text></g>
      <text x="22" y="105" fill="#4c606b" opacity={1-basis}>Original generalized acceleration coordinates</text>
      <g opacity={basis}><text x="22" y="153" fill="#b74350">α · changes primary output</text><text x="285" y="153" fill="#16735e">β · preserves primary output</text></g>
      {coefficients.map((value,i)=>{
        const x0=22+i*16.2,x1=i<15?22+i*16:285+(i-15)*15.3;
        const x=x0+(x1-x0)*basis,y=165+55*basis;
        const v=data.np.raw_acceleration[i]*(1-basis)+value*basis;
        const height=Math.abs(v/coefficientScale*48);
        const color=basis<.5?'#2863b2':i<15?'#b74350':'#16735e';
        return <g key={i}><line x1={x} y1={y-52} x2={x} y2={y+52} stroke="#edf0f3"/><rect x={x} y={Math.min(y,y-v/coefficientScale*48)} width="11" height={Math.max(1,height)} fill={color}/><circle cx={x+5.5} cy={y} r="1.5" fill="#87939c"/><title>{basis<1?`Coordinate ${i+1}`:`${i<15?'α':'β'}${i<15?i+1:i-14}`}: {v.toFixed(6)}; original SVD coefficient {original[i].toFixed(6)}</title></g>;
      })}
      <g opacity={basis} fill="#4c606b"><text x="22" y="290">‖α‖ = {fmt(norm(alpha))}</text><text x="285" y="290">‖β‖ = {fmt(norm(beta))}</text></g>
      <g opacity={reconstructOpacity}>
        <text x="22" y="325" fill="#b74350">Vr α · 38 original coordinates</text><text x="350" y="325" fill="#16735e">V₀ β · 38 original coordinates</text>
        {strip(parallel,22,365,'#b74350')}{strip(nullPart,350,365,'#16735e')}
        <text x="310" y="368" fill="#253540">+</text>
        <text x="22" y="405" fill="#4c606b">Same coefficient scale throughout · sign is relative to the zero baseline</text>
      </g>
      <g opacity={outputsOpacity}>
        <text x="22" y="315" fill="#253540">P a · 12 foot components + 3 CoM components</text><g fill="#4c606b" style={{fontSize:12}}><text x="22" y="337">Left foot · linear, angular</text><text x="268" y="337">Right foot · linear, angular</text><text x="514" y="337">CoM · x, y, z</text></g>
        {primary.map((value,i)=><g key={i}><rect x={22+i*41} y="347" width="37" height="36" rx="3" fill={i<12?'#eef4fb':'#eaf5f0'} stroke="#c9d7df"/><text x={40+i*41} y="370" textAnchor="middle" fill="#253540" style={{fontSize:12}}>{Math.abs(value)<1e-8?'0':value.toFixed(1)}</text></g>)}
        <text x="22" y="403" fill="#16735e">Hand residual ‖Jh a − bh‖ = {fmt(norm(hand.map((v,i)=>v-data.metadata.hand_acceleration[i])))} m/s²</text>
      </g>
    </svg>
    <Formula expression={expressions[step]}/>
    <div className="wbc-task-metrics wbc-svd-metrics"><span>Max foot linear acceleration<strong>{fmt(Math.max(...footLinear.map(Math.abs)))} m/s²</strong></span><span>Max foot angular acceleration<strong>{fmt(Math.max(...footAngular.map(Math.abs)))} rad/s²</strong></span><span>CoM acceleration norm<strong>{fmt(norm(primary.slice(12)))} m/s²</strong></span><span>Hand acceleration residual<strong>{fmt(norm(hand.map((v,i)=>v-data.metadata.hand_acceleration[i])))} m/s²</strong></span></div>
    <figcaption>{captions[step]} SVD bars are basis coefficients, not individual joint commands; the coordinate metric and scale are fixed for this example.</figcaption>
    <div className="nullspace-controls"><button type="button" disabled={step===0} onClick={()=>setStep(s=>s-1)}>← Previous</button><button type="button" disabled={step===5} onClick={()=>setStep(s=>s+1)}>Next step →</button></div>
  </figure>;
}
