import { beforeEach, describe, it, expect, vi } from 'vitest';

let tick, getTime, getWeights, getMotionSpeed, reportGazeDetected, reportMotionEnergy, onPhaseTransition;
let getSimulationUniformDefinitions, getUniformDefinitions, applySimulationState, applyStateToMaterial;

let currentTime;
const TIME_STEP = 0.05;

function advance(seconds) {
  const steps = Math.max(1, Math.round(seconds / TIME_STEP));
  for (let stepIndex = 0; stepIndex < steps; stepIndex++) {
    currentTime += TIME_STEP;
    tick(currentTime);
  }
}

function makeMaterial(uniformDefinitions) {
  return { uniforms: uniformDefinitions };
}

beforeEach(async () => {
  vi.resetModules();
  const phaseModule = await import('../src/phase.js');
  ({ tick, getTime, getWeights, getMotionSpeed, reportGazeDetected, reportMotionEnergy, onPhaseTransition,
     getSimulationUniformDefinitions, getUniformDefinitions, applySimulationState, applyStateToMaterial } = phaseModule);
  currentTime = 0;
});


// ──── GEWICHTE — INVARIANTE & STARTZUSTAND ─────────────────────────────────


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


// ──── REGIME-ÜBERGÄNGE ──────────────────────────────────────────────────────


describe('Cluster → Burst', () => {
  it('reportGazeDetected lässt burstWeight ansteigen', () => {
    reportGazeDetected();
    advance(1.5);
    expect(getWeights().burstWeight).toBeGreaterThan(0.5);
  });

  it('kein erneuter Burst-Trigger während eines laufenden Bursts', () => {
    reportGazeDetected();
    advance(0.1);
    const burstWeightBeforeSecondTrigger = getWeights().burstWeight;
    reportGazeDetected();
    advance(0.05);
    expect(getWeights().burstWeight).toBeGreaterThanOrEqual(burstWeightBeforeSecondTrigger - 0.05);
  });
});

describe('Burst → Metaball', () => {
  it('metaballWeight übernimmt bald nach Ablauf der Hold-Dauer', () => {
    reportGazeDetected();
    advance(1.3);
    expect(getWeights().burstWeight).toBeGreaterThan(0.5);
    advance(2.0);
    expect(getWeights().metaballWeight).toBeGreaterThan(0.5);
  });

  it('Burst-Hold-Dauer ist unabhängig von wiederholten Gaze-Meldungen beim Trigger', () => {
    reportGazeDetected();
    reportGazeDetected();
    advance(1.3);
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
    for (let cycleIndex = 0; cycleIndex < 20; cycleIndex++) { reportGazeDetected(); advance(1.0); }
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
    advance(1.3);
    expect(getWeights().burstWeight).toBeGreaterThan(0.5);
  });
});


// ──── TRANSITION ────────────────────────────────────────────────────────────


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


// ──── OUTPUT-PARAMETER ──────────────────────────────────────────────────────


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
    advance(TIME_STEP);
    const initialSpeed = getMotionSpeed();
    advance(1.0);
    expect(getMotionSpeed()).toBeLessThan(initialSpeed);
    expect(getMotionSpeed()).toBeGreaterThan(0);
  });

  it('bleibt unbeeinflusst von reportGazeDetected allein', () => {
    reportGazeDetected();
    advance(TIME_STEP);
    expect(getMotionSpeed()).toBe(0);
  });
});

describe('getTime', () => {
  it('steigt monoton mit jedem Tick', () => {
    const firstTime = getTime();
    advance(TIME_STEP);
    const secondTime = getTime();
    advance(0.5);
    expect(secondTime).toBeGreaterThan(firstTime);
    expect(getTime()).toBeGreaterThan(secondTime);
  });
});


// ──── UNIFORM-DEFINITIONEN ──────────────────────────────────────────────────


describe('getSimulationUniformDefinitions', () => {
  it('liefert genau die von positionChunk/simulationShader erwarteten Uniform-Namen', () => {
    const definitions = getSimulationUniformDefinitions();
    expect(Object.keys(definitions).sort()).toEqual(
      ['burstWeight', 'clusterWeight', 'metaballWeight', 'motionSpeed', 'time'].sort()
    );
  });
});

describe('getUniformDefinitions', () => {
  it('erweitert getSimulationUniformDefinitions um clusterShapeIndex', () => {
    const definitions = getUniformDefinitions();
    expect(Object.keys(definitions).sort()).toEqual(
      ['burstWeight', 'clusterShapeIndex', 'clusterWeight', 'metaballWeight', 'motionSpeed', 'time'].sort()
    );
  });
});

describe('applySimulationState', () => {
  it('schreibt Gewichte, Zeit und motionSpeed in die Material-Uniforms', () => {
    const material = makeMaterial(getSimulationUniformDefinitions());
    reportGazeDetected();
    advance(1.5);
    reportMotionEnergy(0.6);

    applySimulationState(material);

    const { clusterWeight, metaballWeight, burstWeight } = getWeights();
    expect(material.uniforms.clusterWeight.value).toBe(clusterWeight);
    expect(material.uniforms.metaballWeight.value).toBe(metaballWeight);
    expect(material.uniforms.burstWeight.value).toBe(burstWeight);
    expect(material.uniforms.time.value).toBe(getTime());
    expect(material.uniforms.motionSpeed.value).toBeCloseTo(getMotionSpeed());
  });
});

describe('applyStateToMaterial', () => {
  it('setzt clusterShapeIndex zusätzlich zu den Simulations-Uniforms', () => {
    const material = makeMaterial(getUniformDefinitions());

    applyStateToMaterial(material);

    expect(typeof material.uniforms.clusterShapeIndex.value).toBe('number');
    expect(material.uniforms.time.value).toBe(getTime());
  });
});
