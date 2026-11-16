"""Export executed two-tendon results and publication figures; never fit or simulate here."""
import argparse,hashlib,json,subprocess,sys
from dataclasses import asdict
from pathlib import Path
from importlib.metadata import version
import h5py
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Circle,Polygon
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from til.two_tendon import ARM,HOME,TwoTendonFinger
from til.two_tendon_observer import load_runs
from til.two_tendon_experiment import resolved_configuration


def read(path):return json.loads(Path(path).read_text(encoding="utf8"))
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--dataset",default="data/two-tendon/full.h5");ap.add_argument("--results",default="figures/two-tendon")
    ap.add_argument("--public",default="../../public");a=ap.parse_args();p=Path(a.results);public=Path(a.public)
    destination=public/"assets/img/tendon-in-the-loop/two-tendon";destination.mkdir(parents=True,exist_ok=True)
    previews=p/"previews";previews.mkdir(parents=True,exist_ok=True)
    plt.rcParams.update({"font.size":10,"svg.fonttype":"none","svg.hashsalt":"til-two-tendon","axes.spines.top":False,
        "axes.spines.right":False,"axes.grid":True,"grid.alpha":.2})
    figures=[]
    def save(fig,name,title):
        fig.suptitle(title,fontsize=13);fig.tight_layout(rect=(0,0,1,.94));path=destination/(name+".svg")
        fig.savefig(path,metadata={"Date":None});path.write_text("\n".join(s.rstrip() for s in path.read_text(encoding="utf8").splitlines())+"\n",encoding="utf8")
        fig.savefig(previews/(name+".png"),dpi=110);plt.close(fig)
        figures.append(dict(file="/assets/img/tendon-in-the-loop/two-tendon/"+path.name,title=title,sha256=sha(path)))
    physics=read(p/"physics/verification.json");control=read(p/"control/control.json");ca=np.load(p/"control/control.npz")
    observability=read(p/"observability/observability.json");oa=np.load(p/"observability/observability.npz")
    gates=read(p/"gates.json");assert gates["passed"]
    evaluation_path=p/"calibrated-evaluation"
    evaluation=read(evaluation_path/"evaluation.json");metrics=evaluation["metrics"];runs=load_runs(a.dataset);lookup={r["id"]:r for r in runs}
    groups={}
    for r in runs:
        if not r["split"].startswith("test"):continue
        group=("nominal_contact" if r["masks"]["contact"].any() else "nominal_free") if r["split"]=="test" else r["config"]["condition"]
        groups.setdefault(group,[]).append(r["id"])
    aggregate={}
    for model,records in metrics.items():
        aggregate[model]={}
        for group,ids in groups.items():
            windows={}
            for window in next(iter(records.values())):
                rows=[records[i][window] for i in ids if records[i][window] is not None]
                windows[window]=({k:float(np.mean([r[k] for r in rows])) for k in rows[0]} if rows else None)
            aggregate[model][group]=dict(ids=ids,windows=windows,worst_full_error_deg=[max(records[i]["all"][f"q{j}_max_deg"] for i in ids) for j in (1,2)])
    def errors(model,group,window="all"):
        return [aggregate[model][group]["windows"][window][f"q{j}_mae_deg"] for j in (1,2)]
    multiseed={group:dict(mean_mae_deg=np.mean([errors(f"gru-seed{s}",group) for s in range(3)],0).tolist(),
        seed_sd_deg=np.std([errors(f"gru-seed{s}",group) for s in range(3)],0,ddof=1).tolist()) for group in groups}
    # 01: model geometry and four-motor topology, explicitly not an inferred cable centerline.
    fig,axs=plt.subplots(1,2,figsize=(11,4));f=TwoTendonFinger();points=f.link_points()*1000
    axs[0].plot(points[:,0],points[:,1],"o-",lw=5,color="#444")
    for center,radius,color in ((points[0],15,"crimson"),(points[1],10,"#bd7400")):
        axs[0].add_patch(Circle(center,radius,fill=False,color=color,lw=2))
    axs[0].add_patch(Circle(points[0],10,fill=False,color="#bd7400",ls="--",lw=1.5))
    axs[0].text(-15,25,"e₁ = 0.015 Δq₁\ne₂ = 0.010 (Δq₁ + Δq₂)",fontsize=11)
    axs[0].set(xlim=(-25,95),ylim=(-30,45),aspect="equal",xlabel="World x [mm]",ylabel="World z [mm]",title="Equivalent pulley radii; fixed-tendon constraints")
    ax=axs[1];ax.axis("off")
    for i,y in enumerate((.72,.28),1):
        for x,label in ((.12,f"Robot motor {i}"),(.50,f"Cable path {i}"),(.88,f"Emulator {i}")):
            ax.text(x,y,label,ha="center",va="center",bbox=dict(boxstyle="round,pad=.5",facecolor="#edf3f8"),transform=ax.transAxes)
        for left,right in ((.23,.38),(.62,.76)):ax.annotate("",xy=(right,y),xytext=(left,y),xycoords="axes fraction",arrowprops=dict(arrowstyle="<->"))
    ax.text(.5,.5,"Two virtual tendon ports ↔ one shared 2-DoF finger",ha="center",fontsize=10,transform=ax.transAxes)
    save(fig,"01_architecture","Four motors, two transmission channels: constant-arm reference")
    fig,axs=plt.subplots(1,2,figsize=(10,4));im=axs[0].imshow(ARM*1000,cmap="Blues",vmin=0,vmax=15)
    for i in range(2):
        for j in range(2):axs[0].text(j,i,f"{ARM[i,j]*1000:g}",ha="center",va="center",color="white" if ARM[i,j]>.012 else "black")
    axs[0].set(xticks=[0,1],xticklabels=["q1","q2"],yticks=[0,1],yticklabels=["e1","e2"],title="Analytic excursion Jacobian [mm/rad]")
    rows=physics["geometry"]["rows"];err=np.array([np.max(abs(np.array(v["finite_difference"])-v["analytic"])) for v in rows]).reshape(11,13)
    image=axs[1].imshow(err,origin="lower",aspect="auto",extent=(0,150,-30,60));fig.colorbar(image,ax=axs[1],label="Maximum absolute error [m/rad]")
    axs[1].set(xlabel="q2 [deg]",ylabel="q1 [deg]",title="Finite differences − analytic length Jacobian")
    save(fig,"02_jacobian","Full-range analytic, numerical and MuJoCo Jacobian agreement")
    fig,axs=plt.subplots(1,2,figsize=(10,4));corners=np.array(physics["geometry"]["torque_corners_Nm"])-ARM.T@np.array([10.,10.])
    axs[0].add_patch(Polygon(corners,alpha=.25));axs[0].plot(*np.vstack([corners,corners[0]]).T);axs[0].plot(0,0,"ko")
    axs[0].set(xlabel="Net q1 torque at calibrated home [N m]",ylabel="Net q2 torque [N m]",xlim=(-.35,.85),ylim=(-.15,.35))
    grid=physics["geometry"]["static_feasible_grid"];q=np.degrees([v["q_rad"] for v in grid]);ok=np.array([v["feasible"] for v in grid])
    axs[1].scatter(q[~ok,0],q[~ok,1],s=7,color="lightgrey",label="Outside 0–40 N");axs[1].scatter(q[ok,0],q[ok,1],s=7,label="Static free-space feasible")
    axs[1].set(xlabel="q1 [deg]",ylabel="q2 [deg]");axs[1].legend(fontsize=8)
    save(fig,"03_torque_feasibility","Full rank with unilateral tensions: a bounded torque region")
    fig,axs=plt.subplots(2,2,figsize=(10,6),sharex=True)
    for col,motion in enumerate(("proximal","distal")):
        d=ca[f"{motion}_free_elastic_feedforward"]
        for j in range(2):
            axs[j,col].plot(d[:,0],np.degrees(d[:,3+j]),"k--",label="Target");axs[j,col].plot(d[:,0],np.degrees(d[:,1+j]),label="Actual")
            axs[j,col].set(ylabel=f"q{j+1} [deg]",title=motion if j==0 else None)
        axs[1,col].set_xlabel("Time [s]")
    axs[0,1].set_ylim(3.,8.);axs[1,0].set_ylim(9.,14.)
    axs[0,0].legend();save(fig,"04_independent_control","Independent joint motion through two finite transmission models")
    fig,axs=plt.subplots(2,2,figsize=(10,6),sharex=True);d=ca["coordinated_free_elastic_feedforward"]
    for i in range(2):
        axs[0,i].plot(d[:,0],d[:,24+i]*1000,"k--",label="Motor reference");axs[0,i].plot(d[:,0],d[:,5+4*i]*20,label="Encoder travel")
        axs[0,i].set(ylabel="Reel-in [mm]",title=f"Actuator motor {i+1}");axs[0,i].legend(fontsize=8)
        axs[1,i].plot(d[:,0],d[:,8+4*i],label="Command");axs[1,i].plot(d[:,0],d[:,7+4*i],label="Measured current");axs[1,i].set(xlabel="Time [s]",ylabel="Current [A]");axs[1,i].legend(fontsize=8)
    save(fig,"05_motor_states","Independent motor commands and measured actuator states")
    fig,axs=plt.subplots(2,2,figsize=(10,6),sharex=True)
    for col,condition in enumerate(("free","contact")):
        d=ca[f"coordinated_{condition}_elastic_feedforward"]
        for i in range(2):
            axs[i,col].plot(d[:,0],d[:,13+i],label="Input");axs[i,col].plot(d[:,0],d[:,15+i],label="Output");axs[i,col].set(ylabel=f"Channel {i+1} tension [N]",title=condition if i==0 else None)
        axs[1,col].set_xlabel("Time [s]")
    axs[0,0].legend();save(fig,"06_two_port_tensions","Two independently evolving input/output tension pairs")
    fig,axs=plt.subplots(1,2,figsize=(10,4));d=ca["coordinated_free_elastic_feedforward"]
    for i in range(2):
        axs[i].plot(d[:,17+i]*1000,d[:,15+i]);axs[i].set(xlabel="Incremental apparent deformation [mm]",ylabel="Distal tension [N]",title=f"Channel {i+1}")
    save(fig,"07_deformation_hysteresis","Executed loading history and tendon deformation")
    fig,axs=plt.subplots(3,1,figsize=(10,7),sharex=True);d=ca["coordinated_contact_elastic_feedforward"]
    for j in range(2):
        axs[j].plot(d[:,0],np.degrees(d[:,3+j]),"k--",label="Target (free-space inverse)");axs[j].plot(d[:,0],np.degrees(d[:,1+j]),label="Actual")
        axs[j].set_ylabel(f"q{j+1} [deg]")
    axs[0].legend();axs[2].plot(d[:,0],d[:,19]);axs[2].set(xlabel="Time [s]",ylabel="Contact force [N]")
    save(fig,"08_contact_control","Contact adds load: free-space feedforward does not impose joint targets")
    estimates={name:np.load(evaluation_path/f"{name}.npz") for name in ("rigid","compliance","physics","gru-seed0")}
    fig,axs=plt.subplots(2,2,figsize=(11,6),sharex="col")
    for col,index in enumerate((4,5)):
        name=f"tt_test_nominal_{index:03d}";r=lookup[name]
        for j in range(2):
            axs[j,col].plot(r["time"],np.degrees(r["y"][:,j]),"k",label="Reference")
            for model in estimates:axs[j,col].plot(r["time"],np.degrees(estimates[model][name][:,j]),label=model,alpha=.8)
            axs[j,col].set(ylabel=f"q{j+1} [deg]",title=("free" if index==4 else "contact") if j==0 else None)
        axs[1,col].set_xlabel("Time [s]")
    axs[0,0].legend(fontsize=8);save(fig,"09_joint_observers","Eight-channel motor-only estimates on identical held-out trajectories")
    fig,axs=plt.subplots(2,1,figsize=(12,7),sharex=True);names=list(groups);x=np.arange(len(names))
    for j in range(2):
        for model in ("rigid","compliance","physics"):axs[j].plot(x,[errors(model,g)[j] for g in names],"o-",label=model)
        axs[j].errorbar(x,[multiseed[g]["mean_mae_deg"][j] for g in names],yerr=[multiseed[g]["seed_sd_deg"][j] for g in names],fmt="o-",label="GRU mean ± seed SD")
        axs[j].set_ylabel(f"q{j+1} full-run MAE [deg]");axs[j].legend(fontsize=8)
    axs[1].set_xticks(x,names,rotation=40,ha="right");save(fig,"10_observer_conditions","Strong geometry baselines, calibrated mechanics and changed conditions")
    fig,axs=plt.subplots(1,2,figsize=(11,4))
    for condition in ("free","contact"):
        rows=[v for v in physics["numerics"].values() if v["config"]["contact"]==(condition=="contact") and v["simulation"]["plant_dt"]==.000025]
        rows=sorted(rows,key=lambda v:v["simulation"]["outer_dt"])
        for j in range(2):axs[0].plot([v["simulation"]["outer_dt"]*1000 for v in rows],[v["joint_rmse_vs_ref_deg"][j] for v in rows],"o-",label=f"{condition} q{j+1}")
    rows=[(k,v) for k,v in physics["numerics"].items() if k.startswith("contact_") and v["simulation"]["plant_dt"]==.00005]
    labels=[f"C {v['simulation']['controller_period']*1000:g} / D {v['simulation']['emulator_delay']*1000:g} / S {v['simulation']['contact_solref']*1000:g}" for k,v in rows]
    for j in range(2):axs[1].plot(labels,[v["joint_rmse_vs_ref_deg"][j] for k,v in rows],"o-",label=f"q{j+1}")
    axs[0].set(xlabel="MuJoCo step [ms], plant 25 µs",ylabel="Joint RMSE vs finest reference [deg]");axs[0].legend(fontsize=8)
    axs[1].set(ylabel="Contact RMSE vs reference [deg]",xlabel="Controller / delay / solver time [ms]");axs[1].tick_params(axis="x",rotation=30,labelsize=8);axs[1].legend()
    save(fig,"11_numerical_sensitivity","Numerical, controller-rate, delay and contact-solver sensitivity")
    fig,axs=plt.subplots(1,2,figsize=(11,4));sens=sorted(observability["sensitivities"],key=lambda v:v["protocol"])
    for j in range(2):axs[0].plot([v["protocol"] for v in sens],[v["rms_singular_values_per_degree"][j] for v in sens],"o-",label=f"Singular value {j+1}")
    axs[0].set_ylabel("RMS sensitivity [scale / degree]");axs[0].legend()
    pairs=observability["ambiguity"]["pairs"]
    for horizon in (.005,.01,.025,.05,.1,.25,.6):
        selected=[v for v in pairs if v["horizon_s"]==horizon]
        axs[1].scatter([v["motor_normalized_rms"] for v in selected],[v["joint_rms_gap_deg"] for v in selected],s=10,label=f"{horizon:g} s")
    axs[1].axvline(1,color="k",ls="--");axs[1].axhline(3,color="k",ls="--");axs[1].set(xscale="log",xlabel="Motor-history difference / comparison scale",ylabel="Joint trajectory RMS gap [deg]");axs[1].legend(fontsize=7,ncol=2)
    save(fig,"12_distinguishability","Conditional dynamic sensitivity and restricted identical-setup search")
    va=np.load(p/"physics/verification.npz");fig,axs=plt.subplots(1,2,figsize=(11,4))
    for dt in (.0001,.00005):
        data=va[f"ch1_dt{dt:g}"];axs[0].plot(data[:,0],data[:,-1]*1e6,label=f"{dt*1e6:g} µs")
    axs[0].set(xlabel="Time [s]",ylabel="Isolated transmission energy residual [µJ]");axs[0].legend()
    selected=["coordinated_free_elastic_feedforward","coordinated_contact_elastic_feedforward"]
    for j in range(2):axs[1].bar(np.arange(2)+(j-.5)*.3,[control[k]["port_work_mismatch_J"][j]*1e6 for k in selected],width=.3,label=f"Channel {j+1}")
    axs[1].set(xticks=[0,1],xticklabels=["Free","Contact"],ylabel="Final virtual/physical port work mismatch [µJ]");axs[1].legend()
    save(fig,"13_energy_and_port_exchange","Transmission energy and rendered-port mismatch are separate checks")
    # Preserve previous reports and models byte-for-byte modulo checkout line endings.
    tracked=subprocess.check_output(["git","ls-tree","-r","--name-only","HEAD","sim/tendon-in-the-loop"],cwd=ROOT.parents[1],text=True).splitlines()
    preserved={}
    for name in tracked:
        if name.endswith("/README.md"):continue
        original=subprocess.check_output(["git","show","HEAD:"+name],cwd=ROOT.parents[1])
        current=(ROOT.parents[1]/name).read_bytes();preserved[name]=original.replace(b"\r\n",b"\n")==current.replace(b"\r\n",b"\n")
    assert all(preserved.values())
    with h5py.File(a.dataset) as file:
        manifest=[dict(id=n,config=json.loads(g.attrs["config"]),quality=json.loads(g.attrs["quality"])) for n,g in file["episodes"].items()]
    for record in manifest:
        channels,finger=resolved_configuration(record["config"])
        record["resolved_configuration"]=dict(channels=[c.to_dict() for c in channels],finger=asdict(finger),
            provenance="Reconstructed from the same deterministic factory and stored episode specification; numerical arrays are unchanged.")
    training={path.parent.name:read(path) for path in (p/"models").glob("*/training.json")}
    replay=read(p/"calibrated-replay/evaluation.json");replay_exact=evaluation["metrics"]==replay["metrics"];assert replay_exact
    sources={str(path.relative_to(ROOT)).replace("\\","/"):sha(path) for pattern in
        ("til/two_tendon*.py","scripts/two_tendon*.py","tests/test_two_tendon*.py","TWO_TENDON_DESIGN.md","TWO_TENDON_VERIFICATION.md") for path in ROOT.glob(pattern)}
    report=dict(scope="Numerical constant-moment-arm two-tendon reference, not verified spatial routing or physical HIL hardware.",
        sessions=len(runs),training_sessions=sum(r["split"]=="train" for r in runs),validation_sessions=sum(r["split"]=="validation" for r in runs),
        groups=groups,aggregates=aggregate,multiseed=multiseed,evaluation=evaluation,training=training,manifest=manifest,
        physics=physics,control=control,observability=observability,gates=gates,figures=figures,
        initial_fixed_noise_physics=read(p/"evaluation/evaluation.json")["metrics"]["physics"],
        rehoming=read(p/"rehome.json"),plant_prefix_replay=read(p/"factory-replay.json"),
        historical_files_preserved=preserved,frozen_evaluation_replay_exact=replay_exact,
        dataset_sha256=sha(a.dataset),source_sha256=sources,package_versions={name:version(name) for name in ("numpy","torch","mujoco","h5py","matplotlib","pytest")},
        git_commit=subprocess.check_output(["git","rev-parse","HEAD"],text=True).strip(),worktree_dirty_at_export=bool(subprocess.check_output(["git","status","--porcelain"],text=True)),
        caveats=["Four proposed motors: only two robot actuators; each emulator is a finite-force boundary-position servo.",
            "The SVG centerline does not derive the imposed excursions. Constant-arm fixed tendons are an explicit reference approximation.",
            "Historical single-tendon results are not equal-information benchmarks for this architecture.",
            "Actual contact labels are used for scoring only; some requested contact trajectories never touch the object.",
            "Physics dynamics omit contact. Two measured motor excursions still provide full-rank length updates.",
            "Conditional sensitivity, algebraic invertibility and neural accuracy do not prove global observability.",
            "Noise/calibration priors remain hypothetical. The actuator's inner servo reads true rotor state, following the legacy assumption."])
    (public/"assets/data/tendon-in-the-loop/two-tendon-verification.json").write_text(json.dumps(report,indent=2,allow_nan=False)+"\n",encoding="utf8")
    print(json.dumps(dict(groups={k:len(v) for k,v in groups.items()},multiseed=multiseed,
        baselines={name:{group:errors(name,group) for group in groups} for name in ("rigid","compliance","physics")}),indent=2))


if __name__=="__main__":main()
