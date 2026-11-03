import { useState, type ReactNode } from "react";

// Apparent inertia of a single geared joint (link J_L, rotor J_m, ratio N) with
// transmission losses, after Sim & Ramos (arXiv:2106.01842):
//   frictionless:          I0   = J_L + N^2 J_m
//   forward  (motor drives): I_f = J_L / eta_f + N^2 J_m
//   backward (load drives):  I_b = J_L + N^2 J_m / eta_b
// Backward efficiency from a single-mesh approximation eta_b = 2 - 1/eta_f (0 at eta_f = 0.5).

type Lang = "ko" | "en";
const JM = 1e-5; // kg m^2, series example rotor inertia
const JL = 0.09; // kg m^2, series example link inertia
const TAU_M = 0.1; // N m, motor torque for the acceleration plot
const N_MIN = 1;
const N_MAX = 200;
const COLORS = { zero: "#6b7280", fwd: "#2563eb", bwd: "#c2410c", link: "#15803d", rotor: "#7c3aed" };

const text = {
  ko: {
    eyebrow: "직접 조작 · 감속비와 반사 관성",
    title: "감속비가 관절의 관성을 어떻게 바꾸는가",
    N: "감속비 N",
    eta: "정방향 효율 η_f",
    inertia: "관절에서 본 겉보기 관성 [kg·m²]",
    accel: `모터 토크 ${TAU_M} N·m로 낼 수 있는 관절 가속도 [rad/s²]`,
    xN: "감속비 N (로그 축)",
    zero: "마찰 없음",
    fwd: "FWD · 모터가 구동",
    bwd: "BWD · 외력이 역구동",
    link: "링크 J_L",
    rotor: "반사 관성 N²J_m",
    extra: "BWD에서 마찰로 더해지는 몫",
    etab: "역방향 효율 η_b",
    nstar: "최적 감속비 N*",
    If: "FWD 관성",
    Ib: "BWD 관성",
    ratio: "BWD / 마찰 없음",
    nonback: "역구동 불가 (η_b ≤ 0)",
    note:
      "단일 관절 모델입니다. 링크 관성 J_L = 0.09 kg·m², 로터 관성 J_m = 1×10⁻⁵ kg·m²은 시리즈 공통 예시값이며, 역방향 효율은 단일 치합을 가정한 근사 η_b = 2 − 1/η_f로 계산했습니다. 겉보기 관성 식은 Sim & Ramos(2021)의 정방향·역방향 동역학을 따릅니다.",
  },
  en: {
    eyebrow: "Try it · Gear ratio and reflected inertia",
    title: "How the gear ratio changes the inertia of a joint",
    N: "Gear ratio N",
    eta: "Forward efficiency η_f",
    inertia: "Apparent inertia at the joint [kg·m²]",
    accel: `Joint acceleration from ${TAU_M} N·m of motor torque [rad/s²]`,
    xN: "Gear ratio N (log axis)",
    zero: "frictionless",
    fwd: "FWD · motor drives",
    bwd: "BWD · load backdrives",
    link: "link J_L",
    rotor: "reflected N²J_m",
    extra: "added by friction in BWD",
    etab: "Backward efficiency η_b",
    nstar: "Optimal ratio N*",
    If: "FWD inertia",
    Ib: "BWD inertia",
    ratio: "BWD / frictionless",
    nonback: "not backdrivable (η_b ≤ 0)",
    note:
      "Single-joint model. Link inertia J_L = 0.09 kg·m² and rotor inertia J_m = 1×10⁻⁵ kg·m² are the series example values; backward efficiency uses the single-mesh approximation η_b = 2 − 1/η_f. The apparent-inertia expressions follow the forward and backward dynamics of Sim & Ramos (2021).",
  },
};

const etaB = (ef: number) => 2 - 1 / ef;
const I0 = (N: number) => JL + N * N * JM;
const If = (N: number, ef: number) => JL / ef + N * N * JM;
const Ib = (N: number, ef: number) => {
  const eb = etaB(ef);
  return eb > 0 ? JL + (N * N * JM) / eb : Infinity;
};
const accelF = (N: number, ef: number) => (N * TAU_M) / If(N, ef);

const SUB = /([A-Za-zη])_([a-zA-Z]+)/g;
function rich(str: string) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of str.matchAll(SUB)) {
    out.push(str.slice(last, m.index!), m[1], <sub key={m.index}>{m[2]}</sub>);
    last = m.index! + m[0].length;
  }
  out.push(str.slice(last));
  return out;
}
const sci = (v: number) => (!Number.isFinite(v) ? "∞" : v >= 0.1 ? v.toFixed(3) : v.toExponential(2));

export default function ReflectedInertiaDemo({ lang = "ko" }: { lang?: Lang }) {
  const t = text[lang];
  const [logN, setLogN] = useState(Math.log10(100));
  const [ef, setEf] = useState(0.8);
  const N = Math.round(10 ** logN);
  const eb = etaB(ef);
  const nstar = Math.sqrt(JL / (ef * JM));

  // ---- shared plot geometry ----
  const W = 460;
  const H = 190;
  const L = 52;
  const Rm = 12;
  const T = 12;
  const B = 30;
  const X = (n: number) => L + ((Math.log10(n) - Math.log10(N_MIN)) / (Math.log10(N_MAX) - Math.log10(N_MIN))) * (W - L - Rm);
  const Ns = Array.from({ length: 121 }, (_, k) => 10 ** (Math.log10(N_MIN) + (k / 120) * (Math.log10(N_MAX) - Math.log10(N_MIN))));
  const xTicks = [1, 2, 5, 10, 20, 50, 100, 200];

  // inertia plot: linear y, scaled to the backward curve at the largest ratio
  const iTop = Math.min(3, Math.max(0.6, (Number.isFinite(Ib(N_MAX, ef)) ? Ib(N_MAX, ef) : 3) * 1.08));
  const Yi = (v: number) => T + (1 - Math.min(v, iTop) / iTop) * (H - T - B);
  const iTicks = [0, iTop / 2, iTop].map((v) => Math.round(v * 100) / 100);
  const curve = (f: (n: number) => number, color: string, dash?: string) => (
    <polyline
      fill="none"
      stroke={color}
      strokeWidth={2.2}
      strokeDasharray={dash}
      points={Ns.filter((n) => Number.isFinite(f(n)))
        .map((n) => `${X(n).toFixed(1)},${Yi(f(n)).toFixed(1)}`)
        .join(" ")}
    />
  );

  // acceleration plot: linear y
  const aMax = Math.max(...Ns.map((n) => accelF(n, 1)));
  const Ya = (v: number) => T + (1 - v / (aMax * 1.1)) * (H - T - B);

  const xAxis = (
    <g className="foc-axes">
      <line x1={L} x2={W - Rm} y1={H - B} y2={H - B} />
      {xTicks.map((n) => (
        <text key={n} x={X(n)} y={H - B + 14} textAnchor="middle">
          {n}
        </text>
      ))}
    </g>
  );

  // composition bar (BWD)
  const parts = [
    { key: "link", v: JL, color: COLORS.link, label: rich(t.link) },
    { key: "rotor", v: N * N * JM, color: COLORS.rotor, label: t.rotor },
    { key: "extra", v: eb > 0 ? Ib(N, ef) - I0(N) : 0, color: COLORS.bwd, label: t.extra },
  ];
  const total = parts.reduce((a, p) => a + p.v, 0);

  return (
    <section className="signal-demo foc-demo ri-demo" aria-label={t.title}>
      <header className="signal-demo-heading">
        <span className="eyebrow">{t.eyebrow}</span>
        <h3>{t.title}</h3>
      </header>

      <div className="ri-plots">
        <div>
          <div className="foc-chart-title">{t.inertia}</div>
          <svg viewBox={`0 0 ${W} ${H}`} className="foc-chart" role="img" aria-label={t.inertia}>
            {xAxis}
            <g className="foc-axes">
              <line x1={L} x2={L} y1={T} y2={H - B} />
              {iTicks.map((v) => (
                <g key={v}>
                  <line x1={L} x2={W - Rm} y1={Yi(v)} y2={Yi(v)} strokeOpacity={0.35} />
                  <text x={L - 6} y={Yi(v) + 4} textAnchor="end">
                    {v}
                  </text>
                </g>
              ))}
            </g>
            <line x1={L} x2={W - Rm} y1={Yi(JL)} y2={Yi(JL)} stroke={COLORS.link} strokeDasharray="2 3" />
            {curve(I0, COLORS.zero, "5 4")}
            {curve((n) => If(n, ef), COLORS.fwd)}
            {curve((n) => Ib(n, ef), COLORS.bwd)}
            <line x1={X(N)} x2={X(N)} y1={T} y2={H - B} stroke="#202725" strokeOpacity={0.4} />
            <text x={W - Rm - 4} y={H - B - 6} textAnchor="end" className="ri-axis-note">
              {t.xN}
            </text>
          </svg>
          <div className="ri-legend">
            <span style={{ color: COLORS.zero }}>- - {t.zero}</span>
            <span style={{ color: COLORS.fwd }}>━ {t.fwd}</span>
            <span style={{ color: COLORS.bwd }}>━ {t.bwd}</span>
            <span style={{ color: COLORS.link }}>┄ {rich(t.link)}</span>
          </div>
        </div>

        <div>
          <div className="foc-chart-title">{t.accel}</div>
          <svg viewBox={`0 0 ${W} ${H}`} className="foc-chart" role="img" aria-label={t.accel}>
            {xAxis}
            <g className="foc-axes">
              <line x1={L} x2={L} y1={T} y2={H - B} />
              {[0, Math.round(aMax / 2), Math.round(aMax)].map((v) => (
                <text key={v} x={L - 6} y={Ya(v) + 4} textAnchor="end">
                  {v}
                </text>
              ))}
            </g>
            <polyline
              fill="none"
              stroke={COLORS.zero}
              strokeWidth={1.6}
              strokeDasharray="5 4"
              points={Ns.map((n) => `${X(n).toFixed(1)},${Ya(accelF(n, 1)).toFixed(1)}`).join(" ")}
            />
            <polyline
              fill="none"
              stroke={COLORS.fwd}
              strokeWidth={2.2}
              points={Ns.map((n) => `${X(n).toFixed(1)},${Ya(accelF(n, ef)).toFixed(1)}`).join(" ")}
            />
            {nstar <= N_MAX && (
              <g>
                <line x1={X(nstar)} x2={X(nstar)} y1={T} y2={H - B} stroke={COLORS.fwd} strokeDasharray="2 3" />
                <text x={X(nstar) + 4} y={T + 10} className="ri-axis-note" fill={COLORS.fwd}>
                  N* ≈ {nstar.toFixed(0)}
                </text>
              </g>
            )}
            <line x1={X(N)} x2={X(N)} y1={T} y2={H - B} stroke="#202725" strokeOpacity={0.4} />
            <circle cx={X(N)} cy={Ya(accelF(N, ef))} r={4} fill={COLORS.fwd} />
            <text x={W - Rm - 4} y={H - B - 6} textAnchor="end" className="ri-axis-note">
              {t.xN}
            </text>
          </svg>
        </div>
      </div>

      <div className="ri-bar" aria-label="BWD inertia composition">
        {parts.map((p) =>
          p.v > 0 && Number.isFinite(p.v) ? (
            <span key={p.key} style={{ flexGrow: p.v / total, background: p.color }} title={`${sci(p.v)} kg·m²`} />
          ) : null
        )}
      </div>
      <div className="ri-legend">
        {parts.map((p) => (
          <span key={p.key} style={{ color: p.color }}>
            ■ {p.label} {Number.isFinite(p.v) ? `${sci(p.v)}` : "∞"}
          </span>
        ))}
      </div>

      <div className="foc-controls">
        <div className="foc-control">
          <label>
            {t.N} <strong>{N}:1</strong>
          </label>
          <input type="range" min={0} max={Math.log10(N_MAX)} step={0.01} value={logN} onChange={(e) => setLogN(+e.target.value)} />
        </div>
        <div className="foc-control">
          <label>
            <span>{rich(t.eta)}</span> <strong>{ef.toFixed(2)}</strong>
          </label>
          <input type="range" min={0.55} max={1} step={0.01} value={ef} onChange={(e) => setEf(+e.target.value)} />
        </div>
      </div>

      <output className={`can-readout${eb <= 0 ? " logic-uncertain" : ""}`} aria-live="polite">
        <span>
          {t.rotor}
          <strong>{sci(N * N * JM)}</strong>
        </span>
        <span>
          {t.If}
          <strong>{sci(If(N, ef))}</strong>
        </span>
        <span>
          {t.Ib}
          <strong>{eb > 0 ? sci(Ib(N, ef)) : t.nonback}</strong>
        </span>
        <span>
          {t.ratio}
          <strong>{eb > 0 ? `×${(Ib(N, ef) / I0(N)).toFixed(2)}` : "∞"}</strong>
        </span>
        <span>
          {rich(t.etab)}
          <strong>{eb.toFixed(2)}</strong>
        </span>
        <span>
          {t.nstar}
          <strong>{nstar.toFixed(0)}</strong>
        </span>
      </output>
      <p className="demo-model-note">{rich(t.note)}</p>
    </section>
  );
}
