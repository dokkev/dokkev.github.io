# Robot Hardware Blog Instructions

These instructions apply to files under `_posts/hardware/`.

- For Korean posts, read `guideline.md`. Use `template-kr.md` only as an optional front-matter and planning aid.
- Use `_posts/hardware/kr/2025-12-07-hardware-05-kr.md` as a reference for causal depth and field-aware hardware analysis. Do not copy its paragraph length, English-term density, or repeated Physical AI framing.
- This is not a component-introduction series. Write from the perspective of someone designing a Physical AI system and diagnosing why a controller or policy that works in simulation fails on hardware.
- Do not impose a fixed outline or require every post to discuss the full command path, policy learning, or Sim-to-Real. These define the project's overall perspective, not a mandatory per-post template.
- Use the structure most natural to the topic, while connecting local hardware physics to a meaningful system-level consequence.
- When relevant, trace commands through drive/current control, motor, transmission, mechanism, links, and end-effector contact. Also consider the reverse observation path through mechanics, sensors, communication, and state estimation.
- Treat hardware as the full physical interface: mechanics, actuation, sensing, timing, communication, low-level control, and the dynamics they create.
- Mention AI or learning only when the hardware changes an algorithmic assumption, action-to-output mapping, data meaning, or deployment constraint.
- Preserve front matter, permalinks, translation links, series metadata, and existing asset paths unless the task explicitly changes them.
- Do not rewrite already published posts unless the user explicitly requests it.
- Read only the existing posts relevant to the current topic; do not load the entire series by default.
