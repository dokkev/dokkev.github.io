import { useId, useState } from "react";

const hex = (value: number) => value.toString(16).toUpperCase().padStart(2, "0");

export default function HexByteDemo() {
  const id = useId();
  const [bytes, setBytes] = useState([0x34, 0x12]);
  const [littleEndian, setLittleEndian] = useState(true);
  const value = littleEndian ? bytes[0] + 256 * bytes[1] : 256 * bytes[0] + bytes[1];
  return (
    <section className="signal-demo" aria-label="Binary and hexadecimal explorer">
      <header className="signal-demo-heading">
        <span className="eyebrow">Try it · Reading a payload</span>
        <h3>The same bits, written in hex</h3>
      </header>
      <p className="demo-help">Toggle a bit. Each group of four bits becomes one hex digit; two digits make a byte.</p>
      {bytes.map((byte, index) => (
        <div className="hex-byte" key={index}>
          <div className="hex-byte-heading">
            Payload byte {index}{" "}
            <strong>
              0x{hex(byte)} · {byte} decimal
            </strong>
          </div>
          <div className="hex-nibbles">
            {[4, 0].map((offset) => (
              <div key={offset}>
                <div className="bit-editor">
                  {[3, 2, 1, 0].map((position) => {
                    const bit = position + offset;
                    const on = Boolean(byte & (1 << bit));
                    return (
                      <button
                        type="button"
                        key={bit}
                        aria-label={`Byte ${index}, bit ${bit}`}
                        aria-pressed={on}
                        onClick={() => setBytes(bytes.map((v, i) => (i === index ? v ^ (1 << bit) : v)))}
                      >
                        <span>bit {bit}</span>
                        <strong>{on ? 1 : 0}</strong>
                      </button>
                    );
                  })}
                </div>
                <div className="hex-digit">{((byte >> offset) & 15).toString(16).toUpperCase()}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <label htmlFor={`${id}-order`}>Interpret these two bytes as an unsigned 16-bit integer</label>
      <select id={`${id}-order`} value={littleEndian ? "little" : "big"} onChange={(e) => setLittleEndian(e.target.value === "little")}>
        <option value="little">Little-endian · byte 0 is least significant</option>
        <option value="big">Big-endian · byte 0 is most significant</option>
      </select>
      <output className="can-readout" aria-live="polite">
        <span>
          Payload bytes <strong>{bytes.map(hex).join(" ")}</strong>
        </span>
        <span>
          Unsigned integer{" "}
          <strong>
            0x{value.toString(16).toUpperCase().padStart(4, "0")} = {value}
          </strong>
        </span>
      </output>
      <button
        type="button"
        className="signal-reset"
        onClick={() => {
          setBytes([0x34, 0x12]);
          setLittleEndian(true);
        }}
      >
        Reset bytes
      </button>
      <p className="demo-model-note">
        Changing byte order changes this interpretation, while leaving the payload bytes unchanged. This example assigns no motor command, scale, or
        unit to the number.
      </p>
    </section>
  );
}
