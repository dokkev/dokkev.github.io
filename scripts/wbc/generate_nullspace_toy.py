"""Planar 3R kinematic example: posture motion with a fixed endpoint.

RK4 recomputes J and N at every substage. No endpoint pinning or position
correction is applied. This is velocity-level kinematics, not inverse dynamics.
"""
import json
from pathlib import Path
import numpy as np

lengths = np.array([1., .8, .6])
q0 = np.array([.2, 1.5, -1.6])
q3_goal = -2.1
dt, duration = .005, 3.

def points(q):
    angles = np.cumsum(q)
    segments = lengths[:,None]*np.column_stack((np.cos(angles),np.sin(angles)))
    return np.vstack((np.zeros(2),np.cumsum(segments,axis=0)))

def jacobian(q):
    angles = np.cumsum(q)
    x, y = lengths*np.cos(angles), lengths*np.sin(angles)
    return np.array([[-sum(y[i:]) for i in range(3)], [sum(x[i:]) for i in range(3)]])

def speed_envelope(t):
    u = np.clip(t/duration, 0., 1.)
    # Derivative of quintic progress: integral over [0,T] equals T.
    return 30*u*u*(1-u)*(1-u)

def command(q, t, projected):
    z = np.array([0., 0., 2.*(q3_goal-q[2])])
    J = jacobian(q)
    if np.linalg.svd(J,compute_uv=False)[-1] < 1e-5:
        raise RuntimeError('Near-singular Jacobian')
    return speed_envelope(t)*(z-J.T@np.linalg.solve(J@J.T,J@z) if projected else z)

J0=jacobian(q0)
z=np.array([0.,0.,2.*(q3_goal-q0[2])])
N0=np.eye(3)-J0.T@np.linalg.solve(J0@J0.T,J0)
target=points(q0)[-1]
trajectories={}
for name,projected in [('raw',False),('projected',True)]:
    q=q0.copy(); frames=[]; max_drift=0.; max_velocity=0.
    for i in range(round(duration/dt)+1):
        velocity=command(q,i*dt,projected)
        drift=np.linalg.norm(points(q)[-1]-target)
        max_drift=max(max_drift,drift)
        max_velocity=max(max_velocity,np.max(np.abs(jacobian(q)@velocity)))
        if i%4==0:
            frames.append(dict(time=i*dt,q=q.tolist(),qdot=velocity.tolist(),points=points(q).tolist(),
                tip_error=float(drift),tip_speed=float(np.linalg.norm(jacobian(q)@velocity))))
        if i==round(duration/dt): break
        k1=velocity;k2=command(q+dt*k1/2,i*dt+dt/2,projected);k3=command(q+dt*k2/2,i*dt+dt/2,projected);k4=command(q+dt*k3,i*dt+dt,projected)
        q+=dt*(k1+2*k2+2*k3+k4)/6
    trajectories[name]=dict(frames=frames,max_tip_drift=max_drift,max_tip_velocity_component=max_velocity)
# Bound the interpolation error used by the browser, not only sampled states.
interpolation_drift=0.
frames=trajectories['projected']['frames']
for a,b in zip(frames,frames[1:]):
    h=b['time']-a['time']
    for u in np.linspace(0.,1.,9):
        q=(2*u**3-3*u**2+1)*np.array(a['q'])+(u**3-2*u**2+u)*h*np.array(a['qdot'])+(-2*u**3+3*u**2)*np.array(b['q'])+(u**3-u**2)*h*np.array(b['qdot'])
        interpolation_drift=max(interpolation_drift,float(np.linalg.norm(points(q)[-1]-target)))
if interpolation_drift>1e-8: raise RuntimeError('Excessive Hermite interpolation drift')
if trajectories['projected']['max_tip_drift']>1e-7:
    raise RuntimeError('Excessive integration drift')
result=dict(lengths=lengths.tolist(),target=target.tolist(),q3_goal=q3_goal,J0=J0.tolist(),N0=N0.tolist(),
    initial_z=z.tolist(),initial_allowed=(N0@z).tolist(),initial_removed=((np.eye(3)-N0)@z).tolist(),
    initial_tip_velocity=(J0@z).tolist(),dt=dt,duration=duration,speed_profile='quintic virtual time; c(t)=30u²(1-u)²; u=t/T',max_hermite_endpoint_drift=interpolation_drift,**trajectories)
Path('src/lib/demos/data/wbc-nullspace-toy.json').write_text(json.dumps(result,separators=(',',':'),allow_nan=False))
print(json.dumps(dict(projected_drift=trajectories['projected']['max_tip_drift'],
    raw_final_error=trajectories['raw']['frames'][-1]['tip_error'],
    projected_final_q=trajectories['projected']['frames'][-1]['q'],
    projected_task_velocity=trajectories['projected']['max_tip_velocity_component'],
    initial_speed=float(np.linalg.norm(command(q0,0.,True))),
    final_speed=float(np.linalg.norm(command(q,duration,True)))),indent=2))
