import { useEffect, useRef, useState, type ReactNode } from "react";

// Lumped motor thermal model for a joint holding a load at standstill (no iron loss).
//   C_th dT/dt = P_cu - (T - T_amb) / R_th,   P_cu = R(T) i_q^2   (equivalent convention, as in the post)
//   R(T)  = R25 (1 + alpha (T - 25)),          Kt(T) = Kt25 (1 + beta (T - 25))
// The torque current command follows the load torque: i_q* = tau_load / Kt_est,
// where Kt_est is the nominal Kt25 or the temperature-corrected Kt(T).
// Derating: current limit falls linearly from I_peak at T_derate to 0 at T_max.

type Lang = "ko" | "en";
const ALPHA = 0.0039; // copper, 1/K
const BETA = -0.001; // NdFeB flux, 1/K
const T_DERATE = 80;
const T_MAX = 115;
const I_PEAK = 60; // A
const SPEEDUP = 10; // thermal time is shown x10
const WINDOW = 300; // s of (thermal) time on the charts
const COLORS = { T: "#c2410c", pred: "#9a3412", load: "#6b7280", out: "#17695b", i: "#2563eb" };

interface Params {
  R25: number;
  Kt25: number;
  Rth: number;
  Cth: number;
  Tamb: number;
}
const DEFAULTS: Params = { R25: 0.09, Kt25: 0.32, Rth: 0.42, Cth: 105, Tamb: 25 };

const text = {
  en: {
    eyebrow: "Interactive example · Winding heat",
    title: "How the motor heats up while holding the same load",
    load: "Load torque (the torque current command follows)",
    nominal: "Command with nominal Kt",
    corrected: "Command with temperature-corrected Kt",
    play: "Play",
    pause: "Pause",
    reset: "Restart at 25 °C",
    spec: "Motor parameters (example values)",
    R25: "Phase resistance R₂₅ [Ω]",
    Kt25: "Torque constant K_t,25 [N·m/A]",
    Rth: "Thermal resistance R_th [K/W]",
    Cth: "Thermal capacity C_th [J/K]",
    Tamb: "Ambient temperature [°C]",
    chartT: "Winding temperature [°C] · dashed: predicted steady state",
    chartTau: "Load torque (dashed) and output torque [N·m]",
    chartI: "Current i_q [A]",
    x: `Time [s] · thermal time shown ×${SPEEDUP}`,
    T: "Winding temperature",
    Tss: "Predicted steady state",
    R: "Resistance R(T)",
    Kt: "K_t(T)",
    i: "Current i_q",
    P: "Copper loss",
    out: "Output / load",
    derate: "derating zone",
    tau: "Thermal time constant R_thC_th",
    note:
      "First-order lumped thermal model of a joint holding a load at zero speed. Only copper loss R(T)·i_q² is modeled; the current limit falls from 80 °C to zero at 115 °C. Default parameters are the example values used in the post's figure, not measurements.",
  },
};

const R_of = (p: Params, T: number) => p.R25 * (1 + ALPHA * (T - 25));
const Kt_of = (p: Params, T: number) => p.Kt25 * (1 + BETA * (T - 25));
const iLimit = (T: number) => I_PEAK * Math.max(0, Math.min(1, (T_MAX - T) / (T_MAX - T_DERATE)));
function current(p: Params, T: number, load: number, corrected: boolean) {
  const kt = corrected ? Kt_of(p, T) : p.Kt25;
  return Math.min(load / kt, iLimit(T));
}
const loss = (p: Params, T: number, i: number) => R_of(p, T) * i * i;

// Steady state: solve T = Tamb + Rth * P(T) by bisection (the derating limit keeps it bounded).
function steadyState(p: Params, load: number, corrected: boolean) {
  const f = (T: number) => p.Tamb + p.Rth * loss(p, T, current(p, T, load, corrected)) - T;
  let lo = p.Tamb;
  let hi = T_MAX + 5;
  if (f(lo) <= 0) return lo;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

interface Sample {
  t: number;
  T: number;
  i: number;
  out: number;
  load: number;
}

const SUB = /([A-Za-zτ])_([a-z]+[,0-9]*)/g;
function rich(str: string) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of str.matchAll(SUB)) {
    out.push(str.slice(last, m.index!), m[1], <sub key={m.index}>{m[2]}</sub>);
    last = m.index! + m[0].length;
  }
  out.push(str.slice(last));
  return out;
}

// blue (cool) -> amber (derate onset) -> red (max)
function heatColor(T: number) {
  const stops: [number, [number, number, number]][] = [
    [25, [96, 165, 250]],
    [60, [251, 191, 36]],
    [T_DERATE, [249, 115, 22]],
    [T_MAX, [220, 38, 38]],
  ];
  if (T <= stops[0][0]) return `rgb(${stops[0][1].join(",")})`;
  for (let k = 1; k < stops.length; k++) {
    const [t1, c1] = stops[k];
    const [t0, c0] = stops[k - 1];
    if (T <= t1) {
      const a = (T - t0) / (t1 - t0);
      return `rgb(${c0.map((v, j) => Math.round(v + a * (c1[j] - v))).join(",")})`;
    }
  }
  return `rgb(${stops[stops.length - 1][1].join(",")})`;
}

// Demo text is English on every page; `lang` is accepted for compatibility with existing posts.
export default function ThermalDemo(_props: { lang?: Lang }) {
  const t = text.en;
  const [load, setLoad] = useState(11);
  const [corrected, setCorrected] = useState(false);
  const [p, setP] = useState<Params>(DEFAULTS);
  const [playing, setPlaying] = useState(false);
  const [, setFrame] = useState(0);
  const state = useRef({ time: 0, T: DEFAULTS.Tamb });
  const hist = useRef<Sample[]>([]);
  const nextSample = useRef(0);
  const live = useRef({ load, corrected, p });
  live.current = { load, corrected, p };

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) setPlaying(true);
  }, []);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last: number | undefined;
    const tick = (now: number) => {
      const dtReal = last === undefined ? 0 : Math.min(0.05, (now - last) / 1000);
      last = now;
      const { load: L, corrected: c, p: q } = live.current;
      let remaining = dtReal * SPEEDUP;
      while (remaining > 1e-9) {
        const dt = Math.min(0.05, remaining);
        const s = state.current;
        const i = current(q, s.T, L, c);
        s.T += ((loss(q, s.T, i) - (s.T - q.Tamb) / q.Rth) / q.Cth) * dt;
        s.time += dt;
        remaining -= dt;
        if (s.time >= nextSample.current) {
          hist.current.push({ t: s.time, T: s.T, i, out: Kt_of(q, s.T) * i, load: L });
          nextSample.current = s.time + 1;
        }
      }
      const cutoff = state.current.time - WINDOW;
      while (hist.current.length > 2 && hist.current[0].t < cutoff) hist.current.shift();
      setFrame((f) => f + 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const reset = () => {
    state.current = { time: 0, T: p.Tamb };
    hist.current = [];
    nextSample.current = 0;
    setFrame((f) => f + 1);
  };

  const T = state.current.T;
  const i = current(p, T, load, corrected);
  const out = Kt_of(p, T) * i;
  const Tss = steadyState(p, load, corrected);
  const derating = T > T_DERATE;

  // ---- charts ----
  const W = 420;
  const H = 104;
  const t1 = Math.max(WINDOW, state.current.time);
  const t0 = t1 - WINDOW;
  const X = (tt: number) => 38 + ((tt - t0) / WINDOW) * (W - 48);
  const Y = (lo: number, hi: number) => (v: number) => H - 14 - ((v - lo) / (hi - lo)) * (H - 24);
  const YT = Y(20, 125);
  const tauMax = Math.max(5, Math.ceil((load * 1.2) / 5) * 5);
  const Ytau = Y(0, tauMax);
  const iMax = Math.max(10, Math.ceil((Math.max(i, load / p.Kt25) * 1.2) / 10) * 10);
  const Yi = Y(0, iMax);
  const poly = (key: keyof Sample, Yf: (v: number) => number, color: string, dash?: string) =>
    hist.current.length > 1 ? (
      <polyline
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeDasharray={dash}
        points={hist.current.map((h) => `${X(h.t).toFixed(1)},${Yf(h[key]).toFixed(1)}`).join(" ")}
      />
    ) : null;
  const axes = (Yf: (v: number) => number, ticks: number[]) => (
    <g className="foc-axes">
      <line x1={38} x2={W - 10} y1={H - 14} y2={H - 14} />
      <line x1={38} x2={38} y1={6} y2={H - 14} />
      {ticks.map((v) => (
        <text key={v} x={32} y={Yf(v) + 4} textAnchor="end">
          {v}
        </text>
      ))}
      {[0, 100, 200, 300].map((k) => (
        <text key={k} x={X(Math.ceil(t0 / 100) * 100 + k)} y={H - 1} textAnchor="middle">
          {Math.ceil(t0 / 100) * 100 + k}
        </text>
      ))}
    </g>
  );
  const hline = (Yf: (v: number) => number, v: number, color: string, dash: string, opacity = 0.6) => (
    <line x1={38} x2={W - 10} y1={Yf(v)} y2={Yf(v)} stroke={color} strokeOpacity={opacity} strokeDasharray={dash} />
  );

  // ---- motor icon colored by temperature ----
  const C = 90;
  const fill = heatColor(T);
  const field = (key: keyof Params, label: string, step: number, min: number, max: number) => (
    <label className="thermal-field" key={key}>
      <span>{rich(label)}</span>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={p[key]}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v) && v >= min && v <= max) setP({ ...p, [key]: v });
        }}
      />
    </label>
  );

  return (
    <section className="signal-demo foc-demo thermal-demo" aria-label={t.title}>
      <header className="signal-demo-heading">
        <span className="eyebrow">{t.eyebrow}</span>
        <h3>{t.title}</h3>
      </header>

      <div className="can-bit-select" role="group" aria-label="Kt">
        <button type="button" aria-pressed={!corrected} onClick={() => setCorrected(false)}>
          {rich(t.nominal.replace("Kt", "K_t"))}
        </button>
        <button type="button" aria-pressed={corrected} onClick={() => setCorrected(true)}>
          {rich(t.corrected.replace("Kt", "K_t"))}
        </button>
        <button type="button" className="foc-play" onClick={() => setPlaying((v) => !v)}>
          {playing ? t.pause : t.play}
        </button>
        <button type="button" onClick={reset}>
          {t.reset}
        </button>
      </div>

      <div className="foc-layout thermal-layout">
        <div className="thermal-motor">
          <svg viewBox="0 0 180 180" role="img" aria-label={`${t.T} ${T.toFixed(0)} °C`}>
            <circle cx={C} cy={C} r={82} fill="#f4f5f2" stroke="#c9ccc4" strokeWidth={8} />
            {[0, 120, 240].map((a) => {
              const r = 58;
              const x = C + r * Math.cos((a * Math.PI) / 180);
              const y = C - r * Math.sin((a * Math.PI) / 180);
              return <rect key={a} x={x - 13} y={y - 19} width={26} height={38} rx={4} transform={`rotate(${-a} ${x} ${y})`} fill={fill} stroke="#7c2d12" strokeOpacity={0.25} />;
            })}
            <circle cx={C} cy={C} r={34} fill="#d6d3d1" />
            <text x={C} y={C + 6} textAnchor="middle" className="thermal-temp">
              {T.toFixed(0)}°C
            </text>
          </svg>
          <div className={`thermal-badge${derating ? " on" : ""}`}>{t.derate}</div>
        </div>

        <div className="foc-charts">
          <div className="foc-chart-title">{t.chartT}</div>
          <svg viewBox={`0 0 ${W} ${H}`} className="foc-chart" role="img" aria-label={t.chartT}>
            {axes(YT, [25, 80, 115])}
            {hline(YT, T_DERATE, "#f97316", "2 3")}
            {hline(YT, T_MAX, "#dc2626", "2 3")}
            {hline(YT, Tss, COLORS.pred, "6 4", 0.9)}
            {poly("T", YT, COLORS.T)}
          </svg>
          <div className="foc-chart-title">{t.chartTau}</div>
          <svg viewBox={`0 0 ${W} ${H}`} className="foc-chart" role="img" aria-label={t.chartTau}>
            {axes(Ytau, [0, tauMax])}
            {poly("load", Ytau, COLORS.load, "5 4")}
            {poly("out", Ytau, COLORS.out)}
          </svg>
          <div className="foc-chart-title">{rich(t.chartI)}</div>
          <svg viewBox={`0 0 ${W} ${H}`} className="foc-chart" role="img" aria-label={t.chartI.replace(/_/g, "")}>
            {axes(Yi, [0, iMax])}
            {poly("i", Yi, COLORS.i)}
          </svg>
          <div className="foc-x-label">{t.x}</div>
        </div>
      </div>

      <div className="foc-controls thermal-controls">
        <div className="foc-control">
          <label>
            {t.load} <strong>{load.toFixed(1)} N·m</strong>
          </label>
          <input type="range" min={0} max={18} step={0.5} value={load} onChange={(e) => setLoad(+e.target.value)} />
        </div>
      </div>

      <details className="thermal-spec">
        <summary>{t.spec}</summary>
        <div className="thermal-fields">
          {field("R25", t.R25, 0.01, 0.01, 1)}
          {field("Kt25", t.Kt25, 0.01, 0.05, 2)}
          {field("Rth", t.Rth, 0.02, 0.05, 3)}
          {field("Cth", t.Cth, 5, 10, 1000)}
          {field("Tamb", t.Tamb, 1, -10, 60)}
        </div>
        <p className="demo-model-note">
          {rich(t.tau)} = {(p.Rth * p.Cth).toFixed(0)} s
        </p>
      </details>

      <output className={`can-readout${derating ? " logic-uncertain" : ""}`} aria-live="polite">
        <span>
          {t.T}
          <strong>{T.toFixed(1)} °C</strong>
        </span>
        <span>
          {t.Tss}
          <strong>{Tss.toFixed(0)} °C</strong>
        </span>
        <span>
          {t.R}
          <strong>{(R_of(p, T) * 1000).toFixed(1)} mΩ</strong>
        </span>
        <span>
          {rich(t.Kt)}
          <strong>{Kt_of(p, T).toFixed(3)}</strong>
        </span>
        <span>
          {rich(t.i)}
          <strong>{i.toFixed(1)} A</strong>
        </span>
        <span>
          {t.P}
          <strong>{loss(p, T, i).toFixed(0)} W</strong>
        </span>
        <span>
          {t.out}
          <strong>{load > 0 ? `${Math.round((100 * out) / load)}%` : "–"}</strong>
        </span>
      </output>
      <p className="demo-model-note">{rich(t.note)}</p>
    </section>
  );
}
