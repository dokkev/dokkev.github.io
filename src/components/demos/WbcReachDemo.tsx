import { useEffect, useId, useRef, useState } from "react";
import WbcMeshScene, { type ReachFrame } from "./WbcMeshScene";
import preview from "../../lib/demos/data/wbc-reach-preview.json";

type Scenario = "near" | "far";
interface ReachData {
  metadata: { sample_dt: number; com_reference: number[]; reach_m: number; final_hand_error_m: number };
  frames: ReachFrame[];
}
const error = (f: ReachFrame) => Math.hypot(...f.hand.map((v, i) => v - f.hand_target[i]));

export default function WbcReachDemo() {
  const id = useId();
  const [scenario, setScenario] = useState<Scenario>("near");
  const [data, setData] = useState<ReachData>(preview.near);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const cache = useRef(new Map<Scenario, ReachData>());
  const frame = data.frames[index];
  const last = data.frames.length - 1;
  const duration = data.frames[last].time;
  const goal = data.frames[last].hand_target;
  const comDeviation = Math.hypot(...frame.com.map((v, i) => v - data.metadata.com_reference[i]));
  useEffect(() => {
    const controller = new AbortController();
    setReady(false);
    setLoadError(false);
    async function load() {
      let result = cache.current.get(scenario);
      if (!result) {
        const response = await fetch(`/assets/demos/wbc/${scenario}.json`, { signal: controller.signal });
        if (!response.ok) throw new Error("Trajectory unavailable");
        result = (await response.json()) as ReachData;
        cache.current.set(scenario, result);
      }
      if (!controller.signal.aborted) {
        setData(result);
        setIndex(0);
        setReady(true);
      }
    }
    load().catch(() => {
      if (!controller.signal.aborted) setLoadError(true);
    });
    return () => controller.abort();
  }, [scenario]);
  useEffect(() => {
    if (!playing) return;
    let request = 0;
    let start: number | undefined;
    const initialTime = data.frames[index].time;
    const tick = (now: number) => {
      start ??= now;
      const time = initialTime + (now - start) / 1000;
      const next = Math.min(last, Math.round(time / data.metadata.sample_dt));
      setIndex(next);
      if (next === last) setPlaying(false);
      else request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [playing, data]);
  const changeScenario = (value: Scenario) => {
    if (value === scenario) return;
    setPlaying(false);
    setIndex(0);
    setReady(false);
    setScenario(value);
  };
  return (
    <section className="wbc-demo" aria-label="TSID whole-body reach playback">
      <header className="wbc-demo-heading">
        <div>
          <p className="eyebrow">Pinocchio + TSID · Talos</p>
          <h3>Balance first. Hand tracking second.</h3>
        </div>
      </header>
      <div className="wbc-scenarios" role="group" aria-label="Reach target">
        <button type="button" disabled={!ready} aria-pressed={scenario === "near"} onClick={() => changeScenario("near")}>
          Near goal · 8 cm
        </button>
        <button type="button" disabled={!ready} aria-pressed={scenario === "far"} onClick={() => changeScenario("far")}>
          Far goal · 45 cm
        </button>
      </div>
      <WbcMeshScene frame={frame} goal={goal} />
      <div className="wbc-mesh-legend">
        <span>● Robot hand / CoM</span>
        <span>◉ Hand target</span>
        <span>↑ Ground reaction forces</span>
      </div>
      <div className="wbc-playback">
        <button
          type="button"
          disabled={!ready}
          onClick={() => {
            if (index === last) setIndex(0);
            setPlaying(!playing);
          }}
          aria-label={playing ? "Pause reach" : "Play reach"}
        >
          {playing ? "Ⅱ Pause" : "▶ Play"}
        </button>
        <button
          type="button"
          disabled={!ready}
          onClick={() => {
            setPlaying(false);
            setIndex(0);
          }}
        >
          ↶ Reset
        </button>
        <label className="wbc-timeline">
          <input
            aria-label="Playback time"
            type="range"
            min="0"
            max={last}
            value={index}
            disabled={!ready}
            onChange={(e) => {
              setPlaying(false);
              setIndex(Number(e.target.value));
            }}
          />
          <output>
            {frame.time.toFixed(2)} / {duration.toFixed(2)} s
          </output>
        </label>
      </div>
      {loadError && <p role="status">The trajectory could not be loaded. Reload this page to try again.</p>}
      <div className="wbc-readout">
        <span>
          Hand error <strong>{(error(frame) * 1000).toFixed(1)} mm</strong>
        </span>
        <span>
          CoM deviation <strong>{(comDeviation * 1000).toFixed(3)} mm</strong>
        </span>
        <span>
          Left / right Fz{" "}
          <strong>
            {frame.foot_force_world[0][2].toFixed(0)} / {frame.foot_force_world[1][2].toFixed(0)} N
          </strong>
        </span>
      </div>
      <div className="wbc-error-chart">
        <svg viewBox="0 0 680 150" role="img" aria-labelledby={`${id}-chart`}>
          <title id={`${id}-chart`}>Hand tracking error over time, millimetres</title>
          {[0, 50, 100].map((value) => (
            <g key={value}>
              <line x1="50" x2="655" y1={118 - value * 0.8} y2={118 - value * 0.8} stroke="#e0e6e2" />
              <text x="39" y={122 - value * 0.8} textAnchor="end">
                {value}
              </text>
            </g>
          ))}
          <text x="50" y="18">
            Hand error [mm]
          </text>
          <polyline
            points={data.frames.map((f) => `${50 + (f.time / duration) * 605},${118 - error(f) * 1000 * 0.8}`).join(" ")}
            fill="none"
            stroke="#b34a33"
            strokeWidth="2.5"
          />
          <line
            x1={50 + (frame.time / duration) * 605}
            x2={50 + (frame.time / duration) * 605}
            y1="30"
            y2="118"
            stroke="#347361"
            strokeDasharray="3 3"
          />
          <text x="50" y="141">
            0 s
          </text>
          <text x="655" y="141" textAnchor="end">
            {duration.toFixed(0)} s
          </text>
        </svg>
      </div>
      <p className="wbc-demo-note">
        Higher priority: fixed feet, CoM reference, torso orientation, and actuator bounds. Lower priority: hand tracking and posture. The far goal
        leaves {(preview.far.metadata.final_hand_error_m * 1000).toFixed(1)} mm of hand error while the CoM reference is retained. Computed
        fixed-contact dynamics; no collision or slip simulation. Talos meshes:{" "}
        <a href="/assets/models/talos/README.txt">PAL Robotics · source and notices</a>.
      </p>
    </section>
  );
}
