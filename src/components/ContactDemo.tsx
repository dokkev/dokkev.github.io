import { useId, useState } from "react";

// An illustrative linear spring model, not a fit to measured fingertip data.
export default function ContactDemo() {
  const id = useId();
  const [stiffness, setStiffness] = useState(2);
  const [indentation, setIndentation] = useState(3);
  const force = stiffness * indentation;
  const x = (d: number) => 58 + (d / 6) * 490;
  const y = (f: number) => 250 - (f / 30) * 210;
  return (
    <section className="contact-demo" aria-label="Linear contact model explorer">
      <div className="demo-controls">
        <label htmlFor={`${id}-k`}>
          Stiffness <strong>{stiffness.toFixed(1)} N/mm</strong>
        </label>
        <input id={`${id}-k`} type="range" min="0.5" max="5" step="0.1" value={stiffness} onChange={(e) => setStiffness(Number(e.target.value))} />
        <label htmlFor={`${id}-d`}>
          Indentation <strong>{indentation.toFixed(1)} mm</strong>
        </label>
        <input id={`${id}-d`} type="range" min="0" max="6" step="0.1" value={indentation} onChange={(e) => setIndentation(Number(e.target.value))} />
        <div className="force-output">
          <span>Predicted force</span>
          <output aria-live="polite">
            {force.toFixed(1)} <small>N</small>
          </output>
        </div>
        <button
          type="button"
          onClick={() => {
            setStiffness(2);
            setIndentation(3);
          }}
        >
          Reset parameters
        </button>
      </div>
      <svg viewBox="0 0 590 300" role="img" aria-labelledby={`${id}-chart-title ${id}-chart-desc`}>
        <title id={`${id}-chart-title`}>Force versus indentation for a linear spring</title>
        <desc id={`${id}-chart-desc`}>
          At stiffness {stiffness.toFixed(1)} newtons per millimeter and indentation {indentation.toFixed(1)} millimeters, predicted force is{" "}
          {force.toFixed(1)} newtons.
        </desc>
        {[0, 10, 20, 30].map((f) => (
          <g key={f}>
            <line x1="58" x2="548" y1={y(f)} y2={y(f)} stroke="var(--line)" />
            <text x="45" y={y(f) + 4} textAnchor="end">
              {f}
            </text>
          </g>
        ))}
        {[0, 1, 2, 3, 4, 5, 6].map((d) => (
          <text key={d} x={x(d)} y="274" textAnchor="middle">
            {d}
          </text>
        ))}
        <path d={`M 58 250 L 548 ${y(stiffness * 6)}`} fill="none" stroke="var(--accent)" strokeWidth="3" />
        <path d={`M ${x(indentation)} 250 V ${y(force)} H 58`} fill="none" stroke="var(--accent)" strokeDasharray="5 5" opacity="0.5" />
        <circle cx={x(indentation)} cy={y(force)} r="7" fill="var(--accent)" stroke="white" strokeWidth="3" />
        <text x="305" y="298" textAnchor="middle">
          Indentation δ (mm)
        </text>
        <text transform="translate(15 146) rotate(-90)" textAnchor="middle">
          Force F (N)
        </text>
      </svg>
    </section>
  );
}
