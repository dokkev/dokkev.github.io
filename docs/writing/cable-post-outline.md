# CABLE SERIES — MASTER OUTLINE

> **Document status:** Canonical planning document / source of truth for the Cable blog series  
> **Version:** 1.0 · **Prepared:** 2026-11-15 · **Language:** Korean main text, English technical terms and optional subtitles  
> **Publication status:** Planning only; no post is approved for publication by this document.  
> **Origin:** User-supplied `Cable Post Outline` (latest uploaded revision, 704 logical lines), earlier outline revisions, and discussion of 2025 CBOS work.  
> **Research cutoff:** 2026-11-15. Newly published literature and installed MuJoCo version must be checked again when each post is written.

**One-sentence thesis** — *Understanding cable mechanics is only the beginning. The real goal is to build a transmission model that robots can actually use.*

**Series question** — **“이 tendon/cable transmission을 어떤 조건에서 모델링할 수 있고, 그 응답을 얼마나 예측할 수 있는가?”**

**Reader question for Cable 01** — “Datasheet에서 충분히 강하고 덜 늘어나는 케이블을 골랐는데도, 왜 모터의 운동과 장력이 출력에서 그대로 재현되지 않을까?”

**Recurring engineering lesson** — *A controlled motion is not necessarily a controlled loading condition.*

---

## 0. How to use this document

### 0.1 Authority and source hierarchy

1. **This MASTER OUTLINE** governs series scope, the role of each post, core claims, non-goals, topic boundaries, evidence requirements, citations, proposed illustrations, and unresolved work.
2. **`style-guide.md`** governs prose voice, sentence-level style, terminology conventions, formatting preferences, and writing/rewriting decisions. **Before drafting or revising any post, locate and read the actual repository copy of `style-guide.md`.** Do not substitute invented stylistic rules. If not found, mark writing as *style-check pending* and report the missing location. The guide's actual contents were **not supplied or available for inspection while preparing this document**, so no claims about its specific rules are made here.
3. **Original published paper / publisher or official technical documentation**, at a pinned version/date, governs external factual claims. An abstract establishes only what its text supports; it cannot establish unseen experimental details.
4. **Direct lab artifacts** (CAD, scripts, logs, photos, sensor calibration, notebook) govern what was built/measured. Retrospective conversation notes are leads, not replacements for those records.
5. **Exploratory discussion** governs open questions and candidate experiments but must never become a reported experimental result without evidence.

When guides conflict, first distinguish *editorial style* from *technical substance*. Style never overrides scientific evidence, and master-outline headings do not establish empirical facts. Record substantive changes in the change log.

### 0.2 Evidence labels — mandatory in working drafts, may be removed from public prose after verification

- **[P] Established/primary-supported:** fact or physical relation backed by a linked primary source or explicit derivation with conditions.
- **[A] Abstract/metadata-verified only:** title/DOI/abstract checked; numerical or detailed method claims remain blocked pending full paper.
- **[H] Historical user recollection:** 2025 design or observation described by the user, not independently validated with original logs.
- **[Q] Open question or proposed mechanism:** hypothesis to test; no claim of demonstration.
- **[I] Implementation proposal:** code, MJCF architecture, instrument design, or future experiment that has not been run or validated.
- **[V] Verified implementation/result:** reserve for an actual tested artifact with commit/hash, version, date, logs, setup and metrics. **Nothing is marked [V] by this outline.**

For every empirical sentence ask: *What exactly was observed? Under what loads, speed, route, termination, sample, instrumentation, and reference state? What alternative mechanism could explain it?*

### 0.3 Scope and audience

Audience — robotics researchers, robotic-hand designers and actuator engineers familiar with forces, motion, basic mechanics and control. This is **an engineering learning narrative**, not a formal comprehensive review, product selection guide, or published study of the author's testbed.

The throughline is **ideal tendon kinematics → cable/termination/routing mechanics → transmission model → measurement and system ID → simulator-usable abstraction → data-grounded uncertainty → Sim2Real and adaptive control**. Fatigue and breakage matter, but the distinctive question is **what the transmission does before failure**.

### 0.4 Editorial guardrails

- Favor **problem → simplest useful model → assumptions → where it breaks → prior evidence → what we can measure → implications/open question**. Do not force every paragraph into the same mold.
- 01 is an entry point with existing interactive mechanism demonstrations. Later posts should **not repeat the kinematics tutorial**. Robot topology is introduced only insofar as it changes cable boundary conditions, effective moment arm or sensing/control.
- Do not write “specifications are wrong”; write that specified standard-test conditions do not fully determine installed transmission performance.
- Separate **material filament properties, constructed rope properties, termination properties, routing losses, motor/fixture effects, closed-loop controller effects**.
- Keep **friction, abrasion, fatigue, creep, constructional stretch, settling, slip, plasticity and hysteresis** distinct; a measured drift does not uniquely reveal its cause.
- Separate **passive backdrivability, force reflection / transparency, command tracking, efficiency and robustness**. Model-based compensation may improve tracking without removing physical losses.
- **CBOS** means a cyclic-bend-over-sheave *loading condition*; the testbed is a device that imposes/measures it.
- **Avoid universal ranks and unverified numbers.** No extrapolation from industrial marine ropes to robot-scale tendons without load, diameter, speed and environment scaling arguments.
- In formulas, specify sign convention, units, reference frame, boundary conditions, load history and where an approximation stops applying.
- Respect figures' rights; produce original schematics unless explicit reuse permissions exist.
- The requested original title for Cable 01 stays **“Cables Are Harder Than They Look — Why Specifications Don't Tell the Whole Story”**; Korean display title can be “케이블은 생각보다 훨씬 어렵다 — Specification이 전부가 아니다”.

### 0.5 Recommended content artifacts per post

Each released post should contain: one controlling question; one strong explanatory claim with limits; **one** concrete example, derivation or interactive object; 1–3 original schematics/plots if useful; a compact literature comparison; a clear statement of what is observed vs. assumed; one explicit bridge to the next post; and References containing only literature cited *in that post*. Length follows the argument, not a global word-count quota. Limit repetition of the ten-post series map to a short next-post link.

---

## 1. Final working series map (10 posts)

| No. | Working title | Main question | Deliverable / function | Seed references |
|---|---|---|---|---|
| **01** | **Cables Are Harder Than They Look** — Why Specifications Don't Tell the Whole Story | 왜 ideal tendon kinematics와 datasheet가 실제 전달을 예측하지 못하는가? | Existing interactive robot-mechanism examples, specification-vs-transmission contrast, unresolved problems | [1][2][4][10][17] |
| **02** | **A Cable Is Not Just Its Material** — Construction, Bending and Internal Abrasion | rope construction과 bend cycling이 물성을 어떻게 바꾸는가? | Hierarchy figure; internal/external abrasion; preconditioning questions | [3][4][6][7][13][14][15][16] |
| **03** | **Termination Is Part of the Transmission** — Knots, Splices and Settling | 왜 같은 rope도 끝단 고정에 따라 응답이 달라지는가? | knot/splice/clamp taxonomy; Capler-Leg vs DRACO 3 evidence review | [2][5][8][9][18] |
| **04** | **Routing Is Not Free** — Pulleys, Bowden Conduits and Transparency | remote actuation 자유도에 지불하는 기계적 비용은? | Free route/rotating sheave/fixed guide/conduit comparison | [1][10][11][17] |
| **05** | **From Cable Mechanics to Transmission Models** — How Much Physics Is Enough? | 물리 현상 중 어떤 것을 계산 모델에 포함해야 하는가? | Explicit hierarchy of candidate models and equations | [1][7][10][11][19][20] |
| **06** | **What Can We Actually Identify?** — Observation and System ID | sensor/output에 비추어 어떤 parameter와 hidden state가 구별 가능한가? | Identifiability cases, sensor/excitation/validation matrix | [1][10][11][19] |
| **07** | **Building a Testbed That Actually Measures Something** — CBOS and Controlled Loading | 실험이 cable behavior와 fixture behavior를 어떻게 분리할 수 있나? | 2025 testbed case history, protocol and data schema | [3][6][15][16] + [12] |
| **08** | **From System ID to MJCF** — A Robot-Usable Tendon Abstraction | 식별된 거동을 어떤 MuJoCo representation으로 옮길 것인가? | MJCF features / limitations, fidelity ladder, example and validation plan | [11][19][20][21] |
| **09** | **Data-Driven Domain Randomization** — Randomize What We Know, Represent What We Don't | 실제 변동과 불확실성을 어떻게 DR distribution으로 만드는가? | Randomization taxonomy, correlated parameter distributions, baseline comparisons | [22][23][24][25] |
| **10** | **Closing the Real2Sim2Real Loop** — Validation, Adaptation and Functional Degradation | nominal model이 틀릴 때 policy와 transmission model을 어떻게 검증·수정하는가? | End-to-end test matrix; adaptive control vs. online identification; failure criteria | [1][11][23][24][25] |

**Map migration from latest uploaded outline:** Prior Cable 02 (robot application topology) is **folded into interactive introductory Cable 01**, with advanced routing/Bowden placed in **04**. Prior 03 termination stays **03**. Prior 04 yarn-on-yarn + construction becomes **02**. Prior 05 modeling stays **05** but deep MJCF implementation moves to **08**. The original 06+ questions are expanded into **06–10**. **Nothing is dropped**; the source draft remains the historical idea bank.

**Grouped arcs:** ACT I (01–04) Physics/design choices; ACT II (05–07) Modeling/identification/experiment; ACT III (08–10) Simulator abstraction/Sim2Real/control.

### Current repository placement

The following separation was applied on 2026-11-15 to keep the project page focused. The new Cable files are migration drafts, not completed versions of the full briefs below; their `published: false` status is retained.

| Content | Repository location | Scope |
|---|---|---|
| Robot-hand and cable-material image gallery | [Cable 01](../../content/blog/Cable/2026-11-15-cable-01-kr.md) | Application and specification context; image references travel with the gallery |
| Transmission model, routing/friction, history effects, pose-to-force error, general physics/residual modeling | [Cable 05 draft](../../content/blog/Cable/2026-11-15-cable-05-kr.md) | General modeling background migrated from TiL; literature comparison remains to be completed |
| Fixed/spatial tendon, native mechanics, distributed-friction and history limits | [Cable 08 draft](../../content/blog/Cable/2026-11-15-cable-08-kr.md) | General MuJoCo explanation; executable, version-pinned MJCF work remains pending |
| Cyclic creep visualization | [Interactive demos](../../content/blog/Cable/2026-11-15-interactive_demo.mdx) | Shared demonstration; not duplicated in the project page |
| HIL apparatus, routing hardware extension, data protocol, neural observer and transfer evaluation | [Tendon-in-the-Loop](../../content/projects/2026-11-15-tendon-in-the-loop.mdx) | Research proposal and project-specific validation |

General cable mechanics should be developed in the relevant series post. The TiL page retains only the background needed to explain its testbed and observer design.

---

## 2. Per-post writing briefs

### CABLE 01 — Cables Are Harder Than They Look

**Subtitle:** Why Specifications Don't Tell the Whole Story  
**Purpose:** An inviting, technically correct **problem definition**, not a compact encyclopaedia of every cable failure mode.  
**Reader question:** “케이블을 잡아당기면 관절은 움직이는데, 왜 command motion과 실제 output force/displacement는 단순한 식대로 나오지 않을까?”  
**Claim:** A specification under declared test conditions and an ideal length constraint are useful, but neither is a complete model of an assembled, history-dependent tendon transmission.

**Proposed section flow**

1. **Start from the already built interactive examples**. Bidirectional/antagonistic tendons vs. tendon plus return spring; joint pulley vs. direct link pulling. Keep it playful and short. No new interactive artifact is assumed necessary.
2. **What the example really assumes.** The length map `l(q)` or `Δl ≈ rΔq` is an ideal kinematic relationship, not a guarantee that motor-side travel equals distal motion under load. For a direct pull, `τ = -T ∂l/∂q` with explicit sign conventions; moment arm need not be constant.
3. **“하지만 이런 cable kinematics만이 tendon의 전부는 아니다.”** This is the hinge sentence; show the gap between geometric routing and force/motion transmission.
4. **What datasheets measure.** Break load vs. safe working load; material Young's modulus vs. rope effective axial stiffness; break elongation vs. operating creep/conditioning; test-gauge length, speed, temperature and termination method. Give one compact table with 'listed' / 'not determined'.
5. **Minimal axial model.** `δ=TL/(EA)` only for small-strain, linear-elastic, axial, taut, uniform idealization. In a rope, identify `EA` as *effective* stiffness fitted under defined loading protocol; do not naively substitute fiber modulus and nominal circular area.
6. **Reality invades.** One paragraph/visual each on bending + friction, time/history + bedding-in, termination settling, construction, and Bowden trade-off. Introduce, do not resolve. Point to 02–04.
7. **A 2025 motivation, not a result section.** The user's historical observation: same position-controlled stroke + changing effective cable length → changed load-spring compression and tension history [H]. This motivates why a test cannot control loading merely by commanding motion. Avoid unverified motor/sensor specs or life numbers.
8. **Close with the true object of study.** Input-output force/displacement prediction under specified route, preload, load, history and time. Leave “What properties are we actually modeling?” for Cable 02.

**Required graphics:** reuse existing interactive (no rebuild); a self-drawn *ideal vs. actual transmission* chain; one table comparing spec quantity and robot performance quantity. Optional schematic showing motor displacement → spring load variation.

**Mandatory distinctions:** ideal kinematics vs. mechanics; axial `EA` vs. bending; passive transparency vs. tracking; tensile failure vs. functional error. Avoid saying all rope behavior is nonstationary at every timescale; local LTI approximations can be useful.

**Primary reading:** [1] Palli for model/friction motivation, [2] Horigome/Endo for bending/ends, [4] Davies for new-rope stiffness, [10] Agrawal for Bowden, [17] architecture survey (background only). **Historical lead:** [12].

**Not this post:** detailed braid comparison, knot test procedures, capstan derivation, MuJoCo XML, System ID algorithms, full CBOS apparatus methodology.

**Hand-off:** “If tendon kinematics is this simple, what is the cable itself made of — and why does that change the answer?”

### CABLE 02 — A Cable Is Not Just Its Material

**Subtitle:** Construction, Bending and the Mechanics of Internal Abrasion  
**Reader question:** “같은 HMPE/UHMWPE yarn을 썼는데 왜 rope마다 stiffness, bedding-in and bending fatigue가 다른가?”  
**Claim:** A rope is a load-sharing, internally contacting, geometrically arranged assembly. Construction and use history alter its response beyond constitutive properties of individual filaments.

**Proposed section flow**

1. Introduce **filament → yarn → strand → rope**, but do not claim every manufacturer uses the same hierarchy. Differentiate `single braid`, `double braid`, core/cover, overall sheath, individual strand jacketing, twist, braid angle, packing, heat setting, pre-stretch and coating.
2. Show why `EA_rope ≠ E_fiber × nominal rope area` in general. Use a minimal helix projection (`axial projection = yarn path × cos α`) **only as kinematic intuition**, not a complete braided-rope stiffness law; contact and rearrangement matter.
3. Define bending conditions separately: sheave-to-rope ratio `D/d`, local curvature, wrap angle (total contact extent), contact pressure, relative motion. More wrap angle **does not** automatically increase local curvature.
4. Explain **external cable–sheave abrasion** vs. **internal yarn–yarn/filament abrasion**. Relative sliding + contact pressure can produce wear; do not claim abrasion is universally the dominant failure mode. Competing mechanisms include thermal, compression, fatigue, creep and termination damage.
5. Explain *bedding-in / constructional stretch / material creep / stress relaxation / slip*, with conditions needed to distinguish them. Initial increase in measured stiffness does not prove absence of microscopic damage.
6. **Hypothesis to examine [Q]:** axial pre-stretch could leave construction/routing changes that appear as further elongation after bending. Separate bending-induced *in-motion* compliance from persistent reference-length shift; compare at fixed reference tension, temperature and recovery time and independently measure end slip.
7. Compare three classes of evidence: **single-yarn abrasion** [14], **complete rope CBOS** [6][15][16], **rope-level friction/structure models** [7][13]. Describe what each measures and cannot independently predict.
8. Close with the limitation: even a well-characterized rope still requires an ending and an installed route.

**Suggested figures / experiments:** original nested rope hierarchy; two contact locations (external vs. internal); `D/d` vs. wrap-angle geometry; proposal for A→B vs. B→A controlled loading blocks (same blocks, reversed order), separate specimen/assembly controls.

**Primary readings:** [3] bedding-in; [4] rope/fiber difference; [6] classical CBOS lifetime; [7] hierarchical friction; [13] bending durability in robotic-scale rope; [14] yarn abrasion; [15] environmental/geometry CBOS factors; [16] dynamic loading CBOS. [26] coating and wear as an **optional newer** counterexample to simplistic coating claims.

**Limits:** No direct lifetime scaling from marine-scale ropes to millimeter robotic tendons; no global material ranking from isolated tests; no construction-dependent numerical improvement without paper and conditions.

**Hand-off:** “케이블 자체를 이해해도, 마지막 몇 밀리미터의 attachment가 전달 전체를 결정할 수 있다.”

### CABLE 03 — Termination Is Part of the Transmission

**Subtitle:** Knots, Splices, Clamps and Length Stability  
**Reader question:** “케이블의 끝을 고정하는 작업이 왜 stiffness, load capacity and calibration 문제인가?”  
**Claim:** Termination is a local load-transfer structure whose geometry and evolution can dominate observed assembly response even when rope material is unchanged.

**Proposed section flow**

1. Reject the ideal *fixed endpoint* boundary condition as an untested convenience; show cable body + terminal as **series compliance** with possible settling/slip.
2. Distinguish **breaking efficiency** `F_break,terminated / F_break,reference` from cyclic length stability, slip threshold, repeatability and serviceability. A strong knot is not necessarily a dimensionally stable knot.
3. Mechanisms to assess: bending concentration, compression and contact, load redistribution, slippage, frictional heating, creep-like settling; do not attribute all length changes to material creep.
4. Taxonomy: overhand/figure-eight/Estar stopper knot (geometry and role), eye splice, stitched/served termination, crimp sleeve, barrel-end, grooved wrap and pin. Evaluate dimensions, rope type, field repeatability, maintenance and strength.
5. **Contrasting cases [P]:** Hwangbo et al. Capler-Leg [8] discusses trouble with ordinary knots and single eye-splice under their cycling; Bang et al. DRACO 3 [9] reports Estar stopper knot on **knee**, while upgraded **hip** uses stainless cable plus soldered barrel ends / crimp sleeves. **Do not conflate hip and knee.** Upgraded hip changes material *and* termination; no isolated causal claim about the knot.
6. Endo et al. [5] and Horigome et al. [18] offer grooved-pulley/wrap designs to distribute termination load. Report efficiency numbers **only with material and test conditions** from the actual paper.
7. Identification problem: measured elongation may be tendon-body change + terminal settlement + sensor/fixture displacement. Mark rope/termination/reference frame; plan reassembly controls.
8. Close with routing — the next place where supposedly ideal, frictionless transmission changes.

**Suggested figure:** exploded terminal force path and slip markers; comparison table with *load capacity / permanent settling / reassembly / space / inspectability*, and a clearly attributed schematic of Capler-Leg vs DRACO 3 (redraw with citation, don't silently reuse copyrighted figures).

**Readings:** [2][5][8][9][18].

**Hand-off:** “끝단이 안정적이어도, 케이블이 지나가는 경로가 실제 힘 전달을 바꾼다.”

### CABLE 04 — Routing Is Not Free

**Subtitle:** Pulleys, Conduits, Friction and Mechanical Transparency  
**Reader question:** “원격 배치의 자유도와 backdrivability를 동시에 얻을 수 있을까?”  
**Claim:** Tendon transmission architecture has an unavoidable geometry-contact trade-off; **Bowden conduit can reduce transparency**, but how much depends on route, contact, load and motion, and compensation is not equivalent to removing friction.

**Proposed section flow**

1. Short reminder of 01 mechanisms. Distinguish **joint pulley**, **freely rotating idler**, **sliding eyelet/fixed guide**, **Bowden sheath** — each imposes different mechanical constraints. The initial interactive examples remain owned by 01.
2. Separate actuator-placement advantages from inherent cable properties; define remote actuation benefits in moving mass and moment of inertia only under stated architecture.
3. Define **transparency** operationally: motor-side ability to sense/reflect distal loads, forward force transmission, passive backdrivability, dead-zone/stiction. Compare separately with closed-loop tracking and efficiency.
4. Derive the capstan limiting relation `T_high/T_low = exp(μ φ)` **for an ideal sliding cable on a fixed guide**, with uniform coefficient and contact geometry assumptions. A rotating pulley has bearing and other losses; its force ratio is not automatically given by that model.
5. Bowden cable–conduit: cumulative curvature, distributed normal load and friction, cable/sheath compliance, direction reversal, stiction and history. Examine routing curvature change when robot articulates.
6. Compare motor-side-only estimates vs. distal load sensing. A motor encoder alone does not resolve all distal states under arbitrary unknown friction, but actual structural observability requires an explicit state/sensor/input model.
7. Use Agrawal [10] and recent distributed model Li [11] as a bridge to model order and compensation. Distinguish improved tracking from true passive transparency.
8. Close: “What is the minimum model that preserves the output of interest?”

**Suggested graphic:** same cable through free sheave vs fixed curved guide vs Bowden; input/output tension–displacement loops; passive force-reflection test definition (hypothetical unless measured).

**Readings:** [1][10][11][17].

**Not this post:** implementing a full distributed friction simulation or optimizing robot-hand topology.

**Hand-off:** “Knowing the mechanics does not mean every mechanism needs every detail of the physics modeled.”

### CABLE 05 — From Cable Mechanics to Transmission Models

**Subtitle:** How Much Physics Do We Actually Need?  
**Reader question:** “정확한 cable physics 모델과 유용한 robot transmission model은 같은 것인가?”  
**Claim:** Model complexity should be justified by **target outputs, inputs, operating envelope, identification data and computational budget**, not maximal microscopic fidelity.

**Proposed section flow**

1. Establish a precise modeling boundary: **cable specimen**, **installed transmission**, or **whole robot including actuator, load and control**. The output might be distal tension, motion error, torque, stiffness or energy budget.
2. Present a **fidelity ladder**: ideal inextensible length constraint → taut axial spring → slack/deadband → viscous damping → static friction → dynamic/stiction/hysteresis → history-dependent internal state → distributed path/curvature model → yarn-scale model. No claim that ladder is a strict hierarchy of accuracy.
3. Elastic toy example `T = k_eff max(0, Δl − l_slack)` with explicitly identified displacement reference and unilateral tension. Time dependence may require `k_eff(t)` and `l_0(t)` (effective parameters, not direct proof of fiber damage).
4. Friction model comparison: capstan limit, equivalent Coulomb/viscous friction, LuGre-like internal state [1], distributed spring–friction element [11]. Show assumptions, states and what signal is fitted.
5. Discuss hysteresis vs. viscoelasticity vs. backlash vs. true irreversibility. A good `T(x)` loop fit at one amplitude/frequency may not generalize.
6. **MuJoCo as preview only.** Its tendon kinematics and native simple passive terms are examples of a robot-usable lower-fidelity model. **Deep MJCF syntax and exact implementation belong in 08.** The original outline's XML discussion is preserved, relocated, not deleted.
7. Comparison matrix for [1], [7], [10], [11], [19][20]: included physical states; measured inputs/outputs; identification method; compute cost when reported; validation conditions; extrapolation evidence. Mark absent full-text evidence rather than filling from expectation.
8. Derive choice rule: simplest model whose prediction error on **held-out conditions** is adequate for the chosen task. Sensor noise, controller bandwidth and target task tolerance can dominate the required fidelity.

**Visual:** model-fidelity ladder with an *output coverage* matrix; “same fit, different held-out behavior” conceptual curves.

**Readings:** [1][7][10][11][19][20].

**Hand-off:** “A model with many parameters is not yet a model whose parameters can be inferred.”

### CABLE 06 — What Can We Actually Identify?

**Subtitle:** Observability, Identifiability and Experiment Design  
**Reader question:** “같은 실험 데이터에 맞는 모델이 여러 개라면 무엇을 알았다고 주장할 수 있나?”  
**Claim:** A parameter fit is meaningful only together with a model structure, available measurements, informative excitation, noise assumptions and generalization tests.

**Proposed section flow**

1. Define **observation vs. inference**: motor position, output joint position, spring displacement and tension are measured (only when corresponding sensors exist); `friction coefficient`, true rope stiffness, creep state and internal wear are usually estimates. Choose a system boundary first.
2. Distinguish **observability (dynamic state)**, **structural identifiability (unique parameter mapping in the ideal model)**, **practical identifiability (precision under limited noisy data)**, and **predictive sufficiency**. They are not synonyms.
3. Toy model `T = k(x−x_0)` in taut regime. With calibrated `T,x` over informative range, `k` and `x_0` can be identified (if `k≠0`). With unknown displacement offset or confounded end slip, parameters may become coupled. **Do not present this toy model as automatically structurally unidentifiable.**
4. Input design by question: quasi-static load ramps for effective stiffness; displacement reversals for backlash/hysteresis; static holds for creep/relaxation distinction; speed sweeps for rate dependence; modest perturbations at a declared operating point for local FRF. Protect against heating, fixture changes and changing end state.
5. What can input/output tensions reveal? `ΔT`, loop/phase metrics and equivalent friction **under explicit assumptions**. Capstan-derived `μ_eff` is not generally a constitutive material coefficient if bearing, sheath or stick/slip mechanisms are unmodeled.
6. Why a whole-testbed fit may **not** identify cable-only mechanics: motor/gearbox/bearing friction, return spring, termination, routing, load inertia and sensor delays contribute to the same curves. Plan calibration, A/B controls, reference fixtures and/or intermediate sensing.
7. Three repeatability axes: cycle-to-cycle; after removal/reassembly; different nominally identical cable specimens. Split data by those groups. Fit quality on adjacent cycles is not strong out-of-condition evidence.
8. Differentiate **offline ID**, **online ID**, **calibration** and **adaptive control**. Estimating a parameter online is not evidence that control improved; reducing tracking error does not identify a degradation mechanism.
9. Explicit experiment/analysis checklist: clock alignment; encoder-to-length mapping; cable wrap and possible slip; sensor bandwidth, filtering and delay; sampling rate; input excitation; identifiability condition; held-out regimes.

**Suggested figures:** sensors and hidden states on a one-DOF transmission; competing-model fits and held-out predictions; identifiability “what is measured/what is inferred” table.

**Important methods note:** For local linearized transmission `H(jω)=X_out(jω)/X_in(jω)`, state excitation, operating point, load, boundary, amplitude and stationarity assumptions. This is a **motion transfer function**, not dynamic stiffness. Dynamic stiffness is force/displacement at a defined port, not automatically `H`.

**Readings:** [1][10][11], supplemented by an appropriate system-identification methods source *only after primary-source confirmation* [29, research queue].

**Hand-off:** “If the apparatus itself shapes the load, we must design the testbed to make our measurements interpretable.”

### CABLE 07 — Building a Testbed That Actually Measures Something

**Subtitle:** CBOS, Controlled Loading and the Difference Between Failure and Function  
**Reader question:** “같은 commanded stroke나 cycle count로 케이블을 공정하게 비교할 수 있을까?”  
**Claim:** An experiment must control or record the **mechanical load history it claims to compare**, not merely the actuator command, and separate structural failure from prior functional degradation.

**Proposed section flow**

1. State purpose and boundary: **CBOS** is the cyclic-bend-over-sheave condition; the testbed realizes it. Compare lifetime, residual strength, and/or transmission changes as **different outcomes**.
2. Use the 2025 design as a **historical engineering case [H]**. The notes describe motor-driven cyclic motion using crank-rocker geometry, loading/return springs, pulley bending and intended/recorded tension and motion measurements, plus elongation compensation questions. **Verify exact hardware, encoder counts, timing, sample list and wiring against primary files before public assertions.**
3. Main incident from 2025-07-28 [H]: same motor-position trajectory with cable elongation → different load spring compression → differing actual tension. This is the post's turning point. “A controlled motion is not necessarily a controlled loading condition.”
4. Why load comparison fails if uncontrolled: record actual `T_mean`, `T_max`, `T_min`, amplitude, time under load, speed and bending radius across cycles, not only strokes and counts. If studying in-service behavior under variable tension, call that experimental condition intentionally rather than implying constant-load comparison.
5. **Proposed staged tests [I]:** (a) straight tensile/hold/recovery; (b) identical end terminations with slip marks; (c) fixed guide vs. rolling sheave baseline; (d) CBOS with continuous input-output measurements; (e) repeat/reassembly/specimen controls. Clarify which were performed vs. proposed.
6. Derive input/output work **with a declared boundary**: `W_net,n = ∫(T_in xdot_in − T_out xdot_out)dt`. This is net port energy into the measured boundary, not automatically the cable's dissipated energy. Compare with stored-energy change, inertia, bearings and other loss paths. Only a full periodic identical-state balance can equate that net work with periodic dissipation (given complete boundaries).
7. **Cycle-wise observables [I/Q]:** effective stiffness, hysteresis loop, tension transmission, peak lag, changing reference length, energy balance; optional FFT/PSD/FRF, harmonic distortion, coherence, change-points. These are **candidate diagnostic indicators, not demonstrated wear biomarkers**.
8. **Physical contact variables:** local `D/d`, sheave groove, possible flattening/contact width, entry/fleet angle, routing and wrap angle. The 2025 note's `16 mm Delrin / 180° / 240 N` is **a discussion scenario**; do not label it a verified completed experiment or measured pressure.
9. Compare failure criteria: **structural** (breakage, terminal pull-out, unacceptable visible damage/residual strength) vs. **functional** (force/position prediction error, usable bandwidth, return slack, control requirement). No universal threshold; define from system requirements.
10. Close with calibration. We may identify a faithful transmission model, but a robot simulator needs an operationally useful abstraction.

**Suggested assets:** original testbed photo/CAD **if user supplies rights and verified layout**; loading-command vs. actual tension plot **only from actual logs**; schematics for work boundary and different failure endpoints; repeatability matrix. Do not generate synthetic plots that visually resemble actual results without prominent “illustrative” labels.

**Historical evidence status:** user's 2025 recollection is [12]/[H]. Candidate spectral/energy analyses remain [Q]. [3][6][15][16] offer published CBOS/loading context, not validation of author's specific testbed.

**Hand-off:** “Even well-identified cable mechanics are not yet a robot simulator model.”

### CABLE 08 — From System ID to MJCF

**Subtitle:** Turning Cable Measurements Into a Robot-Usable Abstraction  
**Reader question:** “내가 실험으로 식별한 `k`, friction, slack, history-dependent hysteresis를 MuJoCo 모델에 어떻게 옮길까?”  
**Claim:** A simulator abstraction should reproduce the **task-relevant input–output behavior** over the desired envelope; it need not simulate fibers, and a native MJCF tendon alone does not imply a full physical cable model.

**Proposed section flow**

1. Clearly distinguish **geometry model** `l(q)` and its gradient/moment arm from **force law** and **actuator/controller dynamics**. Define the simulator's target observation and test task before selecting parameters.
2. Introduce official MuJoCo **tendon/`spatial`** (site-based paths and analytic sphere/cylinder wrapping) and **tendon/`fixed`** (linear combination of joint coordinates). The word *fixed* refers to the abstract length combination, not a rigid physical cord. Explain `actuator` transmission and optional tendon sensors.
3. List confirmed native attributes/features, subject to version pinning: `stiffness`, `springlength`, `damping`, `frictionloss`, range/limits, fixed/spatial, `tendonpos`, `tendonvel` and force-related sensors where appropriate. Clarify `frictionloss` is a reduced dry-friction term, not a distributed Bowden friction solver.
4. **Critical MJCF pitfall:** the `<pulley>` *inside a spatial tendon* describes branching/divisors of tendon length, **not a free-turning sheave's bearings and friction by default**. `geom` wrapping around sphere/cylinder affects geometric path; it is not automatically a measured capstan model. Never equate visual wrapping with faithful contact mechanics.
5. Construct a **three-tier implementation ladder**:
   - **Tier A — kinematic/nominal:** path, moment arm, force input, ideal or effectively inextensible transmission. Best for geometry and controller prototyping.
   - **Tier B — native reduced order:** tendon spring/rest length/damping/dry friction, calibrated near a known operating region. Good for local compliance/tracking studies under explicit conditions.
   - **Tier C — augmented state:** actuator-side length offsets, slack with state machine, dynamic friction/hysteresis and drift, or distributed tendon friction via an explicit custom state/force law, plugin or other validated implementation as supported by **pinned MuJoCo version**. Do not claim the base MJCF attributes alone represent these.
6. **System ID → model mapping matrix** (required):

   | Identified quantity | Candidate simulator representation | Caveat / validation |
   |---|---|---|
   | Path length `l(q)` / moment arm | `spatial` or `fixed` tendon; geometry and `∂l/∂q` | Constrained path and contact rules may differ from physical route |
   | Axial effective stiffness | `stiffness` + correct `springlength`, or series compliance outside built-in tendon | Must match cable length, baseline preload, and force law |
   | Damping / small-signal lag | tendon `damping` and/or explicit actuator state | Delay is not always equivalent to damping |
   | Dry friction equivalent | `frictionloss` or external model | Not distributed, curvature-dependent Bowden friction by default |
   | Slack/dead-zone/termination settlement | reference length / actuator-transmission state or external logic | MJCF elastic deadband is not automatically physical lost motion in the motor-to-distal cable path |
   | Hysteresis/internal degradation state | custom state model and runtime update | Needs implementation and held-out validation; not established by MJCF tendon declaration |
   | Motor, gearbox, spring | explicit actuator / joint / spring model with calibration | Controller and observation must match hardware |

7. **Required minimal reproducible example [I]:** one-DOF tendon actuation in a pinned MuJoCo release. Create a version-checked MJCF using a named tendon, motor/position input, joint and tendon sensors; use a small real calibration table. First verify compile/run and check `l(q)` and `dl/dq`; then calibrate force/displacement step and reversal responses. The exact XML is a **to-create-and-run deliverable**, not pre-verified by this outline.
8. **Validation hierarchy:** (a) geometry/moment arm, (b) static load–deflection, (c) direction reversals, (d) rate-dependent response, (e) held-out route/sample/history, (f) task-level force and trajectory error. The choice of tier should be defended by *held-out* predictions and task performance.
9. Include a **failure demonstration**: two configurations with identical nominal kinematics, different real friction/settling, which native Tier A cannot distinguish. Do not need numerical results unless measured.
10. Close with **what should be randomized?** Model fit and uncertainty need separate handling.

**Required visual:** a diagram mapping measured signals/fit parameters into MJCF fields vs external states; compare Tier A/B/C predictions against data; versioned code block with tested config when available.

**Official readings:** [19] MuJoCo XML Reference and [20] MuJoCo Computation, plus published [1][11]. **Version policy:** pin **the actual installed MuJoCo version** during implementation; the documentation URLs below are current/stable and must be translated to that release. Code examples are never assumed verified until successfully executed.

**Hand-off:** “Even a calibrated simulator is only one possible instance of the real transmission. What range of dynamics should a policy survive?”

### CABLE 09 — Data-Driven Domain Randomization

**Subtitle:** Randomize What We Know, Represent What We Don't  
**Reader question:** “케이블의 stiffness와 friction을 ±20% 무작정 흔드는 것보다 나은 방법은 무엇인가?”  
**Claim:** Real measurements should **inform** domain parameters and their uncertainty, but their fitted distribution is not identical to all real-world variation or all simulator-model discrepancy.

**Proposed section flow**

1. Set three objects apart: **physical system variation** across specimens/assemblies/routes; **epistemic parameter-estimation uncertainty** due to limited excitation/noisy data; **structural model error** because MJCF can't reproduce a relevant mechanism.
2. Introduce randomization distributions using **conditional context** `p(θ | route, preload, specimen, assembly, history, D_real)`; this is a **modeling proposal**, not an automatically justified Bayesian posterior. State what a conditional distribution means and how samples are obtained.
3. Why independent uniform ranges can be wrong: stiffness and effective length may covary with conditioning; friction parameters may covary with curvature and preload; grossly unphysical combinations corrupt training. Include physical constraints and correlation (multivariate samples, hierarchical pooling, or scenario-conditioned resampling).
4. **Timescale matters:** episode-static randomization for between-assembly variation; session-level update for reassembly and preconditioning; **within-episode drift** (if data supports) for wear or time-dependent changes; input/history-dependent effects modeled as states rather than arbitrary iid noise each time step.
5. Define minimum **data package**: per trajectory input `u(t)`, motor/joint position, distal tension/torque where possible, time sync and masks, route description, preload, termination, sample/assembly ID, conditioning/cycle count, temperature, load; quality flags. Explicitly record missing fields.
6. Compare four policies/representations under common tasks and matched computational budgets: **Nominal only**, **hand-designed DR**, **empirical-fit / distribution-aware DR**, **augmented-state model with DR**. Optionally compare online adaptation if feasible. No claim that data-driven DR necessarily wins.
7. Link approaches in literature with **distinct functions**: dynamics randomization [22] as baseline; SimOpt updating distributions with real rollouts [23]; DROPO estimating randomization from **offline** real trajectories [24]; neural posterior distributions [25]. Do not suggest their specific assumptions or objective functions are interchangeable.
8. Design outcome metrics: held-out one-step and multi-step rollout error; distal tension prediction; joint trajectory/torque error; task success; out-of-distribution route, new specimen and new assembly; uncertainty coverage/calibration; training cost.
9. **Stress test:** hold out **one entire installation or routing family** and evaluate transfer. Use temporal blocks for wear; avoid leaking adjacent cycles of the same run into train and test.
10. Discuss what DR cannot fix. If a necessary state or mode is missing from the simulator, broadening scalar friction ranges may hide rather than solve model mismatch.

**Suggested figure:** nested uncertainty groups with correlated ellipses and time-scale labels; nominal vs DR baselines; train/test split across specimen and routing.

**Readings:** [22] Peng, [23] Chebotar, [24] Tiboni/DROPO, [25] Muratore. Distinguish visually randomized perception work from dynamics DR if mentioned; do not cite image-only DR as direct tendon dynamics evidence.

**Hand-off:** “Training across models is useful only when success survives transfer to a physical robot with changing behavior.”

### CABLE 10 — Closing the Real2Sim2Real Loop

**Subtitle:** Validation, Online Updating and Functional Degradation  
**Reader question:** “우리가 업데이트하는 것은 cable model인가, robot policy인가, 아니면 둘 다인가?”  
**Claim:** The usable endpoint of cable modeling is not perfect microscopic fidelity or low training error, but **measured task performance and failure detection** under realistic changing transmission conditions.

**Proposed section flow**

1. Explicit stages: **Real → calibrate and identify → select robot-usable abstraction → simulate/validate → policy or controller design → Real evaluation → residual analysis → update model/distribution/controller**. Feedback is iterated, not a single calibration event.
2. **Calibration vs. ID vs. adaptation:** calibration sets reference states/offsets; ID estimates model quantities under declared assumptions; adaptation changes parameters and/or control online based on observed data. Online ID is not by itself adaptive control.
3. A fair comparison across **fixed nominal model + control**, **calibrated model**, **data-informed DR training**, and **adaptive/health-aware compensation**. Equal observation channels, motor limits and safety bounds; avoid giving one method privileged distal sensors without documenting it.
4. Define dynamic targets: output tension/torque error, motion tracking, reversal dead-zone, phase/lag in local tests, task-level success/robustness, amount of recalibration and computation latency.
5. **When does calibration stop being enough?** Start with calibration only; evaluate held-out loads/speeds/history; add ID only if justified; then consider online updates only when nonstationary change is detectable and controllable. Don't jump straight to high-order adaptive control.
6. **Functional vs. structural failure:** breakage, terminal pull-out and unacceptable residual strength vs. loss of force accuracy, bandwidth, repeatability or required task performance. Their ordering depends on the environment and thresholds; no universal ordering.
7. **Degradation hypothesis [Q]:** FFT/PSD, nonlinear harmonic content, work per cycle, inferred stiffness, hysteresis, sensor residuals may track changes; none uniquely proves internal cable wear. Independent inspection, post-test strength and alternative controls are needed.
8. Online parameters may drift because of temperature, sensor offsets, altered contact conditions, route/termination displacement or changing load. Use change detection with documented confound checks and safe fallback controllers.
9. Compare real hardware cases from the existing 01 interactive topologies — antagonistic, passive return, joint pulley and link pull — **only if physical platforms and data exist**. Distinguish simulated demonstrations from completed physical validations.
10. End with an engineering decision framework: **What must the robot predict? How accurately? Over what load, route, history and time? What does it sense? How often must it recalibrate?**

**Suggested final visual:** iterative Real2Sim2Real flow with measured outputs and model-selection gates; functional-failure vs. rupture timeline (labeled illustrative until data exist); tabulated baselines with placeholders **not invented results**.

**Readings:** [1][11][23][24][25]; historical testbed [12] only for motivation.

**Possible final note:** “We do not need to simulate every fiber. We need a bounded, verifiable model of the transmission behavior that matters for the task.”

---

## 3. Reusable authoring template for **every** Cable post

> **Preflight is mandatory** — Before drafting, **open and read `style-guide.md` in the actual blog repository**. Do not assume the style-guide contents from this file. Then read this MASTER OUTLINE's governing brief and References. If guide access fails, draft can proceed as a technical working note, but it cannot be marked publication-ready or style-checked.

The template below is a **writing contract / scaffold**, not a requirement to print headings like “Problem” verbatim in a reader-facing article. Adjust narrative layout to the function of each post while preserving evidence and scope.

```markdown
---
title: "Cable XX — [Korean title]"
description: "[one paragraph / a search excerpt stating the technical question]"
date: YYYY-MM-DD
series: "Cable"
seriesOrder: XX
lang: ko
published: false
# Confirm actual repository front-matter keys and schema before saving.
---

# [Compelling reader-facing title]

[Opening problem / concrete engineering situation, ~2–4 short paragraphs.]

<!-- Existing interactive demo / original figure if relevant; verify repository syntax. -->

## [The simplest useful model or design intuition]

[One concrete calculation or mechanics explanation with definitions and assumptions.]

## [What changes in a real cable or transmission]

[Only the phenomena assigned to this post. Cite specific primary sources.]

## [What did the literature actually show?]

[Compare evidence under explicit conditions; no generic 'prior work is limited'.]

## [What can we measure or verify?]

[Measured variables vs inferred quantities; existing observations vs proposals.]

## [What does this mean for a robot?]

[Engineering decisions, model utility, trade-offs, operating envelope.]

## [What remains unresolved?]

[Named unanswered question and a concrete test or limitation; bridge to next post.]

## References

[Only references explicitly cited in THIS article, ideally numbered in first-citation order.]
```

### 3.1 Brief to fill before writing each post

```markdown
Post ID and working title:
Reader question (one sentence):
Controlling claim (one sentence, with scope):
Why this post follows previous post:
Core physical model and assumptions:
Concrete example (hardware, simulation, interactive, derivation):
Source-of-truth input files and versions:
Claims with citations [P] / abstract only [A]:
User historical observations [H], with reproducible conditions:
Hypotheses [Q] / proposed implementations [I]:
What is NOT covered in this post:
One figure/table/interactive and its exact explanatory function:
Next-post handoff question:
Required checks before publication:
```

### 3.2 Writing / science QA checklist

- [ ] `style-guide.md` **actually read** and checked; exact repo path/commit recorded.
- [ ] Core claim answers the post's reader question; no unrelated mechanisms dominating the prose.
- [ ] Equations have units, sign convention, state/reference frame, initial condition and application limits.
- [ ] `observed`, `inferred`, `modeled`, `hypothesized`, `proposed`, `simulated` and `verified` are not conflated.
- [ ] Every specific numerical scientific claim traces to a checked figure/table/text in an accessible primary source or real lab log.
- [ ] Domain and sampling limits (rope gauge, braid, `D/d`, route, temperature, velocity, preload, cycle history, termination) recorded whenever relevant.
- [ ] Sources have author/title/year/venue/DOI or official documentation URL, access date, evidence level.
- [ ] No unverified figures, rights or pictures copied into posts.
- [ ] Code blocks compile/run on the **pinned** simulator version when asserted as working; output and setup documented.
- [ ] Research questions are not written as demonstrated findings; result tables never contain illustrative invented numbers.
- [ ] Captions distinguish conceptual illustrations from measured graphs and measured graphs include conditions.
- [ ] Internal article links and References resolve; front matter keys match actual project schema; `published: false` until approval.
- [ ] Build/lint/render tests run in repository and documented, not claimed merely because this outline exists.

### 3.3 Suggested commit/change note for each post

`Cable XX — claim; evidence added; simulation/figure version; unresolved questions; style-guide version; link/build checks.`

---

## 4. Experimental-data and simulator contracts

### 4.1 Minimum test-data schema (proposed, not an assertion about old logs)

| Field | Example meaning | Why it matters |
|---|---|---|
| `run_id`, `sample_id`, `assembly_id`, `termination_id` | Distinguish run/rope/installation/end | Prevent data leakage; test generalization |
| `material`, `construction`, `diameter`, `coating` | Rope description and manufacturer spec revision | Interpret hierarchy / product variation |
| `route_id`, `sheave_D`, `wrap_angle`, `fleet_angle`, guide type | Actual routing and geometry | Compare `D/d` and distributed contact |
| `conditioning_protocol`, `cycle_count`, `time_since_install` | Explicit prehistory | Creep/bedding-in/degradation state |
| `T_command`, `T_in`, `T_out`, `x_in`, `x_out` | Load/kinematics measured and commanded | Separate position control from load control |
| `motor_q`, `motor_tau_or_current`, `joint_q`, `joint_tau_if_measured` | System input/output | Robot-usable abstraction fit |
| `spring_displacement`, `load_inertia`, `gear_ratio` | Fixture and robot contributions | Confounding control |
| `temperature`, `sampling_rate`, `sensor_latency`, `calibration_id` | Environment and acquisition | Comparability / phase interpretation |
| `event_markers`, `failure_mode`, `inspection`, `residual_strength` | Events and independent validation | Health-monitoring claim checks |

Required dataset splits: **(i) unseen time blocks; (ii) unseen load and speed; (iii) unseen assembly; (iv) unseen specimen; (v) unseen route**, where data exist. Report which splits are *not* possible. No random split of adjacent cycles alone as proof of cross-installation transfer.

### 4.2 Sim-model acceptance gates

| Gate | What must be validated | Reject or escalate if... |
|---|---|---|
| G0 Geometry | `l(q)`, `∂l/∂q`, cable side and allowed motion | Wrong geometry, incorrect moment arm or path switching |
| G1 Static load | Preload, force–deflection, slack region | Systematic bias under held-out forces |
| G2 Reversal | Dead zone, friction sign, hysteresis | Directional errors exceed task tolerance |
| G3 Dynamics | Velocity/frequency dependence at specified operating points | Unmodeled phase lag/control instability |
| G4 History | Repeated cycles, holds, reassembly, wear stage | Parameter drift or hidden state outside envelope |
| G5 Task | Real robot task success, force accuracy, contact response, safety | Simulator can fit calibration but fails the task |

**Model selection:** Tier A → B → C only when a higher tier improves the **held-out task-relevant** metric enough to justify model/ID complexity and runtime. A highly physical cable model may be ideal for mechanism research but unnecessary for a particular policy task. Conversely a compact model may fit trajectories yet miss distal tension reversal or safety loads.

### 4.3 Parameter/distribution file contract (for future implementation)

```yaml
# EXAMPLE SCHEMA ONLY — NOT MEASURED VALUES
model_name: tendon_transmission_v0
simulator: mujoco
simulator_version: TO_PIN
source_dataset: TO_LINK_AND_HASH
operating_envelope:
  route_ids: []
  pretension_range_N: null
  tendon_speed_range_m_per_s: null
  temperature_range_C: null
nominal_parameters:
  effective_stiffness_N_per_m: null
  rest_length_offset_m: null
  viscous_damping_Ns_per_m: null
  effective_friction_N: null
parameter_groups:
  per_specimen: []
  per_assembly: []
  per_route: []
  within_episode_state: []
uncertainty:
  estimation: TO_FIT
  between_sample: TO_FIT
  structural_mismatch: TO_REPORT_SEPARATELY
validation:
  heldout_split: TO_DEFINE
  metrics: []
  residual_summary: TO_ADD
status: proposal
```

**Interpretation:** `nominal_parameters` in simulator units are not always fiber-level physical constants. A friction force is not a dimensionless coefficient; a cross-route empirical fit must not be silently treated as a single stable material property. `simulator_version` and controller implementation must accompany every performance comparison.

---

## 5. Claim / source / experiment audit ledger

| Potential statement | Status | What may currently be said | Required upgrade for strong claim |
|---|---|---|---|
| Ideal tendon path maps length to joint motion | [P] analytical geometry | `l(q)` and gradient determine generalized transmission moments under stated assumptions | Actual interactive mechanism geometry and code review |
| Manufacturer's tensile/modulus data predict robot performance | **Not established** | Specs do **not independently determine** installed response | Paired datasheet + assembled testing |
| Internal yarn abrasion can matter in cyclic bending | [P] [7][14]; relevant to [13][16] | Mechanically plausible and documented in specified fiber/yarn/rope studies | Rope-specific inspection and failure characterization |
| Abrasion is the largest failure mechanism for all cables | **Prohibited generalization** | Mechanism dominance is condition-specific | Comparative morphology and controlled conditions |
| Axial pre-stretch then bending causes new elongation | [H]/[Q] | User's question/possible observation only; cause not proven | Pre/post reference length + slip markers + recovery and independent samples |
| Knot always loses half of rope strength | **Prohibited generalization** | Particular configurations can substantially reduce strength | Exact material, knot, loading and paper result |
| Bowden makes all transparency disappear | **Prohibited generalization** | Conduit friction/stiction can severely reduce passive transmission transparency | Quantified bidirectional load/force-reflection benchmark |
| Same controlled stroke yields identical cable load | **Contradicted as general rule** [H] | 2025 note indicates a case where elongation changed spring load | Actual load time series and calibration |
| Hysteresis-loop area equals cable internal abrasion energy | **Not justified** | Port energy can mix cable/fixtures/stored energy | Full boundary measurements and independent wear evidence |
| Stiffness increase implies healthy cable | **Not justified** | Bedding-in can increase apparent stiffness under some histories | Residual strength, microscopy, other independent measures |
| Native MJCF tendon reproduces Bowden distributed friction | **Not established** [19][20] | It represents paths and basic passive terms; detailed distributed effects need validation/augmentation | Versioned implementation and experimental comparison |
| ID posterior yields perfectly grounded domain randomization | **Not justified** | Measured data can constrain a distribution conditional on model and acquisition | Held-out coverage, misspecification and experimental splits |
| Improved policy tracking proves mechanical transparency recovered | **Not justified** | Tracking may improve without removing friction | Separate passive backdrive / force-reflection benchmark |
| Online ID equals adaptive control | **False equivalence** | Online parameter estimates can inform, but do not constitute a controller update | Controller design, update law and validation |

### 5.1 Open research tasks / evidence backlog

- **Style guide unresolved:** obtain exact repository `style-guide.md`; read its real content before prose approval.
- **Historical lab material:** recover actual 2025 CBOS CAD/diagrams, sensor calibration, raw synchronized time series, specimen protocol, cycle/run IDs, photos, and termination marking. Do not claim found until available.
- **Pre-stretch → bending elongation:** locate direct papers or implement controlled A/B order study; distinguish body, end, guide and fixture movement.
- **Rope construction evidence:** more controlled comparisons of braided architecture, individual strand jacket vs. external cover, coating vs. geometry; record paper methods instead of generic trend claims.
- **Micro-to-macro link:** do yarn abrasion and rope CBOS results predict functional transmission drift? This is a hypothesis.
- **MuJoCo reproducible example:** pick installed release, create one-DOF example, verify `fixed/spatial`, sensors, springlength/rest length, `frictionloss`, actuator forcing, and numerical outputs.
- **Sim2Real test design:** secure real load trajectories for at least two routes/preloads and new assembly; baseline nominal vs. data-calibrated vs. DR vs. augmentations.
- **Safety and controller:** define tension limits, slip detection, safe fallback and update-freeze conditions before proposing online adaptation.

---

## 6. Source library — stable IDs, bibliographic links and evidence scope

**Usage rule:** `[1]`–`[12]` preserve numbering from the supplied latest outline. New sources are appended only; a post's published References may locally reorder citation numbers to first appearance. `Verified` means the listed **publisher, institution, abstract, or official documentation** was checked for the specific stated scope; it does **not** imply every figure and quantitative detail was reanalyzed. Full-text-required work is flagged. Access date for web checks: **2026-11-15**.

**[1]** G. Palli, G. Borghesan, C. Melchiorri, “Modeling, Identification, and Control of Tendon-Based Actuation Systems,” *IEEE Transactions on Robotics* 28(2), 277–290 (2012). DOI [10.1109/TRO.2011.2171610](https://doi.org/10.1109/TRO.2011.2171610). **Verified publisher/institution abstract.** Viscoelastic tendon compliance, LuGre-like friction, multi-point tension sensing, compensation. **Posts 01,04–06,08,10.**

**[2]** A. Horigome, G. Endo, “Basic study for drive mechanism with synthetic fiber rope – investigation of strength reduction by bending and terminal fixation method,” *Advanced Robotics* 30(3), 206–217 (2016). DOI [10.1080/01691864.2015.1102649](https://doi.org/10.1080/01691864.2015.1102649). **Verified publisher record.** Bending/terminal strength; do not overgeneralize efficiencies. **Posts 01,03.**

**[3]** Y. Lian, H. Liu, L. Li, Y. Zhang, “An experimental investigation on the bedding-in behavior of synthetic fiber ropes,” *Ocean Engineering* 160, 368–381 (2018). DOI [10.1016/j.oceaneng.2018.04.071](https://doi.org/10.1016/j.oceaneng.2018.04.071). **Verified publisher abstract/available article text.** Mean load, amplitude and cycles affect bedding-in. **Posts 02,07.**

**[4]** P. Davies, Y. Reaud, L. Dussud, P. Woerther, “Mechanical behaviour of HMPE and aramid fibre ropes for deep sea handling operations,” *Ocean Engineering* 38(17–18), 2208–2214 (2011). DOI [10.1016/j.oceaneng.2011.10.010](https://doi.org/10.1016/j.oceaneng.2011.10.010). [Open author version](https://archimer.ifremer.fr/doc/00054/16573/14068.pdf). **Verified publisher abstract.** Single fiber vs. large ropes; bedding-in changes initial stiffness; **marine-scale context**. **Posts 01,02.**

**[5]** G. Endo, A. Horigome, Y. Wakabayashi, A. Takata, “Basic study for drive mechanism with synthetic fiber rope (Terminal fixation method using a grooved pulley and a figure-eight knot),” *Transactions of the JSME* 84(864), 18-00067 (2018). DOI [10.1299/transjsme.18-00067](https://doi.org/10.1299/transjsme.18-00067). [J-STAGE page](https://www.jstage.jst.go.jp/article/transjsme/84/864/84_18-00067/_article/-char/en). **Verified abstract:** groove + wrap + knot approach with strong fixation in specified tests. **Post 03.**

**[6]** P. Davies, M. François, N. Lacotte, T. D. Vu, D. Durville, “An empirical model to predict the lifetime of braided HMPE handling ropes under cyclic bend over sheave (CBOS) loading,” *Ocean Engineering* 97, 74–81 (2015). DOI [10.1016/j.oceaneng.2015.01.003](https://doi.org/10.1016/j.oceaneng.2015.01.003). [Author version](https://archimer.ifremer.fr/doc/00251/36215/34775.pdf). **Verified publisher abstract.** CBOS lifetime with variable-load validation in offshore-scale ropes. **Posts 02,07.**

**[7]** C. M. Leech, “The modelling of friction in polymer fibre ropes,” *International Journal of Mechanical Sciences* 44(3), 621–643 (2002). DOI [10.1016/S0020-7403(01)00095-9](https://doi.org/10.1016/S0020-7403(01)00095-9). **Verified publisher abstract.** Hierarchical rope friction, yarn/strand geometry and anisotropy. **Posts 02,05.**

**[8]** J. Hwangbo, V. Tsounis, H. Kolvenbach, M. Hutter, “Cable-Driven Actuation for Highly Dynamic Robotic Systems,” *IROS* (2018). DOI [10.1109/IROS.2018.8593569](https://doi.org/10.1109/IROS.2018.8593569). [arXiv abstract](https://arxiv.org/abs/1806.10632). **Verified abstract and user-supplied case notes; re-check II-C and Fig. 2 in original before close quotation.** Capler-Leg cable mounting, eye splices and knot experience. **Post 03.**

**[9]** S. H. Bang, C. Gonzalez, J. Ahn, N. Paine, L. Sentis, “Control and evaluation of a humanoid robot with rolling contact joints on its lower body,” *Frontiers in Robotics and AI* 10, 1164660 (2023). DOI [10.3389/frobt.2023.1164660](https://doi.org/10.3389/frobt.2023.1164660). [Open full HTML](https://pmc.ncbi.nlm.nih.gov/articles/PMC10613887/). **Verified public article:** hip vs. knee termination distinctions; hardware changes are confounded. **Post 03.**

**[10]** V. Agrawal, W. J. Peine, B. Yao, “Modeling of Transmission Characteristics Across a Cable-Conduit System,” *IEEE Transactions on Robotics* 26(5), 914–924 (2010). DOI [10.1109/TRO.2010.2064014](https://doi.org/10.1109/TRO.2010.2064014). [Author version](https://engineering.purdue.edu/~byao/Papers/TRO_Modeling_2010.pdf). **Verified bibliographic/abstract scope.** Conduit friction, cable compliance, tension loss and backlash. **Posts 01,04–06.**

**[11]** Y. Li, H. Sadeghian, M. Forouhar, A. Naceri, S. Haddadin, “Distributed modeling and torque transmission analysis of a cable-driven robotic joint,” *Mechatronics* 117, 103517 (July 2026). DOI [10.1016/j.mechatronics.2026.103517](https://doi.org/10.1016/j.mechatronics.2026.103517). [Publisher abstract](https://www.sciencedirect.com/science/article/pii/S0957415826000656). **Verified publisher abstract:** distributed spring–friction model, pretension and curvature, reduced representation, two testbeds, partial feedforward improvement. Precise performance numbers **need full-text confirmation**. **Posts 04–06,08,10.**

**[12]** **Non-public primary context / user-supplied research recollection**, “2025 June–August CBOS testbed design, observations and proposed spectral/energy analyses,” conveyed in conversation, 2026-11-15. **[H] only**, no DOI/public link, no verified raw lab logs. Distinguish observations (position-controlled spring-load drift) from ideas (FRF/wear prediction). **Posts 01,06,07,10.**

**[13]** A. Horigome, G. Endo, “Investigation of Repetitive Bending Durability of Synthetic Fiber Ropes,” *IEEE Robotics and Automation Letters* 3(3), 1779–1786 (2018). DOI [10.1109/LRA.2018.2800129](https://doi.org/10.1109/LRA.2018.2800129). [Institutional bibliographic PDF header](https://t2r2.star.titech.ac.jp/rrws/file/CTT100759078/ATD100000413/260m.Investigation%20of%20Repetitive%20Bending%20Durability%20of%20Synthetic%20Fiber%20Ropes.pdf). **Verified institutional bibliographic record; method details need full reading.** Repetitive bending of differing rope materials/compositions. **Post 02.**

**[14]** H. Li et al., “Abrasion performance and failure mechanism of fiber yarns based on molecular segmental differences,” *Journal of Engineered Fibers and Fabrics* (2024). DOI [10.1177/15589250241228263](https://doi.org/10.1177/15589250241228263). **Verified publisher abstract.** Yarn-level abrasion and molecular chain differences; **not directly rope-life prediction**. **Post 02.**

**[15]** C. Müller, A. Kretschmer, M. Golder, “Bending tests on circular braided ropes under variation of different peripheral test conditions,” *innoTRAC* 3(1), 39–54 (2024). DOI [10.14464/innotrac.v3i1.792](https://doi.org/10.14464/innotrac.v3i1.792). [Journal page](https://www.bibliothek.tu-chemnitz.de/ojs/index.php/innoTRAC/article/view/792). **Verified abstract:** fleet angle, sheave material, D/d, temperature and load-related factors in CBOS. **Posts 02,07.**

**[16]** G. Li et al., “Experimental study on cyclic-bend-over-sheave (CBOS) characteristics of an HMPE fibre rope under dynamic loading,” *Applied Ocean Research* (2023), article 103642. DOI [10.1016/j.apor.2023.103642](https://doi.org/10.1016/j.apor.2023.103642). **Verified publisher abstract:** dynamic tension, strain, stiffness, temperature and lifetime in **24 mm** HMPE rope. Do not transfer numeric fit to small tendons. **Posts 02,07.**

**[17]** D. Gossen et al., “The Library of Approaches: A systematic mapping of approaches for the mechanical design of tendon-driven, rigid-sequential anthropomorphic robot hands,” *Mechanism and Machine Theory* 218, 106257 (2025). DOI [10.1016/j.mechmachtheory.2025.106257](https://doi.org/10.1016/j.mechmachtheory.2025.106257). **Verified publisher abstract.** Taxonomy and architecture inspiration, **not cable-friction evidence**. **Posts 01,04.**

**[18]** A. Horigome, G. Endo, A. Takata, Y. Wakabayashi, “Development of New Terminal Fixation Method for Synthetic Fiber Ropes,” *IEEE Robotics and Automation Letters* 3(4), 4321–4328 (2018). DOI [10.1109/LRA.2018.2851033](https://doi.org/10.1109/LRA.2018.2851033). [Bibliographic record](https://ndlsearch.ndl.go.jp/en/books/R100000136-I1360016866565991296). **Verified record/abstract separately; read full paper before numerical comparisons.** **Post 03.**

**[19]** **MuJoCo official XML Reference**, [current documentation](https://mujoco.readthedocs.io/en/latest/XMLreference.html), especially `tendon/spatial`, `tendon/fixed`, `spatial/geom`, `spatial/pulley`, `actuator`, `sensor/tendonpos`, `sensor/tendonvel` (accessed 2026-11-15). **Official current docs; pin release before coding.** **Posts 05,08.**

**[20]** **MuJoCo official Computation**, [Actuation and Transmission](https://mujoco.readthedocs.io/en/latest/computation.html) (accessed 2026-11-15). **Official current docs.** Actuator transmission maps scalar length gradient to generalized force. **Posts 05,08.**

**[21]** **MuJoCo official Modeling** [documentation](https://mujoco.readthedocs.io/en/latest/modeling.html) (accessed 2026-11-15). **Official current docs.** Consult for force limits and actuator interpretation; avoid assuming identical versions. **Post 08.**

**[22]** X. B. Peng, M. Andrychowicz, W. Zaremba, P. Abbeel, “Sim-to-Real Transfer of Robotic Control with Dynamics Randomization,” *ICRA* (2018). DOI [10.1109/ICRA.2018.8460528](https://doi.org/10.1109/ICRA.2018.8460528). [arXiv](https://arxiv.org/abs/1710.06537). **Verified publisher/author abstract.** Dynamics-randomization baseline; **not cable-specific**. **Post 09.**

**[23]** Y. Chebotar et al., “Closing the Sim-to-Real Loop: Adapting Simulation Randomization with Real World Experience,” *ICRA* (2019). DOI [10.1109/ICRA.2019.8793789](https://doi.org/10.1109/ICRA.2019.8793789). [arXiv](https://arxiv.org/abs/1810.05687). **Verified IEEE abstract.** Update simulated parameter distributions using real rollouts. **Posts 09,10.**

**[24]** G. Tiboni, K. Arndt, V. Kyrki, “DROPO: Sim-to-real transfer with offline domain randomization,” *Robotics and Autonomous Systems* 166, 104432 (2023). DOI [10.1016/j.robot.2023.104432](https://doi.org/10.1016/j.robot.2023.104432). [Publisher](https://www.sciencedirect.com/science/article/pii/S0921889023000714). **Verified publisher abstract.** Distribution estimation with offline real-world trajectories. **Posts 09,10.**

**[25]** F. Muratore et al., “Neural Posterior Domain Randomization,” *CoRL / PMLR* 164, 1532–1542 (2022). [Open proceedings](https://proceedings.mlr.press/v164/muratore22a.html). **Verified PMLR abstract.** Bayesian posterior-guided simulator distribution. **Posts 09,10.**

**[26]** Y. Lin et al., “Study on sliding wear mechanism and performance degradation of polyurethane-coated HMPE ropes in sheave systems for deep-sea winch,” *Ocean Engineering* 364(2), 126938 (2026). DOI [10.1016/j.oceaneng.2026.126938](https://doi.org/10.1016/j.oceaneng.2026.126938). [Publisher abstract](https://www.sciencedirect.com/science/article/pii/S0029801826027721). **Verified abstract, OPTIONAL.** Coating/wear and temperature under marine scale, not automatically comparable to internal yarn wear in small tendons. **Post 02.**

**Additional candidate [not numbered/pending literature review]:** a rigorous identifiability/system-ID tutorial appropriate to nonlinear transmission models; updated comparative rope-construction experiments at robot sizes; generalizable physics-informed sim-to-real model selection; manufacturer yarn abrasion test standards (with exact protocol). **Do not write source-specific claims until these sources are found and verified.**

---

## 7. Editorial and research workflow

1. Choose the post in Section 2 and fill Section 3.1. **Read actual `style-guide.md`.**
2. Open only its scoped references in Section 6; re-check claims, paper version and publication status. Record if only abstract is available.
3. Review the newest external MuJoCo release/docs if it is a modeling post; pin the release used in any example. Never copy XML attributes from a different version without checking.
4. Retrieve **original lab artifacts** if presenting 2025 experience. If not available, phrase as retrospective motivation with [H], no invented plots/measurements.
5. Produce the controlling-claim outline and select one main demonstration. Integrate existing interactive examples rather than recreating them.
6. Draft paragraphs following the repository style guide; avoid overloading the introduction with future work or dropping a catalogue of disconnected facts.
7. Check all quantitative and causal statements against [P]/[A]/[H]/[Q]/[I]/[V], and compare alternatives. Specific causal attribution requires an isolating experiment.
8. Validate math, links, figure rights, repository front matter, code runtime and build. Preserve `published: false` until the author approves.
9. Update the MASTER OUTLINE if a post changes the global story or source map. Add a dated change-log note, without silently rewriting historical observations.

### Change log

- **2026-11-15 — Content separation.** Moved TiL's general mechanics and simulator background into Cable 05/08 migration drafts, moved its image gallery and image references to Cable 01, and retained the cyclic demo on Interactive demos. TiL now concentrates on its HIL testbed and neural observer. New drafts remain unpublished. Read the repository style guide and checked current official MuJoCo documentation; no executable MuJoCo model or HIL result is claimed.

- **2026-11-15 — v1.0.** Consolidated third uploaded discovery outline and current conversation into ten-post structure. Moved robot interactive mechanisms into 01; construction to 02; retained termination as 03; routing/Bowden as 04; expanded model/ID/testbed and added MJCF abstraction/DR/Sim2Real posts. Appended primary bibliography [13]–[26], source confidence classes, style-guide preflight, per-post contracts, simulation/data acceptance gates. **Actual `style-guide.md` content, original CBOS logs and code execution were not available.**
