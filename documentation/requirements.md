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
│   ├── constants.js            ← Cross-Datei-Konstanten (BALL_COUNT, Blend-Ranges, ...) + Initialzustand der 12 Bälle + glslFloat()
│   ├── camera.js               ← statische Kamera (stub)
│   ├── input.js                ← Webcam Frame-Differencing → reportMotion() → phase.js FSM
│   ├── audio.js                ← Phasengekoppelte Klangkulisse (Stub)
│   ├── ui.js                   ← Env-Preset-Buttons (DOM-Event-Wiring → setEnvPreset())
│   └── environment.js          ← dynamische Equirectangular-Env-Map-Generierung
├── shaders/
│   ├── simulationShader.js     ← Physik-GLSL (Sim-Pass); interpoliert simulationChunk
│   ├── environmentShader.js    ← Equirectangular-GLSL; interpoliert noiseChunk + moodChunk
│   ├── raymarchShader.js       ← Rendering-GLSL; interpoliert noiseChunk + moodChunk + raymarchChunk
│   └── bloomShader.js          ← Bloom Post-Processing (brightExtract, blur, composite Fragment-Shader)
└── shaderChunks/
    ├── vertexChunk.js          ← GLSL-Chunk: gemeinsamer Passthrough-Vertex-Shader
    ├── noiseChunk.js           ← GLSL-Chunk: perlin2D, worley2D
    ├── moodChunk.js            ← GLSL-Chunk: Farbpalette (MOOD_*), Phasengewichte (tMeta/Cluster/Burst), moodColor()
    ├── raymarchChunk.js        ← GLSL-Chunk: shadeMetaball, shadeCluster, shadeBurst, shadeHit
    └── simulationChunk.js      ← GLSL-Chunk: applySimulation (unified, visualPhase-blended)
```

### Modul-Interface-Prinzip

Jedes Modul besitzt seine Uniforms vollständig. `main.js` kennt keine Uniform-Namen:

```javascript
// Einmalig beim Material-Setup:
...simulation.getUniformDefs()    // → { stateTex }
...environment.getUniformDefs()   // → { envMap }
input.initInput()                                    // Webcam-Stream + Detektor-Setup
ui.initUI()                                          // Env-Preset-Buttons → setEnvPreset()

// Jeden Frame:
input.updateInput()          // Bewegungsanalyse → reportMotion()
stepSimulation()             // liest logicalPhase/visualPhase/time/motionSpeed aus phase.js
applyStateToMaterial(material)
applyEnvState(material)
```

### Event-Koordination: Zeit / Input → Phase → Ausgaben

Phase ist der gemeinsame Intermediär zwischen Zeitsteuerung, externem Input und den Ausgabekanälen (Shading, Environment, Audio):

```
tick() / reportMotion(speed)
  └→ onPhaseTransition-Listener:
       environment.js  → Equirectangular-Regenerierung
       audio.js        → Klangwechsel (geplant)
```

`onPhaseTransition(fn)` ist die einzige Stelle für Schwellenwert-Erkennung. Subscriber registrieren sich direkt bei `phase.js` — keine Vermittlung durch `main.js`.

---

## Kernkomponenten

### Metaballs

- **n = 12 Metaballs** (experimentell anpassbar)
- Jeder Ball i definiert durch Position **c**_i ∈ ℝ³, Basisradius r_i^0 ∈ ℝ, Geschwindigkeit **v**_i ∈ ℝ³
- Komposition via **smooth minimum (smin)** zum Gesamt-SDF:

$$d(\mathbf{x}, t) = \operatorname{smin}_{i=1}^{n}\bigl(\|\mathbf{x} - \mathbf{c}_i\| - r_i(t),\; k\bigr)$$

Der Verschmelzungsradius $k$ wird phasenabhängig aus den Blend-Gewichten skaliert.

- Rendering: **Raymarching** auf fullscreen Quad — keine explizite Geometrie
- Normalenberechnung: zentrale finite Differenzen auf dem SDF
- Sensoren / augenähnliche Elemente: Reaktivität als Mimik-Äquivalent ⚠️ offen

### Noise

**Noise-Bibliothek** (`noiseChunk.js`): Perlin-Noise N: ℝ² × ℝ → [−1, 1] und Worley-Noise W: ℝⁿ → [0, ~1], vollständig auf Shader-Ebene.

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

| Konstante | Semantik |
|---|---|
| `BURST_MIN_FRAMES` | Mindest-Burst-Dauer (fixe Basis, 60 Frames) — bemessen, dass `visualPhase` bei `VISUAL_PHASE_RATE_BURST` auch bei minimaler Eingabe-Intensität spürbar in den Burst-Smoothstep-Bereich einschwingt (~78 % Annäherung ans Ziel), bevor die FSM zu Metaball wechselt, ohne die Reaktion sluggish wirken zu lassen |
| `BURST_MAX_FRAMES` | Max-Burst-Dauer (100 Frames) — Basis + linear mit der erkannten Bewegungsgeschwindigkeit interpolierter Verstärker obendrauf, **kein Zufallsanteil** |
| `METABALL_MIN_FRAMES` | Verbleibt in Metaball unabhängig von Input |
| `METABALL_NO_MOTION_FRAMES` | Stille-Schwelle → Rückkehr zu Cluster |
| `CLUSTER_COOLDOWN_FRAMES` | Sperrzeit nach Burst vor nächstem |

**Parameter (in `input.js`):**

| Konstante | Semantik |
|---|---|
| `INPUT_SPEED_THRESHOLD` | Minimale normierte Geschwindigkeit |
| `INPUT_PERSIST_FRAMES` | Konsekutive Frames mit Bewegung vor `reportMotion` |

**Burst-Intensität:** `s = clamp(speed, 0, 1)` aus `input.js` → `logicalPhase = 1.0 + s` → Abstoßungskraft $F_0$ skaliert linear mit $s$.

**Blend-Gewichte** (berechnet in `phase.js` aus `visualPhase`): Drei per `smoothstep` aus `visualPhase` abgeleitete Gewichte, die immer 1 ergeben. Die Cluster-Komponente wird zusätzlich durch ein exponentiell nachgeführtes Gate (`_clusterActivation`, Rate 0.20/Frame) gedämpft — verhindert den teal-Flash beim Burst→Metaball-Übergang, wenn `visualPhase` kurz durch den Cluster-Smoothstep-Bereich läuft. Die Simulation verwendet dieselben Smoothstep-Bereiche (→ Abschnitt Physikdynamik).

**Metaball** — direktes Orbit-Update (nearest-phi):

Pro Frame wird der nächste Punkt auf der Orbit-Ellipse zur aktuellen Ballposition bestimmt. Die radiale Annäherung an diesen Punkt ist geschwindigkeitsgleich mit dem tangentialen Orbit-Schritt (per `min()` überschwingungsfrei gekappt) — kein fixer, langsamer Kriechwert. Das ist bewusst so gewählt: ein aus dem Burst verstreuter Ball soll mit derselben Dringlichkeit zurückschnappen, mit der er anschließend orbitiert, statt sichtbar langsam anzukommen und erst danach auf Orbit-Tempo zu beschleunigen — letzteres läse sich als Zögern, nicht als das intendierte "Panik"-Verhalten des Übergangs. Der Startwinkel $\phi_\text{rand} \sim \mathcal{U}[0, 2\pi)$ wird bei Programmstart gezogen, sodass jeder Run anders aussieht. Kein Noise in der Metaball-Phase.

$$\mathbf{c}_i^\text{orbit}(\phi) = \begin{pmatrix} r_i \cos\phi \\ r_i \sin\phi\,\sin\theta_i \\ r_i \sin\phi\,\cos\theta_i \cdot 0.28 \end{pmatrix}$$

Die effektive Winkelgeschwindigkeit skaliert additiv mit `motionSpeed` — stärkere erkannte Bewegung beschleunigt alle Orbits.

**Cluster** — Masseschwerpunkt und Anziehung:
$$\hat{\mathbf{c}}(t) = \frac{1}{n}\sum_{i=1}^n \mathbf{c}_i(t), \qquad \mathbf{v}_i(t) \mathrel{+}= k_1(\hat{\mathbf{c}} - \mathbf{c}_i) + k_2(0 - \mathbf{c}_i)$$

Perlin-Noise-Störung auf $\mathbf{v}_i$ sorgt für organische, unregelmäßige Clusterbewegung.

**Zielform / Linie in Cluster ⚠️ offen** (siehe Offene Punkte #4): Cluster zieht aktuell ausschließlich zum Massezentrum $\hat{\mathbf{c}}(t)$ — eine kompakte, formlose Masse. Die Physik ist inzwischen entlang genau dieser Erweiterung modularisiert: `_simulateCluster(inout vel, pos, target, weight)` in `simulationChunk.js` nimmt den Attraktionspunkt bereits als Parameter `target` (heute immer der Centroid) und besitzt die komplette Cluster-Physik (Anziehung + Rauschen) selbst. Ein alternatives Zielform-Regime (z. B. eine Linie) müsste nur den `target`-Wert berechnen (nächstgelegener Punkt auf der Zielkurve statt Centroid) und denselben Helfer aufrufen — `applySimulation()` selbst, Shading, Environment und die SDF-Komposition (`map()` in `raymarchShader.js`) bleiben unberührt.

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
[Env-Pass]   environmentShader rendert Equirectangular → equirectTarget (periodisch)
[Main-Pass]  raymarchShader liest stateTexB + envMap → mainTarget (W×H)
[Bloom-1]    brightExtract (Luma > threshold) → extractTarget (W/2 × H/2)
[Bloom-2/3]  separabler 9-Tap-Gauß H+V → blurBTarget (W/2 × H/2)
[Composite]  main + blur × intensity → Screen (additive)
```

Alle Passes: Fullscreen Quad + OrthographicCamera → WebGLRenderTarget (außer Main-Pass → Screen).

### Physik- und Phasendynamik (GPU, `simulationChunk.js`)

Pro Fragment liest der Shader die aktuelle Ball-Position/-Geschwindigkeit sowie Orbit-Parameter (Texel 3i+2). Die Physik wird **nicht** hart per `logicalPhase` umgeschaltet, sondern kontinuierlich über `visualPhase` gemischt (`applySimulation`):

Die Physik wird über `visualPhase` kontinuierlich zwischen den drei Modi gemischt — kein harter Umschalter. Blend-Gewichte `metaballBlend`, `clusterBlend`, `burstBlend` (lokale Variablen in `applySimulation`, benannt wie die gleichnamigen Shading-Uniforms) entsprechen den gleichen Smoothstep-Bereichen wie die Shading-Gewichte in `phase.js`, sind jedoch **bewusst ungegated** (kein `logicalPhase`-Guard): beim Burst→Metaball-Rückzug wird kurzzeitig Zentripetalkraft mitgewendet, um den Rückzug auf die Orbit-Ellipse zu glätten.

**Positions-Update** (kombiniert):
$$\Delta\mathbf{c}_i = \Delta\mathbf{c}^\text{orbit} \cdot \text{metaballBlend} + \mathbf{v}_i \cdot (\text{clusterBlend} + \text{burstBlend})$$

**Kräfte**: Zentripetalkraft ist immer aktiv und baut $\mathbf{v}_i$ schon während der Metaball-Phase auf — beim Übergang zu Cluster ist so bereits Impuls in der richtigen Richtung vorhanden. Cluster-Noise und Burst-Abstoßung werden mit `clusterBlend` bzw. `burstBlend` gewichtet. Velocity-Decay wird phasenabhängig interpoliert (hoch bei Burst, niedrig bei Cluster). Nach dem Positions-Update wird `reflectBounds` aufgerufen.

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
| `envMap` | environment.js | Equirectangular Environment-Map (dynamisch regeneriert, direkt gesampelt, keine PMREM-Prefilterung) |

---

## Kamera

- **Statische Grundposition**, kein OrbitControls
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

### Facetracking ⚠️ offen (siehe Offene Punkte #3)

Konkrete Umsetzung der bereits geplanten Anwesenheitserkennung (Offene Punkt #2, Presence vs. Motion): statt reinem Frame-Differencing erkennt ein Gesichtserkennungs-Modell im Browser (z. B. eine JS-Face-Detection-Bibliothek) Anwesenheit und Blickrichtung einer Person direkt. Das trifft die Kernthese der Installation unmittelbarer als generisches Motion-Diffing — **„Beobachtung verändert das Beobachtete"** wird wörtlich einlösbar, wenn das System tatsächlich erkennt, *dass* (und ggf. *wohin*) ein Gesicht blickt, statt nur pixelweise Veränderung zu messen.

- Ergänzt, ersetzt aber nicht zwingend `input.js`s Motion-Differencing — beide Signale könnten parallel in `phase.js` einfließen (z. B. Facetracking → Präsenz/Aufmerksamkeit, Motion-Speed → weiterhin Burst-Auslöser)
- Modul-Interface-Prinzip bleibt gewahrt: ein neues/erweitertes `input.js` ruft weiterhin `phase.js`-Funktionen direkt auf, keine Vermittlung durch `main.js`
- Offene Fragen: welche Bibliothek/Modell (Performance-Budget neben Raymarching + Sim-Pass), ob Blickrichtung oder nur Anwesenheit ausgewertet wird, Datenschutz-Implikationen einer Gesichtserkennung im Installationskontext

### Environment (`environment.js`)

Eine einzelne dynamische Equirectangular-Textur wird kontinuierlich aus einem GPU-seitigen Shader regeneriert und direkt (ohne PMREM-Prefilterung) als `envMap` gesampelt:

```
environmentShader.js  →  WebGLRenderTarget (HalfFloat, Equirectangular)
                      →  material.uniforms.envMap
```

`environmentShader.js` erzeugt abstrakte, nicht-gegenständliche Umgebungen parameterisiert durch `metaballBlend/clusterBlend/burstBlend` und `time` (Worley-Blobs, Perlin-Ambient, gerichtetes Licht). Regenerierung periodisch + bei Phasenübergängen (via `onPhaseTransition`). Rauheitsabhängige Unschärfe der Reflexion wird beim Sampling im Shader approximiert (`_envSampleLod`, Cone-Sampling — siehe `raymarchChunk.js`), nicht durch Mip-Level einer vorgefilterten Textur.

Phasengekoppelte Stimmung der Umgebung:

| Parameter | Metaball | Cluster | Burst |
|---|---|---|---|
| Farbtemperatur | neutral-grau | warm-diffus | harte Kontraste |
| Helligkeit | mittel | niedrig, gläsern | hohe Highlights |
| Direktivität | gerichtet, scharf (Key-Light + Worley) | weich, zentral (Top-Glow) | gerichtet, scharf (Key-Light + Worley) |

Metaball und Burst teilen sich denselben Generator (`_envKeyLight` in `environmentShader.js`, Worley-Speckle + rotierendes Key-Light), unterschieden nur durch den Tint (`MOOD_METABALL_METAL` grau vs. `MOOD_BURST` orange) — Metaballs Umgebung liest sich damit als kühlere Variante desselben Wesens, nicht als eigenständige Stimmung. `AMBIENT_FLOOR` hält den Hintergrund zwischen Speckles/Key-Light über Schwarz, statt Farbtöne auf schwarzem Grund.

**Env-Preset-Buttons und Shading-Blend:** `setEnvPreset(n)` (via `ui.js`) wählt nur, welche Umgebung `environmentShader.js` generiert — es überschreibt nicht direkt, welche Phase die *Ball-Oberflächen* zeigen (die folgen weiterhin `phase.js`s echtem FSM-Zustand). Damit ein gewählter Preset auch am Objekt sichtbar wird, überschreibt `main.js` (`resolvePhaseBlend`) die an das Haupt-Material gesendeten `metaballBlend`/`clusterBlend`/`burstBlend`-Werte auf `1`/`0`, wenn ein Preset ≠ Auto aktiv ist — sowohl Umgebung als auch Shading zeigen dann die volle, ungemischte Phase statt eines mit der echten (evtl. noch nicht vollständig eingeschwungenen) Blend-Gewichtung verdünnten Werts. Das behebt zugleich den "Preset wirkt dunkler als Auto"-Effekt: Auto zeigt bei nicht vollständig eingeschwungener Phase eine verdünnte Mischung, während der direkt gewählte Preset immer den vollen, ungemischten Wert zeigt.

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
- Cluster-Phase: kompakte, pulsierende Masse durch Noise-Modulation; Zielform/Linie als alternatives Attraktor-Regime ⚠️ geplant (siehe Phasensystem/Offene Punkte #4)
- Burst-Phase: schlagartige Auflösung, Zerstreuung in alle Richtungen
- Shading-Übergänge: kontinuierlich über skalaren Phasenwert interpoliert

### Grafik
- **Metallisch-reflektierend** (Metaball + Burst): Env-Map-Sampling, rauheitsabhängig; Reflexionen fremd und nicht verortbar. Metaball und Burst shading-seitig getrennt: gleiche Technik (`_shadeReflective`), unterschiedlicher Tint (Metaball grau via `MOOD_METABALL_METAL`, Burst via `MOOD_BURST`) und Rauheit (Metaball 0.15, Burst 1.0 — maximal, diffuses Streulicht passend zur chaotischen Burst-Stimmung). Beide tragen ein deutlich schwächeres Rim-Light als Cluster (`REFLECTIVE_RIM_WEIGHT` vs. Clusters `RIM_WEIGHT`), gefärbt nach aktuellem `moodColor()`.
- **Transluzent-lumineszent** (Cluster): Fresnel, Streuung, angedeutete Materialdicke; inneres Leuchten; primärer Rim-Light-Träger
- Schwarzer Hintergrund; Skybox als Alternative ⚠️ offen
- Abstrakte dynamische Environment-Map — keine erkennbaren Strukturen
- **Bloom Post-Processing** (`bloomShader.js` + `gpuSetup.makeBloomSetup`): Hellste Bereiche extrahiert (Luma > threshold), 9-Tap-Gauß H+V geblurt, additiv überlagert; Intensität und Schwellenwert koppeln an `burstBlend` (mehr Leuchtkraft im Burst)

### Shading-Modul (`raymarchChunk.js`)

Da `MeshPhysicalMaterial` mit Raymarching inkompatibel ist (es operiert auf rasterisierter Geometrie, nicht auf SDF-ausgewerteten impliziten Flächen), wird das Shading vollständig manuell nachimplementiert.

Eine Funktion pro Phase, `shadeHit` mischt alle drei gewichtet (immer 3-Wege, keine Early-Outs):

| Phase | Env-Map-Sampling | Rim-Light | Farbe |
|---|---|---|---|
| **Metaball** (`shadeMetaball`) | Ja (`_shadeReflective`, geteilt mit Burst) | Schwach (`REFLECTIVE_RIM_WEIGHT`, gefärbt nach `moodColor()`) | `MOOD_METABALL_METAL` — Platzhalter-Grau, zur individuellen Abstimmung vorgesehen |
| **Cluster** (`shadeCluster`) | Nein | Stark (primärer Rim-Light-Träger, `RIM_WEIGHT`) | Bestehende Cluster-Tönung (unverändert) |
| **Burst** (`shadeBurst`) | Ja (`_shadeReflective`, geteilt mit Metaball) | Schwach (`REFLECTIVE_RIM_WEIGHT`, gefärbt nach `moodColor()`) | `MOOD_BURST` (Rauheit 1.0, maximal) |

`shadeCluster` (vormals `shadeGlass`) bleibt der stärkste Rim-Light-Träger; Metaball/Burst tragen dasselbe `_rimLight()` (gefärbt nach `moodColor()`) nur deutlich schwächer gewichtet. `_shadeReflective(n, rd, NdotV, roughness, tint)` ist der interne, von Metaball und Burst geteilte Helfer — ein einzelner Tint-Parameter genügt, die Funktion leitet intern eine hellere Highlight-Variante für den direkten Specular-Term ab.

Einziger öffentlicher Aufruf aus `main()` des Fragment-Shaders:

```glsl
color = shadeHit(p, n, rd);
```

`raymarchChunk.js` ist ein GLSL-Chunk, der in `raymarchShader.js` nach `map()` interpoliert wird (notwendig, da `shadeCluster` `map()` für einen Materialdicken-Proxy aufruft). Austausch eines Materialmodells erfordert nur Änderungen in der jeweiligen Phasenfunktion.

### Audio
- Phasengekoppelte Klangkulisse ⚠️ offen
- Stimmungskopplung mit Environment-Parametern

---

## Implementierungsstand

| Komponente | Status |
|---|---|
| Raymarching + SDF + smin | ✅ |
| Noise-Bibliothek (Perlin, Worley 2D) | ✅ |
| Phasensystem (zeitgesteuert + externer Trigger + onPhaseTransition) | ✅ |
| GPU-Simulation (1D-Textur RGBA32F, Ping-Pong, simulationShader.js) | ✅ |
| Shading-Modul (raymarchChunk.js, shadeHit, phasenweise: shadeMetaball/shadeCluster/shadeBurst) | ✅ |
| Environment (dynamische Equirectangular-Env-Map, environmentShader.js) | ✅ |
| Externes Eingabegerät (input.js) | ✅ |
| Audio | ⚠️ geplant |
| Anwesenheitserkennung (Presence vs. Motion) | ⚠️ geplant |
| Facetracking | ⚠️ geplant (#3) |
| Zielform / Linie in Cluster | ⚠️ geplant (#4) |
| Bewegungsparameter (experimentell) | ✅ |
| Bloom Post-Processing | ✅ |
| Adaptiver smin-Radius k (phasenabhängig) | ✅ |

---

## Offene Punkte ⚠️

| # | Thema | Notiz |
|---|---|---|
| 1 | Audio | Web Audio API; drei synthetische Schichten: Metaball = tiefer Drone (Frequenz skaliert mit motionSpeed), Cluster = Subbass-Puls im Atemrhythmus, Burst = perkussiver Anschlag + Hochfrequenz-Rauschen über burstBlend; OscillatorNode + BiquadFilterNode, kein Asset-Loading |
| 2 | Anwesenheitserkennung | input.js liefert nur Motion-Speed; zweite Schicht: Hintergrundmodell erkennt Präsenz ohne Bewegung → Kreatur reagiert auf bloße Anwesenheit (aufmerksam werden, ohne Burst zu triggern); psychologisch stärker als reiner Bewegungs-Trigger |
| 3 | Facetracking | Konkrete Technik für #2: Gesichtserkennung statt/neben Frame-Differencing in `input.js`; macht "Beobachtung verändert das Beobachtete" wörtlich. Siehe Input & Interaktion → Facetracking. Offen: Bibliothek/Modell, Performance-Budget, Blickrichtung vs. reine Anwesenheit, Datenschutz |
| 4 | Zielform / Linie in Cluster | Cluster-Attraktor zieht aktuell nur zum Massezentrum (formlose Masse). Erweiterungspunkt existiert bereits: `_simulateCluster(inout vel, pos, target, weight)` in `simulationChunk.js` besitzt die komplette Cluster-Physik selbst und nimmt den Attraktionspunkt als Parameter; ein neues Regime berechnet nur einen anderen `target` (z. B. nächster Punkt auf einer Linie). Shading/Environment/SDF-Komposition unberührt. Siehe Phasensystem → Cluster |