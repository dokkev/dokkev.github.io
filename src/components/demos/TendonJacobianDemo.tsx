import { useEffect, useId, useRef, useState } from "react";
import { creepStep, deg, frame, type Vec } from "./tendonCyclicModel";

const copy = {
  en: {
    eyebrow: "Interactive example · 2 DoF cyclic force control",
    title: "Creep changes the geometry used for force control",
    peak: "Target force during hold",
    frequency: "Cycle frequency",
    rate: "Creep rate (illustrative)",
    bend: "Contact posture q₂",
    estimated: "Control with Encoder + Elastic Model",
    measured: "Control with measured joint pose",
    start: "Start",
    stop: "Pause",
    reset: "Reset creep and cycles",
    approach: "Flexing toward grip",
    load: "Loading",
    hold: "Holding target force",
    unload: "Unloading",
    retract: "Extending away from grip",
    actualPose: "Ground Truth",
    encoderPose: "Motor Encoder Only",
    estimatedPose: "Motor Encoder + Elastic Elongation Model",
    grip: "Elastic grip · x and y",
    tendons: "Grounded motors · M₁ → P₁, M₂ → I₂ → P₂",
    target: "Target",
    actualForce: "Actual",
    forceView: "Force vectors · actual tip",
    error: "Force vector error",
    direction: "Direction error",
    cycles: "Cycles",
    creep: "Accumulated creep",
    plot: "Force vector error [N] vs time · amber: error, shaded: target-force hold",
    limit: "Illustration limit reached; reset to run again.",
    note: "Quasi-static teaching model: 50/35 mm links, coupled tendon coordinates with 10 mm moment arms, and tendon stiffness 10 N/mm. Motor travel is x₁ = r q₁ + δe₁ + δc₁ and x₂ = r(q₁ + q₂) + δe₂ + δc₂, with δe = (T − 10 N)/k. Define A = [[r, 0], [r, r]]. Encoder Only uses A⁻¹x; Encoder + Elastic Elongation Model uses A⁻¹(x − δe) and retains the creep bias. The latter supplies the default controller pose. During contact a releasable elastic grip transmits both x and y force with stiffness 6000 N/m per axis; it releases after unloading. This models a captured fingertip. Equilibrium solves J(q)ᵀ K(p(q) − p_contact) = J(q_used)ᵀ F_target. Both motors are grounded. M₁ drives P₁ directly, without an idler. M₂ passes around a freely rotating idler I₂ coaxial with joint 1, then follows the proximal link to P₂. Tendon 2 therefore acts on both joints. Pretension is 10 N and balanced; τ = Aᵀ(T − T₀). Only pulling is allowed: ΔT = max(0, A⁻ᵀ τ_des). Pulley sizes and motor positions are schematic. Free motion follows a prescribed approach/retraction path to isolate the contact force-control error. Creep is a nonrecovering, time-compressed effective length drift proportional to squared load, with different rates per joint; these are not material measurements. Friction, gravity, inertia and direct force feedback are omitted. The run pauses at 3 mm creep or a failed equilibrium solve.",
    source: "Jacobian-transpose force control",
  },
  ko: {
    eyebrow: "인터랙티브 예시 · 2 DoF 반복 힘 제어",
    title: "Creep이 힘 제어에 사용하는 기하 구조를 바꾼다",
    peak: "유지 구간 목표 힘",
    frequency: "반복 주파수",
    rate: "Creep 속도 (예시용)",
    bend: "접촉 자세 q₂",
    estimated: "Encoder + Elastic Model로 제어",
    measured: "관절 측정 자세로 제어",
    start: "시작",
    stop: "정지",
    reset: "Creep과 주기 초기화",
    approach: "굴곡 · 그립에 접근",
    load: "힘 증가",
    hold: "목표 힘 유지",
    unload: "힘 감소",
    retract: "신전 · 그립에서 이탈",
    actualPose: "Ground Truth",
    encoderPose: "Motor Encoder Only",
    estimatedPose: "Motor Encoder + Elastic Elongation Model",
    grip: "탄성 그립 · x, y 방향",
    tendons: "고정 모터 · M₁ → P₁, M₂ → I₂ → P₂",
    target: "목표",
    actualForce: "실제",
    forceView: "실제 끝점의 힘 벡터",
    error: "힘 벡터 오차",
    direction: "방향 오차",
    cycles: "주기",
    creep: "누적 creep",
    plot: "힘 벡터 오차 [N] – 시간 · 주황: 오차, 음영: 목표 힘 유지 구간",
    limit: "예시 범위에 도달했습니다. 초기화하면 다시 실행됩니다.",
    note: "교육용 준정적 모델입니다. 링크 길이 50/35 mm, 두 tendon의 결합된 좌표와 모멘트 암 10 mm를 가정합니다. Tendon 강성은 10 N/mm이며 x₁ = r q₁ + δe₁ + δc₁, x₂ = r(q₁ + q₂) + δe₂ + δc₂, δe = (T − 10 N)/k입니다. A = [[r, 0], [r, r]]라 두면 Encoder Only는 A⁻¹x, 탄성 신장 보정 모델은 A⁻¹(x − δe)로 자세를 추정합니다. 보정 후에도 creep에 따른 오차는 남으며 기본 제어기는 이 보정 자세를 사용합니다. 접촉 중에는 끝점을 잡는 탄성 그립이 x, y 두 방향으로 힘을 전달하며 강성은 축마다 6000 N/m입니다. 제하 후 그립이 풀립니다. J(q)ᵀ K(p(q) − p_contact) = J(q_used)ᵀ F_target의 평형을 풉니다. 모터는 둘 다 고정됩니다. M₁은 idler 없이 P₁을 직접 구동하고, M₂는 관절 1과 동축인 자유 회전 idler I₂를 지나 첫 번째 링크를 따라 P₂로 이어집니다. 따라서 tendon 2는 두 관절에 모두 토크를 줍니다. Pretension 10 N은 평형을 이루고 τ = Aᵀ(T − T₀)입니다. 굴곡 tendon만 당기도록 ΔT = max(0, A⁻ᵀ τ_des)로 제한합니다. 풀리 크기와 모터 위치는 개략도입니다. 자유 운동은 접촉 중 힘 제어 오차를 분리해 보기 위해 정해진 접근·복귀 경로를 따릅니다. Creep은 부하 제곱에 비례하고 회복하지 않는 시간 압축 모델이며 관절별 속도가 다릅니다. 실제 소재 측정값이 아닙니다. 마찰, 중력, 관성과 직접 힘 피드백은 생략했습니다. Creep 3 mm 또는 평형 계산 실패 시 정지합니다.",
    source: "Jacobian 전치 기반 힘 제어",
  },
};
type Sample = { t: number; error: number; hold: boolean };
const initial = () => ({ t: 0, cycles: 0, dc: [0, 0], limited: false });

export default function TendonJacobianDemo({ lang = "en" }: { lang?: "ko" | "en" }) {
  const t = copy[lang],
    id = useId();
  const [peak, setPeak] = useState(5),
    [frequency, setFrequency] = useState(0.2);
  const [rate, setRate] = useState(0.7),
    [bend, setBend] = useState(40);
  const [measured, setMeasured] = useState(false),
    [playing, setPlaying] = useState(true);
  const [sim, setSim] = useState(initial),
    [history, setHistory] = useState<Sample[]>([]);
  const state = useRef(initial());
  const params = useRef({ peak, frequency, rate, bend, measured });
  params.current = { peak, frequency, rate, bend, measured };
  const reset = () => {
    state.current = initial();
    setSim(initial());
    setHistory([]);
  };
  useEffect(() => {
    if (!playing) return;
    let raf = 0,
      last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const p = params.current,
        s = state.current;
      for (let i = 0; i < 5; i++) {
        s.t += dt / 5;
        s.cycles += (p.frequency * dt) / 5;
        const f = frame(s.cycles, s.dc, p.peak, p.measured, p.bend);
        if (!f.converged) {
          s.limited = true;
          break;
        }
        s.dc = creepStep(s.dc, f.tau, dt / 5, p.rate, f.contact);
        if (Math.max(...s.dc) >= 3) {
          s.limited = true;
          break;
        }
      }
      const f = frame(s.cycles, s.dc, p.peak, p.measured, p.bend);
      setSim({ ...s, dc: [...s.dc] });
      setHistory((h) =>
        [
          ...h.filter((v) => v.t >= s.t - 30),
          { t: s.t, error: Math.hypot(f.force.x - f.target.x, f.force.y - f.target.y), hold: f.stage === "hold" },
        ].filter((_, i, a) => a.length <= 1000 || i % 2 === 0)
      );
      if (s.limited) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  const f = frame(sim.cycles, sim.dc, peak, measured, bend);
  const error = Math.hypot(f.force.x - f.target.x, f.force.y - f.target.y);
  const direction =
    f.target.y > 0.05 && Math.hypot(f.force.x, f.force.y) > 0.05 ? Math.abs(deg(Math.atan2(f.force.x, f.force.y))).toFixed(1) + "°" : "—";
  const pos = (p: Vec) => ({ x: 55 + p.x * 3000, y: 105 + p.y * 3000 });
  const aj = pos(f.actual.joint),
    at = pos(f.actual.tip),
    encJoint = pos(f.encoder.joint),
    encTip = pos(f.encoder.tip),
    ej = pos(f.estimated.joint),
    et = pos(f.estimated.tip),
    anchor = pos(f.anchor);
  const scale = Math.min(14, 100 / Math.max(peak, Math.hypot(f.force.x, f.force.y)));
  // Both motors are grounded. M1 drives P1 directly; M2 passes around a free
  // coaxial idler at joint 1 and continues along the proximal link to P2.
  const baseJoint = { x: 55, y: 105 };
  const arc = (origin: Vec, from: number, to: number, radius: number) =>
    Array.from({ length: 13 }, (_, i) => {
      const angle = from + ((to - from) * i) / 12;
      return `L${origin.x + radius * Math.cos(angle)} ${origin.y + radius * Math.sin(angle)}`;
    }).join(" ");
  const a1 = f.q[0],
    a2 = f.q[0] + f.q[1];
  const motors = [
    { x: 20, y: 170 },
    { x: 20, y: 225 },
  ];
  const idler2 = baseJoint;
  const joints = [baseJoint, aj],
    radii = [20, 14];
  const tangent = (a: Vec, ra: number, b: Vec, rb: number) => {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      length = Math.hypot(dx, dy);
    const c = (ra - rb) / length,
      s = Math.sqrt(1 - c * c);
    const n = { x: (dx / length) * c - (dy / length) * s, y: (dy / length) * c + (dx / length) * s };
    return { a: { x: a.x + ra * n.x, y: a.y + ra * n.y }, b: { x: b.x + rb * n.x, y: b.y + rb * n.y }, angle: Math.atan2(n.y, n.x) };
  };
  const wrap = (origin: Vec, from: number, to: number, radius: number) => {
    while (to > from) to -= 2 * Math.PI;
    return arc(origin, from, to, radius);
  };
  const tendons = motors.map((motor, i) => {
    const angle = (i ? a2 : a1) - Math.PI;
    const end = { x: joints[i].x + radii[i] * Math.cos(angle), y: joints[i].y + radii[i] * Math.sin(angle) };
    if (!i) {
      const direct = tangent(motor, 10, baseJoint, radii[0]);
      return { end, path: `M${direct.a.x} ${direct.a.y} L${direct.b.x} ${direct.b.y} ${wrap(baseJoint, direct.angle, angle, radii[0])}` };
    }
    const first = tangent(motor, 10, idler2, 14),
      second = tangent(idler2, 14, aj, radii[1]);
    return {
      end,
      path: `M${first.a.x} ${first.a.y} L${first.b.x} ${first.b.y} ${wrap(idler2, first.angle, second.angle, 14)} L${second.b.x} ${second.b.y} ${wrap(aj, second.angle, angle, radii[1])}`,
    };
  });
  const tendonColors = ["#dc2626", "#2563eb"];
  const start = Math.max(0, sim.t - 30),
    span = Math.max(10, Math.min(30, sim.t));
  const ymax = Math.max(1, Math.ceil(Math.max(...history.map((v) => v.error), error) * 1.2));
  const px = (v: number) => 40 + ((v - start) / span) * 585,
    py = (v: number) => 150 - (v / ymax) * 135;
  const slider = (key: string, label: string, value: number, min: number, max: number, step: number, unit: string, set: (v: number) => void) => (
    <div>
      <label htmlFor={`${id}-${key}`}>
        {label}{" "}
        <strong>
          {value.toFixed(step < 1 ? 2 : 0)} {unit}
        </strong>
      </label>
      <input id={`${id}-${key}`} type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} />
    </div>
  );
  return (
    <section className="signal-demo cable-demo" aria-label={t.title}>
      <header className="signal-demo-heading">
        <span className="eyebrow">{t.eyebrow}</span>
        <h3>{t.title}</h3>
      </header>
      <div className="dyno-params">
        <div className="cable-controls">
          {slider("peak", t.peak, peak, 2, 7, 0.5, "N", setPeak)}
          {slider("frequency", t.frequency, frequency, 0.1, 3, 0.05, "Hz", setFrequency)}
          {slider("rate", t.rate, rate, 0, 1, 0.05, "", setRate)}
          {slider("bend", t.bend, bend, 35, 65, 1, "°", setBend)}
        </div>
      </div>
      <div className="cable-demo-buttons" role="group" aria-label={lang === "ko" ? "제어 자세 선택" : "Controller pose source"}>
        <button type="button" className="signal-reset" aria-pressed={!measured} disabled={!measured} onClick={() => setMeasured(false)}>
          {t.estimated}
        </button>
        <button type="button" className="signal-reset" aria-pressed={measured} disabled={measured} onClick={() => setMeasured(true)}>
          {t.measured}
        </button>
      </div>
      <svg
        className="cable-demo-svg"
        viewBox="0 0 640 420"
        role="img"
        aria-label={`${t.actualPose}, ${t.encoderPose}, ${t.estimatedPose}, ${t.tendons}, ${t.forceView}`}
      >
        <defs>
          {["#15803d", "#d97706"].map((color, i) => (
            <marker key={color} id={`${id}-f${i}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0 0 L8 4 L0 8 Z" fill={color} />
            </marker>
          ))}
        </defs>
        <line x1="355" x2="355" y1="10" y2="410" stroke="var(--line, #ddd)" />
        {[
          ["#7c3aed", t.actualPose, undefined],
          ["#94a3b8", t.encoderPose, "8 5"],
          ["#d97706", t.estimatedPose, "8 3 2 3"],
        ].map(([color, label, dash], i) => (
          <g key={label}>
            <line x1="25" x2="44" y1={22 + i * 20} y2={22 + i * 20} stroke={color} strokeWidth="3" strokeDasharray={dash} />
            <text x="51" y={26 + i * 20} className="cable-demo-view">
              {label}
            </text>
          </g>
        ))}
        <rect
          x={anchor.x - 35}
          y={anchor.y - 18}
          width="70"
          height="65"
          rx="7"
          stroke="#15803d"
          fill="#15803d"
          fillOpacity={f.contact ? 0.13 : 0.04}
          strokeDasharray={f.contact ? undefined : "5 4"}
        />
        {f.contact &&
          [0, 1].map((axis) => {
            const base = axis ? { x: at.x, y: anchor.y + 45 } : { x: anchor.x + 33, y: at.y };
            const dx = base.x - at.x,
              dy = base.y - at.y,
              length = Math.hypot(dx, dy) || 1;
            const points = Array.from({ length: 9 }, (_, i) => {
              const s = i / 8,
                z = i === 0 || i === 8 ? 0 : i % 2 ? 4 : -4;
              return `${at.x + dx * s - (dy / length) * z},${at.y + dy * s + (dx / length) * z}`;
            }).join(" ");
            return <polyline key={axis} points={points} fill="none" stroke="#15803d" strokeWidth="2" />;
          })}
        <path
          d={`M55 105 L${encJoint.x} ${encJoint.y} L${encTip.x} ${encTip.y}`}
          stroke="#94a3b8"
          strokeWidth="5"
          strokeDasharray="8 5"
          fill="none"
        />
        <path d={`M55 105 L${ej.x} ${ej.y} L${et.x} ${et.y}`} stroke="#d97706" strokeWidth="4" strokeDasharray="8 3 2 3" fill="none" />
        <circle cx={encTip.x} cy={encTip.y} r="4" fill="#94a3b8" />
        <circle cx={et.x} cy={et.y} r="4" fill="#d97706" />
        <path d={`M55 105 L${aj.x} ${aj.y} L${at.x} ${at.y}`} stroke="#7c3aed" strokeWidth="9" strokeLinecap="round" fill="none" />
        <circle cx={at.x} cy={at.y} r="5" fill="#7c3aed" />
        {tendons.map(({ path, end }, i) => {
          const motor = motors[i],
            joint = joints[i];
          const angle = f.motorTravel[i] / 10;
          return (
            <g key={i}>
              <circle cx={joint.x} cy={joint.y} r={radii[i]} fill="var(--surface, #fff)" stroke={tendonColors[i]} strokeWidth="1.5" />
              <circle cx={joint.x} cy={joint.y} r={radii[i] - 4} fill="none" stroke={tendonColors[i]} opacity="0.3" />
              <line x1={joint.x} y1={joint.y} x2={end.x} y2={end.y} stroke={tendonColors[i]} strokeWidth="1.5" />
              <circle cx={joint.x} cy={joint.y} r="3" fill="#202725" />
              <text x={joint.x} y={joint.y - radii[i] - 7} textAnchor="middle" className="cable-demo-view">
                P{i ? "₂" : "₁"}
              </text>
              {i === 1 && (
                <g>
                  <circle cx={idler2.x} cy={idler2.y} r="14" fill="none" stroke="#2563eb" strokeWidth="1.5" />
                  <circle cx={idler2.x} cy={idler2.y} r="10" fill="none" stroke="#2563eb" opacity="0.3" />
                  <text x={idler2.x + 25} y={idler2.y + 6} className="cable-demo-view">
                    I₂
                  </text>
                </g>
              )}
              <path
                d={path}
                fill="none"
                stroke={tendonColors[i]}
                strokeWidth={2 + Math.min(1.5, (f.tension[i] - 10) * 0.04)}
                strokeLinecap="round"
                opacity={f.contact ? 1 : 0.6}
              />
              <circle cx={end.x} cy={end.y} r="3" fill={tendonColors[i]} />
              <circle cx={motor.x} cy={motor.y} r="10" fill="var(--surface, #fff)" stroke={tendonColors[i]} strokeWidth="2" />
              <line x1={motor.x - 12} y1={motor.y + 13} x2={motor.x + 12} y2={motor.y + 13} stroke="#6b7280" strokeWidth="2" />
              {[-8, 0, 8].map((x) => (
                <line key={x} x1={motor.x + x} y1={motor.y + 13} x2={motor.x + x - 4} y2={motor.y + 18} stroke="#6b7280" strokeWidth="1" />
              ))}
              <line
                x1={motor.x}
                y1={motor.y}
                x2={motor.x + 7 * Math.cos(angle)}
                y2={motor.y + 7 * Math.sin(angle)}
                stroke={tendonColors[i]}
                strokeWidth="2"
              />
              <text x={motor.x} y={motor.y + 25} textAnchor="middle" className="cable-demo-view">
                M{i ? "₂" : "₁"}
              </text>
              <line x1={25 + i * 160} x2={43 + i * 160} y1="355" y2="355" stroke={tendonColors[i]} strokeWidth="3" />
              <text x={49 + i * 160} y="359" className="cable-demo-view">
                T{i ? "₂" : "₁"} = {f.tension[i].toFixed(1)} N
              </text>
            </g>
          );
        })}
        <text x="25" y="332" className="cable-demo-view">
          {t.tendons}
        </text>
        <text x="25" y="390" className="cable-demo-view">
          {t.grip}
        </text>
        <text x="25" y="413" className="cable-demo-view">
          {t[f.stage]}
        </text>
        <text x="495" y="25" textAnchor="middle" className="cable-demo-view">
          {t.forceView}
        </text>
        <line x1="390" y1="150" x2="610" y2="150" stroke="var(--line, #ddd)" />
        <line x1="500" y1="55" x2="500" y2="265" stroke="var(--line, #ddd)" />
        <line
          x1="500"
          y1="150"
          x2="500"
          y2={150 + f.target.y * scale}
          stroke="#15803d"
          strokeWidth="3"
          strokeDasharray="6 4"
          markerEnd={f.target.y > 0.01 ? `url(#${id}-f0)` : undefined}
        />
        <line
          x1="500"
          y1="150"
          x2={500 + f.force.x * scale}
          y2={150 + f.force.y * scale}
          stroke="#d97706"
          strokeWidth="3"
          markerEnd={Math.hypot(f.force.x, f.force.y) > 0.01 ? `url(#${id}-f1)` : undefined}
        />
        <circle cx="500" cy="150" r="4" fill="#202725" />
        <text x="375" y="285" className="cable-demo-view">
          {t.target}: (0, {f.target.y.toFixed(2)}) N
        </text>
        <text x="375" y="307" className="cable-demo-view">
          {t.actualForce}: ({f.force.x.toFixed(2)}, {f.force.y.toFixed(2)}) N
        </text>
        <text x="375" y="330" className="cable-demo-view">
          τ₁ = {f.tau[0].toFixed(3)} N·m
        </text>
        <text x="375" y="350" className="cable-demo-view">
          τ₂ = {f.tau[1].toFixed(3)} N·m
        </text>
      </svg>
      <p className="demo-help">
        <code>τ_des = J({measured ? "q" : "q̂"})ᵀ F_target · ΔT = max(0, A⁻ᵀ τ_des)</code>
        <br />
        <code>J(q)ᵀ F_actual = τ_cmd · F_actual = K Δp</code>
      </p>
      <figure className="dyno-fig">
        <svg className="dyno-plot dyno-plot-wide" viewBox="0 0 640 180" role="img" aria-label={t.plot}>
          {history.map((v, i) =>
            v.hold && i > 0 ? (
              <rect
                key={i}
                x={px(history[i - 1].t)}
                y="15"
                width={Math.max(0, px(v.t) - px(history[i - 1].t))}
                height="135"
                fill="#15803d"
                opacity="0.08"
              />
            ) : null
          )}
          {[0, 0.5, 1].map((v) => (
            <g key={v}>
              <line x1="40" x2="625" y1={py(v * ymax)} y2={py(v * ymax)} stroke="var(--line, #ddd)" />
              <text x="32" y={py(v * ymax) + 4} textAnchor="end">
                {(v * ymax).toFixed(1)}
              </text>
            </g>
          ))}
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <text key={v} x={px(start + v * span)} y="170" textAnchor="middle">
              {(start + v * span).toFixed(0)}s
            </text>
          ))}
          <polyline points={history.map((v) => `${px(v.t)},${py(v.error)}`).join(" ")} fill="none" stroke="#d97706" strokeWidth="2" />
        </svg>
        <figcaption>{t.plot}</figcaption>
      </figure>
      <output className="can-readout" aria-live="off">
        <span>
          {t.cycles} <strong>{Math.floor(sim.cycles)}</strong>
        </span>
        <span>
          {t.creep} <strong>{sim.dc.map((v) => v.toFixed(2)).join(" / ")} mm</strong>
        </span>
        <span>
          {t.error} <strong>{error.toFixed(2)} N</strong>
        </span>
        <span>
          {t.direction} <strong>{direction}</strong>
        </span>
      </output>
      <div className="cable-demo-buttons">
        <button type="button" className="signal-reset" disabled={sim.limited} onClick={() => setPlaying(!playing)}>
          {playing ? t.stop : t.start}
        </button>
        <button
          type="button"
          className="signal-reset"
          onClick={() => {
            reset();
            setPlaying(true);
          }}
        >
          {t.reset}
        </button>
      </div>
      {sim.limited && (
        <p className="demo-help" role="status">
          {t.limit}
        </p>
      )}
      <details className="demo-model-details">
        <summary>{lang === "ko" ? "구현 세부 사항" : "Implementation details"}</summary>
        <p className="demo-model-note">
          {t.note} <a href="https://modernrobotics.northwestern.edu/nu-gm-book-resource/11-5-force-control/">{t.source}</a>.
        </p>
      </details>
    </section>
  );
}
