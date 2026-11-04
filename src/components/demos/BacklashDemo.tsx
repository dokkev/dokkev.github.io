import { useEffect, useRef, useState, type ReactNode } from "react";

// Backlash between a position-controlled motor and a link through a 1:1 spur gear pair.
//   motor side (output coordinates): q_m(t) = A sin(2 pi f t), slow reversals
//   link: J_L qdd = tau_t - B qd - F_c sign(qd)   (sticks while |tau_t| <= F_c)
//   rigid teeth: while a flank is engaged (z = +-1) the link follows q = q_m - z b and the flank carries
//   tau_t = J_L qdd_m + B qd_m + F_c sign(qd_m); contact opens when tau_t would change sign.
//   Inside the gap (z = 0) the link moves freely; re-engagement is a perfectly inelastic impact.

type Lang = "ko" | "en";
const DEG = Math.PI / 180;
const JL = 0.09; // kg m^2
const BV = 0.05; // N m s / rad link viscous friction
const FC = 0.8; // N m link Coulomb friction (bearings, seals)
const AMP = 30 * DEG;
const WINDOW = 4; // s
const ELL = 0.4; // m, link length
const MAG = 10; // drawing magnification of the backlash and of q_m - q
const NT = 10; // teeth per gear
const EXT = 1.5; // N m, disturbance on the link while the motor holds (vibration, contact)
const EXT_F = 2; // Hz
const DT = 1e-4;
const COLORS = { qm: "#6b7280", q: "#2563eb", tau: "#c2410c", free: "#f59e0b", gearM: "#4b5563", gearL: "#2563eb" };

const text = {
  en: {
    eyebrow: "Interactive example · Direction-locked error",
    title: "Motor and link separate the moment the direction reverses",
    b: "Backlash half-width b",
    f: "Reversal frequency",
    pause: "Pause",
    play: "Play",
    timePlot: "Link tip position error ℓ·δ [mm] · dashed: ±ℓb, orange band: inside the gap",
    loopPlot: "Tooth close-up · red outline: engaged flank",
    gapLbl: "gap",
    charPlot: "Backlash hysteresis · loop width ×25",
    inAx: "input (motor)",
    outAx: "output (link)",
    blLbl: "backlash 2b",
    hold: "Hold motor",
    unhold: "Release hold",
    ext: "disturbance",
    x: "Time [s]",
    lm: "lost motion",
    peak: "Last re-engagement impulse",
    gear: "1:1 spur gears and link · gap and link lag drawn ×10",
    ghost: "without backlash",
    tipErr: "Peak tip error",
    motor: "Motor",
    note:
      "Concept model of a 0.4 m link with 0.09 kg·m² inertia behind a 1:1 spur gear pair, rigid teeth whose re-engagement is a perfectly inelastic impact, and 0.8 N·m of Coulomb friction on the link. The motor follows a 30° position command exactly; there is no gravity. While the motor holds, it stays in place and the link is shaken by a ±1.5 N·m, 2 Hz disturbance, like vibration or contact. The gap and the offset from the dashed link are drawn 10 times larger; the plots are to scale. Not measured data.",
  },
};

interface Sample {
  t: number;
  qm: number;
  q: number;
  tau: number;
  z: number;
}

function rich(str: string) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of str.matchAll(/([A-Za-zτ])_([a-z]+)/g)) {
    out.push(str.slice(last, m.index!), m[1], <sub key={m.index}>{m[2]}</sub>);
    last = m.index! + m[0].length;
  }
  out.push(str.slice(last));
  return out;
}

// Demo text is English on every page; `lang` is accepted for compatibility with existing posts.
export default function BacklashDemo(_props: { lang?: Lang }) {
  const t = text.en;
  const [bDeg, setB] = useState(0.18);
  const [freq, setFreq] = useState(0.5);
  const [playing, setPlaying] = useState(false);
  const [hold, setHold] = useState(false);
  const [, setFrame] = useState(0);
  const sim = useRef({ t: 0, q: -bDeg * DEG, qd: AMP * 2 * Math.PI * freq, z: 1 }); // start engaged on the driving flank
  const hist = useRef<Sample[]>([]);
  const next = useRef(0);
  const impacts = useRef<{ t: number; imp: number }[]>([]);
  const lastImpact = useRef(0);
  const live = useRef({ b: bDeg * DEG, freq, hold });
  live.current = { b: bDeg * DEG, freq, hold };
  const phase = useRef(0);
  const extNow = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) setPlaying(true);
  }, []);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last: number | undefined;
    const tick = (now: number) => {
      const el = last === undefined ? 0 : Math.min(0.05, (now - last) / 1000);
      last = now;
      const { b, freq: f, hold: H0 } = live.current;
      const s = sim.current;
      const steps = Math.round(el / DT);
      for (let k = 0; k < steps; k++) {
        const w = 2 * Math.PI * f;
        s.t += DT;
        if (!H0) phase.current += w * DT;
        const ph = phase.current;
        const qm = AMP * Math.sin(ph);
        const qmd = H0 ? 0 : AMP * w * Math.cos(ph);
        const qmdd = H0 ? 0 : -AMP * w * w * Math.sin(ph);
        const L = H0 ? EXT * Math.sin(2 * Math.PI * EXT_F * s.t) : 0; // disturbance torque on the link
        extNow.current = L;
        let tau = 0;
        if (s.z !== 0) {
          // rigid flank contact: the link moves with the motor, offset by the gap
          s.q = qm - s.z * b;
          s.qd = qmd;
          // torque the flank must transmit; at standstill static friction takes up to F_c of the disturbance
          tau = qmd !== 0 ? JL * qmdd + BV * qmd + FC * Math.sign(qmd) - L : -(L - Math.max(-FC, Math.min(FC, L)));
          if (s.z * tau < 0) {
            s.z = 0; // the flank would have to pull: contact opens
            tau = 0;
          }
        }
        if (s.z === 0) {
          const net = L - BV * s.qd;
          if (Math.abs(s.qd) < 1e-3 && Math.abs(net) <= FC) {
            s.qd = 0; // static friction holds the link
          } else {
            const dir = Math.abs(s.qd) >= 1e-3 ? Math.sign(s.qd) : Math.sign(net);
            const qd0 = s.qd;
            s.qd += ((net - FC * dir) / JL) * DT;
            if (qd0 !== 0 && Math.sign(s.qd) !== Math.sign(qd0)) s.qd = 0; // friction cannot reverse motion
          }
          s.q += s.qd * DT;
          const delta = qm - s.q;
          const closing = qmd + qmdd * DT - s.qd; // relative speed of the motor flank toward the link flank (one step ahead)
          if ((delta >= b && closing > 0) || (delta <= -b && closing < 0)) {
            // re-engagement: perfectly inelastic impact between rigid teeth
            s.z = delta > 0 ? 1 : -1;
            const imp = JL * (qmd - s.qd);
            if (Math.abs(imp) > 1e-4) {
              impacts.current.push({ t: s.t, imp });
              lastImpact.current = Math.abs(imp);
            }
            s.q = qm - s.z * b;
            s.qd = qmd;
          }
        }
        if (s.t >= next.current) {
          hist.current.push({ t: s.t, qm, q: s.q, tau, z: s.z });
          next.current = s.t + 0.004;
        }
      }
      const cut = s.t - WINDOW;
      while (hist.current.length > 2 && hist.current[0].t < cut) hist.current.shift();
      while (impacts.current.length && impacts.current[0].t < cut) impacts.current.shift();
      setFrame((v) => v + 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const h = hist.current;
  const s = sim.current;
  const lastS = h[h.length - 1] ?? { t: 0, qm: 0, q: 0, tau: 0, z: 0 };
  const recent = h.filter((x) => x.t > s.t - 2);
  // lost motion: spread of (q_m - q) inside one window, i.e. how far the motor travels before the link follows
  const dmax = recent.reduce((m, x) => Math.max(m, x.qm - x.q), -Infinity);
  const dmin = recent.reduce((m, x) => Math.min(m, x.qm - x.q), Infinity);
  const lost = recent.length ? (dmax - dmin) / DEG : 0;
  const tipMax = recent.reduce((m, x) => Math.max(m, Math.abs(x.qm - x.q)), 0) * ELL * 1000;

  // ---- plots ----
  const W = 440;
  const H = 210;
  const L = 40;
  const B = 24;
  const t1 = Math.max(WINDOW, s.t);
  const t0 = t1 - WINDOW;
  const X = (tt: number) => L + ((tt - t0) / WINDOW) * (W - L - 10);
  const dSpan = Math.max(0.3, (live.current.b / DEG) * 2.2, ...h.map((x) => Math.abs(x.qm - x.q) / DEG)) * 1.1;
  const mmPerDeg = ELL * 1000 * DEG;
  const mSpan = dSpan * mmPerDeg;
  const Ya = (mm: number) => 8 + (1 - (mm + mSpan) / (2 * mSpan)) * (H - 8 - B);
  const poly = (f: (x: Sample) => number, Yf: (v: number) => number, color: string, w: number, dash?: string) => (
    <polyline fill="none" stroke={color} strokeWidth={w} strokeDasharray={dash} points={h.map((x) => `${X(x.t).toFixed(1)},${Yf(f(x)).toFixed(1)}`).join(" ")} />
  );
  const freeBands = h.map((x, i) =>
    x.z === 0 && i > 0 ? <rect key={i} x={X(h[i - 1].t)} width={Math.max(0.6, X(x.t) - X(h[i - 1].t))} y={H - B - 6} height={6} fill={COLORS.free} /> : null
  );
  const xAxis = (Yzero: number) => (
    <g className="foc-axes">
      <line x1={L} x2={W - 10} y1={Yzero} y2={Yzero} />
      <line x1={L} x2={L} y1={6} y2={H - B} />
      {[0, 1, 2, 3, 4].map((k) => (
        <text key={k} x={X(Math.ceil(t0) + k)} y={H - B + 14} textAnchor="middle">
          {Math.ceil(t0) + k}
        </text>
      ))}
    </g>
  );
  // loop plot (square)
  // tooth close-up at a fixed scale: motor tooth moves inside the slot of the link gear
  const LW = 220;
  const LH = 200;
  const PXD = 100; // px per degree of relative angle (fixed, so the gap width follows b)
  const bPx = (live.current.b / DEG) * PXD;
  const cx = LW / 2;
  const toothX = cx + Math.max(-bPx, Math.min(bPx, ((lastS.qm - lastS.q) / DEG) * PXD));
  const zNow = lastS.z;

  // input-output hysteresis loop on fixed axes (gap magnified by MAG like the drawing)
  const CW = 230;
  const CH = 230;
  const AS = 36; // deg axis half-range
  const CX = (deg: number) => 14 + ((deg + AS) / (2 * AS)) * (CW - 28);
  const CY = (deg: number) => 14 + (1 - (deg + AS) / (2 * AS)) * (CH - 28);
  const A = AMP / DEG;
  const MAGL = 25; // loop width magnification
  const mb = (MAGL * live.current.b) / DEG;
  const outDraw = (x: Sample) => (x.qm - MAGL * (x.qm - x.q)) / DEG;
  const loopPts = [
    [-A, -A + mb],
    [-A + 2 * mb, -A + mb],
    [A, A - mb],
    [A - 2 * mb, A - mb],
  ]
    .map(([x, y]) => `${CX(x).toFixed(1)},${CY(y).toFixed(1)}`)
    .join(" ");
  const trail = h.filter((x) => x.t > s.t - 2.5);

  // ---- 1:1 spur gear pair + link (gap and lag magnified by MAG) ----
  const z = lastS.z;
  const pitch = (2 * Math.PI) / NT;
  const gapDraw = Math.min(pitch / 2 - 0.14, MAG * live.current.b);
  const half = (pitch / 2 - gapDraw) / 2; // tooth half-width (angle at the pitch circle)
  const RG = 46;
  const G1: [number, number] = [118, 112];
  const G2: [number, number] = [118 + 2 * RG + 2, 112];
  const thM = lastS.qm; // motor gear angle
  const qDraw = lastS.qm - MAG * (lastS.qm - lastS.q); // link angle drawn with magnified lag
  const gearPath = (c: [number, number], th: number, offset: number) => {
    let d = "";
    for (let i = 0; i < NT; i++) {
      const a = th + offset + i * pitch;
      const pts: [number, number][] = [
        [a - half - 0.04, RG - 9],
        [a - half + 0.04, RG + 9],
        [a + half - 0.04, RG + 9],
        [a + half + 0.04, RG - 9],
      ];
      d += pts.map(([ang, r], k) => `${k ? "L" : "M"}${(c[0] + r * Math.cos(ang)).toFixed(1)} ${(c[1] - r * Math.sin(ang)).toFixed(1)}`).join(" ") + "Z ";
    }
    return d;
  };
  const LINK = 150;
  const linkEnd = (ang: number): [number, number] => [G2[0] + LINK * Math.cos(-ang), G2[1] - LINK * Math.sin(-ang)];
  const tipReal = linkEnd(qDraw);
  const tipGhost = linkEnd(lastS.qm);
  return (
    <section className="signal-demo foc-demo backlash-demo" aria-label={t.title}>
      <header className="signal-demo-heading">
        <span className="eyebrow">{t.eyebrow}</span>
        <h3>{t.title}</h3>
      </header>

      <div className="backlash-top backlash-top-single">
        <figure className="backlash-gear">
          <svg viewBox="0 0 420 230" role="img" aria-label={t.gear}>
            <rect x={14} y={78} width={58} height={68} rx={6} fill="#d9dcd5" stroke="#9ca3a0" />
            <text x={43} y={164} textAnchor="middle" className="hammer-label" style={{ fill: "#374151" }}>
              {t.motor}
            </text>
            <line x1={72} x2={G1[0]} y1={G1[1]} y2={G1[1]} stroke="#9ca3a0" strokeWidth={6} />
            {/* ideal (rigid) link */}
            <line x1={G2[0]} y1={G2[1]} x2={tipGhost[0]} y2={tipGhost[1]} stroke={COLORS.qm} strokeWidth={8} strokeOpacity={0.25} strokeLinecap="round" strokeDasharray="2 10" />
            <circle cx={tipGhost[0]} cy={tipGhost[1]} r={5} fill="none" stroke={COLORS.qm} strokeDasharray="2 2" />
            {/* gears: link gear turns the opposite way */}
            <path d={gearPath(G1, thM, 0)} fill={COLORS.gearM} />
            <circle cx={G1[0]} cy={G1[1]} r={RG - 9} fill={COLORS.gearM} />
            <circle cx={G1[0]} cy={G1[1]} r={6} fill="#fff" />
            <path d={gearPath(G2, Math.PI - qDraw, pitch / 2)} fill="#8fb0ee" />
            <circle cx={G2[0]} cy={G2[1]} r={RG - 9} fill="#8fb0ee" />
            {/* link fixed to the output gear */}
            <line x1={G2[0]} y1={G2[1]} x2={tipReal[0]} y2={tipReal[1]} stroke={COLORS.gearL} strokeWidth={9} strokeLinecap="round" />
            <circle cx={G2[0]} cy={G2[1]} r={6} fill="#fff" />
            <circle cx={tipReal[0]} cy={tipReal[1]} r={6} fill={COLORS.gearL} />
            <line x1={tipGhost[0]} y1={tipGhost[1]} x2={tipReal[0]} y2={tipReal[1]} stroke="#dc2626" strokeWidth={2} />
            {hold && Math.abs(extNow.current) > 0.05 && (() => {
              const len = 34 * (extNow.current / EXT);
              const ex = tipReal[0] - Math.sin(qDraw) * len;
              const ey = tipReal[1] + Math.cos(qDraw) * len;
              const ang = Math.atan2(ey - tipReal[1], ex - tipReal[0]);
              return (
                <g stroke="#db2777" fill="#db2777">
                  <line x1={tipReal[0]} y1={tipReal[1]} x2={ex} y2={ey} strokeWidth={3} />
                  <path d={`M${ex} ${ey} L${ex - 8 * Math.cos(ang - 0.45)} ${ey - 8 * Math.sin(ang - 0.45)} L${ex - 8 * Math.cos(ang + 0.45)} ${ey - 8 * Math.sin(ang + 0.45)} Z`} strokeWidth={1} />
                  <text x={ex + 6} y={ey + 4} className="hammer-label" stroke="none" style={{ fill: "#db2777" }}>
                    {t.ext}
                  </text>
                </g>
              );
            })()}
            <line x1={300} x2={322} y1={14} y2={14} stroke={COLORS.qm} strokeWidth={6} strokeOpacity={0.35} strokeDasharray="2 5" />
            <text x={328} y={18} className="hammer-label" fill={COLORS.qm}>
              {t.ghost}
            </text>
            <text x={210} y={224} textAnchor="middle" className="hammer-label" style={{ fill: "#374151" }}>
              {t.gear}
            </text>
          </svg>
        </figure>
      </div>

      <div className="backlash-plots">
        <div>
          <div className="foc-chart-title">{rich(t.timePlot)}</div>
          <svg viewBox={`0 0 ${W} ${H}`} className="foc-chart" role="img" aria-label={t.timePlot}>
            {xAxis(Ya(0))}
            {[-1, 1].map((sgn) => (
              <g key={sgn}>
                <line x1={L} x2={W - 10} y1={Ya((sgn * live.current.b * ELL * 1000))} y2={Ya(sgn * live.current.b * ELL * 1000)} stroke={COLORS.qm} strokeDasharray="4 3" />
                <text x={L - 6} y={Ya(sgn * live.current.b * ELL * 1000) + 4} textAnchor="end">
                  {(sgn * live.current.b * ELL * 1000).toFixed(1)}
                </text>
              </g>
            ))}
            {freeBands}
            {poly((x) => (x.qm - x.q) * ELL * 1000, Ya, COLORS.q, 2)}
          </svg>
          <div className="foc-x-label">{t.x}</div>
        </div>
        <div>
          <div className="foc-chart-title">{rich(t.loopPlot)}</div>
          <svg viewBox={`0 0 ${LW} ${LH}`} className="foc-chart" role="img" aria-label={t.loopPlot}>
            {/* link gear: rim and two teeth forming the slot */}
            <rect x={6} y={128} width={LW - 12} height={40} rx={4} fill="#8fb0ee" />
            <rect x={cx - bPx - 18 - 40} y={70} width={40} height={62} rx={4} fill="#8fb0ee" stroke={zNow === -1 ? "#dc2626" : "none"} strokeWidth={3} />
            <rect x={cx + bPx + 18} y={70} width={40} height={62} rx={4} fill="#8fb0ee" stroke={zNow === 1 ? "#dc2626" : "none"} strokeWidth={3} />
            {/* motor tooth */}
            <rect x={toothX - 18} y={36} width={36} height={86} rx={4} fill={COLORS.gearM} />
            {/* gap dimension */}
            <g className="foc-axes">
              <line x1={cx - bPx} x2={cx - bPx} y1={20} y2={30} />
              <line x1={cx + bPx} x2={cx + bPx} y1={20} y2={30} />
              <line x1={cx - bPx} x2={cx + bPx} y1={25} y2={25} />
              <text x={cx} y={16} textAnchor="middle">
                {t.gapLbl} 2b = {((2 * live.current.b) / DEG).toFixed(2)}°
              </text>
            </g>
            <text x={cx} y={188} textAnchor="middle" className="ri-axis-note">
              δ = {((lastS.qm - lastS.q) / DEG).toFixed(2)}°
            </text>
          </svg>
          <div className="foc-chart-title">{rich(t.charPlot)}</div>
          <svg viewBox={`0 0 ${CW} ${CH}`} className="foc-chart" role="img" aria-label={t.charPlot}>
            <g className="foc-axes">
              <line x1={CX(-AS)} x2={CX(AS)} y1={CY(0)} y2={CY(0)} />
              <line x1={CX(0)} x2={CX(0)} y1={CY(AS)} y2={CY(-AS)} />
              <text x={CX(AS)} y={CY(0) + 14} textAnchor="end">{t.inAx}</text>
              <text x={CX(0) + 5} y={CY(AS) + 8} textAnchor="start">{t.outAx}</text>
            </g>
            <polygon points={loopPts} fill="none" stroke={COLORS.qm} strokeOpacity={0.6} strokeWidth={1.4} strokeDasharray="4 3" />
            {/* backlash width on the input axis */}
            <g stroke="#111827" fill="#111827">
              <line x1={CX(-mb)} x2={CX(mb)} y1={CY(0)} y2={CY(0)} strokeWidth={2.2} />
              <path d={`M${CX(-mb)} ${CY(0)} l5 -3.5 v7 Z M${CX(mb)} ${CY(0)} l-5 -3.5 v7 Z`} strokeWidth={0.5} />
            </g>
            <text x={CX(-mb) - 4} y={CY(0) - 8} textAnchor="end" className="ri-axis-note">
              {t.blLbl}
            </text>
            <polyline fill="none" stroke={COLORS.tau} strokeWidth={2} points={trail.map((x) => `${CX(x.qm / DEG).toFixed(1)},${CY(outDraw(x)).toFixed(1)}`).join(" ")} />
            <circle cx={CX(lastS.qm / DEG)} cy={CY(outDraw(lastS))} r={4.5} fill={COLORS.tau} stroke="#fff" strokeWidth={1.2} />
          </svg>
        </div>
      </div>

      <div className="foc-controls">
        <div className="foc-control">
          <label>
            {t.b} <strong>{bDeg.toFixed(2)}°</strong>
          </label>
          <input type="range" min={0} max={0.5} step={0.01} value={bDeg} onChange={(e) => setB(+e.target.value)} />
        </div>
        <div className="foc-control">
          <label>
            {t.f} <strong>{freq.toFixed(1)} Hz</strong>
          </label>
          <input type="range" min={0.1} max={2} step={0.1} value={freq} onChange={(e) => setFreq(+e.target.value)} />
        </div>
        <div className="foc-control can-bit-select">
          <button type="button" onClick={() => setPlaying((v) => !v)}>
            {playing ? t.pause : t.play}
          </button>
          <button type="button" aria-pressed={hold} onClick={() => setHold((v) => !v)}>
            {hold ? t.unhold : t.hold}
          </button>
        </div>
      </div>

      <output className="can-readout" aria-live="polite">
        <span>
          {t.lm}
          <strong>{lost.toFixed(2)}°</strong>
        </span>
        <span>
          {t.tipErr}
          <strong>{tipMax.toFixed(2)} mm</strong>
        </span>
        <span>
          {t.peak}
          <strong>{(lastImpact.current * 1000).toFixed(1)} mN·m·s</strong>
        </span>
      </output>
      <p className="demo-model-note">{t.note}</p>
    </section>
  );
}
