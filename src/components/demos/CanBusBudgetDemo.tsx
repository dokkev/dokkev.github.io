import { useId, useState } from "react";

export default function CanBusBudgetDemo() {
  const id = useId();
  const [motors, setMotors] = useState(3);
  const [frequency, setFrequency] = useState(1000);
  const [bitrate, setBitrate] = useState(1000000);
  // Classical CAN, 11-bit ID, 8 data bytes: 108 bits + 3-bit intermission, before stuffing.
  const framesPerSecond = 2 * motors * frequency;
  const load = (100 * framesPerSecond * 111) / bitrate;
  return (
    <section className="signal-demo" aria-label="CAN bandwidth budget calculator">
      <header className="signal-demo-heading">
        <span className="eyebrow">Try it · One shared bus</span>
        <h3>Budget command and feedback traffic</h3>
      </header>
      <div className="signal-controls">
        <div>
          <label htmlFor={`${id}-motors`}>
            Motors <strong>{motors}</strong>
          </label>
          <input id={`${id}-motors`} type="range" min="1" max="8" value={motors} onChange={(e) => setMotors(Number(e.target.value))} />
        </div>
        <div>
          <label htmlFor={`${id}-frequency`}>
            Updates per motor <strong>{frequency} Hz</strong>
          </label>
          <input
            id={`${id}-frequency`}
            type="range"
            min="100"
            max="1000"
            step="100"
            value={frequency}
            onChange={(e) => setFrequency(Number(e.target.value))}
          />
        </div>
      </div>
      <label htmlFor={`${id}-bitrate`}>Bus bitrate</label>
      <select id={`${id}-bitrate`} value={bitrate} onChange={(e) => setBitrate(Number(e.target.value))}>
        <option value="1000000">1 Mbit/s</option>
        <option value="500000">500 kbit/s</option>
      </select>
      <output className={`can-readout ${load >= 100 ? "logic-uncertain" : ""}`} aria-live="polite">
        <span>
          Frames per second <strong>{framesPerSecond.toLocaleString("en-US")}</strong>
        </span>
        <span>
          Bus time before bit stuffing <strong>{load.toFixed(1)}%</strong>
        </span>
      </output>
      <p className="demo-help">
        {load >= 100
          ? "This schedule exceeds the bus capacity even before bit stuffing or retransmissions."
          : "This is a lower-bound time budget. Remaining capacity must also accommodate bit stuffing, other messages, and retransmissions."}
      </p>
      <p className="demo-model-note">
        Calculated example: one 8-byte command and one 8-byte feedback frame per motor per update, Classical CAN with 11-bit identifiers. Each frame
        uses 111 bit times including intermission, before bit stuffing. This does not predict message latency or guarantee a control deadline.
      </p>
    </section>
  );
}
