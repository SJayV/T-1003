import { beforeEach, describe, it, expect, vi } from 'vitest';

// phase.js has module-level mutable state.
// vi.resetModules() + dynamic import gives each test a clean initial Cluster state.

let tick, getTime, getWeights, getMotionSpeed, reportMotion, onPhaseTransition;

let t;
const DT = 0.05; // seconds per simulated tick -- fine enough that mu tracks t_now closely
                  // near every regime-transition boundary tested below

// Advances simulated time by `seconds`, calling tick(t) once per DT step -- mirrors
// how main.js calls tick(performance.now()/1000) once per real animation frame.
function advance(seconds) {
  const steps = Math.max(1, Math.round(seconds / DT));
  for (let i = 0; i < steps; i++) {
    t += DT;
    tick(t);
  }
}

beforeEach(async () => {
  vi.resetModules();
  const m = await import('../src/phase.js');
  ({ tick, getTime, getWeights, getMotionSpeed, reportMotion, onPhaseTransition } = m);
  t = 0;
});

// Burst-Hold ist ein fixer Wert (LEAD*BURST_SIGMA, ~3.0s) -- skaliert bewusst nicht mit
// der Motion-Speed beim Trigger (siehe Test unten).

// ═════════════════════════════════════════════════════════════════════════════
// Gewichte — Invariante und Startzustand
// ═════════════════════════════════════════════════════════════════════════════

describe('Gewichte: Invariante (Summe = 1, alle ≥ 0)', () => {
  it('gilt im Startzustand, während Burst und während Metaball', () => {
    const check = () => {
      const { clusterWeight, metaballWeight, burstWeight } = getWeights();
      // Loose precision: the eps divide-by-zero guard in _evaluateWeights becomes
      // relatively more visible right when one bump has decayed and the next is
      // still early in its slow ramp (e.g. mid Burst -> Metaball) -- still far
      // tighter than anything visually perceptible in a blend weight.
      expect(clusterWeight + metaballWeight + burstWeight).toBeCloseTo(1.0, 4);
      expect(clusterWeight).toBeGreaterThanOrEqual(0);
      expect(metaballWeight).toBeGreaterThanOrEqual(0);
      expect(burstWeight).toBeGreaterThanOrEqual(0);
    };
    check();                        // Cluster (initial, vor dem ersten tick())
    reportMotion(0.5); advance(0.3);
    check();                        // Burst
    advance(3.0);
    check();                        // Metaball
  });
});

describe('Gewichte: Startzustand', () => {
  it('Cluster ist beim Programmstart voll gewichtet', () => {
    const { clusterWeight } = getWeights();
    expect(clusterWeight).toBeCloseTo(1.0, 2);
  });

  it('getTime startet bei 0', () => {
    expect(getTime()).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Regime-Übergänge (intern per _state getrieben, nur über die Gewichte sichtbar)
// ═════════════════════════════════════════════════════════════════════════════

describe('Cluster → Burst', () => {
  it('reportMotion lässt burstWeight ansteigen', () => {
    reportMotion(0.5);
    // Cluster (sigma 0.6s) decays fast enough on its own that burstWeight overtakes it
    // well before Burst's own (wider, sigma 1.0s) ramp is anywhere near its peak.
    advance(1.5);
    expect(getWeights().burstWeight).toBeGreaterThan(0.5);
  });

  it('kein erneuter Burst-Trigger während eines laufenden Bursts', () => {
    reportMotion(0.5);
    advance(0.1);
    const w1 = getWeights().burstWeight;
    reportMotion(1.0); // während Burst -- darf keinen zweiten Trigger auslösen
    advance(0.05);
    // Ein zweiter Trigger würde mu erneut auf LEAD*sigma vorspringen lassen und
    // burstWeight einbrechen lassen statt weiter Richtung 1 zu laufen.
    expect(getWeights().burstWeight).toBeGreaterThanOrEqual(w1 - 0.05);
  });
});

describe('Burst → Metaball', () => {
  it('metaballWeight übernimmt bald nach Ablauf der Hold-Dauer', () => {
    reportMotion(0.01); // -> Hold (fix, ~3.6s)
    advance(2.0);
    expect(getWeights().burstWeight).toBeGreaterThan(0.5); // noch in Burst
    // Metaball wird direkt bei Hold-Ende aktiviert (kein zusätzlicher Verzögerungs-Puffer) --
    // Burst ist zu diesem Zeitpunkt noch nahe seinem Peak, daher überholt metaballWeight
    // burstWeight rasch über Bursts eigene (breite) Abklingbreite.
    advance(3.0);
    expect(getWeights().metaballWeight).toBeGreaterThan(0.5);
  });

  it('Burst-Hold-Dauer ist unabhängig von der Motion-Speed beim Trigger', () => {
    reportMotion(1.0); // hohe Speed -- Hold-Dauer darf sich dadurch nicht verändern
    advance(2.0); // gleicher Zeitpunkt wie im Minimum-Speed-Fall oben, gleiches Ergebnis erwartet
    expect(getWeights().burstWeight).toBeGreaterThan(0.5);
  });
});

describe('Metaball → Cluster', () => {
  it('bleibt in Metaball vor Ablauf der Mindestdauer, auch ohne Bewegung', () => {
    reportMotion(0.01);
    advance(2.0); // -> Metaball
    advance(10.0); // < METABALL_MIN_HOLD (13.3s) seit Metaball-Eintritt
    expect(getWeights().metaballWeight).toBeGreaterThan(0.5);
  });

  it('kehrt nach Mindestdauer + kurzer Stille ohne Bewegung zu Cluster zurück', () => {
    reportMotion(0.01);
    advance(2.0); // noch in Burst (Hold ~3.6s)
    // Mindestdauer (13.3s) + METABALL_SILENCE_HOLD (1.2s) ab Metaball-Eintritt (~3.6s nach
    // Trigger) -- Cluster wird direkt bei Stille-Ablauf aktiviert, nicht erst nachdem Metaball
    // selbst abgeklungen ist.
    advance(18.0);
    expect(getWeights().clusterWeight).toBeGreaterThan(0.5);
  });

  it('anhaltende Bewegung in Metaball verzögert die Rückkehr zu Cluster', () => {
    reportMotion(0.01);
    advance(2.0); // -> Metaball
    for (let i = 0; i < 20; i++) { reportMotion(0.3); advance(1.0); } // 20s Bewegung
    expect(getWeights().metaballWeight).toBeGreaterThan(0.5);
  });
});

describe('kein Cooldown (bewusste Verhaltensänderung ggü. der alten FSM)', () => {
  it('reportMotion unmittelbar nach einem vollen Zyklus löst sofort wieder Burst aus', () => {
    reportMotion(0.01);
    advance(2.0);  // noch in Burst (Hold ~3.6s)
    advance(18.0); // -> zurück zu Cluster
    expect(getWeights().clusterWeight).toBeGreaterThan(0.5);

    reportMotion(1.0); // keine Sperrzeit mehr -- muss unmittelbar greifen
    advance(2.0); // Cluster deckt schnell wieder ab, auch bevor Burst voll gerampt ist
    expect(getWeights().burstWeight).toBeGreaterThan(0.5);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// onPhaseTransition
// ═════════════════════════════════════════════════════════════════════════════

describe('onPhaseTransition', () => {
  it('feuert ohne Argumente genau dreimal pro vollem Zyklus', () => {
    const calls = [];
    onPhaseTransition((...args) => calls.push(args));

    reportMotion(0.01);
    advance(4.0);   // Cluster -> Burst -> Metaball (Burst holds ~3.6s, no extra delay)
    advance(16.0);  // Metaball -> Cluster

    expect(calls).toHaveLength(3);
    expect(calls.every(args => args.length === 0)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Output-Parameter
// ═════════════════════════════════════════════════════════════════════════════

describe('motionSpeed', () => {
  it('wird auf den gemeldeten Wert gesetzt', () => {
    reportMotion(0.7);
    expect(getMotionSpeed()).toBeCloseTo(0.7);
  });

  it('wird auf [0, 1] geklemmt', () => {
    reportMotion(99);
    expect(getMotionSpeed()).toBeLessThanOrEqual(1.0);
    expect(getMotionSpeed()).toBeGreaterThanOrEqual(0);
  });

  it('zerfällt exponentiell ohne weiteres reportMotion', () => {
    reportMotion(1.0);
    advance(DT); // _motionThisFrame-Flag verbraucht
    const v0 = getMotionSpeed();
    advance(1.0);
    expect(getMotionSpeed()).toBeLessThan(v0);
    expect(getMotionSpeed()).toBeGreaterThan(0); // exponentiell: erreicht nie 0
  });
});

describe('getTime', () => {
  it('steigt monoton mit jedem Tick', () => {
    const t0 = getTime();
    advance(DT);
    const t1 = getTime();
    advance(0.5);
    expect(t1).toBeGreaterThan(t0);
    expect(getTime()).toBeGreaterThan(t1);
  });
});
