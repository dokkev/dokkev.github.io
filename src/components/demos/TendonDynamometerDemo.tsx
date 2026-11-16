import { useEffect, useId, useRef, useState } from "react";

// Tendon dynamometer as a hardware-in-the-loop ("real twin") test of the cable.
// Real side (what is tested): input strand, pulley with bearing friction, output strand.
// Virtual side: a 1-DoF finger simulated in real time that presses a spring; the output actuator renders it
// (admittance control): it reads the load-cell tension T_out, integrates the finger dynamics and moves the cable
// end to y = r_f phi.
//
// Units: lengths mm, forces N, torques N m, angles rad internally.
// Input (position controlled): q(t) = r theta_in(t), theta_in = A sin(2 pi f t), r = D / 2 (pulley radius).
// x: cable travel over the pulley toward the input side; y = r_f phi: output end pulled by the finger flexing.
// Strands (stiffness k, pretension T0):  T_in = T0 + k (q - x),  T_out = T0 + k (x - y).
// Pulley (no inertia): bearing friction limit on the tension difference
//   F = tau_c / r + mu (T_in + T_out),  mu = (1 - eta) / (1 + eta),
// so that, with tau_c = 0 and the input driving, T_out = eta T_in (eta: bearing efficiency). T_in + T_out =
// 2 T0 + k (q - y) does not depend on x. Sticks while |T_in - T_out| <= F; slipping, T_in - T_out = +-F + b dx/dt,
// integrated with implicit Euler (b = 0: quasi-static).
// Finger: J phi'' = r_f (T_out - T0) - k_f phi - b_f phi' - tau_s; k_f is the finger's return spring and the
// pretension is balanced at phi = 0.
// Load case "contact": an object (a spring of rotational stiffness k_s) the finger touches at joint angle phi_c:
// tau_s = max(0, k_s (phi - phi_c) + b_s phi') while phi > phi_c.
// Load case "gravity": a constant weight m g at distance l from the joint opposes flexion through the moment arm
// l cos(phi + beta) (beta: elevation of the link above horizontal at phi = 0): tau_s = m g l cos(phi + beta).
// Parameters: initial (k_f, T0, k_c, pulley friction; changing one restarts the run), runtime (f, A), object.
// Ideal admittance tracking (the output actuator puts the cable end exactly at y). The emulator also holds the
// output tension at or above the pretension T0: if the finger would run ahead of the cable, the cable end is kept
// at T0 and the finger follows it. Cables only pull: a slack strand carries 0 tension.

type Lang = "ko" | "en";
type Case = "contact" | "gravity";

const RF = 10; // mm, finger tendon moment arm
const J = 5e-5; // kg m^2, finger inertia
const BF = 0.005; // N m s/rad, finger damping
const BS = 0.02; // N m s/rad, contact damping of the object
const DT = 0.0002; // s
const COLORS = {
  cable: "#d62828",
  spring: "#2563eb",
  body: "#202725",
  muted: "#6b7280",
  tin: "#d62828",
  tout: "#2563eb",
  phi: "#0f766e",
  grid: "#eef0ee",
  obj: "#15803d",
  sim: "#7c3aed",
};

const text = {
  ko: {
    eyebrow: "인터랙티브 예시 · Tendon dynamometer (hardware-in-the-loop)",
    title: "실제 케이블에 가상 손가락을 달아 시험한다",
    gInit: "초기 파라미터 (고정): 바꾸면 처음부터 다시 시작합니다",
    gRun: "실행 중 파라미터: 바로 반영됩니다",
    gObj: "하중 조건",
    contactCase: "물체 접촉",
    gravityCase: "일정 하중 (중력)",
    mass: "질량 m",
    lcom: "무게중심 거리 l",
    beta: "중립 자세 β",
    gravT: "중력 토크 (모멘트 암)",
    kf: "Return spring k_f",
    k: "케이블 강성 k_c",
    T0: "Pretension F_0",
    f: "구동 주파수 f",
    A: "진폭 A (풀리 각도)",
    obj: "물체",
    on: "있음",
    off: "없음",
    phic: "접촉 각도 φ_c",
    ks: "물체 강성 k_s",
    details: "풀리 세부 설정 (지름, 효율, 마찰)",
    D: "풀리 지름 D",
    eta: "베어링 효율 η",
    tau: "쿨롱 마찰 τ_c",
    b: "속도 비례 마찰 b",
    start: "시작",
    stop: "정지",
    clear: "궤적 지우기",
    plot1: "장력 [N] – 시간 (최근 두 주기) · 빨강 T_in, 파랑 T_out",
    tin: "T_in",
    tout: "T_out (로드셀)",
    phi: "손가락 각도 φ",
    contact: "물체",
    yes: "누르는 중",
    no: "떨어짐",
    state: "풀리",
    stick: "고착 (stick)",
    slip: "미끄럼 (slip)",
    real: "실제 하드웨어 (시험 대상): 케이블 + 풀리",
    elong: "tendon 신장",
    term: "케이블 고정부 (crimp)",
    virt: "시뮬레이션: 가상 1 DoF 손가락 + 하중",
    posCtl: "Actuator Motor (위치 제어)",
    emu: "Emulation Motor (어드미턴스 제어)",
    loop: "T_out 측정 → 손가락 계산 → y = r_f φ",
    note: `교육용 모델입니다. 실제 하드웨어 부분도 여기서는 계산으로 대신합니다: 두 케이블 구간은 강성 k_c의 선형 스프링, 풀리는 관성 없이 마찰만 갖습니다. 풀리가 붙잡을 수 있는 장력 차이는 τ_c/r + μ(T_in + T_out)이고, μ = (1 − η)/(1 + η)는 베어링 효율 η에서 정했습니다(τ_c = 0이면 미끄러지는 동안 T_out = η·T_in). 미끄러지는 동안에는 속도 비례 마찰 b가 더해집니다. 입력 진폭 A는 풀리 각도 기준이라 케이블 변위는 r·A(r = D/2)입니다. 가상 손가락은 모멘트 암 r_f = ${RF} mm, 관성 ${J} kg·m², return spring 강성 k_f, 감쇠 ${BF} N·m·s/rad이고, pretension은 φ = 0에서 return spring과 평형을 이룹니다. 물체는 관절 기준 회전 강성 k_s의 스프링으로 나타냈고, 닿은 뒤에만 힘을 내며(당기지 않음) 접촉 감쇠 ${BS} N·m·s/rad를 함께 둡니다. 중력 조건에서는 굴곡이 링크를 들어 올리는 방향이 되도록 그림을 뒤집어 그렸고, β는 φ = 0일 때 링크가 수평과 이루는 각도(위쪽이 양수)이며, 중력 토크는 m·g·l·cos(φ + β)입니다. 출력 측 액추에이터는 계산된 위치를 지연 없이 정확히 따라간다고 봅니다. 실제 HIL에서는 이 추종 대역폭과 지연이 재현할 수 있는 손가락과 물체의 강성을 제한합니다.`,
  },
  en: {
    eyebrow: "Interactive example · Tendon dynamometer (hardware-in-the-loop)",
    title: "Test a real cable with a virtual finger on its end",
    gInit: "Initial parameters (fixed): changing one restarts the run",
    gRun: "Runtime parameters: applied immediately",
    gObj: "Load case",
    contactCase: "Object contact",
    gravityCase: "Constant load (gravity)",
    mass: "Mass m",
    lcom: "Mass distance l",
    beta: "Neutral pose β",
    gravT: "Gravity torque (moment arm)",
    kf: "Return spring k_f",
    k: "Cable stiffness k_c",
    T0: "Pretension F_0",
    f: "Actuation frequency f",
    A: "Amplitude A (pulley)",
    obj: "Object",
    on: "on",
    off: "off",
    phic: "Contact angle φ_c",
    ks: "Object k_s",
    details: "Pulley details (diameter, efficiency, friction)",
    D: "Pulley diameter D",
    eta: "Bearing efficiency η",
    tau: "Coulomb friction τ_c",
    b: "Viscous friction b",
    start: "Start",
    stop: "Stop",
    clear: "Clear trail",
    plot1: "Tension [N] vs time (last two cycles) · red T_in, blue T_out",
    tin: "T_in",
    tout: "T_out (load cell)",
    phi: "Finger angle φ",
    contact: "Object",
    yes: "pressing",
    no: "free",
    state: "Pulley",
    stick: "stick",
    slip: "slip",
    real: "Real hardware (under test): cable + pulley",
    elong: "tendon elongation",
    term: "termination (crimp)",
    virt: "Simulated: virtual 1-DoF finger + load",
    posCtl: "Actuator Motor (position control)",
    emu: "Emulation Motor (admittance control)",
    loop: "measure T_out → finger dynamics → y = r_f φ",
    note: `Teaching model. The real-hardware part is computed here too: both cable spans are linear springs k_c, and the pulley has no inertia, only friction. The tension difference it can hold is τ_c/r + μ(T_in + T_out), with μ = (1 − η)/(1 + η) from the bearing efficiency η (with τ_c = 0, T_out = η·T_in while slipping); a velocity-proportional friction b adds while slipping. The amplitude A is a pulley angle, so the cable stroke is r·A (r = D/2). The virtual finger has moment arm r_f = ${RF} mm, inertia ${J} kg·m², return spring stiffness k_f and damping ${BF} N·m·s/rad; the pretension balances the return spring at φ = 0. The object is a spring of rotational stiffness k_s about the joint; it only pushes once touched (never pulls) and has contact damping ${BS} N·m·s/rad. In the gravity case the drawing is flipped so that flexion lifts the link; β is the link angle above horizontal at φ = 0, and the gravity torque is m·g·l·cos(φ + β). The output actuator is assumed to track the computed position exactly and without delay. In a real HIL rig that tracking bandwidth and delay limit how stiff a finger and object can be rendered.`,
  },
};

type Sim = { t: number; x: number; phi: number; om: number; slip: boolean; Tin: number; Tout: number; ts: number };
type Pt = [number, number, number, number, number]; // t, theta_in [deg], T_in, T_out, phi [deg]

const deg = (v: number) => (v * 180) / Math.PI;
const niceCeil = (v: number) => [10, 20, 25, 40, 50, 60, 80, 100, 120, 150, 200, 250, 300, 400, 500].find((s) => s >= v) ?? Math.ceil(v / 100) * 100;

export default function TendonDynamometerDemo({ lang = "ko" }: { lang?: Lang }) {
  const t = text[lang];
  const id = useId();
  const [kf, setKf] = useState(0.05); // N m/rad, finger return spring
  const [k, setK] = useState(10); // N/mm
  const [T0, setT0] = useState(10); // N
  const [f, setF] = useState(0.5); // Hz
  const [A, setA] = useState(30); // deg
  const [lc, setLc] = useState<Case>("contact");
  const [mass, setMass] = useState(0.1); // kg
  const [lcom, setLcom] = useState(60); // mm
  const [beta, setBeta] = useState(-20); // deg
  const [phic, setPhic] = useState(35); // deg
  const [ks, setKs] = useState(1); // N m/rad
  const [D, setD] = useState(40); // mm, pulley diameter
  const [eta, setEta] = useState(0.97); // bearing efficiency
  const [tau, setTau] = useState(0.02); // N m
  const [b, setB] = useState(0.01); // N s/mm
  const [playing, setPlaying] = useState(true);
  const [sim, setSim] = useState<Sim>({ t: 0, x: 0, phi: 0, om: 0, slip: false, Tin: 10, Tout: 10, ts: 0 });
  const [trail, setTrail] = useState<Pt[]>([]);
  const simRef = useRef(sim);
  const P = useRef({ kf, k, T0, f, A, lc, phic, ks, mass, lcom, beta, D, eta, tau, b });
  P.current = { kf, k, T0, f, A, lc, phic, ks, mass, lcom, beta, D, eta, tau, b };
  const r = D / 2; // mm

  // initial parameters: restart the run from rest
  useEffect(() => {
    const rest: Sim = { t: 0, x: 0, phi: 0, om: 0, slip: false, Tin: T0, Tout: T0, ts: 0 };
    simRef.current = rest;
    setSim(rest);
    setTrail([]);
  }, [kf, k, T0, D, eta, tau, b, lc]);

  // runtime and object parameters: keep running, start a fresh trail
  useEffect(() => {
    setTrail([]);
  }, [f, A, phic, ks, mass, lcom, beta]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const p = P.current;
      const w = 2 * Math.PI * p.f;
      const rp = p.D / 2;
      const amp = rp * ((p.A * Math.PI) / 180);
      const fc = (p.tau * 1000) / rp; // N, Coulomb part of the tension difference the bearing holds
      const mu = (1 - p.eta) / (1 + p.eta); // load-proportional part from the bearing efficiency
      const phiC = (p.phic * Math.PI) / 180;
      let { t: tt, x, phi, om } = simRef.current;
      let slip = false;
      let Tin = p.T0;
      let Tout = p.T0;
      let ts = 0;
      const steps = Math.min(400, Math.ceil(Math.min(0.05, (now - last) / 1000) / DT));
      last = now;
      for (let i = 0; i < steps; i++) {
        tt += DT;
        const q = amp * Math.sin(w * tt);
        const y = RF * phi;
        const xPrev = x;
        // strand tensions: a cable only pulls, so a slack strand carries 0
        const tIn = (xx: number) => Math.max(0, p.T0 + p.k * (q - xx));
        const tOut = (xx: number) => Math.max(0, p.T0 + p.k * (xx - y));
        // pulley: stick / slip on the tension difference, limit F = tau_c / r + mu (T_in + T_out)
        const d = tIn(x) - tOut(x);
        const fl = fc + mu * (tIn(x) + tOut(x));
        if (Math.abs(d) > fl) {
          const B = Math.sign(d) * fl;
          // implicit step: T_in(x) - T_out(x) - B - b (x - x_prev) / DT = 0, decreasing in x -> bisection
          const g = (xx: number) => tIn(xx) - tOut(xx) - B - (p.b * (xx - xPrev)) / DT;
          let lo = xPrev - 60;
          let hi = xPrev + 60;
          for (let it = 0; it < 40; it++) {
            const mid = (lo + hi) / 2;
            if (g(mid) > 0) lo = mid;
            else hi = mid;
          }
          x = (lo + hi) / 2;
          slip = true;
        } else slip = false;
        // virtual finger (semi-implicit Euler)
        ts =
          p.lc === "contact"
            ? phi > phiC
              ? Math.max(0, p.ks * (phi - phiC) + BS * om)
              : 0
            : p.mass * 9.81 * (p.lcom / 1000) * Math.cos(phi + (p.beta * Math.PI) / 180);
        Tout = p.T0 + p.k * (x - y);
        const acc = ((RF / 1000) * (Tout - p.T0) - p.kf * phi - BF * om - ts) / J;
        om += acc * DT;
        phi += om * DT;
        // the emulator never lets the output tension fall below the pretension: if the virtual finger would run
        // ahead of the cable (T_out < T0), the cable end is held at the pretension and the finger follows it
        if (RF * phi > x) {
          phi = x / RF;
          om = (x - xPrev) / (RF * DT);
        }
        Tin = Math.max(0, p.T0 + p.k * (q - x));
        Tout = p.T0 + p.k * (x - RF * phi);
      }
      const next = { t: tt, x, phi, om, slip, Tin, Tout, ts };
      simRef.current = next;
      setSim(next);
      const th = deg(Math.sin(w * tt) * ((p.A * Math.PI) / 180));
      const keepT = 2 / p.f;
      setTrail((tr) => {
        const out = [...tr, [tt, th, Tin, Tout, deg(phi)] as Pt];
        let i = 0;
        while (i < out.length && out[i][0] < tt - keepT) i++;
        return out.slice(i);
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const amp = r * ((A * Math.PI) / 180);
  const q = amp * Math.sin(2 * Math.PI * f * sim.t);
  const fmt = (v: number, n = 1) => `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(n)}`;

  // ---------- schematic ----------
  const VW = 760;
  const VH = 400;
  const yA = 70;
  const yB = 180;
  const RP = (yB - yA) / 2;
  const PC = { x: 640, y: (yA + yB) / 2 };
  // drawn displacement scale (exaggerated), shrunk so the largest stroke still fits
  const S = Math.min(3, 48 / Math.max(1, amp));
  const yEnd = RF * sim.phi;
  // the blue springs are load cells (rigid in the drawing); the tendon's elongation is shown by its colour
  const TIP0 = 232; // px, carriage (load-cell start) at zero stroke
  const rodA = TIP0 - q * S;
  const rodB = TIP0 + yEnd * S;
  const LC = 56; // px, drawn length of the load cell (fixed)
  const blockA = rodA + LC;
  const blockB = rodB + LC;
  const E_MAX = 5; // mm, top of the colour scale
  const elong = (T: number) => Math.max(0, T) / k; // mm, from the unloaded length
  const shade = (e: number) => {
    const u = Math.min(1, e / E_MAX);
    const a = [254, 202, 202]; // light
    const c = [127, 29, 29]; // dark red
    return `rgb(${a.map((v, i) => Math.round(v + (c[i] - v) * u)).join(",")})`;
  };
  const eIn = elong(sim.Tin);
  const eOut = elong(sim.Tout);
  const zig = (x1: number, y1: number, x2: number, y2: number, n = 8, amp2 = 10, lead = 10) => {
    const L = Math.hypot(x2 - x1, y2 - y1);
    const ux = (x2 - x1) / L;
    const uy = (y2 - y1) / L;
    const nx = -uy;
    const ny = ux;
    const w = (L - 2 * lead) / n;
    const pts = [`M${x1} ${y1}`, `L${x1 + ux * lead} ${y1 + uy * lead}`];
    for (let i = 0; i < n; i++) {
      const s = lead + w * (i + 0.5);
      const o = i % 2 ? amp2 : -amp2;
      pts.push(`L${(x1 + ux * s + nx * o).toFixed(1)} ${(y1 + uy * s + ny * o).toFixed(1)}`);
    }
    pts.push(`L${x2 - ux * lead} ${y2 - uy * lead}`, `L${x2} ${y2}`);
    return pts.join(" ");
  };
  const phiDraw = deg((sim.x * S) / RP);
  const spoke = { x: PC.x + (RP - 12) * Math.cos(((90 + phiDraw) * Math.PI) / 180), y: PC.y - (RP - 12) * Math.sin(((90 + phiDraw) * Math.PI) / 180) };
  // motor + ball-screw linear actuator: the screw runs just below the cable axis, the nut carriage rides on it and
  // carries the load cell (blue) whose right end holds the tendon
  const SCREW0 = 128; // px, screw start (after the coupling)
  const SCREW1 = 292; // px, screw end (support bearing): covers the +-48 px drawn stroke
  const Actuator = ({ yy, tip, block, label, ctl }: { yy: number; tip: number; block: number; label: string; ctl: string }) => {
    const ys = yy + 18; // screw axis
    const cx = tip - 13; // carriage centre
    return (
      <g>
        {/* wall and motor mount */}
        <line x1="40" x2="40" y1={ys - 26} y2={ys + 26} stroke={COLORS.body} strokeWidth="2" />
        {Array.from({ length: 6 }, (_, i) => (
          <line key={i} x1="40" x2="30" y1={ys - 22 + i * 9} y2={ys - 15 + i * 9} stroke={COLORS.body} strokeWidth="1.1" />
        ))}
        {/* encoder cap, motor body with fins, flange */}
        <rect x="42" y={ys - 12} width="10" height="24" rx="2" fill="#e5e7eb" stroke={COLORS.body} strokeWidth="1.2" />
        <rect x="52" y={ys - 18} width="58" height="36" rx="3" fill="#d1d5db" stroke={COLORS.body} strokeWidth="1.4" />
        {Array.from({ length: 5 }, (_, i) => (
          <line key={i} x1={60 + i * 10} x2={60 + i * 10} y1={ys - 18} y2={ys + 18} stroke="#9ca3af" strokeWidth="1" />
        ))}
        <rect x="110" y={ys - 21} width="6" height="42" fill="#9ca3af" stroke={COLORS.body} strokeWidth="1.2" />
        <text x="81" y={ys + 4} textAnchor="middle" className="cable-demo-label-dark">
          M
        </text>
        {/* coupling */}
        <rect x="116" y={ys - 6} width="12" height="12" rx="2" fill="#e5e7eb" stroke={COLORS.body} strokeWidth="1.1" />
        {/* guide rail */}
        <rect x={SCREW0} y={ys + 9} width={SCREW1 - SCREW0 + 8} height="4" fill="#e5e7eb" stroke={COLORS.muted} strokeWidth="0.8" />
        {/* ball screw with thread marks, end support */}
        <rect x={SCREW0} y={ys - 4} width={SCREW1 - SCREW0} height="8" fill="#f3f4f6" stroke={COLORS.body} strokeWidth="1" />
        {Array.from({ length: Math.floor((SCREW1 - SCREW0) / 6) }, (_, i) => (
          <line key={i} x1={SCREW0 + 2 + i * 6} x2={SCREW0 + 6 + i * 6} y1={ys - 4} y2={ys + 4} stroke={COLORS.muted} strokeWidth="0.9" />
        ))}
        <rect x={SCREW1} y={ys - 9} width="8" height="18" fill="#9ca3af" stroke={COLORS.body} strokeWidth="1.1" />
        {/* nut carriage: rides on the screw, reaches up to the cable axis */}
        <rect x={cx - 13} y={yy - 12} width="26" height={ys - yy + 20} rx="3" fill="var(--surface, #fff)" stroke={COLORS.body} strokeWidth="1.6" />
        <rect x={cx - 9} y={ys - 6} width="18" height="12" rx="1.5" fill="#d1d5db" stroke={COLORS.body} strokeWidth="1" />
        {/* load cell */}
        <path d={zig(tip, yy, block, yy, 6, 8, 6)} fill="none" stroke={COLORS.spring} strokeWidth="2" />
        <text x={(tip + block) / 2} y={yy - 18} textAnchor="middle" className="cable-demo-label-dark">
          {label}
        </text>
        <text x="44" y={ys + 34}>
          {ctl}
        </text>
      </g>
    );
  };

  // virtual finger (bottom left): joint, link rotating clockwise with phi (drawn 25 deg up at phi = 0),
  // and a spring the link presses at phi_c, standing along the flexion direction at radius RS
  // sized so the link, the object spring and the mass stay inside the box (y 240-392) at any angle
  const FJ = { x: 90, y: 318 };
  const FL = 60;
  const RS = 44; // px, where along the link the spring touches
  const OFFSET = (-25 * Math.PI) / 180;
  const grav = lc === "gravity";
  // contact case: flexion turns the link clockwise (down); gravity case: flexion lifts it (elevation phi + beta)
  const pol = (ang: number, rr: number) =>
    grav
      ? { x: FJ.x + rr * Math.cos(ang + (beta * Math.PI) / 180), y: FJ.y - rr * Math.sin(ang + (beta * Math.PI) / 180) }
      : { x: FJ.x + rr * Math.cos(ang + OFFSET), y: FJ.y + rr * Math.sin(ang + OFFSET) };
  const tipF = pol(sim.phi, FL);
  const phiC = (phic * Math.PI) / 180;
  const nC = { x: -Math.sin(phiC + OFFSET), y: Math.cos(phiC + OFFSET) }; // flexion direction at the contact point
  // spring head, pushed by the link once touched (drawing capped so the coil never collapses)
  const sTop = pol(Math.min(Math.max(sim.phi, phiC), phiC + 12 / RS), RS);
  // gravity case: mass along the link (the drawn link stands for 100 mm), weight arrow and moment arm
  const mP = pol(sim.phi, (Math.min(lcom, 100) / 100) * FL);
  const mR = 3 + Math.sqrt(mass) * 8;
  const wLen = Math.max(4, Math.min(10 + mass * 40, 386 - (mP.y + mR))); // weight arrow, kept inside the box
  const armMm = lcom * Math.cos(sim.phi + (beta * Math.PI) / 180);
  const sBase = { x: pol(phiC, RS).x + nC.x * 30, y: pol(phiC, RS).y + nC.y * 30 };
  const sTopOff = { x: sTop.x + nC.x * 5, y: sTop.y + nC.y * 5 }; // half the link thickness

  // ---------- plots ----------
  const PW = 680;
  const PH = 230;
  const m = { l: 40, r: 10, t: 10, b: 30 };
  const keepT = 2 / f;
  const t0 = sim.t - keepT;
  const XT = (v: number) => m.l + ((v - t0) / keepT) * (PW - m.l - m.r);
  const tMax = niceCeil(Math.max(T0 * 2, ...trail.map((d) => Math.max(d[2], d[3]) * 1.1), 10));
  const tMin = Math.min(0, ...trail.map((d) => Math.min(d[2], d[3])));
  const tStep = [5, 10, 20, 25, 50, 100, 200].find((st) => (tMax - tMin) / st <= 6) ?? 500;
  const tLo = Math.floor(tMin / tStep) * tStep;
  const YT = (v: number) => PH - m.b - ((v - tLo) / (tMax - tLo)) * (PH - m.t - m.b);
  const tTicks = Array.from({ length: Math.floor((tMax - tLo) / tStep) + 1 }, (_, i) => tLo + i * tStep);
  const poly = (pts: [number, number][]) => pts.map(([a, c]) => `${a.toFixed(1)},${c.toFixed(1)}`).join(" ");
  const timeTicks = [0, 0.25, 0.5, 0.75, 1].map((s) => t0 + s * keepT);

  const Frame = ({
    children,
    title,
    xTicks,
    yTicks,
    X,
    Y,
    xLabel,
  }: {
    children: React.ReactNode;
    title: string;
    xTicks: number[];
    yTicks: number[];
    X: (v: number) => number;
    Y: (v: number) => number;
    xLabel: (v: number) => string;
  }) => (
    <figure className="dyno-fig">
      <svg className="dyno-plot dyno-plot-wide" viewBox={`0 0 ${PW} ${PH}`} role="img" aria-label={title}>
        {xTicks.map((v, i) => (
          <g key={`x${i}`}>
            <line x1={X(v)} x2={X(v)} y1={m.t} y2={PH - m.b} stroke={COLORS.grid} />
            <text x={X(v)} y={PH - m.b + 16} textAnchor="middle">
              {xLabel(v)}
            </text>
          </g>
        ))}
        {yTicks.map((v, i) => (
          <g key={`y${i}`}>
            <line x1={m.l} x2={PW - m.r} y1={Y(v)} y2={Y(v)} stroke={COLORS.grid} />
            <text x={m.l - 6} y={Y(v) + 4} textAnchor="end">
              {Math.round(v)}
            </text>
          </g>
        ))}
        {children}
      </svg>
      <figcaption>{title}</figcaption>
    </figure>
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
          <div>
            <label htmlFor={`${id}-kf`}>
              {t.kf} <strong>{kf.toFixed(2)} N·m/rad</strong>
            </label>
            <input id={`${id}-kf`} type="range" min="0" max="0.5" step="0.01" value={kf} onChange={(e) => setKf(Number(e.target.value))} />
          </div>
          <div>
            <label htmlFor={`${id}-t0`}>
              {t.T0} <strong>{T0.toFixed(0)} N</strong>
            </label>
            <input id={`${id}-t0`} type="range" min="2" max="40" step="1" value={T0} onChange={(e) => setT0(Number(e.target.value))} />
          </div>
          <div>
            <label htmlFor={`${id}-k`}>
              {t.k} <strong>{k.toFixed(0)} N/mm</strong>
            </label>
            <input id={`${id}-k`} type="range" min="2" max="50" step="1" value={k} onChange={(e) => setK(Number(e.target.value))} />
          </div>
        </div>
        <details className="cable-details">
          <summary>{t.details}</summary>
          <div className="cable-controls">
            <div>
              <label htmlFor={`${id}-D`}>
                {t.D} <strong>{D.toFixed(0)} mm</strong>
              </label>
              <input id={`${id}-D`} type="range" min="10" max="80" step="1" value={D} onChange={(e) => setD(Number(e.target.value))} />
            </div>
            <div>
              <label htmlFor={`${id}-eta`}>
                {t.eta} <strong>{(eta * 100).toFixed(1)} %</strong>
              </label>
              <input id={`${id}-eta`} type="range" min="0.8" max="1" step="0.005" value={eta} onChange={(e) => setEta(Number(e.target.value))} />
            </div>
            <div>
              <label htmlFor={`${id}-tau`}>
                {t.tau} <strong>{tau.toFixed(3)} N·m</strong>
              </label>
              <input id={`${id}-tau`} type="range" min="0" max="0.2" step="0.005" value={tau} onChange={(e) => setTau(Number(e.target.value))} />
            </div>
            <div>
              <label htmlFor={`${id}-b`}>
                {t.b} <strong>{b.toFixed(3)} N·s/mm</strong>
              </label>
              <input id={`${id}-b`} type="range" min="0" max="0.1" step="0.002" value={b} onChange={(e) => setB(Number(e.target.value))} />
            </div>
          </div>
        </details>
        <p className="cable-details-group">{t.gRun}</p>
        <div className="cable-controls">
          <div>
            <label htmlFor={`${id}-f`}>
              {t.f} <strong>{f.toFixed(2)} Hz</strong>
            </label>
            <input id={`${id}-f`} type="range" min="0.1" max="3" step="0.05" value={f} onChange={(e) => setF(Number(e.target.value))} />
          </div>
          <div>
            <label htmlFor={`${id}-a`}>
              {t.A} <strong>±{A.toFixed(0)}°</strong>
            </label>
            <input id={`${id}-a`} type="range" min="5" max="60" step="1" value={A} onChange={(e) => setA(Number(e.target.value))} />
          </div>
        </div>
        <p className="cable-details-group">{t.gObj}</p>
        <div className="can-bit-select" role="group" aria-label={t.gObj}>
          {(["contact", "gravity"] as Case[]).map((v) => (
            <button type="button" key={v} aria-pressed={lc === v} onClick={() => setLc(v)}>
              {v === "contact" ? t.contactCase : t.gravityCase}
            </button>
          ))}
        </div>
        {lc === "contact" ? (
          <div className="cable-controls">
            <div>
              <label htmlFor={`${id}-ks`}>
                {t.ks} <strong>{ks.toFixed(2)} N·m/rad</strong>
              </label>
              <input id={`${id}-ks`} type="range" min="0.1" max="5" step="0.05" value={ks} onChange={(e) => setKs(Number(e.target.value))} />
            </div>
            <div>
              <label htmlFor={`${id}-pc`}>
                {t.phic} <strong>{phic.toFixed(0)}°</strong>
              </label>
              <input id={`${id}-pc`} type="range" min="0" max="80" step="1" value={phic} onChange={(e) => setPhic(Number(e.target.value))} />
            </div>
          </div>
        ) : (
          <div className="cable-controls">
            <div>
              <label htmlFor={`${id}-m`}>
                {t.mass} <strong>{mass.toFixed(2)} kg</strong>
              </label>
              <input id={`${id}-m`} type="range" min="0" max="0.5" step="0.01" value={mass} onChange={(e) => setMass(Number(e.target.value))} />
            </div>
            <div>
              <label htmlFor={`${id}-l`}>
                {t.lcom} <strong>{lcom.toFixed(0)} mm</strong>
              </label>
              <input id={`${id}-l`} type="range" min="20" max="100" step="1" value={lcom} onChange={(e) => setLcom(Number(e.target.value))} />
            </div>
            <div>
              <label htmlFor={`${id}-beta`}>
                {t.beta} <strong>{beta.toFixed(0)}°</strong>
              </label>
              <input id={`${id}-beta`} type="range" min="-60" max="30" step="1" value={beta} onChange={(e) => setBeta(Number(e.target.value))} />
            </div>
          </div>
        )}
      </div>

      <svg className="cable-demo-svg" viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={`T_in ${sim.Tin.toFixed(1)} N, T_out ${sim.Tout.toFixed(1)} N`}>
        <defs>
          <marker id="dyno-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" orient="auto">
            <path d="M0 0 L10 5 L0 10 z" fill={COLORS.sim} />
          </marker>
          <marker id="dyno-arrow-dark" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" orient="auto">
            <path d="M0 0 L10 5 L0 10 z" fill={COLORS.body} />
          </marker>
        </defs>
        {/* real hardware boundary */}
        <rect x="300" y="12" width={VW - 308} height="210" rx="8" fill="none" stroke={COLORS.muted} strokeDasharray="6 4" />
        <text x="312" y="30" className="cable-demo-view">
          {t.real}
        </text>
        <Actuator yy={yA} tip={rodA} block={blockA} label={`T_in = ${fmt(sim.Tin)} N`} ctl={t.posCtl} />
        <Actuator yy={yB} tip={rodB} block={blockB} label={`T_out = ${fmt(sim.Tout)} N`} ctl={t.emu} />
        {/* tendon coloured by elongation: input strand + upper half of the wrap, output strand + lower half */}
        {/* pulley support: a small bracket from the shaft to a grounded wall */}
        <path d={`M${PC.x + 20} ${PC.y} L${PC.x + 70} ${PC.y - 28} L${PC.x + 70} ${PC.y + 28} Z`} fill="var(--surface, #fff)" stroke={COLORS.body} strokeWidth="1.5" />
        <line x1={PC.x + 70} x2={PC.x + 70} y1={PC.y - 40} y2={PC.y + 40} stroke={COLORS.body} strokeWidth="2" />
        {Array.from({ length: 8 }, (_, i) => (
          <line key={i} x1={PC.x + 70} x2={PC.x + 80} y1={PC.y - 36 + i * 10} y2={PC.y - 44 + i * 10} stroke={COLORS.body} strokeWidth="1.1" />
        ))}
        {/* pulley on a ball bearing: rim and web turn with the cable, the balls (cage) at about half that angle,
            the inner race and shaft are fixed to the support */}
        <circle cx={PC.x} cy={PC.y} r={RP - 2} fill="var(--surface, #fff)" stroke={COLORS.body} strokeWidth="2" />
        <circle cx={PC.x} cy={PC.y} r={RP - 9} fill="none" stroke={COLORS.muted} strokeWidth="1" />
        <line x1={PC.x + 27 * Math.cos(((90 + phiDraw) * Math.PI) / 180)} y1={PC.y - 27 * Math.sin(((90 + phiDraw) * Math.PI) / 180)} x2={spoke.x} y2={spoke.y} stroke={COLORS.muted} strokeWidth="2" strokeDasharray="4 3" />
        <circle cx={PC.x} cy={PC.y} r="26" fill="#e5e7eb" stroke={COLORS.body} strokeWidth="1.6" />
        <circle cx={PC.x} cy={PC.y} r="22" fill="var(--surface, #fff)" stroke={COLORS.body} strokeWidth="1" />
        {Array.from({ length: 9 }, (_, i) => {
          const a = ((phiDraw / 2 + i * 40) * Math.PI) / 180;
          return <circle key={i} cx={PC.x + 17.5 * Math.cos(a)} cy={PC.y - 17.5 * Math.sin(a)} r="4" fill="#9ca3af" stroke={COLORS.body} strokeWidth="0.8" />;
        })}
        <circle cx={PC.x} cy={PC.y} r="13" fill="#e5e7eb" stroke={COLORS.body} strokeWidth="1" />
        <circle cx={PC.x} cy={PC.y} r="7" fill="#6b7280" stroke={COLORS.body} strokeWidth="1" />
        <path d={`M${blockA} ${yA} L${PC.x} ${yA} A${RP} ${RP} 0 0 1 ${PC.x + RP} ${PC.y}`} fill="none" stroke={shade(eIn)} strokeWidth="4" />
        <path d={`M${PC.x + RP} ${PC.y} A${RP} ${RP} 0 0 1 ${PC.x} ${yB} L${blockB} ${yB}`} fill="none" stroke={shade(eOut)} strokeWidth="4" />
        {/* cable termination: a dot where the tendon is fixed to the load cell */}
        {[
          [blockA, yA],
          [blockB, yB],
        ].map(([bx, by], i) => (
          <circle key={i} cx={bx} cy={by} r="5" fill={COLORS.body} />
        ))}

        {/* colour scale */}
        <defs>
          <linearGradient id="dyno-elong" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor={shade(0)} />
            <stop offset="1" stopColor={shade(E_MAX)} />
          </linearGradient>
        </defs>
        <rect x={VW - 170} y="200" width="110" height="8" fill="url(#dyno-elong)" />
        <text x={VW - 176} y="208" textAnchor="end" className="cable-demo-view">
          {t.elong}
        </text>
        <text x={VW - 170} y="219" textAnchor="middle" className="cable-demo-view">
          0
        </text>
        <text x={VW - 60} y="219" textAnchor="middle" className="cable-demo-view">
          {E_MAX} mm
        </text>

        {/* virtual finger + spring */}
        <rect x="16" y="240" width="292" height={VH - 248} rx="8" fill="none" stroke={COLORS.sim} strokeDasharray="6 4" />
        <text x="28" y="256" className="cable-demo-view">
          {t.virt}
        </text>
        {!grav && (
          <g>
            <path d={zig(sBase.x, sBase.y, sTopOff.x, sTopOff.y, 6, 6, 4)} fill="none" stroke={COLORS.obj} strokeWidth="2" />
            <line x1={sBase.x - nC.y * 16} y1={sBase.y + nC.x * 16} x2={sBase.x + nC.y * 16} y2={sBase.y - nC.x * 16} stroke={COLORS.body} strokeWidth="2" />
            {Array.from({ length: 5 }, (_, i) => {
              const s = -14 + i * 7;
              const ax = sBase.x + nC.y * s;
              const ay = sBase.y - nC.x * s;
              return <line key={i} x1={ax} y1={ay} x2={ax + nC.x * 7 - nC.y * 5} y2={ay + nC.y * 7 + nC.x * 5} stroke={COLORS.body} strokeWidth="1.1" />;
            })}
          </g>
        )}
        {grav && (
          <g>
            <line x1={FJ.x - 30} x2={FJ.x + FL + 20} y1={FJ.y} y2={FJ.y} stroke={COLORS.grid} strokeWidth="1.5" />
            <line x1={FJ.x} y1={FJ.y} x2={mP.x} y2={FJ.y} stroke={COLORS.body} strokeWidth="1.4" strokeDasharray="4 3" />
            <line x1={mP.x} y1={mP.y} x2={mP.x} y2={FJ.y} stroke={COLORS.muted} strokeWidth="1" strokeDasharray="2 3" />
            {/* label on the side of the horizontal away from the link */}
            <text x={(FJ.x + mP.x) / 2} y={mP.y > FJ.y ? FJ.y - 8 : FJ.y + 16} textAnchor="middle" className="cable-demo-view">
              {armMm.toFixed(0)} mm
            </text>
          </g>
        )}
        <line x1={FJ.x} y1={FJ.y} x2={tipF.x} y2={tipF.y} stroke={COLORS.sim} strokeWidth="9" strokeLinecap="round" opacity="0.85" />
        <circle cx={FJ.x} cy={FJ.y} r="6" fill={COLORS.body} />
        {grav && mass > 0 && (
          <g>
            <circle cx={mP.x} cy={mP.y} r={mR} fill={COLORS.body} />
            <line x1={mP.x} y1={mP.y + mR} x2={mP.x} y2={mP.y + mR + wLen} stroke={COLORS.body} strokeWidth="2.2" markerEnd="url(#dyno-arrow-dark)" />
            <text x={mP.x + 8} y={mP.y + mR + wLen} className="cable-demo-view">
              m g
            </text>
          </g>
        )}
        {/* HIL loop: the finger angle drives the emulator */}
        <path d={`M308 310 L335 310 L335 ${yB + 52} L300 ${yB + 52}`} fill="none" stroke={COLORS.sim} strokeWidth="1.4" strokeDasharray="4 3" markerEnd="url(#dyno-arrow)" />
        <text x="345" y="314" className="cable-demo-view">
          {t.loop}
        </text>
      </svg>

      <div className="dyno-row">
        <Frame title={t.plot1} xTicks={timeTicks} yTicks={tTicks} X={XT} Y={YT} xLabel={(v) => `${(v - sim.t).toFixed(1)}s`}>
          <line x1={m.l} x2={PW - m.r} y1={YT(T0)} y2={YT(T0)} stroke={COLORS.muted} strokeDasharray="4 4" />
          <polyline points={poly(trail.map((d) => [XT(d[0]), YT(d[2])]))} fill="none" stroke={COLORS.tin} strokeWidth="1.8" />
          <polyline points={poly(trail.map((d) => [XT(d[0]), YT(d[3])]))} fill="none" stroke={COLORS.tout} strokeWidth="1.8" />
        </Frame>
      </div>
      <div className="cable-demo-buttons">
        <button className="signal-reset" type="button" onClick={() => setPlaying((v) => !v)}>
          {playing ? t.stop : t.start}
        </button>
        <button className="signal-reset" type="button" onClick={() => setTrail([])}>
          {t.clear}
        </button>
      </div>
      <p className="demo-model-note">{t.note}</p>
    </section>
  );
}
