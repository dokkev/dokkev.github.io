// Planar 3R kinematics. All joint coordinates are radians.
const lengths=[1,.8,.6];
export function planarArm(q:number[]){
  let angle=0;
  const points=[[0,0]],segments:number[][]=[];
  for(let i=0;i<3;i++){
    angle+=q[i];
    const segment=[lengths[i]*Math.cos(angle),lengths[i]*Math.sin(angle)];
    segments.push(segment);
    points.push([points[i][0]+segment[0],points[i][1]+segment[1]]);
  }
  const J=[[],[]] as number[][];
  for(let i=0;i<3;i++){
    J[0].push(-segments.slice(i).reduce((sum,v)=>sum+v[1],0));
    J[1].push(segments.slice(i).reduce((sum,v)=>sum+v[0],0));
  }
  const [a,b]=J;
  const cross=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const magnitude=Math.hypot(...cross);
  if(magnitude<1e-8)throw new Error('Planar arm Jacobian is near singular');
  const n=cross.map(v=>v/magnitude);
  const z=[0,0,2*(-2.1-q[2])];
  // For this rank-two 2x3 J, ker J is the line spanned by unit n.
  const dot=n.reduce((sum,v,i)=>sum+v*z[i],0);
  const allowed=n.map(v=>v*dot),removed=z.map((v,i)=>v-allowed[i]);
  return {points,J,n,z,allowed,removed};
}

export function samplePlanarTrajectory(frames:{time:number;q:number[];qdot:number[]}[],time:number,target:number[]){
  const index=Math.min(frames.length-2,Math.floor(time/(frames[1].time-frames[0].time)));
  const a=frames[Math.max(0,index)],b=frames[Math.max(0,index)+1],h=b.time-a.time;
  const u=Math.max(0,Math.min(1,(time-a.time)/h));
  const q=a.q.map((x,i)=>(2*u**3-3*u*u+1)*x+(u**3-2*u*u+u)*h*a.qdot[i]+(-2*u**3+3*u*u)*b.q[i]+(u**3-u*u)*h*b.qdot[i]);
  const qdot=a.q.map((x,i)=>(6*u*u-6*u)/h*x+(3*u*u-4*u+1)*a.qdot[i]+(-6*u*u+6*u)/h*b.q[i]+(3*u*u-2*u)*b.qdot[i]);
  const kinematics=planarArm(q);
  const tip=kinematics.points[3],velocity=kinematics.J.map(row=>row.reduce((s,v,i)=>s+v*qdot[i],0));
  return {...kinematics,q,qdot,tip_error:Math.hypot(...tip.map((v,i)=>v-target[i])),tip_speed:Math.hypot(...velocity)};
}
