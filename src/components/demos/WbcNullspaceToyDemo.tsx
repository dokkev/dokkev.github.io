import { memo, useEffect, useRef, useState } from 'react';
import { renderToString } from 'katex';
import WbcNullspaceSpaceScene from './WbcNullspaceSpaceScene';
import { samplePlanarTrajectory } from '../../lib/demos/planarArmMath';
import data from '../../lib/demos/data/wbc-nullspace-toy.json';

const clamp=(t:number)=>Math.max(0,Math.min(1,t));
const smooth=(t:number)=>t*t*t*(10+t*(-15+6*t));
const degrees=(r:number)=>(r*180/Math.PI).toFixed(1);
const names=['Keep the endpoint here','Filter the posture command','Move the joints, preserve the endpoint','Compare what each task achieved'];
const captions=[
  'A planar arm has three joint velocities and a two-coordinate endpoint task. Away from singularities, one local motion direction remains available while the endpoint stays fixed. The secondary task bends joint 3 toward −120.3°. A smooth speed envelope starts and ends the motion at rest.',
  'The 3D axes are joint velocities, not Cartesian position. The green line is ker J; the blue plane is row(J). The request z projects orthogonally onto the green line. The red vector lies in the blue plane; its translated dashed connector is perpendicular to Nz. Vectors are shown before the common speed envelope c(t).',
  'Both arms follow the same posture reference over three seconds of computed time, with zero velocity at both endpoints. The right arm recomputes J(q) and N(q) continuously. The target marker is fixed, but the displayed endpoint comes from forward kinematics; it is never pinned to the marker.',
  'The unfiltered arm approaches the posture target but moves its endpoint. The projected arm preserves the endpoint and makes a smaller posture change. The plot shows joint motion in configuration space through its effect on the robot, not a 2D drawing of the null space.',
];
const formulas=[
  String.raw`p(q)\in\mathbb R^2,\quad J(q)\in\mathbb R^{2\times3},\quad \underbrace{J(q)\dot q=0}_{\text{hold endpoint position}}`,
  String.raw`z=\begin{bmatrix}0\\0\\2(q_{3,d}-q_3)\end{bmatrix},\quad N=I-J^\dagger J,\quad Nz\in\ker J`,
  String.raw`\dot q(t)=c(t)N(q(t))z(q(t)),\qquad \frac{d}{dt}p(q(t))=J(q(t))\dot q(t)=0`,
  String.raw`\text{Primary: }p(q)=p_0,\qquad \text{secondary: reduce }q_{3,d}-q_3`,
];
const Formula=memo(({expression}:{expression:string})=><div className="nullspace-formula" dangerouslySetInnerHTML={{__html:renderToString(expression,{displayMode:true,throwOnError:true})}} />);
const formatVector=(v:number[])=>`(${v.map(x=>Math.abs(x)<1e-9?'0':x.toFixed(2)).join(', ')})`;

export default function WbcNullspaceToyDemo(){
  const [step,setStep]=useState(0),[phase,setPhase]=useState(0);
  const live=useRef(0);
  useEffect(()=>{
    let frame=0,start:number|undefined;
    const from=live.current;
    const crossesMotion=Math.min(from,step)<2&&Math.max(from,step)>1;
    const transitionMs=crossesMotion?2400:600;
    const tick=(now:number)=>{start??=now;const t=clamp((now-start)/transitionMs);const value=from+(step-from)*smooth(t);live.current=value;setPhase(value);if(t<1)frame=requestAnimationFrame(tick);};
    frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
  },[step]);
  const motion=clamp(phase-1), time=motion*data.duration;
  const projected=samplePlanarTrajectory(data.projected.frames,time,data.target);
  const panels=[{name:'Without projection',color:'#b74350',trajectory:data.raw,x:0},{name:'With null-space projection',color:'#16735e',trajectory:data.projected,x:330}];
  return <figure className="nullspace-demo wbc-task-comparison wbc-toy-demo">
    <div className="nullspace-heading"><strong>{step+1} / 4 · {names[step]}</strong><span>3-link planar arm · position task</span></div>
    <div className="nullspace-controls wbc-toy-controls"><button type="button" disabled={step===0} onClick={()=>setStep(s=>s-1)}>← Previous</button><button type="button" disabled={step===3} onClick={()=>setStep(s=>s+1)}>Next step →</button></div>
    <svg viewBox="0 0 660 405" role="img" aria-label="Two three-link arms compare a direct posture command with a null-space command that keeps the endpoint fixed">
      {panels.map(({name,color,trajectory,x},panel)=>{
        const current=samplePlanarTrajectory(trajectory.frames,time,data.target), initial=trajectory.frames[0];
        const index=Math.min(trajectory.frames.length-1,Math.floor(time/.02));
        const map=(p:number[])=>[x+38+p[0]*120,310-p[1]*120];
        const target=map(data.target), tip=map(current.points[3]);
        const trace=trajectory.frames.slice(0,index+1).map((f,i)=>`${i?'L':'M'}${map(f.points[3]).join(',')}`).join(' ');
        return <g key={name}>
          <rect x={x+8} y="40" width="312" height="315" rx="8" fill="#fafcfd" stroke="#d8e1e7"/>
          <text x={x+22} y="67" fill={color}>{name}</text>
          <path d={`M${x+22} 314 H${x+298}`} stroke="#ced7dc"/>
          <polyline points={initial.points.map(p=>map(p).join(',')).join(' ')} fill="none" stroke="#ccd5db" strokeWidth="7" strokeLinecap="round"/>
          <path d={trace} fill="none" stroke={color} strokeWidth="2" strokeDasharray="4 3"/>
          <circle cx={target[0]} cy={target[1]} r="10" fill="none" stroke="#2863b2" strokeWidth="2"/>
          <path d={`M${target[0]-15} ${target[1]}h30 M${target[0]} ${target[1]-15}v30`} stroke="#2863b2" strokeWidth="1"/>
          <polyline points={current.points.map(p=>map(p).join(',')).join(' ')} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"/>
          {current.points.map((p,i)=>{const at=map(p);return <g key={i}><circle cx={at[0]} cy={at[1]} r={i===3?5:7} fill="white" stroke={color} strokeWidth="2"/>{i<3&&<text x={at[0]+11} y={i===0?at[1]-12:at[1]+17} fill="#455760" style={{fontSize:12}}>q{i+1}</text>}</g>;})}
          <text x={x+22} y="96" fill="#455760">q₃ = {degrees(current.q[2])}°</text>
          <text x={x+22} y="339" fill={color}>Endpoint error: {(current.tip_error*1000).toFixed(3)} mm</text>
          {step===1 && <g>
            {panel===0?<><line x1={tip[0]} y1={tip[1]} x2={tip[0]+data.initial_tip_velocity[0]*70} y2={tip[1]-data.initial_tip_velocity[1]*70} stroke={color} strokeWidth="3"/><text x={x+190} y="265" fill={color}>Jz ≠ 0</text></>:<text x={x+190} y="265" fill={color}>JNz = 0</text>}
          </g>}
          <text x={x+22} y="385" fill={color} style={{fontSize:13}}>{panel===0?`Initial z [rad/s] = ${formatVector(data.initial_z)}`:`Initial Nz [rad/s] = ${formatVector(data.initial_allowed)}`}</text>
        </g>;
      })}
      <text x="22" y="22" fill="#455760">Blue crosshair: fixed primary target · faint links: starting posture</text>
    </svg>
    <div className="wbc-space-heading"><strong>Null-space projection in joint-velocity space</strong><span>q̇₁, q̇₂, q̇₃ [rad/s] · Euclidean metric</span></div>
    <WbcNullspaceSpaceScene q={projected.q} projection={clamp(phase)} />
    <div className="wbc-space-legend"><span>Orange: request z</span><span>Green: Nz and ker J</span><span>Blue plane: row(J)</span><span>Red: (I − N)z</span></div>
    <p className="wbc-space-note">J and its spaces follow the right-hand robot's current pose. Arrows show z and Nz before the scalar speed envelope c(t). This is ℝ³ of joint velocities, not SE(3) pose space.</p>
    <Formula expression={formulas[step]}/>
    <div className="wbc-task-metrics"><span>Computed time<strong>{(motion*data.duration).toFixed(2)} / {data.duration.toFixed(1)} s</strong></span><span>Projected endpoint speed<strong>{projected.tip_speed.toFixed(6)} m/s</strong></span><span>Projected q₃ goal error<strong>{degrees(Math.abs(data.q3_goal-projected.q[2]))}°</strong></span></div>
    <figcaption>{captions[step]} Links are 1.0, 0.8, and 0.6 m. The calculation uses RK4 at 5 ms with no endpoint correction; maximum projected endpoint drift is below 10⁻⁸ m. The robot motion replays over 2.4 seconds; navigation stays available throughout.</figcaption>
  </figure>;
}
