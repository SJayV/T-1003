// Concentric rings around origin. Screen is landscape (16:9).
// Orbit X-amplitude = r, Y-amplitude = r * orbitInclination.
// Constraint: r * orbitInclination ≤ 0.85 (screen top/bottom);
//             r ≤ 1.0 (screen left/right at 16:9).
// Tilted orbits must have smaller r to compensate for Y extent.
//
// Ring 1 (inner):  r ≈ 0.25–0.30, 4 balls, fast
// Ring 2 (middle): r ≈ 0.52–0.62, 5 balls, medium
// Ring 3 (outer):  r ≈ 0.72–0.88, 3 balls, slow (low incl to stay in frame)

export const balls = [
  // ── Ring 1: inner (r≈0.18, fast) ──────────────────────────────────────────
  { x:  0.0, y:  0.0, z:  0.0, r0: 0.18, vx: 0, vy: 0, vz: 0, orbitRadius: 0.08, orbitSpeed: 2.0, orbitPhase: 0.00, orbitInclination: 0.15 },
  { x:  0.0, y:  0.0, z:  0.0, r0: 0.16, vx: 0, vy: 0, vz: 0, orbitRadius: 0.17, orbitSpeed: 1.8, orbitPhase: 1.57, orbitInclination: 0.65 },
  { x:  0.0, y:  0.0, z:  0.0, r0: 0.14, vx: 0, vy: 0, vz: 0, orbitRadius: 0.10, orbitSpeed: 2.2, orbitPhase: 3.14, orbitInclination: 0.40 },
  { x:  0.0, y:  0.0, z:  0.0, r0: 0.15, vx: 0, vy: 0, vz: 0, orbitRadius: 0.05, orbitSpeed: 1.9, orbitPhase: 4.71, orbitInclination: 0.88 },

  // ── Ring 2: middle (r≈0.37, medium) ───────────────────────────────────────
  { x:  0.0, y:  0.0, z:  0.0, r0: 0.20, vx: 0, vy: 0, vz: 0, orbitRadius: 0.40, orbitSpeed: 1.0, orbitPhase: 0.63, orbitInclination: 0.18 },
  { x:  0.0, y:  0.0, z:  0.0, r0: 0.17, vx: 0, vy: 0, vz: 0, orbitRadius: 0.32, orbitSpeed: 1.3, orbitPhase: 1.88, orbitInclination: 0.60 },
  { x:  0.0, y:  0.0, z:  0.0, r0: 0.19, vx: 0, vy: 0, vz: 0, orbitRadius: 0.42, orbitSpeed: 0.9, orbitPhase: 3.14, orbitInclination: 0.32 },
  { x:  0.0, y:  0.0, z:  0.0, r0: 0.13, vx: 0, vy: 0, vz: 0, orbitRadius: 0.38, orbitSpeed: 1.2, orbitPhase: 4.40, orbitInclination: 0.82 },
  { x:  0.0, y:  0.0, z:  0.0, r0: 0.21, vx: 0, vy: 0, vz: 0, orbitRadius: 0.28, orbitSpeed: 1.1, orbitPhase: 5.65, orbitInclination: 0.48 },

  // ── Ring 3: outer (r≈0.60, slow — low incl to avoid leaving frame) ─────────
  { x:  0.0, y:  0.0, z:  0.0, r0: 0.22, vx: 0, vy: 0, vz: 0, orbitRadius: 0.68, orbitSpeed: 0.55, orbitPhase: 0.00, orbitInclination: 0.20 },
  { x:  0.0, y:  0.0, z:  0.0, r0: 0.18, vx: 0, vy: 0, vz: 0, orbitRadius: 0.55, orbitSpeed: 0.70, orbitPhase: 2.09, orbitInclination: 0.50 },
  { x:  0.0, y:  0.0, z:  0.0, r0: 0.20, vx: 0, vy: 0, vz: 0, orbitRadius: 0.52, orbitSpeed: 0.60, orbitPhase: 4.19, orbitInclination: 0.12 },
];
