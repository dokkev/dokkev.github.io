import { useEffect, useRef, useState } from "react";
import data from "../../lib/demos/data/hammer-impact.json";

// Playback of a MuJoCo 1-DoF hammer (scripts/hardware/hammer_impact.py): the same head speed
// hits a spring-mounted wall for several gear ratios. Rotor inertia enters as armature N^2 J_m.

type Lang = "ko" | "en";
type Result = (typeof data.results)[number];
const results = data.results as Result[];
const meta = data.meta;
const COLORS = { sel: "#c2410c", other: "#cbd5e1", gear: "#7c3aed", hit: "#202725" };

const text = {
  ko: {
    eyebrow: "직접 조작 · MuJoCo 시뮬레이션",
    title: "같은 속도로 휘두른 해머, 감속비만 다를 때",
    ratio: "감속비",
    replay: "다시 재생",
    force: "벽이 받는 접촉력 [N] · 선택한 감속비를 진하게",
    torque: "관절의 충격 토크 F·r(점선)과 그중 로터를 멈추는 몫(N²J_m × 관절 감속도) [N·m]",
    x: "충돌 후 시간 [ms]",
    I: "관절의 겉보기 관성",
    m: "머리 기준 유효 질량",
    J: "충격량 ∫F dt",
    F: "최대 충돌력",
    T: "접촉 시간",
    G: "감속기 치면 토크 최대",
    slow: "충돌 구간 슬로모션",
    wallScale: "벽 변형 ×20 확대",
    note: `MuJoCo ${meta.mujoco}로 계산한 1자유도 해머입니다. 팔 ${meta.arm_m} m, 머리 ${meta.head_mass_kg} kg(링크 관성 약 0.09 kg·m²), 로터 관성 J_m = 1×10⁻⁵ kg·m²을 armature N²J_m으로 넣었고, 모든 경우에 머리 속도 ${meta.tip_speed_mps} m/s로 강성 ${(meta.wall_stiffness_N_per_m / 1000).toFixed(0)} kN/m인 스프링 벽에 부딪힙니다. 감속기는 강체로 두었으므로 실제로는 감속기 탄성과 백래시가 최대 하중을 바꿉니다.`,
  },
  en: {
    eyebrow: "Try it · MuJoCo simulation",
    title: "Same hammer swing speed, different gear ratios",
    ratio: "Gear ratio",
    replay: "Replay",
    force: "Contact force on the wall [N] · selected ratio in bold",
    torque: "Joint impact torque F·r (dashed) and the share that stops the rotor (N²J_m × joint deceleration) [N·m]",
    x: "Time after impact [ms]",
    I: "Apparent joint inertia",
    m: "Effective mass at the head",
    J: "Impulse ∫F dt",
    F: "Peak contact force",
    T: "Contact time",
    G: "Peak gear-tooth torque",
    slow: "impact in slow motion",
    wallScale: "wall deflection ×20",
    note: `1-DoF hammer simulated with MuJoCo ${meta.mujoco}. Arm ${meta.arm_m} m, head ${meta.head_mass_kg} kg (link inertia ≈ 0.09 kg·m²), rotor inertia J_m = 1×10⁻⁵ kg·m² added as armature N²J_m; every case hits a ${(meta.wall_stiffness_N_per_m / 1000).toFixed(0)} kN/m spring wall at ${meta.tip_speed_mps} m/s. The gearbox is rigid, so gearbox compliance and backlash would change the real peak load.`,
  },
};

const APPROACH_S = 0.7; // playback seconds for the swing toward the wall
const IMPACT_S = 1.6; // playback seconds for the recorded impact window
const REBOUND_S = 0.7;
const START_ANGLE = 0.9; // rad shown at the start of the swing (visual)
const MAG = 20; // magnification of the (mm-scale) impact deflection

export default function HammerImpactDemo({ lang = "ko" }: { lang?: Lang }) {
  const t = text[lang];
  const [idx, setIdx] = useState(4); // N = 100
  const [phase, setPhase] = useState(1); // 0..1 over the whole playback
  const [run, setRun] = useState(0);
  const raf = useRef(0);
  const r = results[idx];
  const s = r.series;
  const total = APPROACH_S + IMPACT_S + REBOUND_S;

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setPhase(APPROACH_S / total + (0.25 * IMPACT_S) / total);
      return;
    }
    let start: number | undefined;
    const tick = (now: number) => {
      start ??= now;
      const p = Math.min(1, (now - start) / 1000 / total);
      setPhase(p);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [idx, run, total]);

  // map playback phase to an angle and to an impact-window time index
  const pt = phase * total;
  const q0 = s.q[0];
  const qEnd = s.q[s.q.length - 1];
  let angle: number;
  let k = -1;
  if (pt < APPROACH_S) {
    angle = START_ANGLE + (q0 * MAG - START_ANGLE) * (pt / APPROACH_S);
  } else if (pt < APPROACH_S + IMPACT_S) {
    k = Math.min(s.t_ms.length - 1, Math.floor(((pt - APPROACH_S) / IMPACT_S) * s.t_ms.length));
    angle = s.q[k] * MAG;
  } else {
    const u = (pt - APPROACH_S - IMPACT_S) / REBOUND_S;
    angle = qEnd * MAG + u * (r.rebound_tip_speed / meta.arm_m) * 0.12;
  }

  // ---- top view of the hammer ----
  const P = [70, 150]; // pivot
  const Lpx = 190;
  const hx = P[0] + Lpx * Math.cos(angle);
  const hy = P[1] - Lpx * Math.sin(angle);
  const wallY = Math.max(P[1] + 13, hy + 13); // the plate rests at the contact point and is pushed by the head

  // ---- plots ----
  const W = 440;
  const H = 170;
  const L = 48;
  const B = 26;
  const tMin = s.t_ms[0];
  const tMax = s.t_ms[s.t_ms.length - 1];
  const X = (ms: number) => L + ((ms - tMin) / (tMax - tMin)) * (W - L - 10);
  const fMax = Math.max(...results.map((x) => x.peak_force)) * 1.08;
  const Yf = (v: number) => 10 + (1 - v / fMax) * (H - 10 - B);
  const tauMax = Math.max(...results.map((x) => x.peak_force * meta.arm_m)) * 1.08;
  const Yt = (v: number) => 10 + (1 - v / tauMax) * (H - 10 - B);
  const line = (xs: number[], ys: number[], Yf2: (v: number) => number, color: string, w: number, dash?: string) => (
    <polyline fill="none" stroke={color} strokeWidth={w} strokeDasharray={dash} points={xs.map((x, i) => `${X(x).toFixed(1)},${Yf2(ys[i]).toFixed(1)}`).join(" ")} />
  );
  const cursor = k >= 0 ? <line x1={X(s.t_ms[k])} x2={X(s.t_ms[k])} y1={8} y2={H - B} stroke={COLORS.hit} strokeOpacity={0.4} /> : null;
  const xAxis = (
    <g className="foc-axes">
      <line x1={L} x2={W - 10} y1={H - B} y2={H - B} />
      <line x1={L} x2={L} y1={8} y2={H - B} />
      {[0, 5, 10, 15, 20].map((v) => (
        <text key={v} x={X(v)} y={H - B + 14} textAnchor="middle">
          {v}
        </text>
      ))}
    </g>
  );

  const fmt = (v: number, d = 1) => v.toFixed(d);

  return (
    <section className="signal-demo foc-demo hammer-demo" aria-label={t.title}>
      <header className="signal-demo-heading">
        <span className="eyebrow">{t.eyebrow}</span>
        <h3>{t.title}</h3>
      </header>

      <div className="can-bit-select" role="group" aria-label={t.ratio}>
        {results.map((x, i) => (
          <button key={x.N} type="button" aria-pressed={i === idx} onClick={() => setIdx(i)}>
            {x.N}:1
          </button>
        ))}
        <button type="button" className="foc-play" onClick={() => setRun((v) => v + 1)}>
          {t.replay}
        </button>
      </div>

      <div className="hammer-layout">
        <figure className="hammer-scene">
          <svg viewBox="0 0 300 220" role="img" aria-label={t.title}>
            {/* spring wall */}
            <g>
              {Array.from({ length: 6 }, (_, i) => (
                <polyline
                  key={i}
                  fill="none"
                  stroke="#9ca3af"
                  strokeWidth={1.4}
                  points={`${200 + i * 14},${wallY + 8} ${207 + i * 14},${(wallY + 8 + 205) / 2} ${200 + i * 14},205`}
                />
              ))}
              <rect x={190} y={wallY} width={90} height={8} rx={2} fill="#6b7280" />
              <rect x={190} y={205} width={90} height={6} fill="#374151" />
            </g>
            {/* hammer */}
            <line x1={P[0]} y1={P[1]} x2={hx} y2={hy} stroke="#4b5563" strokeWidth={6} strokeLinecap="round" />
            <circle cx={hx} cy={hy} r={13} fill={k >= 0 && s.force[k] > 5 ? COLORS.sel : "#374151"} />
            <circle cx={P[0]} cy={P[1]} r={14} fill="#e5e7eb" stroke="#6b7280" strokeWidth={2} />
            <circle cx={P[0]} cy={P[1]} r={5 + 7 * Math.min(1, Math.sqrt(r.armature / 0.256))} fill={COLORS.gear} fillOpacity={0.75} />
            <text x={P[0]} y={P[1] + 32} textAnchor="middle" className="hammer-label">
              N²J_m
            </text>
          </svg>
          <figcaption>
            {k >= 0 ? t.slow : " "} · {t.wallScale}
          </figcaption>
        </figure>

        <div className="foc-charts">
          <div className="foc-chart-title">{t.force}</div>
          <svg viewBox={`0 0 ${W} ${H}`} className="foc-chart" role="img" aria-label={t.force}>
            {xAxis}
            {[0, 500, 1000, 1500].map((v) => (
              <text key={v} x={L - 6} y={Yf(v) + 4} textAnchor="end" className="foc-axes-text">
                {v}
              </text>
            ))}
            {results.map((x, i) => (i === idx ? null : <g key={x.N}>{line(x.series.t_ms, x.series.force, Yf, COLORS.other, 1.4)}</g>))}
            {line(s.t_ms, s.force, Yf, COLORS.sel, 2.6)}
            {cursor}
          </svg>
          <div className="foc-chart-title">{t.torque}</div>
          <svg viewBox={`0 0 ${W} ${H}`} className="foc-chart" role="img" aria-label={t.torque}>
            {xAxis}
            {[0, 200, 400].map((v) => (
              <text key={v} x={L - 6} y={Yt(v) + 4} textAnchor="end" className="foc-axes-text">
                {v}
              </text>
            ))}
            {line(s.t_ms, s.force.map((f) => f * meta.arm_m), Yt, COLORS.sel, 1.6, "5 4")}
            {line(s.t_ms, s.gear_torque.map((g) => Math.max(0, g)), Yt, COLORS.gear, 2.4)}
            {cursor}
          </svg>
          <div className="foc-x-label">{t.x}</div>
        </div>
      </div>

      <output className="can-readout" aria-live="polite">
        <span>
          {t.I}
          <strong>{fmt(r.apparent_inertia, 3)} kg·m²</strong>
        </span>
        <span>
          {t.m}
          <strong>{fmt(r.apparent_inertia / meta.arm_m ** 2, 2)} kg</strong>
        </span>
        <span>
          {t.J}
          <strong>{fmt(r.impulse, 2)} N·s</strong>
        </span>
        <span>
          {t.F}
          <strong>{fmt(r.peak_force, 0)} N</strong>
        </span>
        <span>
          {t.T}
          <strong>{fmt(r.contact_time_ms, 1)} ms</strong>
        </span>
        <span>
          {t.G}
          <strong>{fmt(r.peak_gear_torque, 0)} N·m</strong>
        </span>
      </output>
      <p className="demo-model-note">{t.note}</p>
    </section>
  );
}
