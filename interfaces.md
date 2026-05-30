# Module Interfaces — T-1003

Public API jedes Moduls. Notation: `param: Type ∈ [min, max]`; Interna bleiben gekapselt.
GLSL-Module sind Chunks (Template-Literal-Interpolation), keine eigenständigen Shader-Programme.

---

## JavaScript-Module

### `src/phase.js`
Zeitgesteuerte Phasenverwaltung. Einzige autoritative Quelle für `time` und `phase`.

| Funktion | Parameter | Bereich / Semantik | Rückgabe | Bereich |
|---|---|---|---|---|
| `tick()` | — | — | `void` | — |
| `getTime()` | — | — | `float` | [0, ∞) — monoton wachsende Zeit |
| `getPhase()` | — | — | `float` | [0, 2] — 0: Metaball, (0,1]: Cluster, (1,2]: Burst |
| `triggerPhase(value)` | `value: float` | [0, 2] — Zielphase | `void` | — |
| `releasePhase()` | — | — | `void` | — |
| `onPhaseTransition(fn)` | `fn: (phase: float) → void` | Callback; phase = Wert zum Zeitpunkt des Übergangs | `void` | — |

`tick()` einmal pro Frame aufrufen, bevor `getTime()`/`getPhase()` gelesen werden.
`onPhaseTransition` feuert bei jedem Wechsel des Slots (Math.ceil(phase): 0↔1↔2) — unabhängig davon, ob der Übergang durch Zeit, `triggerPhase()` oder `releasePhase()` ausgelöst wurde. Einzige authoritative Stelle für Schwellenwert-Erkennung.

---

### `src/simulation.js`
GPU-Physiksimulation; verwaltet 1D-Zustandstextur (RGBA32F, 36×1) und Ping-Pong-Targets.

| Funktion | Parameter | Bereich / Semantik | Rückgabe | Bereich |
|---|---|---|---|---|
| `initSimulation(renderer)` | `renderer: WebGLRenderer` | Three.js-Renderer; wird intern für Sim-Pass-Render-Calls gespeichert | `void` | — |
| `stepSimulation(phase, time)` | `phase: float ∈ [0,2]`, `time: float ∈ [0,∞)` | Phasenwert steuert Physik-Zweig; `time` dient als Seed für deterministisches Rauschen im Shader | `void` | — |
| `getUniformDefs()` | — | — | `{ stateTex: { value } }` | Uniform-Objekt zum Einstreuen in ShaderMaterial |
| `applyStateToMaterial(material)` | `material: ShaderMaterial` | Schreibt aktuelle Lesertextur in `material.uniforms.stateTex` | `void` | — |

Aufrufsequenz pro Frame: `stepSimulation` → `applyStateToMaterial` → Haupt-Render.

---

### `src/envmap.js`
Environment-Map-Verwaltung. Derzeit HDR-Loading; geplant: einzelne dynamische PMREM via `pmremShader.js`.

| Funktion | Parameter | Bereich / Semantik | Rückgabe | Bereich |
|---|---|---|---|---|
| `initEnvMap(renderer)` | `renderer: WebGLRenderer` | Three.js-Renderer; wird für Equirectangular-Pass und PMREMGenerator benötigt | `void` | — |
| `getUniformDefs()` | — | — | `{ envMap: { value } }` | Einzelne Env-Map-Uniform |
| `applyStateToMaterial(material, phase, time)` | `material: ShaderMaterial`, `phase: float ∈ [0,2]`, `time: float ∈ [0,∞)` | `phase` steuert Umgebungsstimmung (pmremShader); regeneriert PMREM alle 4 Frames + bei Phasenübergang (via `onPhaseTransition`) | `void` | — |

---

### `src/camera.js`
Statische Kamera mit autonomem Schwenk.

| Funktion | Parameter | Bereich / Semantik | Rückgabe | Bereich |
|---|---|---|---|---|
| `initCamera(camera, controls)` | `camera: PerspectiveCamera`, `controls: OrbitControls` | Setzt Startposition; `controls` wird zur späteren Deaktivierung übergeben | `void` | — |
| `updateCamera(camera, controls, phase, time)` | `phase: float ∈ [0,2]`, `time: float ∈ [0,∞)` | Phase kann Kamerabewegung beeinflussen; `time` treibt autonomen Schwenk | `void` | — |
| `onInput(type, data)` | `type: string ∈ {'presence','absence'}`, `data: { speed?: float ∈ [0,1] }` | Aufgerufen von `input.js`; `speed` skaliert optionale Kamerareaktion | `void` | — |

---

### `src/input.js`
Externes Eingabegerät. Ruft `phase` und `camera` direkt auf — kein Durchlauf durch `main.js`.

| Funktion | Parameter | Bereich / Semantik | Rückgabe | Bereich |
|---|---|---|---|---|
| `initInput()` | — | — | `void` | — |
| `updateInput()` | — | — | `void` | Poll-basiert; optional bei event-driven Modell |

Interne Callbacks (nicht öffentlich):

| Callback | Parameter | Bereich / Semantik | Aktion |
|---|---|---|---|
| `_onPresence(speed)` | `speed: float ∈ [0,1]` | Normierte Bewegungsgeschwindigkeit | `triggerPhase(1.0 + max(0.1, speed))` + `cameraInput('presence', {speed})` |
| `_onAbsence()` | — | — | `releasePhase()` + `cameraInput('absence', {})` |

---

### `src/audio.js`
Phasengekoppelte Klangkulisse. Stub.

| Funktion | Parameter | Bereich / Semantik | Rückgabe | Bereich |
|---|---|---|---|---|
| `initAudio()` | — | — | `void` | — |
| `updateAudio(phase, time)` | `phase: float ∈ [0,2]`, `time: float ∈ [0,∞)` | Phase steuert Klangcharakter (0: niederfrequent/ruhig → 2: hochfrequent/dissonant) | `void` | — |

---

### `src/balls.js`
Initialzustand der 12 Metaballs.

| Export | Typ | Bereich / Semantik |
|---|---|---|
| `balls` | `Array<{x,y,z,r0,vx,vy,vz}>` (length 12) | Positionen ∈ [−1.8,1.8]×[−1,1]×[−0.5,0.5]; `r0 ∈ (0,∞)` Basisradius; `vx/vy/vz = 0` initial |

---

### `src/renderer.js`
Szenen-Setup. Gibt Objekte direkt aus; keine Initialisierungsfunktion.

| Export | Typ | Semantik |
|---|---|---|
| `scene` | `THREE.Scene` | Hauptszene |
| `camera` | `THREE.PerspectiveCamera` | fov 60, pos (−0.4, −0.2, 3) |
| `renderer` | `THREE.WebGLRenderer` | antialias, Reinhard tone-mapping |
| `controls` | `OrbitControls` | Temporär; wird durch `camera.js` ersetzt |

---

## GLSL-Chunks (interpoliert via Template-Literal)

### `shaders/noiseLib.js`
Rausch-Bibliothek; wird in andere Shader-Chunks eingebettet. Exportiert: `noiseLib: string`.

| GLSL-Funktion | Input | Bereich | Output | Bereich | Charakteristik |
|---|---|---|---|---|---|
| `perlin2D(p)` | `p: vec2` | ℝ² — Skalierung bestimmt Frequenz | `float` | [−1, 1], Mittelwert ≈ 0 | Glattes Gradienten-Rauschen; bandbegrenzt; stetig |
| `worley2D(p)` | `p: vec2` | ℝ² — Einheitszellen-Koordinaten | `float` | [0, ~1.0] — F1-Distanz | Zelluläres/organisches Muster; Maxima zwischen Zellen |
| `worley3D(p)` | `p: vec3` | ℝ³ | `float` | [0, ~1.2] — F1-Distanz | 3D-Zelluläres Muster; 27-Zellen-Lookup |

Interne Helfer (`_fade`, `_hash1`, `_grad`, `_hash2`, `_hash3`) sind nicht Teil der öffentlichen API.

**Verwendung:** Frequenz durch Skalierung des Eingabevektors; Offset durch Addition:
```glsl
float n = perlin2D(p.xy * 4.0 + time * 0.3);   // Freq 4, langsame Animation
float c = worley2D(p.xz * 2.0);                 // Zelluläres Muster, Freq 2
```

---

### `shaders/shadingLib.js`
Shading-Modell (Nachimplementierung von MeshPhysicalMaterial für Raymarching).
Voraussetzung: Uniforms `envMap`, `envMapNext`, `envBlend`, `reflectAll`, `phase` deklariert; `map(vec3)` definiert.

| GLSL-Funktion | Input | Bereich / Semantik | Output | Bereich |
|---|---|---|---|---|
| `shadeHit(p, n, rd, phase)` | `p: vec3` Oberflächenpunkt, `n: vec3` Normale (normalisiert), `rd: vec3` Strahlenrichtung (normalisiert), `phase: float ∈ [0,2]` | phase steuert Blend: 0=metallisch, ~0.5=transluzent, 2=metallisch | `vec3` | [0, ∞) HDR-Farbe |

Interne Funktionen `shadeMetal`, `shadeCluster` sind nicht öffentlich.

---

### `shaders/pmremShader.js` ⚠️ geplant
Synthetischer Equirectangular-Pass als Quelle für `PMREMGenerator`.

| GLSL-Funktion / Export | Input | Bereich / Semantik | Output | Bereich |
|---|---|---|---|---|
| `pmremFrag` (Uniform `phase`) | `phase: float ∈ [0,2]` | steuert Farbtemperatur, Direktivität, Kontrast der Umgebung | `gl_FragColor: vec4` | RGB-Farbe der Himmelskugel an UV-Position |
| `pmremFrag` (Uniform `time`) | `time: float ∈ [0,∞)` | treibt Noise-Animation innerhalb einer Phase | — | — |

---

### `shaders/simShader.js`
Intern von `simulation.js` verwendet. Kein direkter Aufruf nötig.

| Export | Semantik |
|---|---|
| `simVert` | Passthrough-Vertex-Shader (Sim-Pass-Quad) |
| `simFrag` | Liest `stateTex` (Uniform), berechnet einen Physik-Schritt, schreibt neuen Ball-Zustand. Texel-Index bestimmt Ball und Sub-Komponente (pos/vel/reserved). |

---

### `shaders/raymarchShader.js`
Haupt-Render-Pass. Importiert und interpoliert `noiseLib` und `shadingLib`.

| Export | Semantik |
|---|---|
| `mainVert` | Passthrough-Vertex-Shader |
| `mainFrag` | Raymarching über SDF aus `stateTex`; ruft `shadeHit` für Farbbestimmung auf |
