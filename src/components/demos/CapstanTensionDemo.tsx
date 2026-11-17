import { useId, useState } from "react";

// Antagonistic capstan drive, front view + top view.
// One continuous cable is wound K turns on the drum (radius r, held by friction) and its two strands run to
// the output pulley (radius R = N r), where each strand is terminated. The strands follow the two internal
// (crossed) tangents, so each makes the angle phi with the centre line: sin(phi) = (r + R) / d.
// Kinematics: inextensible cable, no slip -> theta_out = -theta_in / N. Turning the drum reels one strand in
// and pays the other out; the number of turns on the drum stays the same, but the wound helix (pitch p)
// translates along the drum axis by p * theta_in / 360 (cable walk). The pulley grooves are fixed, so the
// strands lean by the fleet angle delta = atan(walk / L), L = free span length. The grooves are aligned with
// the strands at the neutral position (theta_in = 0), so the fleet angle is zero there and +-max at the ends of
// the stroke. The fleet angle is a result, not an input.
// Tension is drawn as unit directions only (no force model). With equal tension in both strands the
// components across the centre line cancel and the shaft load lies on the centre line.

type Lang = "ko" | "en";

const r = 10; // mm, drum radius (fixed)
const K = 6; // turns of cable on the drum
const PX_MAX = 2.3; // px per mm, largest drawing scale (both views use the same scale)
const FRONT_HALF = 122; // px, room above / below the centre line for the output pulley in the front view
const VW = 720;
const YC = 150; // px, centre line y in the front view
const N_MIN = 1;
const N_MAX = 10;
const D_MAX = 300; // mm
const GAP = 3; // mm, minimum clearance between the pulleys
const OUT_LIM = 150; // deg, output range; input range is +-OUT_LIM * N
const DC = 1; // mm, cable diameter (fixed)
const P_MIN = DC; // mm, smallest helix pitch: neighbouring turns must not overlap
const P_MAX = 5; // mm, largest helix pitch
// pitch (helix) angle lambda from the pitch distance p, taken at the cable centre line r + DC / 2:
// tan(lambda) = p / (2 pi (r + DC / 2))
const pToLam = (p: number) => (Math.atan(p / (2 * Math.PI * (r + DC / 2))) * 180) / Math.PI;
const H = P_MAX * (K / 2 + (OUT_LIM * N_MAX) / 360 + 1); // mm, half length of the drum in the top view
const HV = H + 8; // mm, half height of the top view
const YT = 300 + HV * PX_MAX + 24; // px, drum mid-plane y in the top view
const VH = YT + HV * PX_MAX + 30;
const W0 = 200; // deg, wrap of each strand on the pulley at theta = 0
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
    details: "세부 설정: 케이블 피치",
    pitchGroup: `드럼 피치. 피치 거리 p는 한 바퀴당 축 방향 이동량이고, 피치 각 λ는 p에서 정해지는 결과값입니다 (tan λ = p / 2π(r + d_c/2), 케이블 지름 d_c = ${DC} mm). 이웃한 바퀴가 겹치지 않도록 p는 d_c 이상으로 제한했습니다.`,
    term: "속이 빈 점은 풀리 아래쪽(위에서 보이지 않는 면)에 있는 끝단입니다.",
    front: "정면도",
    top: "위에서 본 모습 (축 방향은 위아래)",
    out: "출력 각도 θ_out",
    span: "케이블과 중심선 사이 각 β",
    free: "자유 구간 길이 L",
    walk: "Cable walk p·θ_in / 360°",
    fleet: "Fleet angle α_f = atan(walk / L)",
    fleetRange: "행정 양 끝의 fleet angle",
    sum: "두 장력이 같을 때 합력 방향",
    sumVal: "중심선 방향, 크기 2T cos β",
    drum: "드럼 (입력)",
    pulley: "풀리 (출력)",
    help: "드럼에는 케이블 한 가닥이 여러 번 감겨 있고, 양 끝(빨강, 파랑)이 풀리에 고정됩니다. 드럼을 돌리면 한쪽은 감겨 들어오고 다른 쪽은 풀려 나가므로 감긴 횟수는 그대로입니다. 대신 감긴 나선 전체가 축 방향으로 이동하고(cable walk), 풀리 홈은 제자리에 있으므로 자유 구간이 fleet angle만큼 기울어집니다. 정면도에서 케이블 옆 화살표는 입력 각도를 마지막으로 움직인 방향에 따라 케이블이 움직이는 방향입니다. 드럼 중심의 화살표는 각 가닥이 드럼 축을 당기는 방향(단위 벡터)이고, 회색 점선은 두 장력이 같을 때의 합력 방향입니다.",
    note: `교육용 기구학 모델입니다. 드럼 반지름 r = ${r} mm, 감은 횟수 ${K}회로 고정했습니다. 케이블은 늘어나지 않고 드럼과 풀리 위에서 미끄러지지 않습니다. 두 가닥은 두 원의 내접선(교차 배치)을 따라가므로 sin β = (r + R) / d이고, θ_out = −θ_in / N입니다. 풀리 홈은 중립 위치(θ_in = 0)에서 두 가닥과 일직선이 되도록 놓았으므로, fleet angle은 중립에서 0이고 행정 양 끝에서 가장 큽니다. Fleet angle은 축에 수직인 평면을 기준으로 잰 값이며, 나선 홈을 기준으로 한 각(λ만큼 어긋남)은 구분하지 않았습니다. 두 가닥의 풀리 홈 간격은 피치와 β에 따라 함께 바뀌므로, 슬라이더를 바꾸는 것은 풀리를 새로 설계하는 것과 같습니다. 위에서 본 모습은 투영이라 그림 속 기울기는 실제 fleet angle보다 크게 보입니다. 표시값 α_f는 실제 자유 구간 길이 L로 계산합니다. 힘의 크기, 마찰, capstan 효과는 넣지 않았습니다. 케이블 지름은 ${DC} mm로 고정했고, 피치 각 계산과 피치의 최소값에만 쓰며 그림에는 반영하지 않았습니다. 출력 범위는 ±${OUT_LIM}°입니다.`,
  },
  en: {
    eyebrow: "Interactive example · Antagonistic capstan drive",
    title: "Tension direction and cable walk",
    N: "Ratio N = R / r",
    d: "Centre distance d",
    th: "Input angle θ_in",
    p: "Pitch distance p",
    details: "Details: cable pitch",
    pitchGroup: `Drum pitch. The pitch distance p is the axial advance per turn and the pitch angle λ follows from it (tan λ = p / 2π(r + d_c/2), cable diameter d_c = ${DC} mm). p is kept at d_c or more so that neighbouring turns do not overlap.`,
    term: "Hollow dots are terminations on the underside of the pulley (hidden from above).",
    front: "Front view",
    top: "Top view (axis direction is vertical)",
    out: "Output angle θ_out",
    span: "Angle β between cable and centre line",
    free: "Free span length L",
    walk: "Cable walk p·θ_in / 360°",
    fleet: "Fleet angle α_f = atan(walk / L)",
    fleetRange: "Fleet angle at the ends of the stroke",
    sum: "Resultant for equal tensions",
    sumVal: "along the centre line, 2T cos β",
    drum: "Drum (input)",
    pulley: "Pulley (output)",
    help: "One cable is wound several turns on the drum and both ends (red, blue) are fixed to the pulley. Turning the drum reels one strand in and pays the other out, so the number of turns stays the same. Instead the whole helix moves along the drum axis (cable walk), and since the pulley grooves stay put, the free spans lean by the fleet angle. In the front view the arrows beside the cable show which way it moves, following the last change of the input angle. The arrows at the drum centre are the directions (unit vectors) in which each strand pulls the drum shaft; the grey dashed arrow is the resultant when both tensions are equal.",
    note: `Teaching kinematics model. Drum radius r = ${r} mm and ${K} turns are fixed. The cable is inextensible and does not slip on the drum or the pulley. Both strands follow the internal (crossed) tangents, so sin β = (r + R) / d and θ_out = −θ_in / N. The pulley grooves line up with both strands at the neutral position (θ_in = 0), so the fleet angle is zero there and largest at the ends of the stroke. The fleet angle is measured from the plane normal to the axis; the angle relative to the helical groove (offset by λ) is not distinguished. The groove spacing on the pulley follows the pitch and β, so moving those sliders amounts to redesigning the pulley. The top view is a projection, so the lean in the drawing looks larger than the true fleet angle; the value α_f uses the true free span length L. Force magnitude, friction and the capstan effect are not modeled. The cable diameter is fixed at ${DC} mm and used only for the pitch angle and the minimum pitch, not in the drawing. The output range is ±${OUT_LIM}°.`,
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
  const [dir, setDir] = useState<1 | -1>(1); // sign of the last change of theta_in (direction of cable motion)
  const [p, setP] = useState(3);
  const lam = pToLam(p);

  const R = N * r;
  const d = Math.max(dRaw, r + R + GAP);
  const thLim = OUT_LIM * N;
  const th = Math.max(-thLim, Math.min(thLim, thRaw));
  const out = -th / N;
  const sinP = (r + R) / d;
  const cosP = Math.sqrt(1 - sinP * sinP);
  const alpha = (Math.acos(sinP) * 180) / Math.PI; // red leaves the drum at +alpha, blue at -alpha
  const phi = 90 - alpha;
  const L = Math.sqrt(d * d - (r + R) ** 2);
  const walk = (p * th) / 360; // mm
  const fleetAt = (theta: number) => (Math.atan((p * theta) / 360 / L) * 180) / Math.PI; // signed, same for both strands
  const fleet = fleetAt(th);
  const fleetMax = fleetAt(thLim); // symmetric: -fleetMax at -thLim

  // the scale shrinks so that a large pulley or a long centre distance still fits; a scale bar shows it
  const PX = Math.min(PX_MAX, (VW - 60) / (r + d + R), FRONT_HALF / R);
  const X1 = (VW - (r + d + R) * PX) / 2 + r * PX;
  const sx = (x: number) => X1 + x * PX;
  const sy = (y: number) => YC - y * PX; // front view, y up
  const ty = (z: number) => YT - z * PX; // top view, z up
  const F = (cx: number, rr: number, deg: number) => ({ x: sx(cx + rr * Math.cos(rad(deg))), y: sy(rr * Math.sin(rad(deg))) });
  const poly = (pts: { x: number; y: number }[]) => pts.map((q, i) => `${i ? "L" : "M"}${q.x.toFixed(2)} ${q.y.toFixed(2)}`).join(" ");
  const arc = (cx: number, rr: number, from: number, to: number) => {
    const n = Math.max(2, Math.ceil(Math.abs(to - from) / 4));
    return poly(Array.from({ length: n + 1 }, (_, i) => F(cx, rr, from + ((to - from) * i) / n)));
  };

  // ---- drum helix: material angle beta (drum frame) from bR to bB, spatial angle gamma = beta + th ----
  const zOf = (beta: number) => (-p * (beta - 180 * K)) / 360; // handedness chosen so the walk is +p*theta/360
  const bR = alpha - th;
  const bB = 360 * K - alpha - th;
  const bM = (bR + bB) / 2;
  const zR = zOf(bR);
  const zB = zOf(bB);
  const zR0 = zOf(alpha); // departure points at theta = 0
  const zB0 = zOf(360 * K - alpha);
  const zGR = zR0; // pulley grooves, aligned with the strands at the neutral position
  const zGB = zB0;
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
  const helixR = helix(bR, bM);
  const helixB = helix(bM, bB);
  // wrap on the pulley seen from above: angle gamma from the tangent to the anchor, at a fixed groove height
  const pulleyWrap = (from: number, to: number, z: number) => {
    const runs: { vis: boolean; d: string }[] = [];
    let cur: { x: number; y: number }[] = [];
    let vis: boolean | null = null;
    const n = Math.max(2, Math.ceil(Math.abs(to - from) / 5));
    for (let i = 0; i <= n; i++) {
      const g = from + ((to - from) * i) / n;
      const q = { x: sx(d + R * Math.cos(rad(g))), y: ty(z) };
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
  const T2R = F(d, R + 0.8, 180 + alpha);
  const T1B = F(0, r + 1.2, -alpha);
  const T2B = F(d, R + 2.4, 180 - alpha);
  const aR = 180 + alpha + W0 + out; // red anchor on the pulley (wraps CCW from its tangent)
  const aB = 180 - alpha - W0 + out; // blue anchor (wraps CW)
  const endR = F(d, R + 0.8, aR);
  const endB = F(d, R + 2.4, aB);
  const uR = { x: cosP, y: sinP }; // SVG direction drum -> pulley along the red span
  const uB = { x: cosP, y: -sinP };
  // cable motion along the free spans: theta_in increasing (drum CCW) reels red in toward the drum and pays
  // blue out toward the pulley; arrows sit just beside each span
  const motion = (a: { x: number; y: number }, b: { x: number; y: number }, toB: boolean, side: number) => {
    const L2 = Math.hypot(b.x - a.x, b.y - a.y);
    const ex = (b.x - a.x) / L2;
    const ey = (b.y - a.y) / L2;
    const nx = -ey * side * 9;
    const ny = ex * side * 9;
    const s = toB ? 1 : -1;
    return [0.55, 0.82].map((f) => { // past the crossing point, which sits at r / (r + R) of the span
      const cx = a.x + (b.x - a.x) * f + nx;
      const cy = a.y + (b.y - a.y) * f + ny;
      return { x: cx - (s * ex * 22) / 2, y: cy - (s * ey * 22) / 2, dx: s * ex * 22, dy: s * ey * 22 };
    });
  };

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
  const xGr = d - R * Math.cos(rad(alpha)); // x of both tangent points on the pulley
  const hP = Math.max(Math.abs(zGR), Math.abs(zGB)) + 4; // mm, half width drawn for the pulley

  return (
    <section className="signal-demo cable-demo" aria-label={t.title}>
      <header className="signal-demo-heading">
        <span className="eyebrow">{t.eyebrow}</span>
        <h3>{t.title}</h3>
      </header>
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
          <input id={`${id}-th`} type="range" min={-thLim} max={thLim} step="1" value={th} onChange={(e) => {
              const v = Number(e.target.value);
              if (v !== th) setDir(v > th ? 1 : -1);
              setTh(v);
            }}
          />
        </div>
      </div>
      <details className="cable-details">
        <summary>{t.details}</summary>
        <p className="cable-details-group">{t.pitchGroup}</p>
        <div className="cable-controls">
          <div>
            <label htmlFor={`${id}-p`}>
              {t.p}{" "}
              <strong>
                {p.toFixed(2)} mm · λ {lam.toFixed(2)}°
              </strong>
            </label>
            <input id={`${id}-p`} type="range" min={P_MIN} max={P_MAX} step="0.01" value={p} onChange={(ev) => setP(Number(ev.target.value))} />
          </div>
        </div>
      </details>

      <svg className="cable-demo-svg" viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={`${t.fleet} ${fleet.toFixed(2)}°`}>
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
          <path d={arc(d, R + 0.8, 180 + alpha, aR)} stroke={COLORS.red} />
          <line x1={T1B.x} y1={T1B.y} x2={T2B.x} y2={T2B.y} stroke={COLORS.blue} />
          <path d={arc(d, R + 2.4, 180 - alpha, aB)} stroke={COLORS.blue} />
        </g>
        <circle cx={endR.x} cy={endR.y} r="4" fill={COLORS.red} />
        <circle cx={endB.x} cy={endB.y} r="4" fill={COLORS.blue} />
        {motion(T1R, T2R, dir < 0, 1).map((m, i) => (
          <Arrow key={`mr${i}`} x={m.x} y={m.y} dx={m.dx} dy={m.dy} color={COLORS.red} marker="r" />
        ))}
        {motion(T1B, T2B, dir > 0, -1).map((m, i) => (
          <Arrow key={`mb${i}`} x={m.x} y={m.y} dx={m.dx} dy={m.dy} color={COLORS.blue} marker="b" />
        ))}
        <Arrow x={sx(0)} y={YC} dx={uR.x * UNIT} dy={uR.y * UNIT} color={COLORS.red} marker="r" />
        <Arrow x={sx(0)} y={YC} dx={uB.x * UNIT} dy={uB.y * UNIT} color={COLORS.blue} marker="b" />
        <Arrow x={sx(0)} y={YC} dx={2 * cosP * UNIT} dy={0} color={COLORS.sum} marker="s" dashed />
        <Arrow x={sx(d)} y={YC} dx={-2 * cosP * UNIT} dy={0} color={COLORS.sum} marker="s" dashed />
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
        <rect x={sx(-r)} y={ty(H)} width={2 * r * PX} height={2 * H * PX} rx="6" fill="var(--surface, #fff)" stroke={COLORS.pulley} strokeWidth="2" />
        <rect x={sx(d - R)} y={ty(hP)} width={2 * R * PX} height={2 * hP * PX} rx="6" fill="var(--surface, #fff)" stroke={COLORS.pulley} strokeWidth="2" />
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
        {/* pulley grooves: each strand stays on its groove */}
        {/* wrap on the pulley and the termination point of each strand */}
        {(
          [
            [pulleyWrap(180 + alpha, aR, zGR), COLORS.red, aR, zGR],
            [pulleyWrap(180 - alpha, aB, zGB), COLORS.blue, aB, zGB],
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
        <line x1={sx(xDep)} y1={ty(zR0)} x2={sx(xGr)} y2={ty(zGR)} stroke={COLORS.red} strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
        <line x1={sx(xDep)} y1={ty(zB0)} x2={sx(xGr)} y2={ty(zGB)} stroke={COLORS.blue} strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
        <g strokeWidth="2.4" strokeLinecap="round">
          <line x1={sx(xDep)} y1={ty(zR)} x2={sx(xGr)} y2={ty(zGR)} stroke={COLORS.red} />
          <line x1={sx(xDep)} y1={ty(zB)} x2={sx(xGr)} y2={ty(zGB)} stroke={COLORS.blue} />
        </g>
        <circle cx={sx(xDep)} cy={ty(zR)} r="3.5" fill={COLORS.red} />
        <circle cx={sx(xDep)} cy={ty(zB)} r="3.5" fill={COLORS.blue} />
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
          {t.fleet} <strong>{fmt(fleet, 2)}°</strong>
        </span>
        <span>
          {t.fleetRange}{" "}
          <strong>
            ±{fleetMax.toFixed(2)}°
          </strong>
        </span>
        <span>
          {t.sum} <strong>{t.sumVal}</strong>
        </span>
      </output>
      <p className="demo-help">
        {t.help} {t.term}
      </p>
      <p className="demo-model-note">{t.note}</p>
    </section>
  );
}
