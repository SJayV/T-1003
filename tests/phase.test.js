import { beforeEach, describe, it, expect, vi } from 'vitest';

let tick, getTime, getWeights, getMotionSpeed, reportGazeDetected, reportMotionEnergy, onPhaseTransition;

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
  ({ tick, getTime, getWeights, getMotionSpeed, reportGazeDetected, reportMotionEnergy, onPhaseTransition } = m);
  t = 0;
});

// ──── GEWICHTE — INVARIANTE & STARTZUSTAND ─────────────────────────────────────

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
    reportGazeDetected(); advance(0.3);
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


// ──── REGIME-ÜBERGÄNGE ───────────────────────────────────────────────────────────


describe('Cluster → Burst', () => {
  it('reportGazeDetected lässt burstWeight ansteigen', () => {
    reportGazeDetected();
    advance(1.5);
    expect(getWeights().burstWeight).toBeGreaterThan(0.5);
  });

  it('kein erneuter Burst-Trigger während eines laufenden Bursts', () => {
    reportGazeDetected();
    advance(0.1);
    const w1 = getWeights().burstWeight;
    reportGazeDetected();
    advance(0.05);
    expect(getWeights().burstWeight).toBeGreaterThanOrEqual(w1 - 0.05);
  });
});

describe('Burst → Metaball', () => {
  it('metaballWeight übernimmt bald nach Ablauf der Hold-Dauer', () => {
    reportGazeDetected();
    advance(1.0);
    expect(getWeights().burstWeight).toBeGreaterThan(0.5);
    advance(2.0);
    expect(getWeights().metaballWeight).toBeGreaterThan(0.5);
  });

  it('Burst-Hold-Dauer ist unabhängig von wiederholten Gaze-Meldungen beim Trigger', () => {
    reportGazeDetected();
    reportGazeDetected();
    advance(1.0);
    expect(getWeights().burstWeight).toBeGreaterThan(0.5);
  });
});

describe('Metaball → Cluster', () => {
  it('bleibt in Metaball vor Ablauf der Mindestdauer, auch ohne erkannten Blick', () => {
    reportGazeDetected();
    advance(2.0);
    advance(10.0);
    expect(getWeights().metaballWeight).toBeGreaterThan(0.5);
  });

  it('kehrt nach Mindestdauer + kurzer Stille ohne erkannten Blick zu Cluster zurück', () => {
    reportGazeDetected();
    advance(2.0);
    advance(21.0);
    expect(getWeights().clusterWeight).toBeGreaterThan(0.5);
  });

  it('anhaltend erkannter Blick in Metaball verzögert die Rückkehr zu Cluster', () => {
    reportGazeDetected();
    advance(2.0);
    for (let i = 0; i < 20; i++) { reportGazeDetected(); advance(1.0); }
    expect(getWeights().metaballWeight).toBeGreaterThan(0.5);
  });
});

describe('kein Cooldown (bewusste Verhaltensänderung ggü. der alten FSM)', () => {
  it('erkannter Blick unmittelbar nach einem vollen Zyklus löst sofort wieder Burst aus', () => {
    reportGazeDetected();
    advance(2.0);
    advance(21.0);
    expect(getWeights().clusterWeight).toBeGreaterThan(0.5);

    reportGazeDetected();
    advance(1.0);
    expect(getWeights().burstWeight).toBeGreaterThan(0.5);
  });
});


// ──── TRANSITION ───────────────────────────────────────────────────────────


describe('onPhaseTransition', () => {
  it('feuert mit dem Namen der jeweiligen Zielphase, genau dreimal pro vollem Zyklus', () => {
    const calls = [];
    onPhaseTransition(name => calls.push(name));

    reportGazeDetected();
    advance(4.0);
    advance(20.0);

    expect(calls).toEqual(['burst', 'metaball', 'cluster']);
  });
});

 
// ──── OUTPUT-PARAMETER ────────────────────────────────────────────────────────────


describe('motionSpeed (unabhängig von reportGazeDetected)', () => {
  it('wird auf den gemeldeten Wert gesetzt', () => {
    reportMotionEnergy(0.7);
    expect(getMotionSpeed()).toBeCloseTo(0.7);
  });

  it('wird auf [0, 1] geklemmt', () => {
    reportMotionEnergy(99);
    expect(getMotionSpeed()).toBeLessThanOrEqual(1.0);
    expect(getMotionSpeed()).toBeGreaterThanOrEqual(0);
  });

  it('zerfällt exponentiell ohne weiteres reportMotionEnergy', () => {
    reportMotionEnergy(1.0);
    advance(DT);
    const v0 = getMotionSpeed();
    advance(1.0);
    expect(getMotionSpeed()).toBeLessThan(v0);
    expect(getMotionSpeed()).toBeGreaterThan(0);
  });

  it('bleibt unbeeinflusst von reportGazeDetected allein', () => {
    reportGazeDetected();
    advance(DT);
    expect(getMotionSpeed()).toBe(0);
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
