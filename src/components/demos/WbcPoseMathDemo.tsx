import { memo, useEffect, useState } from "react";
import { renderToString } from "katex";

type Vector = number[];
type Matrix = number[][];
const rad = (degrees: number) => degrees * Math.PI / 180;
const rot = (a: number): Matrix => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
const transpose = (A: Matrix) => A[0].map((_, i) => A.map((row) => row[i]));
const multiply = (A: Matrix, v: Vector) => A.map((row) => row.reduce((sum, value, i) => sum + value * v[i], 0));
const transform = (R: Matrix, p: Vector) => [...R.map((row, i) => [...row, p[i]]), [0, 0, 0, 1]];
const fmt = (n: number) => (Math.abs(n) < .0005 ? 0 : n).toFixed(3);
const titles = ["7 values → pose", "Desired − current", "Pose → 6D error", "Express error for the task", "PD feedback → acceleration"];
const captions = [
  "The reference stores position and a unit quaternion. Position moves into the last column. With qx = qy = 0, substitute qz and qw into the four nontrivial rotation entries; the other entries are 0 or 1. Displayed coefficients are rounded, but calculations use full precision. The 4×4 transform represents the same desired pose in SE(3); it is not a 7D error vector.",
  "First subtract current position from desired position in world coordinates. Then rotate this displacement into hand coordinates with R_Hᵀ. Orientation error uses the relative rotation R_HᵀR_d, followed by log₃; rotation-matrix entries are not subtracted.",
  "Extract relative translation and apply log₃ to relative rotation. The output has three position-error entries in metres and three angular-error entries in radians. This is the split error used in the article, not the full log₆.",
  "The task uses world-aligned axes. Rotate both three-component error blocks by the current R_H. This changes their coordinates, not the desired pose.",
  "The P term requests acceleration from pose error. The D term uses desired minus current task velocity, so motion toward a stationary target reduces the acceleration request. Here Kp = [40,40,40,10,10,10] s⁻² and Kd = [8,8,8,4,4,4] s⁻¹. Add both terms and reference acceleration to obtain a*. These are illustrative gains, not a tuning recommendation.",
];

const Formula = memo(function Formula({expression, className = ''}: {expression:string; className?:string}) {
  return <div className={`pose-pipeline-latex ${className}`} dangerouslySetInnerHTML={{__html:renderToString(expression, {displayMode:true, throwOnError:true, trust:false})}} />;
});
// Manim's smooth timing: zero first and second derivatives at both endpoints.
const smooth = (t:number) => t*t*t*(10+t*(-15+6*t));
const lerp = (a:number,b:number,t:number) => a+(b-a)*t;

export default function WbcPoseMathDemo() {
  const [time, setTime] = useState(0);
  const [step, setStep] = useState(0);
  const stageStart = [0,16,24,32,40][step];
  const stageDuration = step===0 || step===4 ? 16 : 8;
  const progress = (time-stageStart)/stageDuration;
  const [playing, setPlaying] = useState(false);
  const goalYaw = 75, goalX = .4;
  const R = rot(rad(30));
  const qz = Math.sin(rad(goalYaw) / 2), qw = Math.cos(rad(goalYaw) / 2);
  // Convert the stored yaw-only quaternion (0, 0, qz, qw) to R_d.
  const Rd = [[1 - 2*qz*qz, -2*qz*qw, 0], [2*qz*qw, 1 - 2*qz*qz, 0], [0, 0, 1]];
  const p = [.1, -.05, .2], pd = [goalX, .2, .35];
  const displacement = pd.map((v, i) => v - p[i]);
  const relativePosition = multiply(transpose(R), displacement);
  const relativeRotation = transpose(transpose(Rd).map((column) => multiply(transpose(R), column)));
  // All relative rotations in this example are about z and strictly within (-pi, pi).
  const localError = [...relativePosition, 0, 0, Math.atan2(relativeRotation[1][0], relativeRotation[0][0])];
  const error = [...multiply(R, localError.slice(0, 3)), ...multiply(R, localError.slice(3))];
  const kp = [40,40,40,10,10,10], kd = [8,8,8,4,4,4];
  const desiredVelocity = [0,0,0,0,0,0];
  const currentVelocity = [.05,.02,0,0,0,.1];
  const velocityError = desiredVelocity.map((value,i)=>value-currentVelocity[i]);
  const proportional = error.map((value,i)=>kp[i]*value);
  const derivative = velocityError.map((value,i)=>kd[i]*value);
  const referenceAcceleration = [0,0,0,0,0,0];
  const acceleration = proportional.map((value,i)=>value+derivative[i]+referenceAcceleration[i]);
  const poseVector = [...pd, 0, 0, qz, qw];
  const relative = transform(relativeRotation, relativePosition);
  const formulas = [
    String.raw`(p_d,\,\mathrm{quaternion}_d)\;\longrightarrow\;T_d=\begin{bmatrix}R_d&p_d\\0&1\end{bmatrix}\in SE(3)`,
    String.raw`d_W=\underbrace{p_d}_{\text{desired}}-\underbrace{p_H}_{\text{current}},\qquad p_{\mathrm{rel}}=R_H^Td_W,\quad R_{\mathrm{rel}}=R_H^TR_d`,
    String.raw`e_H=\begin{bmatrix}p_{\mathrm{rel}}\\\operatorname{log}_3(R_{\mathrm{rel}})\end{bmatrix}\in\mathbb R^6`,
    String.raw`e_W=\underbrace{\begin{bmatrix}R_H&0\\0&R_H\end{bmatrix}}_{\text{same origin, world-aligned axes}}e_H`,
    String.raw`a^*=a_{\mathrm{ref}}+K_p e_W+K_d e_v`,
  ];
  const latexMatrix = (values: Matrix) => String.raw`\begin{bmatrix}` + values.map((row) => row.map(fmt).join(' & ')).join(String.raw` \\ `) + String.raw`\end{bmatrix}`;
  const changeAxes = Array.from({length:6}, (_, i) => Array.from({length:6}, (_, j) => Math.floor(i/3) === Math.floor(j/3) ? R[i%3][j%3] : 0));
  const numericalTransform = [
    String.raw`R(q)=\begin{bmatrix}1-2(q_y^2+q_z^2)&2(q_xq_y-q_zq_w)&2(q_xq_z+q_yq_w)\\2(q_xq_y+q_zq_w)&1-2(q_x^2+q_z^2)&2(q_yq_z-q_xq_w)\\2(q_xq_z-q_yq_w)&2(q_yq_z+q_xq_w)&1-2(q_x^2+q_y^2)\end{bmatrix},\quad\lVert q\rVert=1`,
    String.raw`\begin{aligned}d_W&=\underbrace{${latexMatrix(pd.map(v=>[v]))}}_{\text{desired}}-\underbrace{${latexMatrix(p.map(v=>[v]))}}_{\text{current}}=${latexMatrix(displacement.map(v=>[v]))}\\p_{\mathrm{rel}}&=${latexMatrix(transpose(R))}\,${latexMatrix(displacement.map(v=>[v]))}=${latexMatrix(relativePosition.map(v=>[v]))}\end{aligned}`,
    String.raw`\underbrace{${latexMatrix(relative)}}_{T_{\mathrm{rel}}}\;\xrightarrow{\text{split error}}\;\underbrace{${latexMatrix(localError.map(v=>[v]))}}_{e_H}`,
    String.raw`\underbrace{${latexMatrix(changeAxes)}}_{\operatorname{diag}(R_H,R_H)}\;\underbrace{${latexMatrix(localError.map(v=>[v]))}}_{e_H}=\underbrace{${latexMatrix(error.map(v=>[v]))}}_{e_W}`,
    String.raw`\underbrace{${latexMatrix(proportional.map(v=>[v]))}}_{K_pe_W}+\underbrace{${latexMatrix(derivative.map(v=>[v]))}}_{K_de_v}+\underbrace{${latexMatrix(referenceAcceleration.map(v=>[v]))}}_{a_{\mathrm{ref}}}=\underbrace{${latexMatrix(acceleration.map(v=>[v]))}}_{a^*}`,
  ][step];
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let start: number | undefined;
    const initial = time;
    const tick = (now: number) => {
      start ??= now;
      const end = stageStart + stageDuration;
      const next = Math.min(end, initial + (now - start) / 1000);
      setTime(next);
      if (next < end) frame = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, step]);
  const ease = (from:number,to:number) => smooth(Math.max(0,Math.min(1,(progress-from)/(to-from))));
  const relocate = ease(.04,.23), move = ease(.30,.75);
  // Every stage starts exactly where the previous one finished. Tokens keep
  // their React keys, including through matrix/vector layout changes.
  const matrixX = (col:number) => 340 + col*76 - 260*relocate + 260*move;
  const vectorX = 500 - 370*relocate + 370*move;
  const vectorY = (row:number) => 80+row*32;
  const sourceP = step === 0 ? pd : step === 1 || step === 2 ? relativePosition : step === 3 ? error.slice(0,3) : acceleration.slice(0,3);
  const oldP = step <= 1 ? pd : step === 2 || step === 3 ? relativePosition : error.slice(0,3);
  const pX = step === 0 ? lerp(125,568,ease(.04,.22)) : step === 1 ? lerp(lerp(568,150,relocate),568,ease(.66,.90)) : step === 2 ? lerp(568-260*relocate,500,move) : step===4 ? lerp(500,75,ease(.04,.20)) : vectorX;
  const pY = (i:number) => step === 0 ? lerp(80+i*30,95+i*40,ease(.04,.22)) : step === 1 ? lerp(lerp(95+i*40,vectorY(i),relocate),95+i*40,ease(.66,.90)) : step === 2 ? lerp(95+i*40,vectorY(i),move) : vectorY(i);
  const rotationOpacity = step === 0 ? 1 : step === 1 ? (1-ease(.04,.22))+ease(.78,.94) : step === 2 ? 1-ease(.32,.72) : 0;
  const angularOpacity = step < 2 ? 0 : step === 2 ? ease(.55,.80) : 1;
  const sourceRotation = step === 0 ? Rd : relativeRotation;
  const angleSource = step <= 3 ? localError.slice(3) : error.slice(3);
  const angleTarget = step <= 2 ? localError.slice(3) : step === 3 ? error.slice(3) : acceleration.slice(3);
  const oldValuesOpacity = step===4 ? 1 : step === 0 || step === 2 ? 0 : step === 1 ? 1-ease(.55,.64) : 1-ease(.40,.50);
  const newValuesOpacity = step===4 ? 0 : step === 0 || step === 2 ? 1 : step === 1 ? ease(.82,.94) : ease(.53,.65);
  const bracket = step === 0
    ? [lerp(92,300,ease(.04,.22)),lerp(158,608,ease(.04,.22)),lerp(55,65,ease(.04,.22)),lerp(280,245,ease(.04,.22))]
    : step === 1 ? [lerp(lerp(300,110,relocate),300,ease(.66,.90)),lerp(lerp(608,190,relocate),608,ease(.66,.90)),lerp(lerp(65,55,relocate),65,ease(.66,.90)),lerp(lerp(245,165,relocate),245,ease(.66,.90))]
    : step === 2 ? [lerp(300-260*relocate,470,move),lerp(608-260*relocate,530,move),lerp(65,55,move),lerp(245,270,move)]
    : step===4 ? [lerp(470,43,ease(.04,.20)),lerp(530,107,ease(.04,.20)),55,260] : [470-370*relocate+370*move,530-370*relocate+370*move,55,270];
  const [left,right,top,bottom] = bracket;
  const operation = ['quaternion → R(q)', 'p_rel = R_Hᵀ (desired − current)', 'R_rel → log₃ → φ_H', 'diag(R_H, R_H) × e_H', 'Kp × e_W'];
  const inputLabels = ['Stored pose reference', 'Desired pose T_d', 'Relative pose T_rel', 'Local error e_H', 'World error e_W'];
  const outputLabels = ['SE(3) pose T_d', 'Relative pose T_rel', 'Local error e_H', 'World error e_W', 'Requested acceleration a*'];
  const token = (key:string,x:number,y:number,old:number,value:number,color:string,opacity=1) => <g key={key} transform={`translate(${x} ${y})`} opacity={opacity} data-token={key}>
    <text textAnchor="middle" fill={color} fontSize="20" opacity={fmt(old)===fmt(value)?1:oldValuesOpacity}>{fmt(old)}</text>
    <text textAnchor="middle" fill={color} fontSize="20" opacity={fmt(old)===fmt(value)?0:newValuesOpacity}>{fmt(value)}</text>
  </g>;
  const qEntries = [
    {row:0,col:0,formula:'R₁₁ = 1 − 2(qy² + qz²)',substitution:`1 − 2 × ${fmt(qz)}²`,start:.28},
    {row:0,col:1,formula:'R₁₂ = 2(qx qy − qz qw)',substitution:`−2 × ${fmt(qz)} × ${fmt(qw)}`,start:.43},
    {row:1,col:0,formula:'R₂₁ = 2(qx qy + qz qw)',substitution:`2 × ${fmt(qz)} × ${fmt(qw)}`,start:.58},
    {row:1,col:1,formula:'R₂₂ = 1 − 2(qx² + qz²)',substitution:`1 − 2 × ${fmt(qz)}²`,start:.73},
  ];
  const activeQ = qEntries.findLast(entry=>progress>=entry.start) ?? qEntries[0];
  const qCalculation = ease(activeQ.start, activeQ.start+.08);
  const qResultMove = ease(activeQ.start+.08,activeQ.start+.14);
  const qResultX = qResultMove < .45 ? lerp(155,310,smooth(qResultMove/.45)) : lerp(310,340+activeQ.col*76,smooth((qResultMove-.45)/.55));
  const qResultY = qResultMove < .45 ? 215 : lerp(215,95+activeQ.row*40,smooth((qResultMove-.45)/.55));
  const qPanelOpacity = step===0 ? ease(.24,.28)*(1-ease(.92,1)) : 0;
  const motion = <svg className="pose-packing pose-continuous" viewBox="0 0 660 350" role="img" aria-label="Continuous transformation of a stored pose vector through SE(3) matrices into task error and acceleration. Position entries retain their identity; computed values crossfade at the operation.">
    <text x={step===4?75:130} y="25" textAnchor="middle" fill="#dce7f7">{step===1 && progress<.8 ? 'Desired position' : inputLabels[step]}</text>
    <text x={step===4?605:500} y="25" textAnchor="middle" fill="#dce7f7">{step===4 ? 'a*' : step===1 && progress<.8 ? 'World position error' : outputLabels[step]}</text>
    <path d={`M${left+12} ${top} H${left} V${bottom} H${left+12} M${right-12} ${top} H${right} V${bottom} H${right-12}`} fill="none" stroke="#c3d3eb" strokeWidth="2"/>
    <g opacity={step===1 ? ease(.18,.30)*(1-ease(.64,.78)) : 0}>
      <text x="330" y="25" textAnchor="middle" fill="#dce7f7">Current position</text>
      <path d="M303 55 H291 V165 H303 M357 55 H369 V165 H357" fill="none" stroke="#a7b8cf" strokeWidth="2"/>
      <text x="240" y="117" textAnchor="middle" fill="#ffde7a" fontSize="20">−</text>
      <text x="420" y="117" textAnchor="middle" fill="#ffde7a" fontSize="20">=</text>
      {p.map((value,i)=><text key={`current-${i}`} x="330" y={vectorY(i)} textAnchor="middle" fill="#c5d2e8" fontSize="20">{fmt(value)}</text>)}
      <text x="330" y="210" textAnchor="middle" fill="#ff8e9e">Orientation: log₃(R_Hᵀ R_d)</text>
      <text x="330" y="237" textAnchor="middle" fill="#c5d2e8">Yaw-only example: 75° − 30° = 45°</text>
    </g>
    <g opacity={step===1 ? ease(.39,.53)*(1-ease(.75,.80)) : 0} transform={`translate(${68*ease(.66,.90)} 0)`}>
      <path d="M483 55 H471 V165 H483 M537 55 H549 V165 H537" fill="none" stroke="#a7b8cf" strokeWidth="2"/>
      {displacement.map((value,i)=><text key={`difference-${i}`} x="510" y={vectorY(i)} textAnchor="middle" fill="#63b3ff" fontSize="20">{fmt(value)}</text>)}
    </g>
    {pd.map((_,i)=>token(`position-${i}`,pX,pY(i),oldP[i],sourceP[i],'#63b3ff'))}
    {Rd.map((row,i)=>row.map((_,j)=>{
      const entry = qEntries.find(e=>e.row===i && e.col===j);
      const cellOpacity = step===0 ? entry ? ease(entry.start+.12,entry.start+.15) : ease(.24,.30) : rotationOpacity;
      return token(`rotation-${i}-${j}`,step===0?340+j*76:matrixX(j),95+i*40,Rd[i][j],sourceRotation[i][j],'#ff8e9e',cellOpacity);
    }))}
    {poseVector.slice(3).map((value,i)=><g key={`quaternion-${i}`} transform={`translate(${125+40*ease(.10,.24)} ${170+i*30})`} opacity={step===0?1-ease(.10,.24):0}><text textAnchor="middle" fill="#ff8e9e" fontSize="20">{fmt(value)}</text></g>)}
    {[0,0,0,1].map((value,i)=><g key={`bottom-${i}`} transform={`translate(${step===0?340+i*76:matrixX(i)} 215)`} opacity={step===0?ease(.22,.30):step===1?(1-ease(.04,.22))+ease(.78,.94):step===2?1-ease(.20,.50):0}><text textAnchor="middle" fill="#a7b8cf" fontSize="20">{value}</text></g>)}
    <g opacity={qPanelOpacity}>
      <rect x="20" y="50" width="270" height="200" rx="8" fill="#182940"/>
      <text x="155" y="74" textAnchor="middle" fill="#c5d2e8">Unit quaternion · xyzw</text>
      <text x="155" y="100" textAnchor="middle" fill="#ff8e9e">qx = 0, qy = 0</text>
      <text x="155" y="126" textAnchor="middle" fill="#ff8e9e">qz = {fmt(qz)}, qw = {fmt(qw)}</text>
      <text x="155" y="162" textAnchor="middle" fill="#ffde7a">{activeQ.formula}</text>
      <text x="155" y="188" textAnchor="middle" fill="#ff8e9e" opacity={qCalculation}>{activeQ.substitution}</text>
      <text x="155" y="238" textAnchor="middle" fill="#c5d2e8">Compute one matrix entry</text>
      <rect x={310+activeQ.col*76} y={72+activeQ.row*40} width="62" height="31" rx="4" fill="none" stroke="#ffde7a"/>
    </g>
    <g opacity={qPanelOpacity * qCalculation * (1-ease(activeQ.start+.13,activeQ.start+.15))} transform={`translate(${qResultX} ${qResultY})`}>
      <text textAnchor="middle" fill="#ffde7a" fontSize="20">{fmt(Rd[activeQ.row][activeQ.col])}</text>
    </g>
    {localError.slice(3).map((_,i)=>token(`angular-${i}`,step===2?500:step===4?lerp(500,75,ease(.04,.20)):vectorX,vectorY(i+3),angleSource[i],angleTarget[i],'#ff8e9e',angularOpacity))}
    <g opacity={step===0 || step===4 ? 0 : ease(.25,.42)*(1-ease(.78,.94))}><rect x="200" y="270" width="260" height="34" rx="8" fill="#20324a"/><text x="330" y="292" textAnchor="middle" fill="#ffde7a">{operation[step]}</text></g>
    <g opacity={step===4?ease(.20,.30):0}>
      <text x="165" y="25" textAnchor="middle" fill="#ffde7a">Kp</text>
      <text x="245" y="25" textAnchor="middle" fill="#ffde7a">P term</text>
      <text x="390" y="25" textAnchor="middle" fill="#72dfaa">D = Kd e_v</text>
      <text x="505" y="25" textAnchor="middle" fill="#c5d2e8">a_ref</text>
      {error.map((_,i)=><g key={`pd-row-${i}`}>
        <text x="15" y={vectorY(i)} fill="#a7b8cf">{['x','y','z','ωx','ωy','ωz'][i]}</text>
        <text x="125" y={vectorY(i)} textAnchor="middle" fill="#ffde7a">×</text>
        <text x="165" y={vectorY(i)} textAnchor="middle" fill="#ffde7a">{kp[i]}</text>
        <text x="205" y={vectorY(i)} textAnchor="middle" fill="#ffde7a">→</text>
        <text x="245" y={vectorY(i)} textAnchor="middle" fill="#ffde7a" fontSize="20" opacity={ease(.27,.40)}>{fmt(proportional[i])}</text>
        <text x="300" y={vectorY(i)} textAnchor="middle" fill="#edf3ff" opacity={ease(.50,.58)}>+</text>
        <text x="390" y={vectorY(i)} textAnchor="middle" fill="#72dfaa" opacity={ease(.42,.50)*(1-ease(.58,.64))}>{kd[i]} × {fmt(velocityError[i])}</text>
        <text x="390" y={vectorY(i)} textAnchor="middle" fill="#72dfaa" fontSize="20" opacity={ease(.65,.73)}>{fmt(derivative[i])}</text>
        <text x="470" y={vectorY(i)} textAnchor="middle" fill="#edf3ff" opacity={ease(.66,.72)}>+</text>
        <text x="505" y={vectorY(i)} textAnchor="middle" fill="#c5d2e8" opacity={ease(.66,.72)}>0</text>
        <text x="550" y={vectorY(i)} textAnchor="middle" fill="#edf3ff" opacity={ease(.74,.80)}>=</text>
        <text x="605" y={vectorY(i)} textAnchor="middle" fill={i<3?'#63b3ff':'#ff8e9e'} fontSize="20" opacity={ease(.78,.92)}>{fmt(acceleration[i])}</text>
      </g>)}
      <text x="330" y="278" textAnchor="middle" fill="#c5d2e8">Stationary reference: Vd = 0, a_ref = 0</text>
      <text x="330" y="302" textAnchor="middle" fill="#72dfaa">{progress<.48 ? 'P: x acceleration = 40 × 0.300 = 12.000 m/s²' : progress<.74 ? 'D: x velocity error = 0 − 0.050; 8 × (−0.050) = −0.400 m/s²' : 'Sum: x acceleration = 12.000 − 0.400 + 0 = 11.600 m/s²'}</text>
    </g>
    <text x="330" y="313" textAnchor="middle" fill="#63b3ff">Blue: position / linear quantities</text>
    <text x="330" y="338" textAnchor="middle" fill="#ff8e9e">Pink: rotation / angular quantities</text>
  </svg>;
  return <section className="pose-pipeline" aria-label="Pose task from stored reference to feedback acceleration">
    <header><p>INSIDE A POSE TASK</p><h3>Where do the seven pose values go?</h3></header>
    <ol className="pose-story-flow" aria-label="Pose task calculation flow">
      {['Pose vector', 'SE(3) pose', 'Relative pose', 'Local error', 'World error', 'Acceleration'].map((title,i) => <li key={title} data-current={i === step+1} data-done={i <= step} data-sending={i===step && playing}><span>{title}</span><small>{['7 values', '4 × 4', '4 × 4', '6 values', '6 values', '6 values'][i]}</small></li>)}
    </ol>
    <div className="pose-pipeline-transport">
      <button type="button" disabled={!playing && step===4 && progress===1} onClick={() => {
        if (playing) { setPlaying(false); return; }
        if (progress===1 && step<4) setStep(step+1);
        setPlaying(true);
      }}>{playing ? 'Ⅱ Pause' : progress===1 ? step===4 ? 'Calculation complete' : 'Next step →' : progress>0 ? '▶ Resume' : '▶ Play transformation'}</button>
      <button type="button" onClick={() => {setPlaying(false);setStep(0);setTime(0);}}>↶ Rewind</button>
      <span>{step+1} / 5 · {titles[step]}</span>
    </div>
    <div className="pose-packing-stage">{motion}</div>
    <div className="pose-pipeline-explanation" aria-live="polite">
      <Formula expression={formulas[step]}/>
      {numericalTransform && <div className="pose-pipeline-coordinate-product">
        <p>{step===0 ? "Unit quaternion → rotation matrix" : step===2 ? "Relative pose → feedback error" : step===4 ? "PD feedback · P + D + feedforward" : "Matrix × input = output"}</p>
        <Formula expression={numericalTransform} className="pose-pipeline-numerical"/>
      </div>}
      <p>{captions[step]}</p>
    </div>
    <p className="pose-pipeline-note">Fixed illustrative 3D poses with yaw-only rotations. For PD feedback, current world-aligned task velocity is [0.05, 0.02, 0, 0, 0, 0.10] (m/s then rad/s); desired velocity and reference acceleration are zero. Target x = 0.40 m, yaw = 75°. Current p = [0.10, −0.05, 0.20] m, yaw = 30°. Target y = 0.20 m, z = 0.35 m. Quaternion order: xyzw. Only the calculation stages animate; no robot dynamics or solver runs here.</p>
  </section>;
}
