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
    aria: "3상 스테이터 코일, 영구자석 로터, 합성 전류 벡터와 d·q축을 보여 주는 모터 단면",
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
    aria: "Motor cross-section with three stator coils, a permanent-magnet rotor, the resultant current vector and the d-q axes",
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

const rot = (x: number, y: number, a: number): [number, number] => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
const fresh = (): Sim => ({ t: 0, theta: 30 * DEG, w: 0, id: 0, iq: 0, xd: 0, xq: 0, vuse: 0, sat: false, iqCmdNow: 0 });

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
  s.iqCmdNow = rot(ca, cb, -s.theta)[1];
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
const SUB = /([A-Za-z])_([a-zαβ]+)/g;
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
      setFrame((f) => f + 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const reset = () => {
    sim.current = fresh();
    hist.current = [sample(sim.current)];
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
  const markers = [COLORS.a, COLORS.b, COLORS.c, COLORS.vec, COLORS.q, COLORS.d].map((c) => (
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
        <svg className="foc-motor" viewBox="0 0 300 336" role="img" aria-label={t.aria}>
          <defs>{markers}</defs>
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
                <text x={x} y={y + 4} textAnchor="middle" className="foc-coil-label">
                  {name}
                </text>
              </g>
            );
          })}
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
          {arrow(theta, 104, COLORS.d, 1.5, "4 4", "d")}
          {arrow(theta + 90 * DEG, 104, COLORS.q, 1.5, "4 4", "q")}
          {deltaDeg !== 0 && arrow(theta + delta + 90 * DEG, 104, COLORS.q, 1, "1 4", "qhat")}
          {phases.map(([name, ang, i]) =>
            Math.abs(i) > 0.02 ? arrow(i >= 0 ? ang : ang + Math.PI, (2 / 3) * Math.abs(i) * 70, COLORS[name], 2.5, undefined, `p${name}`) : null
          )}
          {vecLen > 0.02 && arrow(vecAng, vecLen * 70, COLORS.vec, 4, undefined, "vec")}
          <text x={150} y={314} textAnchor="middle" className="foc-legend" fill={COLORS.q}>
            - - {t.rotorQ}
            {deltaDeg !== 0 ? ` · ··· ${t.estQ}` : ""}
          </text>
          <text x={150} y={330} textAnchor="middle" className="foc-legend" fill={COLORS.d}>
            - - {t.rotorD}
          </text>
        </svg>

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
      <p className="demo-model-note">{t.note}</p>
    </section>
  );
}
