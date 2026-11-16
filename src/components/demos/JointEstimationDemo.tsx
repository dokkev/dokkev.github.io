import { useEffect, useId, useRef, useState } from "react";

// "When Motor Motion Does Not Reveal Joint Motion" — 1-DoF tendon-driven finger under cyclic loading.
// Quasi-static model: x_m = r q + delta_e + delta_c
//   tension: T = T0 + k_f q / r + k_o max(0, q - q_c) / r   (return spring; a spring touched at q_c)
//   elastic stretch: delta_e = (T - T0) / k                  (from the pretensioned state)
//   creep (teaching model): grows only while the finger presses the spring, d(delta_c)/dt = c (T / T_ref)^2,
//   and does not recover.
// Ideal motor torque control: T = tau_m / r_m, with no pulley friction or inertia.
// Each cycle ramps from pretension to the target torque, holds, unloads, then rests.
// q follows load equilibrium; motor travel x_m = r q + delta_e + delta_c follows the tendon length.
// Estimators, both calibrated at rest at t = 0:
//   motor encoder only:                                q_hat = x_m / r
//   motor encoder + elastic stiffness model (k from t = 0):  q_hat = (x_m - (T - T0) / k) / r
// The second removes the elastic stretch, which becomes large in contact, but not the creep.

type Lang = "ko" | "en";
const R = 10; // mm/rad, moment arm
const MOTOR_R = 10; // mm, motor drum radius (drawing radius is independent)
const K = 10; // N/mm, tendon stiffness
const T0 = 10; // N, pretension
const KF_R = 25; // N/rad, k_f / r: free-motion load
const KO_R = 400; // N/rad, k_o / r: object contact stiffness as tendon tension per radian
const QC = (40 * Math.PI) / 180; // rad, contact angle
const T_REF = 60; // N
const COLORS = { body: "#202725", muted: "#6b7280", gt: "#7c3aed", enc: "#94a3b8", el: "#d97706", cable: "#c2410c", obj: "#15803d", grid: "#eef0ee" };

const text = {
  ko: {
    eyebrow: "인터랙티브 예시 · 모터 엔코더로 관절 위치를 추정할 수 있을까?",
    title: "스프링을 누를 때마다 쌓이는 creep이 추정 오차를 키운다",
    torque: "목표 모터 토크 (유지 구간)",
    travel: "모터 이동량",
    tension: "장력",
    ramp: "토크 증가",
    hold: "토크 유지",
    release: "토크 감소",
    rest: "Pretension 유지",
    f: "하중 주기",
    creep: "creep 속도 (예시용)",
    start: "시작",
    stop: "정지",
    reset: "처음으로",
    motor: "모터 (엔코더)",
    gt: "Ground Truth",
    enc: "Motor Encoder Only",
    el: "Motor Encoder + Elastic Stiffness Model",
    plot: "추정 오차 [°] – 시간 · 회색 Motor Encoder Only, 주황 Motor Encoder + Elastic Stiffness Model",
    cycles: "주기",
    creepNow: "누적 creep",
    errEnc: "오차 · Encoder Only",
    errEl: "오차 · Encoder + Elastic Model",
    contact: "접촉",
    spring: "접촉 스프링",
    flexion: "굴곡 (flexion)",
    help: "모터 토크를 올려 손가락으로 스프링을 누르고, 일정 시간 유지한 뒤 내립니다. 토크 유지 중에는 장력과 실제 관절 각도가 일정하지만, creep으로 늘어난 케이블을 감기 위해 모터는 계속 회전합니다. Motor Encoder Only는 탄성 신장과 creep을 모두 관절 운동으로 읽습니다. 장력과 탄성 강성 모델로 탄성 신장을 빼도 creep에 따른 추정 오차는 남아 유지 구간 동안 증가합니다. 목표 토크가 낮아 스프링에 닿지 않으면 이 모델에서는 creep이 쌓이지 않습니다.",
    note: `교육용 준정적 모델입니다. 모터 드럼 반경 ${MOTOR_R} mm, 관절 모멘트 암 ${R} mm/rad, tendon 강성 ${K} N/mm, pretension ${T0} N입니다. 마찰과 관성을 무시한 이상적인 토크 제어로 T = τ_m / r_m을 가정합니다. 매 주기의 20% 동안 pretension 토크에서 목표 토크까지 올리고, 45% 유지한 뒤, 20% 동안 내리고, 나머지 15%는 pretension을 유지합니다. 스프링은 굴곡 방향의 관절 각도 ${Math.round((QC * 180) / Math.PI)}°에서 닿고 그 뒤로 장력을 ${KO_R} N/rad로 올립니다. creep은 스프링을 누르는 동안에만 장력의 제곱에 비례해 쌓이고 회복하지 않는다고 단순화했으며, 보기 쉽도록 시간을 크게 압축했습니다. 실제 소재의 creep 값이 아닙니다.`,
  },
  en: {
    eyebrow: "Interactive example · Can we estimate joint position from a motor encoder?",
    title: "Creep accumulated at every contact grows the estimation error",
    torque: "Target motor torque (hold phase)",
    travel: "Motor travel",
    tension: "Tension",
    ramp: "Ramping torque",
    hold: "Holding torque",
    release: "Unloading torque",
    rest: "Holding pretension",
    f: "Load cycle frequency",
    creep: "Creep rate (illustrative)",
    start: "Start",
    stop: "Stop",
    reset: "Reset",
    motor: "Motor (encoder)",
    gt: "Ground Truth",
    enc: "Motor Encoder Only",
    el: "Motor Encoder + Elastic Stiffness Model",
    plot: "Estimation error [°] vs time · grey Motor Encoder Only, amber Motor Encoder + Elastic Stiffness Model",
    cycles: "Cycles",
    creepNow: "Accumulated creep",
    errEnc: "Error · Encoder Only",
    errEl: "Error · Encoder + Elastic Model",
    contact: "Contact",
    spring: "Contact spring",
    flexion: "Flexion",
    help: "The motor ramps up torque to press the spring, holds it, then unloads. During the hold, tension and the actual joint angle stay constant, but the motor keeps turning to take up cable length added by creep. Motor Encoder Only reads both elastic stretch and creep as joint motion. Correcting elastic stretch with measured tension and a stiffness model still leaves a creep error that grows during the hold. If the target torque is too low to reach the spring, this model adds no creep.",
    note: `Teaching quasi-static model. Motor drum radius ${MOTOR_R} mm, joint moment arm ${R} mm/rad, tendon stiffness ${K} N/mm, pretension ${T0} N. Ideal torque control assumes T = τ_m / r_m, with no friction or inertia. Each cycle ramps from pretension torque to the target over 20% of the cycle, holds for 45%, unloads over 20%, then maintains pretension for 15%. The spring is touched at ${Math.round((QC * 180) / Math.PI)}° in flexion and beyond that raises tension at ${KO_R} N/rad. Creep grows only while pressing the spring, with the square of tension, and does not recover; time is strongly compressed for visibility. These are not measured creep values of any material.`,
  },
};

const deg = (v: number) => (v * 180) / Math.PI;
type Pt = [number, number, number]; // t, err_enc [deg], err_el [deg]

// Joint equilibrium under commanded tension, independent of accumulated tendon creep.
function solveQ(tension: number) {
  const load = Math.max(0, tension - T0);
  if (load <= KF_R * QC) return load / KF_R;
  return (load + KO_R * QC) / (KF_R + KO_R);
}

function torqueProfile(phase: number) {
  if (phase < 0.2) return (1 - Math.cos(Math.PI * phase / 0.2)) / 2;
  if (phase < 0.65) return 1;
  if (phase < 0.85) return (1 + Math.cos(Math.PI * (phase - 0.65) / 0.2)) / 2;
  return 0;
}

export function MotorEncoderDemo({ lang = "en" }: { lang?: Lang }) {
  const t = text[lang];
  const id = useId();
  const [torque, setTorque] = useState(0.7); // N m, total target torque including pretension
  const [f, setF] = useState(0.5); // Hz
  const [creep, setCreep] = useState(0.5); // 0..1
  const [playing, setPlaying] = useState(true);
  const [sim, setSim] = useState({ t: 0, cycles: 0, xm: 0, q: 0, T: T0, dc: 0, qEnc: 0, qEl: 0 });
  const [hist, setHist] = useState<Pt[]>([]);
  const st = useRef({ t: 0, cycles: 0, dc: 0 });
  const P = useRef({ torque, f, creep });
  P.current = { torque, f, creep };

  const reset = () => {
    st.current = { t: 0, cycles: 0, dc: 0 };
    setHist([]);
    setSim({ t: 0, cycles: 0, xm: 0, q: 0, T: T0, dc: 0, qEnc: 0, qEl: 0 });
  };

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const p = P.current;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = st.current;
      const sub = 10;
      let q = 0;
      let T = T0;
      for (let i = 0; i < sub; i++) {
        s.t += dt / sub;
        s.cycles += p.f * dt / sub;
        T = T0 + (p.torque * 1000 / MOTOR_R - T0) * torqueProfile(s.cycles % 1);
        q = solveQ(T);
        if (q > QC) s.dc += (dt / sub) * 0.08 * p.creep * (T / T_REF) ** 2; // mm, time-compressed creep, only in contact
      }
      const xm = R * q + (T - T0) / K + s.dc;
      const qEnc = xm / R;
      const qEl = (xm - (T - T0) / K) / R;
      setSim({ t: s.t, cycles: s.cycles, xm, q, T, dc: s.dc, qEnc, qEl });
      setHist((h) => {
        const out = [...h, [s.t, deg(qEnc - q), deg(qEl - q)] as Pt];
        return out.length > 1500 ? out.filter((_, i) => i % 2 === 0) : out;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // ---------- drawing ----------
  // The tendon runs under the drum and the joint pulley. Reeling it in turns the drum clockwise and pulls the bottom
  // of the joint pulley toward the motor, so the finger also turns clockwise: flexion is downward (palm side), and
  // the spring sits on that side.
  const VW = 640;
  const VH = 290;
  const MC = { x: 130, y: 110 };
  const RM = 34;
  const JC = { x: 430, y: 110 };
  const RJ = 30;
  const LINK = 140;
  const end = (q: number) => ({ x: JC.x + LINK * Math.cos(q), y: JC.y + LINK * Math.sin(q) }); // clockwise on screen
  const pg = end(sim.q);
  const pE = end(sim.qEnc);
  const pL = end(sim.qEl);
  const motorAng = sim.xm / MOTOR_R; // motor rotation from the resulting cable travel, clockwise
  const needle = { x: MC.x + RM * 0.8 * Math.cos(-Math.PI / 2 + motorAng), y: MC.y + RM * 0.8 * Math.sin(-Math.PI / 2 + motorAng) };
  // tendon: elastic section (zigzag grows with delta_e) and creep section (dark band that only grows)
  const de = (sim.T - T0) / K;
  const yC = MC.y + RM; // bottom strand
  const zA = MC.x + 60;
  const zigLen = 50 + de * 9;
  const zB = zA + zigLen;
  const creepWidth = Math.min(sim.dc * 14, JC.x - 40 - zB); // cap schematic width during long runs
  const cB = zB + creepWidth;
  const zig = () => {
    const n = 8;
    const w = zigLen / n;
    const pts = [`M${zA} ${yC}`];
    for (let i = 0; i < n; i++) pts.push(`L${zA + w * (i + 0.5)} ${yC + (i % 2 ? 7 : -7)}`);
    pts.push(`L${zB} ${yC}`);
    return pts.join(" ");
  };
  // The finger compresses a spring along the flexion tangent at q_c.
  // Keep the base fixed and move the contact plate with the palm-side surface of the link.
  const press = Math.max(0, sim.q - QC);
  const radial = { x: Math.cos(QC), y: Math.sin(QC) };
  const normal = { x: -Math.sin(QC), y: Math.cos(QC) };
  const springPoint = (along: number, across = 0) => ({
    x: JC.x + (110 + across) * radial.x + along * normal.x,
    y: JC.y + (110 + across) * radial.y + along * normal.y,
  });
  const headOffset = 5 + 110 * Math.sin(press);
  const springHead = springPoint(headOffset);
  const springBase = springPoint(70);
  const plate = [-22, 22].map((across) => springPoint(headOffset, across));
  const base = [-25, 25].map((across) => springPoint(70, across));
  const springPath = [`M${springHead.x} ${springHead.y}`];
  for (let i = 0; i < 10; i++) {
    const p = springPoint(headOffset + ((70 - headOffset) * (i + 1)) / 11, i % 2 ? 7 : -7);
    springPath.push(`L${p.x} ${p.y}`);
  }
  springPath.push(`L${springBase.x} ${springBase.y}`);
  const inContact = sim.q > QC + 1e-4;

  // ---------- plot ----------
  const PW = 640;
  const PH = 190;
  const m = { l: 40, r: 10, t: 10, b: 28 };
  const tEnd = Math.max(10, sim.t);
  const XT = (v: number) => m.l + (v / tEnd) * (PW - m.l - m.r);
  const eMax = Math.max(10, ...hist.map((h) => Math.max(Math.abs(h[1]), Math.abs(h[2])) * 1.1));
  const yMax = [10, 20, 30, 40, 60, 80, 100].find((v) => v >= eMax) ?? Math.ceil(eMax / 20) * 20;
  const YT = (v: number) => PH - m.b - (v / yMax) * (PH - m.t - m.b);
  const poly = (i: 1 | 2) => hist.map((h) => `${XT(h[0]).toFixed(1)},${YT(Math.max(0, h[i])).toFixed(1)}`).join(" ");
  const step = [2, 5, 10, 20, 25].find((v) => yMax / v <= 5) ?? 50;
  const fmt = (v: number, n = 1) => `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(n)}`;
  const phase = sim.cycles % 1;
  const phaseLabel = phase < 0.2 ? t.ramp : phase < 0.65 ? t.hold : phase < 0.85 ? t.release : t.rest;

  return (
    <section className="signal-demo cable-demo" aria-label={t.title}>
      <header className="signal-demo-heading">
        <span className="eyebrow">{t.eyebrow}</span>
        <h3>{t.title}</h3>
      </header>
      <div className="dyno-params">
        <div className="cable-controls">
          <div>
            <label htmlFor={`${id}-a`}>
              {t.torque} <strong>{torque.toFixed(2)} N·m</strong>
            </label>
            <input id={`${id}-a`} type="range" min="0.15" max="1.1" step="0.05" value={torque} onChange={(e) => setTorque(Number(e.target.value))} />
          </div>
          <div>
            <label htmlFor={`${id}-f`}>
              {t.f} <strong>{f.toFixed(2)} Hz</strong>
            </label>
            <input id={`${id}-f`} type="range" min="0.2" max="2" step="0.05" value={f} onChange={(e) => setF(Number(e.target.value))} />
          </div>
          <div>
            <label htmlFor={`${id}-c`}>
              {t.creep} <strong>{creep.toFixed(2)}</strong>
            </label>
            <input id={`${id}-c`} type="range" min="0" max="1" step="0.05" value={creep} onChange={(e) => setCreep(Number(e.target.value))} />
          </div>
        </div>
      </div>

      <svg className="cable-demo-svg" viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={t.title}>
        {/* motor drum */}
        <circle cx={MC.x} cy={MC.y} r={RM} fill="#d1d5db" stroke={COLORS.body} strokeWidth="2" />
        <line x1={MC.x} y1={MC.y} x2={needle.x} y2={needle.y} stroke={COLORS.body} strokeWidth="2" />
        <circle cx={MC.x} cy={MC.y} r="4" fill={COLORS.body} />
        <text x={MC.x} y={MC.y - RM - 12} textAnchor="middle" className="cable-demo-view">
          {t.motor}
        </text>
        <text x={MC.x} y={MC.y - RM - 30} textAnchor="middle" className="cable-demo-view">
          τ_m = {(sim.T * MOTOR_R / 1000).toFixed(2)} N·m
        </text>
        {/* tendon */}
        <path d={`M${MC.x} ${yC} L${zA} ${yC}`} stroke={COLORS.cable} strokeWidth="3" fill="none" />
        <path d={zig()} stroke={COLORS.cable} strokeWidth="2.4" fill="none" />
        {creepWidth > 0.5 && <line x1={zB} x2={cB} y1={yC} y2={yC} stroke="#7f1d1d" strokeWidth="6" />}
        <path d={`M${cB} ${yC} L${JC.x} ${JC.y + RJ}`} stroke={COLORS.cable} strokeWidth="3" fill="none" />
        <text x={(zA + zB) / 2} y={yC + 24} textAnchor="middle" className="cable-demo-view">
          δ_e = {de.toFixed(1)} mm
        </text>
        {creepWidth > 0.5 && (
          <text x={(zB + cB) / 2} y={yC - 12} textAnchor="middle" className="cable-demo-view">
            δ_c = {sim.dc.toFixed(2)} mm
          </text>
        )}
        {/* spring on the palm side: clockwise flexion compresses it against a fixed base */}
        <g stroke={COLORS.obj} fill="none" strokeWidth="2.5">
          <path d={springPath.join(" ")} />
          <line x1={plate[0].x} y1={plate[0].y} x2={plate[1].x} y2={plate[1].y} strokeWidth={inContact ? 5 : 3} />
          <line x1={base[0].x} y1={base[0].y} x2={base[1].x} y2={base[1].y} strokeWidth="4" />
          {[-20, -10, 0, 10, 20].map((across) => {
            const a = springPoint(72, across);
            const b = springPoint(80, across - 6);
            return <line key={across} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth="1.5" />;
          })}
        </g>
        <text x={springBase.x} y={springBase.y + 36} textAnchor="middle" className="cable-demo-view">{t.spring}</text>
        <defs>
          <marker id={`${id}-flexion`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L8 4 L0 8 Z" fill={COLORS.body} />
          </marker>
        </defs>
        <path d={`M${JC.x + 58} ${JC.y + 10} A59 59 0 0 1 ${JC.x + 30} ${JC.y + 51}`} fill="none" stroke={COLORS.body} strokeWidth="1.5" markerEnd={`url(#${id}-flexion)`} />
        <text x={JC.x - 5} y={JC.y + 79} textAnchor="middle" className="cable-demo-view">{t.flexion}</text>
        {/* finger */}
        <circle cx={JC.x} cy={JC.y} r={RJ} fill="var(--surface, #fff)" stroke={COLORS.body} strokeWidth="2" />
        <line x1={JC.x - 60} x2={JC.x + 180} y1={JC.y} y2={JC.y} stroke={COLORS.grid} strokeWidth="1.5" />
        <line x1={JC.x} y1={JC.y} x2={pE.x} y2={pE.y} stroke={COLORS.enc} strokeWidth="6" strokeLinecap="round" strokeDasharray="8 6" />
        <line x1={JC.x} y1={JC.y} x2={pL.x} y2={pL.y} stroke={COLORS.el} strokeWidth="6" strokeLinecap="round" strokeDasharray="8 6" />
        <line x1={JC.x} y1={JC.y} x2={pg.x} y2={pg.y} stroke={COLORS.gt} strokeWidth="10" strokeLinecap="round" opacity="0.85" />
        <circle cx={JC.x} cy={JC.y} r="5" fill={COLORS.body} />
        {/* legend */}
        {[
          [COLORS.gt, t.gt],
          [COLORS.enc, t.enc],
          [COLORS.el, t.el],
        ].map(([c, l], i) => (
          <g key={i}>
            <line x1={330} x2={354} y1={20 + i * 18} y2={20 + i * 18} stroke={c} strokeWidth="5" strokeDasharray={i ? "6 4" : undefined} />
            <text x={360} y={24 + i * 18} className="cable-demo-view">
              {l}
            </text>
          </g>
        ))}
      </svg>

      <div className="dyno-row">
        <figure className="dyno-fig">
          <svg className="dyno-plot dyno-plot-wide" viewBox={`0 0 ${PW} ${PH}`} role="img" aria-label={t.plot}>
            {Array.from({ length: Math.floor(yMax / step) + 1 }, (_, i) => i).map((i) => (
              <g key={i}>
                <line x1={m.l} x2={PW - m.r} y1={YT(i * step)} y2={YT(i * step)} stroke={COLORS.grid} />
                <text x={m.l - 6} y={YT(i * step) + 4} textAnchor="end">
                  {Math.round(i * step)}
                </text>
              </g>
            ))}
            {[0, 0.25, 0.5, 0.75, 1].map((s) => (
              <text key={s} x={XT(s * tEnd)} y={PH - m.b + 16} textAnchor="middle">
                {(s * tEnd).toFixed(0)}s
              </text>
            ))}
            <polyline points={poly(1)} fill="none" stroke={COLORS.enc} strokeWidth="1.6" />
            <polyline points={poly(2)} fill="none" stroke={COLORS.el} strokeWidth="2" />
          </svg>
          <figcaption>{t.plot}</figcaption>
        </figure>
      </div>
      <output className="can-readout" aria-live="polite">
        <span>
          {t.cycles} <strong>{Math.floor(sim.cycles)}</strong>
        </span>
        <span>{phaseLabel}</span>
        <span>{t.tension} <strong>{sim.T.toFixed(1)} N</strong></span>
        <span>{t.travel} <strong>{sim.xm.toFixed(2)} mm</strong></span>
        <span>
          {t.creepNow} <strong>{sim.dc.toFixed(2)} mm</strong>
        </span>
        <span>
          {t.errEnc} <strong>{fmt(deg(sim.qEnc - sim.q))}°</strong>
        </span>
        <span>
          {t.errEl} <strong>{fmt(deg(sim.qEl - sim.q))}°</strong>
        </span>
      </output>
      <p className="demo-help">{t.help}</p>
      <div className="cable-demo-buttons">
        <button className="signal-reset" type="button" onClick={() => setPlaying((v) => !v)}>
          {playing ? t.stop : t.start}
        </button>
        <button className="signal-reset" type="button" onClick={reset}>
          {t.reset}
        </button>
      </div>
      <p className="demo-model-note">{t.note}</p>
    </section>
  );
}
