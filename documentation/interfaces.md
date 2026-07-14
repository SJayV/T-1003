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
| `getMotionSpeed()` | — | — | `float` | [0,1] Aktuell erkannte Bewegungsgeschwindigkeit; exponentiell abklingend (×0.97/Tick) ohne Bewegung |
| `reportMotion(speed)` | `speed: float ∈ [0,1]` | Von `input.js`: setzt intern `_motionThisFrame = true`, `_motionSpeed = speed` — von `tick()` ausgelesen und zurückgesetzt | `void` | — |
| `onPhaseTransition(fn)` | `fn: () → void` | Feuert bei jedem Regime-Wechsel, ohne Argumente (kein Regime-Leck nach außen) | `void` | — |

Bump-Konstanten (`LEAD`, `CLUSTER_SIGMA`/`METABALL_SIGMA`/`BURST_SIGMA`, `BURST_HOLD`, `METABALL_MIN_HOLD`/`SILENCE_HOLD`, `METABALL_HANDOFF_LEAD`, `CLUSTER_COOLDOWN`) stehen am Kopf der Datei, erklärt — siehe `requirements.md` → Phasensystem für die Bump-Mathematik und die Handoff-Mechanik (Burst→Metaball aktiviert mit kleinerem Lead als sonst, für mehr Überlappung ohne Bursts Haltedauer zu verändern). `BURST_HOLD` ist fix, nicht mit `motionSpeed` skaliert.

---

### `src/simulation.js`
GPU-Physiksimulation. Verwaltet 1D-Zustandstextur (RGBA32F, 36×1) und Ping-Pong-RenderTargets. Die eigentliche Physik-Logik liegt in `simulationShader.js`.

| Funktion | Parameter | Bereich / Semantik | Rückgabe | Bereich |
|---|---|---|---|---|
| `initSimulation(renderer)` | `renderer: WebGLRenderer` | Wird intern für Sim-Pass-Render-Calls gespeichert | `void` | — |
| `stepSimulation()` | — | Liest `getWeights()`, `time`, `motionSpeed` direkt aus `phase.js`; setzt `clusterBlend`/`metaballBlend`/`burstBlend` (identisch zu den Shading-Uniforms) und `motionSpeed` auf dem Sim-Material | `void` | — |
| `getUniformDefs()` | — | — | `{ stateTex: { value } }` | Uniform-Objekt für ShaderMaterial |
| `applyStateToMaterial(material)` | `material: ShaderMaterial` | Setzt `stateTex` auf aktuelle Lesertextur | `void` | — |

Aufrufsequenz pro Frame: `stepSimulation` → `applyStateToMaterial` → Haupt-Render.

---

### `src/environment.js`
Dynamische Equirectangular-Env-Map-Generierung aus synthetischem Shader (`environmentShader.js`), direkt als `envMap` gesampelt (keine PMREM-Prefilterung). Regeneriert jeden Frame, ungedrosselt.

| Funktion | Parameter | Bereich / Semantik | Rückgabe | Bereich |
|---|---|---|---|---|
| `initEnvMap(renderer)` | `renderer: WebGLRenderer` | Renderer für Equirectangular-Pass | `void` | — |
| `getUniformDefs()` | — | — | `{ envMap: { value } }` | Einzelne Env-Map-Uniform |
| `applyStateToMaterial(material)` | `material: ShaderMaterial` | Liest `getWeights()` + Zeit direkt aus `phase.js`, setzt sie unverändert als Blend-Uniforms; regeneriert jeden Frame | `void` | — |

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
Systemkamera → Bewegungserkennung → `phase.js` + Kamera.

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

### `src/clusterShapeUI.js`
⚠️ Temporär — soll durch eine zufällige Auswahl bei jedem Cluster-Eintritt ersetzt werden (siehe `requirements.md` → Offene Punkte #4). Baut sein DOM-Element selbst (kein `index.html`-Markup zu pflegen), damit die spätere Entfernung eine reine Ein-Datei-Löschung ist.

| Funktion | Parameter | Bereich / Semantik | Rückgabe |
|---|---|---|---|
| `initClusterShapeUI(variants, onSelect)` | `variants: string[]` (aus `shapeChunk.js`s `CLUSTER_SHAPE_VARIANTS`), `onSelect: (name: string) => void` | Erzeugt einen Button pro Variante; Klick ruft `onSelect(name)` | `void` |

`main.js` reicht darüber `buildMainFrag(variant)` neu durch und setzt `material.fragmentShader`/`needsUpdate = true`.

---

### `src/constants.js`
Einzige Quelle für Konstanten, die in mehr als einer Datei benötigt werden — entweder zwei JS-Modulen, oder einem JS-Modul und einem GLSL-Chunk/Shader, der den Wert per Template-Interpolation in seinen Quelltext einsetzt (z. B. `` const int BALL_COUNT = ${BALL_COUNT}; ``). Konstanten, die nur an einer Stelle vorkommen, bleiben lokal in der jeweiligen Datei.

| Export | Typ | Verwendet von |
|---|---|---|
| `balls` | `Array<{r0,orbitRadius,orbitSpeed,orbitInclination}>` (length 12) | `simulation.js` (`buildInitData`), `tests/balls.test.js`; `r0 ∈ (0,∞)` Basisradius; Startwinkel wird per `Math.random()*2π` in `buildInitData` gesetzt |
| `BALL_COUNT` | `int` | `simulation.js`, `positionChunk.js` |
| `STATE_TEX_W` | `int` (= `BALL_COUNT * 3`) | `simulation.js`, `simulationShader.js` (`TEX_W`), `raymarchShader.js` (`loadBalls`) |
| `ORBIT_Z_SQUASH` | `float` | `simulation.js` (`buildInitData`), `positionChunk.js` (`orbitPoint`/`_orbitBasisE2`) |
| `FRAME_TIME_STEP` | `float` | `phase.js` (`getTime`-Uhr, unabhängig von `tick(t_now)`), `simulation.js` (`buildInitData`), `positionChunk.js` (`applySimulation`) |
| `CLUSTER_CYL_RADIUS`, `CLUSTER_CYL_HALF_HEIGHT`, `CLUSTER_CYL_CENTER_X`/`_Y` | `float` | `shapeChunk.js` (`_clusterCylinder`), `positionChunk.js` (`_clusterTarget`) — Shape und das Konvergenzziel der Bälle müssen identisch sein |
| `CLUSTER_SPHERE_RADIUS`, `CLUSTER_BOX_HALF_EXTENT`, `CLUSTER_BOX_ROTATION_X`/`_Y` | `float` | `shapeChunk.js` (`_clusterSphere`/`_clusterBox`) — nur von dieser Datei gebraucht, aber hier colokiert statt lokal, damit alle Cluster-Shape-Größen an einer Stelle stehen |
| `MOOD_METABALL`, `MOOD_CLUSTER`, `MOOD_BURST`, `MOOD_RIM` | `[r,g,b]` | `colorChunk.js` — je Phase eine Farbe (Ambient-/Env-Map-Tint **und** F0-Surface-Tint bei Metaball/Burst) + eine geteilte Rim-Light-Tint-Konstante für Metaball+Burst |
| `glslFloat(n)` | `(number) => string` | Jede Stelle, die einen JS-Zahlenwert in einen GLSL-`float`-Kontext interpoliert. JS stringifiziert ganze Zahlen ohne Dezimalpunkt (`String(1.0) === '1'`), aber GLSL ES 1.00 verlangt einen Dezimalpunkt bei `float`-Literalen — `const float x = 1;` ist auf strikten Validatoren (z. B. ANGLE unter Windows) ein Typfehler und lässt das Shader-Programm nicht linken. Immer verwenden, nie den nackten JS-Wert interpolieren |
| `glslVec3([r,g,b])` | `(number[]) => string` | Wie `glslFloat`, aber für `vec3`-Literale (Mood-Farben) — jede Komponente einzeln durch `glslFloat` |

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
Alles, was aus den drei Phasengewichten eine Farbe macht — Ball-Oberflächenfarbe (`moodColor()`, von `surfaceChunk.js` konsumiert) und Himmelsfarbe (`blendEnvironment()`, von `environmentShader.js` konsumiert) sind dieselbe Art Berechnung, nur für unterschiedliche Fragmente. Deklariert eigene Uniforms (`metaballBlend`/`clusterBlend`/`burstBlend`). Werte kommen aus `constants.js` (`MOOD_METABALL`/`_CLUSTER`/`_BURST`/`_RIM`), interpoliert via `glslVec3()`. Voraussetzung: `worley2D`, `dualOctaveNoise` (`noiseChunk`) in Scope. **Kein** `envMap`-Sampling hier (siehe `surfaceChunk.js`) — dieser Chunk wird auch in `environmentShader.js` injiziert, das keine `envMap`-Uniform besitzt.

| GLSL-Export | Typ | Semantik |
|---|---|---|
| `MOOD_METABALL` | `const vec3` | Metaballs Farbe — Ambient-/Env-Map-Tint **und** F0-Surface-Tint (`shadeMetaball`); ein Wert für beide Rollen, keine separate "Metall"-Konstante mehr |
| `MOOD_CLUSTER` | `const vec3` | Teal-Cyan |
| `MOOD_BURST` | `const vec3` | Bursts Farbe, dieselbe Doppelrolle wie `MOOD_METABALL` |
| `MOOD_RIM` | `const vec3` | Rim-Light-Tint, geteilt von Metaball **und** Burst (`_shadeReflective` in `surfaceChunk.js`) — unabhängig von deren (ggf. unterschiedlichem) Surface-Tint, garantiert identisches Rim-Light zwischen den beiden Phasen |
| `metaballBlend, clusterBlend, burstBlend` | `uniform float` | Phasengewichte aus `phase.js`; immer Summe = 1 |
| `moodColor() → vec3` | `∈ [0,1]³` | Gewichteter Mix der drei Phasenfarben — nur für `blendEnvironment()`s Ambient-Tint; die Shading-Funktionen selbst lesen `MOOD_METABALL`/`MOOD_CLUSTER`/`MOOD_BURST` direkt (siehe `surfaceChunk.js`) |
| `envMetaball`/`envCluster`/`envBurst(dir, ...)` | `vec3` | Himmelsfarbe je Phase; Metaball/Burst teilen sich `_envKeyLight` (Worley-Speckle + rotierendes Key-Light), unterschieden nur durch Tint |
| `blendEnvironment(uv) → vec3` | HDR | Nimmt die rohe Equirect-UV entgegen, berechnet Richtung/Sky-Rotation intern (`_uvToDir`) und liefert den immer-an 3-Wege-Blend der Himmelsfarben + Ambient-Noise; kein `envSelect`-Zweig; `environmentShader.js`s `main()` reduziert sich dadurch auf `uv` berechnen + diesen einen Aufruf |

---

### `shaderChunks/shapeChunk.js`
SDF-Komposition **und** deren Auswertung (Normale, Raymarch-Loop) — nicht nur `map()`, damit `raymarchShader.js` selbst auf reine Plumbing/Kamera-Logik reduziert bleibt. Nur von `raymarchShader.js` verwendet. Voraussetzung: Globals `gC0..gC11`/`gRad0..gRad11` (von `loadBalls()` in `raymarchShader.js` befüllt — `gRad_i` ist der bereits in `positionChunk.js` modulierte Radius, direkt aus der Zustandstextur gelesen, hier nicht neu berechnet); Uniforms `time`, `clusterBlend`/`metaballBlend`/`burstBlend` (`colorChunk`); `perlin3D` (`noiseChunk`).

**Export ist eine Funktion, nicht ein fester String:** `shapeChunk(clusterVariant = 'clusterCylinderIntersect') → string`. `clusterVariant` (einer der sechs Namen aus `CLUSTER_SHAPE_VARIANTS`, ebenfalls exportiert) entscheidet **beim JS-Aufruf**, auf welche der sechs expliziten Kombinations-Funktionen `clusterSDF(p)` aliast — ein String, der in den generierten GLSL-Quelltext eingesetzt wird, kein Laufzeit-Branch im Shader. `raymarchShader.js`s `buildMainFrag(clusterVariant)` reicht den Parameter durch.

| GLSL-Funktion | Input | Semantik | Output |
|---|---|---|---|
| `map(p)` | `p: vec3` | `clusterBlend·clusterSDF(p) + metaballBlend·metaballSDF(p) + burstBlend·burstSDF(p)` — zeitliche Überblendung, keine räumliche Vereinigung (siehe `requirements.md` → SDF-Komposition über Phasen) | `float` |
| `clusterSDF(p)` | `p: vec3` | Einzeiler-Alias auf genau eine der sechs `cluster{Cylinder,Sphere,Box}{Full,Intersect}`-Funktionen (siehe unten) | `float` |
| `metaballSDF(p)` | `p: vec3` | `_noisyBallUnion(p, SMIN_K=0.35)` — `_ballUnion` (smin über 12 Bälle) + eigenes `perlin3D`-Oberflächenrauschen | `float` |
| `burstSDF(p)` | `p: vec3` | Wie `metaballSDF`, aber `SMIN_K=0.10` (enger fusioniert → liest sich "explodiert") | `float` |
| `normal(p)` | `p: vec3` | Zentrale finite Differenzen auf `map()` | `vec3` |
| `raymarch(ro, rd)` | `ro,rd: vec3` | Sphere-Tracing über `map()`; `stepSafety`-Faktor (aus `clusterBlend·(metaballBlend+burstBlend)`) dämpft die Schrittweite während einer echten Cross-Phase-Überblendung, kostet in eingeschwungenen Zuständen aber nichts | `float` (Distanz, `-1.0` bei Miss) |

**Cluster-Shape-Varianten** (siehe `requirements.md` → Cluster-Shape-Varianten für die volle Herleitung):

| GLSL-Funktion | Semantik |
|---|---|
| `_clusterCylinder`/`_clusterSphere`/`_clusterBox(p)` | Jeweils die reine Form in ihrer **festen** Zielgröße (`CLUSTER_CYL_RADIUS`/`_HALF_HEIGHT`, `CLUSTER_SPHERE_RADIUS`, `CLUSTER_BOX_HALF_EXTENT` + zweiachsige Rotation) — nie in der Größe interpoliert |
| `_clusterIntersect(shapeD, p)` | `mix(ballD, max(shapeD, ballD), 1-metaballBlend)` — blendet die **Schnittmenge** mit der Ballunion ein, nicht die Form-Größe; bei `metaballBlend≈1` identisch zu `metaballSDF` |
| `clusterCylinderFull`/`clusterSphereFull`/`clusterBoxFull(p)` | `= _cluster<Shape>(p)` — kein Ballbezug, blendet allein über `clusterBlend` in `map()` |
| `clusterCylinderIntersect`/`clusterSphereIntersect`/`clusterBoxIntersect(p)` | `= _clusterIntersect(_cluster<Shape>(p), p)` |

`radiusMod`/`loadRadii` leben **nicht** hier — die rauschmodulierten Radien werden im Sim-Pass berechnet und über die Zustandstextur transportiert (siehe `positionChunk.js` und die Uniform-Tabelle unter `raymarchShader.js`).

---

### `shaderChunks/surfaceChunk.js`
Material-/Lichtantwort (Nachimplementierung von `MeshPhysicalMaterial` für Raymarching) — wie sich Metall/Glas unter Licht + Env-Map verhalten, nicht *welche* Farbe/Form etwas hat (siehe `colorChunk.js`/`shapeChunk.js`). Nur von `raymarchShader.js` verwendet.
Voraussetzung: Uniform `envMap` (sampler2D); `map(vec3)` (`shapeChunk`) und `moodColor`/`MOOD_*`/`clusterBlend`|`metaballBlend`|`burstBlend` (`colorChunk`) in Scope.

Benennung nach **Phase**: `shadeMetaball`/`shadeCluster`/`shadeBurst` sind austauschbare Implementierungen, je eine pro Phase; `shadeHit` mischt alle drei gewichtet nach `metaballBlend`/`clusterBlend`/`burstBlend` (immer 3-Wege, keine Early-Outs). Metaball und Burst teilen sich die interne `_shadeReflective`-Implementierung (Cook-Torrance + Env-Map-Sampling) und unterscheiden sich nur im Surface-Tint (`MOOD_METABALL`/`MOOD_BURST`); Rauheit (`SURFACE_ROUGHNESS`) und Rim-Light-Tint (`MOOD_RIM`) sind für beide identisch. Cluster nutzt dieselbe `RIM_WEIGHT`-Konstante, aber mit eigenem Tint (`MOOD_CLUSTER`).

| GLSL-Funktion | Input | Bereich / Semantik | Output | Bereich |
|---|---|---|---|---|
| `shadeHit(p, n, rd)` | `p: vec3`, `n: vec3` (norm.), `rd: vec3` (norm.) | 3-Wege-Blend: `shadeMetaball·metaballBlend + shadeCluster·clusterBlend + shadeBurst·burstBlend` | `vec3` | [0, ∞) HDR |
| `shadeMetaball(n, rd, NdotV)` | `n,rd: vec3`, `NdotV: float ∈ [0,1]` | `_shadeReflective` mit `MOOD_METABALL`-Tint | `vec3` | HDR |
| `shadeBurst(n, rd, NdotV)` | `n,rd: vec3`, `NdotV: float ∈ [0,1]` | `_shadeReflective` mit `MOOD_BURST`-Tint | `vec3` | HDR |
| `shadeCluster(p, n, rd, NdotV)` | `p,n,rd: vec3`, `NdotV: float ∈ [0,1]` | map()-Materialdicken-Proxy für inneres Leuchten; Fresnel-Rim (pow(1−NdotV, 2.5)); Rückstreuung; Specular 192er; kein Env-Map-Sampling; `_rimLight(MOOD_CLUSTER, NdotV)` gewichtet mit `RIM_WEIGHT` | `vec3` | HDR |

Interner Helfer `_shadeReflective(n, rd, NdotV, tint)`: Cook-Torrance-BRDF (Rauheit fix `SURFACE_ROUGHNESS`, nicht mehr Funktionsparameter) + Env-Map-Sampling via Cone-Sampling (5 Taps, `_envSampleLod`, approximiert rauheitsabhängige Unschärfe ohne PMREM, Spread `ENV_CONE_SPREAD` vorberechnet aus `SURFACE_ROUGHNESS`) + `_rimLight(MOOD_RIM, NdotV)` gewichtet mit derselben `RIM_WEIGHT`-Konstante wie Cluster. Leitet aus `tint` intern eine hellere Highlight-Variante für den direkten Specular-Term ab (`HIGHLIGHT_BRIGHTEN`-Faktor) — ein einzelner Tint-Wert genügt pro Aufrufer.

---

### `shaderChunks/positionChunk.js`
Physik-Blend. Alle drei Phasenmodi werden kontinuierlich per `clusterBlend`/`metaballBlend`/`burstBlend` gemischt — kein harter Umschalter. Eine `_simulate<Phase>`-Funktion pro Regime, benannt konsistent mit `shade<Phase>` in `surfaceChunk.js` und `<phase>SDF` in `shapeChunk.js`; jede gibt ihren **rohen, ungewichteten** Beitrag zurück, `applySimulation` gewichtet und summiert zentral — dasselbe Muster wie `map()`/`shadeHit()` (bis vor kurzem wendete jede Funktion ihr Gewicht noch selbst an; jetzt konsistent über alle drei Achsen). Tunable Kräfte/Decay-Raten sind file-level `const float` (SCREAMING_SNAKE_CASE), geteilt von allen Phasenfunktionen. `radiusMod(c, r0)` lebt ebenfalls hier (nicht in `shapeChunk.js`) — läuft einmal pro Ball im Sim-Pass, Ergebnis wird in die Zustandstextur geschrieben statt pro Bildschirmpixel im Raymarch-Pass neu berechnet zu werden.
Voraussetzung: Uniforms `stateTex`, `time`, `clusterBlend`/`metaballBlend`/`burstBlend`, `motionSpeed` deklariert; `stateUV(int)` und `perlin2D`/`dualOctaveNoise` (`noiseChunk`) definiert.

| GLSL-Funktion | Input / Output | Semantik |
|---|---|---|
| `orbitPoint(orb, phi)` | `orb: vec4`, `phi: float` → `vec3` | 3D-Punkt auf Orbit-Ellipse bei Winkel phi |
| `reflectBounds(inout pos, inout vel)` | `pos,vel: vec3` | Reflektiert pos/vel an Sichtbarkeitsgrenzen; verhindert, dass Balls bei Burst dauerhaft aus dem Bild fliegen |
| `radiusMod(c, r0)` | `c: vec3`, `r0: float` → `float` | Rauschmodulierter Radius; im Sim-Pass einmal pro Ball aufgerufen und ins Vel-Texel (`.w`) geschrieben (siehe `simulationShader.js`) |
| `applySimulation(inout pos, inout vel, orb, ballIdx)` | `pos,vel: vec3`, `orb: vec4`, `ballIdx: int` | Zentripetalkraft + Ursprungsanziehung gewichtet mit `(clusterBlend+burstBlend)` **an der Kraft selbst** (nicht erst bei der `pos`-Anwendung) — tragen so ~0 zu `vel` bei, solange Metaball dominiert; `_simulateCluster`/`_simulateBurst` lesen dieselbe Frame-Start-Position, geben je einen rohen Delta zurück, werden in `vel` akkumuliert; `_simulateMetaball`/`_orbitTangentStep` bleiben direkte `pos`-Updates (s.u.); ruft `reflectBounds` am Ende auf |

Interne Phasenfunktionen (alle rein — lesen `pos`/`cen`/`orb`, mutieren nichts, geben den rohen Delta zurück):
- `_simulateMetaball(pos, orb) → vec3` — radiale Annäherung an den nächsten Orbit-Punkt (`_phiOnOrbit`) über `ORBIT_SNAP_RATE`, selbstlimitierend (→0 sobald der Ball auf Orbit ist).
- `_orbitTangentStep(pos, orb) → vec3` — der Winkel-Fortschritt des Orbits selbst pro Tick, unabhängig vom radialen Term, läuft immer mit voller Stärke. Beide Metaball-Terme werden **direkt auf `pos` angewendet** (gewichtet mit `metaballBlend`), nicht in `vel` akkumuliert — `vel` deckt nur wenige % pro Tick ab, eine Akkumulation würde sich aufsummieren statt sich auf die vorgesehene Korrektur einzustellen (besonders der Tangential-Term, der nie gegen 0 geht).
- `_simulateCluster(pos) → vec3` — nur das organische Rauschen; der Zug auf `_clusterTarget(ballIdx)` (Helix um die Cluster-Zylindergeometrie, siehe `requirements.md` → Phasensystem → Cluster) ist eine separate Kraft in `applySimulation`, gewichtet mit `(clusterBlend+burstBlend)`.
- `_simulateBurst(pos, cen) → vec3` — Abstoßung vom Centroid mit exponentiellem Nahbereich (`BURST_FALLOFF`) und konstantem Sockel (`BURST_FORCE_OFFSET`, klingt **nicht** auf 0 ab), Kraftstärke (`BURST_FORCE_BASE`+`BURST_FORCE_SCALE`) aus live gelesenem `motionSpeed`.

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
| `time` | `float` | [0, ∞) Animation (Noise-Drift, Rotation) |
| `resolution` | `vec2` | Rendertarget-Größe |
| `metaballBlend, clusterBlend, burstBlend` | `float` | Via `colorChunk`, direkt aus `getWeights()` — steuern Farbtemperatur, Direktivität, Kontrast |

Eigener Code in dieser Datei: nur `main()` (`uv = gl_FragCoord.xy/resolution`, dann `blendEnvironment(uv)` aus `colorChunk`) — kein `uvToDir` mehr hier, das lebt jetzt in `colorChunk.js` neben `blendEnvironment`. Kein `envSelect`, kein Preset-Zweig.

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

Eigener Code in dieser Datei: nur noch die Ball-Daten-Globals (`gC0..gC11`/`gRad0..gRad11`) + `loadBalls()` (Rohdaten-Plumbing, analog zu `readPos`/`readVel`/`readOrb` in `simulationShader.js` — zwei `texture2D`-Reads pro Ball: Position aus Texel `3i`, `gRad_i` aus Texel `3i+1`s `.w`) und `main()`: `loadBalls()` → `raymarch()` → `shadeHit()`. `normal()`/`raymarch()`/`loadRadii()` leben nicht mehr hier, sondern in `shapeChunk.js` (siehe dort) — dieser Shader ist auf Uniform-Deklaration, Rohdaten-Laden und die eine `main()`-Komposition reduziert. Ball-Daten werden einmalig pro Fragment geladen; kein Texture-Read in Raymarch- oder Normal-Schleife.

---

### `shaders/bloomShader.js`
Bloom Post-Processing. Drei Fragment-Shader-Strings für den 3-Pass-Bloom-Filter; intern von `gpuSetup.makeBloomSetup` verwendet. Vertex-Shader kommt aus `vertexChunk`.

| Export | Uniforms | Semantik |
|---|---|---|
| `brightExtractFrag` | `mainTex: sampler2D`, `resolution: vec2`, `threshold: float` | Extrahiert Pixel oberhalb Luma-Schwellenwert: `color × max(luma − threshold, 0) / luma` |
| `blurFrag` | `blurTex: sampler2D`, `resolution: vec2`, `blurDir: vec2` | Separabler 9-Tap-Gauß; `blurDir = (1,0)` für H-Pass, `(0,1)` für V-Pass |
| `compositeFrag` | `mainTex: sampler2D`, `bloomTex: sampler2D`, `resolution: vec2`, `intensity: float` | Additiv: `main + bloom × intensity`; bloomTex wird bilinear von W/2×H/2 auf W×H hochskaliert |
