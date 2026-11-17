import { useId, useState } from "react";

// Antagonistic capstan drive, front view + top view.
// Two cables (red, blue) are wound on one helical groove of the drum (radius r), each terminated on the drum
// with a gap G_TERM between the two drum terminations; both run to
// the output pulley (radius R = N r), where each strand is terminated. The strands follow the two internal
// (crossed) or external (open) tangents, so each makes the angle phi with the centre line:
// sin(phi) = (r + R) / d (crossed) or (R - r) / d (open).
// Kinematics: inextensible cable, no slip -> theta_out = -theta_in / N. Turning the drum reels one strand in
// and pays the other out; the number of turns on the drum stays the same, but the wound helix (pitch p)
// translates along the drum axis by p * theta_in / 360 (cable walk). Each strand leaves the drum along the
// helix, i.e. leaning by the lead angle lambda. The output pulley has a helical groove of matched lead
// (pitch N p), placed so that each free span leans by lambda; the pulley side walks with the drum side, so the
// free span translates parallel and the fleet angle stays at lambda over the stroke.
// Tension is drawn as unit directions only (no force model). With equal tension in both strands the
// components across the centre line cancel and the shaft load lies on the centre line.

type Lang = "ko" | "en";

const r = 10; // mm, drum radius (fixed)
const M_DRUM = 30; // deg, cable left on the drum by the strand that pays out, at the end of the input range
const G_TERM = 180; // deg, gap on the drum groove between the red and blue drum terminations
const CLR = 0.5; // mm, clearance between the red and blue groove regions on the pulley (on top of the cable diameter)
const PX_MAX = 2.3; // px per mm, largest drawing scale (both views use the same scale)
const FRONT_HALF = 122; // px, room above / below the centre line for the output pulley in the front view
const VW = 720;
const YC = 150; // px, centre line y in the front view
const N_MIN = 1;
const N_MAX = 10;
const D_MAX = 300; // mm
const GAP = 3; // mm, minimum clearance between the pulleys
const OUT_LIM = 120; // deg, output range; input range is +-OUT_LIM * N
const DC = 1; // mm, cable diameter (fixed)
const P_MIN = DC; // mm, smallest helix pitch: neighbouring turns must not overlap
const P_MAX = 5; // mm, largest helix pitch
// pitch (helix) angle lambda from the pitch distance p, taken at the cable centre line r + DC / 2:
// tan(lambda) = p / (2 pi (r + DC / 2))
const pToLam = (p: number) => (Math.atan(p / (2 * Math.PI * (r + DC / 2))) * 180) / Math.PI;
const W0 = 135; // deg, wrap of each strand on the pulley at theta = 0; at the output limit one strand keeps W0 - OUT_LIM
const UNIT = 58; // px, unit direction arrows
const COLORS = { red: "#c2410c", blue: "#2563eb", sum: "#475569", pulley: "#202725", spoke: "#6b7280", axis: "#94a3b8", hidden: "#cbd5e1" };

const text = {
  ko: {
    eyebrow: "인터랙티브 예시 · 양방향 Capstan 드라이브",
    title: "장력의 방향과 cable walk",
    N: "감속비 N = R / r",
    d: "중심거리 d",
    th: "입력 각도 θ_in",
    p: "피치 거리 p",
    front: "정면도",
    top: "위에서 본 모습 (축 방향은 위아래)",
    out: "출력 각도 θ_out",
    layout: "배치",
    crossed: "교차 (crossed)",
    open: "평행 (open)",
    span: "케이블과 중심선 사이 각 β",
    free: "자유 구간 길이 L",
    walk: "Cable walk p·θ_in / 360°",
    lead: "Lead angle λ",
    fleet: "Fleet angle α_f (빨강 / 파랑)",
    sum: "Pretension 합력 |ΣF| = 2T₀ cos β",
    drum: "드럼 (입력)",
    pulley: "풀리 (출력)",
    note: `교육용 기구학 모델입니다. 드럼 반지름 r = ${r} mm입니다. 빨강과 파랑은 서로 다른 케이블이며, 각각 한쪽 끝은 드럼에, 다른 끝은 출력 풀리에 고정됩니다(점; 위에서 본 모습에서 속이 빈 점은 아래쪽 면). 두 케이블은 드럼의 한 나선 홈을 나눠 쓰고, 드럼 쪽 두 termination 사이에는 ${G_TERM}°의 간격을 두었습니다. 드럼이 돌면 한쪽 케이블은 드럼에 감기고 다른 쪽 케이블은 같은 길이만큼 풀립니다. 감은 바퀴 수는 입력 범위 끝에서 풀리는 쪽 가닥이 드럼에 ${M_DRUM}°만 남도록 정했습니다. 다만 출력 풀리 위 두 가닥의 홈 영역이 행정 전체에서 케이블 지름 + ${CLR} mm 이상 떨어지도록, 필요하면 더 남깁니다. 케이블은 늘어나지 않고 드럼과 풀리 위에서 미끄러지지 않습니다. 교차 배치에서는 두 가닥이 두 원의 내접선을 따라가므로 sin β = (r + R) / d, θ_out = −θ_in / N이고, 평행(open) 배치에서는 외접선을 따라가므로 sin β = (R − r) / d, θ_out = θ_in / N입니다. 피치 p는 드럼 한 바퀴당 축 방향 이동량이고, lead angle은 tan λ = p / 2π(r + d_c/2)입니다(케이블 지름 d_c = ${DC} mm, p ≥ d_c). 출력 풀리에는 같은 lead angle의 나선 홈(피치 N·p)을 두고, 각 자유 구간이 λ만큼 기울도록(α_f = λ) 놓았습니다. 풀리 쪽 입구도 드럼 쪽과 같은 거리만큼 이동하므로 자유 구간이 평행하게 움직이고 α_f = λ가 유지됩니다. 두 각은 축에 수직인 평면을 기준으로, 나선이 각 가닥을 드럼 밖으로 내보내는 방향을 양으로 쟀습니다. 두 가닥의 풀리 홈 간격은 피치와 β에 따라 함께 바뀌므로, 슬라이더를 바꾸는 것은 풀리를 새로 설계하는 것과 같습니다. 위에서 본 모습은 축 방향을 3배로 늘려 그렸으므로 그림 속 기울기는 실제 fleet angle보다 크게 보입니다. 표시값 α_f는 실제 자유 구간 길이 L로 계산합니다. 힘은 두 가닥의 pretension이 같다고 놓은 합력만 계산하며, 토크에 따른 장력 차이, 마찰, capstan 효과는 넣지 않았습니다. 케이블 지름은 ${DC} mm로 고정했고, 피치 각 계산과 피치의 최소값에만 쓰며 그림에는 반영하지 않았습니다. 출력 범위는 ±${OUT_LIM}°입니다.`,
  },
  en: {
    eyebrow: "Interactive example · Antagonistic capstan drive",
    title: "Tension direction and cable walk",
    N: "Ratio N = R / r",
    d: "Centre distance d",
    th: "Input angle θ_in",
    p: "Pitch distance p",
    front: "Front view",
    top: "Top view (axis direction is vertical)",
    out: "Output angle θ_out",
    layout: "Layout",
    crossed: "Crossed",
    open: "Open",
    span: "Angle β between cable and centre line",
    free: "Free span length L",
    walk: "Cable walk p·θ_in / 360°",
    lead: "Lead angle λ",
    fleet: "Fleet angle α_f (red / blue)",
    sum: "Pretension resultant |ΣF| = 2T₀ cos β",
    drum: "Drum (input)",
    pulley: "Pulley (output)",
    note: `Teaching kinematics model. Drum radius r = ${r} mm. Red and blue are separate cables, each terminated on the drum at one end and on the output pulley at the other (dots; hollow in the top view when on the underside). The two cables share one helical groove on the drum, with a ${G_TERM}° gap between their drum terminations. Turning the drum winds one cable on and pays the other out by the same length. The number of turns is chosen so that the paying-out strand keeps ${M_DRUM}° on the drum at the end of the input range, or more when needed to keep the red and blue groove regions on the output pulley at least one cable diameter + ${CLR} mm apart over the whole stroke. The cable is inextensible and does not slip on the drum or the pulley. In the crossed layout both strands follow the internal tangents, so sin β = (r + R) / d and θ_out = −θ_in / N; in the open layout they follow the external tangents, so sin β = (R − r) / d and θ_out = θ_in / N. The pitch p is the axial advance per drum turn and the lead angle is tan λ = p / 2π(r + d_c/2) (cable diameter d_c = ${DC} mm, p ≥ d_c). The output pulley has a helical groove of matched lead (pitch N·p), placed so that each free span leans by λ (α_f = λ). The pulley side moves by the same distance as the drum side, so the free span translates parallel and α_f = λ is kept. Both angles are measured from the plane normal to the axis, positive in the direction the helix carries each strand off the drum. The groove spacing on the pulley follows the pitch and β, so moving those sliders amounts to redesigning the pulley. The top view is stretched 3× along the drum axis, so the lean in the drawing looks larger than the true fleet angle; the value α_f uses the true free span length L. The only force computed is the resultant for equal pretension in both strands; the tension difference from torque, friction and the capstan effect are not modeled. The cable diameter is fixed at ${DC} mm and used only for the pitch angle and the minimum pitch, not in the drawing. The output range is ±${OUT_LIM}°.`,
  },
};

const rad = (deg: number) => (deg * Math.PI) / 180;
const fmt = (v: number, n = 1) => `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(n)}`;

export default function CapstanTensionDemo({ lang = "ko" }: { lang?: Lang }) {
  const t = text[lang];
  const id = useId();
  const mk = id.replace(/[^a-zA-Z0-9]/g, "");
  const [N, setN] = useState(2.5);
  const [dRaw, setD] = useState(80);
  const [thRaw, setTh] = useState(0);
  const [p, setP] = useState(1);
  const [layout, setLayout] = useState<"crossed" | "open">("crossed");
  const lam = pToLam(p);

  const R = N * r;
  const d = Math.max(dRaw, r + R + GAP);
  const thLim = OUT_LIM * N;
  const th = Math.max(-thLim, Math.min(thLim, thRaw));
  const crossed = layout === "crossed";
  // crossed: internal tangents, theta_out = -theta_in / N; open: external tangents, theta_out = +theta_in / N
  const out = (crossed ? -th : th) / N;
  const span = crossed ? r + R : R - r; // d sin(beta) for the tangent pair
  const sinP = span / d;
  const cosP = Math.sqrt(1 - sinP * sinP);
  const phi = (Math.asin(sinP) * 180) / Math.PI; // beta, angle between each strand and the centre line
  // red leaves the drum at +alpha, blue at -alpha (math angles, y up)
  const alpha = crossed ? 90 - phi : 90 + phi;
  // tangent points on the pulley and the wrap direction toward each termination
  const pR = crossed ? 180 + alpha : alpha;
  const pB = crossed ? 180 - alpha : -alpha;
  const wR = crossed ? W0 : -W0;
  const sumMag = 2 * cosP; // |T0 t1 + T0 t2| / T0
  const L = Math.sqrt(d * d - span ** 2);
  const walk = (p * th) / 360; // mm
  const tanLam = Math.tan((lam * Math.PI) / 180);
  const gWalk = (theta: number) => (p * theta) / 360; // the matched-lead groove carries the pulley-side point with the walk
  // signed lean of each free span, positive in the direction the helix carries that strand away from the drum
  const leanR = (theta: number) => (Math.atan(tanLam + (gWalk(theta) - (p * theta) / 360) / L) * 180) / Math.PI;
  const leanB = (theta: number) => (Math.atan(tanLam - (gWalk(theta) - (p * theta) / 360) / L) * 180) / Math.PI;
  const fR = leanR(th);
  const fB = leanB(th);

  // the scale shrinks so that a large pulley or a long centre distance still fits; a scale bar shows it
  const PX = Math.min(PX_MAX, (VW - 60) / (r + d + R), FRONT_HALF / R);
  const X1 = (VW - (r + d + R) * PX) / 2 + r * PX;
  const sx = (x: number) => X1 + x * PX;
  const sy = (y: number) => YC - y * PX; // front view, y up
  const ty = (z: number) => YT - z * ZS; // top view, z up (axial direction drawn at ZS, see note)
  const F = (cx: number, rr: number, deg: number) => ({ x: sx(cx + rr * Math.cos(rad(deg))), y: sy(rr * Math.sin(rad(deg))) });
  const poly = (pts: { x: number; y: number }[]) => pts.map((q, i) => `${i ? "L" : "M"}${q.x.toFixed(2)} ${q.y.toFixed(2)}`).join(" ");
  const arc = (cx: number, rr: number, from: number, to: number) => {
    const n = Math.max(2, Math.ceil(Math.abs(to - from) / 4));
    return poly(Array.from({ length: n + 1 }, (_, i) => F(cx, rr, from + ((to - from) * i) / n)));
  };

  // ---- drum helix: material angle beta (drum frame) from bR to bB, spatial angle gamma = beta + th ----
  // turns on the drum: at the end of the input range the paying-out strand keeps M on the drum. Over the stroke
  // the red and blue groove regions on the pulley are 2 p M / 360 + 2 L tan(lambda) apart (centre lines), so M is
  // raised when needed to keep them at least one cable diameter plus CLR apart.
  const M = Math.max(M_DRUM, (((DC + CLR - 2 * L * tanLam) * 360) / p - G_TERM) / 2);
  const K = (thLim + alpha + M + G_TERM / 2) / 180;
  const H = (p * (2 * thLim + M + G_TERM / 2)) / 360 + 3; // mm, half length of the drum drawn in the top view
  const zOf = (beta: number) => (-p * (beta - 180 * K)) / 360; // handedness chosen so the walk is +p*theta/360
  const bR = alpha - th;
  const bB = 360 * K - alpha - th;
  // drum terminations: fixed on the drum, so the red cable winds on as the blue one pays out (and vice versa)
  const bTR = 180 * K - G_TERM / 2;
  const bTB = 180 * K + G_TERM / 2;
  const zR = zOf(bR);
  const zB = zOf(bB);
  const zR0 = zOf(alpha); // departure points at theta = 0
  const zB0 = zOf(360 * K - alpha);
  // pulley grooves: at theta = 0 each span leans by lambda; a helical groove carries the groove point with the walk
  const zGR = zR0 + L * tanLam + gWalk(th);
  const zGB = zB0 - L * tanLam + gWalk(th);
  // a matched-lead helical groove has pitch N p on the pulley, so the wrap climbs N p / 360 mm per degree
  const cP = (N * p) / 360;
  const hP = Math.max(Math.abs(zR0), Math.abs(zB0)) + L * tanLam + (p * thLim) / 360 + cP * (W0 + OUT_LIM) + 4; // mm
  const HV = Math.max(H, hP) + 8; // mm, half height of the top view
  const ZS = 3 * PX; // px per mm along the drum axis in the top view (exaggerated so the winding is visible)
  const YT = 300 + HV * ZS + 24; // px, drum mid-plane y in the top view
  const VH = YT + HV * ZS + 30;
  // split the helix into runs on the visible (top, sin gamma > 0) and hidden side
  const helix = (from: number, to: number) => {
    const runs: { vis: boolean; d: string }[] = [];
    let cur: { x: number; y: number }[] = [];
    let vis: boolean | null = null;
    const n = Math.ceil((to - from) / 5);
    for (let i = 0; i <= n; i++) {
      const b = from + ((to - from) * i) / n;
      const g = rad(b + th);
      const q = { x: sx(r * Math.cos(g)), y: ty(zOf(b)) };
      const v = Math.sin(g) >= 0;
      if (vis !== null && v !== vis) {
        cur.push(q);
        runs.push({ vis, d: poly(cur) });
        cur = [];
      }
      vis = v;
      cur.push(q);
    }
    if (cur.length > 1 && vis !== null) runs.push({ vis, d: poly(cur) });
    return runs;
  };
  const helixR = helix(bR, bTR);
  const helixB = helix(bTB, bB);
  // wrap on the pulley seen from above: angle gamma from the tangent to the anchor, at a fixed groove height
  const pulleyWrap = (from: number, to: number, z: number, slope: number) => {
    const runs: { vis: boolean; d: string }[] = [];
    let cur: { x: number; y: number }[] = [];
    let vis: boolean | null = null;
    const n = Math.max(2, Math.ceil(Math.abs(to - from) / 5));
    for (let i = 0; i <= n; i++) {
      const g = from + ((to - from) * i) / n;
      const q = { x: sx(d + R * Math.cos(rad(g))), y: ty(z + slope * Math.abs(g - from)) };
      const v = Math.sin(rad(g)) >= 0;
      if (vis !== null && v !== vis) {
        cur.push(q);
        runs.push({ vis, d: poly(cur) });
        cur = [];
      }
      vis = v;
      cur.push(q);
    }
    if (cur.length > 1 && vis !== null) runs.push({ vis, d: poly(cur) });
    return runs;
  };

  // ---- front view geometry ----
  const T1R = F(0, r + 1.2, alpha);
  const T2R = F(d, R + 0.8, pR);
  const T1B = F(0, r + 1.2, -alpha);
  const T2B = F(d, R + 2.4, pB);
  const aR = pR + wR + out; // red anchor on the pulley (wraps away from its tangent point)
  const aB = pB - wR + out; // blue anchor (wraps the other way)
  const endR = F(d, R + 0.8, aR);
  const endB = F(d, R + 2.4, aB);
  const uR = { x: cosP, y: crossed ? sinP : -sinP }; // SVG direction drum -> pulley along the red span
  const uB = { x: cosP, y: crossed ? -sinP : sinP };
  const Arrow = ({ x, y, dx, dy, color, marker, dashed }: { x: number; y: number; dx: number; dy: number; color: string; marker: string; dashed?: boolean }) =>
    Math.hypot(dx, dy) < 1 ? null : (
      <line
        x1={x}
        y1={y}
        x2={x + dx}
        y2={y + dy}
        stroke={color}
        strokeWidth={dashed ? 1.6 : 2.2}
        strokeDasharray={dashed ? "5 3" : undefined}
        markerEnd={`url(#${mk}-${marker})`}
      />
    );
  const Spoke = ({ cx, rr, rot }: { cx: number; rr: number; rot: number }) => {
    const tip = F(cx, rr * 0.8, 90 + rot);
    return <line x1={sx(cx)} y1={YC} x2={tip.x} y2={tip.y} stroke={COLORS.spoke} strokeWidth="1.6" strokeDasharray="4 3" />;
  };

  const xDep = r * Math.cos(rad(alpha)); // x of both departure points on the drum
  const xGr = d + R * Math.cos(rad(pR)); // x of both tangent points on the pulley

  return (
    <section className="signal-demo cable-demo" aria-label={t.title}>
      <header className="signal-demo-heading">
        <span className="eyebrow">{t.eyebrow}</span>
        <h3>{t.title}</h3>
      </header>
      <div className="cable-toggle-row">
        <span className="cable-toggle-label">{t.layout}</span>
        <div className="can-bit-select" role="group" aria-label={t.layout}>
          {(["crossed", "open"] as const).map((o) => (
            <button type="button" key={o} aria-pressed={layout === o} onClick={() => setLayout(o)}>
              {o === "crossed" ? t.crossed : t.open}
            </button>
          ))}
        </div>
      </div>
      <div className="cable-controls">
        <div>
          <label htmlFor={`${id}-n`}>
            {t.N} <strong>{N.toFixed(1)}</strong>
          </label>
          <input id={`${id}-n`} type="range" min={N_MIN} max={N_MAX} step="0.1" value={N} onChange={(e) => setN(Number(e.target.value))} />
        </div>
        <div>
          <label htmlFor={`${id}-d`}>
            {t.d} <strong>{d.toFixed(0)} mm</strong>
          </label>
          <input id={`${id}-d`} type="range" min={Math.ceil(r + R + GAP)} max={D_MAX} step="1" value={d} onChange={(e) => setD(Number(e.target.value))} />
        </div>
        <div>
          <label htmlFor={`${id}-th`}>
            {t.th} <strong>{fmt(th, 0)}°</strong>
          </label>
          <input id={`${id}-th`} type="range" min={-thLim} max={thLim} step="1" value={th} onChange={(e) => setTh(Number(e.target.value))} />
        </div>
        <div>
          <label htmlFor={`${id}-p`}>
            {t.p} <strong>{p.toFixed(2)} mm</strong>
          </label>
          <input id={`${id}-p`} type="range" min={P_MIN} max={P_MAX} step="0.01" value={p} onChange={(ev) => setP(Number(ev.target.value))} />
        </div>
      </div>

      <svg className="cable-demo-svg" viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={`${t.fleet} ${fR.toFixed(2)}° / ${fB.toFixed(2)}°`}>
        <defs>
          {[
            ["r", COLORS.red],
            ["b", COLORS.blue],
            ["s", COLORS.sum],
          ].map(([key, color]) => (
            <marker
              key={key}
              id={`${mk}-${key}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerUnits="userSpaceOnUse"
              markerWidth="9"
              markerHeight="9"
              orient="auto-start-reverse"
            >
              <path d="M0 0 L10 5 L0 10 z" fill={color} />
            </marker>
          ))}
        </defs>

        {/* ================= front view ================= */}
        <text x="8" y="18" className="cable-demo-view">
          {t.front}
        </text>
        <line x1={sx(-r - 8)} x2={sx(d + R + 8)} y1={YC} y2={YC} stroke={COLORS.hidden} strokeDasharray="6 4" />
        <circle cx={sx(0)} cy={YC} r={r * PX} fill="var(--surface, #fff)" stroke={COLORS.pulley} strokeWidth="2.2" />
        <circle cx={sx(d)} cy={YC} r={R * PX} fill="var(--surface, #fff)" stroke={COLORS.pulley} strokeWidth="2.2" />
        <Spoke cx={0} rr={r} rot={th} />
        <Spoke cx={d} rr={R} rot={out} />
        {/* the turns on the drum overlap in this view: drawn as a band */}
        <circle cx={sx(0)} cy={YC} r={(r + 0.7) * PX} fill="none" stroke={COLORS.red} strokeWidth="2.6" opacity="0.7" />
        <circle cx={sx(0)} cy={YC} r={(r + 1.8) * PX} fill="none" stroke={COLORS.blue} strokeWidth="2.6" opacity="0.7" />
        <g fill="none" strokeWidth="2.4" strokeLinecap="round">
          <line x1={T1R.x} y1={T1R.y} x2={T2R.x} y2={T2R.y} stroke={COLORS.red} />
          <path d={arc(d, R + 0.8, pR, aR)} stroke={COLORS.red} />
          <line x1={T1B.x} y1={T1B.y} x2={T2B.x} y2={T2B.y} stroke={COLORS.blue} />
          <path d={arc(d, R + 2.4, pB, aB)} stroke={COLORS.blue} />
        </g>
        <circle cx={endR.x} cy={endR.y} r="4" fill={COLORS.red} />
        <circle cx={endB.x} cy={endB.y} r="4" fill={COLORS.blue} />
        {/* drum terminations of the two cables, turning with the drum */}
        <circle cx={F(0, r + 0.7, bTR + th).x} cy={F(0, r + 0.7, bTR + th).y} r="4" fill={COLORS.red} stroke="var(--surface, #fff)" strokeWidth="1.2" />
        <circle cx={F(0, r + 1.8, bTB + th).x} cy={F(0, r + 1.8, bTB + th).y} r="4" fill={COLORS.blue} stroke="var(--surface, #fff)" strokeWidth="1.2" />
        <Arrow x={sx(0)} y={YC} dx={uR.x * UNIT} dy={uR.y * UNIT} color={COLORS.red} marker="r" />
        <Arrow x={sx(0)} y={YC} dx={uB.x * UNIT} dy={uB.y * UNIT} color={COLORS.blue} marker="b" />
        <Arrow x={sx(0)} y={YC} dx={2 * cosP * UNIT} dy={0} color={COLORS.sum} marker="s" dashed />
        <Arrow x={sx(d)} y={YC} dx={-2 * cosP * UNIT} dy={0} color={COLORS.sum} marker="s" dashed />
        <text x={sx(0) + uR.x * UNIT * 1.12} y={YC + uR.y * UNIT * 1.12 + (uR.y < 0 ? -4 : 12)} fill={COLORS.red} fontSize="13" textAnchor="middle">t₁</text>
        <text x={sx(0) + uB.x * UNIT * 1.12} y={YC + uB.y * UNIT * 1.12 + (uB.y < 0 ? -4 : 12)} fill={COLORS.blue} fontSize="13" textAnchor="middle">t₂</text>
        <text x={sx(0) + 2 * cosP * UNIT + 6} y={YC - 6} fill={COLORS.sum} fontSize="13">ΣF</text>
        <circle cx={sx(0)} cy={YC} r="3.5" fill={COLORS.pulley} />
        <circle cx={sx(d)} cy={YC} r="3.5" fill={COLORS.pulley} />
        <g>
          <line x1="12" x2={12 + 10 * PX} y1={286} y2={286} stroke={COLORS.pulley} strokeWidth="2" />
          <text x={16 + 10 * PX} y={290}>
            10 mm
          </text>
        </g>
        <text x={sx(0)} y={YC + R * PX + 22} textAnchor="middle">
          {t.drum}
        </text>
        <text x={sx(d)} y={YC + R * PX + 22} textAnchor="middle">
          {t.pulley}
        </text>

        {/* ================= top view ================= */}
        <line x1="8" x2={VW - 8} y1={300} y2={300} stroke={COLORS.hidden} />
        <text x="8" y={318} className="cable-demo-view">
          {t.top}
        </text>
        {/* axes (dash-dot) */}
        {[0, d].map((cx) => (
          <line key={cx} x1={sx(cx)} x2={sx(cx)} y1={ty(H + 6)} y2={ty(-H - 6)} stroke={COLORS.axis} strokeDasharray="10 3 2 3" />
        ))}
        <rect x={sx(-r)} y={ty(H)} width={2 * r * PX} height={2 * H * ZS} rx="6" fill="var(--surface, #fff)" stroke={COLORS.pulley} strokeWidth="2" />
        <rect x={sx(d - R)} y={ty(hP)} width={2 * R * PX} height={2 * hP * ZS} rx="6" fill="var(--surface, #fff)" stroke={COLORS.pulley} strokeWidth="2" />
        {/* hidden (back) side of the helix first, then the visible side */}
        <g fill="none" strokeWidth="1.2" stroke={COLORS.hidden}>
          {[...helixR, ...helixB].filter((s) => !s.vis).map((s, i) => (
            <path key={i} d={s.d} />
          ))}
        </g>
        <g fill="none" strokeWidth="2" strokeLinecap="round">
          {helixR.filter((s) => s.vis).map((s, i) => (
            <path key={`r${i}`} d={s.d} stroke={COLORS.red} />
          ))}
          {helixB.filter((s) => s.vis).map((s, i) => (
            <path key={`b${i}`} d={s.d} stroke={COLORS.blue} />
          ))}
        </g>
        {/* drum terminations (hollow when on the underside) */}
        {(
          [
            [bTR, COLORS.red],
            [bTB, COLORS.blue],
          ] as [number, string][]
        ).map(([b, color]) => (
          <circle
            key={b}
            cx={sx(r * Math.cos(rad(b + th)))}
            cy={ty(zOf(b))}
            r="4.5"
            fill={Math.sin(rad(b + th)) >= 0 ? color : "var(--surface, #fff)"}
            stroke={color}
            strokeWidth="2"
          />
        ))}
        {/* pulley grooves: each strand stays on its groove */}
        {/* wrap on the pulley and the termination point of each strand */}
        {(
          [
            [pulleyWrap(pR, aR, zGR, cP), COLORS.red, aR, zGR + cP * Math.abs(aR - pR)],
            [pulleyWrap(pB, aB, zGB, -cP), COLORS.blue, aB, zGB - cP * Math.abs(aB - pB)],
          ] as [{ vis: boolean; d: string }[], string, number, number][]
        ).map(([runs, color, a, z], k) => (
          <g key={k}>
            {runs.map((run, i) => (
              <path
                key={i}
                d={run.d}
                fill="none"
                stroke={run.vis ? color : COLORS.hidden}
                strokeWidth={run.vis ? 2.2 : 3}
                strokeDasharray={run.vis ? undefined : "3 3"}
              />
            ))}
            <circle
              cx={sx(d + R * Math.cos(rad(a)))}
              cy={ty(z)}
              r="4.5"
              fill={Math.sin(rad(a)) >= 0 ? color : "var(--surface, #fff)"}
              stroke={color}
              strokeWidth="2"
            />
          </g>
        ))}
        {/* free spans at theta_in = 0 (dashed) and now */}
        <line x1={sx(xDep)} y1={ty(zR0)} x2={sx(xGr)} y2={ty(zR0 + L * tanLam)} stroke={COLORS.red} strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
        <line x1={sx(xDep)} y1={ty(zB0)} x2={sx(xGr)} y2={ty(zB0 - L * tanLam)} stroke={COLORS.blue} strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
        <g strokeWidth="2.4" strokeLinecap="round">
          <line x1={sx(xDep)} y1={ty(zR)} x2={sx(xGr)} y2={ty(zGR)} stroke={COLORS.red} />
          <line x1={sx(xDep)} y1={ty(zB)} x2={sx(xGr)} y2={ty(zGB)} stroke={COLORS.blue} />
        </g>
      </svg>

      <output className="can-readout" aria-live="polite">
        <span>
          {t.out} <strong>{fmt(out)}°</strong>
        </span>
        <span>
          {t.span} <strong>{phi.toFixed(1)}°</strong>
        </span>
        <span>
          {t.free} <strong>{L.toFixed(1)} mm</strong>
        </span>
        <span>
          {t.walk} <strong>{fmt(walk, 2)} mm</strong>
        </span>
        <span>
          {t.lead} <strong>{lam.toFixed(2)}°</strong>
        </span>
        <span>
          {t.fleet}{" "}
          <strong>
            {fmt(fR, 2)}° / {fmt(fB, 2)}°
          </strong>
        </span>
        <span>
          {t.sum}{" "}
          <strong>{sumMag.toFixed(2)} T₀</strong>
        </span>
      </output>
      <details className="demo-model-details">
        <summary>{lang === "ko" ? "구현 세부 사항" : "Implementation details"}</summary>
        <p className="demo-model-note">{t.note}</p>
      </details>
    </section>
  );
}
