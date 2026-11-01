import { useEffect, useState } from "react";

type Mode = "reach" | "base";
const descriptions = [
  [
    "One state snapshot",
    "The model reads q and v once. Each active task receives its own reference; every Jacobian and dynamics term uses that same state.",
  ],
  [
    "Evaluate each task",
    "Gains turn pose error eᵢ and velocity error e_v,i into a desired task acceleration. Each task exports Jᵢ and bᵢ = aᵢ* − J̇ᵢv. Velocity errors and task Jacobians use matching frames; priority and weight are separate from the gains.",
  ],
  [
    "Assemble and solve WBC",
    "Hard requirements define the feasible set. Soft task residuals are weighted within their level; a larger weight is not a strict priority level.",
  ],
  [
    "Accept one coupled solution",
    "The solver chooses one generalized acceleration and compatible contact forces. Stop this path if the solution is invalid or infeasible.",
  ],
  [
    "Evaluate inverse dynamics",
    "RNEA computes the generalized effort required for the selected acceleration. Here it is evaluated without external forces: u_ID = M a_sol + h.",
  ],
  [
    "Account for support, then select joints",
    "Subtract the effort supplied by the ground contacts. The remaining base rows should be zero; select the actuated rows to obtain joint torque.",
  ],
];
const reachingTasks = [
  { name: "CoM", priority: "0 · hard", kp: "100", kd: "20", weight: null },
  { name: "Torso orientation", priority: "0 · hard", kp: "100", kd: "20", weight: null },
  { name: "Hand", priority: "1 · soft", kp: "100", kd: "20", weight: "1" },
  { name: "Posture", priority: "1 · soft", kp: "10", kd: "6.32", weight: "0.01" },
];
const baseTasks = [
  { name: "Base pose", priority: "1 · soft", kp: "100", kd: "20", weight: "10" },
  { name: "Posture", priority: "1 · soft", kp: "10", kd: "6.32", weight: "0.001" },
];

export default function WbcFlowDemo() {
  const [mode, setMode] = useState<Mode>("reach");
  const [phase, setPhase] = useState(0);
  const [playing, setPlaying] = useState(false);
  const tasks = mode === "reach" ? reachingTasks : baseTasks;
  useEffect(() => {
    if (!playing) return;
    if (phase === descriptions.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setPhase((value) => value + 1), 1700);
    return () => window.clearTimeout(timer);
  }, [playing, phase]);
  const arrow = (step: number, label: string) => (
    <div className="wbc-flow-arrow" data-active={phase === step}>
      <svg viewBox="0 0 22 30" aria-hidden="true">
        <path d="M11 0 V23 M5 18 L11 24 L17 18" fill="none" stroke="currentColor" strokeWidth="1.8" />
        {playing && phase === step && <circle className="wbc-flow-packet" cx="11" cy="5" r="3" />}
      </svg>
      <span>{label}</span>
    </div>
  );
  const nodeClass = (step: number) => `wbc-flow-node${phase === step ? " is-current" : ""}`;
  return (
    <section className="wbc-demo wbc-flow-demo" aria-label="Tasks to acceleration and torque flowchart">
      <header className="wbc-demo-heading">
        <div>
          <p className="eyebrow">Example · Acceleration-level inverse dynamics</p>
          <h3>Task requests become a robot command</h3>
        </div>
      </header>
      <div className="wbc-scenarios" role="group" aria-label="Active task set">
        {(["reach", "base"] as Mode[]).map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={mode === value}
            onClick={() => {
              setMode(value);
              setPhase(0);
              setPlaying(false);
            }}
          >
            {value === "reach" ? "Reaching tasks" : "Base balance tasks"}
          </button>
        ))}
      </div>
      <div className="wbc-flow-transport">
        <button
          type="button"
          aria-label={playing ? "Pause control flow" : "Play control flow"}
          onClick={() => {
            if (phase === 5) setPhase(0);
            setPlaying(!playing);
          }}
        >
          {playing ? "Ⅱ Pause" : "▶ Play"}
        </button>
        <button
          type="button"
          disabled={phase === 5}
          onClick={() => {
            setPlaying(false);
            setPhase((value) => Math.min(5, value + 1));
          }}
        >
          Step →
        </button>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            setPhase(0);
          }}
        >
          ↶ Rewind
        </button>
        <span>{phase + 1} / 6</span>
      </div>
      <div className="wbc-flow-diagram">
        <div className={nodeClass(0)}>
          <span className="wbc-flow-owner">State + robot model</span>
          <strong>q, v + current references</strong>
          <span>Kinematics · M, h · contact Jacobians</span>
        </div>
        {arrow(0, "Same state, different task references")}
        <div className={`wbc-flow-task-group${phase === 1 ? " is-current" : ""}`}>
          <div className="wbc-flow-task-list">
            {tasks.map((task) => (
              <div className="wbc-flow-task" key={task.name}>
                <div>
                  <strong>{task.name}</strong>
                  <span>{task.priority}</span>
                </div>
                <p>
                  Kp {task.kp} <span>·</span> Kd {task.kd}
                  {task.weight && (
                    <>
                      {" "}
                      <span>·</span> w {task.weight}
                    </>
                  )}
                </p>
              </div>
            ))}
          </div>
          <div className="wbc-flow-formula">aᵢ* = aᵢ,d + Kp,ᵢ eᵢ + Kd,ᵢ e<sub>v,i</sub></div>
          <div className="wbc-flow-exports">eᵢ: pose error · e<sub>v,i</sub>: desired − current task velocity</div>
          <div className="wbc-flow-exports">Each task → Jᵢ, bᵢ, priority, weight</div>
        </div>
        {arrow(1, "Task data, not motor commands")}
        <div className={nodeClass(2)}>
          <span className="wbc-flow-owner">WBC formulation + solver</span>
          <strong>minimize soft task residuals</strong>
          <span className="wbc-flow-formula">Σᵢ wᵢ ‖Jᵢ a − bᵢ‖²</span>
          <span className="wbc-flow-constraints">
            Subject to dynamics, fixed feet, friction, actuator bounds{mode === "reach" ? ", CoM and torso constraints" : ""}
          </span>
        </div>
        {arrow(2, "Accepted solution only")}
        <div className={nodeClass(3)}>
          <span className="wbc-flow-owner">Solver result</span>
          <div className="wbc-flow-solution">
            <strong>
              a<sub>sol</sub> <small>generalized acceleration</small>
            </strong>
            <strong>
              λ<sub>sol</sub> <small>stacked contact wrenches</small>
            </strong>
          </div>
        </div>
        {arrow(3, "q, v, a_sol → inverse dynamics; carry λ_sol forward")}
        <div className={nodeClass(4)}>
          <span className="wbc-flow-owner">Rigid-body inverse dynamics</span>
          <strong>
            RNEA(q, v, a<sub>sol</sub>)
          </strong>
          <span className="wbc-flow-formula">
            u<sub>ID</sub> = M a<sub>sol</sub> + h
          </span>
          <span>38 generalized force components for this Talos model</span>
        </div>
        {arrow(4, "Contact forces also supply effort")}
        <div className={nodeClass(5)}>
          <span className="wbc-flow-owner">Torque reconstruction + joint selection</span>
          <span>Jc: contact Jacobian paired with λ, in matching frames</span>
          <strong className="wbc-flow-formula">
            u<sub>act</sub> = u<sub>ID</sub> − J<sub>c</sub>
            <sup>T</sup> λ<sub>sol</sub>
          </strong>
          <div className="wbc-flow-solution">
            <span>
              Base rows ≈ 0 <small>consistency check</small>
            </span>
            <strong>
              τ = S u<sub>act</sub> <small>32 joint torques → command adapter</small>
            </strong>
          </div>
        </div>
      </div>
      <div className="wbc-flow-caption" aria-live="polite">
        <strong>{descriptions[phase][0]}</strong>
        <p>{descriptions[phase][1]}</p>
      </div>
      <p className="wbc-demo-note">
        Here λ denotes foot wrenches; TSID obtains each wrench from its four point forces through a force-generator matrix. This is the constrained weighted-QP path used by the two TSID examples above. Task gains and weights match those examples. The cost shown omits contact-force regularization for clarity. This animates the data
        path, not a live solve. TSID reconstructs torque from its dynamics blocks; RNEA expresses the equivalent inverse-dynamics evaluation here.
      </p>
    </section>
  );
}
