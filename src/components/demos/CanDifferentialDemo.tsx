import { useId, useState } from "react";

export default function CanDifferentialDemo() {
  const id = useId();
  const [bit, setBit] = useState(0);
  const [commonShift, setCommonShift] = useState(0);
  const [extraHigh, setExtraHigh] = useState(0);
  // Representative high-speed CAN levels, not a circuit or cable simulation.
  const canHigh = 2.5 + (bit === 0 ? 1 : 0) + commonShift + extraHigh;
  const canLow = 2.5 - (bit === 0 ? 1 : 0) + commonShift;
  const differential = canHigh - canLow;
  // Round at the displayed millivolt precision before testing boundary values.
  const delta = Math.round(differential * 1000) / 1000;
  const received = delta >= 0.9 ? "0" : delta <= 0.5 ? "1" : "?";
  const x = (v: number) => 120 + ((v + 1.5) / 7.5) * 470;
  return (
    <section className="signal-demo" aria-label="CAN differential voltage explorer">
      <header className="signal-demo-heading">
        <span className="eyebrow">Try it · High-speed CAN</span>
        <h3>Compare the two wires</h3>
      </header>
      <div className="can-bit-select" role="group" aria-label="Requested CAN state">
        {[0, 1].map((value) => (
          <button type="button" key={value} aria-pressed={bit === value} onClick={() => setBit(value)}>
            {value === 0 ? "Dominant · 0" : "Recessive · 1"}
          </button>
        ))}
      </div>
      <div className="signal-controls">
        <div>
          <label htmlFor={`${id}-common`}>
            Same shift on both wires <strong>{commonShift.toFixed(2)} V</strong>
          </label>
          <input
            id={`${id}-common`}
            type="range"
            min="-1"
            max="1"
            step="0.05"
            value={commonShift}
            onChange={(e) => setCommonShift(Number(e.target.value))}
          />
        </div>
        <div>
          <label htmlFor={`${id}-extra`}>
            Extra voltage on CANH only <strong>{extraHigh.toFixed(2)} V</strong>
          </label>
          <input
            id={`${id}-extra`}
            type="range"
            min="-1.2"
            max="1.2"
            step="0.05"
            value={extraHigh}
            onChange={(e) => setExtraHigh(Number(e.target.value))}
          />
        </div>
      </div>
      <div className="signal-chart-scroll" role="region" aria-label="CAN line voltages" tabIndex={0}>
        <svg className="signal-chart" viewBox="0 0 710 230" role="img" aria-labelledby={`${id}-title ${id}-desc`}>
          <title id={`${id}-title`}>CANH, CANL, and their difference</title>
          <desc id={`${id}-desc`}>
            CANH is {canHigh.toFixed(2)} volts and CANL is {canLow.toFixed(2)} volts. Their difference is {delta.toFixed(2)} volts. The receiver
            classification is {received === "?" ? "unspecified" : `logic ${received}`}.
          </desc>
          <rect x={x(0.5)} y="137" width={x(0.9) - x(0.5)} height="34" fill="#f8e6bd" />
          {[-1, 0, 1, 2, 3, 4, 5, 6].map((v) => (
            <g key={v}>
              <line x1={x(v)} x2={x(v)} y1="22" y2="177" stroke="#e0e4e1" />
              <text x={x(v)} y="200" textAnchor="middle">
                {v}
              </text>
            </g>
          ))}
          {[
            ["CANH", canHigh, "#af6028"],
            ["CANL", canLow, "#416a9b"],
            ["CANH − CANL", delta, "#17695b"],
          ].map(([label, value, color], i) => (
            <g key={String(label)}>
              <text x="105" y={49 + i * 55} textAnchor="end">
                {label}
              </text>
              <line x1={x(0)} x2={x(Number(value))} y1={45 + i * 55} y2={45 + i * 55} stroke={String(color)} strokeWidth="3" />
              <circle cx={x(Number(value))} cy={45 + i * 55} r="6" fill={String(color)} />
              <text x="680" y={49 + i * 55} textAnchor="end">
                {Number(value).toFixed(2)} V
              </text>
            </g>
          ))}
          <text x="350" y="226" textAnchor="middle">
            Voltage (V) · lines relative to receiver ground
          </text>
        </svg>
      </div>
      <output className={`can-readout ${received === "?" ? "logic-uncertain" : ""}`} aria-live="polite">
        <span>
          Differential voltage <strong>{delta.toFixed(2)} V</strong>
        </span>
        <span>
          Receiver <strong>{received === "?" ? "Unspecified" : received === "0" ? "Dominant · 0" : "Recessive · 1"}</strong>
        </span>
      </output>
      <p className="demo-help">≤ 0.5 V: recessive. ≥ 0.9 V: dominant. Between them: the guaranteed-range model leaves the result unspecified.</p>
      <button
        className="signal-reset"
        type="button"
        onClick={() => {
          setBit(0);
          setCommonShift(0);
          setExtraHigh(0);
        }}
      >
        Reset voltages
      </button>
      <p className="demo-model-note">
        Teaching model: representative 5 V transceiver levels and conservative SN65HVD1050 receiver ranges. Equal shifts cancel algebraically; real
        rejection depends on common-mode range, mismatch, and frequency. This is not a measurement.
      </p>
    </section>
  );
}
