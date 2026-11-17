import { useEffect, useId, useRef, useState } from "react";

// 1:1 cable (tendon) pulley transmission between two equal pulleys, in two drive configurations.
// Rendered inside CableTransmissionDemo, which owns the layout / drive / output toggles.
// - Antagonistic (pull-pull): two cables, each terminated on both pulleys. Turning the driver winds one cable
//   on and unwinds the other, so the driven pulley follows with theta (open) or -theta (crossed) both ways.
// - Return spring: only the flexor (blue), which drives flexion (output negative, active); a torsion spring on
//   the driven pulley drives extension back toward its rest position theta_out = 0 against a stop (passive).
//   The tendon can only pull: turned the other way, the output stays at the stop and the tendon goes slack.
//   When the input is not held (mouse up, not playing), the spring backdrives the input and theta_in relaxes
//   to 0 with a first-order time constant TAU; a slack tendon is not pulled back.
// Kinematics only: inextensible cables, no slip, no tension, friction or cable stiffness.

export type Lang = "ko" | "en";
export type Mode = "open" | "crossed";
export type Drive = "pair" | "spring";

const R = 62; // px, pulley radius
const A = 150; // px, half the centre distance
const CL = { x: 160, y: 120 }; // driver (left) centre in SVG coords
const CR = { x: CL.x + 2 * A, y: 120 }; // driven (right) centre
const W0 = 200; // deg, wrap angle of each cable on each pulley at theta = 0
const LIM = 175; // deg, input range so that every wrap stays >= 25 deg
const OFF = 3.5; // px, radial gap between the two cables so they do not overlap
const TAU = 0.9; // s, time constant of the spring return
const SAG_MAX = 62; // px, cap on the drawn sag of a slack tendon (keeps the bottom span inside the drawing)
const COLORS = { red: "#c2410c", blue: "#2563eb", spring: "#15803d", pulley: "#202725", spoke: "#6b7280" };

const text = {
  ko: {
    eyebrow: "인터랙티브 예시 · 1:1 케이블 풀리 전달",
    title: "구동 풀리를 돌리면 케이블이 무엇을 하는가",
    open: "평행 배치 (open)",
    crossed: "교차 배치 (crossed)",
    pair: "양방향 tendon (antagonistic)",
    spring: "Tendon + return spring",
    input: "입력 각도 θ_in",
    play: "재생",
    stop: "정지",
    reset: "처음으로",
    driver: "구동 풀리",
    driven: "피동 풀리",
    out: "출력 각도 θ_out",
    ratio: "θ_out / θ_in",
    wrapRed: "신전 케이블(빨강) 감김각 (구동 / 피동)",
    wrapBlue: "굴곡 케이블(파랑) 감김각 (구동 / 피동)",
    armP: "모멘트 암",
    mismatchP: "신전 tendon 길이",
    exact: "항상 일치",
    springDef: "스프링 변형 (출력 각도)",
    wrapTendon: "Tendon 감김각 (구동 / 피동)",
    state: "Tendon 상태",
    taut: "팽팽함",
    slack: "느슨함 (slack)",
    note: `교육용 기구학 모델입니다. 케이블은 늘어나지 않고 풀리 위에서 미끄러지지 않으며, 케이블 끝은 풀리에 고정되어 있습니다(점). 반지름이 같으므로 감김각 변화가 그대로 출력 회전이 됩니다. 장력, 마찰, 케이블 강성은 넣지 않았습니다. Return spring 모드에서 θ_out = 0은 스프링이 stopper에 기대어 쉬는 위치이고, 손을 뗀 뒤의 복귀는 시정수 ${TAU} s의 1차 응답으로 그렸습니다(스프링 강성과 관성으로 계산한 값이 아닙니다). 느슨한 tendon의 처짐은 길이 차이를 보여 주기 위한 그림입니다. 입력 범위는 ±${LIM}°입니다.`,
  },
  en: {
    eyebrow: "Interactive example · 1:1 cable pulley transmission",
    title: "What the cables do when the driver turns",
    open: "Open",
    crossed: "Crossed",
    pair: "Antagonistic tendon pair",
    spring: "Tendon + return spring",
    input: "Input angle θ_in",
    play: "Play",
    stop: "Stop",
    reset: "Reset",
    driver: "Driver",
    driven: "Driven",
    out: "Output angle θ_out",
    ratio: "θ_out / θ_in",
    wrapRed: "Extensor (red) wrap (driver / driven)",
    wrapBlue: "Flexor (blue) wrap (driver / driven)",
    armP: "Moment arm",
    mismatchP: "Extensor length",
    exact: "always matched",
    springDef: "Spring deflection (output angle)",
    wrapTendon: "Tendon wrap (driver / driven)",
    state: "Tendon",
    taut: "taut",
    slack: "slack",
    note: `Teaching kinematics model: inextensible cables, no slip on the pulleys, cable ends fixed to the pulleys (dots). With equal radii the change in wrap angle becomes the output rotation one to one. Tension, friction and cable stiffness are not modeled. In return-spring mode θ_out = 0 is where the spring rests against a stop, and the return after release is drawn as a first-order response with a ${TAU} s time constant (not computed from a spring stiffness and inertia). The sag of a slack tendon only illustrates the excess length. The input range is ±${LIM}°.`,
  },
};

const rad = (d: number) => (d * Math.PI) / 180;
// math angle (CCW positive, y up) -> SVG point
const pt = (c: { x: number; y: number }, r: number, deg: number) => ({ x: c.x + r * Math.cos(rad(deg)), y: c.y - r * Math.sin(rad(deg)) });

// One cable end on one pulley: tangent angle t (where the free span leaves), wrap direction s (+1 CCW from t
// to the anchor), anchor angle a0 at theta = 0. The anchor rides with the pulley rotation.
type Wrap = { t: number; s: 1 | -1; a0: number };
type Cable = { r: number; L: Wrap; Rt: Wrap };

function cables(mode: Mode): { red: Cable; blue: Cable } {
  const rr = R + 2 + OFF; // red runs on the outer groove
  const rb = R + 2; // blue on the inner groove
  if (mode === "open") {
    return {
      red: { r: rr, L: { t: 90, s: 1, a0: 90 + W0 }, Rt: { t: 90, s: -1, a0: 90 - W0 } },
      blue: { r: rb, L: { t: 270, s: -1, a0: 270 - W0 }, Rt: { t: 270, s: 1, a0: 270 + W0 } },
    };
  }
  // crossed: internal tangents through the midpoint, tangent angle psi = acos(r / A)
  const pr = (Math.acos(rr / A) * 180) / Math.PI;
  const pb = (Math.acos(rb / A) * 180) / Math.PI;
  return {
    red: { r: rr, L: { t: pr, s: 1, a0: pr + W0 }, Rt: { t: 180 + pr, s: 1, a0: 180 + pr + W0 } },
    blue: { r: rb, L: { t: -pb, s: -1, a0: -pb - W0 }, Rt: { t: 180 - pb, s: -1, a0: 180 - pb - W0 } },
  };
}

function arcPath(c: { x: number; y: number }, r: number, w: Wrap, rot: number) {
  const a = w.a0 + rot;
  const wrap = w.s * (a - w.t);
  const n = Math.max(2, Math.ceil(wrap / 4));
  const pts = Array.from({ length: n + 1 }, (_, i) => pt(c, r, w.t + (w.s * wrap * i) / n));
  return { d: pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" "), anchor: pt(c, r, a), wrap };
}

// slack: excess length (px) is shown as a downward sag of the free span (parabola: dL ~ 8 h^2 / (3 Lc))
function CableShape({ cable, rotL, rotR, color, slack = 0 }: { cable: Cable; rotL: number; rotR: number; color: string; slack?: number }) {
  const l = arcPath(CL, cable.r, cable.L, rotL);
  const r = arcPath(CR, cable.r, cable.Rt, rotR);
  const p1 = pt(CL, cable.r, cable.L.t);
  const p2 = pt(CR, cable.r, cable.Rt.t);
  const Lc = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const h = Math.min(SAG_MAX, Math.sqrt((3 * Lc * slack) / 8));
  const span = `M${p1.x} ${p1.y} Q${(p1.x + p2.x) / 2} ${(p1.y + p2.y) / 2 + 2 * h} ${p2.x} ${p2.y}`;
  return (
    <g stroke={color} fill="none" strokeWidth="2.6" strokeLinecap="round">
      <path d={l.d} />
      <path d={r.d} />
      <path d={span} />
      <circle cx={l.anchor.x} cy={l.anchor.y} r="4.5" fill={color} stroke="none" />
      <circle cx={r.anchor.x} cy={r.anchor.y} r="4.5" fill={color} stroke="none" />
    </g>
  );
}

// torsion (clock) spring on the driven pulley: the inner end turns with the pulley, the outer end is pinned
function ClockSpring({ c, rot }: { c: { x: number; y: number }; rot: number }) {
  const turns = 2.75;
  const aOut = 90 + turns * 360; // fixed outer end
  const aIn = 90 + rot; // inner end rides with the pulley
  const ri = 9;
  const ro = R - 16;
  const n = 220;
  const d = Array.from({ length: n + 1 }, (_, i) => {
    const s = i / n;
    const p = pt(c, ri + (ro - ri) * s, aIn + (aOut - aIn) * s);
    return `${i ? "L" : "M"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  }).join(" ");
  const pin = pt(c, ro, aOut);
  return (
    <g>
      <path d={d} fill="none" stroke={COLORS.spring} strokeWidth="1.8" />
      <rect x={pin.x - 4} y={pin.y - 4} width="8" height="8" fill={COLORS.spring} />
    </g>
  );
}

function Pulley({ c, rot, label }: { c: { x: number; y: number }; rot: number; label: string }) {
  const tip = pt(c, R - 12, 90 + rot);
  return (
    <g>
      <path
        d={`M${c.x - 22} ${c.y + R + 34} L${c.x - 16} ${c.y + 10} L${c.x + 16} ${c.y + 10} L${c.x + 22} ${c.y + R + 34} Z`}
        fill="var(--surface, #fff)"
        stroke={COLORS.spoke}
        strokeWidth="1.2"
      />
      <line x1={c.x - 34} x2={c.x + 34} y1={c.y + R + 34} y2={c.y + R + 34} stroke={COLORS.spoke} strokeWidth="1.5" />
      {Array.from({ length: 7 }, (_, i) => (
        <line key={i} x1={c.x - 30 + i * 10} x2={c.x - 38 + i * 10} y1={c.y + R + 34} y2={c.y + R + 44} stroke={COLORS.spoke} strokeWidth="1.2" />
      ))}
      <circle cx={c.x} cy={c.y} r={R} fill="var(--surface, #fff)" stroke={COLORS.pulley} strokeWidth="2.4" />
      <line x1={c.x} y1={c.y} x2={tip.x} y2={tip.y} stroke={COLORS.spoke} strokeWidth="2" strokeDasharray="4 3" />
      <circle cx={c.x} cy={c.y} r="4" fill={COLORS.pulley} />
      <text x={c.x} y={c.y + R + 62} textAnchor="middle">
        {label}
      </text>
    </g>
  );
}

// Body of the combined transmission demo for a pulley output (no header, no toggles: the wrapper owns them).
// Flexion is the output turning negative. The flexor (drawn blue) is the cable that does it: in the open layout
// it is reeled in by theta_in < 0, in the crossed layout by theta_in > 0 (sigma = input sign that flexes).
export function PulleyBody({ lang = "ko", mode, drive }: { lang?: Lang; mode: Mode; drive: Drive }) {
  const t = text[lang];
  const id = useId();
  const [theta, setTheta] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [holding, setHolding] = useState(false); // mouse / finger down on the slider or the driver
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ last: number } | null>(null);
  const spring = drive === "spring";
  const sigma = mode === "open" ? -1 : 1;

  // release anywhere on the page ends a hold
  useEffect(() => {
    const up = () => setHolding(false);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  // play: pair mode swings +-150 deg, spring mode flexes from 0 to 150 deg and back (the motor holds the input)
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const start = performance.now();
    const w = 2 * Math.PI * 0.25;
    const phase0 = spring ? Math.acos(Math.max(-1, Math.min(1, 1 - (sigma * theta) / 75))) : Math.asin(Math.max(-1, Math.min(1, theta / 150)));
    const tick = (now: number) => {
      const ph = phase0 + ((now - start) / 1000) * w;
      setTheta(spring ? sigma * 75 * (1 - Math.cos(ph)) : 150 * Math.sin(ph));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // theta is read only once when play starts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, spring, sigma]);

  // spring return: when nothing holds the input, a taut flexor is pulled back toward 0
  useEffect(() => {
    if (!spring || holding || playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      setTheta((v) => (sigma * v <= 0 ? v : Math.abs(v) < 0.05 ? 0 : v * Math.exp(-dt / TAU)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spring, holding, playing, sigma]);

  const pointerAngle = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return 0;
    const box = svg.getBoundingClientRect();
    const sx = ((e.clientX - box.left) / box.width) * 620;
    const sy = 40 + ((e.clientY - box.top) / box.height) * 236;
    return (Math.atan2(-(sy - CL.y), sx - CL.x) * 180) / Math.PI;
  };
  const onDown = (e: React.PointerEvent) => {
    setPlaying(false);
    setHolding(true);
    drag.current = { last: pointerAngle(e) };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const a = pointerAngle(e);
    let d = a - drag.current.last;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    drag.current.last = a;
    setTheta((v) => Math.max(-LIM, Math.min(LIM, v + d)));
  };
  const onUp = () => {
    drag.current = null;
    setHolding(false);
  };

  // the output follows a taut tendon; in spring mode it cannot pass its stop at 0
  const follow = spring ? (sigma * theta > 0 ? theta : 0) : theta;
  const out = mode === "open" ? follow : -follow;
  const slackDeg = spring && sigma * theta < 0 ? Math.abs(theta) : 0;
  const { red, blue } = cables(mode);
  const flex = mode === "open" ? blue : red; // drawn blue
  const ext = mode === "open" ? red : blue; // drawn red
  const wrap = (c: Cable) => [arcPath(CL, c.r, c.L, theta).wrap, arcPath(CR, c.r, c.Rt, out).wrap];
  const [fl, fr] = wrap(flex);
  const [el, er] = wrap(ext);
  const deg = (v: number) => `${v >= 0 ? "" : "−"}${Math.abs(v).toFixed(0)}°`;

  return (
    <>
      <div>
        <label htmlFor={`${id}-theta`}>
          {t.input} <strong>{deg(theta)}</strong>
        </label>
        <input
          id={`${id}-theta`}
          type="range"
          min={-LIM}
          max={LIM}
          step="1"
          value={Math.round(theta)}
          onPointerDown={() => {
            setPlaying(false);
            setHolding(true);
          }}
          onChange={(e) => {
            setPlaying(false);
            setTheta(Number(e.target.value));
          }}
        />
      </div>
      <svg ref={svgRef} className="cable-demo-svg" viewBox="0 40 620 236" role="img" aria-label={`${t.out} ${deg(out)}`}>
        <Pulley c={CL} rot={theta} label={t.driver} />
        <Pulley c={CR} rot={out} label={t.driven} />
        {spring ? (
          <>
            <ClockSpring c={CR} rot={out} />
            <CableShape cable={flex} rotL={theta} rotR={out} color={COLORS.blue} slack={(slackDeg * Math.PI * flex.r) / 180} />
          </>
        ) : (
          <>
            <CableShape cable={flex} rotL={theta} rotR={out} color={COLORS.blue} />
            <CableShape cable={ext} rotL={theta} rotR={out} color={COLORS.red} />
          </>
        )}
        <circle
          cx={CL.x}
          cy={CL.y}
          r={R + 10}
          fill="transparent"
          style={{ cursor: "grab", touchAction: "none" }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      </svg>
      <output className="can-readout" aria-live="polite">
        <span>
          {t.out} <strong>{deg(out)}</strong>
        </span>
        <span>
          {t.ratio} <strong>{spring && slackDeg > 0 ? "0" : mode === "open" ? "+1" : "−1"}</strong>
        </span>
        <span>
          {t.armP} <strong>r</strong>
        </span>
        {spring ? (
          <>
            <span>
              {t.state} <strong>{slackDeg > 0 ? t.slack : t.taut}</strong>
            </span>
            <span>
              {t.wrapTendon}{" "}
              <strong>
                {fl.toFixed(0)}° / {fr.toFixed(0)}°
              </strong>
            </span>
            <span>
              {t.springDef} <strong>{deg(Math.abs(out))}</strong>
            </span>
          </>
        ) : (
          <>
            <span>
              {t.wrapBlue}{" "}
              <strong>
                {fl.toFixed(0)}° / {fr.toFixed(0)}°
              </strong>
            </span>
            <span>
              {t.wrapRed}{" "}
              <strong>
                {el.toFixed(0)}° / {er.toFixed(0)}°
              </strong>
            </span>
            <span>
              {t.mismatchP} <strong>{t.exact}</strong>
            </span>
          </>
        )}
      </output>
      <div className="cable-demo-buttons">
        <button className="signal-reset" type="button" onClick={() => setPlaying((p) => !p)}>
          {playing ? t.stop : t.play}
        </button>
        <button
          className="signal-reset"
          type="button"
          onClick={() => {
            setPlaying(false);
            setTheta(0);
          }}
        >
          {t.reset}
        </button>
      </div>
      <details className="demo-model-details">
        <summary>{lang === "ko" ? "구현 세부 사항" : "Implementation details"}</summary>
        <p className="demo-model-note">{t.note}</p>
      </details>
    </>
  );
}
