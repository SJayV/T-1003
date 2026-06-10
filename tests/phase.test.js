import { beforeEach, describe, it, expect, vi } from 'vitest';

// phase.js has module-level mutable state.
// vi.resetModules() + dynamic import gives each test a clean initial Cluster state.

let tick, getTime, getLogicalPhase, getVisualPhase,
    getMetaballBlend, getClusterBlend, getBurstBlend,
    getMotionSpeed, reportMotion, onPhaseTransition;

beforeEach(async () => {
  vi.resetModules();
  const m = await import('../src/phase.js');
  ({ tick, getTime, getLogicalPhase, getVisualPhase,
     getMetaballBlend, getClusterBlend, getBurstBlend,
     getMotionSpeed, reportMotion, onPhaseTransition } = m);
});

function ticks(n) { for (let i = 0; i < n; i++) tick(); }

// Force burst to a deterministic duration.
// burstDuration = BURST_MIN_FRAMES + Math.floor(random * (MAX - MIN + 1))
// random = 0      → burstDuration = BURST_MIN_FRAMES = 10
// random = 0.9999 → burstDuration = BURST_MAX_FRAMES = 40
function mockBurstDuration(r) { vi.spyOn(Math, 'random').mockReturnValue(r); }

// ═════════════════════════════════════════════════════════════════════════════
// FSM — Zustände und Übergänge
// ═════════════════════════════════════════════════════════════════════════════

describe('FSM: Startzustand', () => {
  it('beginnt in Cluster: logicalPhase = 1.0', () => {
    expect(getLogicalPhase()).toBe(1.0);
  });

  it('visualPhase konvergiert bereits zu logicalPhase: = 1.0', () => {
    expect(getVisualPhase()).toBe(1.0);
  });

  it('getTime startet bei 0', () => {
    expect(getTime()).toBe(0);
  });
});

describe('FSM: Cluster → Burst', () => {
  it('reportMotion löst Burst aus', () => {
    reportMotion(0.5);
    expect(getLogicalPhase()).toBeGreaterThan(1.0);
  });

  it('logicalPhase = 1.0 + clamp(speed, 0, 1)', () => {
    reportMotion(0.8);
    expect(getLogicalPhase()).toBeCloseTo(1.8);
  });

  it('speed > 1 wird geklemmt: logicalPhase = 2.0', () => {
    reportMotion(99);
    expect(getLogicalPhase()).toBeCloseTo(2.0);
  });

  it('kein erneuter Burst-Trigger während Burst', () => {
    reportMotion(0.5);
    const phase = getLogicalPhase();
    reportMotion(1.0);
    expect(getLogicalPhase()).toBe(phase);
  });
});

describe('FSM: Burst-Dauer (Grenzen)', () => {
  // burstDuration = BURST_MIN_FRAMES + floor(random * (MAX-MIN+1))
  // random=0 → 10 (Minimum); random=0.9999 → 40 (Maximum)

  it('noch aktiv einen Tick vor BURST_MIN_FRAMES', () => {
    mockBurstDuration(0);
    reportMotion(0.5);
    ticks(9);  // stateFrames = 9 < 10
    expect(getLogicalPhase()).toBeGreaterThan(1.0);
  });

  it('endet genau bei BURST_MIN_FRAMES (Minimum)', () => {
    mockBurstDuration(0);
    reportMotion(0.5);
    ticks(10); // stateFrames = 10 → Metaball
    expect(getLogicalPhase()).toBe(0.0);
  });

  it('noch aktiv einen Tick vor BURST_MAX_FRAMES', () => {
    mockBurstDuration(0.9999);
    reportMotion(0.5);
    ticks(39); // stateFrames = 39 < 40
    expect(getLogicalPhase()).toBeGreaterThan(1.0);
  });

  it('endet genau bei BURST_MAX_FRAMES (Maximum)', () => {
    mockBurstDuration(0.9999);
    reportMotion(0.5);
    ticks(40); // stateFrames = 40 → Metaball
    expect(getLogicalPhase()).toBe(0.0);
  });
});

describe('FSM: Metaball-Verhalten', () => {
  // Mit minimum burst (BURST_MIN_FRAMES = 10):
  // Nach ticks(10): Metaball, stateFrames=0, noMotionFrames=1.
  // Übergang: stateFrames >= 800 UND noMotionFrames >= 360.
  // noMotionFrames wächst parallel (360 < 800) → bindend: stateFrames=800 bei Tick 810.

  it('bleibt in Metaball einen Tick vor METABALL_MIN_FRAMES', () => {
    mockBurstDuration(0);
    reportMotion(0.5);
    ticks(809); // 10 Burst + 799 Metaball-stateFrames
    expect(getLogicalPhase()).toBe(0.0);
  });

  it('wechselt zu Cluster genau bei METABALL_MIN_FRAMES', () => {
    mockBurstDuration(0);
    reportMotion(0.5);
    ticks(810); // stateFrames erreicht 800 → Cluster
    expect(getLogicalPhase()).toBe(1.0);
  });

  it('reportMotion in Metaball löst keinen Burst aus', () => {
    mockBurstDuration(0);
    reportMotion(0.5);
    ticks(10); // → Metaball
    reportMotion(1.0);
    expect(getLogicalPhase()).toBe(0.0);
  });

  it('reportMotion setzt noMotionFrames zurück und verzögert Rückkehr zu Cluster', () => {
    // Tick 809: stateFrames=799, noMotionFrames=800.
    // Motion → noMotionFrames auf 0 beim nächsten Tick.
    // Tick 810: stateFrames=800 ok, noMotionFrames=0 < 360 → bleibt Metaball.
    // Erst nach 360 weiteren stillen Ticks: beide Bedingungen erfüllt.
    mockBurstDuration(0);
    reportMotion(0.5);
    ticks(809);
    reportMotion(0.3);
    tick();    // stateFrames=800, noMotionFrames=0
    expect(getLogicalPhase()).toBe(0.0);
    ticks(359); // noMotionFrames=359 < 360
    expect(getLogicalPhase()).toBe(0.0);
    tick();    // noMotionFrames=360 → Cluster
    expect(getLogicalPhase()).toBe(1.0);
  });
});

describe('FSM: Cluster-Rückkehr-Guard (visualPhase)', () => {
  // Burst wird nur ausgelöst wenn _visualPhase > 0.65.
  // Nach vollständigem Metaball-Aufenthalt ist visualPhase ≈ 0 beim Rückeintritt in Cluster.
  // Ein erneuter Burst ist blockiert bis die Kreatur visuell in Cluster ist.

  it('kein Burst aus frischem Cluster (visualPhase < 0.65 nach Rückkehr)', () => {
    mockBurstDuration(0);
    reportMotion(0.5);
    ticks(810); // voller Zyklus; visualPhase ≈ 0 bei Rückeintritt
    expect(getVisualPhase()).toBeLessThan(0.65);
    reportMotion(1.0);
    expect(getLogicalPhase()).toBe(1.0); // Cluster, kein Burst
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Blend-Gewichte
// ═════════════════════════════════════════════════════════════════════════════

describe('Blend: Invariante (Summe = 1, alle ≥ 0)', () => {
  it('Summe = 1 und alle Gewichte ≥ 0 in jedem Zustand', () => {
    const check = () => {
      const m = getMetaballBlend(), c = getClusterBlend(), b = getBurstBlend();
      expect(m + c + b).toBeCloseTo(1.0);
      expect(m).toBeGreaterThanOrEqual(0);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(b).toBeGreaterThanOrEqual(0);
    };
    check();                       // Cluster (initial)
    reportMotion(0.5); ticks(5);
    check();                       // Burst
    ticks(50);
    check();                       // Metaball
  });
});

describe('Blend: Konvergenz in stabilen Zuständen', () => {
  it('clusterBlend → 1 im stabilen Cluster (Startzustand)', () => {
    expect(getClusterBlend()).toBeCloseTo(1.0, 1);
    expect(getMetaballBlend()).toBeCloseTo(0.0, 1);
    expect(getBurstBlend()).toBeCloseTo(0.0, 1);
  });

  it('metaballBlend → 1 und visualPhase → 0 nach langer Zeit in Metaball', () => {
    reportMotion(0.5);
    ticks(50 + 500); // → Metaball, dann exponentieller Abfall von visualPhase
    expect(getVisualPhase()).toBeLessThan(0.1);
    expect(getMetaballBlend()).toBeCloseTo(1.0, 1);
    expect(getClusterBlend()).toBeCloseTo(0.0, 1);
    expect(getBurstBlend()).toBeCloseTo(0.0, 1);
  });

  it('burstBlend > 0 während Burst', () => {
    reportMotion(0.5);
    ticks(20); // visualPhase überschreitet Burst-Smoothstep-Start
    expect(getBurstBlend()).toBeGreaterThan(0);
  });
});

describe('Blend: clusterActivation-Gate (Teal-Flash-Unterdrückung)', () => {
  // Nach Burst→Metaball zerfällt _clusterActivation (Rate 0.20/Frame).
  // Dies verhindert clusterBlend während visualPhase durch die Cluster-Smoothstep-Zone fällt.

  it('clusterBlend < 0.15 direkt nach Eintritt in Metaball aus Burst', () => {
    reportMotion(1.0);
    ticks(50); // → Metaball; Gate zerfällt, visualPhase noch erhöht
    expect(getClusterBlend()).toBeLessThan(0.15);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Output-Parameter
// ═════════════════════════════════════════════════════════════════════════════

describe('visualPhase', () => {
  it('nähert sich logicalPhase an (steigt bei Burst)', () => {
    reportMotion(1.0); // logicalPhase → 2.0
    ticks(20);
    expect(getVisualPhase()).toBeGreaterThan(1.0);
  });

  it('bleibt stets im Bereich [0, 2]', () => {
    reportMotion(1.0);
    for (let i = 0; i < 60; i++) {
      tick();
      expect(getVisualPhase()).toBeGreaterThanOrEqual(0);
      expect(getVisualPhase()).toBeLessThanOrEqual(2.0);
    }
  });
});

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

  it('zerfällt exponentiell ohne reportMotion', () => {
    reportMotion(1.0);
    tick(); // _motionThisFrame-Flag verbraucht
    const v0 = getMotionSpeed();
    ticks(20);
    expect(getMotionSpeed()).toBeLessThan(v0);
    expect(getMotionSpeed()).toBeGreaterThan(0); // exponentiell: erreicht nie 0
  });
});

describe('onPhaseTransition', () => {
  // _prevSlot = 0; slot = Math.ceil(logicalPhase).
  // Tick 1: slot 0→1 (Cluster). Burst-Eintritt: 1→2. Metaball-Eintritt: 2→0.

  it('feuert bei Cluster → Burst', () => {
    tick(); // initialen 0→1-Slot-Wechsel verbrauchen
    const calls = [];
    onPhaseTransition(p => calls.push(p));
    reportMotion(0.5);
    tick(); // slot 1→2 → feuert
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBeCloseTo(1.5);
  });

  it('feuert bei Burst → Metaball', () => {
    tick();
    reportMotion(0.5);
    tick(); // Burst-Eintritt feuert (vor Registrierung verbraucht)
    const calls = [];
    onPhaseTransition(p => calls.push(p));
    ticks(50); // Burst endet → Metaball, slot 2→0
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(0.0);
  });

  it('feuert bei Metaball → Cluster', () => {
    mockBurstDuration(0);
    reportMotion(0.5);
    ticks(10); // → Metaball; C→B und B→M-Übergänge bereits verbraucht
    const calls = [];
    onPhaseTransition(p => calls.push(p));
    ticks(800); // stateFrames = 800 → Cluster; slot 0→1
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(1.0);
  });
});

describe('getTime', () => {
  it('steigt monoton mit jedem Tick', () => {
    const t0 = getTime();
    tick();
    const t1 = getTime();
    ticks(10);
    expect(t1).toBeGreaterThan(t0);
    expect(getTime()).toBeGreaterThan(t1);
  });
});
