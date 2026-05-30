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
| `getPhase()` | — | — | `float` | [0, 2]: 0=Metaball, (0,1]=Cluster, (1,2]=Burst |
| `triggerPhase(value)` | `value: float` | [0, 2] Zielphase | `void` | — |
| `releasePhase()` | — | — | `void` | — |
| `onPhaseTransition(fn)` | `fn: (phase: float) → void` | Callback wird aufgerufen, wenn `Math.ceil(phase)` seinen Wert ändert (0↔1↔2); `phase` = Wert zum Übergangszeitpunkt | `void` | — |

`tick()` einmal pro Frame aufrufen, bevor `getTime()`/`getPhase()` gelesen werden. `onPhaseTransition` feuert unabhängig davon, ob der Übergang durch Zeit, `triggerPhase()` oder `releasePhase()` ausgelöst wurde.

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

## GLSL-Chunks (interpoliert via Template-Literal)

### `shaders/noiseLib.js`
Rausch-Bibliothek. Exportiert: `noiseLib: string`. Wird in Shader-Chunks eingebettet, die Rauschen benötigen.

| GLSL-Funktion | Input | Bereich | Output | Bereich | Charakteristik |
|---|---|---|---|---|---|
| `perlin2D(p)` | `p: vec2` | ℝ²; Skalierung bestimmt Frequenz | `float` | [−1, 1], Mittelwert ≈ 0 | Glattes Gradienten-Rauschen; bandbegrenzt; stetig |
| `worley2D(p)` | `p: vec2` | ℝ²; Einheitszellen-Koordinaten | `float` | [0, ~1.0] F1-Distanz | Zelluläres Muster; Minima an Feature-Points |
| `worley3D(p)` | `p: vec3` | ℝ³ | `float` | [0, ~1.2] F1-Distanz | 3D-Zelluläres Muster; 27-Zellen-Lookup |

Interne Helfer (`_fade`, `_hash1`, `_grad`, `_hash2`, `_hash3`) sind nicht Teil der öffentlichen API.

```glsl
float n = perlin2D(p.xy * 4.0 + time * 0.3);   // Freq 4, langsame Animation
float c = worley2D(p.xz * 2.0);                 // Zelluläres Muster, Freq 2
```

---

### `shaders/shadingLib.js`
Shading-Modell (Nachimplementierung von `MeshPhysicalMaterial` für Raymarching).
Voraussetzung: Uniforms `envMap` (sampler2D), `reflectAll`, `phase` (float) deklariert; `map(vec3)` definiert (wird für Materialdicken-Proxy aufgerufen).

| GLSL-Funktion | Input | Bereich / Semantik | Output | Bereich |
|---|---|---|---|---|
| `shadeHit(p, n, rd, phase)` | `p: vec3` Oberflächenpunkt, `n: vec3` Normale (normalisiert), `rd: vec3` Strahlenrichtung (normalisiert), `phase: float ∈ [0,2]` | `phase` steuert kontinuierlichen Blend: 0=metallisch, ~0.5=transluzent, 2=metallisch | `vec3` | [0, ∞) HDR-Farbe |

Interne Funktionen `shadeMetal`, `shadeCluster` sind nicht öffentlich.

---

### `shaders/environmentShader.js`
Equirectangular-Umgebungsgenerator. Exportiert: `environmentVert`, `environmentFrag`. Wird von `environment.js` intern verwendet.

| GLSL-Uniform | Typ | Bereich / Semantik | Wirkung auf Output |
|---|---|---|---|
| `phase` | `float` | [0, 2] | Farbtemperatur, Direktivität, Kontrast (Metaball: kühl/diffus; Cluster: warm/weich; Burst: dunkel+harte Spots) |
| `time` | `float` | [0, ∞) | Langsame Animation innerhalb einer Phase (Noise-Drift) |
| `resolution` | `vec2` | Rendertarget-Größe (512×256) | UV → Pixelkoordinate |

Output: `gl_FragColor` = HDR RGB-Farbe der Himmelskugel am UV-Punkt (→ Kugelrichtung via Equirectangular-Mapping).

---

### `shaders/simulationShader.js`
Physik-GLSL für den Sim-Pass. Intern von `simulation.js` verwendet. Exportiert: `simulationVert`, `simulationFrag`.

| GLSL-Uniform | Typ | Bereich / Semantik | Wirkung |
|---|---|---|---|
| `stateTex` | `sampler2D` | RGBA32F 36×1 | Eingangszustand; jedes Fragment liest seinen Ball |
| `phase` | `float` | [0, 2] | Bestimmt Physik-Zweig: `ceil(phase)` → 0=Metaball, 1=Cluster, 2=Burst |
| `time` | `float` | [0, ∞) | Seed für deterministisches Rauschen pro Frame |

Output: `gl_FragColor` = neuer Ball-Zustand für Texel `int(gl_FragCoord.x)`. Texel-Typ (pos/vel/reserved) wird aus `texelIdx % 3` bestimmt.

---

### `shaders/raymarchShader.js`
Haupt-Render-Pass. Interpoliert `noiseLib` und `shadingLib`. Exportiert: `mainVert`, `mainFrag`.

| GLSL-Uniform | Typ | Bereich / Semantik |
|---|---|---|
| `stateTex` | `sampler2D` | Ball-Zustandstextur (von simulation.js) |
| `envMap` | `sampler2D` | PMREM-Textur (von environment.js) |
| `time`, `phase`, `camPos`, `resolution`, `reflectAll` | — | Globale Szenenparameter |

`main()` ruft `loadBalls()` → `raymarch()` → `shadeHit()` auf. Alle Ball-Daten werden einmalig pro Fragment aus `stateTex` geladen; kein Texture-Read in der Raymarch-Schleife.
