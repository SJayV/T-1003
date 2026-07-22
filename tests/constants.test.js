import { describe, it, expect } from 'vitest';
import { glslFloat } from '../src/constants.js';

describe('glslFloat', () => {
  it('hängt an ganze Zahlen ".0" an, damit GLSL sie als float erkennt', () => {
    expect(glslFloat(5)).toBe('5.0');
    expect(glslFloat(0)).toBe('0.0');
    expect(glslFloat(-3)).toBe('-3.0');
  });

  it('lässt Kommazahlen unverändert', () => {
    expect(glslFloat(0.18)).toBe('0.18');
    expect(glslFloat(-0.35)).toBe('-0.35');
  });
});
