# Module Interfaces — T-1003

Public API jedes Moduls. Notation: `param: Type ∈ [min, max]`; Interna bleiben gekapselt.
GLSL-Module sind Chunks (Template-Literal-Interpolation in JS), keine eigenständigen Shader-Programme.

---

## JavaScript-Module

### `src/phase.js`
Kontinuierliches Gauß-Gewichtssystem. Einzige autoritative Quelle für Phasengewichte. Intern führt ein diskreter Zeiger `_state` (`S_CLUSTER`/`S_BURST`/`S_METABALL`) Buch — gelesen/geschrieben ausschließlich innerhalb der privaten `_scheduleTick`, nirgends exponiert.

| Funktion | Parameter | Bereich / Semantik | Rückgabe | Bereich |
|---|---|---|---|---|
| `tick(t_now)` | `t_now: float` (Sekunden, z. B. `performance.now()/1000`) | Aktualisiert Bumps + Gewichte, feuert ggf. `onPhaseTransition`, dekrementiert `_motionSpeed` | `void` | — |
| `getTime()` | — | — | `float` | [0, ∞) monoton, frame-getaktet — für Shader-Animationen; unabhängig von `t_now` |
| `getWeights()` | — | — | `{ clusterWeight, metaballWeight, burstWeight }` | je [0,1], Summe = 1 — einziger Phasenidentitäts-Output |
| `getMotionSpeed()` | — | — | `float` | [0,1] Rohe Bewegungsenergie aus Frame-Differencing (`reportMotionEnergy`), unabhängig von Gaze; exponentiell abklingend (×0.97/Tick) ohne gemeldete Energie |
| `reportGazeDetected()` | — | Von `input.js` (face-api.js): setzt intern `_gazeThisFrame = true` — von `tick()` als Auslöser für Cluster→Burst und Metaball-Hold ausgelesen und zurückgesetzt | `void` | — |
| `reportMotionEnergy(speed)` | `speed: float ∈ [0,1]` | Von `input.js` (Frame-Differencing): setzt `_motionSpeed = speed`, unabhängig vom Gaze-Signal — treibt ausschließlich `getMotionSpeed()` | `void` | — |
| `onPhaseTransition(fn)` | `fn: (name: 'cluster'\|'metaball'\|'burst') → void` | Feuert bei jedem Regime-Wechsel mit dem Namen der Zielphase; einziger Kanal, über den `phase.js` Konsumenten erreicht, ohne selbst welche zu importieren | `void` | — |

Bump-Konstanten (`LEAD`, `CLUSTER_SIGMA`/`METABALL_SIGMA`/`BURST_SIGMA`, `BURST_HOLD`, `METABALL_MIN_HOLD`/`SILENCE_HOLD`, `METABALL_HANDOFF_LEAD`) stehen am Kopf der Datei, erklärt — siehe `requirements.md` → Phasensystem für die Bump-Mathematik und die Handoff-Mechanik (Burst→Metaball aktiviert mit kleinerem Lead als sonst, für mehr Überlappung ohne Bursts Haltedauer zu verändern). `BURST_HOLD` ist fix, nicht mit `motionSpeed` skaliert.

---

### `src/simulation.js`
GPU-Physiksimulation. Verwaltet 1D-Zustandstextur (RGBA32F, 36×1) und Ping-Pong-RenderTargets. Die eigentliche Physik-Logik liegt in `simulationShader.js`.

| Funktion | Parameter | Bereich / Semantik | Rückgabe | Bereich |
|---|---|---|---|---|
| `initializeSimulation(renderer)` | `renderer: WebGLRenderer` | Wird intern für Sim-Pass-Render-Calls gespeichert | `void` | — |
| `stepSimulation()` | — | Liest `getWeights()`, `time`, `motionSpeed` direkt aus `phase.js`; setzt `clusterBlend`/`metaballBlend`/`burstBlend` (identisch zu den Shading-Uniforms) und `motionSpeed` auf dem Sim-Material | `void` | — |
| `getUniformDefs()` | — | — | `{ stateTex: { value } }` | Uniform-Objekt für ShaderMaterial |
| `applyStateToMaterial(material)` | `material: ShaderMaterial` | Setzt `stateTex` auf aktuelle Lesertextur | `void` | — |

Aufrufsequenz pro Frame: `stepSimulation` → `applyStateToMaterial` → Haupt-Render.

---

### `src/environment.js`
Equirectangular-Env-Map-Generierung: `environmentShader.js` blendet zwei **geladene** HDRI-Dateien (`resources/*.hdr`, via `THREE.RGBELoader` aus `three/addons/loaders/RGBELoader.js`) gewichtet nach Phase zu einer Textur, direkt als `envMap` gesampelt (keine PMREM-Prefilterung). Regeneriert jeden Frame, ungedrosselt.

| Export | Typ / Parameter | Bereich / Semantik | Rückgabe |
|---|---|---|---|
| `ENV_MAP_FILES` | `string[]` | Alle in `resources/` verfügbaren Dateinamen — händisch gepflegt (kein Verzeichnis-Listing zur Laufzeit möglich); Quelle für beide UI-Picker (`src/ui.js`) | — |
| `CLUSTER_ENV_MAP_DEFAULT` | `string` | Default-Dateiname für die Cluster-Rolle | — |
| `METABALL_ENV_MAP_DEFAULT` | `string` | Default-Dateiname für die geteilte Metaball/Burst-Rolle | — |
| `initializeEnvMap(renderer, clusterFilename?, metaballFilename?)` | `renderer: WebGLRenderer`, Dateinamen (Default: die beiden Konstanten oben) | Baut Render-Target + internes Env-Material, lädt beide Start-Dateien | `void` |
| `setClusterEnvMapFile(filename)` | `filename: string` (aus `ENV_MAP_FILES`) | Lädt eine andere Datei in die `clusterSourceMap`-Uniform nach; setzt `texture.flipY = true` (siehe unten) | `void` |
| `setMetaballEnvMapFile(filename)` | `filename: string` (aus `ENV_MAP_FILES`) | Wie oben, für `metaballSourceMap` (von Metaball **und** Burst geteilt) | `void` |
| `getUniformDefs()` | — | — | `{ envMap: { value } }` | Einzelne Env-Map-Uniform (nur diese wird an das Haupt-Material gereicht) |
| `applyStateToMaterial(material)` | `material: ShaderMaterial` | Liest `getWeights()` + Zeit direkt aus `phase.js`, setzt sie unverändert als Blend-Uniforms; regeneriert jeden Frame | `void` |

**`flipY`-Gotcha:** `THREE.RGBELoader` liefert eine `DataTexture`, die (anders als eine gewöhnliche, aus einem Bild geladene `Texture`) standardmäßig `flipY = false` hat. Die Equirectangular-UV-Konvention in `colorChunk.js` erwartet aber die `flipY = true`-Orientierung — beide Setter-Funktionen setzen `flipY` deshalb explizit nach dem Laden, sonst erscheint die Himmelskugel vertikal gespiegelt.

Es gibt aktuell **keine** Isolation zwischen den beiden Quelltexturen während einer Phasen-Überblendung: beide werden gewichtet in dieselbe `envMap`-Textur gemischt (siehe `colorChunk.js` → `blendEnvironment`), sampelt eine Phase während einer echten Überblendung also unvermeidlich auch einen Rest der anderen Quelle.

---

### `src/camera.js`
Stationäre Beobachter-Kamera (stub). Gibt Startposition vor; `updateCamera` und `onInput` sind leer und werden befüllt, wenn Kameradynamik implementiert wird. Phasenwerte werden dann direkt aus `phase.js` importiert, nicht als Parameter übergeben.

| Funktion | Parameter | Bereich / Semantik | Rückgabe | Bereich |
|---|---|---|---|---|
| `initializeCamera(camera)` | `camera: PerspectiveCamera` | Setzt Startposition | `void` | — |
| `updateCamera(camera)` | `camera: PerspectiveCamera` | Stub | `void` | — |
| `onInput(type, data)` | `type: string ∈ {'presence','absence'}`, `data: { speed?: float ∈ [0,1] }` | Aufgerufen von `input.js`; stub | `void` | — |

---

### `src/input.js`
Systemkamera → zwei unabhängige Signale → `phase.js` + Kamera: rohe Bewegungsenergie (Frame-Differencing) und Blickerkennung (face-api.js).

| Funktion | Parameter | Bereich / Semantik | Rückgabe | Bereich |
|---|---|---|---|---|
| `initializeInput()` | — | Webcam-Stream öffnen; face-api.js-Modelle (`tinyFaceDetector`, `faceLandmark68TinyNet`) asynchron aus `resources/` laden | `void` | — |
| `updateInput()` | — | Pro-Frame: Frame-Differencing → `reportMotionEnergy`; gedrosselt face-api.js-Erkennung → `reportGazeDetected` / `cameraInput('presence'\|'absence', {})` | `void` | — |

**Bewegungsenergie** (unverändert ggü. der ursprünglichen Implementierung, treibt aber keine Phasenauslösung mehr): Frame-Differencing auf 80×60 Offscreen-Canvas (`willReadFrequently`).
`speed = min(1, meanAbsDiff(R+G+B) / (n×765) × ENERGY_SENSITIVITY)` — ungedrosselt jeden Frame an `reportMotionEnergy` gemeldet (kein Schwellwert/Persist-Gate mehr, da kein Trigger-Boolean mehr dahinter hängt).

| Konstante | Semantik |
|---|---|
| `ENERGY_SENSITIVITY` | Skalierungsfaktor thresholded-diff → speed ∈ [0,1] |
| `ENERGY_PIXEL_THRESHOLD` | Per-Pixel-Kanal-Diff darunter = Rauschen, ignoriert |

**Blickerkennung** (face-api.js, `TinyFaceDetectorOptions` + `withFaceLandmarks(true)`, gedrosselt auf `_video`, keine Offscreen-Canvas-Kopie nötig): Ein erkanntes Gesicht gilt als „blickend", wenn beide Tests zutreffen:
- **zentriert**: Bounding-Box-Zentrum liegt (nach horizontaler Spiegelung) innerhalb von `GAZE_CENTER_FRACTION` um die Bildmitte
- **frontal**: `|noseX − eyeMidX| / interEyeDist < GAZE_FRONTAL_THRESHOLD` — Näherung an „Kopf zeigt zur Kamera", da die Tiny-Landmarks keinen Iris-/Gaze-Vektor liefern

Persistenz: `GAZE_PERSIST_CYCLES` aufeinanderfolgende „blickend"-Detektionszyklen (nicht Frames — ein Zyklus ist ein tatsächlicher, gedrosselter face-api.js-Aufruf) schalten das Signal an; ein einzelner nicht-blickender Zyklus schaltet sofort wieder ab (keine Debounce beim Verlust). Die Detektion selbst ist async (Promise); das Ergebnis eines Zyklus wird erst im nächsten `updateInput()`-Aufruf nach Abschluss wirksam (ein Frame Latenz), nicht noch im selben Aufruf.

| Konstante | Semantik |
|---|---|
| `FACE_MODEL_URL` | Basis-URL für `loadFromUri` — lokal (`./resources`) |
| `FACE_DETECT_INPUT_SIZE`, `FACE_DETECT_SCORE_THRESHOLD` | `TinyFaceDetectorOptions`-Parameter |
| `GAZE_DETECT_INTERVAL_FRAMES` | Drosselung: face-api.js läuft nur alle N `updateInput()`-Aufrufe (Kosten deutlich höher als Frame-Differencing) |
| `GAZE_PERSIST_CYCLES` | Siehe oben |
| `GAZE_CENTER_FRACTION`, `GAZE_FRONTAL_THRESHOLD` | Siehe oben |

---

### `src/audio.js`
Phasengekoppelte Klangkulisse (Web Audio API). Pollt `getWeights()`/`getMotionSpeed()` aus `phase.js` wie jedes andere Modul; abonniert zusätzlich `onPhaseTransition` für den Burst-Einsatz — das einzige Modul, das diesen Listener tatsächlich nutzt.

| Funktion | Parameter | Bereich / Semantik | Rückgabe | Bereich |
|---|---|---|---|---|
| `initializeAudio()` | — | Baut den Audio-Graph (`AudioContext` → `masterGain` → Destination; Drone-Oszillator → `droneGain` → `masterGain`); registriert `onPhaseTransition`-Listener | `void` | — |
| `updateAudio()` | — | Pro Frame: blendet Ziel-Frequenz (`_blendFrequency`) und Puls-Oktavversatz (`_blendPulse`) aus den drei Phasengewichten, glättet beide über `setTargetAtTime` auf den Drone-Oszillator | `void` | — |

**Drone** (Dauerton, ein `OscillatorNode` `DRONE_OSCILLATOR_TYPE='triangle'`): Zielfrequenz ist ein 3-Wege-Gewichtsblend aus `F_CLUSTER` (fix) und `F_METABALL_BASE`/`F_BURST_BASE` (beide zusätzlich oktavskaliert mit `motionSpeed`, exponentiell statt linear — Tonhöhenwahrnehmung ist logarithmisch). Darüber legt sich ein zweiter, additiver Oktavversatz (`_blendPulse`) — eine langsame Sinusmodulation, die als „Atmen"/„Pulsieren" hörbar wird: eigene Rate/Tiefe für Cluster (`BREATH_RATE_CLUSTER`, `BREATH_DEPTH_CLUSTER_OCTAVES`) und Metaball (`BREATH_RATE_METABALL`, `BREATH_DEPTH_METABALL_OCTAVES`), keine für Burst (zu kurz, dominiert ohnehin vom Ping). Als Zeitbasis dient `_ctx.currentTime` (echte Sekunden), nicht `phase.js`s `getTime()` — Letzteres ist ein frame-getakteter Akkumulator (`FRAME_TIME_STEP` pro Tick, nicht Sekunden) und macht die `BREATH_RATE_*`-Konstanten sonst framerate-abhängig und faktisch zu langsam.

**Burst-Ping** (`_triggerBurstSound`, privat, nur vom `onPhaseTransition`-Listener aufgerufen): Ein zweiter, kurzlebiger `OscillatorNode` mit eigener Gain-Hüllkurve (linearer Attack, exponentieller Decay) und einem abfallenden Frequenz-Sweep (`BURST_PING_FREQUENCY` → `BURST_PING_FREQUENCY_END`) für einen scharfen „Schreck"-Charakter statt eines flachen Klicks.

`phase.js` kennt `audio.js` nicht — die Kopplung läuft ausschließlich über den bereits bestehenden `onPhaseTransition(fn)`-Listener, `fn` erhält seit dieser Implementierung den Namen der jeweiligen Zielphase (`'cluster'`/`'metaball'`/`'burst'`) als Argument (vorher argumentlos).

---

### `src/ui.js`
Manuelle Override-UI, dauerhaft — nicht temporär. Baut ein gemeinsames, lazy erzeugtes Panel-Element (`position: fixed; top/right`) mit einer kollabierbaren Sektion pro Picker. Die Shape-Sektion läuft **neben** der automatischen Zufallsauswahl (`phase.js`s `getShapeVariant()`, siehe dort) her, nicht als Ersatz dafür; die beiden Env-Map-Sektionen sind bewusst die einzige Auswahlmöglichkeit für ihre Dateien — keine automatische Zufallsauswahl vorgesehen.

| Funktion | Parameter | Bereich / Semantik | Rückgabe |
|---|---|---|---|
| `initializeClusterShapeUI(variants, onSelect)` | `variants: string[]` (aus `constants.js`s `CLUSTER_SHAPE_VARIANTS_EXPERIMENTAL`, alle neun inkl. Intersect), `onSelect: (name: string) => void` | Sektion "SHAPES"; Klick ruft `onSelect(name)` | `{ select(value) }` |
| `initializeClusterEnvMapUI(files, current, onSelect)` | `files: string[]` (aus `environment.js`s `ENV_MAP_FILES`), `current: string` (initial hervorgehoben), `onSelect: (filename: string) => void` | Sektion "CLUSTER ENVIRONMENT" | `{ select(value) }` |
| `initializeMetaballEnvMapUI(files, current, onSelect)` | Wie oben | Sektion "METABALL ENVIRONMENT" | `{ select(value) }` |

Intern teilen sich alle drei Funktionen einen generischen `_makeCollapsibleSection(title, items, current, onSelect)`-Helfer (Header-Button togglet eine versteckte Optionsliste); `items: Array<{value, label}>` — `label` ist die Anzeige (z. B. Dateiname ohne Endung, oder der Shape-Name ohne `cluster`-Präfix und mit eingefügten Leerzeichen), `value` das, was an `onSelect` durchgereicht wird. Die zurückgegebene `select(value)`-Funktion aktualisiert nur die Hervorhebung (ohne erneut `onSelect` zu feuern) — `main.js` nutzt sie, um die UI nach einer automatischen Shape-Auswahl visuell nachzuziehen.

`main.js` reicht die Shape-Auswahl über `_getShapeSource(variant)` (gecachte bzw. live gebaute Shader-Quelle, siehe `main.js`) + `material.fragmentShader`/`needsUpdate = true` durch; die beiden Env-Map-Picker rufen direkt `setClusterEnvMapFile`/`setMetaballEnvMapFile` aus `environment.js` auf.

---

### `src/constants.js`
Einzige Quelle für Konstanten, die in mehr als einer Datei benötigt werden — entweder zwei JS-Modulen, oder einem JS-Modul und einem GLSL-Chunk/Shader, der den Wert per Template-Interpolation in seinen Quelltext einsetzt (z. B. `` const int BALL_COUNT = ${BALL_COUNT}; ``). Konstanten, die nur an einer Stelle vorkommen, bleiben lokal in der jeweiligen Datei.

| Export | Typ | Verwendet von |
|---|---|---|
| `balls` | `Array<{r0,orbitRadius,orbitSpeed,orbitInclination}>` (length 12) | `simulation.js` (`buildInitData`), `tests/balls.test.js`; `r0 ∈ (0,∞)` Basisradius; Startwinkel wird per `Math.random()*2π` in `buildInitData` gesetzt |
| `BALL_COUNT` | `int` | `simulation.js`, `positionChunk.js` |
| `STATE_TEX_W` | `int` (= `BALL_COUNT * 3`) | `simulation.js`, `simulationShader.js` (`TEX_W`), `raymarchShader.js` (`loadBalls`) |
| `ORBIT_Z_SQUASH` | `float` | `simulation.js` (`buildInitData`), `positionChunk.js` (`orbitPoint`/`_orbitBasisE2`) |
| `FRAME_TIME_STEP` | `float` | `phase.js` (`getTime`-Uhr, unabhängig von `tick(t_now)`), `simulation.js` (`buildInitData`), `positionChunk.js` (`blendPosition`) |
| `CLUSTER_CYL_RADIUS`, `CLUSTER_CYL_HALF_HEIGHT`, `CLUSTER_CYL_CENTER_X`/`_Y`, `_ROTATION_X`/`_Y` | `float` | `shapeChunk.js` (`_clusterCylinder`; `_CENTER_X`/`_Y` zusätzlich für das geteilte `CLUSTER_CENTER`, um das alle neun Shape-Varianten zentriert sind) |
| `CLUSTER_SPHERE_RADIUS` | `float` | `shapeChunk.js` (`_clusterSphere`) |
| `CLUSTER_BOX_HALF_EXTENT`, `CLUSTER_BOX_ROTATION_X`/`_Y` | `float` | `shapeChunk.js` (`_clusterBox`) |
| `CLUSTER_TORUS_RING_RADIUS`, `CLUSTER_TORUS_TUBE_RADIUS`, `CLUSTER_TORUS_ROTATION_X`/`_Y` | `float` | `shapeChunk.js` (`_clusterTorus`) |
| `CLUSTER_CAPSULE_HALF_LENGTH`, `CLUSTER_CAPSULE_RADIUS`, `CLUSTER_CAPSULE_ROTATION_X`/`_Y` | `float` | `shapeChunk.js` (`_clusterCapsule`) |
| `CLUSTER_PYRAMID_SCALE`, `CLUSTER_PYRAMID_HEIGHT`, `CLUSTER_PYRAMID_ROTATION_X`/`_Y` | `float` | `shapeChunk.js` (`_clusterPyramid`) — `SCALE`/`HEIGHT` statt eines einzelnen Radius, da die zugrundeliegende `_sdPyramid`-Formel Basis-Halbextent fix bei 0.5 hält und stattdessen uniform skaliert wird |
| `glslFloat(n)` | `(number) => string` | Jede Stelle, die einen JS-Zahlenwert in einen GLSL-`float`-Kontext interpoliert. JS stringifiziert ganze Zahlen ohne Dezimalpunkt (`String(1.0) === '1'`), aber GLSL ES 1.00 verlangt einen Dezimalpunkt bei `float`-Literalen — `const float x = 1;` ist auf strikten Validatoren (z. B. ANGLE unter Windows) ein Typfehler und lässt das Shader-Programm nicht linken. Immer verwenden, nie den nackten JS-Wert interpolieren |

Alle Farbkonstanten (früher `MOOD_METABALL`/`MOOD_CLUSTER`/`MOOD_BURST`/`MOOD_RIM` + der `glslVec3`-Helfer) sind entfernt — Metaball/Burst verwenden ein festes, ungefärbtes `METAL_F0` direkt in `surfaceChunk.js`, Cluster nur noch einen sehr dunklen `GLASS_TINT_COLOR` als Absorptions-Bodenfarbe; alle Himmel-/Reflexionsfarbe kommt aus den geladenen HDRI-Dateien (siehe `src/environment.js`).

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
| `dualOctaveNoise(a, wa, b, wb)` | `a,b: vec2` (vorskaliert), `wa,wb: float` Gewichte | Gewichtete Summe zweier `perlin2D`-Samples; extrahiert aus der wiederkehrenden "zwei Oktaven kombinieren"-Form in `radiusMod()` und `environmentShader.js`s `main()` | `float` | Summe der gewichteten Samples | Aufrufer behalten ihre eigenen Frequenz-/Zeit-Konstanten inline; nur der Kombinationsschritt ist geteilt |

```glsl
float n = perlin2D(p.xy * 4.0 + time * 0.3);
float c = worley2D(p.xz * 2.0);
float d = dualOctaveNoise(p.xz * 1.8 + time * 0.02, 0.28, p.xy * 3.1 + time * 0.03, 0.10);
```

---

### `shaderChunks/colorChunk.js`
Himmelsfarbe aus zwei **geladenen** HDRI-Texturen (`clusterSourceMap`/`metaballSourceMap`, von `src/environment.js` befüllt) — keine Farbkonstanten, keine Ball-Oberflächenfarbe mehr in diesem Chunk (die Surface-Shading-Funktionen in `surfaceChunk.js` lesen direkt `envMap`, nicht diesen Chunk). Deklariert eigene Uniforms (`metaballBlend`/`clusterBlend`/`burstBlend`). Voraussetzung: keine (die vormals genutzten `worley2D`/`dualOctaveNoise` aus `noiseChunk` werden aktuell nicht mehr aufgerufen, siehe unten).

| GLSL-Export | Typ | Semantik |
|---|---|---|
| `metaballBlend, clusterBlend, burstBlend` | `uniform float` | Phasengewichte aus `phase.js`; immer Summe = 1 |
| `_dirToUV(dir)` / `_sampleEquirect(dir, sourceMap)` | `vec2` / `vec3` | Gemeinsamer Equirectangular-Sampling-Helfer — alle drei `_<phase>Environment`-Funktionen delegieren hierher |
| `_clusterEnvironment(dir, sourceMap) → vec3` | HDR | `_sampleEquirect(dir, sourceMap) * CLUSTER_ENV_EXPOSURE` |
| `_metaballEnvironment(rDir, sourceMap) → vec3` | HDR | `_sampleEquirect(rDir, sourceMap) * METABALL_ENV_EXPOSURE` |
| `_burstEnvironment(rDir, sourceMap) → vec3` | HDR | Identisch zu `_metaballEnvironment` (beide lesen dieselbe Konstante) |
| `blendEnvironment(uv, clusterSourceMap, metaballSourceMap) → vec3` | HDR | Nimmt die rohe Equirect-UV entgegen, berechnet Richtung/Sky-Rotation intern (`_uvToDir`) und liefert den immer-an 3-Wege-Blend: `_clusterEnvironment(rDir, clusterSourceMap)·clusterBlend + _metaballEnvironment(rDir, metaballSourceMap)·metaballBlend + _burstEnvironment(rDir, metaballSourceMap)·burstBlend`; `environmentShader.js`s `main()` reduziert sich dadurch auf `uv` berechnen + diesen einen Aufruf |

`CLUSTER_ENV_EXPOSURE`/`METABALL_ENV_EXPOSURE` sind reine Belichtungs-Korrekturen, da die geladenen Referenzdateien dunkler wirkten als gewünscht — keine kreative Tönung, nur ein Helligkeits-Ausgleich pro Datei. Die frühere prozedurale Ambient-Schicht (`_worleyContrast`/`_envKeyLight`, Worley-Speckle + rotierendes Key-Light, plus ein additiver `blendColor()`-Tint) ist vollständig entfernt, nicht nur deaktiviert — `blendEnvironment` ist jetzt ausschließlich die gewichtete Summe der drei HDRI-Samples, ohne jede zusätzliche prozedurale Schicht.

---

### `shaderChunks/shapeChunk.js`
SDF-Komposition **und** deren Auswertung (Normale, Raymarch-Loop) — nicht nur `map()`, damit `raymarchShader.js` selbst auf reine Plumbing/Kamera-Logik reduziert bleibt. Nur von `raymarchShader.js` verwendet. Voraussetzung: Globals `gC0..gC11`/`gRad0..gRad11` (von `loadBalls()` in `raymarchShader.js` befüllt — `gRad_i` ist der bereits in `positionChunk.js` modulierte Radius, direkt aus der Zustandstextur gelesen, hier nicht neu berechnet); Uniforms `time`, `clusterBlend`/`metaballBlend`/`burstBlend` (`colorChunk`); `perlin3D` (`noiseChunk`).

**Export ist eine Funktion, nicht ein fester String:** `shapeChunk(clusterVariant = 'clusterCylinderIntersect') → string`. `clusterVariant` (einer der neun Namen aus `CLUSTER_SHAPE_VARIANTS`, ebenfalls exportiert) entscheidet **beim JS-Aufruf**, auf welche der neun expliziten Kombinations-Funktionen `_clusterShape(p)` aliast — ein String, der in den generierten GLSL-Quelltext eingesetzt wird, kein Laufzeit-Branch im Shader. `raymarchShader.js`s `buildMainFrag(clusterVariant)` reicht den Parameter durch.

| GLSL-Funktion | Input | Semantik | Output |
|---|---|---|---|
| `blendShape(p)` | `p: vec3` | `clusterBlend·_clusterShape(p) + metaballBlend·_metaballShape(p) + burstBlend·_burstShape(p)` — zeitliche Überblendung, keine räumliche Vereinigung (siehe `requirements.md` → SDF-Komposition über Phasen) | `float` |
| `_clusterShape(p)` | `p: vec3` | Einzeiler-Alias auf genau eine der neun `cluster<Shape>{Full,Intersect}`-Funktionen (siehe unten) | `float` |
| `_metaballShape(p)` | `p: vec3` | `_noisyBallUnion(p, SMIN_K=0.35)` — `_ballUnion` (smin über 12 Bälle) + eigenes `perlin3D`-Oberflächenrauschen | `float` |
| `_burstShape(p)` | `p: vec3` | Wie `_metaballShape`, aber `SMIN_K=0.10` (enger fusioniert → liest sich "explodiert") | `float` |
| `normal(p)` | `p: vec3` | Zentrale finite Differenzen auf `blendShape()` | `vec3` |
| `raymarch(ro, rd)` | `ro,rd: vec3` | Sphere-Tracing über `blendShape()`; `stepSafety`-Faktor (aus `clusterBlend·(metaballBlend+burstBlend)`) dämpft die Schrittweite während einer echten Cross-Phase-Überblendung, kostet in eingeschwungenen Zuständen aber nichts | `float` (Distanz, `-1.0` bei Miss) |

**Primitive** (`sd`-Präfix, `_`-präfixiert wie alle internen Helfer): `_sdSphere(p,r)`, `_sdBox(p,b)`, `_sdCappedCylinder(p,r,h)`, `_sdTorus(p,t)`, `_sdCapsule(p,a,b,r)`, `_sdPyramid(p,h)` — reine, cluster-unabhängige Distanzfunktionen. `_sdSphere` wird zusätzlich von `_foldBall`/`_ballUnion` für die 12 Metaball-Kugeln benutzt (der Aufrufer übersetzt `p` selbst per `p - center`, keine separate Center-Parameter-Variante mehr). `_sdPyramid` ist **nicht** die kanonische iq-Formel (Diagonal-Faltung), sondern eine Schnittmenge (`max`) aus zwei gefalteten Seitenflächen-Ebenen + einer Bodenebene — die kanonische Formel erzeugte eine sichtbare Knick-Naht entlang der Bodendiagonalen (stetiger Abstandswert, aber unstetiger Gradient), die Ebenen-Variante ist auf jeder Fläche exakt flach. `smin` (nicht `_`-präfixiert, geteilter mathematischer Grundbaustein) fusioniert die 12 Metaball-Kugeln.

**Cluster-Shape-Varianten** (siehe `requirements.md` → Cluster-Shape-Varianten für die volle Herleitung):

| GLSL-Funktion | Semantik |
|---|---|
| `_rotateYX(p, ry, rx)` | Gemeinsamer Rotations-Helfer (zwei sequenzielle `mat2`-Rotationen), von allen fünf rotierten Cluster-Formen (Zylinder, Box, Torus, Kapsel, Pyramide) verwendet statt dupliziert |
| `_clusterCylinder`/`_clusterSphere`/`_clusterBox`/`_clusterTorus`/`_clusterCapsule`/`_clusterPyramid(p)` | Jeweils die reine Form in ihrer **festen** Zielgröße (siehe `constants.js`-Tabelle) — nie in der Größe interpoliert |
| `_clusterIntersect(shapeD, p)` | Nur für Zylinder/Kugel/Box: `mix(ballD, max(shapeD, ballD), 1-metaballBlend)` — blendet die **Schnittmenge** mit der Ballunion ein, nicht die Form-Größe; bei `metaballBlend≈1` identisch zu `_metaballShape` |
| `clusterCylinderFull`/`clusterSphereFull`/`clusterBoxFull`/`clusterTorusFull`/`clusterCapsuleFull`/`clusterPyramidFull(p)` | `= _cluster<Shape>(p)` — kein Ballbezug, blendet allein über `clusterBlend` in `blendShape()` |
| `clusterCylinderIntersect`/`clusterSphereIntersect`/`clusterBoxIntersect(p)` | `= _clusterIntersect(_cluster<Shape>(p), p)` — nur für diese drei Formen implementiert |

`radiusMod`/`loadRadii` leben **nicht** hier — die rauschmodulierten Radien werden im Sim-Pass berechnet und über die Zustandstextur transportiert (siehe `positionChunk.js` und die Uniform-Tabelle unter `raymarchShader.js`).

---

### `shaderChunks/surfaceChunk.js`
Material-/Lichtantwort (Nachimplementierung von `MeshPhysicalMaterial` für Raymarching) — wie sich Metall/Glas unter Licht + Env-Map verhalten, nicht *welche* Farbe/Form etwas hat. Keine Farbkonstanten mehr (weder eigene noch aus `colorChunk.js` importiert) — alle Farbe kommt aus der gesampelten `envMap`. Nur von `raymarchShader.js` verwendet.
Voraussetzung: Uniform `envMap` (sampler2D); `_clusterShape(vec3)`/`normal(vec3)` (`shapeChunk`) und `clusterBlend`|`metaballBlend`|`burstBlend` (`colorChunk`) in Scope.

Benennung nach **Phase**: `_metaballShading`/`_clusterShading`/`_burstShading` sind austauschbare Implementierungen, je eine pro Phase; `blendShading` mischt alle drei gewichtet nach `metaballBlend`/`clusterBlend`/`burstBlend` (immer 3-Wege, keine Early-Outs). Metaball und Burst sind inzwischen **identisch** — beide delegieren direkt an `_shadeReflective`, ohne Tint-Unterscheidung. Cluster hat eine komplett eigenständige Glas-Implementierung.

| GLSL-Funktion | Input | Bereich / Semantik | Output | Bereich |
|---|---|---|---|---|
| `blendShading(p, n, rd)` | `p: vec3`, `n: vec3` (norm.), `rd: vec3` (norm.) | 3-Wege-Blend: `_metaballShading·metaballBlend + _clusterShading·clusterBlend + _burstShading·burstBlend` | `vec3` | [0, ∞) HDR |
| `_metaballShading(n, rd, NdotV)` | `n,rd: vec3`, `NdotV: float ∈ [0,1]` | `= _shadeReflective(n, rd, NdotV)` | `vec3` | HDR |
| `_burstShading(n, rd, NdotV)` | `n,rd: vec3`, `NdotV: float ∈ [0,1]` | `= _shadeReflective(n, rd, NdotV)` — identisch zu `_metaballShading` | `vec3` | HDR |
| `_clusterShading(p, n, rd, NdotV)` | `p,n,rd: vec3`, `NdotV: float ∈ [0,1]` | Verwendet durchgehend das übergebene, geblendete `n`/`NdotV` (genau wie `_metaballShading`/`_burstShading`) — mischt Fresnel-gewichtet (`_fresnelFactor`, `GLASS_FRESNEL_POWER`) eine reine Spiegelreflexion mit `_clusterRefractedColor(p, n, rd)` | `vec3` | HDR |

**Reflektive Helfer** (`_shadeReflective(n, rd, NdotV)`, kein Tint-Parameter mehr): Cook-Torrance-BRDF gegen ein festes, ungefärbtes `METAL_F0 = vec3(0.95)` (statt eines Phasen-Tints) + Env-Map-Sampling via Cone-Sampling (5 Taps, `_envSampleLod`, approximiert rauheitsabhängige Unschärfe ohne PMREM, Spread `ENV_CONE_SPREAD`) gewichtet mit `_fresnelSchlickRoughness(METAL_F0, NdotV, SURFACE_ROUGHNESS)`; `SURFACE_ROUGHNESS = 0.05` (nahezu Spiegel) ist eine einzelne, geteilte Konstante. Kein Rim-Light-Term mehr — ersatzlos entfernt.

**Glas-Helfer** (`GLASS_IOR`, `GLASS_ABSORPTION`, `GLASS_TRACE_STEPS`/`_EPSILON`/`_MAX_DIST`, `GLASS_TINT_COLOR`, `GLASS_FRESNEL_POWER`; `struct GlassExit { vec3 pos; vec3 normal; float dist; }`):
- `_clusterTraceInterior(p, rd)` — kurzer (`GLASS_TRACE_STEPS`) Sphere-Trace durch `_clusterShape`s Inneres; Austrittsnormale kommt aus `normal(exitPos)` (`shapeChunk.js`, geblendetes Feld), nicht aus einer Cluster-eigenen Gradientenfunktion — liefert Austrittspunkt/-normale/-weglänge als `GlassExit`.
- `_clusterRefractedColor(p, n, rd)` — bricht `rd` beim Eintritt (`refract(rd, n, 1.0/GLASS_IOR)`), trackt bis zum Austritt, bricht erneut (`GLASS_IOR`), sampelt `envMap` am Austrittsstrahl und mischt exponentiell (Beer-Lambert, `GLASS_ABSORPTION`) mit `GLASS_TINT_COLOR` nach Weglänge.

Frühere Sonderbehandlung entfernt: `_clusterNormal` (eigene, nur an `_clusterShape` gemessene Gradientenfunktion) existiert nicht mehr — sowohl `_clusterShading` als auch `_clusterTraceInterior`s Austrittsnormale nutzen jetzt einheitlich das geblendete `normal()`/`n`. Der Trefferpunkt `p` liegt dadurch weiterhin nicht notwendigerweise exakt auf `_clusterShape`s eigener Nullmenge, das wird aber bewusst in Kauf genommen statt korrigiert (kein offener Punkt mehr).

---

### `shaderChunks/positionChunk.js`
Physik-Blend. Alle drei Phasenmodi werden kontinuierlich per `clusterBlend`/`metaballBlend`/`burstBlend` gemischt — kein harter Umschalter. Eine `_<phase>Position`-Funktion pro Regime, benannt konsistent mit `_<phase>Shading` in `surfaceChunk.js` und `_<phase>Shape` in `shapeChunk.js`; jede gibt ihren **rohen, ungewichteten** Beitrag zurück, `blendPosition` gewichtet und summiert zentral — dasselbe Muster wie `blendShape()`/`blendShading()`. Tunable Kräfte/Decay-Raten sind file-level `const float` (SCREAMING_SNAKE_CASE), geteilt von allen Phasenfunktionen. `radiusMod(c, r0)` lebt ebenfalls hier (nicht in `shapeChunk.js`) — läuft einmal pro Ball im Sim-Pass, Ergebnis wird in die Zustandstextur geschrieben statt pro Bildschirmpixel im Raymarch-Pass neu berechnet zu werden.
Voraussetzung: Uniforms `stateTex`, `time`, `clusterBlend`/`metaballBlend`/`burstBlend`, `motionSpeed` deklariert; `stateUV(int)` und `perlin2D`/`dualOctaveNoise` (`noiseChunk`) definiert.

| GLSL-Funktion | Input / Output | Semantik |
|---|---|---|
| `orbitPoint(orb, phi)` | `orb: vec4`, `phi: float` → `vec3` | 3D-Punkt auf Orbit-Ellipse bei Winkel phi |
| `_reflectBounds(inout pos, inout vel)` | `pos,vel: vec3` | Reflektiert pos/vel an Sichtbarkeitsgrenzen; verhindert, dass Balls bei Burst dauerhaft aus dem Bild fliegen |
| `radiusMod(c, r0)` | `c: vec3`, `r0: float` → `float` | Rauschmodulierter Radius; im Sim-Pass einmal pro Ball aufgerufen und ins Vel-Texel (`.w`) geschrieben (siehe `simulationShader.js`) |
| `blendPosition(inout pos, inout vel, orb)` | `pos,vel: vec3`, `orb: vec4` | Ursprungsanziehung (`ORIGIN_PULL`) gewichtet mit `(clusterBlend+burstBlend)` **an der Kraft selbst** (nicht erst bei der `pos`-Anwendung) — trägt so ~0 zu `vel` bei, solange Metaball dominiert; `_clusterPosition`/`_burstPosition` lesen dieselbe Frame-Start-Position (`_burstPosition` zusätzlich den Centroid), geben je einen rohen Delta zurück, werden in `vel` akkumuliert; `_metaballPosition`/`_orbitTangentStep` bleiben direkte `pos`-Updates (s.u.); ruft `_reflectBounds` am Ende auf. **Kein `ballIdx`-Parameter** (mehr) — die frühere, per-Ball unterschiedliche Zielkraft (`_clusterTarget`) ist ersatzlos entfernt, siehe unten |

Interne Phasenfunktionen (alle rein — lesen `pos`/`cen`/`orb`, mutieren nichts, geben den rohen Delta zurück):
- `_metaballPosition(pos, orb) → vec3` — radiale Annäherung an den nächsten Orbit-Punkt (`_phiOnOrbit`) über `ORBIT_SNAP_RATE`, selbstlimitierend (→0 sobald der Ball auf Orbit ist).
- `_orbitTangentStep(pos, orb) → vec3` — der Winkel-Fortschritt des Orbits selbst pro Tick, unabhängig vom radialen Term, läuft immer mit voller Stärke. Beide Metaball-Terme werden **direkt auf `pos` angewendet** (gewichtet mit `metaballBlend`), nicht in `vel` akkumuliert — `vel` deckt nur wenige % pro Tick ab, eine Akkumulation würde sich aufsummieren statt sich auf die vorgesehene Korrektur einzustellen (besonders der Tangential-Term, der nie gegen 0 geht).
- `_clusterPosition(pos) → vec3` — organisches Perlin-Rauschen (2D, zwei versetzte Achsenpaare); keine formspezifische Zielkraft. Eine frühere Version zog jeden Ball über `_clusterTarget(ballIdx)` zu einem Punkt auf einer Helix um die Cluster-Geometrie — diese Funktion und ihr `ballIdx`-Parameter wurden ersatzlos entfernt (siehe `requirements.md` → Phasensystem → Cluster). Die generische Ursprungsanziehung (`ORIGIN_PULL`, oben in `blendPosition`) übernimmt stattdessen das Zusammenziehen zur Bildmitte, ohne Bezug zur konkreten Shape-Variante.
- `_burstPosition(pos, cen) → vec3` — Abstoßung vom Centroid mit exponentiellem Nahbereich (`BURST_FALLOFF`) und konstantem Sockel (`BURST_FORCE_OFFSET`, klingt **nicht** auf 0 ab), Kraftstärke (`BURST_FORCE_BASE`+`BURST_FORCE_SCALE`) aus live gelesenem `motionSpeed`.

---

## Shader-Module (`shaders/`)

### `shaders/simulationShader.js`
Sim-Pass-Shader. Intern von `simulation.js` verwendet. Interpoliert `positionChunk`. Exportiert: `simulationVert`, `simulationFrag`.

| GLSL-Uniform | Typ | Bereich / Semantik |
|---|---|---|
| `stateTex` | `sampler2D` | RGBA32F 36×1 Eingangszustand |
| `clusterBlend, metaballBlend, burstBlend` | `float` | Aus `getWeights()`, identisch zu den Shading-Uniforms des Haupt-Materials |
| `time` | `float` | [0, ∞) für Orbit- und Noise-Animationen |
| `motionSpeed` | `float` | [0, 1] `getMotionSpeed()` — skaliert Orbit-Winkelgeschwindigkeit und (live) Bursts Abstoßungsstärke |

---

### `shaders/environmentShader.js`
Equirectangular-Umgebungsgenerator. Intern von `environment.js` verwendet. Interpoliert `noiseChunk` + `colorChunk`. Exportiert: `environmentVert`, `environmentFrag`.

| GLSL-Uniform | Typ | Bereich / Semantik |
|---|---|---|
| `time` | `float` | [0, ∞) Animation (Sky-Rotation) |
| `resolution` | `vec2` | Rendertarget-Größe |
| `clusterSourceMap` | `sampler2D` | Geladene HDRI für die Cluster-Phase (siehe `src/environment.js`) |
| `metaballSourceMap` | `sampler2D` | Geladene HDRI, geteilt von Metaball **und** Burst |
| `metaballBlend, clusterBlend, burstBlend` | `float` | Via `colorChunk`, direkt aus `getWeights()` — steuern, welche der beiden Source-Maps (und wie stark) an jedem Punkt der Himmelskugel einfließt |

Eigener Code in dieser Datei: nur `main()` (`uv = gl_FragCoord.xy/resolution`, dann `blendEnvironment(uv, clusterSourceMap, metaballSourceMap)` aus `colorChunk`) — `uvToDir`/`dirToUV`/das eigentliche Sampling leben in `colorChunk.js` neben `blendEnvironment`.

Output: HDR RGB-Farbe der Himmelskugel an der UV-Position (Equirectangular-Mapping).

---

### `shaders/raymarchShader.js`
Haupt-Render-Pass. Interpoliert `noiseChunk` + `colorChunk` + `shapeChunk(clusterVariant)` + `surfaceChunk`, in dieser Reihenfolge (Farbe/Form vor der Oberflächenfunktion, die beide braucht). Exportiert: `mainVert` (fix), `buildMainFrag(clusterVariant: string) → string` — eine Funktion statt eines festen Strings, da die Cluster-Shape-Variante beim Shader-Zusammenbau feststehen muss (siehe `shaderChunks/shapeChunk.js`). Ändern der Variante zur Laufzeit heißt: `buildMainFrag` neu aufrufen und das `ShaderMaterial` neu kompilieren (`main.js`).

| GLSL-Uniform | Typ | Bereich / Semantik |
|---|---|---|
| `stateTex` | `sampler2D` | Ball-Zustandstextur — `gRad_i` wird direkt aus dem Vel-Texel `.w` gelesen, nicht mehr per `radiusMod` in diesem Pass berechnet |
| `envMap` | `sampler2D` | Equirectangular Env-Map (direkt gesampelt, keine PMREM-Textur) — nur von `surfaceChunk` gelesen |
| `metaballBlend, clusterBlend, burstBlend` | `float` | Via `colorChunk`; steuern SDF-Komposition (`shapeChunk`) und Shading-Blend (`surfaceChunk`) |
| `time`, `camPos`, `resolution` | — | Globale Szenenparameter |

Eigener Code in dieser Datei: nur noch die Ball-Daten-Globals (`gC0..gC11`/`gRad0..gRad11`) + `loadBalls()` (Rohdaten-Plumbing, analog zu `readPos`/`readVel`/`readOrb` in `simulationShader.js` — zwei `texture2D`-Reads pro Ball: Position aus Texel `3i`, `gRad_i` aus Texel `3i+1`s `.w`) und `main()`: `loadBalls()` → `raymarch()` → `blendShading()`. `normal()`/`raymarch()`/`loadRadii()` leben nicht mehr hier, sondern in `shapeChunk.js` (siehe dort) — dieser Shader ist auf Uniform-Deklaration, Rohdaten-Laden und die eine `main()`-Komposition reduziert. Ball-Daten werden einmalig pro Fragment geladen; kein Texture-Read in Raymarch- oder Normal-Schleife.

---

### `shaders/bloomShader.js`
Bloom Post-Processing. Drei Fragment-Shader-Strings für den 3-Pass-Bloom-Filter; intern von `gpuSetup.makeBloomSetup` verwendet. Vertex-Shader kommt aus `vertexChunk`.

| Export | Uniforms | Semantik |
|---|---|---|
| `brightExtractFrag` | `mainTex: sampler2D`, `resolution: vec2`, `threshold: float` | Extrahiert Pixel oberhalb Luma-Schwellenwert: `color × max(luma − threshold, 0) / luma` |
| `blurFrag` | `blurTex: sampler2D`, `resolution: vec2`, `blurDir: vec2` | Separabler 9-Tap-Gauß; `blurDir = (1,0)` für H-Pass, `(0,1)` für V-Pass |
| `compositeFrag` | `mainTex: sampler2D`, `bloomTex: sampler2D`, `resolution: vec2`, `intensity: float` | Additiv: `main + bloom × intensity`; bloomTex wird bilinear von W/2×H/2 auf W×H hochskaliert |
