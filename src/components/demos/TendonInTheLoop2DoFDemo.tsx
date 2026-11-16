import { useEffect, useId, useRef, useState } from "react";

// Tendon-in-the-Loop, 2-DoF version: one tendon, one robot motor and one finger emulator per joint.
// The user sets a target pose for a virtual 2-DoF finger (joint sliders, or dragging the target fingertip; inverse
// kinematics); a joint PD controller drives the finger toward it, J_i q_i'' = K_p (q_d,i - q_i) - K_d q_i' - tau_i
// (decoupled joint inertias). An object (a stiff disc) can be dragged into it. The rig tests the cables, not the
// finger. The tendons carry the PD torque tau_pd = K_p (q_d - q) - K_d q'.
//   Tendon 1 (joint 1): motor 1 -> half a turn around the joint-1 pulley P1 (radius R1, turns with the rig link)
//                       -> emulator 1.
//   Tendon 2 (joint 2): motor 2 -> upper idler -> joint-1 idler pair (strands enter crossed, both stay wrapped)
//                       -> along the rig link -> P2 at the link tip (radius r) -> back along the link
//                       -> joint-1 idler pair -> lower idler -> emulator 2.
// The rig link follows the virtual q1. Excursions taken in by the motors: e1 = R1 q1, e2 = r (q1 + q2).
// Emulators render the joint torque the tendons must carry as tension (pretension T0 balanced by the return
// springs at q = 0, never below T0):
//   joint 2: r (T2 - T0) = tau_pd2                    -> T_e2 = T0 + tau_pd2 / r
//   joint 1: R1 (T1 - T0) + r (T2 - T0) = tau_pd1    -> T_e1 = T0 + (tau_pd1 - r (T_e2 - T0)) / R1
// The load on joint j is tau_j = k_r q_j + contact torque about joint j (J^T F of the object's contact force).
// Friction: each rig pulley has a bearing friction limit F = tau_c / r + mu (T_a + T_b), mu = (1 - eta)/(1 + eta),
// and sets a tension step of +-F while the cable moves over it, or keeps the last step clamped to [-F, F] at rest.
// Quasi-static: no inertia; cables only pull.

type Lang = "ko" | "en";
type P = { x: number; y: number };

const RF = 10; // mm, tendon-2 moment arm at both joints (= idler and P2 radius)
const R1 = 15; // mm, tendon-1 moment arm at joint 1 (= P1 radius)
const L1 = 50; // mm, virtual proximal link
const L2 = 35; // mm, virtual distal link
const LINK_R = 4; // mm, half thickness of the virtual links (contact)
const OBJ_R = 10; // mm, object radius
const Q1 = [-30, 60]; // deg
const Q2 = [0, 150]; // deg
const WINDOW = 6; // s, tension plot window
const JQ = [2e-4, 5e-5]; // kg m^2, joint inertias of the virtual finger (decoupled)
const DT = 0.0002; // s, finger integration step
const COLORS = { body: "#202725", muted: "#6b7280", spring: "#2563eb", sim: "#7c3aed", obj: "#15803d", tm: "#d62828", te: "#2563eb", t1: "#b91c1c", t2: "#d97706", grid: "#eef0ee" };

const text = {
  ko: {
    eyebrow: "인터랙티브 예시 · Tendon-in-the-Loop (2 DoF)",
    title: "관절마다 tendon 하나씩, 두 tendon을 실제 장치로 시험한다",
    gInit: "초기 파라미터 (고정)",
    kr: "Return spring k_r (두 관절)",
    T0: "Pretension F_0",
    k: "케이블 강성 k_c",
    details: "풀리 세부 설정 (효율, 마찰)",
    eta: "베어링 효율 η",
    tau: "쿨롱 마찰 τ_c",
    gPose: "가상 손가락 목표 자세: 슬라이더나 목표 끝점(점선 원) 드래그",
    q1: "목표 q₁",
    q2: "목표 q₂",
    gPD: "가상 손가락 관절 PD 게인 (두 관절 공통)",
    kp: "K_p",
    kd: "K_d",
    gObj: "물체: 드래그해서 옮깁니다",
    ks: "물체 강성 k_s",
    real: "실제 하드웨어 (시험 대상): 케이블 + idler + 풀리 P1, P2 + 링크",
    virt: "시뮬레이션: 가상 2 DoF 손가락 + 물체",
    m1: "Actuator Motor 1 (위치)",
    m2: "Actuator Motor 2 (위치)",
    e1: "Emulation Motor 1 (힘)",
    e2: "Emulation Motor 2 (힘)",
    plot: "장력 [N] – 시간 (최근 6초) · 빨강 q₁ tendon, 주황 q₂ tendon · 실선 Actuator Motor 측, 점선 Emulation Motor 측",
    elong: "tendon 신장",
    tq1: "q₁ tendon 신장",
    tq2: "q₂ tendon 신장",
    note: `교육용 모델입니다. 가상 손가락은 링크 ${L1} mm, ${L2} mm이고, 관절마다 PD 제어기(K_p, K_d)가 목표 자세를 따라가게 합니다(관절 관성 ${JQ[0]}, ${JQ[1]} kg·m², 두 관절은 서로 독립으로 계산). 점선은 목표 자세, 실선은 실제 자세입니다. tendon은 PD 토크를 전달합니다. tendon 1은 관절 1만 지나며 모멘트 암 R₁ = ${R1} mm, tendon 2는 두 관절을 모두 지나며 모멘트 암 r = ${RF} mm입니다. 시험 장치의 풀리 반지름도 같습니다. 장치 링크는 q₁을 따라 돌고, tendon 2는 관절 1 축의 idler 쌍에 엇갈려 들어가 두 가닥이 모두 감긴 채로 남습니다. Emulation Motor 2는 관절 2의 PD 토크를, Emulation Motor 1은 관절 1의 PD 토크에서 tendon 2가 관절 1에 주는 몫을 뺀 나머지를 장력으로 재현합니다. 두 Emulation Motor 모두 pretension 아래로는 내려가지 않습니다. 각 풀리는 베어링 마찰(쿨롱 τ_c와 효율 η)만 갖고, 케이블이 움직이는 동안 그 방향으로 장력 차이를 만들며 멈추면 마지막 값을 유지합니다. 관성, 동적 마찰, idler 마찰은 넣지 않았습니다.`,
  },
  en: {
    eyebrow: "Interactive example · Tendon-in-the-Loop (2 DoF)",
    title: "One tendon per joint: test both tendons on real hardware",
    gInit: "Initial parameters (fixed)",
    kr: "Return spring k_r (both joints)",
    T0: "Pretension F_0",
    k: "Cable stiffness k_c",
    details: "Pulley details (efficiency, friction)",
    eta: "Bearing efficiency η",
    tau: "Coulomb friction τ_c",
    gPose: "Virtual finger target pose: sliders or drag the target tip (dashed circle)",
    q1: "Target q₁",
    q2: "Target q₂",
    gPD: "Virtual finger joint PD gains (both joints)",
    kp: "K_p",
    kd: "K_d",
    gObj: "Object: drag to move",
    ks: "Object stiffness k_s",
    real: "Real hardware (under test): cables + idlers + pulleys P1, P2 + link",
    virt: "Simulated: virtual 2-DoF finger + object",
    m1: "Actuator Motor 1 (position)",
    m2: "Actuator Motor 2 (position)",
    e1: "Emulation Motor 1 (force)",
    e2: "Emulation Motor 2 (force)",
    plot: "Tension [N] vs time (last 6 s) · red q₁ tendon, amber q₂ tendon · solid Actuator Motor side, dashed Emulation Motor side",
    elong: "tendon elongation",
    tq1: "q₁ tendon elongation",
    tq2: "q₂ tendon elongation",
    note: `Teaching model. The virtual finger has links of ${L1} mm and ${L2} mm, and a PD controller per joint (K_p, K_d) drives it toward the target pose (joint inertias ${JQ[0]} and ${JQ[1]} kg·m², computed independently). Dashed is the target pose, solid the actual one. The tendons carry the PD torque. Tendon 1 crosses joint 1 only, with moment arm R₁ = ${R1} mm; tendon 2 crosses both joints with moment arm r = ${RF} mm. The rig pulleys have the same radii. The rig link follows q₁, and tendon 2 enters the joint-1 idler pair crossed so both strands stay wrapped. Emulation Motor 2 renders the joint-2 PD torque; Emulation Motor 1 renders the joint-1 PD torque minus the share tendon 2 already applies at joint 1. Neither goes below the pretension. Each pulley has only bearing friction (Coulomb τ_c and efficiency η): while the cable moves it sets a tension step in that direction, and when it stops the last step is held. Inertia, dynamic friction and idler friction are not modeled.`,
  },
};

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (v: number) => (v * 180) / Math.PI;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// virtual finger, in mm with the base at the origin, screen-style axes (x right, y down), flexion clockwise
function fk(q1: number, q2: number) {
  const a1 = rad(q1);
  const a2 = rad(q1 + q2);
  const k1 = { x: L1 * Math.cos(a1), y: L1 * Math.sin(a1) };
  const tip = { x: k1.x + L2 * Math.cos(a2), y: k1.y + L2 * Math.sin(a2) };
  return { k1, tip };
}
function ik(p: P) {
  const d2 = p.x * p.x + p.y * p.y;
  const c2 = clamp((d2 - L1 * L1 - L2 * L2) / (2 * L1 * L2), -1, 1);
  const q2 = Math.acos(c2); // flexed branch
  const q1 = Math.atan2(p.y, p.x) - Math.atan2(L2 * Math.sin(q2), L1 + L2 * Math.cos(q2));
  return { q1: clamp(deg(q1), Q1[0], Q1[1]), q2: clamp(deg(q2), Q2[0], Q2[1]) };
}
function closest(a: P, b: P, c: P) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const s = clamp(((c.x - a.x) * dx + (c.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
  return { x: a.x + s * dx, y: a.y + s * dy };
}
const cross = (r: P, F: P) => r.x * F.y - r.y * F.x; // screen coords: positive = clockwise = flexion

type Pull = { steps: number[] };
// tension after a chain of pulleys, starting from the emulator-side tension; moves[i] is the cable motion over
// pulley i toward the motor (mm); radii[i] its radius (mm)
function chain(Te: number, moves: number[], radii: number[], mem: Pull, fcTorque: number, mu: number) {
  const seg = [Te];
  for (let i = 0; i < moves.length; i++) {
    const Ta = seg[i];
    const F = (fcTorque * 1000) / radii[i] + mu * 2 * Ta; // load part uses the incoming tension on both sides (approx.)
    const step = Math.abs(moves[i]) > 1e-6 ? Math.sign(moves[i]) * F : clamp(mem.steps[i], -F, F);
    mem.steps[i] = step;
    seg.push(Math.max(0, Ta + step));
  }
  return seg;
}

export default function TendonInTheLoop2DoFDemo({ lang = "ko" }: { lang?: Lang }) {
  const t = text[lang];
  const id = useId();
  const [kr, setKr] = useState(0.05); // N m/rad
  const [T0, setT0] = useState(10); // N
  const [k, setK] = useState(10); // N/mm
  const [eta, setEta] = useState(0.95);
  const [tau, setTau] = useState(0.02); // N m
  const [q1, setQ1] = useState(20); // deg
  const [q2, setQ2] = useState(30); // deg
  const [ks, setKs] = useState(2); // N/mm
  const [kp, setKp] = useState(0.5); // N m/rad
  const [kd, setKd] = useState(0.005); // N m s/rad
  const [obj, setObj] = useState<P>({ x: 45, y: 42 }); // mm, in the flexion path of the distal link
  const [hist, setHist] = useState<[number, number, number, number, number][]>([]); // t, Tm1, Te1, Tm2, Te2
  const [now, setNow] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<"tip" | "obj" | null>(null);
  const P_ = useRef({ kr, T0, k, eta, tau, q1, q2, ks, obj, kp, kd });
  P_.current = { kr, T0, k, eta, tau, q1, q2, ks, obj, kp, kd };
  // actual finger state (rad, rad/s), integrated in the animation loop
  const act = useRef({ q: [rad(20), rad(30)], w: [0, 0] });
  const [aq, setAq] = useState([20, 30]); // deg, for drawing
  const mem = useRef({ t1: { steps: [0] } as Pull, t2: { steps: [0, 0, 0] } as Pull, q1: 20, q2: 30, init: false });
  const [state, setState] = useState({ seg1: [10, 10], seg2: [10, 10, 10, 10], contact: null as P | null, F: { x: 0, y: 0 } });

  // contact force of the object on the virtual finger and its torques about joints 1 and 2 (N, N m; + resists flexion)
  const contactOf = (p: typeof P_.current, aq1: number, aq2: number) => {
    const { k1, tip } = fk(aq1, aq2);
    const segs: [P, P, number][] = [
      [{ x: 0, y: 0 }, k1, 1],
      [k1, tip, 2],
    ];
    let best: { pt: P; d: number; seg: number } | null = null;
    for (const [a, b, seg] of segs) {
      const pt = closest(a, b, p.obj);
      const d = Math.hypot(p.obj.x - pt.x, p.obj.y - pt.y);
      if (!best || d < best.d) best = { pt, d, seg };
    }
    const pen = best ? OBJ_R + LINK_R - best.d : 0;
    if (!best || pen <= 0) return { F: { x: 0, y: 0 }, tc1: 0, tc2: 0, at: null as P | null };
    const n = { x: (best.pt.x - p.obj.x) / Math.max(1e-6, best.d), y: (best.pt.y - p.obj.y) / Math.max(1e-6, best.d) };
    const F = { x: p.ks * pen * n.x, y: p.ks * pen * n.y };
    const tc1 = -cross(best.pt, F) / 1000;
    const tc2 = best.seg === 2 ? -cross({ x: best.pt.x - k1.x, y: best.pt.y - k1.y }, F) / 1000 : 0;
    return { F, tc1, tc2, at: best.pt };
  };

  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    let last = t0;
    const tick = (tnow: number) => {
      const p = P_.current;
      const time = (tnow - t0) / 1000;
      const mu = (1 - p.eta) / (1 + p.eta);
      // virtual finger: joint PD toward the target against the load (return spring + contact)
      const A = act.current;
      const qd = [rad(p.q1), rad(p.q2)];
      const lim = [
        [rad(Q1[0]), rad(Q1[1])],
        [rad(Q2[0]), rad(Q2[1])],
      ];
      const steps = Math.min(400, Math.ceil(Math.min(0.05, (tnow - last) / 1000) / DT));
      last = tnow;
      let tpd = [0, 0];
      let c = contactOf(p, deg(A.q[0]), deg(A.q[1]));
      for (let s = 0; s < steps; s++) {
        c = contactOf(p, deg(A.q[0]), deg(A.q[1]));
        const load = [p.kr * A.q[0] + c.tc1, p.kr * A.q[1] + c.tc2];
        tpd = [0, 1].map((j) => p.kp * (qd[j] - A.q[j]) - p.kd * A.w[j]);
        for (const j of [0, 1]) {
          // damping handled implicitly so a large K_d stays stable
          A.w[j] = (A.w[j] + (DT * (p.kp * (qd[j] - A.q[j]) - load[j])) / JQ[j]) / (1 + (DT * p.kd) / JQ[j]);
          A.q[j] += A.w[j] * DT;
          if (A.q[j] < lim[j][0] || A.q[j] > lim[j][1]) {
            A.q[j] = clamp(A.q[j], lim[j][0], lim[j][1]);
            A.w[j] = 0;
          }
        }
      }
      const aq1 = deg(A.q[0]);
      const aq2 = deg(A.q[1]);
      // emulator tensions from the PD torques the tendons carry (N m), floored at the pretension
      const Te2 = Math.max(p.T0, p.T0 + (tpd[1] * 1000) / RF);
      const Te1 = Math.max(p.T0, p.T0 + ((tpd[0] - (RF / 1000) * (Te2 - p.T0)) * 1000) / R1);
      // cable motion since the last frame (toward the motors when > 0)
      const m = mem.current;
      if (!m.init) {
        m.q1 = aq1;
        m.q2 = aq2;
        m.init = true;
      }
      const d1 = rad(aq1 - m.q1);
      const d2 = rad(aq2 - m.q2);
      m.q1 = aq1;
      m.q2 = aq2;
      // tendon 1: P1 turns with the link; tendon 2: idler A sees r (d1 + d2), P2 sees r d2, idler B sees r (d1 + d2)
      const seg1 = chain(Te1, [R1 * d1], [R1], m.t1, p.tau, mu);
      const de2 = RF * (d1 + d2);
      const seg2 = chain(Te2, [de2, RF * d2, de2], [RF, RF, RF], m.t2, p.tau, mu);
      setState({ seg1, seg2, contact: c.at, F: c.F });
      setAq([aq1, aq2]);
      setNow(time);
      setHist((h) => {
        const out = [...h, [time, seg1[1], seg1[0], seg2[3], seg2[0]] as [number, number, number, number, number]];
        let i = 0;
        while (i < out.length && out[i][0] < time - WINDOW) i++;
        return out.slice(i);
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // contactOf reads the latest parameters through the ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // initial parameters reset the friction memory
  useEffect(() => {
    mem.current.t1.steps = [0];
    mem.current.t2.steps = [0, 0, 0];
    setHist([]);
  }, [kr, T0, k, eta, tau]);

  const fmt = (v: number, n = 1) => `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(n)}`;

  // ---------------- drawing ----------------
  const VW = 760;
  const VH = 700;
  const PXM = 2.6; // px per mm for the rig pulleys
  const RP1 = R1 * PXM; // P1 (tendon 1)
  const RP = RF * PXM; // idler pair at joint 1 and P2 (tendon 2)
  const J1 = { x: 500, y: 190 };
  const LH = 150;
  const a = rad(aq[0]);
  const dir = { x: Math.cos(a), y: Math.sin(a) };
  const P2c = { x: J1.x + LH * dir.x, y: J1.y + LH * dir.y };
  const onC = (c: P, ang: number, r0: number) => ({ x: c.x + r0 * Math.cos(ang), y: c.y + r0 * Math.sin(ang) });
  const arc = (c: P, from: number, to: number, r0: number) => {
    const n = Math.max(2, Math.ceil(Math.abs(to - from) / 0.08));
    return Array.from({ length: n + 1 }, (_, i) => {
      const q = onC(c, from + ((to - from) * i) / n, r0);
      return `${i ? "L" : "M"}${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
    }).join(" ");
  };
  // tendon 2 at the joint-1 idler pair (screen angles, clockwise positive): the emulator strand meets it at the
  // upper-left (210 deg) and wraps clockwise over the top (wrap 60 + q1); the motor strand meets it at the lower-left
  // (150 deg) and wraps counter-clockwise under the bottom (wrap 60 - q1)
  const entE = rad(210);
  const entM = rad(150);
  const exitTop = a - Math.PI / 2;
  const exitBot = a + Math.PI / 2;
  const RI = 9;
  const DI = 140; // px, idler distance along the entry lines
  const IdE = { x: J1.x + RP * Math.cos(entE) - DI * 0.5, y: J1.y + RP * Math.sin(entE) + DI * 0.866 };
  const IdM = { x: J1.x + RP * Math.cos(entM) - DI * 0.5, y: J1.y + RP * Math.sin(entM) - DI * 0.866 };
  const yM2 = IdM.y - RI;
  const yE2 = IdE.y + RI;
  // tendon 1: horizontal strands to the top and bottom of P1, half a turn around its right side
  const yM1 = J1.y - RP1;
  const yE1 = J1.y + RP1;

  // actuators (motor + ball screw)
  const S = 1.6; // px per mm for the strokes
  const LC = 46;
  const exc1 = R1 * rad(aq[0]);
  const exc2 = RF * rad(aq[0] + aq[1]);
  const tipOf = (exc: number, motor: boolean) => 190 + (motor ? -exc : exc) * S;
  const zig = (x1: number, y1: number, x2: number, y2: number, n = 5, amp = 7, lead = 5) => {
    const L = Math.hypot(x2 - x1, y2 - y1) || 1;
    const ux = (x2 - x1) / L;
    const uy = (y2 - y1) / L;
    const w = (L - 2 * lead) / n;
    const pts = [`M${x1} ${y1}`, `L${x1 + ux * lead} ${y1 + uy * lead}`];
    for (let i = 0; i < n; i++) {
      const s2 = lead + w * (i + 0.5);
      const o = i % 2 ? amp : -amp;
      pts.push(`L${(x1 + ux * s2 - uy * o).toFixed(1)} ${(y1 + uy * s2 + ux * o).toFixed(1)}`);
    }
    pts.push(`L${x2 - ux * lead} ${y2 - uy * lead}`, `L${x2} ${y2}`);
    return pts.join(" ");
  };
  // compact motor + ball-screw actuator; the screw runs just below the cable axis
  const Actuator = ({ yy, tip, label, ctl }: { yy: number; tip: number; label: string; ctl: string }) => {
    const ys = yy + 14;
    const cx = tip - 11;
    return (
      <g>
        <line x1="20" x2="20" y1={ys - 20} y2={ys + 20} stroke={COLORS.body} strokeWidth="2" />
        {Array.from({ length: 5 }, (_, i) => (
          <line key={i} x1="20" x2="11" y1={ys - 17 + i * 9} y2={ys - 11 + i * 9} stroke={COLORS.body} strokeWidth="1.1" />
        ))}
        <rect x="22" y={ys - 9} width="7" height="18" rx="2" fill="#e5e7eb" stroke={COLORS.body} strokeWidth="1.1" />
        <rect x="29" y={ys - 14} width="44" height="28" rx="3" fill="#d1d5db" stroke={COLORS.body} strokeWidth="1.3" />
        {Array.from({ length: 3 }, (_, i) => (
          <line key={i} x1={40 + i * 11} x2={40 + i * 11} y1={ys - 14} y2={ys + 14} stroke="#9ca3af" strokeWidth="1" />
        ))}
        <rect x="73" y={ys - 17} width="5" height="34" fill="#9ca3af" stroke={COLORS.body} strokeWidth="1.1" />
        <rect x="78" y={ys - 5} width="10" height="10" rx="2" fill="#e5e7eb" stroke={COLORS.body} strokeWidth="1" />
        <rect x="88" y={ys + 7} width="148" height="3" fill="#e5e7eb" stroke={COLORS.muted} strokeWidth="0.7" />
        <rect x="88" y={ys - 3} width="142" height="6" fill="#f3f4f6" stroke={COLORS.body} strokeWidth="0.9" />
        {Array.from({ length: 28 }, (_, i) => (
          <line key={i} x1={90 + i * 5} x2={93 + i * 5} y1={ys - 3} y2={ys + 3} stroke={COLORS.muted} strokeWidth="0.8" />
        ))}
        <rect x="230" y={ys - 7} width="6" height="14" fill="#9ca3af" stroke={COLORS.body} strokeWidth="1" />
        <rect x={cx - 11} y={yy - 10} width="22" height="30" rx="3" fill="var(--surface, #fff)" stroke={COLORS.body} strokeWidth="1.4" />
        <rect x={cx - 7} y={ys - 5} width="14" height="10" rx="1.5" fill="#d1d5db" stroke={COLORS.body} strokeWidth="0.9" />
        <path d={zig(tip, yy, tip + LC, yy)} fill="none" stroke={COLORS.spring} strokeWidth="1.8" />
        <text x={tip + LC / 2} y={yy - 13} textAnchor="middle" className="cable-demo-view">
          {label}
        </text>
        <text x="24" y={ys + 30} className="cable-demo-view">
          {ctl}
        </text>
      </g>
    );
  };
  const tM1 = tipOf(exc1, true);
  const tE1 = tipOf(exc1, false);
  const tM2 = tipOf(exc2, true);
  const tE2 = tipOf(exc2, false);
  const endM1 = { x: tM1 + LC, y: yM1 };
  const endE1 = { x: tE1 + LC, y: yE1 };
  const endM2 = { x: tM2 + LC, y: yM2 };
  const endE2 = { x: tE2 + LC, y: yE2 };

  // tendon colour: hue tells the tendon (1 red, 2 amber), shade tells the elongation (T / k, 0..5 mm)
  const HUES = [
    [
      [254, 202, 202],
      [127, 29, 29],
    ],
    [
      [253, 230, 138],
      [146, 64, 14],
    ],
  ];
  const shade = (T: number, tendon = 0) => {
    const u = Math.min(1, Math.max(0, T) / k / 5);
    const [c0, c1] = HUES[tendon];
    return `rgb(${c0.map((v, i) => Math.round(v + (c1[i] - v) * u)).join(",")})`;
  };
  // tendon 1: emulator side (bottom strand + lower half of the wrap) and motor side (upper half + top strand)
  const t1Paths = [
    `M${endE1.x} ${endE1.y} L${J1.x} ${yE1} ${arc(J1, Math.PI / 2, 0, RP1).replace("M", "L")}`,
    `${arc(J1, 0, -Math.PI / 2, RP1)} L${endM1.x} ${endM1.y}`,
  ];
  // tendon 2: emulator -> lower idler -> idler pair top -> link upper side -> P2 -> link lower side -> idler pair
  // bottom -> upper idler -> motor
  const p1E = onC(J1, entE, RP);
  const p2TopIn = onC(P2c, exitTop, RP);
  const p1BotIn = onC(J1, exitBot, RP);
  const idMin = onC(IdM, rad(-30), RI);
  const t2Paths = [
    `M${endE2.x} ${endE2.y} L${IdE.x} ${IdE.y + RI} ${arc(IdE, rad(90), rad(30), RI).replace("M", "L")} L${p1E.x} ${p1E.y}`,
    `${arc(J1, entE, exitTop + 2 * Math.PI, RP)} L${p2TopIn.x} ${p2TopIn.y}`,
    `${arc(P2c, exitTop, exitBot, RP)} L${p1BotIn.x} ${p1BotIn.y}`,
    `${arc(J1, exitBot, entM, RP)} L${idMin.x} ${idMin.y} ${arc(IdM, rad(-30), rad(-90), RI).replace("M", "L")} L${endM2.x} ${endM2.y}`,
  ];

  // virtual finger panel
  const PANEL = 418;
  const FB = { x: 230, y: PANEL + 90 }; // px, base
  const FS = 2.2; // px per mm
  const toS = (pm: P) => ({ x: FB.x + pm.x * FS, y: FB.y + pm.y * FS });
  const toM = (ps: P) => ({ x: (ps.x - FB.x) / FS, y: (ps.y - FB.y) / FS });
  const { k1, tip } = fk(aq[0], aq[1]);
  const K1 = toS(k1);
  const TIP = toS(tip);
  const goal = fk(q1, q2); // target pose (ghost)
  const GK1 = toS(goal.k1);
  const GTIP = toS(goal.tip);
  const OB = toS(obj);

  const svgPoint = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const box = svg.getBoundingClientRect();
    return { x: ((e.clientX - box.left) / box.width) * VW, y: ((e.clientY - box.top) / box.height) * VH };
  };
  const onDown = (which: "tip" | "obj") => (e: React.PointerEvent) => {
    drag.current = which;
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const pm = toM(svgPoint(e));
    if (drag.current === "obj") setObj({ x: clamp(pm.x, -60, 120), y: clamp(pm.y, -25, 95) });
    else {
      const s = ik(pm);
      setQ1(Math.round(s.q1));
      setQ2(Math.round(s.q2));
    }
  };
  const onUp = () => {
    drag.current = null;
  };

  // tension plot
  const PW = 680;
  const PH = 200;
  const m = { l: 40, r: 10, t: 10, b: 28 };
  const t0 = now - WINDOW;
  const XT = (v: number) => m.l + ((v - t0) / WINDOW) * (PW - m.l - m.r);
  const peak = Math.max(T0 * 2, ...hist.map((h) => Math.max(h[1], h[2], h[3], h[4]) * 1.1));
  const tMax = [20, 25, 40, 50, 60, 80, 100, 150, 200, 300].find((v) => v >= peak) ?? 400;
  const step = [5, 10, 20, 25, 50, 100].find((s) => tMax / s <= 6) ?? 100;
  const YT = (v: number) => PH - m.b - (v / tMax) * (PH - m.t - m.b);
  const poly = (i: 1 | 2 | 3 | 4) => hist.map((h) => `${XT(h[0]).toFixed(1)},${YT(h[i]).toFixed(1)}`).join(" ");

  const slider = (key: string, label: string, val: string, min: number, max: number, stepv: number, v: number, set: (x: number) => void) => (
    <div>
      <label htmlFor={`${id}-${key}`}>
        {label} <strong>{val}</strong>
      </label>
      <input id={`${id}-${key}`} type="range" min={min} max={max} step={stepv} value={v} onChange={(e) => set(Number(e.target.value))} />
    </div>
  );

  return (
    <section className="signal-demo cable-demo" aria-label={t.title}>
      <header className="signal-demo-heading">
        <span className="eyebrow">{t.eyebrow}</span>
        <h3>{t.title}</h3>
      </header>
      <div className="dyno-params">
        <p className="cable-details-group">{t.gInit}</p>
        <div className="cable-controls">
          {slider("kr", t.kr, `${kr.toFixed(2)} N·m/rad`, 0, 0.5, 0.01, kr, setKr)}
          {slider("t0", t.T0, `${T0.toFixed(0)} N`, 2, 40, 1, T0, setT0)}
          {slider("k", t.k, `${k.toFixed(0)} N/mm`, 2, 50, 1, k, setK)}
        </div>
        <details className="cable-details">
          <summary>{t.details}</summary>
          <div className="cable-controls">
            {slider("eta", t.eta, `${(eta * 100).toFixed(1)} %`, 0.8, 1, 0.005, eta, setEta)}
            {slider("tau", t.tau, `${tau.toFixed(3)} N·m`, 0, 0.1, 0.002, tau, setTau)}
          </div>
        </details>
        <p className="cable-details-group">{t.gPose}</p>
        <div className="cable-controls">
          {slider("q1", t.q1, `${q1.toFixed(0)}°`, Q1[0], Q1[1], 1, q1, setQ1)}
          {slider("q2", t.q2, `${q2.toFixed(0)}°`, Q2[0], Q2[1], 1, q2, setQ2)}
        </div>
        <p className="cable-details-group">{t.gPD}</p>
        <div className="cable-controls">
          {slider("kp", t.kp, `${kp.toFixed(2)} N·m/rad`, 0.05, 5, 0.05, kp, setKp)}
          {slider("kd", t.kd, `${kd.toFixed(3)} N·m·s/rad`, 0, 0.05, 0.001, kd, setKd)}
        </div>
        <p className="cable-details-group">{t.gObj}</p>
        <div className="cable-controls">{slider("ks", t.ks, `${ks.toFixed(1)} N/mm`, 0.2, 10, 0.1, ks, setKs)}</div>
      </div>

      <svg
        ref={svgRef}
        className="cable-demo-svg"
        viewBox={`0 0 ${VW} ${VH}`}
        role="img"
        aria-label={t.title}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{ touchAction: "none" }}
      >
        <defs>
          {[0, 1].map((tn) => (
            <linearGradient key={tn} id={`${id}-el${tn}`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor={shade(0, tn)} />
              <stop offset="1" stopColor={shade(5 * k, tn)} />
            </linearGradient>
          ))}
          <marker id={`${id}-ar`} viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" orient="auto">
            <path d="M0 0 L10 5 L0 10 z" fill={COLORS.body} />
          </marker>
        </defs>
        {/* real hardware */}
        <rect x="300" y="8" width={VW - 308} height="398" rx="8" fill="none" stroke={COLORS.muted} strokeDasharray="6 4" />
        <text x="312" y="26" className="cable-demo-view">
          {t.real}
        </text>
        <Actuator yy={yM2} tip={tM2} label={`T_a2 = ${fmt(state.seg2[3])} N`} ctl={t.m2} />
        <Actuator yy={yM1} tip={tM1} label={`T_a1 = ${fmt(state.seg1[1])} N`} ctl={t.m1} />
        <Actuator yy={yE1} tip={tE1} label={`T_e1 = ${fmt(state.seg1[0])} N`} ctl={t.e1} />
        <Actuator yy={yE2} tip={tE2} label={`T_e2 = ${fmt(state.seg2[0])} N`} ctl={t.e2} />
        {/* idlers for tendon 2 (grounded) */}
        {[IdM, IdE].map((c, i) => (
          <g key={i}>
            <line x1={c.x} y1={c.y} x2={c.x} y2={c.y + (i ? 22 : -22)} stroke={COLORS.body} strokeWidth="2" />
            <line x1={c.x - 9} x2={c.x + 9} y1={c.y + (i ? 22 : -22)} y2={c.y + (i ? 22 : -22)} stroke={COLORS.body} strokeWidth="2" />
            <circle cx={c.x} cy={c.y} r={RI} fill="var(--surface, #fff)" stroke={COLORS.body} strokeWidth="1.6" />
            <circle cx={c.x} cy={c.y} r="2.5" fill={COLORS.body} />
          </g>
        ))}
        {/* joint-1 support (grounded) and the rig link */}
        <path d={`M${J1.x} ${J1.y} L${J1.x - 30} ${J1.y + 92} L${J1.x + 30} ${J1.y + 92} Z`} fill="var(--surface, #fff)" stroke={COLORS.body} strokeWidth="1.4" />
        <line x1={J1.x - 40} x2={J1.x + 40} y1={J1.y + 92} y2={J1.y + 92} stroke={COLORS.body} strokeWidth="2" />
        {Array.from({ length: 8 }, (_, i) => (
          <line key={i} x1={J1.x - 36 + i * 10} x2={J1.x - 44 + i * 10} y1={J1.y + 92} y2={J1.y + 101} stroke={COLORS.body} strokeWidth="1.1" />
        ))}
        <line x1={J1.x} y1={J1.y} x2={P2c.x} y2={P2c.y} stroke="#9ca3af" strokeWidth="14" strokeLinecap="round" opacity="0.55" />
        {/* P1 (tendon 1, turns with the link) behind the joint-1 idler pair (tendon 2); P2 at the link tip */}
        <circle cx={J1.x} cy={J1.y} r={RP1 - 2} fill="var(--surface, #fff)" stroke={COLORS.body} strokeWidth="2" opacity="0.9" />
        <line x1={J1.x} y1={J1.y} x2={onC(J1, a, RP1 - 4).x} y2={onC(J1, a, RP1 - 4).y} stroke={COLORS.muted} strokeWidth="1.6" strokeDasharray="3 3" />
        <circle cx={J1.x} cy={J1.y} r={RP - 2} fill="var(--surface, #fff)" stroke={COLORS.body} strokeWidth="1.6" />
        <circle cx={J1.x} cy={J1.y} r="4" fill="#6b7280" />
        <circle cx={P2c.x} cy={P2c.y} r={RP - 2} fill="var(--surface, #fff)" stroke={COLORS.body} strokeWidth="2" />
        <circle cx={P2c.x} cy={P2c.y} r="4" fill="#6b7280" />
        <text x={J1.x + RP1 + 6} y={J1.y - RP1 + 2} className="cable-demo-view">
          P1
        </text>
        <text x={P2c.x} y={P2c.y + RP + 14} textAnchor="middle" className="cable-demo-view">
          P2
        </text>
        {/* tendons, coloured by elongation per segment */}
        {t1Paths.map((d, i) => (
          <path key={`a${i}`} d={d} fill="none" stroke={shade(state.seg1[i])} strokeWidth="3.5" strokeLinecap="round" />
        ))}
        {t2Paths.map((d, i) => (
          <path key={`b${i}`} d={d} fill="none" stroke={shade(state.seg2[i], 1)} strokeWidth="3.5" strokeLinecap="round" />
        ))}
        {[endM1, endE1, endM2, endE2].map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r="4" fill={COLORS.body} />
        ))}
        {/* legend: one elongation bar per tendon */}
        {[0, 1].map((tn) => (
          <g key={tn}>
            <rect x={VW - 170} y={358 + tn * 14} width="110" height="8" fill={`url(#${id}-el${tn})`} />
            <text x={VW - 176} y={366 + tn * 14} textAnchor="end" className="cable-demo-view">
              {tn ? t.tq2 : t.tq1}
            </text>
          </g>
        ))}
        <text x={VW - 170} y="398" textAnchor="middle" className="cable-demo-view">
          0
        </text>
        <text x={VW - 60} y="398" textAnchor="middle" className="cable-demo-view">
          5 mm
        </text>

        {/* virtual finger */}
        <rect x="10" y={PANEL} width={VW - 20} height={VH - PANEL - 8} rx="8" fill="none" stroke={COLORS.sim} strokeDasharray="6 4" />
        <text x="22" y={PANEL + 18} className="cable-demo-view">
          {t.virt}
        </text>
        <line x1={FB.x - 40} x2={FB.x - 40} y1={FB.y - 30} y2={FB.y + 30} stroke={COLORS.body} strokeWidth="2" />
        <line x1={FB.x - 40} x2={FB.x} y1={FB.y} y2={FB.y} stroke={COLORS.body} strokeWidth="6" />
        <circle cx={OB.x} cy={OB.y} r={OBJ_R * FS} fill={COLORS.obj} opacity="0.35" stroke={COLORS.obj} strokeWidth="2" style={{ cursor: "grab" }} onPointerDown={onDown("obj")} />
        <line x1={FB.x} y1={FB.y} x2={K1.x} y2={K1.y} stroke={COLORS.sim} strokeWidth={LINK_R * 2 * FS} strokeLinecap="round" opacity="0.85" />
        <line x1={K1.x} y1={K1.y} x2={TIP.x} y2={TIP.y} stroke={COLORS.sim} strokeWidth={LINK_R * 2 * FS} strokeLinecap="round" opacity="0.85" />
        <circle cx={FB.x} cy={FB.y} r="6" fill={COLORS.body} />
        <circle cx={K1.x} cy={K1.y} r="5" fill={COLORS.body} />
        {state.contact && (
          <line
            x1={toS(state.contact).x - state.F.x * 4}
            y1={toS(state.contact).y - state.F.y * 4}
            x2={toS(state.contact).x}
            y2={toS(state.contact).y}
            stroke={COLORS.body}
            strokeWidth="2.2"
            markerEnd={`url(#${id}-ar)`}
          />
        )}
        <circle cx={TIP.x} cy={TIP.y} r="5" fill={COLORS.sim} />
        {/* target pose: dashed ghost; its tip is the drag handle */}
        <path d={`M${FB.x} ${FB.y} L${GK1.x} ${GK1.y} L${GTIP.x} ${GTIP.y}`} fill="none" stroke={COLORS.sim} strokeWidth="2" strokeDasharray="5 4" opacity="0.8" />
        <circle cx={GTIP.x} cy={GTIP.y} r="10" fill="var(--surface, #fff)" fillOpacity="0.6" stroke={COLORS.sim} strokeWidth="2" strokeDasharray="4 3" style={{ cursor: "grab" }} onPointerDown={onDown("tip")} />
      </svg>

      <div className="dyno-row">
        <figure className="dyno-fig">
          <svg className="dyno-plot dyno-plot-wide" viewBox={`0 0 ${PW} ${PH}`} role="img" aria-label={t.plot}>
            {Array.from({ length: Math.floor(tMax / step) + 1 }, (_, i) => i * step).map((v) => (
              <g key={v}>
                <line x1={m.l} x2={PW - m.r} y1={YT(v)} y2={YT(v)} stroke={COLORS.grid} />
                <text x={m.l - 6} y={YT(v) + 4} textAnchor="end">
                  {v}
                </text>
              </g>
            ))}
            {[0, 1, 2, 3, 4, 5, 6].map((s) => (
              <text key={s} x={XT(t0 + s)} y={PH - m.b + 16} textAnchor="middle">
                {s - WINDOW}s
              </text>
            ))}
            <polyline points={poly(1)} fill="none" stroke={COLORS.t1} strokeWidth="1.8" />
            <polyline points={poly(2)} fill="none" stroke={COLORS.t1} strokeWidth="1.8" strokeDasharray="5 4" />
            <polyline points={poly(3)} fill="none" stroke={COLORS.t2} strokeWidth="1.8" />
            <polyline points={poly(4)} fill="none" stroke={COLORS.t2} strokeWidth="1.8" strokeDasharray="5 4" />
          </svg>
          <figcaption>{t.plot}</figcaption>
        </figure>
      </div>
      <p className="demo-model-note">{t.note}</p>
    </section>
  );
}
