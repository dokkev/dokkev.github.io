// Quasi-static 2R finger with a releasable, bilateral elastic fingertip grip.
// Coordinates: m, rad, N, N m; screen y is down and flexion is clockwise.
export const L1 = 0.05;
export const L2 = 0.035;
export const R = 10; // mm/rad, equal moment arms; x1 = r q1, x2 = r(q1 + q2)
export const T0 = 10; // N, balanced pretension
export const TENDON_K = 10; // N/mm, linear elastic stiffness
export const CONTACT_K = 6000; // N/m in both planar directions
export type Vec = { x: number; y: number };
export const rad = (d: number) => (d * Math.PI) / 180;
export const deg = (a: number) => (a * 180) / Math.PI;

export function geometry(q: number[]) {
  const [a, q2] = q,
    b = a + q2;
  const joint = { x: L1 * Math.cos(a), y: L1 * Math.sin(a) };
  const tip = { x: joint.x + L2 * Math.cos(b), y: joint.y + L2 * Math.sin(b) };
  return {
    joint,
    tip,
    J: [
      [-tip.y, -L2 * Math.sin(b)],
      [tip.x, L2 * Math.cos(b)],
    ],
  };
}

function inverse(p: Vec) {
  const c = (p.x ** 2 + p.y ** 2 - L1 ** 2 - L2 ** 2) / (2 * L1 * L2);
  if (Math.abs(c) >= 1) return null;
  const q2 = Math.acos(c);
  return [Math.atan2(p.y, p.x) - Math.atan2(L2 * Math.sin(q2), L1 + L2 * Math.cos(q2)), q2];
}

export function cycle(cycles: number) {
  const p = cycles % 1;
  const smooth = (v: number) => (1 - Math.cos(Math.PI * v)) / 2;
  if (p < 0.2) return { stage: "approach" as const, load: 0, reach: smooth(p / 0.2), contact: false };
  if (p < 0.35) return { stage: "load" as const, load: smooth((p - 0.2) / 0.15), reach: 1, contact: true };
  if (p < 0.7) return { stage: "hold" as const, load: 1, reach: 1, contact: true };
  if (p < 0.85) return { stage: "unload" as const, load: 1 - smooth((p - 0.7) / 0.15), reach: 1, contact: true };
  return { stage: "retract" as const, load: 0, reach: 1 - smooth((p - 0.85) / 0.15), contact: false };
}

export function frame(cycles: number, dc: number[], peak: number, measured: boolean, bend: number) {
  const phase = cycle(cycles);
  const contactQ = [rad(15), rad(bend)];
  const anchor = geometry(contactQ).tip;
  const target = { x: 0, y: peak * phase.load };
  let q = [rad(-5) + rad(20) * phase.reach, rad(20) + rad(bend - 20) * phase.reach];
  let tau = [0, 0],
    force = { x: 0, y: 0 };
  let converged = true;
  if (phase.contact) {
    let p = { ...anchor };
    converged = false;
    for (let i = 0; i < 100; i++) {
      const solved = inverse(p);
      if (!solved) break;
      q = solved;
      const actual = geometry(q);
      const used = geometry(measured ? q : [q[0] + dc[0] / R, q[1] + (dc[1] - dc[0]) / R]);
      // Flexion tendons only: a negative requested torque cannot be supplied.
      const tendon2Torque = Math.max(0, used.J[1][1] * target.y);
      const tendon1Torque = Math.max(0, (used.J[1][0] - used.J[1][1]) * target.y);
      tau = [tendon1Torque + tendon2Torque, tendon2Torque];
      const [[a, b], [c, d]] = actual.J;
      const det = a * d - b * c;
      const mapped = { x: (d * tau[0] - c * tau[1]) / det, y: (-b * tau[0] + a * tau[1]) / det };
      force = { x: CONTACT_K * (p.x - anchor.x), y: CONTACT_K * (p.y - anchor.y) };
      if (Math.hypot(force.x - mapped.x, force.y - mapped.y) < 1e-7) {
        converged = true;
        break;
      }
      p = { x: p.x + (0.35 * (mapped.x - force.x)) / CONTACT_K, y: p.y + (0.35 * (mapped.y - force.y)) / CONTACT_K };
    }
  }
  const actual = geometry(q);
  const tension = [tau[0] - tau[1], tau[1]].map((v) => T0 + v / (R / 1000));
  const elastic = tension.map((v) => (v - T0) / TENDON_K); // mm, relative to the pretensioned state
  const motorTravel = [R * q[0] + elastic[0] + dc[0], R * (q[0] + q[1]) + elastic[1] + dc[1]];
  const qEncoder = [motorTravel[0] / R, (motorTravel[1] - motorTravel[0]) / R];
  const corrected = motorTravel.map((v, j) => v - elastic[j]);
  const qHat = [corrected[0] / R, (corrected[1] - corrected[0]) / R];
  return {
    ...phase,
    q,
    qHat,
    qEncoder,
    tension,
    elastic,
    motorTravel,
    actual,
    encoder: geometry(qEncoder),
    estimated: geometry(qHat),
    tau,
    force,
    target,
    anchor,
    converged,
  };
}

export function creepStep(dc: number[], tau: number[], dt: number, rate: number, contact: boolean) {
  // Illustrative nonrecovering effective length drift; load is absolute net torque / moment arm + pretension.
  const tendonTorque = [tau[0] - tau[1], tau[1]];
  return dc.map((v, j) => v + (contact ? dt * 0.18 * rate * (1 + 0.3 * j) * ((T0 + Math.max(0, tendonTorque[j]) / (R / 1000)) / 40) ** 2 : 0));
}
