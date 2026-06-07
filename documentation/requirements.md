# Requirements: T-1003

## Konzept & Ziel

- Interaktive Anwendung: abstraktes, nicht-anthropomorphes Lebewesen — mathematisch modelliert und animiert
- Kernthese: Tendenz, menschliche Verhaltensweisen in artifizielle Konstrukte hineinzuinterpretieren
- Zentraler Mechanismus: **Beobachtung verändert das Beobachtete** — Wesen reagiert auf wahrgenommene Präsenz
- Emotionale Doppelwirkung: Sicherheitsgefühl (gefangen, künstlich) + Unruhe (Andersartigkeit, Unvorhersehbarkeit)
- Ästhetische Referenz: T-1000

---

## Technische Architektur

- Browserbasierte **WebGL-Applikation** mit **Three.js** (r160) als Rendering-Framework
- Drei-Ebenen-Architektur:
  - **Anwendungsebene (CPU):** Steuerlogik, Phasenwechsel, Nutzerinput, Uniform-Übergabe
  - **Simulationsebene (GPU):** Render-to-Texture, 1D-Zustandstextur, Ping-Pong-Buffering
  - **Shader-Ebene (GPU):** Raymarching, SDF-Auswertung, Normalenberechnung, Beleuchtung
- Ballzustände verbleiben vollständig auf der GPU (kein CPU-Roundtrip pro Frame)
- Erfordert lokalen Webserver (ES-Module, kein `file://`)

### Dateistruktur

```
T-1003/
├── index.html                  ← HTML-Grundgerüst + importmap (Three.js CDN)
├── main.js                     ← Szenenaufbau, Material, animate-Loop
├── src/
│   ├── renderer.js             ← WebGLRenderer, PerspectiveCamera, Resize
│   ├── simulation.js           ← Ping-Pong RenderTargets, Sim-Pass (GPU)
│   ├── gpuSetup.js             ← Fullscreen-Quad-Factory (makeGpuSetup)
│   ├── phase.js                ← FSM, getLogicalPhase/VisualPhase/MotionSpeed, reportMotion(), onPhaseTransition()
│   ├── balls.js                ← Initialzustand der 12 Bälle (Startwerte für GPU-Textur)
│   ├── camera.js               ← statische Kamera, Sakkaden-Blick
│   ├── input.js                ← Webcam Frame-Differencing → reportMotion() → phase.js FSM
│   ├── audio.js                ← Phasengekoppelte Klangkulisse (Stub)
│   └── environment.js          ← dynamische PMREM-Generierung
├── shaders/
│   ├── simulationShader.js     ← Physik-GLSL (Sim-Pass); interpoliert simulationLibrary
│   ├── environmentShader.js    ← Equirectangular-GLSL; interpoliert noiseLibrary + moodLibrary
│   └── raymarchShader.js       ← Rendering-GLSL; interpoliert noiseLibrary + moodLibrary + raymarchLibrary
└── libraries/
    ├── vertexShaderLibrary.js  ← GLSL-Chunk: gemeinsamer Passthrough-Vertex-Shader
    ├── noiseLibrary.js         ← GLSL-Chunk: perlin2D, worley2D, worley3D
    ├── moodLibrary.js          ← GLSL-Chunk: Farbpalette (MOOD_*), Phasengewichte (tMeta/Cluster/Burst), moodColor()
    ├── raymarchLibrary.js      ← GLSL-Chunk: shadeMetal, shadeGlass, shadeHit
    └── simulationLibrary.js    ← GLSL-Chunk: applySimulation (unified, visualPhase-blended)
```

### Modul-Interface-Prinzip

Jedes Modul besitzt seine Uniforms vollständig. `main.js` kennt keine Uniform-Namen:

```javascript
// Einmalig beim Material-Setup:
...simulation.getUniformDefs()    // → { stateTex }
...environment.getUniformDefs()   // → { envMap }
input.initInput()                                    // Webcam-Stream + Detektor-Setup

// Jeden Frame:
input.updateInput()          // Bewegungsanalyse → reportMotion()
stepSimulation()             // liest logicalPhase/visualPhase/time/motionSpeed aus phase.js
applyStateToMaterial(material)
applyEnvState(material)
```

### Event-Koordination: Zeit / Input → Phase → Ausgaben

Phase ist der gemeinsame Intermediär zwischen Zeitsteuerung, externem Input und den Ausgabekanälen (Shading, Environment, Audio):

```
tick() / triggerPhase() / releasePhase()
  └→ _checkSlot() [in phase.js]
       └→ onPhaseTransition-Listener:
            environment.js  → PMREM-Regenerierung
            audio.js        → Klangwechsel
```

`onPhaseTransition(fn)` ist die einzige Stelle für Schwellenwert-Erkennung. Subscriber registrieren sich direkt bei `phase.js` — keine Vermittlung durch `main.js`. Input-getriggerte Übergänge (via `triggerPhase`) durchlaufen denselben Mechanismus.

---

## Kernkomponenten

### Metaballs

- **n = 12 Metaballs** (experimentell anpassbar)
- Jeder Ball i definiert durch Position **c**_i ∈ ℝ³, Basisradius r_i^0 ∈ ℝ, Geschwindigkeit **v**_i ∈ ℝ³
- Komposition via **smooth minimum (smin)** zum Gesamt-SDF:

$$d(\mathbf{x}, t) = \operatorname{smin}_{i=1}^{n} \bigl(\|\mathbf{x} - \mathbf{c}_i\| - r_i(t)\bigr)$$

- Rendering: **Raymarching** auf fullscreen Quad — keine explizite Geometrie
- Normalenberechnung: zentrale finite Differenzen auf dem SDF
- Sensoren / augenähnliche Elemente: Reaktivität als Mimik-Äquivalent ⚠️ offen

### Noise

**Noise-Bibliothek** (`noiseLibrary.js`): Perlin-Noise N: ℝ² × ℝ → [−1, 1] und Worley-Noise W: ℝⁿ → [0, ~1], vollständig auf Shader-Ebene.

**Radiusmodulation** (pro Ball, per Shader-Eval) — kein Seed, Ball-Position differenziert:
$$r_i(t) = r_i^0 + \alpha \cdot \bigl(\mathcal{N}(\mathbf{c}_i^{xy}, t) + \mathcal{N}(\mathbf{c}_i^{yz}, t)\bigr)$$

**Oberflächenperturbation** (auf komponierten SDF):
$$\hat{d}(\mathbf{x}, t) = d(\mathbf{x}, t) + \beta \cdot \mathcal{N}(\mathbf{x},\, t)$$

### Phasensystem

**Input-gesteuerter Finite State Machine** — kein Zeitzyklus; Übergänge durch registrierte Bewegung aus `input.js`.

| Phase | `logicalPhase` | Physik | Shading |
|---|---|---|---|
| **Metaball** | 0.0 (fix) | Analyt. Einzelorbits, nearest-phi-Attraktor | Metallisch-reflektierend |
| **Cluster** | 1.0 (fix) | Zentripetalkraft + Ursprungsanziehung | Transluzent + glasartig |
| **Burst** | 1.0 + s ∈ (1, 2] | Exponentiell abklingende Abstoßung | Metallisch-reflektierend |

**FSM-Ablauf:**

```
                      reportMotion(speed)
                      + CLUSTER_COOLDOWN abgelaufen
  ┌──────────┐  ─────────────────────────────────→  ┌───────────┐
  │ CLUSTER  │                                       │   BURST   │
  │ (default)│  ←─────────────────────────────────  │(zufällige │
  └──────────┘         zurück nach                  │  Dauer)   │
       ↑               METABALL_MIN_FRAMES           └───────────┘
       │               + METABALL_NO_MOTION_FRAMES        │
       │               Stille                             │ Burst-Ende
       │                                                  ↓
       └──────────────────────────────────────  ┌──────────────────┐
                                                │    METABALL      │
                                                │ reportMotion →   │
                                                │ noMotion = 0     │
                                                └──────────────────┘
```

**Parameter (alle in `phase.js`):**

| Konstante | Wert | Semantik |
|---|---|---|
| `BURST_MIN_FRAMES` | 60 (1.0 s) | Mindest-Burst-Dauer |
| `BURST_MAX_FRAMES` | 100 (1.7 s) | Max-Burst-Dauer (zufällig dazwischen) |
| `METABALL_MIN_FRAMES` | 800 (13.3 s) | Verbleibt in Metaball unabhängig von Input |
| `METABALL_NO_MOTION_FRAMES` | 360 (6.0 s) | Stille-Schwelle → Rückkehr zu Cluster |
| `CLUSTER_COOLDOWN_FRAMES` | 180 (3.0 s) | Sperrzeit nach Burst vor nächstem |

**Parameter (in `input.js`):**

| Konstante | Wert | Semantik |
|---|---|---|
| `INPUT_SPEED_THRESHOLD` | 0.20 | Minimale normierte Geschwindigkeit |
| `INPUT_PERSIST_FRAMES` | 2 | Konsekutive Frames mit Bewegung vor `reportMotion` |

**Burst-Intensität:** `s = clamp(speed, 0, 1)` aus `input.js` → `logicalPhase = 1.0 + s` → Abstoßungskraft $F_0 = 0.010 + s \cdot 0.035$.

**Blend-Gewichte** (berechnet in `phase.js` aus `visualPhase` und `logicalPhase`): Drei per `smoothstep` aus `visualPhase` abgeleitete Gewichte, die immer 1 ergeben. `clusterBlend` ist zusätzlich durch `logicalPhase` gesperrt, sodass kein Cluster-Shading erscheint, solange der FSM im Metaball-State ist. Die Simulation verwendet dieselben Smoothstep-Bereiche, jedoch ohne diesen Guard (→ Abschnitt Physikdynamik).

**Metaball** — direktes Orbit-Update (nearest-phi):

Pro Frame wird der nächste Punkt auf der Orbit-Ellipse zur aktuellen Ballposition bestimmt. Der Ball wird radial mit einer kleinen Lerp-Rate dorthin gezogen und gleichzeitig um einen Frame-Schritt tangential weitergeführt — kein Spring, kein Overshoot. Der Startwinkel $\phi_\text{rand} \sim \mathcal{U}[0, 2\pi)$ wird bei Programmstart gezogen, sodass jeder Run anders aussieht. Kein Noise in der Metaball-Phase.

$$\mathbf{c}_i^\text{orbit}(\phi) = \begin{pmatrix} r_i \cos\phi \\ r_i \sin\phi\,\sin\theta_i \\ r_i \sin\phi\,\cos\theta_i \cdot 0.28 \end{pmatrix}$$

Die effektive Winkelgeschwindigkeit skaliert additiv mit `motionSpeed` — stärkere erkannte Bewegung beschleunigt alle Orbits.

**Cluster** — Masseschwerpunkt und Anziehung:
$$\hat{\mathbf{c}}(t) = \frac{1}{n}\sum_{i=1}^n \mathbf{c}_i(t), \qquad \mathbf{v}_i(t) \mathrel{+}= k_1(\hat{\mathbf{c}} - \mathbf{c}_i) + k_2(0 - \mathbf{c}_i)$$

Perlin-Noise-Störung auf $\mathbf{v}_i$ sorgt für organische, unregelmäßige Clusterbewegung.

**Burst** — exponentiell abklingende Abstoßung (stark lokal, asymptotisch 0):
$$\mathbf{v}_i(t) \mathrel{+}= \hat{\mathbf{d}}_i \cdot F_0 \cdot e^{-\lambda\|\mathbf{d}_i\|}, \qquad \mathbf{d}_i = \mathbf{c}_i - \hat{\mathbf{c}}$$

$F_0$ skaliert mit der Eingabe-Geschwindigkeit $s \in [0,1]$ (kodiert in `logicalPhase - 1.0`). Balls, die die Sichtbarkeitsgrenzen überschreiten, werden reflektiert (`reflectBounds`).

---

## Daten & Pipeline

### 1D-Zustandstextur

Format: RGBA32F, Breite 36 (3 Texel × 12 Bälle), Höhe 1

| Texel | r | g | b | a |
|---|---|---|---|---|
| 3i   | pos.x | pos.y | pos.z | r_i^0 |
| 3i+1 | vel.x | vel.y | vel.z | 0 (unused) |
| 3i+2 | orbitRadius | orbitSpeed | phi0 (zufällig bei Init) | orbitInclination |

Texel 3i+2: statische Orbit-Parameter; `orbitPhase` wird bei Init mit einem zufälligen Offset $\phi_\text{rand} \sim \mathcal{U}[0, 2\pi)$ addiert, sodass jeder Run anders aussieht. Passthrough im Sim-Shader — nie überschrieben.

### Render-Passes pro Frame

```
[Sim-Pass]   simulationShader liest stateTexA → schreibt stateTexB; swap(A,B)
[Env-Pass]   environmentShader rendert 512×256 Equirectangular → PMREMGenerator  (alle 4 Frames)
[Main-Pass]  raymarchShader liest stateTexB + envMap → Screen
```

Alle Passes: Fullscreen Quad + OrthographicCamera → WebGLRenderTarget (außer Main-Pass → Screen).

### Physik- und Phasendynamik (GPU, `simulationLibrary.js`)

Pro Fragment liest der Shader die aktuelle Ball-Position/-Geschwindigkeit sowie Orbit-Parameter (Texel 3i+2). Die Physik wird **nicht** hart per `logicalPhase` umgeschaltet, sondern kontinuierlich über `visualPhase` gemischt (`applySimulation`):

Die Physik wird über `visualPhase` kontinuierlich zwischen den drei Modi gemischt — kein harter Umschalter. Blend-Gewichte `metaT`, `clusterT`, `burstT` entsprechen den gleichen Smoothstep-Bereichen wie die Shading-Gewichte in `phase.js`, sind jedoch **bewusst ungegated** (kein `logicalPhase`-Guard): beim Burst→Metaball-Rückzug wird kurzzeitig Zentripetalkraft mitgewendet, um den Rückzug auf die Orbit-Ellipse zu glätten.

**Positions-Update** (kombiniert):
$$\Delta\mathbf{c}_i = \Delta\mathbf{c}^\text{orbit} \cdot \text{metaT} + \mathbf{v}_i \cdot (\text{clusterT} + \text{burstT})$$

**Kräfte**: Zentripetalkraft ist immer aktiv und baut $\mathbf{v}_i$ schon während der Metaball-Phase auf — beim Übergang zu Cluster ist so bereits Impuls in der richtigen Richtung vorhanden. Cluster-Noise und Burst-Abstoßung werden mit `clusterT` bzw. `burstT` gewichtet. Velocity-Decay wird phasenabhängig interpoliert (hoch bei Burst, niedrig bei Cluster). Nach dem Positions-Update wird `reflectBounds` aufgerufen.

### Uniforms (CPU → Shader, pro Frame)

| Uniform | Quelle | Beschreibung |
|---|---|---|
| `time` | phase.js | Globale Zeit |
| `visualPhase` | phase.js | Visueller Phasenwert [0, 2] (geglättet) |
| `metaballBlend`, `clusterBlend`, `burstBlend` | phase.js | Vorberechnete Blend-Gewichte (Summe = 1) |
| `motionSpeed` | phase.js (`getMotionSpeed()`) | Erkannte Bewegungsgeschwindigkeit ∈ [0,1]; exponentiell abklingend (×0.97/Frame) ohne Bewegung |
| `camPos` | renderer.js | Kameraposition |
| `resolution` | renderer.js | Viewport-Größe |
| `logicalPhase` | phase.js | Diskrete Phase: 0.0/1.0/1.0+s — für Burst-Intensität in Sim |
| `visualPhase` | phase.js | Geglättete Phase [0,1.5] — steuert Physik-Blend im Sim-Shader |
| `stateTex` | simulation.js | Ball-Zustandstextur (RGBA32F, 36×1) |
| `envMap` | environment.js | PMREM Environment-Map (dynamisch regeneriert) |

---

## Kamera

- **Statische Grundposition**, kein OrbitControls
- Kamerabewegung: langsame, algorithmisch gesteuerte Rotation um das Objekt
- Keine direkte Nutzersteuerung der Kamera
- Kamera und externes Eingabegerät sind **vollständig getrennte Systeme**

---

## Input & Interaktion

### Zeit
Primärer deterministischer Input; steuert Phasenzyklus. Variation entsteht durch inkommensurable Orbit-Frequenzen — keine zwei Phasen sehen gleich aus.

### Externes Eingabegerät (`input.js`)
- Kamerabasiertes Gerät (z.B. Webcam + Personenerkennung) registriert Anwesenheit und Bewegung
- Ruft `phase.js`-Interfaces direkt auf — keine Kopplung durch `main.js`:
  - `reportMotion(speed)` bei erkannter Bewegung; `phase.js` entscheidet über Burst-Auslösung
  - Bewegungsgeschwindigkeit skaliert Burst-Stärke
- Anleitungsinteraktion als Installationskonzept denkbar ⚠️ offen

### Environment (`environment.js`)

Eine einzelne dynamische PMREM wird kontinuierlich aus einem GPU-seitigen Equirectangular-Shader regeneriert:

```
environmentShader.js  →  WebGLRenderTarget (512×256, HalfFloat)
                      →  PMREMGenerator.fromEquirectangular()
                      →  material.uniforms.envMap
```

`environmentShader.js` erzeugt abstrakte, nicht-gegenständliche Umgebungen parameterisiert durch `metaballBlend/clusterBlend/burstBlend` und `time` (Worley-Blobs, Perlin-Ambient, gerichtetes Licht). Regenerierung alle 4 Frames + bei Phasenübergängen (via `onPhaseTransition`). Anisotropes Filtering auf der PMREM-Textur (`renderer.capabilities.getMaxAnisotropy()`) reduziert Aliasing bei schrägen Sampling-Winkeln.

Phasengekoppelte Stimmung der Umgebung:

| Parameter | Metaball | Cluster | Burst |
|---|---|---|---|
| Farbtemperatur | kühl-neutral | warm-diffus | harte Kontraste |
| Helligkeit | mittel | niedrig, gläsern | hohe Highlights |
| Direktivität | allseitig (Worley-Blobs) | weich, zentral (Top-Glow) | gerichtet, scharf (Key-Light + Worley) |

### Audio (`audio.js`) ⚠️ offen
- Phasengekoppelt über `onPhaseTransition`: niederfrequent (Metaball/Cluster) ↔ hochfrequent (Burst)
- Stimmungskopplung mit Environment: hell/offen ↔ Dur; dunkel/gesättigt ↔ Moll/Dissonanz
- Technische Soundkulisse vs. Musik: offen

---

## Design

### Geometrie
- Vollständig implizite Flächen; einziges explizites Primitiv: fullscreen Quad
- Sichtbare Geometrie emergiert als Isofläche des komponierten SDF
- Topologie ändert sich kontinuierlich ohne Neuberechnung von Mesh-Daten

### Animation
- Metaball-Phase: zirkulärer Drift, zeitweiliges Verschwinden/Auftauchen einzelner Segmente
- Cluster-Phase: kompakte, pulsierende Masse durch Noise-Modulation
- Burst-Phase: schlagartige Auflösung, Zerstreuung in alle Richtungen
- Shading-Übergänge: kontinuierlich über skalaren Phasenwert interpoliert
- Konkrete Bewegungsparameter experimentell zu bestimmen ⚠️ offen

### Grafik
- **Metallisch-reflektierend** (Metaball + Burst): PMREM-Sampling, rauheitsabhängig; Reflexionen fremd und nicht verortbar
- **Transluzent-lumineszent** (Cluster): Fresnel, Streuung, angedeutete Materialdicke; inneres Leuchten
- Schwarzer Hintergrund; Skybox als Alternative ⚠️ offen
- Abstrakte dynamische Environment-Map — keine erkennbaren Strukturen

### Shading-Modul (`raymarchLibrary.js`)

Da `MeshPhysicalMaterial` mit Raymarching inkompatibel ist (es operiert auf rasterisierter Geometrie, nicht auf SDF-ausgewerteten impliziten Flächen), wird das Shading vollständig manuell nachimplementiert. Ziel-Feature-Set, orientiert an `MeshPhysicalMaterial`:

| Modus | Ziel-Features |
|---|---|
| **Metallisch** | PMREM-Sampling, rauheitsabhängiger Mip-Level, Fresnel (Schlick), GGX-Verteilung, Geometry-Term |
| **Transluzent** | Transmission, Absorption (Beer'sches Gesetz), Dünnfilm-Fresnel, SSS-Näherung, inneres Leuchten |

Einziger öffentlicher Aufruf aus `main()` des Fragment-Shaders:

```glsl
color = shadeHit(p, n, rd, phase);
```

`raymarchLibrary.js` ist ein GLSL-Chunk, der in `raymarchShader.js` nach `map()` interpoliert wird (notwendig, da `shadeCluster` `map()` für einen Materialdicken-Proxy aufruft). Austausch des Materialmodells erfordert nur Änderungen in `raymarchLibrary.js`.

### Audio
- Phasengekoppelte Klangkulisse ⚠️ offen
- Stimmungskopplung mit Environment-Parametern

---

## Implementierungsstand

| Komponente | Status |
|---|---|
| Raymarching + SDF + smin | ✅ |
| Noise-Bibliothek (Perlin, Worley 2D/3D) | ✅ |
| Phasensystem (zeitgesteuert + externer Trigger + onPhaseTransition) | ✅ |
| GPU-Simulation (1D-Textur RGBA32F, Ping-Pong, simulationShader.js) | ✅ |
| Shading-Modul (raymarchLibrary.js, shadeHit) | ✅ |
| Environment (dynamische PMREM, environmentShader.js) | ✅ |
| Kamera (autonome Bewegung) | ⚠️ Stub |
| Externes Eingabegerät (input.js) | ✅ |
| Audio | ⚠️ Stub |
| Sensorik / augenähnliche Elemente | ⚠️ |
| Skybox / Hintergrund | ⚠️ |
| Bewegungsparameter (experimentell) | ⚠️ |

---

## Offene Punkte ⚠️

| # | Thema | Notiz |
|---|---|---|
| 1 | Kamera | autonome Bewegung (Sakkaden, Orbit) noch offen |
| 2 | input.js | Externes Gerät: Personenerkennung → triggerPhase() |
| 3 | Audio | Phasenkopplung via onPhaseTransition, Stimmungsdesign |
| 4 | Sensorik / Augen | Augenähnliche Elemente als Reaktivitätsmerkmal |
| 5 | Skybox / Hintergrund | Separater Ansatz nötig |
| 6 | Bewegungsparameter | Experimentell: Driftgeschwindigkeit, Cluster-Übergang, Burst-Intensität |
| 7 | Interaktionsanleitung | "Augen zuhalten" etc. als Installationskonzept |
