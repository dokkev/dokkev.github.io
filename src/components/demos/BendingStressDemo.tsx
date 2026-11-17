import { useId, useState } from "react";

// Bending of an ideal homogeneous elastic rod wrapped over a sheave, with axial tension.
// Centre-line radius rho = (D + d) / 2, outer-fibre bending strain eps = (d/2) / rho = d / (D + d).
// Small-strain superposition: sigma(y) = T / A + E y / rho, A = pi d^2 / 4.
// Teaching model only: a braided rope does not carry this stress, and it is not an allowable-load predictor.

type Lang = "ko" | "en";

const MATERIALS = [
  // fibre-grade axial moduli (not rope bending moduli)
  { key: "sk78", label: "Dyneema SK78", E: 113 }, // DSM product data, 1760 dtex
  { key: "k49", label: "Kevlar 49", E: 112.4 }, // DuPont
  { key: "k29", label: "Kevlar 29", E: 70.5 }, // DuPont
  { key: "vectran", label: "Vectran HT", E: 74.2 }, // Kuraray: 530 cN/dtex x 1.40 g/cm^3
  { key: "steel", label: "Steel (solid)", E: 200 }, // typical solid steel
] as const;

const text = {
  ko: {
    eyebrow: "인터랙티브 예시 · Bending Stress Explorer",
    title: "균일한 탄성 막대를 풀리에 감았을 때",
    D: "풀리 직경 D",
    d: "케이블 직경 d",
    E: "탄성률 E",
    T: "장력 T",
    material: "섬유 축 방향 탄성률 (기준값)",
    ratio: "D/d",
    strain: "바깥쪽 굽힘 변형률 d/(D+d)",
    axial: "축 응력 T/A",
    stress: "바깥쪽 최대 응력",
    large: "굽힘 변형률이 1%를 넘어 이 모델이 가정하는 작은 변형·선형 탄성 범위를 벗어납니다.",
    tension: "인장",
    compression: "압축",
    neutral: "기준 중심선",
    section: "단면의 응력 분포 σ(y) = T/A + E·y/ρ",
    details: "구현 세부 사항",
    note: "균일한 선형 탄성 막대의 Euler–Bernoulli 굽힘 모델입니다. 중심선 곡률 반지름 ρ = (D + d)/2, 바깥쪽 변형률 ε = d/(D + d), 축 응력과 굽힘 응력을 더한 σ(y) = T/A + E·y/ρ(A = πd²/4)로 계산합니다. 재료 기준값은 섬유 등급별 축 방향 탄성률입니다(Dyneema SK78 113 GPa: DSM 제품 사양, Kevlar 49 112.4 GPa·Kevlar 29 70.5 GPa: DuPont, Vectran HT 약 74.2 GPa: Kuraray의 초기 모듈러스 530 cN/dtex와 밀도 1.40 g/cm³로 환산, 강철은 고체의 대표값 약 200 GPa). 선택한 E는 가상의 균질 막대에 적용되며, 완성된 로프의 굽힘 탄성률이 아니므로 실제 로프 사이의 강도나 CBOS 수명 비교에 쓸 수 없습니다. 풀리는 고정 축척으로 그려 D에 따라 커지고, 케이블 두께는 d에 비례하되 3배로 키워 그렸으며, 색은 인장(바깥쪽)과 압축(안쪽)의 방향만 나타내며 응력의 크기를 정량적으로 표시하지 않습니다. 실제 braided rope의 국부 응력, 파단 강도, 허용 하중, CBOS 수명을 예측하는 모델이 아닙니다.",
  },
  en: {
    eyebrow: "Interactive example · Bending Stress Explorer",
    title: "An ideal elastic rod wrapped over a sheave",
    D: "Sheave diameter D",
    d: "Cable diameter d",
    E: "Young's modulus E",
    T: "Tension T",
    material: "Fibre axial modulus (reference)",
    ratio: "D/d",
    strain: "Outer bending strain d/(D+d)",
    axial: "Axial stress T/A",
    stress: "Outer peak stress",
    large: "Bending strain above 1%: outside the small-strain, linear-elastic range this model assumes.",
    tension: "tension",
    compression: "compression",
    neutral: "centre line",
    section: "Stress across the section, σ(y) = T/A + E·y/ρ",
    details: "Implementation details",
    note: "Euler–Bernoulli bending of a homogeneous linear elastic rod. Centre-line radius ρ = (D + d)/2, outer strain ε = d/(D + d), stress σ(y) = T/A + E·y/ρ with A = πd²/4. The material references are fibre-grade axial moduli (Dyneema SK78 113 GPa: DSM product data; Kevlar 49 112.4 GPa and Kevlar 29 70.5 GPa: DuPont; Vectran HT about 74.2 GPa: converted from Kuraray's initial modulus of 530 cN/dtex and density 1.40 g/cm³; steel: typical solid value of about 200 GPa). The selected E is applied to a hypothetical homogeneous rod; it is not the bending modulus of a finished rope and cannot be used to compare the strength or CBOS life of real ropes. The sheave is drawn to a fixed scale (so it grows with D) and the cable thickness is exaggerated 3× but stays proportional to d; colours show only the sign (outer side in tension, inner side in compression), not the stress magnitude. This is not a model of the local stress, breaking strength, allowable load or CBOS life of a real braided rope.",
  },
};

const VW = 720;
const VH = 360;
const S = 2.4; // px per mm, fixed drawing scale for the sheave view
const T_X = 3; // cable thickness drawn at T_X times the scale so the strain colours stay visible

export default function BendingStressDemo({ lang = "ko" }: { lang?: Lang }) {
  const t = text[lang];
  const id = useId();
  const gid = id.replace(/[^a-zA-Z0-9]/g, "");
  const [D, setD] = useState(20);
  const [d, setDc] = useState(1);
  const [E, setE] = useState(113);
  const [T, setT] = useState(50);

  const eps = d / (D + d);
  const ratio = D / d;
  const A = (Math.PI * d * d) / 4; // mm^2
  const sA = T / A; // MPa
  const sB = E * 1000 * eps; // MPa, bending stress at the outer fibre
  const sOut = sA + sB;
  const sIn = sA - sB;

  // ---- left: cable over the sheave, drawn to a fixed scale so the sheave grows with D ----
  const cx = 190;
  const Rs = (D / 2) * S; // px, sheave radius
  const tPx = d * S * T_X; // cable thickness on screen (exaggerated by T_X, still proportional to d)
  const cy = 175; // sheave centre, fixed; the sheave grows around it
  const rIn = Rs;
  const rOut = Rs + tPx;
  const rMid = (rIn + rOut) / 2;
  const a0 = (200 * Math.PI) / 180;
  const a1 = (340 * Math.PI) / 180;
  const pt = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
  const band = `M${pt(rOut, a0)} A${rOut} ${rOut} 0 0 1 ${pt(rOut, a1)} L${pt(rIn, a1)} A${rIn} ${rIn} 0 0 0 ${pt(rIn, a0)} Z`;
  const mid = `M${pt(rMid, a0)} A${rMid} ${rMid} 0 0 1 ${pt(rMid, a1)}`;

  // ---- right: linear strain profile across the section ----
  const px0 = 545; // x of zero stress
  const py0 = 170; // y of neutral axis
  const half = 90; // px for d/2
  const wMax = 95; // px for the largest |stress|
  const fmtS = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(2)} GPa` : `${v.toFixed(0)} MPa`);
  const k = wMax / Math.max(Math.abs(sOut), Math.abs(sIn), 1e-9); // px per MPa
  const xOut = px0 + sOut * k;
  const xIn = px0 + sIn * k;
  const xA = px0 + sA * k;

  return (
    <section className="signal-demo cable-demo" aria-label={t.title}>
      <header className="signal-demo-heading">
        <span className="eyebrow">{t.eyebrow}</span>
        <h3>{t.title}</h3>
      </header>
      <div className="cable-toggle-row">
        <span className="cable-toggle-label">{t.material}</span>
        <div className="can-bit-select" role="group" aria-label={t.material}>
          {MATERIALS.map((m) => (
            <button type="button" key={m.key} aria-pressed={E === m.E} onClick={() => setE(m.E)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="cable-controls">
        <div>
          <label htmlFor={`${id}-D`}>
            {t.D} <strong>{D.toFixed(0)} mm</strong>
          </label>
          <input id={`${id}-D`} type="range" min="5" max="100" step="1" value={D} onChange={(e) => setD(Number(e.target.value))} />
        </div>
        <div>
          <label htmlFor={`${id}-d`}>
            {t.d} <strong>{d.toFixed(1)} mm</strong>
          </label>
          <input id={`${id}-d`} type="range" min="0.3" max="3" step="0.1" value={d} onChange={(e) => setDc(Number(e.target.value))} />
        </div>
        <div>
          <label htmlFor={`${id}-E`}>
            {t.E} <strong>{E.toFixed(1)} GPa</strong>
          </label>
          <input id={`${id}-E`} type="range" min="10" max="250" step="0.1" value={E} onChange={(e) => setE(Number(e.target.value))} />
        </div>
        <div>
          <label htmlFor={`${id}-T`}>
            {t.T} <strong>{T.toFixed(0)} N</strong>
          </label>
          <input id={`${id}-T`} type="range" min="0" max="500" step="5" value={T} onChange={(e) => setT(Number(e.target.value))} />
        </div>
      </div>

      <svg className="cable-demo-svg" viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={`${t.strain} ${(eps * 100).toFixed(2)}%`}>
        <defs>
          <radialGradient id={`${gid}-g`} gradientUnits="userSpaceOnUse" cx={cx} cy={cy} r={rOut}>
            <stop offset={(rIn / rOut).toFixed(4)} stopColor="#2563eb" />
            <stop offset={(rMid / rOut).toFixed(4)} stopColor="#e5e7eb" />
            <stop offset="1" stopColor="#c2410c" />
          </radialGradient>
        </defs>

        {/* sheave */}
        <circle cx={cx} cy={cy} r={Rs} fill="var(--surface, #fff)" stroke="currentColor" strokeOpacity="0.7" strokeWidth="2" />
        <circle cx={cx} cy={cy} r={Math.min(3.5, Rs / 4)} fill="currentColor" />
        {/* cable band coloured by the sign of the bending strain */}
        <path d={band} fill={`url(#${gid}-g)`} stroke="currentColor" strokeOpacity="0.5" strokeWidth="1" />
        <path d={mid} fill="none" stroke="currentColor" strokeOpacity="0.6" strokeDasharray="5 4" strokeWidth="1" />
        <text x={cx} y={cy - rOut - 10} fontSize="12" textAnchor="middle" fill="#c2410c">
          {t.tension}
        </text>
        <text x={cx} y={cy + Rs + 20} fontSize="12" textAnchor="middle" fillOpacity="0.7">
          D = {D.toFixed(0)} mm, d = {d.toFixed(1)} mm
        </text>

        <line x1="380" x2="380" y1="20" y2={VH - 20} stroke="currentColor" strokeOpacity="0.2" />

        {/* stress profile across the section */}
        <text x="400" y="30" fontSize="12" fillOpacity="0.7">
          {t.section}
        </text>
        <line x1={px0 - wMax - 20} x2={px0 + wMax + 20} y1={py0} y2={py0} stroke="currentColor" strokeOpacity="0.4" strokeDasharray="5 4" />
        <line x1={px0} x2={px0} y1={py0 - half - 10} y2={py0 + half + 10} stroke="currentColor" strokeOpacity="0.6" />
        <polygon points={`${px0},${py0 - half} ${xOut},${py0 - half} ${xIn},${py0 + half} ${px0},${py0 + half}`} fill="#14958a" fillOpacity="0.18" />
        <line x1={xIn} y1={py0 + half} x2={xOut} y2={py0 - half} stroke="currentColor" strokeWidth="2" />
        <line x1={xA} x2={xA} y1={py0 - half} y2={py0 + half} stroke="#14958a" strokeDasharray="4 4" />
        <text x={xA + 4} y={py0 + half + 14} fontSize="11" fill="#14958a">
          T/A
        </text>
        <text x={Math.max(xOut, px0) + 6} y={py0 - half + 4} fontSize="12" fill="#c2410c">
          {fmtS(sOut)}
        </text>
        <text x={Math.min(xIn, px0) - 6} y={py0 + half + 4} fontSize="12" textAnchor="end" fill={sIn < 0 ? "#2563eb" : "#c2410c"}>
          {fmtS(sIn)}
        </text>
        <text x={px0 - 6} y={py0 - half - 6} fontSize="11" fillOpacity="0.7" textAnchor="end">
          y = +d/2
        </text>
        <text x={px0 - 6} y={py0 + half + 18} fontSize="11" fillOpacity="0.7" textAnchor="end">
          y = −d/2
        </text>
        <text x={px0 + wMax + 22} y={py0 - 6} fontSize="11" fillOpacity="0.7" textAnchor="end">
          {t.neutral}
        </text>
      </svg>

      <output className="can-readout" aria-live="polite">
        <span>
          {t.ratio} <strong>{ratio.toFixed(1)}</strong>
        </span>
        <span>
          {t.strain} <strong>{(eps * 100).toFixed(2)}%</strong>
        </span>
        <span>
          {t.axial} <strong>{fmtS(sA)}</strong>
        </span>
        <span>
          {t.stress} <strong>{fmtS(sOut)}</strong>
        </span>
      </output>
      {eps > 0.01 && <p className="demo-model-note">{t.large}</p>}
      <details className="demo-model-details">
        <summary>{t.details}</summary>
        <p className="demo-model-note">{t.note}</p>
      </details>
    </section>
  );
}
