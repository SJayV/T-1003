# Module Interfaces — T-1003

Public API jedes Moduls. Notation: `param: Type ∈ [min, max]`; Interna bleiben gekapselt.
GLSL-Module sind Chunks (Template-Literal-Interpolation in JS), keine eigenständigen Shader-Programme.

---

## JavaScript-Module

### `src/phase.js`
Zeitgesteuerte Phasenverwaltung und Ereigniskoordination. Einzige autoritative Quelle für `time` und `phase`.

| Funktion | Parameter | Bereich / Semantik | Rückgabe | Bereich |
|---|---|---|---|---|
| `tick()` | — | — | `void` | — |
| `getTime()` | — | — | `float` | [0, ∞) monoton wachsend |
| `getLogicalPhase()` | — | — | `float` | [0, 2]: 0=Metaball, (0,1]=Cluster, (1,2]=Burst; harte Übergänge; für Physik und Ereignisse |
| `getVisualPhase()` | — | — | `float` | [0, 2]: exponentieller Lerp zu `getLogicalPhase()`, Rate 0.08/Frame; für Shading-Blend und PMREM |
| `triggerPhase(value)` | `value: float` | [0, 2] Zielphase | `void` | — |
| `releasePhase()` | — | — | `void` | — |
| `onPhaseTransition(fn)` | `fn: (phase: float) → void` | `phase` = logischer Wert zum Übergangszeitpunkt | `void` | — |

`tick()` einmal pro Frame aufrufen; aktualisiert `getVisualPhase()` und prüft Slot-Übergänge. `onPhaseTransition` feuert bei `Math.ceil(getLogicalPhase())` Änderung (0↔1↔2), unabhängig von der Trigger-Quelle.

---

### `src/simulation.js`
GPU-Physiksimulation. Verwaltet 1D-Zustandstextur (RGBA32F, 36×1) und Ping-Pong-RenderTargets. Die eigentliche Physik-Logik liegt in `simulationShader.js`.

| Funktion | Parameter | Bereich / Semantik | Rückgabe | Bereich |
|---|---|---|---|---|
| `initSimulation(renderer)` | `renderer: WebGLRenderer` | Wird intern für Sim-Pass-Render-Calls gespeichert | `void` | — |
| `stepSimulation(phase, time)` | `phase: float ∈ [0,2]`, `time: float ∈ [0,∞)` | `phase` steuert Physik-Zweig im Shader; `time` als Seed für deterministisches Rauschen | `void` | — |
| `getUniformDefs()` | — | — | `{ stateTex: { value } }` | Uniform-Objekt für ShaderMaterial |
| `applyStateToMaterial(material)` | `material: ShaderMaterial` | Setzt `stateTex` auf aktuelle Lesertextur | `void` | — |

Aufrufsequenz pro Frame: `stepSimulation` → `applyStateToMaterial` → Haupt-Render.

---

### `src/environment.js`
Dynamische PMREM-Generierung aus synthetischem Equirectangular-Shader (`environmentShader.js`). Regeneriert alle 4 Frames und bei Phasenübergängen via `onPhaseTransition`.

| Funktion | Parameter | Bereich / Semantik | Rückgabe | Bereich |
|---|---|---|---|---|
| `initEnvMap(renderer)` | `renderer: WebGLRenderer` | Wird für Equirectangular-Pass und `PMREMGenerator` benötigt | `void` | — |
| `getUniformDefs()` | — | — | `{ envMap: { value } }` | Einzelne Env-Map-Uniform |
| `applyStateToMaterial(material, phase, time)` | `material: ShaderMaterial`, `phase: float ∈ [0,2]`, `time: float ∈ [0,∞)` | `phase` steuert Umgebungsstimmung im Equirectangular-Shader; `time` treibt within-phase-Animation | `void` | — |

---

### `src/camera.js`
Statische Kamera mit autonomem Schwenk. ⚠️ Stub.

| Funktion | Parameter | Bereich / Semantik | Rückgabe | Bereich |
|---|---|---|---|---|
| `initCamera(camera, controls)` | `camera: PerspectiveCamera`, `controls: OrbitControls` | — | `void` | — |
| `updateCamera(camera, controls, phase, time)` | `phase: float ∈ [0,2]`, `time: float ∈ [0,∞)` | `time` treibt autonomen Schwenk; `phase` kann Kamerabewegung beeinflussen | `void` | — |
| `onInput(type, data)` | `type: string ∈ {'presence','absence'}`, `data: { speed?: float ∈ [0,1] }` | Aufgerufen von `input.js`; `speed` skaliert optionale Kamerareaktion | `void` | — |

---

### `src/input.js`
Externes Eingabegerät (Webcam / Bewegungssensor). ⚠️ Stub. Ruft `phase.js` und `camera.js` direkt auf.

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
Phasengekoppelte Klangkulisse. ⚠️ Stub.

| Funktion | Parameter | Bereich / Semantik | Rückgabe | Bereich |
|---|---|---|---|---|
| `initAudio()` | — | — | `void` | — |
| `updateAudio(phase, time)` | `phase: float ∈ [0,2]`, `time: float ∈ [0,∞)` | `phase` steuert Klangcharakter (0: niederfrequent/ruhig → 2: hochfrequent/dissonant) | `void` | — |

Registriert sich bei `onPhaseTransition` für Klangwechsel an Schwellenwerten.

---

### `src/balls.js`
Initialzustand der 12 Metaballs (Startwerte für GPU-Zustandstextur).

| Export | Typ | Bereich / Semantik |
|---|---|---|
| `balls` | `Array<{x,y,z,r0,vx,vy,vz}>` (length 12) | Positionen ∈ [−1.8,1.8]×[−1,1]×[−0.5,0.5]; `r0 ∈ (0,∞)` Basisradius; Geschwindigkeiten = 0 initial |

---

### `src/renderer.js`
Szenen-Setup. Exportiert Objekte direkt; keine Initialisierungsfunktion.

| Export | Typ | Semantik |
|---|---|---|
| `scene` | `THREE.Scene` | Hauptszene |
| `camera` | `THREE.PerspectiveCamera` | fov 60, pos (−0.4, −0.2, 3) |
| `renderer` | `THREE.WebGLRenderer` | antialias, Reinhard tone-mapping |
| `controls` | `OrbitControls` | Wird durch autonome Kamerabewegung in `camera.js` abgelöst |

---

## GLSL-Bibliotheken (`libraries/`, interpoliert via Template-Literal)

Alle Bibliotheken exportieren einen GLSL-String, der per `${…}` in den jeweiligen Shader interpoliert wird. Die Bibliotheksfunktionen haben Zugriff auf Uniforms und Hilfsfunktionen des umschließenden Shaders (gleicher Programm-Scope).

### `libraries/noiseLibrary.js`
Rausch-Bibliothek. Von mehreren Shadern nutzbar. Exportiert: `noiseLibrary: string`.

| GLSL-Funktion | Input | Bereich | Output | Bereich | Charakteristik |
|---|---|---|---|---|---|
| `perlin2D(p)` | `p: vec2` | ℝ²; Skalierung bestimmt Frequenz | `float` | [−1, 1], Mittelwert ≈ 0 | Glattes Gradienten-Rauschen; bandbegrenzt; stetig |
| `worley2D(p)` | `p: vec2` | ℝ²; Einheitszellen-Koordinaten | `float` | [0, ~1.0] F1-Distanz | Zelluläres Muster; Minima an Feature-Points |
| `worley3D(p)` | `p: vec3` | ℝ³ | `float` | [0, ~1.2] F1-Distanz | 3D-Zelluläres Muster; 27-Zellen-Lookup |

```glsl
float n = perlin2D(p.xy * 4.0 + time * 0.3);
float c = worley2D(p.xz * 2.0);
```

---

### `libraries/raymarchLibrary.js`
Shading-Modell (Nachimplementierung von `MeshPhysicalMaterial` für Raymarching). Nur von `raymarchShader.js` verwendet.
Voraussetzung: Uniforms `envMap` (sampler2D), `reflectAll`, `phase` (float) deklariert; `map(vec3)` definiert.

| GLSL-Funktion | Input | Bereich / Semantik | Output | Bereich |
|---|---|---|---|---|
| `shadeHit(p, n, rd, phase)` | `p: vec3` Oberflächenpunkt, `n: vec3` Normale, `rd: vec3` Strahlenrichtung, `phase: float ∈ [0,2]` | `phase` = `getVisualPhase()`; steuert Blend: 0=metallisch, ~0.5=transluzent, 2=metallisch | `vec3` | [0, ∞) HDR-Farbe |

---

### `libraries/simulationLibrary.js`
Physikfunktionen pro Phasenmodus. Nur von `simulationShader.js` verwendet.
Voraussetzung: Uniforms `stateTex` (sampler2D), `time` (float) deklariert; `stateUV(int)` definiert.

| GLSL-Funktion | Input / Output | Semantik |
|---|---|---|
| `applyMetaball(inout pos, inout vel, seed)` | `pos,vel: vec3`, `seed: float` | Stochastischer Drift + schwache Kreisrotation + Zentrierung |
| `applyCluster(inout pos, inout vel)` | `pos,vel: vec3` | Zentripetalkraft zu globalem Schwerpunkt |
| `applyBurst(inout pos, inout vel, seed)` | `pos,vel: vec3`, `seed: float` | Zentrifugalkraft + stochastische Streuung |

---

## Shader-Module (`shaders/`)

### `shaders/simulationShader.js`
Sim-Pass-Shader. Intern von `simulation.js` verwendet. Interpoliert `simulationLibrary`. Exportiert: `simulationVert`, `simulationFrag`.

| GLSL-Uniform | Typ | Bereich / Semantik |
|---|---|---|
| `stateTex` | `sampler2D` | RGBA32F 36×1 Eingangszustand |
| `phase` | `float` | [0, 2] `getLogicalPhase()` — bestimmt Physik-Zweig |
| `time` | `float` | [0, ∞) Seed für deterministisches Rauschen |

---

### `shaders/environmentShader.js`
Equirectangular-Umgebungsgenerator. Intern von `environment.js` verwendet. Interpoliert `noiseLibrary`. Exportiert: `environmentVert`, `environmentFrag`.

| GLSL-Uniform | Typ | Bereich / Semantik |
|---|---|---|
| `phase` | `float` | [0, 2] `getVisualPhase()` — Farbtemperatur, Direktivität, Kontrast |
| `time` | `float` | [0, ∞) Animation (Noise-Drift, Sphären-Rotation) |
| `resolution` | `vec2` | Rendertarget-Größe (512×256) |

Output: HDR RGB-Farbe der Himmelskugel an der UV-Position (Equirectangular-Mapping).

---

### `shaders/raymarchShader.js`
Haupt-Render-Pass. Interpoliert `noiseLibrary` + `raymarchLibrary`. Exportiert: `mainVert`, `mainFrag`.

| GLSL-Uniform | Typ | Bereich / Semantik |
|---|---|---|
| `stateTex` | `sampler2D` | Ball-Zustandstextur |
| `envMap` | `sampler2D` | PMREM-Textur |
| `phase` | `float` | [0, 2] `getVisualPhase()` — Shading-Blend |
| `time`, `camPos`, `resolution`, `reflectAll` | — | Globale Szenenparameter |

`main()`: `loadBalls()` → `raymarch()` → `shadeHit()`. Ball-Daten werden einmalig aus `stateTex` geladen; kein Texture-Read in Raymarch- oder Normal-Schleife.
