import { useRef, useState, type PointerEvent, type ReactNode } from "react";

// End-effector inertia ellipses of a 2-DoF planar arm with geared joints, after Sim & Ramos (arXiv:2106.01842).
// Joint space:  links only  M_L(q)
//               FWD         M_L(q) / eta_f + R      (motor drives, link side seen through forward losses)
//               BWD         M_L(q) + R / eta_b      (environment backdrives, rotor side seen through backward losses)
// with R = diag(N^2 J_m) the reflected rotor inertia and eta_b = 2 - 1/eta_f (single-mesh approximation).
// Task space:   Lambda^-1 = J M^-1 J^T; the ellipse x^T Lambda^-1 x = k^2 has radius k sqrt(m_u) in direction u,
// where m_u = 1 / (u^T Lambda^-1 u) is the effective mass felt when pushing the tip along u.

type Lang = "ko" | "en";
const DEG = Math.PI / 180;
const L1 = 0.3;
const L2 = 0.3; // m
const M1 = 1.2;
const M2 = 0.8; // kg, uniform rods
const JM = 1e-5; // kg m^2, series example rotor inertia
const COLORS = { link: "#6b7280", fwd: "#2563eb", bwd: "#c2410c", arm: "#374151" };

const text = {
  ko: {
    eyebrow: "직접 조작 · 감속비와 reflected inertia",
    title: "말단에서 느껴지는 관성은 감속비와 힘의 방향에 따라 달라진다",
    N: "감속비 N",
    eta: "정방향 효율 η_f",
    q1: "어깨 각 q_1",
    q2: "팔꿈치 각 q_2",
    drag: "팔 끝을 끌어 자세를 바꿀 수 있습니다",
    link: "링크만 (로터 없음)",
    fwd: "FWD · 모터가 구동",
    bwd: "BWD · 외력이 역구동",
    nonback: "η_b ≤ 0: 역구동되지 않음",
    col: ["effective mass", "최소", "최대"],
    short: { link: "링크만", fwd: "FWD", bwd: "BWD" },
    etab: "역방향 효율 η_b",
    refl: "관절당 reflected inertia N²J_m",
    note:
      "링크 길이 0.3 m, 질량 1.2 kg·0.8 kg의 균일 막대로 된 2자유도 평면 팔입니다. 두 관절에 같은 모터(J_m = 1×10⁻⁵ kg·m²)와 같은 감속비를 달았고, 역방향 효율은 단일 치합 근사 η_b = 2 − 1/η_f로 계산했습니다. 타원의 반지름은 그 방향으로 팔 끝을 밀 때 느껴지는 effective mass의 제곱근에 비례합니다. FWD·BWD 관성 식은 Sim & Ramos(2021)를 따르며, 중력과 로터의 자이로 효과는 무시했습니다.",
  },
  en: {
    eyebrow: "Try it · Gear ratio and reflected inertia",
    title: "The inertia felt at the tip depends on the gear ratio and on which way power flows",
    N: "Gear ratio N",
    eta: "Forward efficiency η_f",
    q1: "Shoulder angle q_1",
    q2: "Elbow angle q_2",
    drag: "Drag the tip to change the pose",
    link: "links only (no rotor)",
    fwd: "FWD · motor drives",
    bwd: "BWD · environment backdrives",
    nonback: "η_b ≤ 0: not backdrivable",
    col: ["effective mass", "min", "max"],
    short: { link: "links only", fwd: "FWD", bwd: "BWD" },
    etab: "Backward efficiency η_b",
    refl: "Reflected inertia per joint N²J_m",
    note:
      "2-DoF planar arm of uniform rods, 0.3 m long, 1.2 kg and 0.8 kg. Both joints use the same motor (J_m = 1×10⁻⁵ kg·m²) and ratio; backward efficiency uses the single-mesh approximation η_b = 2 − 1/η_f. The ellipse radius is proportional to the square root of the effective mass felt when pushing the tip in that direction. FWD/BWD inertia follows Sim & Ramos (2021); gravity and rotor gyroscopic effects are ignored.",
  },
};

type M2x2 = [number, number, number, number]; // a b ; c d
const inv = ([a, b, c, d]: M2x2): M2x2 => {
  const det = a * d - b * c;
  return [d / det, -b / det, -c / det, a / det];
};
const mul = ([a, b, c, d]: M2x2, [e, f, g, h]: M2x2): M2x2 => [a * e + b * g, a * f + b * h, c * e + d * g, c * f + d * h];
const tr = ([a, b, c, d]: M2x2): M2x2 => [a, c, b, d];

function linkMass(q2: number): M2x2 {
  const I1 = (M1 * L1 * L1) / 12;
  const I2 = (M2 * L2 * L2) / 12;
  const c1 = L1 / 2;
  const c2 = L2 / 2;
  const cq = Math.cos(q2);
  const m11 = I1 + M1 * c1 * c1 + I2 + M2 * (L1 * L1 + c2 * c2 + 2 * L1 * c2 * cq);
  const m12 = I2 + M2 * (c2 * c2 + L1 * c2 * cq);
  const m22 = I2 + M2 * c2 * c2;
  return [m11, m12, m12, m22];
}
function jac(q1: number, q2: number): M2x2 {
  const s1 = Math.sin(q1);
  const c1 = Math.cos(q1);
  const s12 = Math.sin(q1 + q2);
  const c12 = Math.cos(q1 + q2);
  return [-L1 * s1 - L2 * s12, -L2 * s12, L1 * c1 + L2 * c12, L2 * c12];
}
// eigen-decomposition of a symmetric 2x2 (Lambda^-1) -> ellipse semi-axes sqrt(1/lambda) along eigenvectors
function ellipse(LamInv: M2x2) {
  const [a, b, , d] = LamInv;
  const m = (a + d) / 2;
  const r = Math.sqrt(((a - d) / 2) ** 2 + b * b);
  const l1 = m + r;
  const l2 = m - r;
  const ang = 0.5 * Math.atan2(2 * b, a - d); // direction of l1
  return { ang, mMin: 1 / l1, mMax: 1 / l2 };
}

function rich(str: string) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of str.matchAll(/([A-Za-zη])_([a-z0-9]+)/g)) {
    out.push(str.slice(last, m.index!), m[1], <sub key={m.index}>{m[2]}</sub>);
    last = m.index! + m[0].length;
  }
  out.push(str.slice(last));
  return out;
}

// scene geometry
const VW = 440;
const VH = 330;
const BASE: [number, number] = [170, 250];
const PXM = 300; // px per metre
const K = 40; // px per sqrt(kg)

export default function ReflectedInertiaDemo({ lang = "ko" }: { lang?: Lang }) {
  const t = text[lang];
  const [N, setN] = useState(50);
  const [ef, setEf] = useState(0.75);
  const [q1, setQ1] = useState(25);
  const [q2, setQ2] = useState(95);
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const eb = 2 - 1 / ef;
  const R = N * N * JM;
  const qa = q1 * DEG;
  const qb = q2 * DEG;
  const ML = linkMass(qb);
  const J = jac(qa, qb);
  const cases: { key: "link" | "fwd" | "bwd"; M: M2x2 | null }[] = [
    { key: "link", M: ML },
    { key: "fwd", M: [ML[0] / ef + R, ML[1] / ef, ML[2] / ef, ML[3] / ef + R] },
    { key: "bwd", M: eb > 0 ? [ML[0] + R / eb, ML[1], ML[2], ML[3] + R / eb] : null },
  ];
  const ells = cases.map((c) => (c.M ? { ...c, e: ellipse(mul(mul(J, inv(c.M)), tr(J))) } : { ...c, e: null }));

  const elbow: [number, number] = [BASE[0] + PXM * L1 * Math.cos(qa), BASE[1] - PXM * L1 * Math.sin(qa)];
  const tip: [number, number] = [elbow[0] + PXM * L2 * Math.cos(qa + qb), elbow[1] - PXM * L2 * Math.sin(qa + qb)];

  const ellPath = (e: { ang: number; mMin: number; mMax: number }) => {
    const a = K * Math.sqrt(e.mMin); // along the l1 eigenvector (smallest effective mass)
    const b = K * Math.sqrt(e.mMax);
    const pts: string[] = [];
    for (let i = 0; i <= 64; i++) {
      const p = (i / 64) * 2 * Math.PI;
      const x = a * Math.cos(p);
      const y = b * Math.sin(p);
      const X = x * Math.cos(e.ang) - y * Math.sin(e.ang);
      const Y = x * Math.sin(e.ang) + y * Math.cos(e.ang);
      pts.push(`${(tip[0] + X).toFixed(1)},${(tip[1] - Y).toFixed(1)}`);
    }
    return pts.join(" ");
  };

  // drag the tip: inverse kinematics keeping the elbow on the same side
  const onMove = (ev: PointerEvent<SVGSVGElement>) => {
    if (!dragging.current || !svg.current) return;
    const pt = svg.current.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    const p = pt.matrixTransform(svg.current.getScreenCTM()!.inverse());
    let x = (p.x - BASE[0]) / PXM;
    let y = (BASE[1] - p.y) / PXM;
    const r = Math.hypot(x, y);
    const rMax = Math.sqrt(L1 * L1 + L2 * L2 + 2 * L1 * L2 * Math.cos(15 * DEG)); // elbow limit 15 deg
    const rMin = Math.sqrt(L1 * L1 + L2 * L2 + 2 * L1 * L2 * Math.cos(160 * DEG)); // elbow limit 160 deg
    const rc = Math.max(rMin, Math.min(rMax, r || rMin));
    x *= rc / r;
    y *= rc / r;
    const c2 = (x * x + y * y - L1 * L1 - L2 * L2) / (2 * L1 * L2);
    const b = Math.acos(Math.max(-1, Math.min(1, c2)));
    const a = Math.atan2(y, x) - Math.atan2(L2 * Math.sin(b), L1 + L2 * Math.cos(b));
    setQ1(Math.round(Math.max(-30, Math.min(150, a / DEG))));
    setQ2(Math.round(Math.max(15, Math.min(160, b / DEG))));
  };

  const slider = (label: string, value: number, set: (v: number) => void, min: number, max: number, step: number, unit: string, digits = 0) => (
    <div className="foc-control">
      <label>
        <span>{rich(label)}</span>{" "}
        <strong>
          {value.toFixed(digits)}
          {unit}
        </strong>
      </label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(+e.target.value)} />
    </div>
  );

  const color = { link: COLORS.link, fwd: COLORS.fwd, bwd: COLORS.bwd };

  return (
    <section className="signal-demo foc-demo ri-demo" aria-label={t.title}>
      <header className="signal-demo-heading">
        <span className="eyebrow">{t.eyebrow}</span>
        <h3>{t.title}</h3>
      </header>

      <div className="ri-ellipse-layout">
        <figure className="ri-arm">
          <svg
            ref={svg}
            viewBox={`0 0 ${VW} ${VH}`}
            style={{ overflow: "hidden" }}
            role="img"
            aria-label={t.title}
            onPointerMove={onMove}
            onPointerUp={() => (dragging.current = false)}
            onPointerLeave={() => (dragging.current = false)}
          >
            <line x1={20} x2={VW - 20} y1={BASE[1] + 26} y2={BASE[1] + 26} stroke="#c9ccc4" />
            <rect x={BASE[0] - 22} y={BASE[1] + 8} width={44} height={18} rx={3} fill="#d9dcd5" />
            {ells.map(({ key, e }) =>
              e ? (
                <polygon
                  key={key}
                  points={ellPath(e)}
                  fill={color[key]}
                  fillOpacity={key === "link" ? 0.08 : 0.1}
                  stroke={color[key]}
                  strokeWidth={key === "link" ? 1.4 : 2.2}
                  strokeDasharray={key === "link" ? "4 3" : undefined}
                />
              ) : null
            )}
            <line x1={BASE[0]} y1={BASE[1]} x2={elbow[0]} y2={elbow[1]} stroke={COLORS.arm} strokeWidth={10} strokeLinecap="round" />
            <line x1={elbow[0]} y1={elbow[1]} x2={tip[0]} y2={tip[1]} stroke={COLORS.arm} strokeWidth={8} strokeLinecap="round" strokeOpacity={0.85} />
            <circle cx={BASE[0]} cy={BASE[1]} r={9} fill="#fff" stroke={COLORS.arm} strokeWidth={3} />
            <circle cx={elbow[0]} cy={elbow[1]} r={7} fill="#fff" stroke={COLORS.arm} strokeWidth={3} />
            <circle
              cx={tip[0]}
              cy={tip[1]}
              r={9}
              fill="#111827"
              style={{ cursor: "grab", touchAction: "none" }}
              onPointerDown={(e) => {
                dragging.current = true;
                (e.target as Element).setPointerCapture?.(e.pointerId);
              }}
            />
          </svg>
          <figcaption>{t.drag}</figcaption>
        </figure>

        <div className="ri-side">
          <div className="ri-legend">
            <span style={{ color: COLORS.link }}>┄ {t.link}</span>
            <span style={{ color: COLORS.fwd }}>━ {t.fwd}</span>
            <span style={{ color: COLORS.bwd }}>━ {t.bwd}</span>
          </div>
          <table className="ri-table">
            <thead>
              <tr>
                {t.col.map((c, i) => (
                  <th key={i}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ells.map(({ key, e }) => (
                <tr key={key}>
                  <td style={{ color: color[key] }}>{t.short[key]}</td>
                  {e ? (
                    <>
                      <td>{e.mMin.toFixed(2)} kg</td>
                      <td>{e.mMax.toFixed(2)} kg</td>
                    </>
                  ) : (
                    <td colSpan={2}>{rich(t.nonback)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <output className="can-readout" aria-live="polite">
            <span>
              {rich(t.refl)}
              <strong>{R.toFixed(4)} kg·m²</strong>
            </span>
            <span>
              {rich(t.etab)}
              <strong>{eb > 0 ? eb.toFixed(2) : "≤ 0"}</strong>
            </span>
          </output>
        </div>
      </div>

      <div className="foc-controls">
        {slider(t.N, N, setN, 1, 150, 1, "")}
        {slider(t.eta, ef, setEf, 0.6, 1, 0.01, "", 2)}
        {slider(t.q1, q1, setQ1, -30, 150, 1, "°")}
        {slider(t.q2, q2, setQ2, 15, 160, 1, "°")}
      </div>
      <p className="demo-model-note">{rich(t.note)}</p>
    </section>
  );
}
