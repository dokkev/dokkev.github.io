"""Executed Jacobian, unilateral torque, isolated energy and coupled numerical checks."""
import argparse,json,sys
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor,as_completed
import numpy as np
import mujoco
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from til.two_tendon import TwoTendonFinger,ARM
from til.two_tendon_experiment import specification,simulate
from til.transmission import TransmissionPlant,TransmissionParams


def numerical(condition,outer,plant,control,delay,solref):
    spec=specification(0);spec.update(contact=condition=="contact",amplitude=[.25,.35],period_s=3.,cycles=1)
    row,data=simulate(spec,outer=outer,plant=plant,controller_period=control,emulator_delay=delay,solref=solref,noise=False)
    key=f"{condition}_o{outer:g}_p{plant:g}_c{control:g}_d{delay:g}_s{solref:g}"
    return key,row,data


def geometry():
    f=TwoTendonFinger();rows=[]
    for q1 in np.linspace(-np.pi/6,np.pi/3,11):
        for q2 in np.linspace(0,5*np.pi/6,13):
            q=np.array([q1,q2]);columns=[]
            for j in range(2):
                eps=np.eye(2)[j]*1e-6
                f.data.qpos[f.qadr]=q+eps;mujoco.mj_forward(f.model,f.data);left=f.tendon_length().copy()
                f.data.qpos[f.qadr]=q-eps;mujoco.mj_forward(f.model,f.data);right=f.tendon_length().copy()
                columns.append((left-right)/2e-6)
            f.data.qpos[f.qadr]=q;mujoco.mj_forward(f.model,f.data)
            torque_errors=[]
            for T in ([0,0],[10,10],[0,40],[40,0],[40,40]):
                f.apply_tension(T);mujoco.mj_forward(f.model,f.data)
                torque_errors.append(float(np.max(abs(f.tendon_joint_torque()-ARM.T@T))))
            rows.append(dict(q_rad=q.tolist(),analytic=(-ARM).tolist(),finite_difference=np.column_stack(columns).tolist(),
                mujoco=f.tendon_jacobian().tolist(),torque_error_max_Nm=max(torque_errors)))
    corners=(ARM.T@np.array([[0,0],[40,0],[40,40],[0,40]]).T).T
    feasible=[]
    for q1 in np.linspace(-np.pi/6,np.pi/3,25):
        for q2 in np.linspace(0,5*np.pi/6,25):
            T=f.required_tension([q1,q2]);feasible.append(dict(q_rad=[q1,q2],required_tension_N=T.tolist(),feasible=bool(np.all((T>=0)&(T<=40)))))
    return dict(rows=rows,excursion_jacobian=ARM.tolist(),determinant=float(np.linalg.det(ARM)),
        condition_number=float(np.linalg.cond(ARM)),torque_corners_Nm=corners.tolist(),static_feasible_grid=feasible,
        scope="Constant-arm equivalent winding reference, not the SVG centerline or verified hardware routing.")


def energy():
    rows=[];arrays={}
    for channel in (1,2):
        for dt in (.0001,.00005):
            p=TransmissionParams();p.specimen.maxwell_ratio=0.;p.specimen.nonlinear_strain_coefficient=0.
            # No aging; work includes both boundaries and dissipation in the existing ledger.
            plant=TransmissionPlant(p);data=[]
            for i in range(round(2./dt)):
                t=(i+1)*dt;w=2*np.pi*.5
                x1=.0008*np.sin(w*t);v1=.0008*w*np.cos(w*t)
                x2=-.0004*np.sin(w*t+.2)+.0004*np.sin(.2);v2=-.0004*w*np.cos(w*t+.2)
                plant.step(dt,x1,v1,x2,v2)
                if i%10==0:
                    g=plant.ground_truth();data.append([t,x1,x2,plant.s.T1,plant.s.T2,g["stored_energy"],g["dissipated_energy"],g["energy_residual"]])
            key=f"ch{channel}_dt{dt:g}";arrays[key]=np.array(data)
            rows.append(dict(id=key,dt_s=dt,channel=channel,residual_J=float(data[-1][-1]),peak_residual_J=float(np.max(abs(arrays[key][:,-1]))),
                input_work_J=plant.s.W_in,output_work_J=plant.s.W_out,dissipated_J=plant.s.E_diss,
                scope="Isolated prescribed two-port motion; not complete controlled electromechanical energy."))
    return rows,arrays


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--out",required=True);ap.add_argument("--workers",type=int,default=4);a=ap.parse_args()
    out=Path(a.out);out.mkdir(parents=True,exist_ok=True);rows={};arrays={}
    tasks=[]
    for condition in ("free","contact"):
        tasks += [(condition,o,.000025,.0001,0.,.004) for o in (.001,.0005,.00025,.000125)]
        tasks += [(condition,.0005,p,.0001,0.,.004) for p in (.0001,.00005)]
        tasks += [(condition,.0005,.00005,c,d,s) for c,d,s in ((.0005,0.,.004),(.0001,.001,.004),(.0001,0.,.002),(.0001,0.,.008))]
    with ProcessPoolExecutor(max_workers=a.workers) as pool:
        for future in as_completed([pool.submit(numerical,*task) for task in tasks]):
            key,row,data=future.result();rows[key]=row;arrays[key]=data;print(key,flush=True)
    for key,row in rows.items():
        condition="contact" if row["config"]["contact"] else "free";reference=arrays[f"{condition}_o0.000125_p2.5e-05_c0.0001_d0_s0.004"]
        data=arrays[key];qref=np.column_stack([np.interp(data[:,0],reference[:,0],reference[:,j]) for j in (1,2)])
        tref=np.column_stack([np.interp(data[:,0],reference[:,0],reference[:,j]) for j in (15,16)])
        row["joint_rmse_vs_ref_deg"]=np.sqrt(np.mean(np.degrees(data[:,1:3]-qref)**2,0)).tolist()
        row["tension_rmse_vs_ref_N"]=np.sqrt(np.mean((data[:,15:17]-tref)**2,0)).tolist()
        row["contact_force_rmse_vs_ref_N"]=float(np.sqrt(np.mean((data[:,19]-np.interp(data[:,0],reference[:,0],reference[:,19]))**2)))
    er,ea=energy();arrays.update(ea)
    report=dict(geometry=geometry(),numerics=rows,energy=er,tolerances=dict(jacobian_absolute=1e-8,torque_absolute_Nm=1e-8,
        free_joint_rmse_deg=.25,contact_joint_rmse_deg=.5,tension_rmse_N=1.,isolated_energy_residual_J=1e-5))
    (out/"verification.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf8");np.savez_compressed(out/"verification.npz",**arrays)


if __name__=="__main__":main()
