import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

// Torque ripple: what the simulator assumes vs what the motor does.
// A 12-slot 14-pole outer-rotor motor turns at a set speed while a brake pad applies the load torque tau_L.
// The current loop holds the mean torque at tau_L; the electrical angle is theta_e = p * theta_m.
//   ideal:   tau = tau_L
//   gauss:   tau = tau_L + sigma * n_k,  n_k independent N(0, 1), sigma = RMS of the modeled ripple
//   ripple:  tau = tau_L + r(theta_e, tau_L)
//     cogging   a_c * sin(12 theta_e)                     LCM(12, 14) / 7 = 12 per electrical period, no current needed
//     inverter  a_6 * tau_L * sin(6 theta_e + 0.6)          dead-time 6th harmonic, scales with current
//     encoder   tau_L * (cos(d) - 1),  d = e * sin(theta_e)  angle error repeating per electrical period

type Lang = "ko" | "en";
const P = 7; // pole pairs
const SLOTS = 12;
const FS = 3000; // Hz, internal sampling
const STRIP = 0.3; // s shown in the time plots
const FOLD_T = 3; // s of samples folded onto the electrical angle
const FOLD_DEC = 6; // keep every 6th sample for the fold plots
const DEG = Math.PI / 180;
const COLORS = { ideal: "#6b7280", gauss: "#7c3aed", ripple: "#2563eb", avg: "#c2410c", cursor: "#111827" };

const text = {
  en: {
    eyebrow: "Interactive example · Position-locked error",
    title: "The torque a simulator assumes vs the torque a motor makes",
    speed: "Motor speed",
    load: "Load torque τ_L",
    play: "Play",
    pause: "Pause",
    motorCap: "12-slot 14-pole outer-rotor motor · grey pad applies the load",
    now: "Instantaneous torque − τ_L",
    panels: {
      ideal: ["Ideal actuator in simulation", "τ = τ_L"],
      gauss: ["Independent Gaussian noise", "τ = τ_L + σ·n_k,  n_k ~ N(0, 1)"],
      ripple: ["Modeled torque ripple", "τ = τ_L + r(θ_e, τ_L)"],
    } as Record<string, [string, string]>,
    timeAxis: "Last 300 ms",
    foldAxis: "Electrical angle θ_e [°]",
    foldNote: "Last 3 s folded on θ_e",
    avgNote: " · orange: mean",
    parts: "Ripple components",
    cog: "Cogging amplitude (12th)",
    inv: "Inverter dead-time harmonic (6th)",
    enc: "Encoder angle error (per electrical period)",
    pp: "Ripple peak-to-peak",
    rms: "Ripple RMS = σ",
    bias: "Mean torque error",
    f6: "6th-order frequency",
    f12: "12th-order frequency",
    note:
      "Concept model, not measured data. The current loop is assumed to hold the mean torque at τ_L, and only position-locked components are added on top. Cogging stays at zero current, while the inverter harmonic and the encoder error scale with load. The encoder error also lowers the mean torque, a bias that neither the ideal model nor independent noise shows. The plots show electromagnetic torque, without filtering by the link inertia.",
  },
};

// deterministic standard normal for sample index k (same on server and client)
function hash32(x: number) {
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
function normalAt(k: number) {
  const u = Math.max(1e-9, hash32(2 * k + 1));
  const v = hash32(2 * k + 2);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

interface Params {
  load: number;
  cog: number;
  inv: number;
  enc: number;
}
function ripple(the: number, u: Params) {
  const d = u.enc * DEG * Math.sin(the);
  return u.cog * Math.sin(12 * the) + u.load * (u.inv / 100) * Math.sin(6 * the + 0.6) + u.load * (Math.cos(d) - 1);
}
function rippleStats(u: Params) {
  const n = 720;
  let mean = 0;
  let lo = Infinity;
  let hi = -Infinity;
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    v[i] = ripple((i / n) * 2 * Math.PI, u);
    mean += v[i];
    lo = Math.min(lo, v[i]);
    hi = Math.max(hi, v[i]);
  }
  mean /= n;
  let ss = 0;
  for (const x of v) ss += (x - mean) ** 2;
  return { mean, sigma: Math.sqrt(ss / n), pp: hi - lo, lo, hi };
}

interface Sample {
  k: number; // global sample index (noise seed)
  the: number; // electrical angle wrapped to [0, 2pi)
}
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
}

const C = 150;
const PAD = -38 * DEG; // brake pad angle (math convention)
const R_OUT = 120;
const padPt = (r: number): [number, number] => [C + r * Math.cos(PAD), C - r * Math.sin(PAD)];
const pol = (a: number, r: number): [number, number] => [C + r * Math.cos(a), C - r * Math.sin(a)];
function arcSeg(a0: number, a1: number, r0: number, r1: number) {
  const [x0, y0] = pol(a0, r1);
  const [x1, y1] = pol(a1, r1);
  const [x2, y2] = pol(a1, r0);
  const [x3, y3] = pol(a0, r0);
  return `M${x0} ${y0} A${r1} ${r1} 0 0 0 ${x1} ${y1} L${x2} ${y2} A${r0} ${r0} 0 0 1 ${x3} ${y3} Z`;
}

function rich(str: string) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of str.matchAll(/([A-Za-zθτσ])_([A-Za-z]+)/g)) {
    out.push(str.slice(last, m.index!), m[1], <sub key={m.index}>{m[2]}</sub>);
    last = m.index! + m[0].length;
  }
  out.push(str.slice(last));
  return out;
}

// pre-fill buffers so the first (server) render already has data
function prefill(rpm: number) {
  const wm = (rpm / 60) * 2 * Math.PI;
  const n = Math.round(FOLD_T * FS);
  const strip: Sample[] = [];
  const fold: Sample[] = [];
  for (let k = 0; k < n; k++) {
    const the = (((P * wm * k) / FS) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const s = { k, the };
    if (k >= n - STRIP * FS) strip.push(s);
    if (k % FOLD_DEC === 0) fold.push(s);
  }
  return { strip, fold, k: n, thm: (wm * n) / FS };
}

// Demo text is English on every page; `lang` is accepted for compatibility with existing posts.
export default function TorqueRippleDemo(_props: { lang?: Lang }) {
  const t = text.en;
  const [rpm, setRpm] = useState(30);
  const [load, setLoad] = useState(5);
  const [cog, setCog] = useState(0.15);
  const [inv, setInv] = useState(4);
  const [enc, setEnc] = useState(15);
  const [playing, setPlaying] = useState(true);
  const [, setFrame] = useState(0);

  const init = useRef<ReturnType<typeof prefill> | null>(null);
  if (!init.current) init.current = prefill(30);
  const strip = useRef<Sample[]>(init.current.strip);
  const fold = useRef<Sample[]>(init.current.fold);
  const kNext = useRef(init.current.k);
  const thm = useRef(init.current.thm); // mechanical angle
  const rpmRef = useRef(rpm);
  const loadRef = useRef(load);
  rpmRef.current = rpm;
  loadRef.current = load;
  const sparks = useRef<Spark[]>([]);
  const sparkDebt = useRef(0);
  const box = useRef<HTMLElement>(null);
  const visible = useRef(true);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => (visible.current = e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let carry = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (visible.current) {
        const wm = (rpmRef.current / 60) * 2 * Math.PI;
        carry += dt * FS;
        const n = Math.floor(carry);
        carry -= n;
        for (let i = 0; i < n; i++) {
          thm.current += wm / FS;
          const k = kNext.current++;
          const s = { k, the: (((P * thm.current) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) };
          strip.current.push(s);
          if (k % FOLD_DEC === 0) fold.current.push(s);
        }
        const sMax = Math.round(STRIP * FS);
        if (strip.current.length > sMax) strip.current.splice(0, strip.current.length - sMax);
        const fMax = Math.round((FOLD_T * FS) / FOLD_DEC);
        if (fold.current.length > fMax) fold.current.splice(0, fold.current.length - fMax);

        // sparks follow friction power at the pad: load x speed
        const L = loadRef.current / 10;
        const w = wm / (4 * Math.PI); // 120 rpm -> 1
        sparkDebt.current += dt * 420 * L * Math.min(1.2, w + 0.05);
        const [px, py] = padPt(R_OUT + 1);
        while (sparkDebt.current >= 1) {
          sparkDebt.current -= 1;
          const spread = (Math.random() - 0.5) * 0.9;
          const sp = 140 + Math.random() * 260 * Math.min(1.2, w + 0.25);
          const tx = -Math.sin(PAD); // surface moves counter-clockwise
          const ty = -Math.cos(PAD);
          const vx = sp * (tx * Math.cos(spread) - ty * Math.sin(spread)) + Math.cos(PAD) * 40 * Math.random();
          const vy = sp * (tx * Math.sin(spread) + ty * Math.cos(spread)) - Math.sin(PAD) * 40 * Math.random();
          const max = 0.25 + Math.random() * 0.35;
          sparks.current.push({ x: px, y: py, vx, vy, life: max, max });
        }
        for (const p of sparks.current) {
          p.vy += 420 * dt;
          p.vx *= 1 - 1.5 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.life -= dt;
        }
        sparks.current = sparks.current.filter((p) => p.life > 0 && p.x > 0 && p.x < 300 && p.y < 300).slice(-220);
        setFrame((f) => f + 1);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const u: Params = { load, cog, inv, enc };
  const st = useMemo(() => rippleStats(u), [load, cog, inv, enc]);
  const fe = (P * rpm) / 60;
  const val = {
    ideal: () => load,
    gauss: (s: Sample) => load + st.sigma * normalAt(s.k),
    ripple: (s: Sample) => load + ripple(s.the, u),
  };
  const cur = strip.current[strip.current.length - 1];
  const span = Math.max(0.25, 1.12 * Math.max(Math.abs(st.lo), Math.abs(st.hi), 3 * st.sigma));

  // ---- small plots ----
  const W = 300;
  const H = 128;
  const L = 34;
  const B = 20;
  const R = 16;
  const Y = (v: number) => 8 + (1 - (v - (load - span)) / (2 * span)) * (H - 8 - B);
  const Xa = (the: number) => L + (the / (2 * Math.PI)) * (W - L - 8);
  const yTicks = [load - span * 0.75, load, load + span * 0.75];
  const fmt = (v: number) => (Math.abs(v) < 0.005 ? "0" : v.toFixed(Math.abs(span) < 0.6 ? 2 : 1));
  const axes = (xLabels: [number, string][]) => (
    <g className="foc-axes">
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} />
      <line x1={L} x2={L} y1={6} y2={H - B} />
      {yTicks.map((v, i) => (
        <text key={i} x={L - 5} y={Y(v) + 4} textAnchor="end">
          {fmt(v)}
        </text>
      ))}
      {xLabels.map(([x, s]) => (
        <text key={s} x={x} y={H - B + 13} textAnchor="middle">
          {s}
        </text>
      ))}
    </g>
  );
  const clipY = (v: number) => Math.max(4, Math.min(H - B, Y(v)));

  const timePlot = (key: keyof typeof val, color: string) => {
    const arr = strip.current;
    const n = arr.length;
    const step = Math.max(1, Math.floor(n / 450));
    const pts: string[] = [];
    for (let i = 0; i < n; i += step) {
      const x = L + (i / Math.max(1, n - 1)) * (W - L - 8);
      pts.push(`${x.toFixed(1)},${clipY(val[key](arr[i])).toFixed(1)}`);
    }
    if (n) pts.push(`${(W - R).toFixed(1)},${clipY(val[key](arr[n - 1])).toFixed(1)}`);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="foc-chart" role="img" aria-label={t.timeAxis}>
        {axes([
          [L, "−300"],
          [L + (W - L - 8) / 2, "−150"],
          [W - R, "0 ms"],
        ])}
        <polyline fill="none" stroke={color} strokeWidth={1.5} points={pts.join(" ")} />
        {cur && <circle cx={W - R} cy={clipY(val[key](cur))} r={3} fill={color} />}
      </svg>
    );
  };

  const foldPlot = (key: keyof typeof val, color: string) => {
    const arr = fold.current;
    let d = "";
    const BINS = 120;
    const sum = new Float64Array(BINS);
    const cnt = new Float64Array(BINS);
    for (const s of arr) {
      const v = val[key](s);
      d += `M${Xa(s.the).toFixed(1)} ${clipY(v).toFixed(1)}h0.01`;
      const b = Math.min(BINS - 1, Math.floor((s.the / (2 * Math.PI)) * BINS));
      sum[b] += v;
      cnt[b] += 1;
    }
    const avg: string[] = [];
    for (let b = 0; b < BINS; b++) if (cnt[b]) avg.push(`${Xa(((b + 0.5) / BINS) * 2 * Math.PI).toFixed(1)},${clipY(sum[b] / cnt[b]).toFixed(1)}`);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="foc-chart" role="img" aria-label={t.foldAxis}>
        {axes([0, 90, 180, 270, 360].map((g) => [Xa(g * DEG), `${g}`] as [number, string]))}
        <path d={d} stroke={color} strokeOpacity={key === "gauss" ? 0.28 : 0.6} strokeWidth={2.2} strokeLinecap="round" fill="none" />
        {key === "gauss" && <polyline fill="none" stroke={COLORS.avg} strokeWidth={1.8} points={avg.join(" ")} />}
        {cur && (
          <g>
            <line x1={Xa(cur.the)} x2={Xa(cur.the)} y1={6} y2={H - B} stroke={COLORS.cursor} strokeOpacity={0.35} strokeDasharray="3 3" />
            <circle cx={Xa(cur.the)} cy={clipY(val[key](cur))} r={3.2} fill={color} stroke="#fff" strokeWidth={1} />
          </g>
        )}
      </svg>
    );
  };

  const slider = (label: string, value: number, set: (v: number) => void, min: number, max: number, stepv: number, unit: string) => (
    <div className="foc-control">
      <label>
        <span>{rich(label)}</span>{" "}
        <strong>
          {value}
          {unit}
        </strong>
      </label>
      <input type="range" min={min} max={max} step={stepv} value={value} onChange={(e) => set(+e.target.value)} />
    </div>
  );

  // ---- motor drawing ----
  const rot = thm.current / DEG;
  const magnets = Array.from({ length: 2 * P }, (_, i) => {
    const a0 = (i / (2 * P)) * 2 * Math.PI + 0.02;
    const a1 = ((i + 1) / (2 * P)) * 2 * Math.PI - 0.02;
    return <path key={i} d={arcSeg(a0, a1, 92, 106)} fill={i % 2 ? "#a9bfe0" : "#e7b3a8"} stroke="#fff" strokeWidth={0.6} />;
  });
  const phaseColor = ["#d97706", "#0f766e", "#7c3aed"];
  const teeth = Array.from({ length: SLOTS }, (_, i) => {
    const a = (i / SLOTS) * 2 * Math.PI + Math.PI / 2;
    const [x, y] = pol(a, 58);
    const [sx, sy] = pol(a, 84);
    return (
      <g key={i}>
        <rect x={x - 6} y={y - 24} width={12} height={48} transform={`rotate(${-a / DEG + 90} ${x} ${y})`} fill="#b8bcb4" />
        <rect x={x - 9} y={y - 14} width={18} height={26} rx={3} transform={`rotate(${-a / DEG + 90} ${x} ${y})`} fill={phaseColor[i % 3]} fillOpacity={0.55} />
        <rect x={sx - 13} y={sy - 3} width={26} height={6} rx={1.5} transform={`rotate(${-a / DEG + 90} ${sx} ${sy})`} fill="#9ca3a0" />
      </g>
    );
  });
  const padW = 0.25 + 0.75 * (load / 10);
  const live: [keyof typeof val, string][] = [
    ["ideal", COLORS.ideal],
    ["gauss", COLORS.gauss],
    ["ripple", COLORS.ripple],
  ];

  return (
    <section ref={box} className="signal-demo foc-demo ripple-demo" aria-label={t.title}>
      <header className="signal-demo-heading">
        <span className="eyebrow">{t.eyebrow}</span>
        <h3>{t.title}</h3>
      </header>

      <div className="ripple-top">
        <figure className="ripple-motor">
          <svg viewBox="0 0 300 300" role="img" aria-label={t.motorCap}>
            <defs>
              <radialGradient id="ripple-glow">
                <stop offset="0%" stopColor="#fff7c2" stopOpacity={1} />
                <stop offset="45%" stopColor="#fbbf24" stopOpacity={0.7} />
                <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
              </radialGradient>
            </defs>
            <g transform={`rotate(${-rot} ${C} ${C})`}>
              <circle cx={C} cy={C} r={113} fill="none" stroke="#8d938b" strokeWidth={14} />
              {magnets}
              <circle cx={pol(Math.PI / 2, 113)[0]} cy={pol(Math.PI / 2, 113)[1]} r={3.5} fill="#fff" />
            </g>
            {teeth}
            <circle cx={C} cy={C} r={30} fill="#d9dcd5" stroke="#b8bcb4" />
            <circle cx={C} cy={C} r={8} fill="#8d938b" />
            {load > 0 && (
              <rect
                x={padPt(R_OUT + 9)[0] - 7}
                y={padPt(R_OUT + 9)[1] - 14}
                width={14}
                height={28}
                rx={2}
                transform={`rotate(${-PAD / DEG} ${padPt(R_OUT + 9)[0]} ${padPt(R_OUT + 9)[1]})`}
                fill="#4b5563"
                fillOpacity={padW}
              />
            )}
            {load > 0 && rpm > 0 && (
              <circle cx={padPt(R_OUT + 1)[0]} cy={padPt(R_OUT + 1)[1]} r={6 + 9 * (load / 10)} fill="url(#ripple-glow)" opacity={0.35 + 0.6 * (load / 10)} />
            )}
            <g>
              {sparks.current.map((p, k) => {
                const f = p.life / p.max;
                return (
                  <line
                    key={k}
                    x1={p.x}
                    y1={p.y}
                    x2={p.x - p.vx * 0.04}
                    y2={p.y - p.vy * 0.04}
                    stroke={f > 0.6 ? "#fef08a" : f > 0.3 ? "#fbbf24" : "#f97316"}
                    strokeOpacity={Math.min(1, 0.35 + f)}
                    strokeWidth={f > 0.5 ? 2 : 1.4}
                    strokeLinecap="round"
                  />
                );
              })}
            </g>
          </svg>
          <figcaption>{t.motorCap}</figcaption>
        </figure>

        <div className="ripple-side">
          <div className="foc-controls ripple-main-controls">
            {slider(t.speed, rpm, setRpm, 5, 120, 5, " rpm")}
            {slider(t.load, load, setLoad, 0, 10, 0.5, " N·m")}
          </div>
          <div className="ripple-live" aria-hidden="true">
            <div className="ripple-live-title">{rich(t.now)}</div>
            {live.map(([key, color]) => {
              const dv = cur ? val[key](cur) - load : 0;
              const frac = Math.max(-1, Math.min(1, dv / span));
              return (
                <div key={key} className="ripple-live-row">
                  <span>{t.panels[key][0]}</span>
                  <div className="ripple-live-bar">
                    <i style={{ left: frac < 0 ? `${50 + 50 * frac}%` : "50%", width: `${50 * Math.abs(frac)}%`, background: color }} />
                  </div>
                  <strong>{(dv >= 0 ? "+" : "−") + Math.abs(dv).toFixed(2)}</strong>
                </div>
              );
            })}
          </div>
          <button type="button" className="ripple-play" onClick={() => setPlaying((p) => !p)}>
            {playing ? t.pause : t.play}
          </button>
        </div>
      </div>

      <div className="ripple-three">
        {live.map(([key, color]) => (
          <div key={key} className={`ripple-panel ripple-panel-${key}`}>
            <div className="ripple-panel-head">
              <strong style={{ color }}>{t.panels[key][0]}</strong>
              <code>{rich(t.panels[key][1])}</code>
            </div>
            <div className="foc-chart-title">{t.timeAxis}</div>
            {timePlot(key, color)}
            <div className="foc-chart-title">
              {rich(t.foldNote)}
              {key === "gauss" && t.avgNote}
            </div>
            {foldPlot(key, color)}
            <div className="foc-x-label">{rich(t.foldAxis)}</div>
          </div>
        ))}
      </div>

      <details className="thermal-spec">
        <summary>{t.parts}</summary>
        <div className="foc-controls">
          {slider(t.cog, cog, setCog, 0, 0.4, 0.01, " N·m")}
          {slider(t.inv, inv, setInv, 0, 8, 0.5, " %")}
          {slider(t.enc, enc, setEnc, 0, 20, 1, "°")}
        </div>
      </details>

      <output className="can-readout" aria-live="off">
        <span>
          {t.pp}
          <strong>{st.pp.toFixed(2)} N·m</strong>
        </span>
        <span>
          {t.rms}
          <strong>{st.sigma.toFixed(3)} N·m</strong>
        </span>
        <span>
          {t.bias}
          <strong>{st.mean.toFixed(3)} N·m</strong>
        </span>
        <span>
          {t.f6}
          <strong>{(6 * fe).toFixed(0)} Hz</strong>
        </span>
        <span>
          {t.f12}
          <strong>{(12 * fe).toFixed(0)} Hz</strong>
        </span>
      </output>
      <p className="demo-model-note">{rich(t.note)}</p>
    </section>
  );
}
