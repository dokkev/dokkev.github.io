// Run with Node 24: node --experimental-strip-types scripts/test-tendon-cyclic.mjs
import assert from "node:assert/strict";
import { frame, creepStep, geometry, cycle, CONTACT_K } from "../src/components/demos/tendonCyclicModel.ts";

for (const bend of [35, 40, 65])
  for (const peak of [2, 5, 7])
    for (const dc1 of [0, 1.5, 3])
      for (const dc2 of [0, 1.5, 3])
        for (const measured of [false, true])
          for (const phase of [0, 0.2, 0.25, 0.35, 0.5, 0.7, 0.8, 0.85, 0.99]) {
            const f = frame(phase, [dc1, dc2], peak, measured, bend);
            assert.ok(f.converged, JSON.stringify({ bend, peak, dc1, dc2, measured, phase }));
            for (let j = 0; j < 2; j++) {
              const excursion = j ? 10 * (f.q[0] + f.q[1]) : 10 * f.q[0];
              const elasticError = j ? f.elastic[1] - f.elastic[0] : f.elastic[0];
              const creepError = j ? dc2 - dc1 : dc1;
              assert.ok(Math.abs(f.motorTravel[j] - (excursion + f.elastic[j] + [dc1, dc2][j])) < 1e-10);
              assert.ok(Math.abs(f.qEncoder[j] - f.q[j] - (elasticError + creepError) / 10) < 1e-10);
              assert.ok(Math.abs(f.qHat[j] - f.q[j] - creepError / 10) < 1e-10);
            }
            assert.ok(Math.abs(f.tau[0] - 0.01 * (f.tension[0] + f.tension[1] - 20)) < 1e-10);
            assert.ok(Math.abs(f.tau[1] - 0.01 * (f.tension[1] - 10)) < 1e-10);
            for (let j = 0; j < 2; j++) assert.ok(Math.abs(f.actual.J[0][j] * f.force.x + f.actual.J[1][j] * f.force.y - f.tau[j]) < 1e-7);
            if (f.contact) {
              assert.ok(Math.abs(f.force.x - CONTACT_K * (f.actual.tip.x - f.anchor.x)) < 1e-7);
              assert.ok(Math.abs(f.force.y - CONTACT_K * (f.actual.tip.y - f.anchor.y)) < 1e-7);
            }
            if (measured || (dc1 === 0 && dc2 === 0)) assert.ok(Math.hypot(f.force.x - f.target.x, f.force.y - f.target.y) < 1e-6);
          }

// Check the analytical Jacobian against displacement, independently of the force solver.
const q = [0.3, 0.7],
  g = geometry(q),
  eps = 1e-7;
for (let j = 0; j < 2; j++) {
  const moved = geometry(q.map((v, i) => v + (i === j ? eps : 0)));
  assert.ok(Math.abs((moved.tip.x - g.tip.x) / eps - g.J[0][j]) < 1e-8);
  assert.ok(Math.abs((moved.tip.y - g.tip.y) / eps - g.J[1][j]) < 1e-8);
}

// Six cycles: creep persists through release and successive force holds develop larger errors.
let dc = [0, 0];
const holds = [];
for (let i = 0; i < 3000; i++) {
  const f = frame(i * 0.01 * 0.2, dc, 5, false, 40);
  assert.ok(f.converged);
  const next = creepStep(dc, f.tau, 0.01, 0.7, f.contact);
  assert.ok(next.every((v, j) => v >= dc[j]));
  if (!f.contact) assert.deepEqual(next, dc);
  dc = next;
  if (i % 500 === 250) holds.push(Math.hypot(f.force.x - f.target.x, f.force.y - f.target.y));
}
assert.ok(holds.every((v, i) => i === 0 || v > holds[i - 1]));
assert.deepEqual(creepStep([0, 0], [0.2, 0.1], 1, 0, true), [0, 0]);
// Approach/load/hold/unload/retraction transitions are continuous in actual pose and force.
for (const boundary of [0.2, 0.35, 0.7, 0.85, 1]) {
  const a = frame(boundary - 1e-7, dc, 5, false, 40),
    b = frame(boundary + 1e-7, dc, 5, false, 40);
  assert.ok(Math.hypot(a.actual.tip.x - b.actual.tip.x, a.actual.tip.y - b.actual.tip.y) < 1e-7);
  assert.ok(Math.hypot(a.force.x - b.force.x, a.force.y - b.force.y) < 1e-5);
}
assert.equal(cycle(0.5).stage, "hold");
console.log("Passed: equilibrium range, Jacobian, measured-pose correction, persistent creep, six cyclic holds, zero creep and phase continuity.");
