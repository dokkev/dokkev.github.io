import { useEffect, useRef, useState, type ReactNode } from "react";

// Concept model of a 2-pole surface-mounted PM motor in per-unit.
// Electrical (rotor dq frame):  v_d = R i_d + L di_d/dt - w_e L i_q
//                               v_q = R i_q + L di_q/dt + w_e L i_d + w_e lambda
// Current loop: PI + back-EMF feedforward in the controller frame (theta_hat = theta + delta),
// voltage vector clipped to the bus limit |v| <= V_bus.
// Mechanical: J dw/dt = K_t i_q - B w - tau_load.
// 6-step uses the same current loop with a block (two-phase) current command.

type Mode = "foc" | "six";
type Lang = "ko" | "en";

const DEG = Math.PI / 180;
const OMEGA_BASE = 2 * Math.PI * 0.75; // electrical rad/s shown at 1 pu speed
const P_LAMBDA = 1 / OMEGA_BASE;
const P = { R: 0.25, L: 0.08, lambda: 1 / OMEGA_BASE, J: 1.2, B: 0.03, wc: 40 };
const WINDOW = 3; // seconds of history
const COLORS = { a: "#c2410c", b: "#2563eb", c: "#15803d", vec: "#202725", d: "#6b7280", q: "#17695b", w: "#7c3aed", v: "#b45309" };

const text = {
  ko: {
    eyebrow: "직접 조작 · BLDC 구동 방식",
    title: "전류 명령, 측정 전류와 역기전력",
    foc: "FOC",
    six: "6-step",
    iq: "토크 전류 명령 i_q*",
    id: "자속 전류 명령 i_d*",
    delta: "전기각 오차 δ",
    load: "부하 토크",
    vbus: "DC 버스 전압",
    play: "재생",
    pause: "정지",
    reset: "정지 상태에서 다시 시작",
    phase: "상 전류 i_a, i_b, i_c",
    dq: "i_q 명령(점선)과 측정값, i_d",
    speed: "속도 ω와 전압 사용률 |v|/V_bus",
    iqCmd: "i_q 명령",
    iqMeas: "i_q 측정",
    idMeas: "i_d 측정",
    w: "속도 ω",
    vuse: "전압 사용률",
    sat: "전압 포화",
    x: "시간 [s]",
    rotorD: "d축 (로터 N극)",
    rotorQ: "q축",
    estQ: "추정 q축",
    plane: "로터 좌표계(d–q) 벡터",
    iCmdV: "전류 명령 i*",
    iMeasV: "측정 전류 i",
    planeI: "전류",
    planeV: "전압",
    restV: "나머지 전압 (전류를 미는 몫)",
    emfV: "역기전력 ω_eλ",
    limitV: "전압 한계 V_bus",
    aria: "3상 스테이터 코일, 영구자석 로터, 합성 전류 벡터와 d·q축을 보여 주는 모터 단면",
    notesTitle: "관찰할 점",
    notes: [
      "부하 토크는 로터에 닿은 브레이크 패드로 표시하고, 불꽃의 양은 마찰로 사라지는 동력(부하 × 속도)에 비례합니다. 부하가 있으면 측정 i_q가 부하와 같아지는 속도에서 평형을 이룹니다.",
      "i_d*를 음수로 주면 ω_e L i_d 항이 역기전력 일부를 상쇄해(약계자) 더 높은 속도까지 전류를 유지합니다.",
      "각 코일은 전류 방향에 따라 로터 쪽 면이 N극이나 S극이 되는 전자석이어서 가까운 로터 극을 당기거나 밉니다. FOC에서는 상별 토크 기여 τ_k = (2/3) I sin²(θ_k − θ)가 항상 0 이상이라, 세 코일이 같은 방향으로 토크를 보태고 합이 일정합니다.",
      "6-step에서는 한 코일이 쉬고 전류 벡터가 60°마다 건너뛰어 토크가 출렁입니다.",
      "전기각 오차 δ가 있으면 같은 크기의 전류로 내는 토크가 cos δ배로 줄고, 그만큼 i_d가 생깁니다.",
    ],
    note:
      "2극 표면부착형 영구자석 모터의 개념 모델입니다. 전류 제어기는 PI와 역기전력 피드포워드로 전압을 정하고, 전압 벡터의 크기를 DC 버스 전압으로 제한합니다. 모든 값은 정격 대비 단위이며 실측이 아닙니다. 속도 1은 역기전력이 버스 전압 1과 같아지는 속도입니다.",
  },
  en: {
    eyebrow: "Try it · Driving a BLDC motor",
    title: "Current command, measured current and back-EMF",
    foc: "FOC",
    six: "6-step",
    iq: "Torque current command i_q*",
    id: "Flux current command i_d*",
    delta: "Electrical angle error δ",
    load: "Load torque",
    vbus: "DC bus voltage",
    play: "Play",
    pause: "Pause",
    reset: "Restart from standstill",
    phase: "Phase currents i_a, i_b, i_c",
    dq: "i_q command (dashed) and measured, i_d",
    speed: "Speed ω and voltage use |v|/V_bus",
    iqCmd: "i_q command",
    iqMeas: "i_q measured",
    idMeas: "i_d measured",
    w: "Speed ω",
    vuse: "Voltage use",
    sat: "voltage saturated",
    x: "Time [s]",
    rotorD: "d axis (rotor N)",
    rotorQ: "q axis",
    estQ: "estimated q",
    plane: "Rotor-frame (d–q) vectors",
    iCmdV: "current command i*",
    iMeasV: "measured current i",
    planeI: "Current",
    planeV: "Voltage",
    restV: "remaining voltage (drives the current)",
    emfV: "back-EMF ω_eλ",
    limitV: "voltage limit V_bus",
    aria: "Motor cross-section with three stator coils, a permanent-magnet rotor, the resultant current vector and the d-q axes",
    notesTitle: "What to look for",
    notes: [
      "The load torque is drawn as a brake pad on the rotor; the amount of sparks follows the power lost to friction (load × speed). With a load, the speed settles where the measured i_q equals the load.",
      "A negative i_d* lets the ω_e L i_d term cancel part of the back-EMF (flux weakening), so current holds to a higher speed.",
      "Each coil is an electromagnet whose rotor-facing side becomes N or S with the current direction, pulling or pushing the nearest rotor pole. In FOC the per-phase torque τ_k = (2/3) I sin²(θ_k − θ) is never negative, so all three coils add torque in the same direction and the sum stays constant.",
      "In 6-step one coil rests and the current vector jumps every 60°, so torque ripples.",
      "An electrical angle error δ scales the torque from the same current magnitude by cos δ and creates an equal share of i_d.",
    ],
    note:
      "Concept model of a 2-pole surface-mounted PM motor. The current loop sets the voltage with PI control and back-EMF feedforward, and clips the voltage vector to the DC bus voltage. All values are per-unit, not measurements. Speed 1 is where the back-EMF equals a bus voltage of 1.",
  },
};

interface Sim {
  t: number;
  theta: number; // true electrical angle [rad]
  w: number; // speed [pu]
  id: number;
  iq: number; // true rotor-frame currents
  xd: number;
  xq: number; // PI integrators (controller frame)
  vuse: number;
  sat: boolean;
  iqCmdNow: number; // command expressed in the true rotor frame
  idCmdNow: number;
  vd: number;
  vq: number; // applied voltage in the true rotor frame
}
interface Sample {
  t: number;
  ia: number;
  ib: number;
  ic: number;
  id: number;
  iq: number;
  iqCmd: number;
  w: number;
  vuse: number;
}
interface Inputs {
  mode: Mode;
  idCmd: number;
  iqCmd: number;
  delta: number;
  load: number;
  vbus: number;
}

// Grinder-style sparks at a brake pad pressed on the rotor (load visualization).
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // remaining seconds
  max: number;
}
const PAD_ANGLE = 300 * DEG; // between coils c (240 deg) and a (0 deg)
const MOTOR_C = 150;
const padPoint = (r: number): [number, number] => [MOTOR_C + r * Math.cos(PAD_ANGLE), MOTOR_C - r * Math.sin(PAD_ANGLE)];

const rot = (x: number, y: number, a: number): [number, number] => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
const fresh = (): Sim => ({ t: 0, theta: 30 * DEG, w: 0, id: 0, iq: 0, xd: 0, xq: 0, vuse: 0, sat: false, iqCmdNow: 0, idCmdNow: 0, vd: 0, vq: 0 });

// Command current vector in the stationary frame.
function commandAlphaBeta(s: Sim, u: Inputs): [number, number] {
  const est = s.theta + u.delta;
  if (u.mode === "foc") return rot(u.idCmd, u.iqCmd, est);
  const wrapped = (((est + 30 * DEG) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const phi = (60 * Math.floor(wrapped / (60 * DEG)) + 90) * DEG; // one of six two-phase vectors, 60-120 deg ahead
  const mag = (2 / Math.sqrt(3)) * u.iqCmd;
  return [mag * Math.cos(phi), mag * Math.sin(phi)];
}

function step(s: Sim, u: Inputs, dt: number) {
  const we = OMEGA_BASE * s.w;
  const est = s.theta + u.delta;
  const [ca, cb] = commandAlphaBeta(s, u);
  const [cd, cq] = rot(ca, cb, -est); // command in the controller frame
  const [ia, ib] = rot(s.id, s.iq, s.theta);
  const [md, mq] = rot(ia, ib, -est); // measurement in the controller frame
  const ed = cd - md;
  const eq = cq - mq;
  // PI (bandwidth wc, zero at R/L) + decoupling and back-EMF feedforward
  let vd = P.L * P.wc * ed + P.R * P.wc * s.xd - we * P.L * mq;
  let vq = P.L * P.wc * eq + P.R * P.wc * s.xq + we * P.L * md + we * P.lambda;
  const mag = Math.hypot(vd, vq);
  const sat = mag > u.vbus;
  if (sat) {
    vd *= u.vbus / mag;
    vq *= u.vbus / mag;
  } else {
    s.xd += ed * dt; // anti-windup: integrate only while not saturated
    s.xq += eq * dt;
  }
  const [va, vb] = rot(vd, vq, est);
  const [Vd, Vq] = rot(va, vb, -s.theta); // applied voltage in the true rotor frame
  s.id += ((Vd - P.R * s.id + we * P.L * s.iq) / P.L) * dt;
  s.iq += ((Vq - P.R * s.iq - we * P.L * s.id - we * P.lambda) / P.L) * dt;
  const tau = s.iq; // K_t = 1 pu
  const load = u.load * Math.tanh(s.w / 0.02);
  s.w += ((tau - P.B * s.w - load) / P.J) * dt;
  if (s.w < 0 && u.load >= Math.abs(tau)) s.w = 0; // the load does not drive the rotor backwards
  s.theta = (s.theta + OMEGA_BASE * s.w * dt) % (4 * Math.PI);
  s.t += dt;
  s.vuse = Math.min(mag, u.vbus) / u.vbus;
  s.sat = sat;
  [s.idCmdNow, s.iqCmdNow] = rot(ca, cb, -s.theta);
  s.vd = Vd;
  s.vq = Vq;
}

function sample(s: Sim): Sample {
  const [al, be] = rot(s.id, s.iq, s.theta);
  return {
    t: s.t,
    ia: al,
    ib: -al / 2 + (Math.sqrt(3) / 2) * be,
    ic: -al / 2 - (Math.sqrt(3) / 2) * be,
    id: s.id,
    iq: s.iq,
    iqCmd: s.iqCmdNow,
    w: s.w,
    vuse: s.vuse,
  };
}

// "i_q*" -> i<sub>q</sub>*  (HTML) or tspan subscript (SVG)
const SUB = /([A-Za-zωθτ])_([a-zαβ]+)/g;
function rich(str: string, svg = false) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of str.matchAll(SUB)) {
    out.push(str.slice(last, m.index!), m[1]);
    out.push(
      svg ? (
        <tspan key={m.index} baselineShift="sub" fontSize="75%">
          {m[2]}
        </tspan>
      ) : (
        <sub key={m.index}>{m[2]}</sub>
      )
    );
    last = m.index! + m[0].length;
  }
  out.push(str.slice(last));
  return out;
}
const fmt = (v: number) => (Math.abs(v) < 0.005 ? "0.00" : v.toFixed(2));

export default function FocDemo({ lang = "ko" }: { lang?: Lang }) {
  const t = text[lang];
  const [mode, setMode] = useState<Mode>("foc");
  const [iqCmd, setIq] = useState(0.8);
  const [idCmd, setId] = useState(0);
  const [deltaDeg, setDelta] = useState(0);
  const [load, setLoad] = useState(0);
  const [vbus, setVbus] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [, setFrame] = useState(0);
  const sim = useRef<Sim>(fresh());
  const hist = useRef<Sample[]>([sample(sim.current)]);
  const sparks = useRef<Spark[]>([]);
  const sparkDebt = useRef(0);
  const inputs = useRef<Inputs>({ mode, idCmd, iqCmd, delta: 0, load, vbus });
  inputs.current = { mode, idCmd: mode === "foc" ? idCmd : 0, iqCmd, delta: deltaDeg * DEG, load, vbus };

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) setPlaying(true);
  }, []);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last: number | undefined;
    let nextSample = sim.current.t;
    const tick = (now: number) => {
      const elapsed = last === undefined ? 0 : Math.min(0.05, (now - last) / 1000);
      last = now;
      const n = Math.round(elapsed / 0.0005);
      for (let k = 0; k < n; k++) {
        step(sim.current, inputs.current, 0.0005);
        if (sim.current.t >= nextSample) {
          hist.current.push(sample(sim.current));
          nextSample = sim.current.t + 0.01;
        }
      }
      const cutoff = sim.current.t - WINDOW;
      while (hist.current.length > 2 && hist.current[0].t < cutoff) hist.current.shift();
      // sparks: emission rate follows the friction power load * |speed|
      const u = inputs.current;
      const w = sim.current.w;
      sparkDebt.current += elapsed * 520 * u.load * Math.min(1.2, Math.abs(w));
      const [px, py] = padPoint(71);
      const dir = Math.sign(w) || 1;
      while (sparkDebt.current >= 1) {
        sparkDebt.current -= 1;
        const spread = (Math.random() - 0.5) * 0.9;
        const speed = 160 + Math.random() * 240 * Math.min(1.2, Math.abs(w) + 0.2);
        // surface moves counter-clockwise for positive speed: screen tangent (-sin, -cos)
        const tx = -Math.sin(PAD_ANGLE) * dir;
        const ty = -Math.cos(PAD_ANGLE) * dir;
        const ox = Math.cos(PAD_ANGLE);
        const oy = -Math.sin(PAD_ANGLE);
        const vx = speed * (tx * Math.cos(spread) - ty * Math.sin(spread)) + ox * 40 * Math.random();
        const vy = speed * (tx * Math.sin(spread) + ty * Math.cos(spread)) + oy * 40 * Math.random();
        const max = 0.3 + Math.random() * 0.4;
        sparks.current.push({ x: px, y: py, vx, vy, life: max, max });
      }
      for (const p of sparks.current) {
        p.vy += 420 * elapsed; // gravity in screen pixels
        p.vx *= 1 - 1.5 * elapsed;
        p.x += p.vx * elapsed;
        p.y += p.vy * elapsed;
        p.life -= elapsed;
      }
      sparks.current = sparks.current.filter((p) => p.life > 0 && Math.hypot(p.x - MOTOR_C, p.y - MOTOR_C) < 140).slice(-260);
      setFrame((f) => f + 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const reset = () => {
    sim.current = fresh();
    hist.current = [sample(sim.current)];
    sparks.current = [];
    setFrame((f) => f + 1);
  };

  const s = sim.current;
  const now = sample(s);
  const theta = s.theta;
  const delta = deltaDeg * DEG;

  // ---- motor cross-section ----
  const C = 150;
  const pt = (ang: number, r: number) => [C + r * Math.cos(ang), C - r * Math.sin(ang)];
  const arrow = (ang: number, len: number, color: string, width = 3, dash?: string, key?: string) => {
    const [x, y] = pt(ang, len);
    return <line key={key} x1={C} y1={C} x2={x} y2={y} stroke={color} strokeWidth={width} strokeDasharray={dash} markerEnd={`url(#foc-arrow-${color.slice(1)})`} />;
  };
  const [al, be] = rot(s.id, s.iq, theta);
  const vecLen = Math.hypot(al, be);
  const vecAng = Math.atan2(be, al);
  const phases: [keyof typeof COLORS, number, number][] = [
    ["a", 0, now.ia],
    ["b", 120 * DEG, now.ib],
    ["c", 240 * DEG, now.ic],
  ];
  // Each coil is an electromagnet. Positive phase current points its field toward the
  // coil, so the coil face toward the rotor is an S pole (N for negative current).
  // Torque from phase k: tau_k = (2/3) i_k sin(theta_k - theta); the three sum to i_q.
  const contrib = phases.map(([name, ang, i]) => {
    const tau = (2 / 3) * i * Math.sin(ang - theta);
    return { name, ang, i, tau } as const;
  });
  const tangent = (ang: number, tau: number, color: string, key: string) => {
    const r = 76;
    const [x, y] = pt(ang, r);
    const dir = Math.sign(tau);
    const len = Math.min(1, Math.abs(tau) * 2.2) * 46;
    // CCW tangent in screen coordinates
    const tx = -Math.sin(ang) * dir;
    const ty = -Math.cos(ang) * dir;
    return <line key={key} x1={x} y1={y} x2={x + tx * len} y2={y + ty * len} stroke={color} strokeWidth={3} markerEnd={`url(#foc-arrow-${color.slice(1)})`} />;
  };
  const markers = [COLORS.a, COLORS.b, COLORS.c, COLORS.vec, COLORS.q, COLORS.d, COLORS.v, COLORS.w].map((c) => (
    <marker key={c} id={`foc-arrow-${c.slice(1)}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill={c} />
    </marker>
  ));

  // ---- time charts ----
  const W = 420;
  const H = 112;
  const t1 = Math.max(WINDOW, s.t);
  const t0 = t1 - WINDOW;
  const X = (tt: number) => 34 + ((tt - t0) / WINDOW) * (W - 44);
  const chart = (lo: number, hi: number) => (v: number) => H - 14 - ((v - lo) / (hi - lo)) * (H - 24);
  const Yi = chart(-1.25, 1.25);
  const Yw = chart(-0.1, 1.6);
  const poly = (key: keyof Sample, Y: (v: number) => number, color: string, dash?: string) => (
    <polyline
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeDasharray={dash}
      points={hist.current.map((h) => `${X(h.t).toFixed(1)},${Y(h[key]).toFixed(1)}`).join(" ")}
    />
  );
  const axes = (Y: (v: number) => number, ticks: number[]) => (
    <g className="foc-axes">
      <line x1={34} x2={W - 10} y1={Y(0)} y2={Y(0)} />
      <line x1={34} x2={34} y1={6} y2={H - 12} />
      {ticks.map((v) => (
        <text key={v} x={28} y={Y(v) + 4} textAnchor="end">
          {v}
        </text>
      ))}
      {[0, 1, 2, 3].map((k) => (
        <text key={k} x={X(Math.ceil(t0) + k)} y={H - 1} textAnchor="middle">
          {(Math.ceil(t0) + k).toFixed(0)}
        </text>
      ))}
    </g>
  );

  return (
    <section className="signal-demo foc-demo" aria-label={t.title}>
      <header className="signal-demo-heading">
        <span className="eyebrow">{t.eyebrow}</span>
        <h3>{t.title}</h3>
      </header>

      <div className="can-bit-select" role="group" aria-label="mode">
        {(["foc", "six"] as Mode[]).map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
            {t[m]}
          </button>
        ))}
        <button type="button" className="foc-play" onClick={() => setPlaying((p) => !p)}>
          {playing ? t.pause : t.play}
        </button>
        <button type="button" onClick={reset}>
          {t.reset}
        </button>
      </div>

      <div className="foc-layout">
        <div className="foc-motor-col">
        <svg className="foc-motor" viewBox="0 0 300 336" role="img" aria-label={t.aria}>
          <defs>
            {markers}
            <radialGradient id="foc-glow">
              <stop offset="0%" stopColor="#fff7c2" stopOpacity={1} />
              <stop offset="45%" stopColor="#fbbf24" stopOpacity={0.7} />
              <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
            </radialGradient>
          </defs>
          <circle cx={C} cy={C} r={142} fill="#f4f5f2" stroke="#c9ccc4" strokeWidth={10} />
          {phases.map(([name, ang, i]) => {
            const [x, y] = pt(ang, 118);
            return (
              <g key={name}>
                <rect
                  x={x - 16}
                  y={y - 24}
                  width={32}
                  height={48}
                  rx={4}
                  transform={`rotate(${-ang / DEG} ${x} ${y})`}
                  fill={COLORS[name]}
                  fillOpacity={0.12 + 0.75 * Math.min(1, Math.abs(i))}
                  stroke={COLORS[name]}
                  strokeWidth={1.5}
                />
                <text x={pt(ang, 124)[0]} y={pt(ang, 124)[1] + 5} textAnchor="middle" className="foc-coil-label">
                  {name}
                </text>
                {Math.abs(i) >= 0.03 && (
                  <text
                    x={pt(ang, 102)[0]}
                    y={pt(ang, 102)[1] + 4}
                    textAnchor="middle"
                    className="foc-coil-pole"
                    fill={i >= 0 ? "#3f63a8" : "#b4493a"}
                  >
                    {i >= 0 ? "S" : "N"}
                  </text>
                )}
              </g>
            );
          })}
          {load > 0 && (
            <g>
              <title>{t.load}</title>
              <rect
                x={padPoint(77)[0] - 6}
                y={padPoint(77)[1] - 11}
                width={12}
                height={22}
                rx={2}
                transform={`rotate(${-PAD_ANGLE / DEG} ${padPoint(77)[0]} ${padPoint(77)[1]})`}
                fill="#4b5563"
                fillOpacity={0.35 + 0.55 * load}
              />
            </g>
          )}
          <g transform={`rotate(${-theta / DEG} ${C} ${C})`}>
            <path d={`M${C} ${C - 70} A70 70 0 0 1 ${C} ${C + 70} Z`} fill="#e7b3a8" />
            <path d={`M${C} ${C + 70} A70 70 0 0 1 ${C} ${C - 70} Z`} fill="#a9bfe0" />
            <text x={C + 38} y={C + 6} textAnchor="middle" className="foc-pole">
              N
            </text>
            <text x={C - 38} y={C + 6} textAnchor="middle" className="foc-pole">
              S
            </text>
          </g>
          {load > 0 && Math.abs(s.w) > 0.02 && (
            <circle
              cx={padPoint(71)[0]}
              cy={padPoint(71)[1]}
              r={8 + 10 * Math.min(1, load * Math.abs(s.w) * 2)}
              fill="url(#foc-glow)"
              opacity={Math.min(1, 0.3 + load * Math.abs(s.w) * 1.5)}
            />
          )}
          <g className="foc-sparks">
            {sparks.current.map((p, k) => {
              const f = p.life / p.max;
              const len = 0.04;
              return (
                <line
                  key={k}
                  x1={p.x}
                  y1={p.y}
                  x2={p.x - p.vx * len}
                  y2={p.y - p.vy * len}
                  stroke={f > 0.6 ? "#fef08a" : f > 0.3 ? "#fbbf24" : "#f97316"}
                  strokeOpacity={Math.min(1, 0.35 + f)}
                  strokeWidth={f > 0.5 ? 2.2 : 1.6}
                  strokeLinecap="round"
                />
              );
            })}
          </g>
          {arrow(theta, 104, COLORS.d, 1.5, "4 4", "d")}
          {arrow(theta + 90 * DEG, 104, COLORS.q, 1.5, "4 4", "q")}
          {deltaDeg !== 0 && arrow(theta + delta + 90 * DEG, 104, COLORS.q, 1, "1 4", "qhat")}
          {contrib.map((c) => (Math.abs(c.tau) > 0.01 ? tangent(c.ang, c.tau, COLORS[c.name], `f${c.name}`) : null))}
          {(() => {
            const [ca, cb] = rot(s.idCmdNow, s.iqCmdNow, theta);
            const l = Math.hypot(ca, cb);
            return l > 0.02 ? arrow(Math.atan2(cb, ca), l * 70, COLORS.vec, 2, "5 4", "cmd") : null;
          })()}
          {vecLen > 0.02 && arrow(vecAng, vecLen * 70, COLORS.vec, 4, undefined, "vec")}
          <text x={150} y={314} textAnchor="middle" className="foc-legend" fill={COLORS.q}>
            - - {t.rotorQ}
            {deltaDeg !== 0 ? ` · ··· ${t.estQ}` : ""}
          </text>
          <text x={150} y={330} textAnchor="middle" className="foc-legend" fill={COLORS.d}>
            - - {t.rotorD}
          </text>
        </svg>
        <div className="foc-plane">
          <div className="foc-chart-title">{t.plane}</div>
          <div className="foc-plane-pair">
            {(() => {
              const panel = (title: string, k: number, body: (P: (d: number, q: number) => number[]) => ReactNode, circle?: number) => {
                const O = [75, 92];
                const P = (d: number, q: number) => [O[0] + d * k, O[1] - q * k];
                return (
                  <figure>
                    <svg viewBox="0 0 150 170" role="img" aria-label={title}>
                      {circle !== undefined && <circle cx={O[0]} cy={O[1]} r={circle * k} fill="none" stroke={COLORS.v} strokeOpacity={0.55} strokeDasharray="3 3" />}
                      <line x1={6} x2={144} y1={O[1]} y2={O[1]} stroke="#c9ccc4" />
                      <line x1={O[0]} x2={O[0]} y1={164} y2={8} stroke="#c9ccc4" />
                      <text x={142} y={O[1] - 4} className="foc-plane-axis" textAnchor="end">d</text>
                      <text x={O[0] + 5} y={16} className="foc-plane-axis">q</text>
                      {body(P)}
                    </svg>
                    <figcaption>{title}</figcaption>
                  </figure>
                );
              };
              const seg = (P: (d: number, q: number) => number[], from: [number, number], d: number, q: number, color: string, w: number, dash?: string) => {
                if (Math.hypot(d, q) < 0.02) return null;
                const [x1, y1] = P(from[0], from[1]);
                const [x2, y2] = P(from[0] + d, from[1] + q);
                return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={w} strokeDasharray={dash} markerEnd={`url(#foc-arrow-${color.slice(1)})`} />;
              };
              const emf = OMEGA_BASE * s.w * P_LAMBDA;
              return (
                <>
                  {panel(t.planeI, 58, (P) => (
                    <>
                      {seg(P, [0, 0], s.idCmdNow, s.iqCmdNow, COLORS.q, 2, "5 4")}
                      {seg(P, [0, 0], s.id, s.iq, COLORS.vec, 3.5)}
                    </>
                  ))}
                  {panel(t.planeV, 46, (P) => (
                    <>
                      {seg(P, [0, 0], 0, emf, COLORS.w, 3)}
                      {seg(P, [0, emf], s.vd, s.vq - emf, COLORS.v, 3)}
                    </>
                  ), vbus)}
                </>
              );
            })()}
          </div>
          <div className="foc-plane-legend">
            <span style={{ color: COLORS.q }}>- - {t.iCmdV}</span>
            <span style={{ color: COLORS.vec }}>━ {t.iMeasV}</span>
            <span style={{ color: COLORS.w }}>━ {rich(t.emfV)}</span>
            <span style={{ color: COLORS.v }}>━ {t.restV}</span>
            <span style={{ color: COLORS.v }}>◌ {rich(t.limitV)}</span>
          </div>
        </div>
        </div>

        <div className="foc-charts">
          <div className="foc-chart-title">{rich(t.phase)}</div>
          <svg viewBox={`0 0 ${W} ${H}`} className="foc-chart" role="img" aria-label={t.phase.replace(/_/g, "")}>
            {axes(Yi, [1, -1])}
            {poly("ia", Yi, COLORS.a)}
            {poly("ib", Yi, COLORS.b)}
            {poly("ic", Yi, COLORS.c)}
          </svg>
          <div className="foc-chart-title">{rich(t.dq)}</div>
          <svg viewBox={`0 0 ${W} ${H}`} className="foc-chart" role="img" aria-label={t.dq.replace(/_/g, "")}>
            {axes(Yi, [1, -1])}
            {poly("iqCmd", Yi, COLORS.q, "5 4")}
            {poly("iq", Yi, COLORS.q)}
            {poly("id", Yi, COLORS.d)}
          </svg>
          <div className="foc-chart-title">{rich(t.speed)}</div>
          <svg viewBox={`0 0 ${W} ${H}`} className="foc-chart" role="img" aria-label={t.speed.replace(/_/g, "")}>
            {axes(Yw, [1])}
            <line x1={34} x2={W - 10} y1={Yw(1)} y2={Yw(1)} stroke={COLORS.v} strokeOpacity={0.35} strokeDasharray="2 3" />
            {poly("w", Yw, COLORS.w)}
            {poly("vuse", Yw, COLORS.v, "5 3")}
            <text x={W - 12} y={Yw(now.w) + 14} textAnchor="end" fill={COLORS.w} className="foc-chart-tag">
              ω
            </text>
            <text x={W - 40} y={Yw(now.vuse) - 6} textAnchor="end" fill={COLORS.v} className="foc-chart-tag">
              |v|/V
            </text>
          </svg>
          <div className="foc-x-label">{t.x}</div>
        </div>
      </div>

      <div className="foc-controls">
        <div className="foc-control">
          <label>
            <span>{rich(t.iq)}</span> <strong>{iqCmd.toFixed(2)}</strong>
          </label>
          <input type="range" min={0} max={1} step={0.05} value={iqCmd} onChange={(e) => setIq(+e.target.value)} />
        </div>
        {mode === "foc" && (
          <div className="foc-control">
            <label>
              <span>{rich(t.id)}</span> <strong>{idCmd.toFixed(2)}</strong>
            </label>
            <input type="range" min={-1} max={0} step={0.05} value={idCmd} onChange={(e) => setId(+e.target.value)} />
          </div>
        )}
        <div className="foc-control">
          <label>
            {t.load} <strong>{load.toFixed(2)}</strong>
          </label>
          <input type="range" min={0} max={1} step={0.05} value={load} onChange={(e) => setLoad(+e.target.value)} />
        </div>
        <div className="foc-control">
          <label>
            {t.vbus} <strong>{vbus.toFixed(2)}</strong>
          </label>
          <input type="range" min={0.5} max={1.5} step={0.05} value={vbus} onChange={(e) => setVbus(+e.target.value)} />
        </div>
        <div className="foc-control">
          <label>
            {t.delta} <strong>{deltaDeg}°</strong>
          </label>
          <input type="range" min={-60} max={60} step={5} value={deltaDeg} onChange={(e) => setDelta(+e.target.value)} />
        </div>
      </div>

      <output className={`can-readout${s.sat ? " logic-uncertain" : ""}`} aria-live="polite">
        <span>
          {rich(t.iqCmd)}
          <strong>{fmt(now.iqCmd)}</strong>
        </span>
        <span>
          {rich(t.iqMeas)}
          <strong>{fmt(now.iq)}</strong>
        </span>
        <span>
          {rich(t.idMeas)}
          <strong>{fmt(now.id)}</strong>
        </span>
        <span>
          {t.w}
          <strong>{fmt(now.w)}</strong>
        </span>
        <span>
          {t.vuse}
          <strong>
            {Math.round(100 * now.vuse)}%{s.sat ? ` · ${t.sat}` : ""}
          </strong>
        </span>
      </output>
      <div className="foc-notes">
        <strong>{t.notesTitle}</strong>
        <ul>
          {t.notes.map((n) => (
            <li key={n}>{rich(n)}</li>
          ))}
        </ul>
      </div>
      <p className="demo-model-note">{t.note}</p>
    </section>
  );
}
