import { useEffect, useId, useMemo, useState } from "react";
import {
  durationTicks,
  schedulerDefaults,
  schedulerPresets,
  simulateScheduler,
  tickMs,
  type HostPhase,
  type SchedulerConfig,
  type SchedulerSnapshot,
} from "../../lib/demos/can-scheduler";

const phaseColor: Record<HostPhase, string> = {
  idle: "#e5e9e6",
  read: "#17695b",
  wait: "#b36a18",
  update: "#326aa1",
  write: "#805095",
  stalled: "#a33e40",
};
const ms = (ticks: number) => `${(ticks * tickMs).toFixed(1)} ms`;
const age = (now: number, stamp?: number) => (stamp === undefined ? "No sample" : ms(now - stamp));

export default function CanSchedulerDemo() {
  const id = useId();
  const [config, setConfig] = useState<SchedulerConfig>({ ...schedulerDefaults });
  const [cursor, setCursor] = useState(120);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(6);
  const model = useMemo(() => simulateScheduler(config), [config]);
  const snapshot = model.snapshots[Math.min(durationTicks, Math.floor(cursor))];
  const change = (patch: Partial<SchedulerConfig>) => {
    setConfig({ ...config, ...patch });
    setPlaying(false);
    setCursor(120);
  };
  useEffect(() => {
    if (!playing) return;
    let frame = 0,
      last = 0;
    const animate = (wall: number) => {
      if (last) setCursor((t) => Math.min(durationTicks, t + (Math.min(100, wall - last) * speed) / 100));
      last = wall;
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed]);
  useEffect(() => {
    if (cursor >= durationTicks) setPlaying(false);
  }, [cursor]);
  const events = model.events
    .filter((e) => e.tick <= snapshot.tick)
    .slice(-4)
    .reverse();
  const sampleAge = snapshot.cache ? snapshot.tick - snapshot.cache.born : undefined;
  const stale = !snapshot.cache || snapshot.tick - snapshot.cache.arrived > config.staleMs / tickMs;
  return (
    <section className="signal-demo scheduler-demo" aria-label="CAN I/O scheduling laboratory">
      <header className="signal-demo-heading">
        <span className="eyebrow">Try it · A 60 ms scheduling model</span>
        <h3>Follow the age of a command</h3>
      </header>
      <p className="demo-help">
        Choose a scenario, then play or scrub time. This is a deterministic teaching model of one actuator, not a recording or a motor dynamics
        simulation.
      </p>
      <p className="scheduler-control-label">Scenario</p>
      <div className="scheduler-presets" role="group" aria-label="Scheduling scenarios">
        {schedulerPresets.map((preset) => (
          <button
            type="button"
            key={preset.name}
            aria-pressed={Object.entries(preset.config).every(([key, value]) => config[key as keyof SchedulerConfig] === value)}
            onClick={() => {
              setConfig({ ...preset.config });
              setPlaying(false);
              setCursor(120);
            }}
          >
            {preset.name}
          </button>
        ))}
      </div>
      <div className="scheduler-playback" role="group" aria-label="Animation playback">
        <span className="scheduler-control-label">Animation</span>
        <button
          type="button"
          onClick={() => {
            if (cursor >= durationTicks) setCursor(0);
            setPlaying(!playing);
          }}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            {playing ? <path d="M4 3h3v10H4zM9 3h3v10H9z" fill="currentColor" /> : <path d="M5 2l9 6-9 6z" fill="currentColor" />}
          </svg>
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            setCursor(Math.min(durationTicks, cursor + 10));
          }}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 3l7 5-7 5zM12 3v10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          </svg>
          Step 1 ms
        </button>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            setCursor(0);
          }}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M13 3L6 8l7 5zM3 3v10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          </svg>
          Rewind
        </button>
        <label htmlFor={`${id}-speed`}>
          Speed
          <select id={`${id}-speed`} value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            <option value="2">2 ms/s</option>
            <option value="6">6 ms/s</option>
            <option value="12">12 ms/s</option>
          </select>
        </label>
        <strong>{ms(snapshot.tick)} / 60 ms</strong>
      </div>
      <label htmlFor={`${id}-time`}>Model time</label>
      <input
        id={`${id}-time`}
        type="range"
        min="0"
        max={durationTicks}
        step="1"
        value={Math.floor(cursor)}
        onChange={(e) => {
          setPlaying(false);
          setCursor(Number(e.target.value));
        }}
      />
      <div className="signal-chart-scroll" role="region" aria-label="Animated host queues and motor" tabIndex={0}>
        <Pipeline snapshot={snapshot} watchdogMs={config.watchdogMs} />
      </div>
      {config.driverParseMs > 0 && (
        <div className={`scheduler-driver-status ${snapshot.driverDropped ? "is-alert" : ""}`}>
          <strong>
            Motor driver RX: {snapshot.driverRx.length} / 2 waiting ·{" "}
            {snapshot.driverActive ? `processing #${snapshot.driverActive.packet.id}` : "parser idle"} · {snapshot.driverDropped} commands dropped
          </strong>
          <p>Transport delivery is separate from firmware acceptance. The modeled parser takes {config.driverParseMs} ms per command.</p>
          <button type="button" onClick={() => change({ txSpacingMs: config.txSpacingMs ? 0 : 1 })}>
            {config.txSpacingMs ? "Remove TX pacing" : "Space TX frames by 1 ms"}
          </button>
        </div>
      )}
      <div className="scheduler-metrics">
        <div className={stale ? "is-alert" : ""}>
          <span>Cached state age · since sampling</span>
          <strong>{sampleAge === undefined ? "No sample" : ms(sampleAge)}</strong>
          <small>{stale ? "Host receive freshness expired / unavailable" : "Host receive freshness within limit"}</small>
        </div>
        <div>
          <span>Last accepted command age · since generation</span>
          <strong>{age(snapshot.tick, snapshot.applied?.born)}</strong>
          <small>
            {snapshot.applied ? `Last transport delay: ${ms(snapshot.applied.arrived - snapshot.applied.born)}` : "Waiting for first command"}
          </small>
        </div>
        <div className={snapshot.motorExpired ? "is-alert" : ""}>
          <span>Motor command watchdog</span>
          <strong>{snapshot.motorExpired ? "EXPIRED" : `${ms(snapshot.motorSilence)} / ${config.watchdogMs} ms`}</strong>
          <small>{snapshot.motorExpired ? "Output disabled; reset model to re-arm" : "Time since last accepted command"}</small>
        </div>
      </div>
      <Timeline snapshots={model.snapshots} cursor={snapshot.tick} />
      <div className="scheduler-counts">
        <span>
          Missed releases <strong>{snapshot.missed}</strong>
        </span>
        <span>
          RX dropped <strong>{snapshot.rxDropped}</strong>
        </span>
        <span>
          TX rejected <strong>{snapshot.txDropped}</strong>
        </span>
        <span>
          Driver RX dropped <strong>{snapshot.driverDropped}</strong>
        </span>
        <span>
          Pending TX replaced <strong>{snapshot.coalesced}</strong>
        </span>
        <span>
          Writes withheld <strong>{snapshot.inhibited}</strong>
        </span>
      </div>
      <details className="scheduler-settings">
        <summary>Change the I/O policy and timing</summary>
        <div className="scheduler-settings-grid">
          <label htmlFor={`${id}-read`}>
            read() policy
            <select
              id={`${id}-read`}
              value={config.readPolicy}
              onChange={(e) => change({ readPolicy: e.target.value as SchedulerConfig["readPolicy"] })}
            >
              <option value="one">Non-blocking · one frame</option>
              <option value="drain">Non-blocking · drain up to 8</option>
              <option value="blocking">Blocking · wait for one frame</option>
            </select>
          </label>
          <label htmlFor={`${id}-tx`}>
            Application TX pending policy
            <select id={`${id}-tx`} value={config.txPolicy} onChange={(e) => change({ txPolicy: e.target.value as SchedulerConfig["txPolicy"] })}>
              <option value="latest">Replace pending setpoint with latest</option>
              <option value="fifo">FIFO · keep older commands</option>
            </select>
          </label>
          {(
            [
              ["controlMs", "Control period", 0.5, 4, 0.5],
              ["feedbackMs", "Feedback sampling period", 0.5, 4, 0.5],
              ["transportMs", "TX service time", 0.1, 3, 0.1],
              ["txSpacingMs", "Minimum TX start spacing", 0, 1.5, 0.1],
              ["driverParseMs", "Motor command processing time", 0, 1.5, 0.1],
              ["staleMs", "Host receive freshness limit", 2, 12, 1],
              ["watchdogMs", "Motor command watchdog", 4, 16, 1],
            ] as const
          ).map(([key, label, min, max, step]) => (
            <div key={key}>
              <label htmlFor={`${id}-${key}`}>
                {label}
                <strong>{config[key]} ms</strong>
              </label>
              <input
                id={`${id}-${key}`}
                type="range"
                min={min}
                max={max}
                step={step}
                value={config[key]}
                onChange={(e) => change({ [key]: Number(e.target.value) })}
              />
            </div>
          ))}
          <label htmlFor={`${id}-fault`}>
            Injected fault · 20–36 ms
            <select id={`${id}-fault`} value={config.fault} onChange={(e) => change({ fault: e.target.value as SchedulerConfig["fault"] })}>
              <option value="none">None</option>
              <option value="feedback">Feedback link loses frames</option>
              <option value="host">Control thread stalls</option>
            </select>
          </label>
        </div>
        <label className="scheduler-checkbox">
          <input type="checkbox" checked={config.txBatch} onChange={(e) => change({ txBatch: e.target.checked })} />
          Release pending TX commands in a burst every 4 ms
        </label>
        <label className="scheduler-checkbox">
          <input type="checkbox" checked={config.rxBatch} onChange={(e) => change({ rxBatch: e.target.checked })} />
          Deliver feedback to the host in batches every 4 ms
        </label>
        <label className="scheduler-checkbox">
          <input type="checkbox" checked={config.gate} onChange={(e) => change({ gate: e.target.checked })} />
          Withhold new commands when host receive freshness expires
        </label>
        <p className="demo-help">
          Changing a setting pauses playback at 12 ms. The transport worker keeps running during a control-thread stall. The motor watchdog latches
          and ignores later commands until the model is reset.
        </p>
      </details>
      <div className="scheduler-events">
        <strong>Recent model events</strong>
        <ol>
          {events.map((e, i) => (
            <li key={`${e.tick}-${i}`}>
              <time>{ms(e.tick)}</time> {e.text}
            </li>
          ))}
        </ol>
      </div>
      <p className="demo-model-note">
        Model: 0.1 ms ticks; 0.1 ms per decoded frame; 0.2 ms controller calculation; up to 8 frames per drain; RX capacity 12 and TX pending capacity
        16. Feedback takes 0.6 ms before optional 4 ms batching. TX batching holds commands until the next 4 ms boundary. A nonzero motor processing
        time enables a parser with two waiting slots; zero models immediate processing. Only processed commands refresh the motor watchdog. One serial
        TX server includes transport and delivery. RX and TX have independent paths here: arbitration, shared bus occupancy, physical USB timing, OS
        jitter, and motor dynamics are omitted. Sample time is known only because this is a model. These timeout values are illustrative, not hardware
        recommendations.
      </p>
    </section>
  );
}

function Pipeline({ snapshot: s, watchdogMs }: { snapshot: SchedulerSnapshot; watchdogMs: number }) {
  const tick = s.tick;
  const progress = (p: { start: number; arrived: number }) => Math.max(0, Math.min(1, (tick - p.start) / (p.arrived - p.start)));
  return (
    <svg
      className="signal-chart scheduler-pipeline"
      viewBox="0 0 850 250"
      role="img"
      aria-label={`Control thread ${s.phase}; RX queue ${s.rx.length} frames; TX queue ${s.tx.length} commands; motor watchdog ${s.motorExpired ? "expired" : "active"}`}
    >
      <rect x="12" y="24" width="175" height="196" rx="5" fill="#f3f5f3" stroke="#ccd4ce" />
      <text x="28" y="50" className="scheduler-svg-title">
        ROS 2 control thread
      </text>
      <rect x="28" y="66" width="143" height="33" rx="3" fill={phaseColor[s.phase]} />
      <text x="100" y="87" textAnchor="middle" style={{ fill: ["idle"].includes(s.phase) ? "#202725" : "white" }}>
        {s.phase === "wait" ? "BLOCKED in read()" : s.phase}
      </text>
      <text x="28" y="127">
        Latest state cache
      </text>
      <text x="28" y="151">
        {s.cache ? `feedback #${s.cache.id}` : "No valid feedback"}
      </text>
      <text x="28" y="176">
        {s.cache ? `sample age ${age(tick, s.cache.born)}` : "Waiting for a frame"}
      </text>
      <text x="233" y="32" className="scheduler-svg-title">
        TX pending · {s.tx.length}
      </text>
      <line x1="189" x2="232" y1="72" y2="72" stroke="#805095" strokeWidth="2" />
      {Array.from({ length: 6 }, (_, i) => (
        <rect key={i} x={234 + i * 24} y="48" width="19" height="35" rx="2" fill={i < s.tx.length ? "#805095" : "#edf0ee"} stroke="#ccd4ce" />
      ))}
      <text x="234" y="108">
        {s.tx[0] ? `head #${s.tx[0].id} · age ${age(tick, s.tx[0].born)}` : "No pending command"}
      </text>
      <line x1="387" x2="646" y1="66" y2="66" stroke="#a4afa7" strokeWidth="2" />
      <text x="500" y="42" textAnchor="middle">
        Transport → delivery
      </text>
      {s.activeTx && (
        <g>
          <circle cx={397 + 235 * progress(s.activeTx)} cy="66" r="8" fill="#805095" />
          <text x="500" y="105" textAnchor="middle">
            command #{s.activeTx.id}
          </text>
        </g>
      )}
      <text x="233" y="145" className="scheduler-svg-title">
        RX queue · {s.rx.length}
      </text>
      {Array.from({ length: 6 }, (_, i) => (
        <rect key={i} x={234 + i * 24} y="160" width="19" height="35" rx="2" fill={i < s.rx.length ? "#17695b" : "#edf0ee"} stroke="#ccd4ce" />
      ))}
      <text x="234" y="219">
        {s.rx[0] ? `head #${s.rx[0].id} · sample age ${age(tick, s.rx[0].born)}` : "No queued feedback"}
      </text>
      <line x1="387" x2="646" y1="178" y2="178" stroke="#a4afa7" strokeWidth="2" />
      <text x="500" y="153" textAnchor="middle">
        Feedback ←
      </text>
      {s.incoming.map((p) => (
        <circle key={p.id} cx={630 - 230 * progress(p)} cy="178" r="7" fill="#17695b" />
      ))}
      <rect x="651" y="24" width="186" height="196" rx="5" fill={s.motorExpired ? "#fcf0eb" : "#f3f5f3"} stroke="#ccd4ce" />
      <text x="667" y="50" className="scheduler-svg-title">
        Motor driver
      </text>
      <text x="667" y="83">
        {s.motorExpired ? "OUTPUT DISABLED" : s.applied ? `Applied #${s.applied.id}` : "Awaiting command"}
      </text>
      <text x="667" y="110">
        Watchdog silence
      </text>
      <text x="667" y="133">
        {ms(s.motorSilence)} / {watchdogMs} ms
      </text>
      <rect x="667" y="146" width="153" height="10" fill="#e0e5e1" />
      <rect
        x="667"
        y="146"
        width={153 * Math.min(1, (s.motorSilence * tickMs) / watchdogMs)}
        height="10"
        fill={s.motorExpired ? "#a33e40" : "#17695b"}
      />
      <text x="667" y="184">
        {s.motorExpired ? "Reset required" : `RX ${s.driverRx.length} / 2`}
      </text>
      {!s.motorExpired &&
        [0, 1].map((i) => (
          <rect
            key={i}
            x={738 + i * 28}
            y="166"
            width="21"
            height="23"
            rx="2"
            fill={i < s.driverRx.length ? "#17695b" : "#edf0ee"}
            stroke="#a4afa7"
          />
        ))}
      <text x="667" y="205">
        {s.driverActive ? `Processing #${s.driverActive.packet.id}` : `${s.driverDropped} driver RX drops`}
      </text>
      <text x="12" y="245">
        Queue boxes show at most 6 entries; counts include all queued packets.
      </text>
    </svg>
  );
}

function Timeline({ snapshots, cursor }: { snapshots: SchedulerSnapshot[]; cursor: number }) {
  const start = Math.max(0, cursor - 200),
    end = start + 200;
  const visible = snapshots.slice(start, cursor + 1);
  const runs: { start: number; end: number; phase: HostPhase }[] = [];
  visible.forEach((s) => {
    const last = runs[runs.length - 1];
    if (last?.phase === s.phase) last.end = s.tick + 1;
    else runs.push({ start: s.tick, end: s.tick + 1, phase: s.phase });
  });
  const x = (tick: number) => 125 + ((tick - start) / 200) * 580;
  const y = (age: number) => 142 - (Math.min(16, age * tickMs) / 16) * 65;
  const path = (kind: "cache" | "applied") =>
    visible
      .map((s) => {
        const packet = s[kind];
        return packet ? `${x(s.tick)},${y(s.tick - packet.born)}` : null;
      })
      .filter(Boolean)
      .join(" ");
  return (
    <div className="signal-chart-scroll" role="region" aria-label="Control timing and packet age timeline" tabIndex={0}>
      <svg
        className="signal-chart"
        viewBox="0 0 740 205"
        role="img"
        aria-label="Last 20 ms: control thread phases and ages of cached state and last accepted command"
      >
        {[0, 5, 10, 15, 20].map((i) => (
          <g key={i}>
            <line x1={x(start + i * 10)} x2={x(start + i * 10)} y1="20" y2="150" stroke="#e0e5e1" />
            <text x={x(start + i * 10)} y="168" textAnchor="middle">
              {((start + i * 10) * tickMs).toFixed(1)}
            </text>
          </g>
        ))}
        <text x="10" y="44">
          Control thread
        </text>
        {runs.map((r, i) => (
          <rect key={i} x={x(r.start)} y="25" width={Math.max(1, x(Math.min(end, r.end)) - x(r.start))} height="26" fill={phaseColor[r.phase]}>
            <title>{`${r.phase}: ${ms(r.start)}–${ms(r.end)}`}</title>
          </rect>
        ))}
        <text x="10" y="98">
          Packet age
        </text>
        <text x="10" y="118">
          0–16 ms
        </text>
        <line x1="125" x2="705" y1="142" y2="142" stroke="#c6cfc8" />
        <polyline points={path("cache")} fill="none" stroke="#17695b" strokeWidth="2" />
        <polyline points={path("applied")} fill="none" stroke="#805095" strokeWidth="2" />
        <text x="415" y="190" textAnchor="middle">
          Model time (ms) · green: cached state age · purple: last accepted command age
        </text>
      </svg>
      <div className="scheduler-legend">
        {(["read", "wait", "update", "write", "stalled"] as const).map((p) => (
          <span key={p}>
            <i style={{ background: phaseColor[p] }} />
            {p === "wait" ? "blocking wait" : p}
          </span>
        ))}
        <span>Age traces capped at 16 ms; numeric ages remain exact.</span>
      </div>
    </div>
  );
}
