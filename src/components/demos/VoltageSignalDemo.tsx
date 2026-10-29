import { useId, useState } from "react";

// Guaranteed input ranges from SN74LVC1G125 at VCC = 3.3 V.
// Intermediate voltages are deliberately left unclassified.
const lowLimit = 0.8;
const highLimit = 2.0;
const classify = (voltage: number) => (voltage <= lowLimit ? "0" : voltage >= highLimit ? "1" : "?");
const initialBits = [1, 0, 1, 1, 0, 0, 1, 0];

export default function VoltageSignalDemo() {
  const id = useId();
  const [bits, setBits] = useState(initialBits);
  const [edgeTime, setEdgeTime] = useState(0.25);
  const [samplePhase, setSamplePhase] = useState(0.5);
  // Linear edges isolate settling time. They are not a fitted transistor/cable model.
  const at = (t: number) => {
    const index = Math.min(7, Math.floor(t));
    const previous = index === 0 ? 0 : bits[index - 1];
    const fraction = Math.min(1, (t - index) / edgeTime);
    return 3.3 * (previous + (bits[index] - previous) * fraction);
  };
  const samples = bits.map((_, i) => at(i + samplePhase));
  const decoded = samples.map(classify).join("");
  const x = (t: number) => 55 + (t / 8) * 600;
  const y = (v: number) => 224 - (v / 3.3) * 170;
  const waveform = Array.from(
    { length: 801 },
    (_, i) => `${i ? "L" : "M"}${x((i * 7.999) / 800).toFixed(2)},${y(at((i * 7.999) / 800)).toFixed(2)}`
  ).join(" ");
  return (
    <section className="signal-demo" aria-label="Voltage and bit sampling explorer">
      <header className="signal-demo-heading">
        <span className="eyebrow">Try it · Bit timing</span>
        <h3>Assign one level to each bit interval</h3>
      </header>
      <p className="demo-help">
        Click a bit to change its level. The dots show when the receiver samples. Each interval is 1 μs; the receiver's interval boundaries are
        assumed known.
      </p>
      <div className="bit-editor" role="group" aria-label="Transmitted bits">
        {bits.map((bit, i) => (
          <button
            type="button"
            key={i}
            aria-label={`Bit ${i + 1}: ${bit}; click to toggle`}
            onClick={() => setBits(bits.map((b, j) => (j === i ? 1 - b : b)))}
          >
            <span>{i + 1}</span>
            <strong>{bit}</strong>
          </button>
        ))}
      </div>
      <div className="signal-controls">
        <div>
          <label htmlFor={`${id}-edge`}>
            Full edge duration <strong>{edgeTime.toFixed(2)} μs</strong>
          </label>
          <input
            id={`${id}-edge`}
            type="range"
            min="0.05"
            max="0.9"
            step="0.05"
            value={edgeTime}
            onChange={(e) => setEdgeTime(Number(e.target.value))}
          />
        </div>
        <div>
          <label htmlFor={`${id}-sample`}>
            Sample within each bit <strong>{(samplePhase * 100).toFixed(0)}%</strong>
          </label>
          <input
            id={`${id}-sample`}
            type="range"
            min="0.05"
            max="0.95"
            step="0.05"
            value={samplePhase}
            onChange={(e) => setSamplePhase(Number(e.target.value))}
          />
        </div>
      </div>
      <div className="signal-chart-scroll" role="region" aria-label="Input voltage waveform" tabIndex={0}>
        <svg className="signal-chart" viewBox="0 0 710 280" role="img" aria-labelledby={`${id}-chart-title ${id}-chart-desc`}>
          <title id={`${id}-chart-title`}>Voltage over eight bit intervals</title>
          <desc id={`${id}-chart-desc`}>
            The requested sequence is {bits.join("")}. At the selected sample times, the guaranteed-range classifier returns {decoded}. A question
            mark means the input is between the guaranteed ranges.
          </desc>
          <rect x="55" y={y(3.3)} width="600" height={y(highLimit) - y(3.3)} fill="#e9f3ef" />
          <rect x="55" y={y(highLimit)} width="600" height={y(lowLimit) - y(highLimit)} fill="#f8f1de" />
          <rect x="55" y={y(lowLimit)} width="600" height={y(0) - y(lowLimit)} fill="#edf1f7" />
          {[0, 0.8, 2, 3.3].map((v) => (
            <g key={v}>
              <line x1="55" x2="655" y1={y(v)} y2={y(v)} stroke="#cfd5d1" />
              <text x="45" y={y(v) + 4} textAnchor="end">
                {v.toFixed(1)}
              </text>
            </g>
          ))}
          {Array.from({ length: 9 }, (_, i) => (
            <g key={i}>
              <line x1={x(i)} x2={x(i)} y1="54" y2="224" stroke="#d9dfdb" strokeDasharray="3 4" />
              <text x={x(i)} y="246" textAnchor="middle">
                {i}
              </text>
            </g>
          ))}
          <path d={waveform} stroke="var(--accent)" strokeWidth="2.5" fill="none" />
          {samples.map((v, i) => (
            <g key={i}>
              <line x1={x(i + samplePhase)} x2={x(i + samplePhase)} y1="54" y2="224" stroke="#a6b6ac" strokeDasharray="2 4" />
              <circle
                cx={x(i + samplePhase)}
                cy={y(v)}
                r="5"
                fill={classify(v) === "?" ? "#a16b13" : "var(--accent)"}
                stroke="white"
                strokeWidth="1.5"
              />
              <text x={x(i + 0.5)} y="32" textAnchor="middle">
                {classify(v)}
              </text>
            </g>
          ))}
          <text x="355" y="274" textAnchor="middle">
            Time (μs)
          </text>
          <text transform="translate(14 140) rotate(-90)" textAnchor="middle">
            Input voltage (V)
          </text>
        </svg>
      </div>
      <div className="sequence-readout">
        <div>
          <span>Requested</span>
          <code>{bits.join("")}</code>
        </div>
        <div>
          <span>Sampled classification</span>
          <output aria-live="polite">{decoded}</output>
        </div>
        <button
          type="button"
          onClick={() => {
            setBits(initialBits);
            setEdgeTime(0.25);
            setSamplePhase(0.5);
          }}
        >
          Reset
        </button>
      </div>
      <p className="demo-model-note">
        Teaching model: 0/3.3 V levels, linear edges, and known bit timing. “?” is not a third hardware bit. This view omits propagation delay, noise,
        hysteresis, and receiver timing limits.
      </p>
    </section>
  );
}
