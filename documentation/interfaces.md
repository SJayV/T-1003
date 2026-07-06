# Module Interfaces — T-1003

Public API jedes Moduls. Notation: `param: Type ∈ [min, max]`; Interna bleiben gekapselt.
GLSL-Module sind Chunks (Template-Literal-Interpolation in JS), keine eigenständigen Shader-Programme.

---

## JavaScript-Module

### `src/phase.js`
Input-gesteuerter FSM (Cluster → Burst → Metaball → Cluster). Einzige autoritative Quelle für Phasenwerte und Blend-Gewichte.

| Funktion | Parameter | Bereich / Semantik | Rückgabe | Bereich |
|---|---|---|---|---|
| `tick()` | — | — | `void` | — |
| `getTime()` | — | — | `float` | [0, ∞) monoton — für Shader-Animationen |
| `getLogicalPhase()` | — | — | `float` | 0.0=Metaball, 1.0=Cluster, 1.0+s=Burst |
| `getVisualPhase()` | — | — | `float` | [0, 1.5] exp. Lerp zu `getLogicalPhase()`; Burst schneller als andere Übergänge |
| `getMetaballBlend()` | — | — | `float` | [0,1] Blend-Gewicht Metaball |
| `getClusterBlend()` | — | — | `float` | [0,1] Blend-Gewicht Cluster |
| `getBurstBlend()` | — | — | `float` | [0,1] Blend-Gewicht Burst |
| `getMotionSpeed()` | — | — | `float` | [0,1] Aktuell erkannte Bewegungsgeschwindigkeit; exponentiell abklingend ohne Bewegung |
| `reportMotion(speed)` | `speed: float ∈ [0,1]` | Von `input.js`: löst Cluster→Burst aus (wenn Cooldown ≤ 0); in Metaball: setzt no-motion-Timer zurück; setzt intern `_motionSpeed = speed` | `void` | — |
| `onPhaseTransition(fn)` | `fn: (logicalPhase: float) → void` | Feuert bei `Math.ceil(logicalPhase)` Wechsel | `void` | — |

`tick()` einmal pro Frame: zählt State-Timer, führt FSM-Übergänge aus, aktualisiert `visualPhase`, Blend-Gewichte und gibt `_motionSpeed` exponentiellen Decay (ohne Bewegung).
`reportMotion` setzt intern `_motionThisFrame = true` und `_motionSpeed = speed` — wird von `tick()` ausgelesen und zurückgesetzt.

---

### `src/simulation.js`
GPU-Physiksimulation. Verwaltet 1D-Zustandstextur (RGBA32F, 36×1) und Ping-Pong-RenderTargets. Die eigentliche Physik-Logik liegt in `simulationShader.js`.

| Funktion | Parameter | Bereich / Semantik | Rückgabe | Bereich |
|---|---|---|---|---|
| `initSimulation(renderer)` | `renderer: WebGLRenderer` | Wird intern für Sim-Pass-Render-Calls gespeichert | `void` | — |
| `stepSimulation()` | — | Liest `logicalPhase`, `visualPhase`, `time`, `motionSpeed` direkt aus `phase.js`; steuert Physik-Blend und Burst-Intensität im Sim-Shader | `void` | — |
| `getUniformDefs()` | — | — | `{ stateTex: { value } }` | Uniform-Objekt für ShaderMaterial |
| `applyStateToMaterial(material)` | `material: ShaderMaterial` | Setzt `stateTex` auf aktuelle Lesertextur | `void` | — |

Aufrufsequenz pro Frame: `stepSimulation` → `applyStateToMaterial` → Haupt-Render.

---

### `src/environment.js`
Dynamische Equirectangular-Env-Map-Generierung aus synthetischem Shader (`environmentShader.js`), direkt als `envMap` gesampelt (keine PMREM-Prefilterung). Regeneriert alle 4 Frames und bei Phasenübergängen via `onPhaseTransition`.

| Funktion | Parameter | Bereich / Semantik | Rückgabe | Bereich |
|---|---|---|---|---|
| `initEnvMap(renderer)` | `renderer: WebGLRenderer` | Renderer für Equirectangular-Pass | `void` | — |
| `getUniformDefs()` | — | — | `{ envMap: { value } }` | Einzelne Env-Map-Uniform |
| `setEnvPreset(n)` | `n: int ∈ {0,2,3,4}` | 0=auto (phasengesteuert), 2=Metaball, 3=Cluster, 4=Burst; erzwingt Regenerierung | `void` | — |
| `applyStateToMaterial(material)` | `material: ShaderMaterial` | Liest Blend-Gewichte und Zeit direkt aus `phase.js`; regeneriert periodisch + bei `onPhaseTransition` | `void` | — |

---

### `src/camera.js`
Stationäre Beobachter-Kamera (stub). Gibt Startposition vor; `updateCamera` und `onInput` sind leer und werden befüllt, wenn Kameradynamik implementiert wird. Phasenwerte werden dann direkt aus `phase.js` importiert, nicht als Parameter übergeben.

| Funktion | Parameter | Bereich / Semantik | Rückgabe | Bereich |
|---|---|---|---|---|
| `initCamera(camera)` | `camera: PerspectiveCamera` | Setzt Startposition | `void` | — |
| `updateCamera(camera)` | `camera: PerspectiveCamera` | Stub | `void` | — |
| `onInput(type, data)` | `type: string ∈ {'presence','absence'}`, `data: { speed?: float ∈ [0,1] }` | Aufgerufen von `input.js`; stub | `void` | — |

---

### `src/input.js`
Systemkamera → Bewegungserkennung → FSM + Kamera.

| Funktion | Parameter | Bereich / Semantik | Rückgabe | Bereich |
|---|---|---|---|---|
| `initInput()` | — | Webcam-Stream + Detektor-Setup | `void` | — |
| `updateInput()` | — | Pro-Frame: Bewegungsanalyse → `reportMotion` / `cameraInput` | `void` | — |

Bewegungserkennung: Frame-Differencing auf 80×60 Offscreen-Canvas (`willReadFrequently`).
`speed = min(1, meanAbsDiff(R+G+B) / (n×765) × INPUT_SENSITIVITY)`

| Konstante | Semantik |
|---|---|
| `INPUT_SPEED_THRESHOLD` | Minimale normierte Geschwindigkeit |
| `INPUT_PERSIST_FRAMES` | Konsekutive Motion-Frames vor `reportMotion` |
| `INPUT_SENSITIVITY` | Skalierungsfaktor thresholded-diff → speed ∈ [0,1] |
| `INPUT_PIXEL_THRESHOLD` | Per-Pixel-Kanal-Diff darunter = Rauschen, ignoriert |

---

### `src/audio.js`
Phasengekoppelte Klangkulisse. ⚠️ Stub.

| Funktion | Parameter | Bereich / Semantik | Rückgabe | Bereich |
|---|---|---|---|---|
| `initAudio()` | — | — | `void` | — |
| `updateAudio()` | — | Stub; liest bei Implementierung Phasenwerte direkt aus `phase.js` | `void` | — |

Registriert sich bei `onPhaseTransition` für Klangwechsel an Schwellenwerten.

---

### `src/ui.js`
DOM-Event-Wiring für die Env-Preset-Buttons (`#env-ui` in `index.html`). Ruft `environment.setEnvPreset` direkt auf — keine Vermittlung durch `main.js`, analog zum `input.js` → `phase.js`-Muster.

| Funktion | Parameter | Bereich / Semantik | Rückgabe | Bereich |
|---|---|---|---|---|
| `initUI()` | — | Bindet Click-Handler an alle `#env-ui button`-Elemente; togglet `.active`-Klasse und ruft `setEnvPreset(Number(btn.dataset.preset))` | `void` | — |

---

### `src/constants.js`
Einzige Quelle für Konstanten, die in mehr als einer Datei benötigt werden — entweder zwei JS-Modulen, oder einem JS-Modul und einem GLSL-Chunk/Shader, der den Wert per Template-Interpolation in seinen Quelltext einsetzt (z. B. `` const int BALL_COUNT = ${BALL_COUNT}; ``). Konstanten, die nur an einer Stelle vorkommen, bleiben lokal in der jeweiligen Datei.

| Export | Typ | Verwendet von |
|---|---|---|
| `balls` | `Array<{r0,orbitRadius,orbitSpeed,orbitInclination}>` (length 12) | `simulation.js` (`buildInitData`), `tests/balls.test.js`; `r0 ∈ (0,∞)` Basisradius; Startwinkel wird per `Math.random()*2π` in `buildInitData` gesetzt |
| `BALL_COUNT` | `int` | `simulation.js`, `simulationChunk.js` |
| `STATE_TEX_W` | `int` (= `BALL_COUNT * 3`) | `simulation.js`, `simulationShader.js` (`TEX_W`), `raymarchShader.js` (`loadBalls`) |
| `ORBIT_Z_SQUASH` | `float` | `simulation.js` (`buildInitData`), `simulationChunk.js` (`orbitPoint`/`_orbitBasisE2`) |
| `FRAME_TIME_STEP` | `float` | `phase.js` (`tick`), `simulation.js` (`buildInitData`), `simulationChunk.js` (`applySimulation`) |
| `CLUSTER_BLEND_START`, `CLUSTER_BLEND_END`, `BURST_BLEND_START`, `BURST_BLEND_END` | `float` | `phase.js` (Shading-Blend), `simulationChunk.js` (Physik-Blend) — müssen identisch sein, damit beide Blends im Gleichschritt laufen |
| `glslFloat(n)` | `(number) => string` | Jede Stelle, die einen JS-Zahlenwert in einen GLSL-`float`-Kontext interpoliert. JS stringifiziert ganze Zahlen ohne Dezimalpunkt (`String(1.0) === '1'`), aber GLSL ES 1.00 verlangt einen Dezimalpunkt bei `float`-Literalen — `const float x = 1;` ist auf strikten Validatoren (z. B. ANGLE unter Windows) ein Typfehler und lässt das Shader-Programm nicht linken. Immer verwenden, nie den nackten JS-Wert interpolieren |

---

### `src/gpuSetup.js`
Fullscreen-Quad-Factory für GPU-Passes + Bloom-Pipeline-Factory. Kein öffentlicher State.

| Funktion | Parameter | Semantik | Rückgabe |
|---|---|---|---|
| `makeGpuSetup(material)` | `material: ShaderMaterial` | Erstellt `Scene` + `OrthographicCamera(-1,1,1,-1,0,1)` + `PlaneGeometry(2,2)` Mesh | `{ scene, camera }` |
| `makeBloomSetup(renderer, shaders)` | `renderer: WebGLRenderer`, `shaders: { brightExtractFrag, blurFrag, compositeFrag }` | 4 Render-Targets (main W×H, extract/blurA/blurB W/2×H/2) + 3 interne GPU-Passes; nutzt intern `makeGpuSetup` | `{ render(scene, camera, opts) }` |

`render(scene, camera, opts)`: rendert `scene → mainTarget`, führt brightExtract → blurH → blurV → composite aus. `opts.intensity: float` und `opts.threshold: float` werden jedes Frame übernommen.

---

### `src/renderer.js`
Szenen-Setup. Exportiert Objekte direkt; keine Initialisierungsfunktion.

| Export | Typ | Semantik |
|---|---|---|
| `scene` | `THREE.Scene` | Hauptszene |
| `camera` | `THREE.PerspectiveCamera` | Startkonfiguration in `renderer.js` |
| `renderer` | `THREE.WebGLRenderer` | antialias, Reinhard tone-mapping |
| ~~`controls`~~ | — | Entfernt — kein OrbitControls |

---

## GLSL-Chunks (`shaderChunks/`, interpoliert via Template-Literal)

Alle Chunks exportieren einen GLSL-String, der per `${…}` in den jeweiligen Shader interpoliert wird. Die Chunk-Funktionen haben Zugriff auf Uniforms und Hilfsfunktionen des umschließenden Shaders (gleicher Programm-Scope).

### `shaderChunks/vertexChunk.js`
Gemeinsamer Passthrough-Vertex-Shader. Exportiert: `vertexChunk: string`. Wird von allen drei Shader-Modulen als jeweiliger `*Vert`-Export verwendet — kein Duplikat mehr pro Shader-Datei.

---

### `shaderChunks/noiseChunk.js`
Rausch-Bibliothek. Von mehreren Shadern nutzbar. Exportiert: `noiseChunk: string`.

| GLSL-Funktion | Input | Bereich | Output | Bereich | Charakteristik |
|---|---|---|---|---|---|
| `perlin2D(p)` | `p: vec2` | ℝ²; Skalierung bestimmt Frequenz | `float` | [−1, 1], Mittelwert ≈ 0 | Glattes Gradienten-Rauschen; bandbegrenzt; stetig |
| `perlin3D(p)` | `p: vec3` | ℝ³; Skalierung bestimmt Frequenz | `float` | [−1, 1], Mittelwert ≈ 0 | Wie `perlin2D`, dritte Dimension für Oberflächenperturbation über Zeit |
| `worley2D(p)` | `p: vec2` | ℝ²; Einheitszellen-Koordinaten | `float` | [0, ~1.0] F1-Distanz | Zelluläres Muster; Minima an Feature-Points |
| `dualOctaveNoise(a, wa, b, wb)` | `a,b: vec2` (vorskaliert), `wa,wb: float` Gewichte | Gewichtete Summe zweier `perlin2D`-Samples; extrahiert aus der wiederkehrenden "zwei Oktaven kombinieren"-Form in `radiusMod()` und `_envBands()`/`main()` | `float` | Summe der gewichteten Samples | Aufrufer behalten ihre eigenen Frequenz-/Zeit-Konstanten inline; nur der Kombinationsschritt ist geteilt |

```glsl
float n = perlin2D(p.xy * 4.0 + time * 0.3);
float c = worley2D(p.xz * 2.0);
float d = dualOctaveNoise(p.xz * 1.8 + time * 0.02, 0.28, p.xy * 3.1 + time * 0.03, 0.10);
```

---

### `shaderChunks/moodChunk.js`
Zentraler Stimmungs-Provider: Farbpalette und Phasengewichte. Von `raymarchChunk` und `environmentShader` gemeinsam genutzt — stellt sicher, dass Shading und Umgebung dieselben Übergänge und Farben verwenden.
Deklariert eigene Uniforms — keine Voraussetzungen an den umschließenden Shader.

| GLSL-Export | Typ | Semantik |
|---|---|---|
| `MOOD_METABALL` | `const vec3` | Sehr helles Cyan-Blau |
| `MOOD_CLUSTER` | `const vec3` | Teal-Cyan |
| `MOOD_BURST` | `const vec3` | Kräftiges Orange-Rot |
| `metaballBlend, clusterBlend, burstBlend` | `uniform float` | Phasengewichte aus `phase.js`; immer Summe = 1; `clusterBlend` zusätzlich durch `_clusterActivation` (Exp.-Gate) gedämpft — verhindert teal-Flash beim Burst→Metaball-Übergang |
| `moodColor() → vec3` | `∈ [0,1]³` | Gewichteter Mix der drei Phasenfarben |

---

### `shaderChunks/raymarchChunk.js`
Shading-Modell (Nachimplementierung von `MeshPhysicalMaterial` für Raymarching). Nur von `raymarchShader.js` verwendet.
Voraussetzung: Uniforms `envMap` (sampler2D), `time` (float) deklariert; `map(vec3)`, `perlin2D`, `moodChunk` (und damit `clusterBlend`, `MOOD_*`, `moodColor()`) in Scope.

Benennung nach **Material**: `shadeMetal`/`shadeGlass` sind austauschbare Implementierungen; `shadeHit` enthält die Blending-Logik via `clusterBlend`.

| GLSL-Funktion | Input | Bereich / Semantik | Output | Bereich |
|---|---|---|---|---|
| `shadeHit(p, n, rd)` | `p: vec3`, `n: vec3` (norm.), `rd: vec3` (norm.) | Berechnet Perlin-Roughness aus `p`; Blend via `clusterBlend`: Metall↔Glas | `vec3` | [0, ∞) HDR |
| `shadeMetal(n, rd, NdotV, roughness)` | `n,rd: vec3`, `NdotV: float ∈ [0,1]`, `roughness: float ∈ [0,1]` | Cook-Torrance-BRDF + Env-Map-Sampling via Cone-Sampling (5 Taps, `_envSampleLod`, approximiert rauheitsabhängige Unschärfe ohne PMREM); Rim-Light | `vec3` | HDR |
| `shadeGlass(p, n, rd, NdotV)` | `p,n,rd: vec3`, `NdotV: float ∈ [0,1]` | map()-Materialdicken-Proxy für inneres Leuchten; Fresnel-Rim (pow(1−NdotV, 2.5)); Rückstreuung; Specular 192er; kein Env-Map-Sampling | `vec3` | HDR |

---

### `shaderChunks/simulationChunk.js`
Unified Physik-Blend. Alle drei Phasenmodi werden kontinuierlich per `visualPhase` gemischt — kein harter Umschalter. Tunable Kräfte/Decay-Raten sind als lokale `const float` (SCREAMING_SNAKE_CASE) am Funktionsanfang benannt, analog zur JS-seitigen Konstanten-Konvention.
Voraussetzung: Uniforms `stateTex`, `time`, `logicalPhase`, `visualPhase`, `motionSpeed` deklariert; `stateUV(int)` und `perlin2D` definiert.

| GLSL-Funktion | Input / Output | Semantik |
|---|---|---|
| `orbitPoint(orb, phi)` | `orb: vec4`, `phi: float` → `vec3` | 3D-Punkt auf Orbit-Ellipse bei Winkel phi |
| `reflectBounds(inout pos, inout vel)` | `pos,vel: vec3` | Reflektiert pos/vel an Sichtbarkeitsgrenzen; verhindert, dass Balls bei Burst dauerhaft aus dem Bild fliegen |
| `applySimulation(inout pos, inout vel, orb)` | `pos,vel: vec3`, `orb: vec4` | Leitet metaT/clusterT/burstT aus `visualPhase` ab; mischt direktes Orbit-Update (Metaball) mit vel-basierter Physik (Cluster/Burst); ruft `reflectBounds` am Ende auf |

**Blend-Architektur (Simulation vs. Shading):**

| | Shading (`phase.js` → Uniforms) | Simulation (`simulationChunk.js`) |
|---|---|---|
| Quelle | JS, einmal/Frame | GLSL, inline |
| Smoothstep-Bereiche | identisch | identisch |
| Gate | `× _clusterActivation` (JS, Exp.-Lerp) | keiner — gewollt für burst→metaball-Übergang |
| Consumer | `moodChunk`, `environmentShader`, `raymarchShader` | `applySimulation` |

---

## Shader-Module (`shaders/`)

### `shaders/simulationShader.js`
Sim-Pass-Shader. Intern von `simulation.js` verwendet. Interpoliert `simulationChunk`. Exportiert: `simulationVert`, `simulationFrag`.

| GLSL-Uniform | Typ | Bereich / Semantik |
|---|---|---|
| `stateTex` | `sampler2D` | RGBA32F 36×1 Eingangszustand |
| `logicalPhase` | `float` | [0, 2] `getLogicalPhase()` — nur noch für Burst-Intensität (`logicalPhase − 1.0`) |
| `visualPhase` | `float` | [0, 1.5] `getVisualPhase()` — steuert metaT/clusterT/burstT Physik-Blend |
| `time` | `float` | [0, ∞) für Orbit- und Noise-Animationen |
| `motionSpeed` | `float` | [0, 1] `getMotionSpeed()` — skaliert Orbit-Winkelgeschwindigkeit |

---

### `shaders/environmentShader.js`
Equirectangular-Umgebungsgenerator. Intern von `environment.js` verwendet. Interpoliert `noiseChunk` + `moodChunk`. Exportiert: `environmentVert`, `environmentFrag`.

| GLSL-Uniform | Typ | Bereich / Semantik |
|---|---|---|
| `time` | `float` | [0, ∞) Animation (Noise-Drift, Rotation) |
| `resolution` | `vec2` | Rendertarget-Größe |
| `envSelect` | `float` | 0=auto, 1=unbenutzt, 2=Metaball, 3=Cluster, 4=Burst — via `setEnvPreset()` |
| `metaballBlend, clusterBlend, burstBlend` | `float` | Via `moodChunk`; steuern Farbtemperatur, Direktivität, Kontrast |

Output: HDR RGB-Farbe der Himmelskugel an der UV-Position (Equirectangular-Mapping).

---

### `shaders/raymarchShader.js`
Haupt-Render-Pass. Interpoliert `noiseChunk` + `moodChunk` + `raymarchChunk`. Exportiert: `mainVert`, `mainFrag`.

| GLSL-Uniform | Typ | Bereich / Semantik |
|---|---|---|
| `stateTex` | `sampler2D` | Ball-Zustandstextur |
| `envMap` | `sampler2D` | Equirectangular Env-Map (direkt gesampelt, keine PMREM-Textur) |
| `visualPhase` | `float` | [0, 1.5] `getVisualPhase()` — Radius-Modulation |
| `metaballBlend, clusterBlend, burstBlend` | `float` | Via `moodChunk`; steuern Shading-Blend und smin-k |
| `time`, `camPos`, `resolution` | — | Globale Szenenparameter |

`main()`: `loadBalls()` → `raymarch()` → `shadeHit()`. Ball-Daten werden einmalig aus `stateTex` geladen; kein Texture-Read in Raymarch- oder Normal-Schleife.

---

### `shaders/bloomShader.js`
Bloom Post-Processing. Drei Fragment-Shader-Strings für den 3-Pass-Bloom-Filter; intern von `gpuSetup.makeBloomSetup` verwendet. Vertex-Shader kommt aus `vertexChunk`.

| Export | Uniforms | Semantik |
|---|---|---|
| `brightExtractFrag` | `mainTex: sampler2D`, `resolution: vec2`, `threshold: float` | Extrahiert Pixel oberhalb Luma-Schwellenwert: `color × max(luma − threshold, 0) / luma` |
| `blurFrag` | `blurTex: sampler2D`, `resolution: vec2`, `blurDir: vec2` | Separabler 9-Tap-Gauß; `blurDir = (1,0)` für H-Pass, `(0,1)` für V-Pass |
| `compositeFrag` | `mainTex: sampler2D`, `bloomTex: sampler2D`, `resolution: vec2`, `intensity: float` | Additiv: `main + bloom × intensity`; bloomTex wird bilinear von W/2×H/2 auf W×H hochskaliert |
