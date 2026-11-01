"""Offline, single-state Talos NP / weighted QP / lexicographic QP example.

No integration or hardware. SLSQP solves the convex quadratic subproblems;
linear equalities are eliminated with SVD before each solve.
"""
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
import pinocchio as pin
import scipy
from scipy.linalg import null_space
from scipy.optimize import linprog, minimize

root = Path(sys.prefix) / 'share/example-robot-data/robots/talos_data'
urdf = root / 'robots/talos_reduced.urdf'
model = pin.buildModelFromUrdf(str(urdf), pin.JointModelFreeFlyer())
pin.loadReferenceConfigurations(model, str(root / 'srdf/talos.srdf'), False)
q = model.referenceConfigurations['half_sitting'].copy()
v = np.zeros(model.nv)
data = model.createData()
feet = [model.getFrameId(n) for n in ['leg_left_sole_fix_joint', 'leg_right_sole_fix_joint']]
hand = model.getFrameId('gripper_right_joint')
pin.forwardKinematics(model, data, q)
pin.updateFramePlacements(model, data)
q[2] -= data.oMf[feet[0]].translation[2]
pin.computeAllTerms(model, data, q, v)
pin.updateFramePlacements(model, data)
M = np.triu(data.M) + np.triu(data.M, 1).T
h = data.nle.copy()
Jc = np.vstack([pin.getFrameJacobian(model, data, f, pin.LOCAL_WORLD_ALIGNED) for f in feet])
Jh = pin.getFrameJacobian(model, data, hand, pin.LOCAL_WORLD_ALIGNED)[:3].copy()
Jcom = pin.jacobianCenterOfMass(model, data, q).copy()
nv, na, nf = model.nv, model.nv - 6, 24
ny = nv + na + nf
S = np.eye(nv)[6:]
# Four sole-local point forces per foot, transformed to world-aligned sole wrenches.
points = [[x, y, 0.] for x in [-.1, .1] for y in [-.065, .065]]
F = np.zeros((12, nf))
for foot, fid in enumerate(feet):
    R = data.oMf[fid].rotation
    for k, p in enumerate(points):
        F[6*foot:6*foot+6, 12*foot+3*k:12*foot+3*k+3] = np.vstack((R, R @ pin.skew(np.array(p))))
E = np.vstack((np.hstack((M, -S.T, -Jc.T @ F)), np.hstack((Jc, np.zeros((12, na+nf))))))
e = np.r_[-h, np.zeros(12)]
G, g = [], []
def upper(row, bound):
    G.append(row); g.append(bound)
# Actuated acceleration cap for this snapshot, plus unscaled URDF effort limits.
for i in range(na):
    for sign in [-1., 1.]:
        row = np.zeros(ny); row[6+i] = sign; upper(row, 10.)
        row = np.zeros(ny); row[nv+i] = sign; upper(row, model.effortLimit[6+i])
for foot in range(2):
    total = np.zeros(ny)
    for k in range(4):
        offset = nv+na+foot*12+k*3
        row = np.zeros(ny); row[offset+2] = -1.; upper(row, 0.)
        total[offset+2] = 1.
        for axis in [0, 1]:
            for sign in [-1., 1.]:
                row = np.zeros(ny); row[offset+axis] = sign; row[offset+2] = -.3; upper(row, 0.)
    upper(total, 1000.); upper(-total, -5.)
G, g = np.array(G), np.array(g)
# Scale torque/force coordinates for conditioning; all exported results use SI.
scale = np.r_[np.ones(nv), np.full(na, 100.), np.full(nf, 100.)]
Es, Gs = E*scale, G*scale
Acom = np.pad(Jcom, ((0, 0), (0, na+nf)))
Ahand = np.pad(Jh, ((0, 0), (0, na+nf)))
Apost = np.pad(S/10., ((0, 0), (0, na+nf)))
bcom, bhand, bpost = np.zeros(3), np.array([30., 0., 0.]), np.zeros(na)

def solve(tasks, equality=Es, target=e, initial=None):
    origin = np.linalg.lstsq(equality, target, rcond=1e-10)[0]
    Z = null_space(equality, rcond=1e-10)
    if np.max(np.abs(equality@origin-target)) > 1e-7:
        raise RuntimeError('Inconsistent equality system')
    C, d = Gs@Z, g-Gs@origin
    norm = np.maximum(np.linalg.norm(C, axis=1), 1.)
    C, d = C/norm[:, None], d/norm
    feasible = linprog(np.zeros(Z.shape[1]), A_ub=C, b_ub=d, bounds=[(None, None)]*Z.shape[1], method='highs')
    if not feasible.success:
        raise RuntimeError(feasible.message)
    A = np.vstack([np.sqrt(w)*(a*scale)@Z for a,b,w in tasks])
    b = np.concatenate([np.sqrt(w)*(b-(a*scale)@origin) for a,b,w in tasks])
    x0 = feasible.x if initial is None else Z.T@(initial/scale-origin)
    result = minimize(lambda x: .5*np.sum((A@x-b)**2), x0,
        jac=lambda x: A.T@(A@x-b), constraints=[{'type':'ineq','fun':lambda x:d-C@x,'jac':lambda x:-C}],
        method='SLSQP', options={'ftol':1e-10, 'maxiter':2000})
    y = scale*(origin+Z@result.x)
    violation = max(float(np.max(G@y-g)), float(np.max(np.abs(E@y-e))))
    if not result.success or violation > 1e-5:
        raise RuntimeError(f'{result.message}; violation={violation}')
    return y

tasks = [(Acom,bcom,100.), (Ahand,bhand,1.), (Apost,bpost,.01)]
qp = solve(tasks)
h1 = solve([(Acom,bcom,1.)])
h2 = solve([(Ahand,bhand,1.)], np.vstack((Es,Acom*scale)), np.r_[e,Acom@h1], h1)
h3 = solve([(Apost,bpost,1.)], np.vstack((Es,Acom*scale,Ahand*scale)), np.r_[e,Acom@h1,Ahand@h2], h2)
# NP first preserves both feet, then preserves CoM in the same contact nullspace.
Nc = np.eye(nv)-np.linalg.pinv(Jc, rcond=1e-10)@Jc
raw = Nc @ np.linalg.pinv(Jh@Nc, rcond=1e-10)@bhand
Nprimary = np.eye(nv)-np.linalg.pinv(np.vstack((Jc,Jcom)), rcond=1e-10)@np.vstack((Jc,Jcom))
filtered = Nprimary@raw
np_solved = Nprimary @ np.linalg.pinv(Jh@Nprimary, rcond=1e-10)@bhand

def summary(y):
    return dict(com=(Acom@y).tolist(), hand=(Ahand@y).tolist(),
        hand_error=float(np.linalg.norm(Ahand@y-bhand)), posture=float(np.linalg.norm(S@y[:nv])),
        torque_ratio=float(np.max(np.abs(y[nv:nv+na])/model.effortLimit[6:])),
        equality_residual=float(np.max(np.abs(E@y-e))), inequality_violation=float(max(0,np.max(G@y-g))))
# A 2D affine slice contains three feasible full-dimensional solutions.
static = solve([(Acom,bcom,100.),(Ahand,np.zeros(3),1.),(Apost,bpost,.01)])
B = np.column_stack((qp-static,h3-static))
H = sum(w*(a@B).T@(a@B) for a,b,w in tasks)
c = sum(w*(a@B).T@(a@static-b) for a,b,w in tasks)
center = -np.linalg.solve(H,c)
# Clip a display window by every actual inequality; the window is not a physical constraint.
window = [-.4,1.8,-.4,1.8]
poly = [np.array([window[0],window[2]]),np.array([window[1],window[2]]),np.array([window[1],window[3]]),np.array([window[0],window[3]])]
for row, bound in zip(G@B,g-G@static):
    bound += 1e-6  # Display clipping tolerance; physical residuals checked separately.
    if np.linalg.norm(row) < 1e-8:
        continue
    new=[]
    for a,b in zip(poly,poly[1:]+poly[:1]):
        da,db=row@a-bound,row@b-bound
        if da <= 1e-8: new.append(a)
        if (da < -1e-8 and db > 1e-8) or (da > 1e-8 and db < -1e-8): new.append(a+(b-a)*da/(da-db))
    poly=new
    if not poly: raise RuntimeError('Empty display slice')
# Contour points in the slice, true constant quadratic cost above slice minimum.
values,vectors=np.linalg.eigh(H)
basecost=.5*center@H@center+c@center
optdelta=.5*H[0,0]+c[0]-basecost
levels=[max(optdelta,.01)*factor for factor in [1.,2.,4.,8.]]
contours=[]
for level in levels:
    contours.append([(center + vectors@(np.sqrt(2*level/values)*np.array([np.cos(t),np.sin(t)]))).tolist() for t in np.linspace(0,2*np.pi,160)])
# Full SVD exposes all 23 primary-nullspace coordinates.
P = np.vstack((Jc, Jcom))
U, singular_values, Vt = np.linalg.svd(P, full_matrices=True)
rank = int(np.sum(singular_values > singular_values[0]*1e-10))
Vr, V0 = Vt[:rank].T, Vt[rank:].T
alpha, beta = Vr.T@raw, V0.T@raw
beta_solved = np.linalg.pinv(Jh@V0, rcond=1e-10)@bhand
svd_filtered = V0@beta
svd_solved = V0@beta_solved
svd_errors = dict(reconstruction=float(np.max(np.abs(Vr@alpha+V0@beta-raw))),
    projector=float(np.max(np.abs(svd_filtered-filtered))),
    null_basis=float(np.max(np.abs(P@V0))),
    reduced_solve=float(np.max(np.abs(svd_solved-np_solved))))
if max(svd_errors.values()) > 1e-8: raise RuntimeError(svd_errors)
svd = dict(rank=rank, nullity=nv-rank, singular_values=singular_values.tolist(),
    alpha=alpha.tolist(),beta=beta.tolist(),beta_solved=beta_solved.tolist(),
    parallel=(Vr@alpha).tolist(),null_component=svd_filtered.tolist(),
    primary_raw=(P@raw).tolist(),primary_filtered=(P@svd_filtered).tolist(),primary_solved=(P@svd_solved).tolist(),
    hand_filtered=(Jh@svd_filtered).tolist(),hand_solved=(Jh@svd_solved).tolist(),
    Vr=Vr.tolist(),V0=V0.tolist(),P=P.tolist(),Jh=Jh.tolist(),checks=svd_errors)
checks = dict(np_contact_raw=float(np.max(np.abs(Jc@raw))), np_contact_projected=float(np.max(np.abs(Jc@filtered))),
    np_com_projected=float(np.max(np.abs(Jcom@filtered))), hqp_com_preservation=float(np.max(np.abs(Acom@(h3-h1)))),
    hqp_hand_preservation=float(np.max(np.abs(Ahand@(h3-h2)))))
if max(checks.values()) > 1e-5: raise RuntimeError(checks)
frame=dict(time=0., com=data.com[0].tolist(), hand=data.oMf[hand].translation.tolist(),
    hand_target=(data.oMf[hand].translation+np.array([.3,0,0])).tolist(),
    foot_positions_world=[data.oMf[f].translation.tolist() for f in feet],
    foot_force_world=[(F@qp[nv+na:])[6*i:6*i+3].tolist() for i in range(2)],
    joint_poses=[pin.SE3ToXYZQUAT(p).tolist() for p in data.oMi])
output=dict(metadata=dict(model='talos_reduced',nq=model.nq,nv=nv,na=na,nf=nf,ny=ny,
    pinocchio=pin.__version__,scipy=scipy.__version__,contact_rank=int(np.linalg.matrix_rank(Jc)),primary_rank=int(np.linalg.matrix_rank(np.vstack((Jc,Jcom)))),urdf_sha256=hashlib.sha256(urdf.read_bytes()).hexdigest(),
    state='half_sitting; v=0',hand_acceleration=bhand.tolist(),weights=[100,1,.01],
    acceleration_cap=10.,mu=.3,force_bounds=[5,1000],checks=checks), frame=frame,
    np=dict(svd=svd,max_joint_acceleration=[float(np.max(np.abs(a[6:]))) for a in [raw,filtered,np_solved]],raw=dict(com=(Jcom@raw).tolist(),hand=(Jh@raw).tolist()),projected=dict(com=(Jcom@filtered).tolist(),hand=(Jh@filtered).tolist()),
        solved=dict(com=(Jcom@np_solved).tolist(),hand=(Jh@np_solved).tolist()),
        raw_acceleration=raw.tolist(),projected_acceleration=filtered.tolist()),
    qp=summary(qp),hqp=[summary(y) for y in [h1,h2,h3]],
    slice=dict(window=window,polygon=[p.tolist() for p in poly],contours=contours,center=center.tolist(),H=H.tolist(),c=c.tolist(),
        note='y=static+u*(QP-static)+v*(HQP-static); full QP optimum=(1,0); display window is not a physical bound',optimal_level=optdelta))
path=Path('src/lib/demos/data/wbc-task-comparison.json')
path.write_text(json.dumps(output,separators=(',',':'),allow_nan=False))
print(json.dumps({k:output[k] for k in ['metadata','qp','hqp']},indent=2))
