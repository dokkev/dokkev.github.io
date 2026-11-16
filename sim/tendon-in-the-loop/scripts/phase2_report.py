"""Export Phase 2 metrics and 22 figures from saved experiments, never fabricated curves."""
import argparse,hashlib,json,platform,subprocess,sys,time
from datetime import datetime,timezone
from dataclasses import asdict
from pathlib import Path
import h5py
import numpy as np
import torch
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from til.phase2_observer import load_runs,rigid_prediction,score
from til.transmission import TransmissionPlant,TransmissionParams,Specimen,FIXTURES
from til.observer import Observer


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--dataset",required=True);ap.add_argument("--experiments",required=True)
    ap.add_argument("--physics",required=True);ap.add_argument("--report",required=True);ap.add_argument("--figures",required=True)
    a=ap.parse_args();out=Path(a.figures);out.mkdir(parents=True,exist_ok=True)
    plt.rcParams.update({"svg.fonttype":"none","svg.hashsalt":"til-phase2","font.size":9})
    paths=sorted(Path(a.experiments).glob("*/metrics.json"));models={p.parent.name:json.loads(p.read_text()) for p in paths}
    primary=models["joint-seed0"]
    predictions=np.load(Path(a.experiments)/"joint-seed0/predictions.npz")
    runs=load_runs(a.dataset);byid={r["id"]:r for r in runs}
    physics=json.loads((Path(a.physics)/"verification.json").read_text())
    figures=[]
    def save(fig,name):
        for ax in fig.axes:
            ax.grid(alpha=.2);ax.spines[["top","right"]].set_visible(False)
        path=out/f"{name}.svg";fig.savefig(path,metadata={"Date":None})
        path.write_text("\n".join(x.rstrip() for x in path.read_text(encoding="utf8").splitlines())+"\n",encoding="utf8")
        if name.startswith(("11_","12_","13_","18_")):
            preview=ROOT/"figures/phase2/previews";preview.mkdir(parents=True,exist_ok=True);fig.savefig(preview/f"{name}.png",dpi=120)
        plt.close(fig);figures.append(path.name)
    def panel(rows=1,cols=1,size=None):return plt.subplots(rows,cols,figsize=size or (9,3.5*rows),layout="constrained",squeeze=False)
    def decimate(*arrays):
        step=max(1,int(np.ceil(len(arrays[0])/1200)));return tuple(x[::step] for x in arrays)
    with h5py.File(a.dataset) as file:
        dataset_versions=json.loads(file.attrs["versions"])
        manifest=[dict(id=n,config=json.loads(g.attrs["config"]),quality=json.loads(g.attrs["quality"])) for n,g in file["episodes"].items()]
        sample=next(r for r in runs if r["split"]=="test_in_range" and r["contact"].any())
        g=file["episodes"][sample["id"]];t=g["time"][()]
        # Controlled isolated fixture runs: identical specimen and boundary motion across fixtures.
        isolated={}
        for fixture in FIXTURES:
            plant=TransmissionPlant(TransmissionParams(routing=FIXTURES[fixture]))
            rows=[];dt=.0002
            for i in range(10000):
                ti=(i+1)*dt;x=.001*(1-np.cos(2*np.pi*ti));v=.001*2*np.pi*np.sin(2*np.pi*ti)
                plant.step(dt,x,v,0,0)
                if i%5==0:rows.append([ti,x,plant.s.T1,plant.s.T2,plant.s.tau_f,plant.s.E_diss,plant.s.phi_d])
            isolated[fixture]=np.array(rows)
        fig,ax=panel();r=isolated["large_guide"]
        ax[0,0].plot(r[:,1]*1000,r[:,2],label="Input tension, synthetic truth")
        ax[0,0].plot(r[:,1]*1000,r[:,3],label="Distal tension, synthetic truth")
        ax[0,0].set(xlabel="Boundary extension [mm]",ylabel="Tension [N]",title="Dimensioned viscoelastic reference / large guide");ax[0,0].legend()
        save(fig,"01_force_extension")
        fig,ax=panel()
        for name,r in isolated.items():ax[0,0].plot(r[:,1]*1000,r[:,3],label=name)
        ax[0,0].set(xlabel="Boundary extension [mm]",ylabel="Distal tension [N]",title="Loading / unloading: same specimen, fixed fixture variants");ax[0,0].legend()
        save(fig,"02_hysteresis")
        fig,ax=panel()
        for channel,label in (("transmission/input_tension","Input load-cell model"),("transmission/output_tension","Distal load-cell model"),("ground_truth/output_tension_true","Distal synthetic truth")):
            tx,y=decimate(t,g[channel][()]);ax[0,0].plot(tx,y,label=label)
        ax[0,0].set(xlabel="Time [s]",ylabel="Tension [N]",title=sample["id"]);ax[0,0].legend();save(fig,"03_input_output_tension")
        fig,ax=panel(2)
        ax[0,0].plot(r[:,0],r[:,2]-r[:,3]);ax[0,0].set(ylabel="T_in - T_out [N]",title="Motion reversal / wide-wrap synthetic reference")
        ax[1,0].plot(r[:,0],r[:,6]);ax[1,0].set(xlabel="Time [s]",ylabel="Pulley velocity [rad/s]");save(fig,"04_reversal")
        fig,ax=panel()
        for name,r in isolated.items():ax[0,0].plot(r[:,2],r[:,3],label=name)
        ax[0,0].set(xlabel="Input tension [N]",ylabel="Distal tension [N]",title="Controlled routing comparison / synthetic truth");ax[0,0].legend();save(fig,"05_routing_transfer")
        drift=next(r for r in runs if r["split"]=="test_drift");dg=file["episodes"][drift["id"]];tt=dg["time"][()]
        fig,ax=panel(3)
        for axis,key,label,factor in ((ax[0,0],"effective_stiffness","Equivalent segment stiffness [N/m]",1),
                (ax[1,0],"creep_state","Accumulated irreversible creep [mm]",1000),(ax[2,0],"effective_friction","Guide friction coefficient [1]",1)):
            tx,y=decimate(tt,dg["ground_truth/"+key][()]);axis.plot(tx,y*factor);axis.set(ylabel=label)
        ax[0,0].set_title(drift["id"]+" / synthetic internal states");ax[2,0].set_xlabel("Session time [s]");save(fig,"06_mechanics_history")
        fig,ax=panel()
        q=g["simulation/joint_positions"][()]
        for i in np.linspace(0,len(q)-1,8).astype(int):
            q1,q2=q[i];x1=.05*np.cos(q1);z1=-.05*np.sin(q1)
            ax[0,0].plot(np.array([0,x1,x1+.035*np.cos(q1+q2)])*1000,np.array([0,z1,z1-.035*np.sin(q1+q2)])*1000,"o-",label=f"{t[i]:.2f} s")
        ax[0,0].set(xlabel="x [mm]",ylabel="z [mm]",title="MuJoCo joint-reference motion / "+sample["id"]);ax[0,0].axis("equal");ax[0,0].legend(ncol=4);save(fig,"07_finger_motion")
        fig,ax=panel(2)
        tx,qq,j=decimate(t,q,g["simulation/tendon_moment_arms"][()])
        for i in range(2):ax[0,0].plot(tx,qq[:,i]*180/np.pi,label=f"q{i+1}");ax[1,0].plot(tx,j[:,i]*1000,label=f"dl/dq{i+1}")
        ax[0,0].set(ylabel="Joint angle [deg]",title="MuJoCo references and configuration-dependent geometry");ax[1,0].set(xlabel="Time [s]",ylabel="Tendon Jacobian [mm/rad]")
        ax[0,0].legend();ax[1,0].legend();save(fig,"08_joints_moment_arms")
        fig,ax=panel(2)
        for axis,key,label in ((ax[0,0],"simulation/contact_force","Contact normal force [N]"),(ax[1,0],"ground_truth/output_tension_true","Distal tension [N]")):
            tx,y=decimate(t,g[key][()]);axis.plot(tx,y);axis.set(ylabel=label)
        ax[0,0].set_title("Contact solver and transmission reference / "+sample["id"]);ax[1,0].set_xlabel("Time [s]");save(fig,"09_contact_tension")
        fig,ax=panel()
        for key,label in (("commanded_position","Command"),("actual_position","Encoder model")):
            tx,y=decimate(t,g["emulator/"+key][()]);ax[0,0].plot(tx,y*1000,label=label)
        ax[0,0].set(xlabel="Time [s]",ylabel="Output displacement [mm]",title="Finite-mass / finite-effort emulation");ax[0,0].legend();save(fig,"10_emulator_motion")
    # All remaining plots use stored held-out predictions and metrics.
    test_sets=["test_in_range","test_specimen","test_routing","test_combined"]
    for column,name,label,scale in ((0,"11_predicted_tension","Distal tension [N]",1.),(1,"12_proximal_joint","Proximal joint [deg]",180/np.pi),(2,"13_distal_joint","Distal joint [deg]",180/np.pi)):
        fig,axes=panel(2,2,(11,7))
        for axis,split in zip(axes.ravel(),test_sets):
            run=next(r for r in runs if r["split"]==split and r["contact"].any())
            tx,y,estimate,base=decimate(run["time"],run["y"][:,column],predictions[run["id"]][:,column],rigid_prediction(run)[:,column])
            axis.plot(tx,y*scale,label="Synthetic reference",color="#202b35");axis.plot(tx,estimate*scale,label="GRU seed 0",color="#b7473b")
            axis.plot(tx,base*scale,label="QDD / rigid equal-joint baseline",alpha=.6,color="#5f8a9b")
            axis.set(xlabel="Time [s]",ylabel=label,title=split)
        axes[0,0].legend(fontsize=7);save(fig,name)
    fig,ax=panel(1,2,(10,4))
    for i,key in enumerate(("q1_mae_deg","q2_mae_deg")):
        values=[]
        for regime in ("contact","free","reversal","initialization","after_settling"):
            vals=[primary["per_run"][r["id"]][regime][key] for r in runs if r["split"].startswith("test") and primary["per_run"][r["id"]][regime] is not None]
            values.append(np.mean(vals))
        ax[0,i].bar(range(5),values);ax[0,i].set(xticks=range(5),xticklabels=["Contact","Free","Reversal","Initial","Settled"],ylabel="Joint MAE [deg]",title=f"q{i+1} / mean across test runs")
        ax[0,i].tick_params(axis="x",rotation=25)
    save(fig,"14_contact_free_error")
    fig,ax=panel()
    for key in ("q1_mae_deg","q2_mae_deg","tension_mae_N"):
        hs=primary["periodic_history_reset"];xx=sorted(map(int,hs));yy=[np.mean([v[key] for v in hs[str(h)].values()]) for h in xx]
        ax[0,0].plot(np.array(xx)*.005,yy,"o-",label=key)
    ax[0,0].set(xscale="log",xlabel="Memory reset interval [s]",ylabel="MAE [deg or N, labeled curves]",title="Effective history ablation / seed 0; no warmup samples removed");ax[0,0].legend();save(fig,"15_history_length")
    fig,ax=panel(1,3,(14,4))
    tests=[r for r in runs if r["split"].startswith("test")]
    for axis,field,label in ((ax[0,0],"stiffness","Mean equivalent stiffness [N/m]"),(ax[0,1],"slack","Fraction with a slack segment [1]"),(ax[0,2],"amplitude","Motor reference amplitude [mm]")):
        for key in ("q1_mae_deg","q2_mae_deg"):
            axis.scatter([r["config"]["profile"]["amplitude"]*1000 if field=="amplitude" else r[field].mean() for r in tests],[primary["per_run"][r["id"]]["all"][key] for r in tests],s=16,label=key)
        axis.set(xlabel=label,ylabel="Joint MAE [deg]",title="Across-run associations, not isolated causal effects");axis.legend()
    save(fig,"16_stiffness_slack_error")
    fig,ax=panel(1,2,(11,4))
    for axis,field in ((ax[0,0],"fixture_id"),(ax[0,1],"evolution")):
        groups=sorted({r["config"]["metadata"][field] for r in tests})
        for j,key in enumerate(("q1_mae_deg","q2_mae_deg")):
            vals=[np.mean([primary["per_run"][r["id"]]["all"][key] for r in tests if r["config"]["metadata"][field]==g]) for g in groups]
            axis.bar(np.arange(len(groups))+.35*j,vals,width=.35,label=key)
        axis.set(xticks=np.arange(len(groups))+.175,xticklabels=groups,ylabel="Joint MAE [deg]",title=field);axis.tick_params(axis="x",rotation=30);axis.legend()
    save(fig,"17_routing_aging_error")
    stress=[r for r in runs if r["split"]=="test_observability"]
    scales=np.array([2*np.pi/16384,.005,.01,.001]);pairs=[]
    for i,left in enumerate(stress):
        for right in stress[i+1:]:
            n=min(len(left["x"]),len(right["x"]),100)
            distance=float(np.sqrt(np.mean(((left["x"][:n]-right["x"][:n])/scales)**2)))
            qgap=np.sqrt(np.mean(((left["y"][:n,1:3]-right["y"][:n,1:3])*180/np.pi)**2))
            pairs.append(dict(a=left["id"],b=right["id"],motor_normalized_rms=distance,joint_rms_gap_deg=float(qgap)))
    best=min((p for p in pairs if p["joint_rms_gap_deg"]>10),key=lambda p:p["motor_normalized_rms"])
    left,right=byid[best["a"]],byid[best["b"]]
    fig,ax=panel(2,2,(10,6))
    for i,axis in enumerate(ax[0]):
        axis.plot(left["time"],left["x"][:,i],label="A");axis.plot(right["time"],right["x"][:,i],"--",label="B")
        axis.set(xlabel="Time [s]",ylabel=("Motor angle [rad]","Motor velocity [rad/s]")[i],title="Unknown preload / zero setup ambiguity");axis.legend()
        axis.set_ylim(-3*scales[i],3*scales[i])
        axis.axhspan(-scales[i],scales[i],alpha=.08,color="gray")
    for j,axis in enumerate(ax[1]):
        axis.plot(left["time"],left["y"][:,j+1]*180/np.pi,label="A reference");axis.plot(right["time"],right["y"][:,j+1]*180/np.pi,"--",label="B reference")
        axis.set(xlabel="Time [s]",ylabel=f"q{j+1} [deg]");axis.legend()
    save(fig,"18_ambiguous_histories")
    fig,ax=panel(1,2,(10,4))
    for axis,factor,xlabel in ((ax[0,0],"current_noise","Current white noise sigma [A]"),(ax[0,1],"telemetry_delay","Telemetry delay [ms]")):
        rr=[r for r in tests if r["config"]["metadata"].get("sensitivity_factor")==factor]
        rr.sort(key=lambda r:r["config"]["metadata"]["sensitivity_value"])
        for key in ("q1_mae_deg","q2_mae_deg","tension_mae_N"):
            axis.plot([r["config"]["metadata"]["sensitivity_value"]*(1000 if factor=="telemetry_delay" else 1) for r in rr],
                [primary["per_run"][r["id"]]["all"][key] for r in rr],"o-",label=key)
        axis.set(xlabel=xlabel,ylabel="MAE [deg or N, labeled curves]",title="Controlled one-factor replay");axis.legend(fontsize=7)
    save(fig,"19_sensor_sensitivity")
    fig,ax=panel(1,3,(14,4));conv=physics["convergence"][:-1]
    for key in ("tension_rmse_N","q1_rmse_deg","q2_rmse_deg","contact_force_rmse_N"):
        ax[0,0].plot([r["mujoco_dt_s"]*1000 for r in conv],[r[key] for r in conv],"o-",label=key)
    ax[0,0].set(xlabel="MuJoCo timestep [ms]",ylabel="RMSE vs finest [N or deg]",title="Fixed 31.25 us plant / controller step");ax[0,0].legend(fontsize=7)
    ax[0,1].plot([r["mujoco_dt_s"]*1000 for r in physics["convergence"]],[abs(r["energy_residual_J"]) for r in physics["convergence"]],"o-")
    ax[0,1].set(xlabel="MuJoCo timestep [ms]",ylabel="Transmission energy residual [J]",title="No actuator/electrical energy included")
    pc=physics["plant_convergence"][:-1]
    for key in ("tension_rmse_N","q1_rmse_deg","q2_rmse_deg"):
        ax[0,2].plot([r["plant_dt_s"]*1e6 for r in pc],[r[key] for r in pc],"o-",label=key)
    ax[0,2].set(xlabel="Plant / controller step [us]",ylabel="RMSE vs 25 us [N or deg]",title="Fixed 0.5 ms MuJoCo step");ax[0,2].legend(fontsize=7)
    save(fig,"20_timestep_convergence")
    fig,ax=panel(1,2,(10,4))
    budgets=[models[k] for k in ("quarter-seed0","half-seed0","joint-seed0")]
    for axis,split in zip(ax[0],("test_in_range","test_combined")):
        for key in ("q1_mae_deg","q2_mae_deg","tension_mae_N"):
            axis.plot([len(m["training_runs"]) for m in budgets],[m["metrics"][split]["all"][key] for m in budgets],"o-",label=key)
        axis.set(xlabel="Training runs [count]",ylabel="MAE [deg or N]",title=split+" / budget and coverage change");axis.legend(fontsize=7)
    save(fig,"21_data_budget")
    cpu={};torch.set_num_threads(2)
    for key in ("small-seed0","joint-seed0"):
        checkpoint=torch.load(Path(a.experiments)/key/"checkpoint.pt",weights_only=True)
        model=Observer(hidden=checkpoint["hidden"],outputs=checkpoint["outputs"]);model.load_state_dict(checkpoint["state_dict"]);model.eval()
        state=None;times=[]
        with torch.no_grad():
            for i in range(700):
                start=time.perf_counter_ns();_,state=model(torch.zeros(1,1,4),state)
                if i>=200:times.append((time.perf_counter_ns()-start)/1000)
        cpu[key]=dict(median_us=float(np.median(times)),p95_us=float(np.quantile(times,.95)),parameters=sum(p.numel() for p in model.parameters()),
            parameter_bytes=sum(p.numel()*p.element_size() for p in model.parameters()),recurrent_state_bytes=checkpoint["hidden"]*4,
            checkpoint_bytes=(Path(a.experiments)/key/"checkpoint.pt").stat().st_size,
            memory_scope="Weights and recurrent state only; not allocator/activation peak memory")
    fig,ax=panel(1,2,(10,4))
    labels=list(cpu);ax[0,0].bar(labels,[cpu[k]["median_us"] for k in labels]);ax[0,0].set(ylabel="Stateful CPU latency [us]",title="Batch 1 / two CPU threads, post-experiment benchmark")
    for metric in ("q1_mae_deg","q2_mae_deg"):
        ax[0,1].plot([cpu[k]["parameters"] for k in labels],[models[k]["metrics"]["test_in_range"]["all"][metric] for k in labels],"o-",label=metric)
    ax[0,1].set(xlabel="Trainable parameters [count]",ylabel="Joint MAE [deg]",title="16 vs 32 hidden units / same training budget");ax[0,1].legend();save(fig,"22_complexity_latency")
    joint=[models[f"joint-seed{s}"] for s in (0,1,2)];summary={}
    for split in primary["metrics"]:
        summary[split]={}
        for metric in primary["metrics"][split]["all"]:
            values=[m["metrics"][split]["all"][metric] for m in joint]
            summary[split][metric]=dict(mean=float(np.mean(values)),std=float(np.std(values,ddof=1)),seeds=values)
    source_files=sorted([*ROOT.glob("til/*.py"),*ROOT.glob("scripts/phase2*.py"),*ROOT.glob("tests/test_phase2*.py"),ROOT/"scripts/train_observer.py",ROOT/"experiments/phase2.json"])
    report=dict(scope=f"Phase 2 synthetic-only pilot and {len(manifest)}-session study; no physical validation or global observability claim.",
        generated_at_utc=datetime.now(timezone.utc).isoformat(),
        dataset_versions=dataset_versions,dataset_sha256=hashlib.sha256(Path(a.dataset).read_bytes()).hexdigest(),
        multi_seed=summary,models=models,physics=physics,ambiguity=dict(best_pair=best,search=pairs,
            comparison_scales=scales.tolist(),horizon_s=.5,interpretation="Valid free-space equilibria with different hidden spring preloads and calibrated tendon zeros. Not a counterexample for a known fixed-preload robot."),
        cpu_benchmark=cpu,manifest=manifest,figures=figures,platform=platform.platform(),
        git_commit=subprocess.check_output(["git","rev-parse","HEAD"],cwd=ROOT,text=True).strip(),
        worktree_dirty_at_export=bool(subprocess.check_output(["git","status","--porcelain"],cwd=ROOT,text=True).strip()),
        source_sha256={str(p.relative_to(ROOT)).replace("\\","/"):hashlib.sha256(p.read_bytes().replace(b"\r\n",b"\n")).hexdigest() for p in source_files},
        cautions=["Engineering ranges are hypothetical; more constitutive complexity is not evidence of hardware fidelity.",
                  "Means/normalization/calibration and model selection use training/validation only; test runs never become neural features.",
                  "Diagnostic flags and failed sessions remain in the manifest. Severe training protocol failures are excluded explicitly.",
                  "History ablation resets memory periodically; it is not a centered or noncausal window.",
                  "Group associations mix factors; controlled physics and sensor sweeps are separate.",
                  "Energy residual is for the external transmission boundary, not the whole controlled/electrical system.",
                  "Local sensitivity fixes other hidden states; it cannot prove full-system or global observability.",
                  "No structured adaptive observer is implemented or claimed."])
    Path(a.report).parent.mkdir(parents=True,exist_ok=True)
    Path(a.report).write_text(json.dumps(report,indent=2,allow_nan=False)+"\n",encoding="utf8")
    print(json.dumps(dict(sessions=len(manifest),figures=len(figures),best_pair=best,multi_seed=summary),indent=2))


if __name__=="__main__":main()
