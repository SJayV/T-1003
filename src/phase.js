const PERIOD       = 10.0;
const METABALL_END = PERIOD * 0.15;
const CLUSTER_END  = METABALL_END + PERIOD * 0.83;

let t             = 0;
let phaseOverride = null;

// ── transition events ─────────────────────────────────────────────────────────
// Slot = Math.ceil(phase): 0=Metaball, 1=Cluster, 2=Burst.
// Subscribers (envmap, audio, …) register here; they are called whenever the
// slot changes — whether driven by time or by triggerPhase() / releasePhase().
// This is the single place for threshold detection; no duplication in subscribers.

const _listeners = [];
let   _prevSlot  = 0;

function _checkSlot(phase) {
  const slot = Math.ceil(phase);
  if (slot !== _prevSlot) {
    _prevSlot = slot;
    _listeners.forEach(fn => fn(phase));
  }
}

export function onPhaseTransition(fn) {
  _listeners.push(fn);
}

// ── time & phase ──────────────────────────────────────────────────────────────

export function tick() {
  t += 0.004;
  _checkSlot(getPhase());
}

export function getTime() { return t; }

export function getPhase() {
  if (phaseOverride !== null) return phaseOverride;
  const c = t % PERIOD;
  if (c < METABALL_END) return 0.0;
  if (c < CLUSTER_END)  return (c - METABALL_END) / (CLUSTER_END - METABALL_END);
  return 1.0 + (c - CLUSTER_END) / (PERIOD - CLUSTER_END);
}

// External input calls these; both trigger transition checks so envmap/audio
// react identically to input-driven jumps and time-driven crossings.
export function triggerPhase(value) {
  phaseOverride = value;
  _checkSlot(value);
}

export function releasePhase() {
  phaseOverride = null;
  _checkSlot(getPhase());
}
