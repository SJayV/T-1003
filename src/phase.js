const PERIOD       = 10.0;
const METABALL_END = PERIOD * 0.15;
const CLUSTER_END  = METABALL_END + PERIOD * 0.83;

let t             = 0;
let phaseOverride = null;

// ── logical phase ─────────────────────────────────────────────────────────────

export function getLogicalPhase() {
  if (phaseOverride !== null) return phaseOverride;
  const c = t % PERIOD;
  if (c < METABALL_END) return 0.0;
  if (c < CLUSTER_END)  return (c - METABALL_END) / (CLUSTER_END - METABALL_END);
  return 1.0 + (c - CLUSTER_END) / (PERIOD - CLUSTER_END);
}

// ── visual phase ──────────────────────────────────────────────────────────────
// Exponential lerp toward logical phase (rate 0.08/frame, half-life ~8 frames).
// The hard 2→0 cyclic reset becomes a gradual cross-fade: visual phase falls
// toward 0 at the same rate rather than snapping, giving ~25-frame transitions.
// All visually-driven consumers (shading blend, PMREM) use getVisualPhase();
// physics and event detection use getLogicalPhase().

let _visualPhase = 0;

function _updateVisualPhase() {
  _visualPhase += (getLogicalPhase() - _visualPhase) * 0.08;
}

export function getVisualPhase() {
  return _visualPhase;
}

// ── phase transitions ─────────────────────────────────────────────────────────

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

// ── time & controls ───────────────────────────────────────────────────────────

export function tick() {
  t += 0.004;
  _updateVisualPhase();
  _checkSlot(getLogicalPhase());
}

export function getTime() { return t; }

export function triggerPhase(value) {
  phaseOverride = value;
  _checkSlot(value);
}

export function releasePhase() {
  phaseOverride = null;
  _checkSlot(getLogicalPhase());
}
