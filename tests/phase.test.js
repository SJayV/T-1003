import { beforeEach, describe, it, expect, vi } from 'vitest';

let tick, getTime, getWeights, getMotionSpeed, reportMotion, onPhaseTransition;

let t;
const DT = 0.05;

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

// ═════════════════════════════════════════════════════════════════════════════
// Gewichte — Invariante und Startzustand
// ═════════════════════════════════════════════════════════════════════════════

describe('Gewichte: Invariante (Summe = 1, alle ≥ 0)', () => {
  it('gilt im Startzustand, während Burst und während Metaball', () => {
    const check = () => {
      const { clusterWeight, metaballWeight, burstWeight } = getWeights();
      expect(clusterWeight + metaballWeight + burstWeight).toBeCloseTo(1.0, 4);
      expect(clusterWeight).toBeGreaterThanOrEqual(0);
      expect(metaballWeight).toBeGreaterThanOrEqual(0);
      expect(burstWeight).toBeGreaterThanOrEqual(0);
    };
    check();
    reportMotion(0.5); advance(0.3);
    check();
    advance(3.0);
    check();
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
    advance(1.5);
    expect(getWeights().burstWeight).toBeGreaterThan(0.5);
  });

  it('kein erneuter Burst-Trigger während eines laufenden Bursts', () => {
    reportMotion(0.5);
    advance(0.1);
    const w1 = getWeights().burstWeight;
    reportMotion(1.0);
    advance(0.05);
    expect(getWeights().burstWeight).toBeGreaterThanOrEqual(w1 - 0.05);
  });
});

describe('Burst → Metaball', () => {
  it('metaballWeight übernimmt bald nach Ablauf der Hold-Dauer', () => {
    reportMotion(0.01);
    advance(2.0);
    expect(getWeights().burstWeight).toBeGreaterThan(0.5);
    advance(3.0);
    expect(getWeights().metaballWeight).toBeGreaterThan(0.5);
  });

  it('Burst-Hold-Dauer ist unabhängig von der Motion-Speed beim Trigger', () => {
    reportMotion(1.0);
    advance(2.0);
    expect(getWeights().burstWeight).toBeGreaterThan(0.5);
  });
});

describe('Metaball → Cluster', () => {
  it('bleibt in Metaball vor Ablauf der Mindestdauer, auch ohne Bewegung', () => {
    reportMotion(0.01);
    advance(2.0);
    advance(10.0);
    expect(getWeights().metaballWeight).toBeGreaterThan(0.5);
  });

  it('kehrt nach Mindestdauer + kurzer Stille ohne Bewegung zu Cluster zurück', () => {
    reportMotion(0.01);
    advance(2.0);
    advance(18.0);
    expect(getWeights().clusterWeight).toBeGreaterThan(0.5);
  });

  it('anhaltende Bewegung in Metaball verzögert die Rückkehr zu Cluster', () => {
    reportMotion(0.01);
    advance(2.0);
    for (let i = 0; i < 20; i++) { reportMotion(0.3); advance(1.0); }
    expect(getWeights().metaballWeight).toBeGreaterThan(0.5);
  });
});

describe('kein Cooldown (bewusste Verhaltensänderung ggü. der alten FSM)', () => {
  it('reportMotion unmittelbar nach einem vollen Zyklus löst sofort wieder Burst aus', () => {
    reportMotion(0.01);
    advance(2.0);
    advance(18.0);
    expect(getWeights().clusterWeight).toBeGreaterThan(0.5);

    reportMotion(1.0);
    advance(2.0);
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
    advance(4.0);
    advance(16.0);

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
    advance(DT);
    const v0 = getMotionSpeed();
    advance(1.0);
    expect(getMotionSpeed()).toBeLessThan(v0);
    expect(getMotionSpeed()).toBeGreaterThan(0);
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
