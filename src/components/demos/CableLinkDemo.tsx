import { useEffect, useId, useRef, useState } from "react";
import type { Drive, Lang, Mode } from "./CablePulleyDemo";

// Body of the combined transmission demo for a link output (rendered inside CableTransmissionDemo, which owns
// the layout / drive / output toggles).
// Tendons terminated on a link instead of wrapped on an output pulley (finger-like joint). A driver pulley
// (radius r) reels the tendons in / out. Each tendon runs straight from its tangent point on the driver to a
// fixed guide on the base ("palm"), then to its termination on the link, offset from the link axis by -W
// (flexor, blue) or +W (extensor, red) at distance A_ATT from the joint. Flexion is q < 0.
// Open layout: the flexor leaves the driver at the bottom and is reeled in by theta_in < 0. Crossed layout: it
// leaves at the top, the spans cross, and theta_in > 0 reels it in. sigma = input sign that flexes.
// The joint angle follows from the flexor length: l_f(q) - l_f(0) = -sigma * r * theta_in (rad).
// Unlike a pulley, the moment arm h(q) = distance from the joint to the tendon line changes with q, so the
// ratio dq/dtheta_in = -sigma * r / h_f(q) is not constant.
// - Antagonistic: the driver pays the extensor out by sigma * r * theta_in, but it needs l_e(q) - l_e(0); the
//   mismatch shows as slack or as stretch it would need. The range stops where a tendon line would cross the joint.
// - Return spring: only the flexor; a torsion spring at the joint extends the link back to its stop at q = 0.
//   When the input is not held, theta_in relaxes to 0 (first-order, TAU); turned the other way the flexor goes slack.
// Kinematics only: inextensible tendons, frictionless guides, no forces.

// geometry in mm (math coords, y up, driver centre at the origin)
const r = 15; // driver radius
const J = { x: 100, y: 0 }; // joint
const GX = 80; // guide x
const GH = 15; // guide offset from the centre line
const A_ATT = 35; // termination distance along the link
const W = 5; // half thickness of the link; terminations at -W (flexor) and +W (extensor)
const LINK = 70; // link length
const Q_LO = -110; // deg, flexion limit of the search
const Q_HI = 60; // deg, extension limit of the search
const H_MIN = 2; // mm, a tendon line closer than this to the joint counts as crossing it
const W0 = 200; // deg, wrap of each tendon on the driver at theta_in = 0
const TAU = 0.9; // s, spring return time constant
const SLACK_IN = 120; // deg, how far the input may turn the slack way in spring mode
const PX = 2.4; // px per mm
const VW = 620;
const VH = 310;
const X0 = 110; // px, driver centre x
const Y0 = 118; // px, centre line y (room above for +37 deg, below for the -110 deg flexion)
const SAG_MAX = 40; // px
const COLORS = { flex: "#2563eb", ext: "#c2410c", spring: "#15803d", body: "#202725", base: "#e5e7eb", muted: "#6b7280" };

const text = {
  ko: {
    input: "입력 각도 θ_in",
    play: "재생",
    stop: "정지",
    reset: "처음으로",
    driver: "구동 풀리",
    q: "관절 각도 q",
    ratio: "전달비 dq/dθ_in",
    arm: "모멘트 암 (굴곡 / 신전)",
    armF: "모멘트 암 h_f",
    mismatch: "신전 tendon 길이",
    slackBy: "느슨함",
    stretchBy: "추가로 늘어나야 함",
    exact: "일치",
    state: "Tendon 상태",
    taut: "팽팽함",
    slack: "느슨함 (slack)",
    note: `교육용 기구학 모델입니다. 구동 풀리 반지름 r = ${r} mm, 관절에서 고정점까지 거리 ${A_ATT} mm, 고정점은 링크 축에서 ±${W} mm, 가이드는 관절에서 ${J.x - GX} mm 앞, 중심선에서 ±${GH} mm에 있습니다. Tendon은 늘어나지 않고 가이드에서 마찰 없이 꺾입니다. 관절 각도는 굴곡 tendon 길이에서 구합니다. 양방향 모드의 범위는 두 tendon 선이 관절을 넘어가지 않는 각도까지입니다(관절에서 ${H_MIN} mm 이내면 넘어간 것으로 봅니다). 스프링 복귀는 시정수 ${TAU} s의 1차 응답으로 그린 것입니다. 힘, 마찰, pretension은 넣지 않았습니다.`,
  },
  en: {
    input: "Input angle θ_in",
    play: "Play",
    stop: "Stop",
    reset: "Reset",
    driver: "Driver",
    q: "Joint angle q",
    ratio: "Ratio dq/dθ_in",
    arm: "Moment arm (flexor / extensor)",
    armF: "Moment arm h_f",
    mismatch: "Extensor length",
    slackBy: "slack",
    stretchBy: "must stretch",
    exact: "matched",
    state: "Tendon",
    taut: "taut",
    slack: "slack",
    note: `Teaching kinematics model. Driver radius r = ${r} mm, terminations ${A_ATT} mm from the joint and ±${W} mm off the link axis, guides ${J.x - GX} mm before the joint and ±${GH} mm off the centre line. Tendons are inextensible and bend over the guides without friction. The joint angle follows from the flexor length. In antagonistic mode the range stops where a tendon line would cross the joint (within ${H_MIN} mm). The spring return is drawn as a first-order response with a ${TAU} s time constant. Forces, friction and pretension are not modeled.`,
  },
};

type P = { x: number; y: number };
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (v: number) => (v * 180) / Math.PI;
const rot = (q: number, p: P): P => ({ x: p.x * Math.cos(rad(q)) - p.y * Math.sin(rad(q)), y: p.x * Math.sin(rad(q)) + p.y * Math.cos(rad(q)) });
const add = (a: P, b: P): P => ({ x: a.x + b.x, y: a.y + b.y });
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const GF: P = { x: GX, y: -GH };
const GE: P = { x: GX, y: GH };
const attF = (q: number) => add(J, rot(q, { x: A_ATT, y: -W }));
const attE = (q: number) => add(J, rot(q, { x: A_ATT, y: W }));
const lenF = (q: number) => dist(GF, attF(q));
const lenE = (q: number) => dist(GE, attE(q));
// signed distance from the joint to the line g -> p (positive: joint on the left of the direction g -> p)
const arm = (g: P, p: P) => ((p.x - g.x) * (J.y - g.y) - (p.y - g.y) * (J.x - g.x)) / dist(g, p);
const armF = (q: number) => arm(GF, attF(q)); // > 0 while the flexor passes under the joint
const armE = (q: number) => -arm(GE, attE(q)); // > 0 while the extensor passes over the joint
const LF0 = lenF(0);
const LE0 = lenE(0);
// tangent angle (deg) on a driver circle of radius rr for the span to the external point g: the lower or upper one
const tangent = (g: P, rr: number, upper: boolean) => deg(Math.atan2(g.y, g.x) + (upper ? 1 : -1) * Math.acos(rr / Math.hypot(g.x, g.y)));

// joint range: flexor alone (spring mode) or both tendons on their own side of the joint (pair mode)
function range(pair: boolean) {
  let lo = 0;
  let hi = 0;
  for (let q = 0; q >= Q_LO; q -= 0.5) {
    if (armF(q) < H_MIN || (pair && armE(q) < H_MIN)) break;
    lo = q;
  }
  for (let q = 0; q <= (pair ? Q_HI : 0); q += 0.5) {
    if (armF(q) < H_MIN || (pair && armE(q) < H_MIN)) break;
    hi = q;
  }
  return { lo, hi };
}
const RANGE = { pair: range(true), spring: range(false) };
// joint angle for a flexor length change dl (mm); l_f increases with q over the range, so bisect
function qOfLen(dl: number, lo: number, hi: number) {
  const target = LF0 + dl;
  let a = lo;
  let b = hi;
  for (let i = 0; i < 50; i++) {
    const m = (a + b) / 2;
    if (lenF(m) > target) b = m;
    else a = m;
  }
  return (a + b) / 2;
}

export function LinkBody({ lang = "ko", mode, drive }: { lang?: Lang; mode: Mode; drive: Drive }) {
  const t = text[lang];
  const id = useId();
  const [theta, setTheta] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [holding, setHolding] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ last: number } | null>(null);
  const spring = drive === "spring";
  const sigma = mode === "open" ? -1 : 1;
  const rg = RANGE[drive];
  // input angle (deg) that puts the joint at q
  const thetaOf = (q: number) => -sigma * deg((lenF(q) - LF0) / r);
  const thFlex = thetaOf(rg.lo); // input at full flexion (sign sigma)
  const thExt = spring ? -sigma * SLACK_IN : thetaOf(rg.hi); // pair: full extension; spring: slack side
  const thLo = Math.min(thFlex, thExt);
  const thHi = Math.max(thFlex, thExt);
  const clamp = (v: number) => Math.max(thLo, Math.min(thHi, v));

  useEffect(() => {
    const up = () => setHolding(false);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  // play: swing over the whole range (spring mode: flex from 0 and back)
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const start = performance.now();
    const lo = spring ? Math.min(0, thFlex) : thLo;
    const hi = spring ? Math.max(0, thFlex) : thHi;
    const mid = (lo + hi) / 2;
    const amp = (hi - lo) / 2;
    const phase0 = Math.asin(Math.max(-1, Math.min(1, (theta - mid) / amp)));
    const tick = (now: number) => {
      setTheta(mid + amp * Math.sin(phase0 + ((now - start) / 1000) * 2 * Math.PI * 0.25));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // theta is read only once when play starts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, spring, sigma]);

  // spring return when the input is not held: a taut flexor is pulled back toward 0
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

  // ---- state ----
  const th = clamp(theta);
  const reel = sigma * rad(th) * r; // mm of flexor reeled in (negative: paid out)
  const q = spring ? (reel > 0 ? qOfLen(-reel, rg.lo, 0) : 0) : qOfLen(-reel, rg.lo, rg.hi);
  const flexSlack = spring ? Math.max(0, -reel) : 0; // mm
  const hF = armF(q);
  const hE = armE(q);
  // extensor: paid out by `reel`, needs lenE(q) - LE0; positive mismatch = slack
  const extMis = reel - (lenE(q) - LE0);
  const ratio = flexSlack > 0 ? 0 : (-sigma * r) / hF;

  // ---- drawing ----
  const sx = (x: number) => X0 + x * PX;
  const sy = (y: number) => Y0 - y * PX;
  const S = (p: P) => ({ x: sx(p.x), y: sy(p.y) });
  const O: P = { x: 0, y: 0 };
  const circ = (c: P, rr: number, deg0: number) => S({ x: c.x + rr * Math.cos(rad(deg0)), y: c.y + rr * Math.sin(rad(deg0)) });
  const arcD = (c: P, rr: number, from: number, to: number) => {
    const n = Math.max(2, Math.ceil(Math.abs(to - from) / 4));
    return Array.from({ length: n + 1 }, (_, i) => {
      const p = circ(c, rr, from + ((to - from) * i) / n);
      return `${i ? "L" : "M"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    }).join(" ");
  };
  const sag = (a: P, b: P, slackMm: number) => {
    const A = S(a);
    const B = S(b);
    const Lc = Math.hypot(B.x - A.x, B.y - A.y);
    const h = Math.min(SAG_MAX, Math.sqrt((3 * Lc * slackMm * PX) / 8));
    return `M${A.x} ${A.y} Q${(A.x + B.x) / 2} ${(A.y + B.y) / 2 + 2 * h} ${B.x} ${B.y}`;
  };
  const foot = (g: P, p: P) => {
    const dx = p.x - g.x;
    const dy = p.y - g.y;
    const s = ((J.x - g.x) * dx + (J.y - g.y) * dy) / (dx * dx + dy * dy);
    return { x: g.x + s * dx, y: g.y + s * dy };
  };

  const pF = attF(q);
  const pE = attE(q);
  const linkPoly = [
    { x: 0, y: -W },
    { x: LINK, y: -W },
    { x: LINK, y: W },
    { x: 0, y: W },
  ]
    .map((p) => S(add(J, rot(q, p))))
    .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
  const label = S(add(J, rot(q, { x: LINK + 12, y: 0 })));
  const spokeTip = circ(O, r * 0.8, 90 + th);
  const fFoot = foot(GF, pF);
  const eFoot = foot(GE, pE);

  // driver wraps: each tendon leaves its tangent point and wraps W0 (at theta = 0) to its anchor on the driver.
  // open: flexor leaves at the bottom and wraps clockwise; crossed: it leaves at the top and wraps counter-clockwise
  const rf = r + 0.6;
  const re = r + 1.8;
  const tF = tangent(GF, rf, mode === "crossed");
  const tE = tangent(GE, re, mode === "open");
  const sF = mode === "open" ? -1 : 1;
  const sE = -sF;
  const aF = tF + sF * W0 + th;
  const aE = tE + sE * W0 + th;
  const TF = circ(O, rf, tF);
  const TE = circ(O, re, tE);
  const toMm = (p: { x: number; y: number }): P => ({ x: (p.x - X0) / PX, y: (Y0 - p.y) / PX });

  // clock spring at the joint (spring mode): inner end turns with the link
  const springPath = () => {
    const n = 160;
    const aIn = q;
    const aOut = 2.5 * 360;
    return Array.from({ length: n + 1 }, (_, i) => {
      const s = i / n;
      const p = circ(J, 2.5 + 7 * s, aIn + (aOut - aIn) * s);
      return `${i ? "L" : "M"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    }).join(" ");
  };

  const pointerAngle = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return 0;
    const box = svg.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * VW;
    const y = ((e.clientY - box.top) / box.height) * VH;
    return deg(Math.atan2(-(y - Y0), x - X0));
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
    setTheta((v) => clamp(v + d));
  };
  const onUp = () => {
    drag.current = null;
    setHolding(false);
  };
  const fmt = (v: number, n = 0) => `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(n)}`;

  return (
    <>
      <div>
        <label htmlFor={`${id}-theta`}>
          {t.input} <strong>{fmt(th)}°</strong>
        </label>
        <input
          id={`${id}-theta`}
          type="range"
          min={Math.ceil(thLo)}
          max={Math.floor(thHi)}
          step="1"
          value={Math.round(th)}
          onPointerDown={() => {
            setPlaying(false);
            setHolding(true);
          }}
          onChange={(e) => {
            setPlaying(false);
            setTheta(clamp(Number(e.target.value)));
          }}
        />
      </div>

      <svg ref={svgRef} className="cable-demo-svg" viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={`${t.q} ${fmt(q, 1)}°`}>
        {/* driver support */}
        <path
          d={`M${sx(0) - 22} ${sy(-r) + 60} L${sx(0) - 14} ${sy(0) + 8} L${sx(0) + 14} ${sy(0) + 8} L${sx(0) + 22} ${sy(-r) + 60} Z`}
          fill="var(--surface, #fff)"
          stroke={COLORS.muted}
          strokeWidth="1.2"
        />
        <line x1={sx(0) - 34} x2={sx(0) + 34} y1={sy(-r) + 60} y2={sy(-r) + 60} stroke={COLORS.muted} strokeWidth="1.5" />
        {/* base ("palm") with the two guides and the joint */}
        <rect x={sx(GX - 6)} y={sy(GH + 5)} width={(J.x - GX + 6) * PX} height={(2 * GH + 10) * PX} rx="6" fill={COLORS.base} stroke={COLORS.muted} />
        {/* link */}
        <path d={linkPoly + " Z"} fill="var(--surface, #fff)" stroke={COLORS.body} strokeWidth="2" />
        <circle cx={sx(J.x)} cy={sy(J.y)} r="5" fill={COLORS.body} />
        {spring && <path d={springPath()} fill="none" stroke={COLORS.spring} strokeWidth="1.6" />}
        {/* driver pulley */}
        <circle cx={sx(0)} cy={sy(0)} r={r * PX} fill="var(--surface, #fff)" stroke={COLORS.body} strokeWidth="2.2" />
        <line x1={sx(0)} y1={sy(0)} x2={spokeTip.x} y2={spokeTip.y} stroke={COLORS.muted} strokeWidth="1.8" strokeDasharray="4 3" />
        <circle cx={sx(0)} cy={sy(0)} r="3.5" fill={COLORS.body} />

        {/* moment arms */}
        <line x1={sx(J.x)} y1={sy(J.y)} x2={S(fFoot).x} y2={S(fFoot).y} stroke={COLORS.flex} strokeWidth="1.2" strokeDasharray="3 3" />
        {!spring && <line x1={sx(J.x)} y1={sy(J.y)} x2={S(eFoot).x} y2={S(eFoot).y} stroke={COLORS.ext} strokeWidth="1.2" strokeDasharray="3 3" />}

        {/* flexor */}
        <g fill="none" stroke={COLORS.flex} strokeWidth="2.4" strokeLinecap="round">
          <path d={arcD(O, rf, tF, aF)} />
          <path d={sag(toMm(TF), GF, flexSlack)} />
          <line x1={S(GF).x} y1={S(GF).y} x2={S(pF).x} y2={S(pF).y} />
        </g>
        <circle cx={circ(O, rf, aF).x} cy={circ(O, rf, aF).y} r="4" fill={COLORS.flex} />
        <circle cx={S(pF).x} cy={S(pF).y} r="4" fill={COLORS.flex} />
        {/* extensor */}
        {!spring && (
          <>
            <g fill="none" stroke={COLORS.ext} strokeWidth="2.4" strokeLinecap="round">
              <path d={arcD(O, re, tE, aE)} />
              <path d={sag(toMm(TE), GE, Math.max(0, extMis))} />
              <line x1={S(GE).x} y1={S(GE).y} x2={S(pE).x} y2={S(pE).y} />
            </g>
            <circle cx={circ(O, re, aE).x} cy={circ(O, re, aE).y} r="4" fill={COLORS.ext} />
            <circle cx={S(pE).x} cy={S(pE).y} r="4" fill={COLORS.ext} />
          </>
        )}
        {/* guides */}
        {[GF, GE].map((g, i) => (
          <circle key={i} cx={S(g).x} cy={S(g).y} r="4.5" fill="var(--surface, #fff)" stroke={COLORS.body} strokeWidth="1.6" />
        ))}

        <text x={sx(0)} y={sy(-r) + 80} textAnchor="middle">
          {t.driver}
        </text>
        <text x={label.x} y={label.y + 4} textAnchor="middle">
          {fmt(q, 0)}°
        </text>
        {/* drag handle on the driver */}
        <circle
          cx={sx(0)}
          cy={sy(0)}
          r={r * PX + 12}
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
          {t.q} <strong>{fmt(q, 1)}°</strong>
        </span>
        <span>
          {t.ratio} <strong>{fmt(ratio, 2)}</strong>
        </span>
        {spring ? (
          <>
            <span>
              {t.armF} <strong>{hF.toFixed(1)} mm</strong>
            </span>
            <span>
              {t.state} <strong>{flexSlack > 0 ? t.slack : t.taut}</strong>
            </span>
          </>
        ) : (
          <>
            <span>
              {t.arm}{" "}
              <strong>
                {hF.toFixed(1)} / {hE.toFixed(1)} mm
              </strong>
            </span>
            <span>
              {t.mismatch}{" "}
              <strong>{Math.abs(extMis) < 0.05 ? t.exact : `${t[extMis > 0 ? "slackBy" : "stretchBy"]} ${Math.abs(extMis).toFixed(1)} mm`}</strong>
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
