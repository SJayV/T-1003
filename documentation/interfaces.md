# Module Interfaces

- öffentliche API jedes Moduls
- Notation `param: Type ∈ [min, max]` für den gültigen Wertebereich
- Ausschluss privater (`_`-prefixter) Symbole aus der Schnittstelle
- GLSL-Chunks als Template-Literal-Bausteine, keine eigenständigen Shader-Programme

## 1. Gemeinsames Protokoll: "Uniform Provider"

- gemeinsamer informeller Vertrag von `renderer.js`, `simulation.js`, `environment.js` & `phase.js`, konsumiert durch `main.js`:

```ts
getUniformDefinitions(): { [uniformName: string]: { value: any } }
applyStateToMaterial(material: THREE.ShaderMaterial): void
```

- `getUniformDefinitions()`: initialer Uniform-Satz zur Material-Erzeugung
- `applyStateToMaterial(material)`: Schreiben der aktuellen Werte in `material.uniforms.<name>.value`, jeden Frame

## 2. JavaScript-Module

**`src/constants.js`:** reine Konfigurationsdaten + ein GLSL-Formatierungshelfer, kein Modul-Zustand

| Export | Typ / Parameter | Bereich / Semantik | Rückgabe |
|---|---|---|---|
| `BALLS` | — | Startkonfiguration der 12 Metaball-Kugeln: `{ initialRadius, orbitRadius, orbitSpeed, orbitInclination }` | `Array<{...}>` |
| `BALL_COUNT` | — | `BALLS.length` | `number` |
| `TEXELS_PER_BALL` | — | Texel pro Kugel im State-Texture-Layout (= 3) | `number` |
| `STATE_TEXTURE_WIDTH` | — | `BALL_COUNT * TEXELS_PER_BALL` | `number` |
| `ORBIT_Z_SQUASH` | — | Z-Achsen-Kompression der Orbits | `number` |
| `FRAME_TIME_STEP` | — | fixer Zeitschritt pro Simulationsschritt | `number` |
| `CLUSTER_SHAPE_VARIANTS` | — | Namen der SDF-Grundkörper (Übereinstimmung mit Funktionsnamen in `shapeChunk.js` erforderlich) | `string[]` |
| `glslFloat(value)` | `value: number` | Formatierung einer JS-Zahl als GLSL-`float`-Literal | `string` |

> **Gotcha:** JS stringifiziert ganze Zahlen ohne Dezimalpunkt
> (`` `${1.0}` === '1' ``), GLSL ES 1.00 verlangt aber einen Dezimalpunkt bei
> `float`-Literalen — `const float x = 1;` ist auf strikten Validatoren (z. B.
> ANGLE unter Windows) ein Typfehler, den andere Treiber stillschweigend
> tolerieren. Immer `glslFloat(n)` verwenden, nie den nackten JS-Wert in einen
> `float`-Kontext interpolieren; bei Interpolation in einen `int`-Kontext ist
> kein Wrapping nötig.

**`src/phase.js`:**
- zentrale Zustandsmaschine für die drei Phasengewichte
- einzige autoritative Quelle der globalen Simulationszeit
- einziger Konsument von `input.js`-Events

| Funktion | Parameter | Bereich / Semantik | Rückgabe | Bereich |
|---|---|---|---|---|
| `reportGazeDetected()` | — | von `input.js`: Meldung erkannten Blickkontakts für den aktuellen Frame | `void` | — |
| `reportMotionEnergy(speed)` | `speed: number` | von `input.js`: Meldung der Bewegungsenergie (intern zusätzlich auf [0,1] geklemmt) | `void` | — |
| `tick(currentTime)` | `currentTime: number` (Sekunden) | Aufruf-Pflicht: einmal pro Frame vor allen anderen Reads; Auswertung von Übergängen, Aktualisierung von Gewichten / `motionSpeed`-Zerfall / interner Zeit; danach Rücksetzen der Frame-Flags beider `report*`-Funktionen | `void` | — |
| `getWeights()` | — | — | `{ clusterWeight, metaballWeight, burstWeight }` | je ≥ 0, Summe ≈ 1 |
| `getMotionSpeed()` | — | aktueller, evtl. zerfallener Bewegungswert | `number` | [0,1] |
| `getTime()` | — | interne, unabhängig von `performance.now()` fortschreitende Simulationszeit (Schrittweite `FRAME_TIME_STEP`) | `number` | [0,∞) |
| `onPhaseTransition(listener)` | `listener: (name) => void` | Registrierung eines Callbacks, aufgerufen bei jedem Phasenwechsel mit dem Namen der *neuen* Phase | `void` | `name ∈ {'cluster','burst','metaball'}` |
| `getSimulationUniformDefinitions()` | — | Basissatz, geteilt mit `simulation.js` | `{ time, metaballWeight, clusterWeight, burstWeight, motionSpeed }` | — |
| `getUniformDefinitions()` | — | Erweiterung des obigen Satzes um die aktuell gewählte Cluster-Formvariante | `{ ...obiger Satz, clusterShapeIndex }` | — |
| `applySimulationState(material)` | `material` | Schreiben von `time`, den drei Gewichten & `motionSpeed` | `void` | — |
| `applyStateToMaterial(material)` | `material` | `applySimulationState` + `clusterShapeIndex` | `void` | — |

**`src/input.js`:** Kapselung von Webcam-Zugriff, Bewegungsenergie- & Blickerkennung, ausschließliche Meldung über `phase.js`-Funktionen nach außen

| Export | Typ / Parameter | Bereich / Semantik | Rückgabe |
|---|---|---|---|
| `CANVAS_WIDTH`, `CANVAS_HEIGHT` | — | Größe des internen Offscreen-Canvas für Frame-Differencing | `number` |
| `GAZE_DETECT_INTERVAL_FRAMES` | — | Drosselung der Blickerkennung auf jeden N-ten `updateInput()`-Aufruf | `number` |
| `GAZE_PERSIST_CYCLES` | — | konsekutive „blickend"-Erkennungszyklen vor `reportGazeDetected()`-Auslösung (Debounce nur beim Anschalten) | `number` |
| `initializeInput()` | — | Start des Kamera-Streams (asynchron), Laden der face-api.js-Modelle (asynchron), Anlegen des internen Canvas | `void` |
| `updateInput()` | — | Aufruf pro Frame; No-op ohne bereite Kamera / bereites Video; Berechnung der Bewegungsenergie jeden Frame, gedrosselte Blickerkennung | `void` |

**Blickerkennung:** „blickend" nur bei beiden zutreffenden Tests
- **zentriert:** Bounding-Box-Zentrum innerhalb der mittleren `GAZE_CENTER_FRACTION` des horizontal gespiegelten Kamerabilds
- **frontal:** horizontaler Nasenspitzen-Versatz relativ zum Augen-Mittelpunkt, normiert auf den Augenabstand, unterhalb `GAZE_FRONTAL_THRESHOLD` (Näherung an „Kopf zeigt zur Kamera" mangels echtem Iris-/Gaze-Vektor der Tiny-Landmark-Modelle)

- kein `getUniformDefinitions`/`applyStateToMaterial` — keine Shader-Uniformen, nur Events

**`src/simulation.js`:** GPU-Partikelsimulation der Metaball-Positionen/Geschwindigkeiten über Ping-Pong-Rendertargets (`THREE.FloatType`, siehe [codingStandards.md](./codingStandards.md)); Physik selbst im Fragment-Shader (`simulationShader.js`/`positionChunk`)

| Funktion | Parameter | Semantik | Rückgabe |
|---|---|---|---|
| `initializeSimulation(renderer)` | `renderer: THREE.WebGLRenderer` | Anlegen von Read-/Write-Targets, Startzustands-Textur (aus `BALLS`) & Simulationsmaterial | `void` |
| `stepSimulation()` | — | Rendern eines Simulationsschritts ins Write-Target unter `applySimulationState` aus `phase.js`, danach Tausch von Read-/Write-Target | `void` |
| `getUniformDefinitions()` | — | — | `{ stateTexture }` |
| `applyStateToMaterial(material)` | `material` | Setzen von `stateTexture.value` auf die aktuelle Read-Target-Textur | `void` |

**State-Texture-Layout** (pro Kugel `TEXELS_PER_BALL = 3` Texel × 4 Floats):

| Texel | .xyz | .w |
|---|---|---|
| 0 | Position | `initialRadius` |
| 1 | Geschwindigkeit | ungenutzt (0) |
| 2 (`orbit`) | `(orbitRadius, orbitSpeed, initialPhi)` in `.rga` | `orbitInclination` in `.a` |

**`src/environment.js`:** Erzeugung einer equirektangulären Environment-Map pro Frame als Überblendung zweier HDR-Quelltexturen gemäß Phasengewichten

| Funktion | Parameter | Semantik | Rückgabe |
|---|---|---|---|
| `initializeEnvironmentMap(renderer, clusterFilename?, metaballFilename?)` | `renderer`, Dateinamen (Default: `neonStudio.hdr` für beide) | Laden beider HDR-Dateien aus `resources/environments/` (`RGBELoader`), Anlegen von Zieltextur (256×512, `LinearSRGBColorSpace`) & Blend-Material | `void` |
| `getUniformDefinitions()` | — | — | `{ environmentMap }` |
| `applyStateToMaterial(material)` | `material` | erneutes Rendern der Überblendung (abhängig von aktuellen Phasengewichten + `getTime()`), Setzen von `environmentMap.value` auf das Ergebnis | `void` |

> **`flipY`-Gotcha:** `THREE.RGBELoader` liefert eine `DataTexture`, die (anders
> als eine gewöhnliche, aus einem Bild geladene `Texture`) standardmäßig
> `flipY = false` hat. Die Equirectangular-UV-Konvention erwartet aber die
> `flipY = true`-Orientierung — daher wird `flipY` nach dem Laden explizit
> gesetzt, sonst erscheint die Himmelskugel vertikal gespiegelt.

- keine Isolation zwischen den beiden Quelltexturen während einer Phasen-Überblendung: gewichtete Mischung beider in dieselbe `environmentMap`-Textur, dadurch unvermeidlicher Rest der jeweils anderen Quelle bei echter Überblendung

**`src/renderer.js`:** THREE.js-Grundgerüst; einzige `Scene`/`Camera`/`Renderer`-Instanz des Projekts als Modul-Level-Exporte (kein Getter-Pattern)

| Export | Typ | Semantik |
|---|---|---|
| `scene` | `THREE.Scene` | Hauptszene |
| `camera` | `THREE.Camera` (Basisklasse, keine Perspective-Projektion — Strahlrekonstruktion manuell im Fragment-Shader) | Startposition aus `CAMERA_START_POSITION` |
| `renderer` | `THREE.WebGLRenderer` | `antialias: true` |
| `initializeRendering()` | — | Setzen von Kamera-Position & Renderer-Größe/Pixel-Ratio, Einhängen des Canvas ins DOM, Registrierung des Resize-Handlers |
| `applyMeshToScene(mesh)` | `mesh: THREE.Object3D` | Hinzufügen eines Objekts zur Szene |
| `getUniformDefinitions()` | — | `{ cameraWorldPosition, resolution }` |
| `applyStateToMaterial(material)` | `material` | Aktualisierung beider Uniformen aus Kamera-Position bzw. Canvas-Größe |

**`src/audio.js`:** Web-Audio-Wiedergabe; Reaktion auf `phase.js` (Gewichte & Transition-Event), keine Shader-Uniformen

| Funktion | Semantik |
|---|---|
| `initializeAudio()` | Erzeugung von `AudioContext` & Gain-Nodes, Registrierung des Burst-Signal-Listeners via `onPhaseTransition`, Laden & Starten der drei Loop-Buffer (cluster/metaball/burst) |
| `updateAudio()` | pro Frame; No-op ohne bereites Audio; sanfter Abgleich der drei Loop-Gains (`setTargetAtTime`) an `getWeights()` |

- keine Kenntnis von `audio.js` in `phase.js` — Kopplung ausschließlich über den bestehenden `onPhaseTransition(fn)`-Listener (Pattern: direkter Import von gemeinsamem Phasen-Zustand, siehe [codingStandards.md](./codingStandards.md))

**`src/gpuSetup.js`:** gemeinsame Low-Level-Fabriken für Fullscreen-Quad-Rendering, plus die eigenständige Bloom-Pipeline

| Funktion | Parameter | Semantik | Rückgabe |
|---|---|---|---|
| `initializeGpuSetup(material)` | `material: THREE.Material` | orthografische Kamera + Fullscreen-Quad-Szene mit gegebenem Material | `{ scene, camera }` |
| `initializeRenderTarget(width, height)` | — | Standard-Rendertarget (`HalfFloatType`, RGBA, linear Filter, kein Depth-Buffer) | `THREE.WebGLRenderTarget` |
| `initializeFullscreenMaterial(uniforms, fragmentShader)` | — | Standard-Vertexshader (`vertexChunk`) + gegebenes Fragment | `THREE.ShaderMaterial` |
| `renderPass(renderer, target, pass, applyUniforms?)` | `target: WebGLRenderTarget \| null` | generische Renderpass-Ausführung (optional Uniform-Setup vor dem Render); `target = null` als Bildschirm-Ausgabe | `void` |
| `initializeBloomSetup(renderer, fragments)` | `fragments: { brightExtractFragment, blurFragment, compositeFragment }` | vollständige Bloom-Pipeline (Extract → H+V-Blur → Composite) inkl. automatischem Resize | `{ render(scene, camera, { intensity, threshold }) }` |

**`main.js`:** kein Export — Composition Root der Anwendung
- Zusammenbau eines einzelnen `THREE.ShaderMaterial` aus `phase.getUniformDefinitions()`, `renderer.getUniformDefinitions()`, `simulation.getUniformDefinitions()`, `environment.getUniformDefinitions()`, mit `raymarchShader.js` (`mainVertex`/`mainFragment`) als Shader-Programm
- Initialisierung aller Module
- `animate()` (`requestAnimationFrame`-Loop): `tick` → `stepSimulation` → alle vier `applyStateToMaterial`-Aufrufe → `updateInput` → `updateAudio` → `bloom.render(...)`, mit `intensity`/`threshold` moduliert durch `burstWeight`

## 3. GLSL-Chunks (`shaderChunks/`, interpoliert via Template-Literal)

- reiner GLSL-String-Export aller Chunks, Interpolation per `${…}` in den jeweiligen Shader
- Zugriff der Chunk-Funktionen auf Uniforms & Hilfsfunktionen des umschließenden Shaders (gleicher Programm-Scope)
- Voraussetzungen je Chunk unten genannt

**`shaderChunks/helpersChunk.js`:** vier unabhängig exportierte Chunks — `noiseChunk`, `sampleChunk`, `screenChunk`, `vertexChunk`

| GLSL-Funktion | Chunk | Input | Output | Semantik |
|---|---|---|---|---|
| `perlin3D(position)` | `noiseChunk` | `vec3` | `float ∈ [-1,1]` | Gradienten-Rauschen für Oberflächenperturbation |
| `_directionToUV(direction)` / `_uvToDirection(uv)` | `sampleChunk` | `vec3`/`vec2` | `vec2`/`vec3` | Equirectangular-Projektion hin und zurück |
| `_fetchDirectionalTexture(map, direction)` | `sampleChunk` | `sampler2D`, `vec3` | `vec3` | Sampling einer Equirect-Textur in Richtung `direction` |
| `_screenUV()` | `screenChunk` | — (nutzt `gl_FragCoord`, `resolution`) | `vec2` | normierte Bildschirm-UV; **Voraussetzung:** `resolution`-Uniform |
| `vertexChunk` (String, kein Funktionsname) | — | — | — | gemeinsamer Passthrough-Vertex-Shader, Vertex-Programm aller Shader-Module |

**`shaderChunks/colorChunk.js`:** Himmelsfarbe aus zwei geladenen HDR-Texturen — **Voraussetzung:** `time` sowie `clusterWeight`/`metaballWeight`/`burstWeight` als deklarierte Uniforms; `_uvToDirection`/`_fetchDirectionalTexture` (`sampleChunk`) in Scope

| GLSL-Funktion | Semantik |
|---|---|
| `_clusterEnvironment(direction, sourceMap)` / `_metaballEnvironment(...)` / `_burstEnvironment(...)` | Sampling via `_fetchDirectionalTexture`, multipliziert mit `ENVIRONMENT_EXPOSURE` |
| `_rotateAroundYAxis(direction)` | kontinuierliche Rotation der Sample-Richtung mit `time` (visuelle Abwechslung) |
| `blendEnvironment(uv, clusterSourceMap, metaballSourceMap)` | öffentlicher Einstiegspunkt: Berechnung der Richtung aus `uv`, Rotation, 3-Wege-Gewichtsblend aus allen drei `_<phase>Environment`-Aufrufen |

**`shaderChunks/positionChunk.js`:** Physik-Blend für die Ballbewegung — **Voraussetzung:** `stateTexture`, `TEXELS_PER_BALL`, `time`, `motionSpeed`, `clusterWeight`/`metaballWeight`/`burstWeight` in Scope; `stateUV(int)` definiert (aus `simulationShader.js`)

| GLSL-Funktion | Semantik |
|---|---|
| `_computeOrbitState(position, orbit)` | nächster Punkt auf der Orbit-Ellipse + tangentialer Schritt, zusätzliche Skalierung der Winkelgeschwindigkeit mit `motionSpeed` |
| `_computeCenter()` | Schwerpunkt aller 12 Bälle (aus der Zustandstextur) |
| `_metaballVelocity(position, velocity, orbit)` | radiale Rückholkraft zum Orbit + tangentialer Schritt |
| `_clusterVelocity(position)` | sanfter Zug zum Ursprung (`ORIGIN_PULL`) |
| `_burstVelocity(position, center, orbit)` | Abstoßung vom Schwerpunkt, exponentiell abklingend mit der Distanz bis zu einem konstanten Sockel; Stärkeskalierung mit `motionSpeed` |
| `blendPosition(inout position, inout velocity, orbit)` (öffentlich) | Gewichtung & Summierung aller drei Geschwindigkeitsbeiträge, Anwendung auf `position`, phasenabhängige Dämpfung von `velocity` |

**`shaderChunks/shapeChunk.js`:** SDF-Komposition der drei Phasen-Grundkörper sowie Normalenberechnung, nur von `raymarchShader.js` verwendet — **Voraussetzung:** `perlin3D` (`noiseChunk`), `clusterWeight`/`metaballWeight`/`burstWeight`, `time`, Uniform `clusterShapeIndex` sowie die per `fetchBalls()` befüllten globalen `_ballCenter0..11`/`_ballRadius0..11` (siehe `raymarchShader.js`)

| GLSL-Funktion | Semantik |
|---|---|
| `_signedDistanceSphere`/`_signedDistanceBox`/`_signedDistanceCylinder`/`_signedDistanceTorus`/`_signedDistanceCapsule`/`_signedDistancePyramid` | reine, formunabhängige Distanzfunktionen |
| `_generalizedNorm2D(valueA, valueB, exponent)` | Lp-Norm zweier Werte (`(|a|^p+|b|^p)^(1/p)`) — geteilter Baustein der Superquadric-Distanzfunktion |
| `_signedDistanceSuperquadric(point, halfExtents, exponentEastWest, exponentNorthSouth)` | Pseudo-Distanz eines Superquadrics (Barr 1981) über Komposition zweier `_generalizedNorm2D`-Aufrufe (äquatorial, dann meridional) — approximativ, exakt nur für Exponenten, die eine echte Norm ergeben (`2/exponent ≥ 1`) |
| `_ballUnion(point, smoothing)` | `smin`-Verschmelzung der 12 Metaball-Kugeln mit Glättungsradius `smoothing` |
| `_noisyBallUnion(point, smoothing)` | `_ballUnion` + additives `perlin3D`-Oberflächenrauschen |
| `_metaballShape(point)` | `_noisyBallUnion` mit `SMIN_K = 0.35` (lose fusioniert) |
| `_burstShape(point)` | `_noisyBallUnion` mit `SMIN_K = 0.10` (enger fusioniert — liest sich „explodiert") |
| `_clusterShape(point)` | Verzweigung über `clusterShapeIndex` auf eine von sieben Grundkörperfunktionen (`cylinder`/`sphere`/`box`/`torus`/`capsule`/`pyramid`/`superquadric`) — `superquadric` variiert seine beiden Exponenten kontinuierlich über `time` (Lissajous-Pfad mit irrationalem Frequenzverhältnis durch den Formraum von rundlich bis konkav-spitz) |
| `blendShape(point)` (öffentlich) | gewichtete Summe aus `_clusterShape`/`_metaballShape`/`_burstShape` — zeitliche Überblendung, keine räumliche Vereinigung |
| `normal(point)` (öffentlich) | zentrale finite Differenzen auf `blendShape` |

**`shaderChunks/surfaceChunk.js`:** Material-/Lichtantwort, manuelle PBR- & Glas-Implementierung (`MeshPhysicalMaterial` inkompatibel mit Raymarching — Operation auf rasterisierter Geometrie, nicht auf SDF-ausgewerteten impliziten Flächen) — **Voraussetzung:** Uniform `environmentMap`; `_clusterShape`/`normal` (`shapeChunk`), `_fetchDirectionalTexture` (`sampleChunk`), `clusterWeight`/`metaballWeight`/`burstWeight` in Scope

| GLSL-Funktion | Semantik |
|---|---|
| `_shadeReflective(surfaceNormal, rayDirection, normalDotView)` | Cook-Torrance-BRDF (GGX-Distribution + Schlick-Geometrieterm) gegen die gesampelte Environment-Map; geteilt von Metaball & Burst |
| `_clusterTraceInterior(point, rayDirection)` | kurzer Sphere-Trace durch `_clusterShape`s Inneres; Ergebnis: Austrittspunkt/-normale/-weglänge |
| `_clusterRefractedColor(point, surfaceNormal, rayDirection)` | Strahlbrechung beim Ein- & Austritt (Snell'sche Brechung, `GLASS_INDEX_OF_REFRACTION`), exponentielle Mischung (Beer-Lambert, `GLASS_ABSORPTION`) des austretenden Env-Map-Samples mit `GLASS_TINT_COLOR` nach Weglänge |
| `_clusterShading(point, surfaceNormal, rayDirection, normalDotView)` | Fresnel-Mix (`GLASS_FRESNEL_POWER`) aus Spiegelreflexion & `_clusterRefractedColor` |
| `_metaballShading`/`_burstShading` | beide `= _shadeReflective(...)` — identisch |
| `blendShading(point, surfaceNormal, rayDirection)` (öffentlich) | gewichtete Summe aus `_clusterShading`/`_metaballShading`/`_burstShading` |

## 4. Shader-Programme (`shaders/*.js`)

- fertig zusammengesetzte GLSL-Quelltext-Strings je Datei
- „Interface": erwarteter Uniform-Satz

**`shaders/simulationShader.js`:** Sim-Pass-Shader, intern von `simulation.js` verwendet — Interpolation von `vertexChunk` + `positionChunk` — Exporte: `simulationVertex`, `simulationFragment`

| Uniform | Typ | Bereich / Semantik |
|---|---|---|
| `stateTexture` | `sampler2D` | Eingangszustand (Position/Geschwindigkeit/Orbit je Ball) |
| `clusterWeight`, `metaballWeight`, `burstWeight` | `float` | aus `getWeights()`, identisch zu den Shading-Uniformen des Haupt-Materials |
| `motionSpeed` | `float ∈ [0,1]` | skaliert Orbit-Winkelgeschwindigkeit & Bursts Abstoßungsstärke |

- eigener Code: `stateUV(int)`, `fetchPosition`/`fetchVelocity`/`fetchOrbit`/`fetchInitialRadius` (Rohdaten-Plumbing), `main()` mit unverändertem Orbit-Texel-Durchgang oder `blendPosition`-Aktualisierung von Position/Geschwindigkeit, je nach Texel

**`shaders/environmentShader.js`:** Equirectangular-Umgebungsgenerator, intern von `environment.js` verwendet — Interpolation von `sampleChunk` + `screenChunk` + `colorChunk` — Export: `environmentFragment` (`vertexChunk` direkt als Vertex-Programm über `gpuSetup.js`, kein eigener Vertex-Export nötig)

| Uniform | Typ | Bereich / Semantik |
|---|---|---|
| `time` | `float` | [0,∞), treibt die Sky-Rotation |
| `resolution` | `vec2` | Rendertarget-Größe |
| `clusterSourceMap`, `metaballSourceMap` | `sampler2D` | geladene HDR-Texturen |
| `metaballWeight`, `clusterWeight`, `burstWeight` | `float` | aus `getWeights()` |

- eigener Code: nur `main()` (`uv = _screenUV()`, dann `blendEnvironment(uv, clusterSourceMap, metaballSourceMap)`)

**`shaders/raymarchShader.js`:** Haupt-Render-Pass — Interpolation von `noiseChunk` + `sampleChunk` + `shapeChunk` + `surfaceChunk`, in dieser Reihenfolge (Form vor der Oberflächenfunktion, die sie braucht) — Exporte: `mainVertex` (= `vertexChunk`), `mainFragment`

| Uniform | Typ | Bereich / Semantik |
|---|---|---|
| `time` | `float` | [0,∞) |
| `resolution` | `vec2` | Viewport-Größe |
| `cameraWorldPosition` | `vec3` | für Strahlursprung |
| `environmentMap` | `sampler2D` | nur von `surfaceChunk` gelesen |
| `stateTexture` | `sampler2D` | Ballzustand — `fetchBalls()` liest Position + Radius je Kugel |
| `metaballWeight`, `clusterWeight`, `burstWeight` | `float` | steuern SDF-Komposition (`shapeChunk`) & Shading-Blend (`surfaceChunk`) |
| `clusterShapeIndex` | `int` | wählt die aktive Cluster-Grundform (`shapeChunk`) |

- eigener Code: `fetchBalls()` (Füllen der globalen `_ballCenter*`/`_ballRadius*` aus der Zustandstextur), `_primaryRayDirection()`, `_computeStepSafety()` (Dämpfung der Raymarch-Schrittweite während einer echten Cross-Phase-Überblendung, ohne Kosten in eingeschwungenen Zuständen), `raymarch()`, `main()` (`fetchBalls()` → `raymarch()` → `blendShading()`)

**`shaders/bloomShader.js`:** Bloom-Postprocessing, intern von `gpuSetup.initializeBloomSetup` verwendet — Interpolation von `screenChunk` — drei Fragment-Shader-Exporte, Vertex-Shader jeweils aus `vertexChunk`

| Export | Uniforms | Semantik |
|---|---|---|
| `brightExtractFragment` | `mainTexture`, `resolution`, `threshold` | Extraktion der Pixel oberhalb eines Luma-Schwellenwerts |
| `blurFragment` | `blurTexture`, `resolution`, `blurDirection` | separabler 9-Tap-Gauß; `blurDirection = (1,0)` für den horizontalen, `(0,1)` für den vertikalen Pass |
| `compositeFragment` | `mainTexture`, `bloomTexture`, `resolution`, `intensity` | additiv: `main + bloom × intensity` |
