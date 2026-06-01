// orbitRadius:      XZ-Kreisradius — bleibt innerhalb BOUNDS_X = 1.8
// orbitSpeed:       Winkelgeschwindigkeit (Multiplikator)
// orbitPhase:       Startphase [0, 2π] — verteilt Bälle auf der Bahn
// orbitInclination: sin(Neigungswinkel) ∈ [0, 1]; Constraint: r * orbitInclination ≤ BOUNDS_Y = 1.0

export const balls = [
  { x:  0.6, y:  0.2, z:  0.0, r0: 0.20, vx: 0, vy: 0, vz: 0, orbitRadius: 1.65, orbitSpeed: 0.70, orbitPhase: 0.00, orbitInclination: 0.10 },
  { x: -0.5, y:  0.3, z:  0.3, r0: 0.17, vx: 0, vy: 0, vz: 0, orbitRadius: 1.42, orbitSpeed: 0.90, orbitPhase: 1.05, orbitInclination: 0.55 },
  { x:  0.0, y: -0.4, z:  0.0, r0: 0.13, vx: 0, vy: 0, vz: 0, orbitRadius: 1.00, orbitSpeed: 1.30, orbitPhase: 2.10, orbitInclination: 0.85 },
  { x:  0.8, y: -0.2, z: -0.2, r0: 0.15, vx: 0, vy: 0, vz: 0, orbitRadius: 0.85, orbitSpeed: 1.15, orbitPhase: 3.14, orbitInclination: 0.90 },
  { x: -0.3, y:  0.6, z:  0.1, r0: 0.18, vx: 0, vy: 0, vz: 0, orbitRadius: 1.72, orbitSpeed: 0.60, orbitPhase: 4.20, orbitInclination: 0.15 },
  { x:  0.4, y: -0.6, z:  0.3, r0: 0.14, vx: 0, vy: 0, vz: 0, orbitRadius: 0.65, orbitSpeed: 1.65, orbitPhase: 5.25, orbitInclination: 0.92 },
  { x: -0.7, y: -0.1, z: -0.1, r0: 0.16, vx: 0, vy: 0, vz: 0, orbitRadius: 0.42, orbitSpeed: 2.00, orbitPhase: 0.70, orbitInclination: 0.95 },
  { x:  0.2, y:  0.5, z: -0.3, r0: 0.19, vx: 0, vy: 0, vz: 0, orbitRadius: 1.20, orbitSpeed: 0.85, orbitPhase: 1.75, orbitInclination: 0.70 },
  { x: -0.1, y: -0.3, z:  0.4, r0: 0.12, vx: 0, vy: 0, vz: 0, orbitRadius: 0.52, orbitSpeed: 1.80, orbitPhase: 2.80, orbitInclination: 0.88 },
  { x:  0.9, y:  0.1, z:  0.2, r0: 0.21, vx: 0, vy: 0, vz: 0, orbitRadius: 1.55, orbitSpeed: 0.65, orbitPhase: 3.85, orbitInclination: 0.40 },
  { x: -0.6, y:  0.4, z: -0.4, r0: 0.15, vx: 0, vy: 0, vz: 0, orbitRadius: 0.80, orbitSpeed: 1.40, orbitPhase: 4.90, orbitInclination: 0.82 },
  { x:  0.3, y: -0.5, z:  0.1, r0: 0.17, vx: 0, vy: 0, vz: 0, orbitRadius: 1.30, orbitSpeed: 1.00, orbitPhase: 5.95, orbitInclination: 0.60 },
];
