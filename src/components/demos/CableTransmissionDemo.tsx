import { useState } from "react";
import { PulleyBody, type Drive, type Lang, type Mode } from "./CablePulleyDemo";
import { LinkBody } from "./CableLinkDemo";

// 1:1 cable transmission, every combination of
//   layout: open / crossed,  drive: antagonistic pair / tendon + return spring,  output: pulley / link.
// The bodies keep their own input state; changing a toggle remounts the body (key) so it starts from 0.

type Output = "pulley" | "link";

const text = {
  ko: {
    eyebrow: "인터랙티브 예시 · Tendon-Driven System Example",
    title: "배치, 구동 방식, 출력단을 조합해 보기",
    output: "출력단",
    drive: "구동 방식",
    layout: "배치",
    pulley: "풀리",
    link: "링크에 고정",
    pair: "양방향 tendon (antagonistic)",
    spring: "Tendon + return spring",
    open: "평행 (open)",
    crossed: "교차 (crossed)",
  },
  en: {
    eyebrow: "Interactive example · Tendon-Driven System Example",
    title: "Combine layout, drive and output",
    output: "Output",
    drive: "Drive",
    layout: "Layout",
    pulley: "Pulley",
    link: "Terminated on a link",
    pair: "Antagonistic tendon pair",
    spring: "Tendon + return spring",
    open: "Open",
    crossed: "Crossed",
  },
};

function Toggle<T extends string>({ label, options, value, onChange, names }: { label: string; options: T[]; value: T; onChange: (v: T) => void; names: Record<T, string> }) {
  return (
    <div className="cable-toggle-row">
      <span className="cable-toggle-label">{label}</span>
      <div className="can-bit-select" role="group" aria-label={label}>
        {options.map((o) => (
          <button type="button" key={o} aria-pressed={value === o} onClick={() => onChange(o)}>
            {names[o]}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function CableTransmissionDemo({ lang = "ko" }: { lang?: Lang }) {
  const t = text[lang];
  const [output, setOutput] = useState<Output>("pulley");
  const [drive, setDrive] = useState<Drive>("pair");
  const [mode, setMode] = useState<Mode>("open");
  const key = `${output}-${drive}-${mode}`;

  return (
    <section className="signal-demo cable-demo" aria-label={t.title}>
      <header className="signal-demo-heading">
        <span className="eyebrow">{t.eyebrow}</span>
        <h3>{t.title}</h3>
      </header>
      <Toggle label={t.output} options={["pulley", "link"] as Output[]} value={output} onChange={setOutput} names={t} />
      <Toggle label={t.drive} options={["pair", "spring"] as Drive[]} value={drive} onChange={setDrive} names={t} />
      <Toggle label={t.layout} options={["open", "crossed"] as Mode[]} value={mode} onChange={setMode} names={t} />
      {output === "pulley" ? <PulleyBody key={key} lang={lang} mode={mode} drive={drive} /> : <LinkBody key={key} lang={lang} mode={mode} drive={drive} />}
    </section>
  );
}
