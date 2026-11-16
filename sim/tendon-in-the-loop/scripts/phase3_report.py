"""Export saved Phase 3 results; no fitting or simulation occurs here."""
import argparse, hashlib, json, platform, subprocess, sys
from importlib.metadata import version
from pathlib import Path
import h5py
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from til.phase3_observer import load_runs


def read(path):return json.loads(Path(path).read_text(encoding="utf8"))
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--dataset",default="data/phase3/phase3.h5")
    ap.add_argument("--results",default="figures/phase3");ap.add_argument("--public",default="../../public")
    a=ap.parse_args();p=Path(a.results);public=Path(a.public)
    dest=public/"assets/img/tendon-in-the-loop/phase3";dest.mkdir(parents=True,exist_ok=True)
    preview=p/"previews";preview.mkdir(parents=True,exist_ok=True)
    plt.rcParams.update({"font.family":"DejaVu Sans","font.size":10,"svg.fonttype":"none","svg.hashsalt":"til-phase3",
        "axes.spines.top":False,"axes.spines.right":False,"axes.grid":True,"grid.alpha":.2})
    figures=[]
    def save(fig,name,title):
        fig.suptitle(title,fontsize=13);fig.tight_layout(rect=(0,0,1,.94))
        path=dest/(name+".svg");fig.savefig(path,metadata={"Date":None})
        path.write_text("\n".join(s.rstrip() for s in path.read_text(encoding="utf8").splitlines())+"\n",encoding="utf8")
        fig.savefig(preview/(name+".png"),dpi=115);plt.close(fig)
        figures.append(dict(file="/assets/img/tendon-in-the-loop/phase3/"+path.name,title=title,sha256=sha(path)))
    runs=load_runs(a.dataset);byid={r["id"]:r for r in runs};ev=read(p/"evaluation/evaluation.json");metrics=ev["metrics"]
    probing=read(p/"study/probing.json");pa=np.load(p/"study/probing.npz")
    mechanisms=read(p/"mechanism-evaluation/mechanism-evaluation.json")
    numerical=read(p/"verification/numerics.json");control=read(p/"control/control.json")
    nuisance=read(p/"study/calibration-sensitivity.json")
    sensor=read(p/"sensor-evaluation/evaluation.json");sruns=load_runs("data/phase3/sensor.h5")
    def primary(case,condition):return [r["id"] for r in runs if r["split"]=="test" and r["config"]["metadata"]["case"]==case and r["config"]["metadata"]["condition"]==condition]
    def meanmetric(model,ids,window="post_probe",metric="mae"):
        rows=[metrics[model][i][window] for i in ids if metrics[model][i][window] is not None]
        return [float(np.mean([r[f"q{j}_{metric}_deg"] for r in rows])) for j in (1,2)] if rows else None
    aggregates={}
    for model in metrics:
        aggregates[model]={}
        groups={f"{case}/{cond}":primary(case,cond) for case in ("A","B","C_passive","C_probe") for cond in ("free","contact")}
        groups.update({s:[r["id"] for r in runs if r["split"]==s] for s in sorted({r["split"] for r in runs if r["split"].startswith("test_")})})
        for group,ids in groups.items():
            aggregates[model][group]=dict(ids=ids,windows={w:{m:meanmetric(model,ids,w,m) for m in ("mae","rmse","p95","max")} for w in next(iter(metrics[model].values()))},
                worst_full_error_deg=[max(metrics[model][i]["all"][f"q{j}_max_deg"] for i in ids) for j in (1,2)],
                aggregation="Equal mean of per-run metrics; max in windows is mean per-run maximum. worst_full_error_deg is maximum across runs.")
    multiseed={}
    for case in ("A","B","C_passive","C_probe","pooled"):
        multiseed[case]={}
        for cond in ("free","contact"):
            ids=primary(case if case!="pooled" else "C_passive",cond)
            values=np.array([meanmetric(f"{case}-seed{s}",ids) for s in range(3)])
            multiseed[case][cond]=dict(mean_mae_deg=values.mean(0).tolist(),seed_sd_deg=values.std(0,ddof=1).tolist(),by_seed=values.tolist(),runs_per_seed=len(ids))
    paired={}
    for family in ("C_passive","C_probe"):
        differences=[]
        for seed in range(3):
            for passive in [r for r in runs if r["split"]=="test" and r["config"]["metadata"]["case"]=="C_passive"]:
                active=passive["id"].replace("C_passive","C_probe");name=f"{family}-seed{seed}"
                differences.append([metrics[name][active]["post_probe"][f"q{j}_mae_deg"]-metrics[name][passive["id"]]["post_probe"][f"q{j}_mae_deg"] for j in (1,2)])
        paired[family]=dict(active_minus_passive_deg=np.mean(differences,0).tolist(),paired_differences_deg=differences,
            note="Same frozen model on matched post-prefix tasks. Positive means active is worse; seed/run pairs are not independent hardware trials.")
    # 01: actual initial posture, no fabricated homing-controller trajectory.
    fig,ax=plt.subplots(figsize=(7,3.6));r=byid[primary("C_passive","free")[0]];q=r["y"][0]
    from til.finger import FingerParams
    fp=FingerParams()
    def rotation(theta):return np.array([[np.cos(theta),np.sin(theta)],[-np.sin(theta),np.cos(theta)]])
    R1=rotation(q[0]);R2=rotation(q.sum());joint=R1@np.array([fp.L1,0.])
    xy=np.array([[0,0],joint,joint+R2@np.array([fp.L2,0.])])*1000
    tendon=np.array([[-fp.a_base,-fp.h],R1@np.array([fp.b_site,-fp.h]),R1@np.array([fp.L1-fp.b_site,-fp.h]),joint+R2@np.array([fp.b_site,-fp.h]),joint+R2@np.array([fp.b_site+.012,-fp.h])])*1000
    ax.plot(xy[:,0],xy[:,1],"o-",lw=5,label="Links");ax.plot(tendon[:,0],tendon[:,1],"o-",color="crimson",lw=2,label="MuJoCo flexor site chain")
    ax.set(xlabel="World x [mm]",ylabel="World z [mm]",aspect="equal",ylim=(-27,30));ax.legend(loc="lower left",fontsize=8)
    ax.text(-15,17,f"Recorded home: {np.degrees(q[0]):.2f}°, {np.degrees(q[1]):.2f}°\nKnown jig reference; 10 N pretension",fontsize=10)
    save(fig,"01_calibrated_home","Calibrated initial configuration")
    # 02: measured post-reference preparation rather than assumed homing actuation.
    fig,axs=plt.subplots(2,1,figsize=(8,5),sharex=True)
    with h5py.File(a.dataset) as f:
        g=f["episodes"][r["id"]];t=g["time"][:];mask=t<=1.2
        axs[0].plot(t[mask],np.degrees(g["simulation/joint_positions"][:][mask]));axs[0].set(ylabel="Joint angle [deg]",ylim=(0,12));axs[0].legend(["q1","q2"])
        axs[1].plot(t[mask],g["transmission/input_tension"][:][mask],label="Input sensor");axs[1].plot(t[mask],g["transmission/output_tension"][:][mask],label="Output sensor")
        axs[1].set(xlabel="Time after reference initialization [s]",ylabel="Tension [N]",ylim=(9,11));axs[1].legend()
    save(fig,"02_reference_initialization","Post-jig hold: fixed home, zero and pretension")
    # 03 and 06: executed probe and conditional derivatives.
    fig,axs=plt.subplots(2,1,figsize=(9,5),sharex=True)
    for kind in ("hold","low","pulse","chirp","multisine","reversal"):
        d=pa[f"{kind}_home_0.0005_1.2__trace"];axs[0].plot(d[:,0],d[:,9]*1000,label=kind);axs[1].plot(d[:,0],d[:,3]*20)
    axs[0].set(ylabel="Command [mm]");axs[0].legend(ncol=3);axs[1].set(ylabel="Actual motor travel [mm]",xlabel="Time [s]")
    save(fig,"03_executed_probes","Bounded probes executed by the motor and transmission")
    # 04 / 05: same test trajectories, all initial errors retained.
    preds={n:np.load(p/f"evaluation/{n}-predictions.npz") for n in ("C_passive-seed0","physics_ekf","kinematic")}
    fig,axs=plt.subplots(2,2,figsize=(11,6),sharex="col")
    for col,cond in enumerate(("free","contact")):
        i=primary("C_passive",cond)[0];r=byid[i]
        for j in range(2):
            ax=axs[j,col];ax.plot(r["time"],np.degrees(r["y"][:,j]),"k",label="Reference")
            for name,style in (("C_passive-seed0","-"),("physics_ekf","--"),("kinematic",":")):
                ax.plot(r["time"],np.degrees(preds[name][i][:,j]),style,label=name)
            ax.axvline(1.2,color="grey",lw=1);ax.set(ylabel=f"q{j+1} [deg]",title=cond if j==0 else None)
        axs[1,col].set_xlabel("Time [s]")
    axs[0,0].legend(fontsize=8);save(fig,"04_joint_estimates","Reference and motor-only estimates, including initialization")
    i=primary("C_passive","contact")[0];r=byid[i];fig,axs=plt.subplots(3,1,figsize=(10,6),sharex=True)
    for j in range(2):axs[j].plot(r["time"],np.degrees(preds["C_passive-seed0"][i][:,j]-r["y"][:,j]));axs[j].set_ylabel(f"q{j+1} error [deg]")
    with h5py.File(a.dataset) as f:axs[2].plot(r["time"],f["episodes"][i]["simulation/contact_force"][::5],color="k")
    for name,color in (("onset","orange"),("sustained","green"),("release","red"),("recovery","purple")):
        axs[2].fill_between(r["time"],0,1,where=r["masks"][name],transform=axs[2].get_xaxis_transform(),alpha=.15,color=color,label=name)
    axs[2].set(xlabel="Time [s]",ylabel="Contact force [N]");axs[2].legend(ncol=4)
    save(fig,"05_contact_errors","Contact-phase errors with offline force-derived labels")
    fig,axs=plt.subplots(2,2,figsize=(10,6),sharex=True);S=pa["multisine_home_0.0005_1.2__sensitivity"].reshape(-1,4,2);t=pa["multisine_home_0.0005_1.2__trace"][:,0]
    for k,ax in enumerate(axs.flat):
        ax.plot(t,S[:,k,0],label="Perturb q1");ax.plot(t,S[:,k,1],label="Perturb q2");ax.set(ylabel="Scale / degree",title=["Motor position","Motor velocity","Current","Command"][k],xlabel="Time [s]")
    axs[0,0].legend();save(fig,"06_motor_sensitivity","Conditional released-state sensitivity at calibrated home")
    standard=[v for v in probing["probes"] if v["duration_s"]==1.2 and v["amplitude_bound_mm"]==.5]
    kinds=["hold","flexion","extension","low","pulse","oscillation","chirp","multisine","reversal"]
    fig,axs=plt.subplots(3,1,figsize=(10,8),sharex=True)
    for cond in ("home","flexed","contact"):
        rows=[next(v for v in standard if v["condition"]==cond and v["kind"]==k) for k in kinds]
        axs[0].plot(kinds,[v["rms_singular_values_per_degree"][1] for v in rows],"o-",label=cond)
        axs[1].plot(kinds,[v["condition_number"] for v in rows],"o-")
        axs[2].plot(kinds,[v["column_correlation"] for v in rows],"o-")
    axs[0].set_ylabel("RMS minimum singular value\n[scale / degree]");axs[0].legend();axs[1].set_ylabel("Condition number");axs[2].set_ylabel("Column correlation");axs[2].tick_params(axis="x",rotation=25)
    save(fig,"07_probe_conditioning","Probe information depends on operating point")
    fig,axs=plt.subplots(1,2,figsize=(10,4));amb=probing["ambiguity"]
    for horizon in (.1,.25,.5,1.2):
        rows=[v for v in amb["pairs"] if v["horizon_s"]==horizon];axs[0].scatter([v["motor_normalized_rms"] for v in rows],[v["joint_rms_gap_deg"] for v in rows],s=13,label=f"{horizon:g} s")
    axs[0].axvline(1,color="k",ls="--");axs[0].axhline(5,color="k",ls="--");axs[0].set(xlabel="Motor difference / comparison scale",ylabel="Trajectory joint RMS gap [deg]");axs[0].legend(fontsize=8)
    for index in (amb["best"]["a"],amb["best"]["b"]):
        d=pa[f"ambiguity_{index}"];axs[1].plot(d[:,0],np.degrees(d[:,1]),label=f"q1 state {index}");axs[1].plot(d[:,0],np.degrees(d[:,2]),"--",label=f"q2 state {index}")
    axs[1].set(xlabel="Time after release [s]",ylabel="Joint angle [deg]");axs[1].legend(fontsize=8)
    save(fig,"08_fixed_setup_search","Restricted fixed-setup search: no qualifying ambiguous pair")
    fig,axs=plt.subplots(1,2,figsize=(11,4));cases=["A","B","C_passive","C_probe"]
    for j in range(2):
        vals=[multiseed[c]["free"]["mean_mae_deg"][j] for c in cases];errs=[multiseed[c]["free"]["seed_sd_deg"][j] for c in cases]
        axs[0].errorbar(cases,vals,yerr=errs,fmt="o-",label=f"q{j+1}")
        groups=["test_preload","test_zero","test_routing","test_passive","test_drift","test_long_reference"]
        axs[1].plot([v.removeprefix("test_") for v in groups],[aggregates["C_passive-seed0"][v]["windows"]["post_probe"]["mae"][j] for v in groups],"o-",label=f"q{j+1}")
    axs[0].set(ylabel="Free-space MAE [deg]",title="Matched-regime training; three seed SD");axs[0].legend();axs[1].set(ylabel="MAE [deg]",title="Frozen calibrated observer, seed 0");axs[1].tick_params(axis="x",rotation=25);axs[1].legend()
    save(fig,"09_calibration_and_transfer","Calibration accuracy and sensitivity to changed conditions")
    designs=mechanisms["designs"];fig,axs=plt.subplots(2,2,figsize=(12,8));names=[v["name"] for v in designs]
    axs[0,0].bar(names,[v["sensitivity"]["rms_singular_values_per_degree"][1] for v in designs]);axs[0,0].set_ylabel("Minimum singular value [scale / degree]")
    for j in range(2):
        axs[0,1].plot(names,[v["episodes"][0]["quality"]["joint_range_deg"][j] for v in designs],"o-",label=f"q{j+1}")
        axs[1,1].plot(names,[np.mean([s[f"q{j+1}_mae_deg"] for s in v["episodes"][0]["frozen_gru_by_seed"]]) for v in designs],"o-",label=f"Frozen GRU q{j+1}")
        axs[1,1].plot(names,[v["episodes"][0]["known_design_physics"][f"q{j+1}_mae_deg"] for v in designs],"--",label=f"Known-design EKF q{j+1}")
    axs[0,1].set_ylabel("Free joint range [deg]");axs[0,1].legend();axs[1,0].bar(names,[v["episodes"][0]["trajectory_manifold_ratio"] for v in designs]);axs[1,0].set_ylabel("Trajectory SVD second / first");axs[1,1].set_ylabel("Free-space MAE [deg]");axs[1,1].legend(fontsize=8)
    for ax in axs.flat:ax.tick_params(axis="x",rotation=65,labelsize=8)
    save(fig,"10_mechanism_tradeoffs","Mechanism sensitivity, reachable motion and estimator transfer")
    fig,axs=plt.subplots(1,3,figsize=(14,4))
    rows=[v for v in probing["probes"] if v["kind"]=="multisine" and v["condition"]=="home"]
    for v in rows:
        axs[0].scatter(v["incremental_current_rms_A"],v["rms_singular_values_per_degree"][1]);axs[0].annotate(f"{v['amplitude_bound_mm']:g} mm / {v['duration_s']:g} s",(v["incremental_current_rms_A"],v["rms_singular_values_per_degree"][1]),fontsize=7)
    axs[0].set(xlabel="Home incremental current RMS [A]",ylabel="Minimum singular value [scale / degree]")
    probe_scores=read(p/"study/probe-evaluation.json");ps={v["id"]:v for v in probe_scores["probes"]}
    for v in rows:
        error=np.mean([s["q2_mae_deg"] for s in ps[v["id"]]["full_by_seed"]]);axs[1].scatter(v["incremental_current_rms_A"],error)
        axs[1].annotate(f"{v['amplitude_bound_mm']:g} / {v['duration_s']:g}",(v["incremental_current_rms_A"],error),fontsize=7)
    axs[1].set(xlabel="Home incremental current RMS [A]",ylabel="Quiet-probe q2 MAE [deg]",title="Cold start; labels: mm / s")
    for j in range(2):axs[2].bar(np.arange(2)+(j-.5)*.3,[paired[c]["active_minus_passive_deg"][j] for c in ("C_passive","C_probe")],width=.3,label=f"q{j+1}")
    axs[2].set(xticks=[0,1],xticklabels=["Passive-trained","Probe-trained"],ylabel="Active − passive MAE [deg]",ylim=(-.005,.005));axs[2].axhline(0,color="k",lw=1);axs[2].legend()
    save(fig,"11_probe_cost_and_accuracy","Extra probing effort did not establish an accuracy gain")
    fig,axs=plt.subplots(2,1,figsize=(10,6),sharex=True);ca=np.load(p/"control/control.npz")
    for j in range(2):
        axs[j].plot(ca["open_loop"][:,0],np.degrees(ca["open_loop"][:,5+j]),"k--",label="Reachable target")
        for name in ("open_loop","neural","oracle"):axs[j].plot(ca[name][:,0],np.degrees(ca[name][:,1+j]),label=name)
        axs[j].set_ylabel(f"q{j+1} [deg]")
    axs[0].legend(ncol=4);axs[1].set_xlabel("Time after observer warmup [s]")
    save(fig,"12_reachable_posture_control","One-input reachable-posture control: feedforward remains competitive")
    fig,axs=plt.subplots(1,2,figsize=(11,4))
    for cond in ("free","contact"):
        rows=sorted([v for v in numerical["comparisons"] if v["condition"]==cond and v["plant_dt_s"]==.000025],key=lambda v:v["outer_dt_s"])
        for j in range(2):axs[0].plot([v["outer_dt_s"]*1000 for v in rows],[v["q_rmse_deg"][j] for v in rows],"o-",label=f"{cond} q{j+1}")
        rows=sorted([v for v in numerical["comparisons"] if v["condition"]==cond and v["outer_dt_s"]==.0005],key=lambda v:v["plant_dt_s"])
        for j in range(2):axs[1].plot([v["plant_dt_s"]*1e6 for v in rows],[v["q_rmse_deg"][j] for v in rows],"o-",label=f"{cond} q{j+1}")
    axs[0].set(xlabel="MuJoCo step [ms], plant 25 µs",ylabel="Joint RMSE vs refined run [deg]");axs[1].set(xlabel="Plant/controller step [µs], outer 0.5 ms",ylabel="Joint RMSE vs refined run [deg]")
    for ax in axs:ax.legend(fontsize=8)
    save(fig,"13_numerical_sensitivity","Separate outer-step and plant/controller-rate sensitivity")
    fig,axs=plt.subplots(1,2,figsize=(10,4));sensor_summary={};trajectory_checks={}
    for k,factor in enumerate(("current_white_noise_A","telemetry_delay_s")):
        for cond in ("free","contact"):
            selected=sorted([r for r in sruns if r["config"]["metadata"]["condition"]==cond and r["config"]["metadata"]["sensitivity_factor"]==factor],key=lambda r:r["config"]["metadata"]["sensitivity_value"])
            trajectory_checks[f"{cond}/{factor}"]=bool(all(np.array_equal(selected[0]["y"],r["y"]) for r in selected))
            for j in range(2):
                vals=[]
                for r in selected:
                    v=[sensor["metrics"][f"C_passive-seed{s}"][r["id"]]["post_probe"][f"q{j+1}_mae_deg"] for s in range(3)];vals.append(np.mean(v));sensor_summary.setdefault(r["id"],{})[f"q{j+1}_mae_deg"]=v
                axs[k].plot([r["config"]["metadata"]["sensitivity_value"]*(1000 if k else 1) for r in selected],vals,"o-",label=f"{cond} q{j+1}")
        axs[k].set(xlabel="White-current σ [A]" if k==0 else "Telemetry delay [ms]",ylabel="Three-seed mean MAE [deg]");axs[k].legend(fontsize=8)
        if k==0:axs[k].set_xticks([0.,.005,.02],["0","0.005","0.020"])
    save(fig,"14_telemetry_sensitivity","Observer telemetry sensitivity on identical physical trajectories")
    fig,ax=plt.subplots(figsize=(10,4));x=np.arange(len(nuisance));ax.bar(x-.18,[v["known_setup_singular_values"][1] for v in nuisance],.36,label="Known setup");ax.bar(x+.18,[v["nuisance_projected_singular_values"][1] for v in nuisance],.36,label="After projecting zero / preload directions")
    ax.set(xticks=x,xticklabels=[v["name"] for v in nuisance],ylabel="Minimum singular value [scale / degree]");ax.tick_params(axis="x",rotation=55,labelsize=8);ax.legend()
    save(fig,"15_calibration_nuisance","Local sensitivity with calibration nuisance directions")
    protected=read(public/"assets/data/tendon-in-the-loop/phase2-verification.json")["source_sha256"]
    # Windows checkout may convert three legacy files to CRLF. Compare content with
    # both original raw hashes and LF-normalized hashes; never rewrite legacy files.
    preserved={name:(sha(ROOT/name)==expected or hashlib.sha256((ROOT/name).read_bytes().replace(b"\r\n",b"\n")).hexdigest()==expected) for name,expected in protected.items()};assert all(preserved.values()),preserved
    sources={str(path.relative_to(ROOT)).replace("\\","/"):sha(path) for pattern in ("scripts/phase3*.py","til/phase3*.py","tests/test_phase3*.py","experiments/phase3.json","PHASE3_DESIGN.md","PHASE3_RESULTS.md") for path in ROOT.glob(pattern)}
    with h5py.File(a.dataset) as f:
        manifest=[dict(id=n,config=json.loads(g.attrs["config"]),quality=json.loads(g.attrs["quality"])) for n,g in f["episodes"].items()]
    training={x.parent.name:read(x) for x in sorted((p/"full").glob("*/training.json"))}
    runtimes={x.name.removesuffix("-runtime.json"):read(x) for x in (p/"evaluation").glob("*-runtime.json")}
    replay=read(p/"replay/evaluation.json")
    replay_matches=replay["metrics"]["C_passive-seed0"]==metrics["C_passive-seed0"]
    assert replay_matches and replay["dataset_sha256"]==ev["dataset_sha256"]
    artifacts={str(path.relative_to(ROOT)).replace("\\","/"):sha(path) for path in
        [ROOT/a.dataset,ROOT/"data/phase3/sensor.h5",ROOT/"data/phase3/observability.h5",
         *[x for x in (ROOT/p).rglob("*.json") if x.name!="report.json"],
         *[x for x in (ROOT/p).rglob("*.npz")]]}
    report=dict(scope="Synthetic verification of calibrated motor-only joint estimation; no physical HIL measurements or global observability claim.",
        dataset_sha256=sha(a.dataset),sessions=len(runs),eligible=sum(r["quality"]["eligible"] for r in runs),held_out_sessions=len(ev["test_ids"]),
        motor_inputs=["position","velocity","current","applied_command"],inference_rate_Hz=200,hidden_units=32,
        primary_window="After 1.2 s hold/probe prefix; full, initialization and contact-phase scores retained.",
        multiseed=multiseed,paired_probing=paired,aggregates=aggregates,per_run_metrics=metrics,
        training=training,runtimes=runtimes,manifest=manifest,probing=probing,probe_observer_diagnostics=probe_scores,mechanisms=mechanisms,numerics=numerical,
        calibration_nuisance=nuisance,control=control,sensor_sensitivity=dict(by_run=sensor_summary,identical_physical_joint_trajectories=trajectory_checks,
            note="Telemetry only: true rotor state remains available to the plant controller. White-noise zero retains colored noise. Not feedback-sensor robustness."),
        frozen_checkpoint_replay_exact=replay_matches,artifact_sha256=artifacts,
        phase2_source_preserved=preserved,source_sha256=sources,figures=figures,platform=platform.platform(),
        package_versions={name:version(name) for name in ("numpy","torch","mujoco","h5py","matplotlib","pytest")},
        git_commit=subprocess.check_output(["git","rev-parse","HEAD"],text=True).strip(),
        worktree_dirty_at_export=bool(subprocess.check_output(["git","status","--porcelain"],text=True)),
        cautions=["Three training seeds and three test runs per primary environment; seed SD is not a hardware confidence interval.",
            "Physics EKF omits contact dynamics; its contact failure cannot establish a need for neural estimation.",
            "Mechanism GRUs remain frozen at the nominal design; the physics baseline receives known static design parameters.",
            "Small active/passive differences are comparable to numerical sensitivity; no probing gain established.",
            "No pair passes the restricted fixed-setup ambiguity criterion; this does not prove global observability.",
            "Prepared released-state sensitivities and nuisance projection are conditional diagnostics, not Fisher uncertainty bounds."])
    target=public/"assets/data/tendon-in-the-loop/phase3-verification.json";target.write_text(json.dumps(report,indent=2,allow_nan=False)+"\n",encoding="utf8")
    print(json.dumps(dict(sessions=len(runs),figures=len(figures),phase2_preserved=all(preserved.values()),sensor_trajectory_checks=trajectory_checks,multiseed=multiseed,paired=paired),indent=2))


if __name__=="__main__":main()
