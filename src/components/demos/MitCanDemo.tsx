import { useId, useState } from "react";
import { mitFields, quantize, dequantize, packMit, unpackMit, akControlPayload } from "../../lib/demos/mit-can";

export default function MitCanDemo() {
  const id = useId();
  const [values, setValues] = useState<number[]>(mitFields.map((f) => f.initial));
  const [selected, setSelected] = useState(0);
  const defaults = () => mitFields.map((f) => ({ min: String(f.min), max: String(f.max) }));
  const [limits, setLimits] = useState(defaults);
  const valid = limits.map(
    (r) =>
      r.min.trim() !== "" &&
      r.max.trim() !== "" &&
      Number.isFinite(Number(r.min)) &&
      Number.isFinite(Number(r.max)) &&
      Number(r.max) > Number(r.min) &&
      Number.isFinite(Number(r.max) - Number(r.min))
  );
  const raw = mitFields.map((f, i) => (valid[i] ? quantize(values[i], Number(limits[i].min), Number(limits[i].max), f.bits) : 0));
  const bytes = packMit(raw);
  const reservedCommand = valid.every(Boolean) ? akControlPayload(bytes) : undefined;
  const decoded = unpackMit(bytes);
  const bitOwners = mitFields.flatMap((f, index) => Array(f.bits).fill(index) as number[]);
  return (
    <section className="signal-demo" aria-label="MIT CAN command packing explorer">
      <header className="signal-demo-heading">
        <span className="eyebrow">Try it · Five commands, eight bytes</span>
        <h3>Follow a command into its bits</h3>
      </header>
      <p className="demo-help">
        The sender and motor share one range per field. Adjust a command or limit below to highlight its bits. These are teaching settings.
      </p>
      <div className="signal-chart-scroll" role="region" aria-label="Eight-byte command bit layout" tabIndex={0}>
        <div className="mit-bytes">
          {bytes.map((byte, index) => (
            <div className="mit-byte" key={index}>
              <span>byte {index}</span>
              <strong>{valid.every(Boolean) ? byte.toString(16).toUpperCase().padStart(2, "0") : "—"}</strong>
              <div>
                {Array.from({ length: 8 }, (_, bit) => {
                  const owner = bitOwners[index * 8 + bit];
                  return (
                    <span
                      key={bit}
                      style={{
                        color: mitFields[owner].color,
                        background: owner === selected ? "#e8eeeb" : "white",
                        borderBottom: `3px solid ${mitFields[owner].color}`,
                      }}
                      title={`${mitFields[owner].symbol}, field bit ${63 - (index * 8 + bit) - mitFields.slice(owner + 1).reduce((sum, f) => sum + f.bits, 0)}`}
                    >
                      {valid.every(Boolean) ? (byte >> (7 - bit)) & 1 : "–"}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="demo-help">
        Payload hex:{" "}
        <code>
          {valid.every(Boolean)
            ? bytes.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ")
            : "Complete the limits to encode a payload."}
        </code>
      </p>
      {reservedCommand && (
        <p className="mit-reserved-payload" role="status">
          Reserved AK payload: <strong>{reservedCommand}</strong>. On the cited firmware, this is a special command rather than a setpoint. The
          device-facing encoder must reject this collision.
        </p>
      )}
      <div className="mit-compact-controls">
        {mitFields.map((f, i) => (
          <div className="mit-command-row" key={f.name}>
            <div className="mit-command-value">
              <label htmlFor={`${id}-${f.name}`}>
                {f.name}{" "}
                <strong>
                  {values[i].toFixed(2)} {f.unit}
                </strong>
              </label>
              <input
                id={`${id}-${f.name}`}
                type="range"
                min={f.min}
                max={f.max}
                step={(f.max - f.min) / 1000}
                value={values[i]}
                onFocus={() => setSelected(i)}
                onChange={(e) => {
                  setSelected(i);
                  setValues(values.map((v, j) => (j === i ? Number(e.target.value) : v)));
                }}
              />
            </div>
            <div className="mit-shared-limits">
              {(["min", "max"] as const).map((bound) => (
                <label key={bound} htmlFor={`${id}-${f.name}-${bound}`}>
                  {bound}
                  <input
                    id={`${id}-${f.name}-${bound}`}
                    type="number"
                    step="any"
                    value={limits[i][bound]}
                    onFocus={() => setSelected(i)}
                    onChange={(e) => {
                      setSelected(i);
                      setLimits(limits.map((r, j) => (j === i ? { ...r, [bound]: e.target.value } : r)));
                    }}
                  />
                </label>
              ))}
            </div>
            <output className="mit-command-result" aria-live="polite">
              {valid[i] ? (
                <>
                  Code {raw[i]} · decoded {dequantize(decoded[i], Number(limits[i].min), Number(limits[i].max), f.bits).toFixed(6)} {f.unit}
                </>
              ) : (
                <>Enter finite limits with min smaller than max.</>
              )}
            </output>
          </div>
        ))}
      </div>
      {valid[selected] && (
        <output className="mit-resolution-value" aria-live="polite">
          {mitFields[selected].name} resolution:{" "}
          <strong>
            {((Number(limits[selected].max) - Number(limits[selected].min)) / (2 ** mitFields[selected].bits - 1)).toPrecision(5)}{" "}
            {mitFields[selected].unit}/code
          </strong>
        </output>
      )}
      <button
        type="button"
        className="signal-reset"
        onClick={() => {
          setValues(mitFields.map((f) => f.initial));
          setSelected(0);
          setLimits(defaults());
        }}
      >
        Reset commands and limits
      </button>
      <p className="demo-model-note">
        For a fixed bit width, a wider max − min gives a larger physical step per code and coarser resolution. The shared limits apply to both
        encoding and decoding. Commands are clamped to that range and truncated to an unsigned code. No CAN frames are transmitted. The diagram shows
        payload bits only, excluding CAN headers, CRC, and bit stuffing.
      </p>
    </section>
  );
}
