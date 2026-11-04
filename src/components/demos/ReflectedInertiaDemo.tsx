import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";

// End-effector inertia ellipses of a 2-DoF planar arm with geared joints, after Sim & Ramos (arXiv:2106.01842).
// Joint space:  links only  M_L(q)
//               FWD         M_L(q) / eta_f + R      (motor drives, link side seen through forward losses)
//               BWD         M_L(q) + R / eta_b      (environment backdrives, rotor side seen through backward losses)
// with R = diag(N^2 J_m) the reflected rotor inertia and eta_b = 2 - 1/eta_f (single-mesh approximation).
// Task space:   Lambda^-1 = J M^-1 J^T; the ellipse x^T Lambda^-1 x = k^2 has radius k sqrt(m_u) in direction u,
// where m_u = 1 / (u^T Lambda^-1 u) is the effective mass felt when pushing the tip along u.
// Ball: a ball of fixed mass and speed hits the tip along d. Impulse P = (1+e) m_b m_d/(m_b+m_d) v
// with the BWD effective mass m_d; the tip gets dx = Lambda^-1 d P (not necessarily along d) and the
// joints dq = M^-1 J^T d P. After the hit each joint is held by a PD controller (KP_HOLD, damping
// ratio 0.7 on its own diagonal inertia), simulated on the constant inertia matrix of the pose.

type Lang = "ko" | "en";
const DEG = Math.PI / 180;
const L1 = 0.3;
const L2 = 0.3; // m
const M1 = 1.2;
const M2 = 0.8; // kg, uniform rods
const JM = 1e-5; // kg m^2, series example rotor inertia
const COLORS = { link: "#6b7280", fwd: "#2563eb", bwd: "#c2410c", arm: "#374151", ball: "#f8fafc", seam: "#dc2626" };
const BALL_M = 1; // kg
const BALL_V = 3; // m/s
const BALL_E = 0.85; // restitution
const KP_HOLD = 50; // N m/rad per joint, position controller that holds the pose
const RESP_T = 0.6; // s simulated after the hit
const RESP_DT = 1e-3;
const START = 0.5; // m, ball start distance from the tip
const AFTER = RESP_T; // s, shown after the hit
// travel directions of the ball, 45 deg apart; launch arrows sit around the tip
const DIRS = [0, 45, 90, 135, 180, 225, 270, 315];
const ARROW_R = 62; // px from the tip to the arrow tail

const text = {
  en: {
    eyebrow: "Interactive example · Gear ratio and reflected inertia",
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
    throw: `Click an arrow around the tip to throw a ball (${BALL_M} kg, ${BALL_V} m/s)`,
    apply: "Click to apply disturbance",
    mu: "Effective mass along the throw (BWD)",
    after: "Ball at the end",
    kick: "Tip kick speed",
    off: "Kick angle off the throw line",
    hint: "Click an arrow to throw the ball",
    hits: "Contacts",
    locked: "joints locked (η_b ≤ 0)",
    resp: "Tip displacement after the hit [mm] · along the throw (solid), across it (dashed)",
    respX: "Time after the hit [ms]",
    note: "2-DoF planar arm of uniform rods, 0.3 m long, 1.2 kg and 0.8 kg. Both joints use the same motor (J_m = 1×10⁻⁵ kg·m²) and ratio; backward efficiency uses the single-mesh approximation η_b = 2 − 1/η_f. The ellipse radius is proportional to the square root of the effective mass felt when pushing the tip in that direction. FWD/BWD inertia follows Sim & Ramos (2021); gravity and rotor gyroscopic effects are ignored. The ball hit uses the BWD inertia with restitution 0.85. After the hit each joint is held by a PD controller (K_p = 50 N·m/rad, damping ratio 0.7) and the ball and arm are simulated together on the inertia matrix of the current pose (small-motion linearization), so a heavy ball that keeps going can be hit again by the returning arm.",
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

// Ball + arm, simulated together from launch so repeated contacts are handled (e.g. the arm,
// pulled back by its controller, catching up with a heavy ball that kept going).
// Arm: constant joint inertia M (BWD), per-joint PD hold; tip displacement x = J q (small motion).
// Contact: impulse along the line of centres with restitution BALL_E and the tip effective mass
// along that line, m_n = 1 / (n^T Lambda^-1 n). M = null: joints locked (not backdrivable).
const R_SUM = (9 + 13) / 300; // m, drawn tip and ball radii
function throwSim(M: M2x2 | null, J: M2x2, d: [number, number]) {
  const n = Math.round((START / BALL_V + RESP_T) / RESP_DT);
  const Mi = M ? inv(M) : null;
  const LamInv = Mi ? mul(mul(J, Mi), tr(J)) : null;
  const kd = M ? [2 * 0.7 * Math.sqrt(KP_HOLD * M[0]), 2 * 0.7 * Math.sqrt(KP_HOLD * M[3])] : [0, 0];
  let q = [0, 0];
  let v = [0, 0];
  let p = [-d[0] * (START + R_SUM), -d[1] * (START + R_SUM)];
  let vb = [BALL_V * d[0], BALL_V * d[1]];
  const qs: [number, number][] = [];
  const ps: [number, number][] = [];
  let hits = 0;
  let kHit = -1;
  let md = Infinity;
  let kick: [number, number] = [0, 0];
  for (let k = 0; k <= n; k++) {
    qs.push([q[0], q[1]]);
    ps.push([p[0], p[1]]);
    if (Mi) {
      const f = [-KP_HOLD * q[0] - kd[0] * v[0], -KP_HOLD * q[1] - kd[1] * v[1]];
      v = [v[0] + RESP_DT * (Mi[0] * f[0] + Mi[1] * f[1]), v[1] + RESP_DT * (Mi[2] * f[0] + Mi[3] * f[1])];
      q = [q[0] + RESP_DT * v[0], q[1] + RESP_DT * v[1]];
    }
    p = [p[0] + RESP_DT * vb[0], p[1] + RESP_DT * vb[1]];
    const x = [J[0] * q[0] + J[1] * q[1], J[2] * q[0] + J[3] * q[1]];
    const xd = [J[0] * v[0] + J[1] * v[1], J[2] * v[0] + J[3] * v[1]];
    const r = [p[0] - x[0], p[1] - x[1]];
    const dist = Math.hypot(r[0], r[1]);
    if (dist >= R_SUM) continue;
    const nn = [r[0] / dist, r[1] / dist]; // from tip to ball
    const vrel = (vb[0] - xd[0]) * nn[0] + (vb[1] - xd[1]) * nn[1];
    if (vrel >= 0) continue;
    const mn = LamInv ? 1 / (nn[0] * (LamInv[0] * nn[0] + LamInv[1] * nn[1]) + nn[1] * (LamInv[2] * nn[0] + LamInv[3] * nn[1])) : Infinity;
    const mRed = Number.isFinite(mn) ? (BALL_M * mn) / (BALL_M + mn) : BALL_M;
    const P = -(1 + BALL_E) * vrel * mRed;
    vb = [vb[0] + (P * nn[0]) / BALL_M, vb[1] + (P * nn[1]) / BALL_M];
    if (Mi) {
      const JTn = [-(J[0] * nn[0] + J[2] * nn[1]) * P, -(J[1] * nn[0] + J[3] * nn[1]) * P];
      const dv = [Mi[0] * JTn[0] + Mi[1] * JTn[1], Mi[2] * JTn[0] + Mi[3] * JTn[1]];
      v = [v[0] + dv[0], v[1] + dv[1]];
      if (hits === 0) kick = [J[0] * dv[0] + J[1] * dv[1], J[2] * dv[0] + J[3] * dv[1]];
    }
    if (hits === 0) {
      kHit = k;
      md = mn;
    }
    hits++;
  }
  const vbAlong = vb[0] * d[0] + vb[1] * d[1]; // final ball velocity along the throw; negative = back
  return { d, md, vbAlong, kick, hits, kHit, qs, ps, locked: !M };
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

// Demo text is English on every page; `lang` is accepted for compatibility with existing posts.
export default function ReflectedInertiaDemo(_props: { lang?: Lang }) {
  const t = text.en;
  const [N, setN] = useState(50);
  const [ef, setEf] = useState(0.75);
  const [q1, setQ1] = useState(25);
  const [q2, setQ2] = useState(95);
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const [shot, setShot] = useState<{ dir: number; id: number } | null>(null);
  const [tNow, setTNow] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    if (!shot) return;
    let start: number | undefined;
    const total = START / BALL_V + AFTER;
    const tick = (now: number) => {
      start ??= now;
      const e = (now - start) / 1000;
      setTNow(Math.min(e, total));
      if (e < total) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [shot]);

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

  // ---- ball hit (BWD inertia: the environment backdrives the joints) ----
  const Mb = cases[2].M;
  const hit = useMemo(() => (shot ? throwSim(Mb, J, [Math.cos(shot.dir * DEG), Math.sin(shot.dir * DEG)]) : null), [shot, N, ef, q1, q2]); // eslint-disable-line react-hooks/exhaustive-deps
  const kNow = hit ? Math.min(hit.qs.length - 1, Math.round(tNow / RESP_DT)) : -1;
  const qaD = qa + (hit ? hit.qs[kNow][0] : 0);
  const qbD = qb + (hit ? hit.qs[kNow][1] : 0);
  // tip displacement along / across the throw (mm) from the first hit, linearized: dx = J dq
  const rB =
    hit && hit.kHit >= 0 && !hit.locked
      ? hit.qs.slice(hit.kHit, hit.kHit + Math.round(RESP_T / RESP_DT) + 1).map((dq) => {
          const x = J[0] * dq[0] + J[1] * dq[1];
          const y = J[2] * dq[0] + J[3] * dq[1];
          return [1000 * (x * hit.d[0] + y * hit.d[1]), 1000 * (-x * hit.d[1] + y * hit.d[0])] as [number, number];
        })
      : null;
  const kPlot = hit && hit.kHit >= 0 ? kNow - hit.kHit : -1;
  const elbowD: [number, number] = [BASE[0] + PXM * L1 * Math.cos(qaD), BASE[1] - PXM * L1 * Math.sin(qaD)];
  const tipD: [number, number] = [elbowD[0] + PXM * L2 * Math.cos(qaD + qbD), elbowD[1] - PXM * L2 * Math.sin(qaD + qbD)];
  const ball: [number, number] | null = hit ? [tip[0] + PXM * hit.ps[kNow][0], tip[1] - PXM * hit.ps[kNow][1]] : null;
  const kick = hit ? Math.hypot(hit.kick[0], hit.kick[1]) : 0;
  const offDeg =
    hit && kick > 0
      ? Math.abs((Math.atan2(hit.d[0] * hit.kick[1] - hit.d[1] * hit.kick[0], hit.d[0] * hit.kick[0] + hit.d[1] * hit.kick[1]) * 180) / Math.PI)
      : 0;

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
            <line x1={BASE[0]} y1={BASE[1]} x2={elbowD[0]} y2={elbowD[1]} stroke={COLORS.arm} strokeWidth={10} strokeLinecap="round" />
            <line
              x1={elbowD[0]}
              y1={elbowD[1]}
              x2={tipD[0]}
              y2={tipD[1]}
              stroke={COLORS.arm}
              strokeWidth={8}
              strokeLinecap="round"
              strokeOpacity={0.85}
            />
            <circle cx={BASE[0]} cy={BASE[1]} r={9} fill="#fff" stroke={COLORS.arm} strokeWidth={3} />
            <circle cx={elbowD[0]} cy={elbowD[1]} r={7} fill="#fff" stroke={COLORS.arm} strokeWidth={3} />
            {DIRS.map((dir) => {
              const ux = Math.cos(dir * DEG);
              const uy = -Math.sin(dir * DEG); // svg y down
              const x0 = tip[0] - ux * ARROW_R;
              const y0 = tip[1] - uy * ARROW_R;
              const x1 = tip[0] - ux * (ARROW_R - 26);
              const y1 = tip[1] - uy * (ARROW_R - 26);
              const on = shot?.dir === dir;
              const c = on ? COLORS.bwd : "#94a3b8";
              const hx = -uy;
              const hy = ux;
              return (
                <g
                  key={dir}
                  className="ri-arrow"
                  onClick={() => setShot({ dir, id: Date.now() })}
                  role="button"
                  aria-label={`throw ${dir}°`}
                  style={{ cursor: "pointer" }}
                >
                  <circle cx={(x0 + x1) / 2} cy={(y0 + y1) / 2} r={16} fill="transparent" />
                  <line x1={x0} y1={y0} x2={x1 - ux * 6} y2={y1 - uy * 6} stroke={c} strokeWidth={on ? 3 : 2.2} strokeLinecap="round" />
                  <polygon
                    points={`${x1},${y1} ${x1 - ux * 9 + hx * 5},${y1 - uy * 9 + hy * 5} ${x1 - ux * 9 - hx * 5},${y1 - uy * 9 - hy * 5}`}
                    fill={c}
                  />
                </g>
              );
            })}
            <text x={tip[0]} y={Math.max(14, tip[1] - ARROW_R - 10)} textAnchor="middle" className="ri-apply">
              {t.apply}
            </text>
            {ball && (
              <g>
                <circle cx={ball[0]} cy={ball[1]} r={13} fill={COLORS.ball} stroke="#64748b" strokeWidth={1.2} />
                <path
                  d={`M ${ball[0] - 6} ${ball[1] - 6} q 4 6 0 12 M ${ball[0] + 6} ${ball[1] - 6} q -4 6 0 12`}
                  fill="none"
                  stroke={COLORS.seam}
                  strokeWidth={1}
                />
              </g>
            )}
            <circle
              cx={tipD[0]}
              cy={tipD[1]}
              r={9}
              fill="#111827"
              style={{ cursor: "grab", touchAction: "none" }}
              onPointerDown={(e) => {
                dragging.current = true;
                setShot(null);
                (e.target as Element).setPointerCapture?.(e.pointerId);
              }}
            />
          </svg>
          <figcaption>
            {t.drag} · {t.throw}
          </figcaption>
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
          <div className="ri-throw">
            <output className="can-readout ri-hit" aria-live="polite">
              <span>
                {t.mu}
                <strong>{hit ? (Number.isFinite(hit.md) ? `${hit.md.toFixed(2)} kg` : "∞") : "–"}</strong>
              </span>
              <span>
                {t.after}
                <strong>{hit ? `${Math.abs(hit.vbAlong).toFixed(2)} m/s ${hit.vbAlong < 0 ? "back" : "on"}` : "–"}</strong>
              </span>
              <span>
                {t.kick}
                <strong>{hit ? (Number.isFinite(hit.md) ? `${kick.toFixed(2)} m/s` : rich(t.locked)) : "–"}</strong>
              </span>
              <span>
                {t.off}
                <strong>{hit && Number.isFinite(hit.md) ? `${offDeg.toFixed(0)}°` : "–"}</strong>
              </span>
              <span>
                {t.hits}
                <strong>{hit ? hit.hits : "–"}</strong>
              </span>
            </output>
          </div>
        </div>
      </div>

      {
        <div className="foc-charts ri-resp">
          <div className="foc-chart-title">{t.resp}</div>
          {(() => {
            const W = 640;
            const H = 170;
            const Lm = 44;
            const Bm = 26;
            // fixed scale so throws at different gear ratios compare directly; grows only if exceeded
            const all = rB ? rB.flat() : [0];
            const hi = Math.max(100, ...all.map((v) => v * 1.05));
            const lo = Math.min(-40, ...all.map((v) => v * 1.05));
            const nPts = Math.round(RESP_T / RESP_DT) + 1;
            const X = (k: number) => Lm + (k / (nPts - 1)) * (W - Lm - 10);
            const Y = (v: number) => 10 + ((hi - v) / (hi - lo)) * (H - 10 - Bm);
            const line = (r: [number, number][], i: 0 | 1, c: string, w: number, dash?: string) => (
              <polyline
                fill="none"
                stroke={c}
                strokeWidth={w}
                strokeDasharray={dash}
                points={r.map((p, k) => `${X(k).toFixed(1)},${Y(p[i]).toFixed(1)}`).join(" ")}
              />
            );
            const step = [1, 2, 5, 10, 20, 50].find((s2) => (hi - lo) / s2 <= 8) ?? 100;
            const ticks: number[] = [];
            for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
            return (
              <svg viewBox={`0 0 ${W} ${H}`} className="foc-chart" role="img" aria-label={t.resp}>
                <g className="foc-axes">
                  <line x1={Lm} x2={W - 10} y1={H - Bm} y2={H - Bm} />
                  <line x1={Lm} x2={Lm} y1={8} y2={H - Bm} />
                  <line x1={Lm} x2={W - 10} y1={Y(0)} y2={Y(0)} stroke="#94a3b8" strokeWidth={0.8} />
                  {ticks.map((v) => (
                    <text key={v} x={Lm - 6} y={Y(v) + 4} textAnchor="end">
                      {v}
                    </text>
                  ))}
                  {[0, 100, 200, 300, 400, 500, 600].map((ms) => (
                    <text key={ms} x={X(ms / 1000 / RESP_DT)} y={H - Bm + 14} textAnchor="middle">
                      {ms}
                    </text>
                  ))}
                </g>
                {rB ? (
                  <>
                    {line(rB, 0, COLORS.bwd, 2.4)}
                    {line(rB, 1, COLORS.bwd, 1.8, "4 3")}
                  </>
                ) : (
                  <text x={(Lm + W) / 2} y={H / 2} textAnchor="middle" className="ri-apply">
                    {hit ? rich(t.locked) : t.hint}
                  </text>
                )}
                {kPlot >= 0 && kPlot < nPts && <line x1={X(kPlot)} x2={X(kPlot)} y1={8} y2={H - Bm} stroke="#202725" strokeOpacity={0.4} />}
              </svg>
            );
          })()}
          <div className="foc-x-label">{t.respX}</div>
        </div>
      }

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
