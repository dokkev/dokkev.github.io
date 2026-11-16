"""Calibration, causal latency, reproducibility and dataset information boundaries."""
import json

import h5py
import numpy as np
import pytest

from til.cable import CablePlant, PRESETS
from til.coupling import SimConfig, SensorParams, TiLSimulator, MOTOR_ONLY_CHANNELS
from til.motors import EmulationMotor, EmulationMotorParams, QDDMotor, QDDMotorParams
from til.recorder import load_motor_only
from til.runner import run_experiment
from til.scenarios import EpisodeConfig, MotorProfile, load_manifest


@pytest.mark.parametrize("preset", PRESETS)
def test_full_constitutive_law_holds_initial_pretension(preset):
    plant = CablePlant(PRESETS[preset])
    for _ in range(10):
        t1, t2 = plant.step(1e-4, 0, 0, 0, 0)
        assert t1 == pytest.approx(plant.p.pretension, abs=1e-10)
        assert t2 == pytest.approx(plant.p.pretension, abs=1e-10)


@pytest.mark.parametrize("steps", [1, 2, 20])
def test_emulator_exact_discrete_latency(steps):
    motor = EmulationMotor(EmulationMotorParams(mode="ideal", delay=steps * 1e-4))
    for _ in range(steps):
        motor.step(.003)
        assert motor.s.x == 0
    motor.step(.003)
    assert motor.s.x == .003


def test_tension_one_step_delay_and_recording_does_not_change_plant():
    cfg = SimConfig(sensors=SensorParams(tension_delay=.0005, tension_noise=.1, emulator_pos_noise=1e-5))
    a, b = TiLSimulator(cfg), TiLSimulator(cfg)
    a.reset(); b.reset()
    previous = cfg.cable.pretension
    history = []
    for _ in range(30):
        a.step(.2); b.step(.2)
        assert a.T_applied == previous
        previous = a.T_out_meas
        a.record()  # logging must not consume the load-cell noise stream
        np.testing.assert_array_equal(a.finger.q, b.finger.q)
        history.append(a.T_out_meas)
    a.reset()
    for expected in history:
        a.step(.2)
        assert a.T_out_meas == expected


def test_manifest_roundtrip_and_motor_only_boundary(tmp_path):
    manifest = tmp_path / "experiment.json"
    manifest.write_text(json.dumps({
        "defaults": {"scenario_id": "routing", "profile": {"n_cycles": 1, "period": .04, "settle_time": .01},
                     "sim_overrides": {"cable": {"R_p": .015, "tau_c": .001}}},
        "episodes": [{"episode_id": "route_a", "pretension": 8},
                     {"episode_id": "route_b", "sim_overrides": {"cable": {"R_p": .025}}}]}))
    episodes = load_manifest(str(manifest))
    assert episodes[1].sim_config().cable.tau_c == .001
    assert episodes[0].sim_config().cable.R_p == .015
    path = str(tmp_path / "runs.h5")
    summaries = run_experiment(episodes, path, progress=False)
    assert all("failed" not in s for s in summaries)
    data = load_motor_only(path, "route_a")
    assert set(data) == {"time", *MOTOR_ONLY_CHANNELS}
    assert np.allclose(np.diff(data["time"]), .001)
    with h5py.File(path) as f:
        group = f["episodes/route_b"]
        assert json.loads(group.attrs["config"])["sim_overrides"]["cable"]["R_p"] == .025
        assert "ground_truth/cable_segment_extensions" in group
        assert group["ground_truth/cable_segment_extensions"].attrs["units"].startswith("m ")
        assert "mujoco" in json.loads(f.attrs["versions"])
        assert group.attrs["n_samples"] == len(data["time"])


def test_all_diagnostic_plots_accept_current_schema(tmp_path):
    from til.analysis import analyse
    ep = EpisodeConfig("smoke", "smoke", profile=MotorProfile(n_cycles=1, period=.04, settle_time=.01))
    path = str(tmp_path / "run.h5")
    run_experiment([ep], path, progress=False)
    paths = analyse(path, str(tmp_path / "plots"))
    assert len(paths) == 8
    from pathlib import Path
    assert all(Path(p).stat().st_size > 0 for p in paths)


@pytest.mark.parametrize("kwargs", [{"period": 0}, {"n_cycles": 0}, {"ramp_frac": .8}, {"amplitude": float("nan")}])
def test_invalid_profile_fails_before_running(kwargs):
    with pytest.raises(ValueError):
        MotorProfile(**kwargs)


def test_unrepresentable_sampling_period_rejected():
    cfg = SimConfig()
    cfg.timing.log_dt = .0007
    with pytest.raises(ValueError, match="log_dt"):
        TiLSimulator(cfg)


def test_initial_pretension_cannot_bypass_motor_current_limit():
    motor = QDDMotor(QDDMotorParams(i_max=1.0))
    motor.reset(T_hold=10.0)  # requires 2 A with the default drum and torque constant
    assert motor.s.i == 1.0
    assert motor.s.u == 1.0
    motor.step(1e-4, motor.command_from_reference(0), 10.0)
    assert motor.s.i <= 1.0
    assert motor.s.omega < 0  # imposed preload backdrives an undersized motor
