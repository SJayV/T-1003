import { describe, it, expect } from 'vitest';
import { BALLS } from '../src/constants.js';

describe('balls — Struktur', () => {
  it('enthält genau 12 Einträge', () => {
    expect(BALLS).toHaveLength(12);
  });

  it('alle Felder vorhanden und vom Typ number', () => {
    for (const ball of BALLS) {
      expect(typeof ball.initialRadius).toBe('number');
      expect(typeof ball.orbitRadius).toBe('number');
      expect(typeof ball.orbitSpeed).toBe('number');
      expect(typeof ball.orbitInclination).toBe('number');
    }
  });
});

describe('balls — Wertebereiche', () => {
  it('initialRadius ist positiv', () => {
    for (const ball of BALLS) expect(ball.initialRadius).toBeGreaterThan(0);
  });

  it('orbitRadius ist positiv', () => {
    for (const ball of BALLS) expect(ball.orbitRadius).toBeGreaterThan(0);
  });

  it('orbitSpeed ist positiv', () => {
    for (const ball of BALLS) expect(ball.orbitSpeed).toBeGreaterThan(0);
  });

  it('orbitInclination liegt im Sinus-Wertebereich [-1, 1]', () => {
    for (const ball of BALLS) {
      expect(ball.orbitInclination).toBeGreaterThanOrEqual(-1);
      expect(ball.orbitInclination).toBeLessThanOrEqual(1);
    }
  });
});
