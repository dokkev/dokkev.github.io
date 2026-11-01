import { useEffect, useRef, useState } from "react";
import WbcMeshScene, { type ReachFrame } from "./WbcMeshScene";
import preview from "../../lib/demos/data/wbc-balance-preview.json";

type Motion = "x" | "y" | "z" | "roll" | "pitch" | "yaw" | "combined";
interface BalanceFrame extends ReachFrame {
  base: number[];
  base_target: number[];
}
interface BalanceData {
  metadata: { sample_dt: number; base_reference: number[] };
  frames: BalanceFrame[];
}
const choices: { value: Motion; label: string }[] = [
  { value: "x", label: "X · ±20 mm" },
  { value: "y", label: "Y · ±20 mm" },
  { value: "z", label: "Z · ±15 mm" },
  { value: "roll", label: "Roll · ±3°" },
  { value: "pitch", label: "Pitch · ±3°" },
  { value: "yaw", label: "Yaw · ±3°" },
  { value: "combined", label: "Translation + rotation" },
];
function rpy(pose: number[]) {
  let [x, y, z, w] = pose.slice(3);
  const norm = Math.hypot(x, y, z, w);
  x /= norm;
  y /= norm;
  z /= norm;
  w /= norm;
  return [
    Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y)),
    Math.asin(Math.max(-1, Math.min(1, 2 * (w * y - z * x)))),
    Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)),
  ].map((a) => (a * 180) / Math.PI);
}
export default function WbcBalanceDemo() {
  const [motion, setMotion] = useState<Motion>("combined");
  const [data, setData] = useState<BalanceData>(preview);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const cache = useRef(new Map<Motion, BalanceData>());
  const frame = data.frames[index];
  const last = data.frames.length - 1;
  const duration = data.frames[last].time;
  useEffect(() => {
    const controller = new AbortController();
    setReady(false);
    setLoadError(false);
    async function load() {
      let result = cache.current.get(motion);
      if (!result) {
        const response = await fetch(`/assets/demos/wbc/balance/${motion}.json`, { signal: controller.signal });
        if (!response.ok) throw new Error("Balance trajectory unavailable");
        result = (await response.json()) as BalanceData;
        cache.current.set(motion, result);
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
  }, [motion]);
  useEffect(() => {
    if (!playing) return;
    let request = 0;
    let start: number | undefined;
    const initialTime = data.frames[index].time;
    const tick = (now: number) => {
      start ??= now;
      const next = Math.min(last, Math.round((initialTime + (now - start) / 1000) / data.metadata.sample_dt));
      setIndex(next);
      if (next === last) setPlaying(false);
      else request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [playing, data]);
  const positionError = Math.hypot(...frame.base.slice(0, 3).map((v, i) => v - frame.base_target[i])) * 1000;
  const actualQ = frame.base.slice(3),
    targetQ = frame.base_target.slice(3);
  const cosine = Math.abs(actualQ.reduce((sum, v, i) => sum + v * targetQ[i], 0)) / (Math.hypot(...actualQ) * Math.hypot(...targetQ));
  const angleError = (2 * Math.acos(Math.min(1, cosine)) * 180) / Math.PI;
  const offsets = frame.base_target
    .slice(0, 3)
    .map((v, i) => (v - data.metadata.base_reference[i]) * 1000)
    .map((v) => (Math.abs(v) < 0.05 ? 0 : v));
  const referenceAngles = rpy(data.metadata.base_reference);
  const angles = rpy(frame.base_target).map((v, i) => v - referenceAngles[i]);
  return (
    <section className="wbc-demo wbc-balance-demo" aria-label="Floating-base balance control">
      <header className="wbc-demo-heading">
        <div>
          <p className="eyebrow">Pinocchio + TSID · Floating base</p>
          <h3>Move the pelvis. Keep both feet planted.</h3>
        </div>
      </header>
      <div className="wbc-scenarios" role="group" aria-label="Base motion">
        {choices.map((choice) => (
          <button
            key={choice.value}
            type="button"
            disabled={!ready}
            aria-pressed={motion === choice.value}
            onClick={() => {
              if (choice.value === motion) return;
              setPlaying(false);
              setIndex(0);
              setReady(false);
              setMotion(choice.value);
            }}
          >
            {choice.label}
          </button>
        ))}
      </div>
      <WbcMeshScene frame={frame} goal={frame.base_target.slice(0, 3)} baseTarget={frame.base_target} />
      <div className="wbc-mesh-legend">
        <span>● CoM</span>
        <span>▱ Pelvis target</span>
        <span>↑ Ground reaction forces</span>
      </div>
      <div className="wbc-playback">
        <button
          type="button"
          disabled={!ready}
          aria-label={playing ? "Pause base motion" : "Play base motion"}
          onClick={() => {
            if (index === last) setIndex(0);
            setPlaying(!playing);
          }}
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
            aria-label="Base playback time"
            type="range"
            min="0"
            max={last}
            disabled={!ready}
            value={index}
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
      {loadError && <p role="status">The base trajectory could not be loaded. Reload this page to try again.</p>}
      <div className="wbc-base-target">
        <div>
          <span>Target translation</span>
          <strong>
            {["X", "Y", "Z"].map((label, i) => (
              <span key={label}>
                {label} {offsets[i].toFixed(1)} mm
              </span>
            ))}
          </strong>
        </div>
        <div>
          <span>Target rotation</span>
          <strong>
            {["Roll", "Pitch", "Yaw"].map((label, i) => (
              <span key={label}>
                {label} {angles[i].toFixed(1)}°
              </span>
            ))}
          </strong>
        </div>
      </div>
      <div className="wbc-readout">
        <span>
          Base position error <strong>{positionError.toFixed(2)} mm</strong>
        </span>
        <span>
          Orientation error <strong>{angleError.toFixed(3)}°</strong>
        </span>
        <span>
          Left / right Fz{" "}
          <strong>
            {frame.foot_force_world[0][2].toFixed(0)} / {frame.foot_force_world[1][2].toFixed(0)} N
          </strong>
        </span>
      </div>
      <p className="wbc-demo-note">
        A pelvis pose task and weak posture regularization; no hand task or fixed-CoM task. Foot contacts and actuator bounds constrain the motion.
        Each case is an independently computed signed target cycle, not a live solver or an interpolation between solutions.
      </p>
    </section>
  );
}
