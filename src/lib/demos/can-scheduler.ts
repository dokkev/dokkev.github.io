// Deterministic queue/timing model, not a CAN controller or motor simulation.
// All model timestamps are integer ticks; one tick = 0.1 ms.
export const tickMs = 0.1;
export const durationTicks = 600;
export type ReadPolicy = "one" | "drain" | "blocking";
export interface SchedulerConfig {
  controlMs: number;
  feedbackMs: number;
  transportMs: number;
  rxBatch: boolean;
  txBatch: boolean;
  txSpacingMs: number;
  driverParseMs: number;
  readPolicy: ReadPolicy;
  txPolicy: "fifo" | "latest";
  fault: "none" | "feedback" | "host";
  staleMs: number;
  watchdogMs: number;
  gate: boolean;
}
export const schedulerDefaults: SchedulerConfig = {
  controlMs: 2,
  feedbackMs: 1,
  transportMs: 0.6,
  rxBatch: false,
  txBatch: false,
  txSpacingMs: 0,
  driverParseMs: 0,
  readPolicy: "drain",
  txPolicy: "latest",
  fault: "none",
  staleMs: 6,
  watchdogMs: 8,
  gate: true,
};
export const schedulerPresets: { name: string; config: SchedulerConfig }[] = [
  { name: "Healthy", config: schedulerDefaults },
  { name: "RX burst", config: { ...schedulerDefaults, rxBatch: true } },
  { name: "TX burst", config: { ...schedulerDefaults, controlMs: 1, transportMs: 0.2, txPolicy: "fifo", txBatch: true, driverParseMs: 0.8 } },
  { name: "RX backlog", config: { ...schedulerDefaults, feedbackMs: 0.5, readPolicy: "one" } },
  { name: "TX backlog", config: { ...schedulerDefaults, controlMs: 1, transportMs: 2, txPolicy: "fifo" } },
  { name: "Feedback loss", config: { ...schedulerDefaults, feedbackMs: 2, fault: "feedback" } },
  { name: "Host stall", config: { ...schedulerDefaults, fault: "host" } },
];
export interface ModelPacket {
  id: number;
  born: number;
  arrived: number;
  start: number;
  eligible?: number;
  processed?: number;
}
export type HostPhase = "idle" | "read" | "wait" | "update" | "write" | "stalled";
export interface SchedulerSnapshot {
  tick: number;
  phase: HostPhase;
  rx: ModelPacket[];
  tx: ModelPacket[];
  activeTx?: ModelPacket;
  incoming: ModelPacket[];
  cache?: ModelPacket;
  applied?: ModelPacket;
  driverRx: ModelPacket[];
  driverActive?: { packet: ModelPacket; done: number };
  driverDropped: number;
  motorExpired: boolean;
  motorSilence: number;
  missed: number;
  rxDropped: number;
  txDropped: number;
  coalesced: number;
  inhibited: number;
  drained: number;
}
export interface SchedulerEvent {
  tick: number;
  kind: "rx" | "tx" | "fault" | "deadline";
  text: string;
}
export function simulateScheduler(config: SchedulerConfig) {
  const ticks = (ms: number) => Math.max(1, Math.round(ms / tickMs));
  const period = ticks(config.controlMs),
    feedbackPeriod = ticks(config.feedbackMs);
  const service = ticks(config.transportMs),
    stale = ticks(config.staleMs),
    watchdog = ticks(config.watchdogMs);
  const rx: ModelPacket[] = [],
    tx: ModelPacket[] = [],
    incoming: ModelPacket[] = [];
  const snapshots: SchedulerSnapshot[] = [],
    events: SchedulerEvent[] = [];
  const driverRx: ModelPacket[] = [];
  let driverActive: { packet: ModelPacket; done: number } | undefined;
  let driverDropped = 0,
    nextTxStart = 0;
  let activeTx: ModelPacket | undefined, cache: ModelPacket | undefined, applied: ModelPacket | undefined;
  let phase: "idle" | "read" | "update" | "write" = "idle";
  let computeLeft = 0,
    readCount = 0,
    missed = 0,
    rxDropped = 0,
    txDropped = 0,
    coalesced = 0,
    inhibited = 0;
  let rxId = 0,
    txId = 0,
    motorLast = 0,
    motorExpired = false,
    drained = 0;
  for (let tick = 0; tick <= durationTicks; tick++) {
    const faultActive = tick >= 200 && tick < 360;
    const frozen = faultActive && config.fault === "host";
    if ((tick === 200 || tick === 360) && config.fault !== "none")
      events.push({ tick, kind: "fault", text: `${config.fault === "host" ? "Host stall" : "Feedback outage"} ${tick === 200 ? "begins" : "ends"}` });
    if (tick % feedbackPeriod === 0 && !(faultActive && config.fault === "feedback")) {
      incoming.push({ id: ++rxId, born: tick, start: tick, arrived: config.rxBatch ? Math.ceil((tick + 6) / 40) * 40 : tick + 6 });
    }
    let deliveredRx = 0;
    while (incoming.length && incoming[0].arrived <= tick) {
      deliveredRx++;
      const packet = incoming.shift()!;
      if (rx.length < 12) rx.push(packet);
      else {
        rxDropped++;
        events.push({ tick, kind: "rx", text: `RX queue full: feedback #${packet.id} dropped` });
      }
    }
    if (deliveredRx > 1) events.push({ tick, kind: "rx", text: `RX burst: ${deliveredRx} feedback packets delivered together` });
    let completedPacket: ModelPacket | undefined;
    if (activeTx && activeTx.arrived <= tick) {
      if (!motorExpired) {
        if (config.driverParseMs === 0) completedPacket = activeTx;
        else if (driverRx.length < 2) driverRx.push(activeTx);
        else {
          driverDropped++;
          events.push({ tick, kind: "fault", text: `Driver RX buffer full: command #${activeTx.id} lost after transport delivery` });
        }
      }
      activeTx = undefined;
    }
    if (driverActive && driverActive.done <= tick) {
      completedPacket = driverActive.packet;
      driverActive = undefined;
    }
    if (completedPacket && !motorExpired) {
      applied = { ...completedPacket, processed: tick };
      motorLast = tick;
      events.push({ tick, kind: "tx", text: `Motor processes command #${applied.id}, age ${((tick - applied.born) * tickMs).toFixed(1)} ms` });
    }
    if (!driverActive && driverRx.length && !motorExpired) {
      driverActive = { packet: driverRx.shift()!, done: tick + ticks(config.driverParseMs) };
    }
    if (!motorExpired && tick - motorLast >= watchdog) {
      motorExpired = true;
      events.push({ tick, kind: "fault", text: "Motor watchdog expires; output disabled until model reset" });
    }
    if (tick % period === 0) {
      if (frozen || phase !== "idle") {
        missed++;
        events.push({ tick, kind: "deadline", text: "Control release missed; no catch-up cycle queued" });
      } else {
        phase = "read";
        readCount = 0;
      }
    }
    let displayPhase: HostPhase = phase;
    if (frozen) displayPhase = "stalled";
    else if (phase === "read") {
      if (rx.length) {
        cache = rx.shift()!;
        readCount++;
        drained++;
        if (config.readPolicy !== "drain" || readCount >= 8) {
          phase = "update";
          computeLeft = 2;
        }
      } else if (config.readPolicy === "blocking" && readCount === 0) displayPhase = "wait";
      else {
        phase = "update";
        computeLeft = 2;
      }
    } else if (phase === "update") {
      if (--computeLeft <= 0) phase = "write";
    } else if (phase === "write") {
      const fresh = cache !== undefined && tick - cache.arrived <= stale;
      if (config.gate && !fresh) {
        inhibited++;
        events.push({ tick, kind: "fault", text: "Host freshness gate withholds this command" });
      } else {
        const packet: ModelPacket = {
          id: ++txId,
          born: tick,
          start: tick,
          arrived: tick,
          eligible: config.txBatch ? (Math.floor(tick / 40) + 1) * 40 : tick,
        };
        if (config.txPolicy === "latest") {
          coalesced += tx.length;
          tx.length = 0;
          tx.push(packet);
        } else if (tx.length < 16) tx.push(packet);
        else {
          txDropped++;
          events.push({ tick, kind: "tx", text: "TX pending queue full: new command rejected" });
        }
      }
      phase = "idle";
    }
    // Independent transport worker; a frame already accepted by it cannot be replaced.
    if (!activeTx && tx.length && (tx[0].eligible ?? 0) <= tick && tick >= nextTxStart) {
      const packet = tx.shift()!;
      activeTx = { ...packet, start: tick, arrived: tick + service };
      nextTxStart = tick + Math.round(config.txSpacingMs / tickMs);
    }
    snapshots.push({
      tick,
      phase: displayPhase,
      rx: [...rx],
      tx: [...tx],
      activeTx,
      incoming: [...incoming],
      cache,
      applied,
      driverRx: [...driverRx],
      driverActive,
      driverDropped,
      motorExpired,
      motorSilence: tick - motorLast,
      missed,
      rxDropped,
      txDropped,
      coalesced,
      inhibited,
      drained,
    });
  }
  return { snapshots, events };
}
