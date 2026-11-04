import { useEffect, useMemo, useRef, useState } from "react";

// Upright 1-DoF arm (joint on the ground, link above it, gravity pulling it over) swung along q_d = A sin(2 pi f t) by a PD position
// controller with a 2 ms delay.
// Rigid gearbox: joint inertia J_L + N^2 J_m. SEA: rotor N^2 J_m and link J_L joined by a spring
// K_s (damping ratio 0.1); the PD acts on the motor angle (collocated, motor encoder).
// Linear analysis (sin q ~ q, delay as 1st-order Pade) gives the closed-loop poles, the
// bandwidth of q/q_d (within +-3 dB), the tracking gain and lag at f, and a K_p sweep (stable range, root locus,
// best bandwidth).
// The animation is a separate time simulation (nonlinear gravity, true delay buffer).

type Lang = "ko" | "en";
const JL = 0.09; // kg m^2 (1 kg at 0.3 m, series example)
const JM = 1e-5; // kg m^2, rotor
const MGL = 1 * 9.81 * 0.3; // N m/rad, gravity "negative stiffness" of the upright arm
const B = 0.05; // N m s/rad, joint friction
const DELAY = 0.002; // s, control delay (sampling + current loop)
const AMP = 60; // deg, commanded swing amplitude (-60..60 deg)
const SIM_T = 3; // s
const F_LO = 0.3;
const F_HI = 10; // Hz, swing frequency range
const ZMIN = 0.1; // minimum damping ratio accepted for the "best bandwidth" search
const COLORS = { pole: "#c2410c", locus: "#cbd5e1", locusBad: "#fca5a5", link: "#374151", rotor: "#7c3aed", q: "#202725" };

const text = {
  en: {
    eyebrow: "Interactive example · Swinging a 1-DoF arm against gravity",
    title: "How fast can a geared joint swing an upright arm?",
    rigid: "Rigid gearbox",
    sea: "SEA (series spring)",
    N: "Gear ratio N",
    kp: "K_p",
    kd: "K_d",
    ks: "Spring stiffness K_s",
    play: "Play",
    stop: "Stop",
    poles: "Closed-loop poles [rad/s] · red half-plane is unstable · gray trail: K_p swept with this K_d",
    resp: `Link angle [deg] · command ±${AMP}° (dashed)`,
    f: "Swing frequency f",
    gain: "Swing amplitude at f",
    lag: "Lag behind the command at f",
    x: "Last 3 s",
    bw: "Bandwidth now (q/q_d within ±3 dB)",
    peak: "Resonant peak of q/q_d",
    fs: "Spring mode f_s = √((K_s − mgl)/J_L)/2π",
    rigidFs: "– (rigid)",
    zeta: "Lowest damping ratio",
    range: "Stable K_p range (this K_d)",
    best: `Best bandwidth over K_p (ζ ≥ ${ZMIN})`,
    unstable: "unstable",
    none: "none",
    off: "fast poles off the plot",
    hit: "hits the ground (resonance overshoot)",
    diverge: "unstable: poles in the right half-plane",
    note: `1 kg at 0.3 m above the joint (J_L = 0.09 kg·m²; gravity acts as a negative stiffness mgl = ${MGL.toFixed(2)} N·m/rad, so K_p must exceed it), commanded to swing ±${AMP}° about upright at f, rotor J_m = 1×10⁻⁵ kg·m² reflected as N²J_m, joint friction ${B} N·m·s/rad, control delay ${DELAY * 1000} ms (1st-order Padé in the pole plot). In SEA mode the PD acts on the motor angle and the spring has a damping ratio of 0.1. No torque limit is modeled. The ground at ±90° is a stop with restitution 0.3; the arm bounces off it and keeps swinging. Bandwidth is the highest frequency up to which |q/q_d| stays within ±3 dB (0.71–1.41×) of its DC value, so a resonant overshoot does not count as tracking. In SEA mode the spring shows only once f approaches f_s: lower K_s and swing at 2 Hz or faster. Poles, bandwidth and the K_p sweep come from the linearized model; the animation is a nonlinear time simulation of the same system.`,
  },
};

// ---- small polynomial / complex helpers (coefficients ascending: c0 + c1 s + ...) ----
type Poly = number[];
const padd = (a: Poly, b: Poly): Poly => Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] ?? 0) + (b[i] ?? 0));
const pmul = (a: Poly, b: Poly): Poly => {
  const r = new Array(a.length + b.length - 1).fill(0);
  a.forEach((x, i) => b.forEach((y, j) => (r[i + j] += x * y)));
  return r;
};
const pscale = (a: Poly, k: number): Poly => a.map((x) => x * k);
type C = [number, number];
const cmul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a: C, b: C): C => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
const peval = (p: Poly, s: C): C => {
  let r: C = [0, 0];
  for (let i = p.length - 1; i >= 0; i--) r = [cmul(r, s)[0] + p[i], cmul(r, s)[1]];
  return r;
};
// Durand-Kerner roots
function roots(p: Poly): C[] {
  let q = [...p];
  while (q.length > 1 && Math.abs(q[q.length - 1]) < 1e-300) q.pop();
  const n = q.length - 1;
  if (n < 1) return [];
  const lead = q[n];
  q = q.map((x) => x / lead);
  const R = 1 + Math.max(...q.slice(0, n).map(Math.abs));
  let z: C[] = Array.from({ length: n }, (_, k) => [R * Math.cos((2 * Math.PI * k) / n + 0.4), R * Math.sin((2 * Math.PI * k) / n + 0.4)]);
  for (let it = 0; it < 500; it++) {
    let moved = 0;
    z = z.map((zi, i) => {
      let den: C = [1, 0];
      z.forEach((zj, j) => {
        if (j !== i) den = cmul(den, [zi[0] - zj[0], zi[1] - zj[1]]);
      });
      const step = cdiv(peval(q, zi), den);
      moved = Math.max(moved, Math.hypot(step[0], step[1]) / (1 + Math.hypot(zi[0], zi[1])));
      return [zi[0] - step[0], zi[1] - step[1]];
    });
    if (moved < 1e-12) break;
  }
  return z;
}

// characteristic polynomial and q/q_d numerator
function model(N: number, Kp: number, Kd: number, sea: boolean, Ks: number) {
  const Ir = N * N * JM;
  const dn: Poly = [1, DELAY / 2];
  const nm: Poly = [1, -DELAY / 2];
  const Cc: Poly = [Kp, Kd];
  if (!sea) {
    const P: Poly = [-MGL, B, JL + Ir];
    return { ch: padd(pmul(P, dn), pmul(Cc, nm)), num: pscale(nm, Kp) };
  }
  const Bs = 2 * 0.1 * Math.sqrt((Ks * JL * Ir) / (JL + Ir));
  const R: Poly = [Ks, B + Bs, Ir];
  const Lk: Poly = [Ks - MGL, Bs, JL];
  const cpl: Poly = [Ks, Bs];
  const ch = padd(pmul(padd(pmul(R, dn), pmul(Cc, nm)), Lk), pscale(pmul(pmul(cpl, cpl), dn), -1));
  return { ch, num: pmul(pscale(nm, Kp), cpl) };
}

function analyse(N: number, Kp: number, Kd: number, sea: boolean, Ks: number) {
  const { ch, num } = model(N, Kp, Kd, sea, Ks);
  const r = roots(ch);
  const stable = r.every((z) => z[0] < 0);
  const zeta = Math.min(...r.map((z) => -z[0] / Math.hypot(z[0], z[1])));
  // bandwidth: highest frequency up to which |q/q_d| stays within +-3 dB of its DC value,
  // so a resonant overshoot does not count as tracking
  let bw: number | null = null;
  let peak = { g: 1, f: 0 };
  if (stable) {
    const g0 = Math.hypot(...cdiv(peval(num, [0, 0]), peval(ch, [0, 0])));
    for (let k = 0; k <= 400; k++) {
      const w = 10 ** (-1 + (4.5 * k) / 400);
      const g = Math.hypot(...cdiv(peval(num, [0, w]), peval(ch, [0, w]))) / g0;
      if (g > peak.g) peak = { g, f: w / (2 * Math.PI) };
      if (bw === null && (g < Math.SQRT1_2 || g > Math.SQRT2)) bw = w / (2 * Math.PI);
    }
  }
  return { r, stable, zeta, bw, peak };
}

function track(N: number, Kp: number, Kd: number, sea: boolean, Ks: number, f: number) {
  const { ch, num } = model(N, Kp, Kd, sea, Ks);
  const g = cdiv(peval(num, [0, 2 * Math.PI * f]), peval(ch, [0, 2 * Math.PI * f]));
  let lag = (-Math.atan2(g[1], g[0]) * 180) / Math.PI;
  if (lag < 0) lag += 360;
  return { ratio: Math.hypot(g[0], g[1]), lag };
}

type Live = {
  t: number;
  q: number;
  qd: number;
  th: number;
  thd: number;
  buf: number[];
  hist: { t: number; q: number; th: number; ref: number }[];
  hitAt: number | null;
};
const SIM_DT = 5e-5;
const N_DELAY = Math.round(DELAY / SIM_DT);
const newLive = (): Live => ({ t: 0, q: 0, qd: 0, th: 0, thd: 0, buf: new Array(N_DELAY).fill(0), hist: [], hitAt: null });

// advance the live simulation by `span` seconds with the current parameters
function step(L: Live, span: number, N: number, Kp: number, Kd: number, sea: boolean, Ks: number, f: number) {
  const Ir = N * N * JM;
  const Bs = 2 * 0.1 * Math.sqrt((Ks * JL * Ir) / (JL + Ir));
  const A = (AMP * Math.PI) / 180;
  const w = 2 * Math.PI * f;
  const n = Math.round(span / SIM_DT);
  for (let k = 0; k < n; k++) {
    const ref = A * Math.sin(w * L.t);
    // PD on the motor angle (= joint angle if rigid)
    const cmd = sea ? Kp * (ref - L.th) - Kd * L.thd : Kp * (ref - L.q) - Kd * L.qd;
    L.buf.push(cmd);
    const tau = L.buf.shift()!;
    if (!sea) {
      L.qd += (SIM_DT * (tau + MGL * Math.sin(L.q) - B * L.qd)) / (JL + Ir);
      L.q += SIM_DT * L.qd;
      L.th = L.q;
      L.thd = L.qd;
    } else {
      const ts = Ks * (L.th - L.q) + Bs * (L.thd - L.qd);
      L.thd += (SIM_DT * (tau - ts - B * L.thd)) / Ir;
      L.th += SIM_DT * L.thd;
      L.qd += (SIM_DT * (ts + MGL * Math.sin(L.q))) / JL;
      L.q += SIM_DT * L.qd;
    }
    L.t += SIM_DT;
    if (Math.abs(L.q) > Math.PI / 2) {
      // the link hits the ground at +-90 deg and bounces back
      const sgn = Math.sign(L.q);
      L.q = sgn * (Math.PI / 2);
      if (L.qd * sgn > 0) L.qd = -0.3 * L.qd;
      if (!sea) {
        L.th = L.q;
        L.thd = L.qd;
      }
      L.hitAt = L.t;
    }
    if (!Number.isFinite(L.q) || !Number.isFinite(L.th) || Math.abs(L.th) > 50) {
      Object.assign(L, newLive(), { t: L.t, hist: L.hist });
      return;
    }
    if (k % 40 === 0) L.hist.push({ t: L.t, q: L.q, th: L.th, ref });
  }
  while (L.hist.length && L.hist[0].t < L.t - SIM_T) L.hist.shift();
}

const logSlider = (v: number, lo: number, hi: number) => (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo));
const fromLog = (u: number, lo: number, hi: number) => 10 ** (Math.log10(lo) + u * (Math.log10(hi) - Math.log10(lo)));
const KP_LO = 3;
const KP_HI = 2000;
const KS_LO = 30;
const KS_HI = 10000;

// Demo text is English on every page; `lang` is accepted for compatibility with existing posts.
export default function PendulumSwingDemo(_props: { lang?: Lang }) {
  const t = text.en;
  const [sea, setSea] = useState(false);
  const [N, setN] = useState(50);
  const [kpU, setKpU] = useState(logSlider(60, KP_LO, KP_HI));
  const [kd, setKd] = useState(1.5);
  const [ksU, setKsU] = useState(logSlider(300, KS_LO, KS_HI));
  const [fU, setFU] = useState(logSlider(1, F_LO, F_HI));
  const f = fromLog(fU, F_LO, F_HI);
  const [playing, setPlaying] = useState(true);
  const [, setTick] = useState(0);
  const raf = useRef(0);
  const live = useRef<Live>(newLive());
  const Kp = fromLog(kpU, KP_LO, KP_HI);
  const Ks = fromLog(ksU, KS_LO, KS_HI);

  const now = useMemo(() => analyse(N, Kp, kd, sea, Ks), [N, Kp, kd, sea, Ks]);
  const sweep = useMemo(() => {
    const pts: { kp: number; a: ReturnType<typeof analyse> }[] = [];
    for (let i = 0; i <= 70; i++) {
      const kp = fromLog(i / 70, KP_LO, KP_HI);
      pts.push({ kp, a: analyse(N, kp, kd, sea, Ks) });
    }
    const st = pts.filter((p) => p.a.stable);
    const best = st.filter((p) => p.a.zeta >= ZMIN && p.a.bw).sort((a, b) => b.a.bw! - a.a.bw!)[0];
    // refine the stability edges between grid points by bisection
    const isStable = (kp: number) => analyse(N, kp, kd, sea, Ks).stable;
    const edge = (inside: number, outside: number) => {
      for (let it = 0; it < 30; it++) {
        const m = Math.sqrt(inside * outside);
        if (isStable(m)) inside = m;
        else outside = m;
      }
      return inside;
    };
    const iLo = pts.findIndex((p) => p.a.stable);
    const iHi = pts.length - 1 - [...pts].reverse().findIndex((p) => p.a.stable);
    const lo = iLo < 0 ? undefined : iLo === 0 ? pts[0].kp : edge(pts[iLo].kp, pts[iLo - 1].kp);
    const hi = iLo < 0 ? undefined : iHi === pts.length - 1 ? pts[iHi].kp : edge(pts[iHi].kp, pts[iHi + 1].kp);
    return { pts, lo, hi, best };
  }, [N, kd, sea, Ks]);
  const params = useRef({ N, Kp, kd, sea, Ks, f });
  params.current = { N, Kp, kd, sea, Ks, f };
  const tr = useMemo(() => track(N, Kp, kd, sea, Ks, f), [N, Kp, kd, sea, Ks, f]);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) setPlaying(false);
  }, []);
  useEffect(() => {
    if (!playing) return;
    let last: number | undefined;
    const tick = (ts: number) => {
      const span = last === undefined ? 0 : Math.min(0.05, (ts - last) / 1000);
      last = ts;
      const L = live.current;
      const P = params.current;
      step(L, span, P.N, P.Kp, P.kd, P.sea, P.Ks, P.f);
      setTick((v) => v + 1);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]);

  const L = live.current;
  const frame = { q: L.q, th: L.th, ref: ((AMP * Math.PI) / 180) * Math.sin(2 * Math.PI * f * L.t) };
  const hitting = L.hitAt !== null && L.t - L.hitAt < 0.6;
  const banner = !now.stable ? t.diverge : hitting ? t.hit : null;

  // ---- pendulum scene ----
  const PW = 300;
  const PH = 230;
  const piv = [PW / 2, 196];
  const Lpx = 110;
  const tipX = piv[0] + Lpx * Math.sin(frame.q);
  const tipY = piv[1] - Lpx * Math.cos(frame.q);
  const refX = piv[0] + Lpx * Math.sin(frame.ref);
  const refY = piv[1] - Lpx * Math.cos(frame.ref);

  // ---- pole plot ----
  const W = 300;
  const H = 230;
  const RE_LO = -150;
  const RE_HI = 50;
  const IM = 200;
  const PX = (re: number) => 10 + ((re - RE_LO) / (RE_HI - RE_LO)) * (W - 20);
  const PY = (im: number) => H / 2 - (im / IM) * (H / 2 - 12);
  const inView = (z: C) => z[0] >= RE_LO && z[0] <= RE_HI && Math.abs(z[1]) <= IM;
  const offCount = now.r.filter((z) => !inView(z)).length;

  // ---- response plot ----
  const RW = 440;
  const RH = 130;
  const RL = 40;
  const RB = 24;
  const t0 = L.t - SIM_T; // newest sample at the right edge
  const X = (s: number) => RL + ((s - t0) / SIM_T) * (RW - RL - 10);
  const qMax = 90; // deg; the ground is at +-90
  const Yq = (deg: number) => 8 + ((qMax - Math.max(-qMax * 1.05, Math.min(qMax * 1.05, deg))) / (2 * qMax)) * (RH - 8 - RB);

  const fmtHz = (v: number | null | undefined) => (v ? `${v < 10 ? v.toFixed(2) : v.toFixed(1)} Hz` : "–");

  return (
    <section className="signal-demo foc-demo ip-demo" aria-label={t.title}>
      <header className="signal-demo-heading">
        <span className="eyebrow">{t.eyebrow}</span>
        <h3>{t.title}</h3>
      </header>

      <div className="can-bit-select" role="group" aria-label="gearbox">
        <button type="button" aria-pressed={!sea} onClick={() => setSea(false)}>
          {t.rigid}
        </button>
        <button type="button" aria-pressed={sea} onClick={() => setSea(true)}>
          {t.sea}
        </button>
        <button type="button" className="foc-play" onClick={() => setPlaying((v) => !v)}>
          {playing ? t.stop : t.play}
        </button>
      </div>

      <div className="ip-layout">
        <figure className="ip-scene">
          <svg viewBox={`0 0 ${PW} ${PH}`} role="img" aria-label={t.title}>
            <line x1={10} x2={PW - 10} y1={piv[1] + 16} y2={piv[1] + 16} stroke="#9ca3af" strokeWidth={2} />
            <rect x={piv[0] - 22} y={piv[1] + 2} width={44} height={14} rx={3} fill="#d9dcd5" />
            <line x1={piv[0]} y1={piv[1]} x2={refX} y2={refY} stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 4" />
            <circle cx={refX} cy={refY} r={13} fill="none" stroke="#94a3b8" strokeDasharray="3 3" />
            {sea && (
              <line
                x1={piv[0]}
                y1={piv[1]}
                x2={piv[0] + 34 * Math.sin(frame.th)}
                y2={piv[1] - 34 * Math.cos(frame.th)}
                stroke={COLORS.rotor}
                strokeWidth={4}
                strokeLinecap="round"
              />
            )}
            <line x1={piv[0]} y1={piv[1]} x2={tipX} y2={tipY} stroke={COLORS.link} strokeWidth={6} strokeLinecap="round" />
            <circle cx={tipX} cy={tipY} r={13} fill={hitting ? "#dc2626" : COLORS.link} />
            <circle cx={piv[0]} cy={piv[1]} r={9} fill="#fff" stroke={COLORS.link} strokeWidth={3} />
            {banner && (
              <text x={PW / 2} y={18} textAnchor="middle" className="ip-fell">
                {banner}
              </text>
            )}
          </svg>
        </figure>

        <div className="ip-poles">
          <div className="foc-chart-title">{t.poles}</div>
          <svg viewBox={`0 0 ${W} ${H}`} className="foc-chart" role="img" aria-label={t.poles}>
            <rect x={PX(0)} y={0} width={PX(RE_HI) - PX(0)} height={H} fill="#fee2e2" />
            <g className="foc-axes">
              <line x1={PX(RE_LO)} x2={PX(RE_HI)} y1={PY(0)} y2={PY(0)} />
              <line x1={PX(0)} x2={PX(0)} y1={0} y2={H} />
              {[-150, -100, -50, 50].map((v) => (
                <text key={v} x={PX(v)} y={PY(0) + 14} textAnchor="middle">
                  {v}
                </text>
              ))}
              {[-200, -100, 100, 200].map((v) => (
                <text key={v} x={PX(0) + 4} y={PY(v) + 4}>
                  {v}j
                </text>
              ))}
            </g>
            {sweep.pts.flatMap((p, i) =>
              p.a.r
                .filter(inView)
                .map((z, j) => <circle key={`${i}-${j}`} cx={PX(z[0])} cy={PY(z[1])} r={1.6} fill={p.a.stable ? COLORS.locus : COLORS.locusBad} />)
            )}
            {now.r.filter(inView).map((z, i) => (
              <g key={i} stroke={COLORS.pole} strokeWidth={2.4}>
                <line x1={PX(z[0]) - 5} y1={PY(z[1]) - 5} x2={PX(z[0]) + 5} y2={PY(z[1]) + 5} />
                <line x1={PX(z[0]) - 5} y1={PY(z[1]) + 5} x2={PX(z[0]) + 5} y2={PY(z[1]) - 5} />
              </g>
            ))}
            {offCount > 0 && (
              <text x={12} y={H - 8} className="ip-note">
                +{offCount} {t.off}
              </text>
            )}
          </svg>
        </div>
      </div>

      <div className="foc-charts">
        <div className="foc-chart-title">{t.resp}</div>
        <svg viewBox={`0 0 ${RW} ${RH}`} className="foc-chart" role="img" aria-label={t.resp}>
          <g className="foc-axes">
            <line x1={RL} x2={RW - 10} y1={RH - RB} y2={RH - RB} />
            <line x1={RL} x2={RL} y1={8} y2={RH - RB} />
            <line x1={RL} x2={RW - 10} y1={Yq(0)} y2={Yq(0)} stroke="#94a3b8" strokeWidth={0.8} />
            {[-90, -60, -30, 0, 30, 60, 90].map((v) => (
              <text key={v} x={RL - 6} y={Yq(v) + 4} textAnchor="end">
                {v}
              </text>
            ))}
            {[-3, -2, -1, 0].map((v) => (
              <text key={v} x={RL + ((v + SIM_T) / SIM_T) * (RW - RL - 10)} y={RH - RB + 14} textAnchor="middle">
                {v === 0 ? "now" : `${v} s`}
              </text>
            ))}
          </g>
          <polyline
            fill="none"
            stroke="#94a3b8"
            strokeWidth={1.6}
            strokeDasharray="5 4"
            points={L.hist.map((p) => `${X(p.t).toFixed(1)},${Yq((p.ref * 180) / Math.PI).toFixed(1)}`).join(" ")}
          />
          {sea && (
            <polyline
              fill="none"
              stroke={COLORS.rotor}
              strokeWidth={1.4}
              strokeDasharray="4 3"
              points={L.hist.map((p) => `${X(p.t).toFixed(1)},${Yq((p.th * 180) / Math.PI).toFixed(1)}`).join(" ")}
            />
          )}
          <polyline
            fill="none"
            stroke={COLORS.q}
            strokeWidth={2.2}
            points={L.hist.map((p) => `${X(p.t).toFixed(1)},${Yq((p.q * 180) / Math.PI).toFixed(1)}`).join(" ")}
          />
        </svg>
        <div className="foc-x-label">{t.x}</div>
      </div>

      <div className="foc-controls">
        <div className="foc-control">
          <label>
            {t.f} <strong>{f < 1 ? f.toFixed(2) : f.toFixed(1)} Hz</strong>
          </label>
          <input type="range" min={0} max={1} step={0.002} value={fU} onChange={(e) => setFU(+e.target.value)} />
        </div>
        <div className="foc-control">
          <label>
            {t.N} <strong>{N}</strong>
          </label>
          <input type="range" min={1} max={160} step={1} value={N} onChange={(e) => setN(+e.target.value)} />
        </div>
        <div className="foc-control">
          <label>
            <span>
              K<sub>p</sub>
            </span>{" "}
            <strong>{Kp < 100 ? Kp.toFixed(1) : Kp.toFixed(0)} N·m/rad</strong>
          </label>
          <input type="range" min={0} max={1} step={0.002} value={kpU} onChange={(e) => setKpU(+e.target.value)} />
        </div>
        <div className="foc-control">
          <label>
            <span>
              K<sub>d</sub>
            </span>{" "}
            <strong>{kd.toFixed(2)} N·m·s/rad</strong>
          </label>
          <input type="range" min={0} max={10} step={0.05} value={kd} onChange={(e) => setKd(+e.target.value)} />
        </div>
        <div className="foc-control" style={{ opacity: sea ? 1 : 0.4 }}>
          <label>
            {t.ks} <strong>{Ks < 100 ? Ks.toFixed(0) : (Math.round(Ks / 10) * 10).toFixed(0)} N·m/rad</strong>
          </label>
          <input type="range" min={0} max={1} step={0.002} value={ksU} disabled={!sea} onChange={(e) => setKsU(+e.target.value)} />
        </div>
      </div>

      <output className="can-readout ip-readout" aria-live="polite">
        <span>
          {t.gain}
          <strong>{now.stable ? `${(tr.ratio * AMP).toFixed(1)}° (${(tr.ratio * 100).toFixed(0)}%)` : t.unstable}</strong>
        </span>
        <span>
          {t.lag}
          <strong>{now.stable ? `${tr.lag.toFixed(0)}°` : "–"}</strong>
        </span>
        <span>
          {t.bw}
          <strong>{now.stable ? fmtHz(now.bw) : t.unstable}</strong>
        </span>
        <span>
          {t.zeta}
          <strong>{now.zeta.toFixed(2)}</strong>
        </span>
        <span>
          {t.peak}
          <strong>{now.stable ? (now.peak.f ? `×${now.peak.g.toFixed(2)} @ ${fmtHz(now.peak.f)}` : "none") : "–"}</strong>
        </span>
        <span>
          {t.fs}
          <strong>{sea ? (Ks > MGL ? fmtHz(Math.sqrt((Ks - MGL) / JL) / (2 * Math.PI)) : "–") : t.rigidFs}</strong>
        </span>
        <span>
          {t.range}
          <strong>{sweep.lo ? `${sweep.lo.toFixed(1)}–${sweep.hi! >= KP_HI * 0.99 ? `>${KP_HI}` : sweep.hi!.toFixed(0)}` : t.none}</strong>
        </span>
        <span>
          {t.best}
          <strong>{sweep.best ? `${fmtHz(sweep.best.a.bw)} @ ${sweep.best.kp.toFixed(0)}` : t.none}</strong>
        </span>
      </output>
      <p className="demo-model-note">{t.note}</p>
    </section>
  );
}
