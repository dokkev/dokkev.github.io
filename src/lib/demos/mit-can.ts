// Teaching profile only. A motor's model and firmware define its actual ranges.
export const mitFields = [
  { name: "position", symbol: "q_des", bits: 16, min: -12.5, max: 12.5, unit: "rad", initial: 1, color: "#17695b" },
  { name: "velocity", symbol: "qdot_des", bits: 12, min: -30, max: 30, unit: "rad/s", initial: 0, color: "#305f9b" },
  { name: "stiffness", symbol: "kp", bits: 12, min: 0, max: 500, unit: "N·m/rad", initial: 20, color: "#80511b" },
  { name: "damping", symbol: "kd", bits: 12, min: 0, max: 5, unit: "N·m·s/rad", initial: 1, color: "#754497" },
  { name: "effort", symbol: "tau_ff", bits: 12, min: -10, max: 10, unit: "N·m", initial: 0.5, color: "#a33e40" },
] as const;

export function quantize(value: number, min: number, max: number, bits: number) {
  const bounded = Math.max(min, Math.min(max, value));
  return Math.floor(((bounded - min) / (max - min)) * (2 ** bits - 1));
}
export function dequantize(raw: number, min: number, max: number, bits: number) {
  return min + (raw / (2 ** bits - 1)) * (max - min);
}
export function packMit(raw: number[]) {
  const [q, v, kp, kd, t] = raw;
  return [q >> 8, q & 255, v >> 4, ((v & 15) << 4) | (kp >> 8), kp & 255, kd >> 4, ((kd & 15) << 4) | (t >> 8), t & 255];
}
export function unpackMit(b: number[]) {
  return [(b[0] << 8) | b[1], (b[2] << 4) | (b[3] >> 4), ((b[3] & 15) << 8) | b[4], (b[5] << 4) | (b[6] >> 4), ((b[6] & 15) << 8) | b[7]];
}

// Only for firmware using the special payloads in the cited CubeMars AK manual.
export function akControlPayload(bytes: number[]) {
  if (bytes.length !== 8 || !bytes.slice(0, 7).every((byte) => byte === 0xff)) return undefined;
  if (bytes[7] === 0xfc) return "Enter control mode";
  if (bytes[7] === 0xfd) return "Exit control mode";
  if (bytes[7] === 0xfe) return "Set current position to zero";
  return undefined;
}
