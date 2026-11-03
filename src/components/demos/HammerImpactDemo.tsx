import { useEffect, useRef, useState } from "react";
import data from "../../lib/demos/data/hammer-impact.json";

// Playback of a MuJoCo 1-DoF hammer (scripts/hardware/hammer_impact.py): the same head speed
// hits a free stone, for several gear ratios. Rigid gearbox: rotor inertia is armature N^2 J_m.
// Compliant gearbox: rotor and link are two inertias joined by the gear stiffness K_s.
// After the hit the stone slides on ice with friction ice_mu (analytic).

type Lang = "ko" | "en";
type Result = (typeof data.results)[number];
type Gear = "rigid" | "compliant";
const sets: Record<Gear, Result[]> = { rigid: data.results as Result[], compliant: data.compliant as Result[] };
const ALL = [...sets.rigid, ...sets.compliant];
const meta = data.meta;
const DECEL = meta.ice_mu * 9.81;
const COLORS = { sel: "#c2410c", other: "#cbd5e1", gear: "#7c3aed", hit: "#202725", ice: "#e0f2fe", stone: "#475569" };

const text = {
  ko: {
    eyebrow: "직접 조작 · MuJoCo 시뮬레이션",
    title: `같은 속도로 ${meta.stone_mass_kg} kg 스톤을 친 해머, 감속비만 다를 때`,
    gear: "감속기 모델",
    rigid: "강체 감속기",
    compliant: "비틀림 강성 K_s = 1×10⁴ N·m/rad",
    ratio: "감속비",
    replay: "다시 재생",
    force: "접촉력 [N] · 선택한 감속비를 진하게",
    torque: "관절의 충격 토크 F·r(점선)과 감속기 치면이 전달하는 토크(실선) [N·m]",
    x: "충돌 후 시간 [ms]",
    ice: `빙판 위 스톤이 미끄러진 거리 [m] · μ = ${meta.ice_mu} 가정, 회색 선은 다른 감속비`,
    I: "관절 관성 J_L + N²J_m",
    m: "머리 기준 유효 질량",
    J: "충격량 ∫F dt",
    F: "최대 충돌력",
    T: "접촉 시간",
    Gt: "감속기 치면 토크 최대",
    hits: "충돌 횟수",
    v: "스톤 속도",
    d: "미끄러진 거리",
    note: `MuJoCo ${meta.mujoco}로 계산한 1자유도 해머입니다. 팔 ${meta.arm_m} m, 머리 ${meta.head_mass_kg} kg(링크 관성 약 0.09 kg·m²), 로터 관성 J_m = 1×10⁻⁵ kg·m²을 armature N²J_m으로 넣었고, 모든 경우에 머리 속도 ${meta.tip_speed_mps} m/s로 정지한 ${meta.stone_mass_kg} kg 스톤을 칩니다. 접촉 강성은 감속비와 상관없이 ${(meta.contact_stiffness_N_per_m / 1000).toFixed(0)} kN/m가 되도록 MuJoCo solref를 접촉의 유효 질량으로 맞췄습니다. 스톤은 충돌 중에는 마찰 없이 움직이고, 충돌 뒤의 미끄럼 거리는 마찰계수 ${meta.ice_mu}로 계산했습니다. 강체 감속기에서는 로터 관성을 armature N²J_m으로 넣었고, 비틀림 강성 모델에서는 로터를 별도 관성으로 두고 링크와 관절 기준 강성 K_s = 1×10⁴ N·m/rad(감쇠비 ${meta.gear_damping_ratio})로 연결했습니다. 백래시는 넣지 않았습니다.`,
  },
  en: {
    eyebrow: "Try it · MuJoCo simulation",
    title: `Same hammer swing into a ${meta.stone_mass_kg} kg stone, different gear ratios`,
    gear: "Gearbox model",
    rigid: "Rigid gearbox",
    compliant: "Torsional stiffness K_s = 1×10⁴ N·m/rad",
    ratio: "Gear ratio",
    replay: "Replay",
    force: "Contact force [N] · selected ratio in bold",
    torque: "Joint impact torque F·r (dashed) and the torque through the gear teeth (solid) [N·m]",
    x: "Time after impact [ms]",
    ice: `Stone slide distance on ice [m] · μ = ${meta.ice_mu} assumed, gray lines are the other ratios`,
    I: "Joint inertia J_L + N²J_m",
    m: "Effective mass at the head",
    J: "Impulse ∫F dt",
    F: "Peak contact force",
    T: "Contact time",
    Gt: "Peak gear-tooth torque",
    hits: "Hits",
    v: "Stone speed",
    d: "Slide distance",
    note: `1-DoF hammer simulated with MuJoCo ${meta.mujoco}. Arm ${meta.arm_m} m, head ${meta.head_mass_kg} kg (link inertia ≈ 0.09 kg·m²), rotor inertia J_m = 1×10⁻⁵ kg·m² added as armature N²J_m; every case hits a resting ${meta.stone_mass_kg} kg stone at ${meta.tip_speed_mps} m/s. MuJoCo solref is scaled by the effective contact mass so the contact stiffness is ${(meta.contact_stiffness_N_per_m / 1000).toFixed(0)} kN/m for every ratio. The stone moves without friction during the hit; its slide distance afterwards uses a friction coefficient of ${meta.ice_mu}. The rigid gearbox adds rotor inertia as armature N²J_m; the compliant model keeps the rotor as a separate inertia tied to the link by a joint-side stiffness K_s = 1×10⁴ N·m/rad (damping ratio ${meta.gear_damping_ratio}). Backlash is not modeled.`,
  },
};

// playback runs at real time throughout (no slow motion at impact)
const START_ANGLE = 0.9; // rad at the start of the swing
const W_HIT = meta.tip_speed_mps / meta.arm_m; // rad/s at impact
const APPROACH_S = START_ANGLE / W_HIT; // swing toward the target
const T_MS = data.results[0].series.t_ms;
const IMPACT_S = (T_MS[T_MS.length - 1] - T_MS[0]) / 1000; // recorded window
const REBOUND_S = 0.25; // hammer motion shown after the window
const ICE_M = Math.ceil(Math.max(...ALL.map((x) => x.slide_m)) * 2) / 2; // ice strip length [m]
const ICE_TICKS = Array.from({ length: Math.round(ICE_M / 0.5) + 1 }, (_, i) => i * 0.5);

const niceTicks = (max: number) => {
  const raw = max / 3;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * p).find((v) => v >= raw) ?? raw;
  return Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
};

export default function HammerImpactDemo({ lang = "ko" }: { lang?: Lang }) {
  const t = text[lang];
  const [gear, setGear] = useState<Gear>("rigid");
  const [idx, setIdx] = useState(5); // N = 160
  const results = sets[gear];
  const [elapsed, setElapsed] = useState(Infinity); // s since playback start
  const [run, setRun] = useState(0);
  const raf = useRef(0);
  const r = results[idx];
  const s = r.series;
  const slideS = r.stone_speed / DECEL;
  const total = APPROACH_S + IMPACT_S + Math.max(REBOUND_S, slideS);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setElapsed(Infinity);
      return;
    }
    let start: number | undefined;
    const tick = (now: number) => {
      start ??= now;
      const e = (now - start) / 1000;
      setElapsed(e);
      if (e < total) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [idx, run, total, gear]);

  // map playback time to hammer angle, impact-window index and stone travel
  const pt = Math.min(elapsed, total);
  const n = s.t_ms.length;
  const q0 = s.q[0];
  const qEnd = s.q[n - 1];
  const xEnd = s.x[n - 1];
  let angle: number;
  let k = -1;
  let stoneX = 0; // m
  if (pt < APPROACH_S) {
    angle = START_ANGLE + (q0 - START_ANGLE) * (pt / APPROACH_S);
  } else if (pt < APPROACH_S + IMPACT_S) {
    k = Math.min(n - 1, Math.floor(((pt - APPROACH_S) / IMPACT_S) * n));
    angle = s.q[k];
    stoneX = s.x[k];
  } else {
    const after = pt - APPROACH_S - IMPACT_S;
    const swing = qEnd + Math.min(after, REBOUND_S) * (r.rebound_tip_speed / meta.arm_m);
    angle = Math.max(-START_ANGLE, Math.min(START_ANGLE, swing)); // keep the head in frame
    const ts = Math.min(after, slideS);
    stoneX = xEnd + r.stone_speed * ts - 0.5 * DECEL * ts * ts;
  }

  // ---- top view: pivot above, the head moves to the right at impact ----
  const P = [150, 26];
  const Lpx = 165;
  const PXM = Lpx / meta.arm_m;
  const hx = P[0] - Lpx * Math.sin(angle);
  const hy = P[1] + Lpx * Math.cos(angle);
  const HR = 13;
  const contactX = P[0] + HR; // target surface at q = 0
  const SR = 21;
  const sx = contactX + SR + stoneX * PXM;
  const sy = P[1] + Lpx;

  // ---- plots ----
  const W = 440;
  const H = 170;
  const L = 48;
  const B = 26;
  const tMin = s.t_ms[0];
  const tMax = s.t_ms[n - 1];
  const X = (ms: number) => L + ((ms - tMin) / (tMax - tMin)) * (W - L - 10);
  const fMax = Math.max(...ALL.map((x) => x.peak_force)) * 1.08;
  const Yf = (v: number) => 10 + (1 - v / fMax) * (H - 10 - B);
  const tauMax = Math.max(...ALL.map((x) => x.peak_force * meta.arm_m)) * 1.08;
  const tauMin = Math.min(0, ...ALL.map((x) => Math.min(...x.series.gear_torque))) * 1.1;
  const Yt = (v: number) => 10 + ((tauMax - v) / (tauMax - tauMin)) * (H - 10 - B);
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

  // ---- ice strip ----
  const IW = 640;
  const IH = 64;
  const IL = 16;
  const IX = (m: number) => IL + (Math.min(m, ICE_M) / ICE_M) * (IW - IL - 16);
  const iceY = 26;

  const fmt = (v: number, d = 1) => v.toFixed(d);
  const hitting = k >= 0 && s.force[k] > 5;

  return (
    <section className="signal-demo foc-demo hammer-demo" aria-label={t.title}>
      <header className="signal-demo-heading">
        <span className="eyebrow">{t.eyebrow}</span>
        <h3>{t.title}</h3>
      </header>

      <div className="can-bit-select" role="group" aria-label={t.gear}>
        {(["rigid", "compliant"] as Gear[]).map((g) => (
          <button key={g} type="button" aria-pressed={g === gear} onClick={() => setGear(g)}>
            {t[g]}
          </button>
        ))}
      </div>
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
            <rect x={0} y={sy - 26} width={300} height={52} fill={COLORS.ice} />
            <circle cx={sx} cy={sy} r={SR} fill={COLORS.stone} stroke="#1e293b" strokeWidth={1.5} />
            <rect x={sx - 8} y={sy - 3} width={16} height={6} rx={3} fill="#e2e8f0" />
            {/* hammer */}
            <line x1={P[0]} y1={P[1]} x2={hx} y2={hy} stroke="#4b5563" strokeWidth={6} strokeLinecap="round" />
            <circle cx={hx} cy={hy} r={HR} fill={hitting ? COLORS.sel : "#374151"} />
            <circle cx={P[0]} cy={P[1]} r={14} fill="#e5e7eb" stroke="#6b7280" strokeWidth={2} />
            <circle cx={P[0]} cy={P[1]} r={5 + 7 * Math.min(1, Math.sqrt(r.armature / 0.256))} fill={COLORS.gear} fillOpacity={0.75} />
            <text x={P[0] + 22} y={P[1] + 4} className="hammer-label">
              N²J_m
            </text>
          </svg>
        </figure>

        <div className="foc-charts">
          <div className="foc-chart-title">{t.force}</div>
          <svg viewBox={`0 0 ${W} ${H}`} className="foc-chart" role="img" aria-label={t.force}>
            {xAxis}
            {niceTicks(fMax).map((v) => (
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
            <line x1={L} x2={W - 10} y1={Yt(0)} y2={Yt(0)} stroke="#94a3b8" strokeWidth={0.8} />
            {niceTicks(tauMax).map((v) => (
              <text key={v} x={L - 6} y={Yt(v) + 4} textAnchor="end" className="foc-axes-text">
                {v}
              </text>
            ))}
            {line(s.t_ms, s.force.map((f) => f * meta.arm_m), Yt, COLORS.sel, 1.6, "5 4")}
            {line(s.t_ms, s.gear_torque, Yt, COLORS.gear, 2.4)}
            {cursor}
          </svg>
          <div className="foc-x-label">{t.x}</div>
        </div>
      </div>

      <div className="hammer-ice">
          <div className="foc-chart-title">{t.ice}</div>
          <svg viewBox={`0 0 ${IW} ${IH}`} className="foc-chart" role="img" aria-label={t.ice}>
            <rect x={IL} y={iceY - 12} width={IW - IL - 16} height={24} fill={COLORS.ice} />
            {results.map((x, i) =>
              i === idx ? null : <line key={x.N} x1={IX(x.slide_m)} x2={IX(x.slide_m)} y1={iceY - 12} y2={iceY + 12} stroke="#94a3b8" strokeWidth={1.5} />,
            )}
            <line x1={IX(r.slide_m)} x2={IX(r.slide_m)} y1={iceY - 14} y2={iceY + 14} stroke={COLORS.sel} strokeWidth={1.5} strokeDasharray="3 3" />
            <circle cx={IX(stoneX)} cy={iceY} r={8} fill={COLORS.stone} stroke="#1e293b" strokeWidth={1} />
            <g className="foc-axes">
              {ICE_TICKS.map((m) => (
                <text key={m} x={IX(m)} y={IH - 6} textAnchor="middle">
                  {m}
                </text>
              ))}
            </g>
          </svg>
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
          {t.v}
          <strong>{fmt(r.stone_speed, 2)} m/s</strong>
        </span>
        <span>
          {t.d}
          <strong>{fmt(r.slide_m, 2)} m</strong>
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
          {t.Gt}
          <strong>{fmt(r.peak_gear_torque, 0)} N·m</strong>
        </span>
        <span>
          {t.hits}
          <strong>{r.hits}</strong>
        </span>
      </output>
      <p className="demo-model-note">{t.note}</p>
    </section>
  );
}
