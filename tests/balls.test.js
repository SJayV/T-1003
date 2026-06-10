import { describe, it, expect } from 'vitest';
import { balls } from '../src/balls.js';

describe('balls — Struktur', () => {
  it('enthält genau 12 Einträge', () => {
    expect(balls).toHaveLength(12);
  });

  it('alle Felder vorhanden und vom Typ number', () => {
    for (const b of balls) {
      expect(typeof b.r0).toBe('number');
      expect(typeof b.orbitRadius).toBe('number');
      expect(typeof b.orbitSpeed).toBe('number');
      expect(typeof b.orbitInclination).toBe('number');
    }
  });
});

describe('balls — Wertebereiche', () => {
  it('r0 ist positiv', () => {
    for (const b of balls) expect(b.r0).toBeGreaterThan(0);
  });

  it('orbitRadius ist positiv', () => {
    for (const b of balls) expect(b.orbitRadius).toBeGreaterThan(0);
  });

  it('orbitSpeed ist positiv', () => {
    for (const b of balls) expect(b.orbitSpeed).toBeGreaterThan(0);
  });

  it('orbitInclination liegt im Sinus-Wertebereich [-1, 1]', () => {
    for (const b of balls) {
      expect(b.orbitInclination).toBeGreaterThanOrEqual(-1);
      expect(b.orbitInclination).toBeLessThanOrEqual(1);
    }
  });
});
