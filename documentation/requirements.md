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
│   ├── phase.js                ← getLogicalPhase(), getVisualPhase(), triggerPhase(), onPhaseTransition()
│   ├── balls.js                ← Initialzustand der 12 Bälle (Startwerte für GPU-Textur)
│   ├── camera.js               ← statische Kamera, minimaler autonomer Schwenk
│   ├── input.js                ← externes Eingabegerät → ruft triggerPhase() etc.
│   ├── audio.js                ← Phasengekoppelte Klangkulisse (Stub)
│   └── environment.js          ← dynamische PMREM-Generierung
├── shaders/
│   ├── simulationShader.js     ← Physik-GLSL (Sim-Pass); interpoliert simulationLibrary
│   ├── environmentShader.js    ← Equirectangular-GLSL; interpoliert noiseLibrary + moodLibrary
│   └── raymarchShader.js       ← Rendering-GLSL; interpoliert noiseLibrary + moodLibrary + raymarchLibrary
└── libraries/
    ├── noiseLibrary.js         ← GLSL-Chunk: perlin2D, worley2D, worley3D
    ├── moodLibrary.js          ← GLSL-Chunk: Farbpalette (MOOD_*), Phasengewichte (tMeta/Cluster/Burst), moodColor()
    ├── raymarchLibrary.js      ← GLSL-Chunk: shadeMetal, shadeGlass, shadeHit
    └── simulationLibrary.js    ← GLSL-Chunk: applyMetaball, applyCluster, applyBurst
```

### Modul-Interface-Prinzip

Jedes Modul besitzt seine Uniforms vollständig. `main.js` kennt keine Uniform-Namen:

```javascript
// Einmalig beim Material-Setup:
...simulation.getUniformDefs()    // → { stateTex }
...environment.getUniformDefs()   // → { envMap }

// Jeden Frame:
simulation.applyStateToMaterial(material)
environment.applyStateToMaterial(material, phase, time)

// Externer Trigger (aus input.js):
phase.triggerPhase(2.0)   // Burst erzwingen
phase.releasePhase()      // zurück zum Zeitzyklus
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

**Noise-Bibliothek** (`noiseLib.js`): Perlin-Noise N: ℝ² × ℝ → [−1, 1] und Worley-Noise W: ℝⁿ → [0, ~1], vollständig auf Shader-Ebene.

**Radiusmodulation** (pro Ball, per Shader-Eval):
$$r_i(t) = r_i^0 \cdot \bigl(1 + \alpha \cdot \mathcal{N}(\mathbf{c}_i,\, t)\bigr)$$

**Oberflächenperturbation** (auf komponierten SDF):
$$\hat{d}(\mathbf{x}, t) = d(\mathbf{x}, t) + \beta \cdot \mathcal{N}(\mathbf{x},\, t)$$

Parameter α, β: empirisch zu bestimmen.

### Phasensystem

- Zyklisch, deterministisch zeitgesteuert; Phasenwert als kontinuierlicher Float
- **Logischer Phasenwert** (`getLogicalPhase()`): steuert Physik-Dynamik (`simulationLibrary.js`) und Ereigniserkennung (`onPhaseTransition`)
- **Visueller Phasenwert** (`getVisualPhase()`): exponentieller Lerp zum logischen Wert (Rate 0.08/Frame, Halbwertszeit ~8 Frames); glättet den harten 2→0-Zyklusreset zu einer ~25-Frame-Überblende; steuert Shading-Interpolation und PMREM
- Externer Trigger via `triggerPhase(value)` / `releasePhase()` jederzeit möglich

| Phase | Wert | Dynamik | Shading |
|---|---|---|---|
| **Metaball** | 0.0 | Analytische Einzelorbits + Perlin-Noise-Störung | Metallisch-reflektierend |
| **Cluster** | 0.0→1.0 | Zentripetalkraft zum Masseschwerpunkt | Transluzent + glasartig |
| **Burst** | 1.0→2.0 | Exponentiell abklingende Zentrifugalabstoßung | Metallisch-reflektierend |

**Metaball** — analytische Einzelorbits, Bounds by Construction:

Jeder Ball i bewegt sich auf einer geneigten Ellipse mit individuellen Parametern $(r_i, \omega_i, \phi_i^0, \sin\theta_i)$:
$$\mathbf{c}_i(t) = \begin{pmatrix} r_i \cos\phi_i(t) \\ r_i \sin\phi_i(t)\,\sin\theta_i \\ r_i \sin\phi_i(t)\,\cos\theta_i \cdot 0.28 \end{pmatrix} + \epsilon_\text{Perlin}(\phi_i, \text{seed}_i)$$

mit $\phi_i(t) = \phi_i^0 + \omega_i \cdot t$. Grenzen eingehalten by design: $r_i \leq 1.72 < 1.8$, $r_i \sin\theta_i \leq 1.0$, $r_i \cdot 0.28 \leq 0.48 < 0.5$. Keine Randreflexion nötig.

**Cluster** — Masseschwerpunkt und Anziehung:
$$\hat{\mathbf{c}}(t) = \frac{1}{n}\sum_{i=1}^n \mathbf{c}_i(t), \qquad \mathbf{v}_i(t) \mathrel{+}= k_1(\hat{\mathbf{c}} - \mathbf{c}_i) + k_2(0 - \mathbf{c}_i)$$

**Burst** — exponentiell abklingende Abstoßung (stark lokal, asymptotisch 0):
$$\mathbf{v}_i(t) \mathrel{+}= \hat{\mathbf{d}}_i \cdot F_0 \cdot e^{-\|\mathbf{d}_i\| \cdot 1.5}, \qquad \mathbf{d}_i = \mathbf{c}_i - \hat{\mathbf{c}}$$

$F_0 = 0.3 + s \cdot 1.5$ skaliert mit Eingabe-Geschwindigkeit $s \in [0,1]$ (kodiert in `logicalPhase - 1.0`).

---

## Daten & Pipeline

### 1D-Zustandstextur

Format: RGBA32F, Breite 36 (3 Texel × 12 Bälle), Höhe 1

| Texel | r | g | b | a |
|---|---|---|---|---|
| 3i   | pos.x | pos.y | pos.z | r_i^0 |
| 3i+1 | vel.x | vel.y | vel.z | noise_seed |
| 3i+2 | orbitRadius | orbitSpeed | orbitPhase | orbitInclination |

Texel 3i+2 enthält statische Orbit-Parameter für die Metaball-Phase (Initialisierung aus `balls.js`, wird nie überschrieben — Passthrough im Sim-Shader).

### Render-Passes pro Frame

```
[Sim-Pass]   simulationShader liest stateTexA → schreibt stateTexB; swap(A,B)
[Env-Pass]   environmentShader rendert 512×256 Equirectangular → PMREMGenerator  (alle 4 Frames)
[Main-Pass]  raymarchShader liest stateTexB + envMap → Screen
```

Alle Passes: Fullscreen Quad + OrthographicCamera → WebGLRenderTarget (außer Main-Pass → Screen).

### Physik- und Phasendynamik (GPU, `simulationLibrary.js`)

Pro Fragment liest der Shader die aktuelle Ball-Position/-Geschwindigkeit sowie Orbit-Parameter (Texel 3i+2), bestimmt anhand von `logicalPhase` den Physik-Zweig und schreibt den neuen Zustand:

- **Metaball** (`ceil(logicalPhase) == 0`): Analytische Einzelorbits aus Texel 3i+2 (Radius, Geschwindigkeit, Phase, Inklination); Position direkt gesetzt, keine Integration. Perlin-Noise-Störung für organische Variation. Grenzen by construction eingehalten.
- **Cluster** (`ceil(logicalPhase) == 1`): Velocity-Integration; Zentripetalkraft + schwache Zentrierung
- **Burst** (`ceil(logicalPhase) == 2`): Velocity-Integration; exponentiell abklingende Abstoßung $F_0 \cdot e^{-1.5d}$; $F_0$ skaliert mit `logicalPhase - 1.0` (Input-Geschwindigkeit)

### Uniforms (CPU → Shader, pro Frame)

| Uniform | Quelle | Beschreibung |
|---|---|---|
| `time` | phase.js | Globale Zeit |
| `visualPhase` | phase.js | Visueller Phasenwert [0, 2] (geglättet) |
| `metaballBlend`, `clusterBlend`, `burstBlend` | phase.js | Vorberechnete Blend-Gewichte (Summe = 1) |
| `camPos` | renderer.js | Kameraposition |
| `resolution` | renderer.js | Viewport-Größe |
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
Primärer deterministischer Input; steuert Phasenzyklus. Stochastische Noise-Komponente im `simulationShader.js` sorgt dafür, dass das Objekt nie exakt gleich agiert.

### Externes Eingabegerät (`input.js`)
- Kamerabasiertes Gerät (z.B. Webcam + Personenerkennung) registriert Anwesenheit und Bewegung
- Ruft `phase.js`-Interfaces direkt auf — keine Kopplung durch `main.js`:
  - `triggerPhase(1.0 + speed)` bei erkannter Bewegung während Cluster-Phase → Burst
  - `releasePhase()` nach Abklingen
  - Bewegungsgeschwindigkeit skaliert Burst-Stärke
- Anleitungsinteraktion als Installationskonzept denkbar ⚠️ offen

### Environment (`environment.js`)

Eine einzelne dynamische PMREM wird kontinuierlich aus einem GPU-seitigen Equirectangular-Shader regeneriert:

```
environmentShader.js  →  WebGLRenderTarget (512×256, HalfFloat)
                      →  PMREMGenerator.fromEquirectangular()
                      →  material.uniforms.envMap
```

`environmentShader.js` erzeugt abstrakte, nicht-gegenständliche Umgebungen parameterisiert durch `phase` und `time` (Worley-Blobs, Perlin-Ambient, gerichtetes Licht). Regenerierung alle 4 Frames + bei Phasenübergängen (via `onPhaseTransition`).

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

### Shading-Modul (`shadingLib.js`)

Da `MeshPhysicalMaterial` mit Raymarching inkompatibel ist (es operiert auf rasterisierter Geometrie, nicht auf SDF-ausgewerteten impliziten Flächen), wird das Shading vollständig manuell nachimplementiert. Ziel-Feature-Set, orientiert an `MeshPhysicalMaterial`:

| Modus | Ziel-Features |
|---|---|
| **Metallisch** | PMREM-Sampling, rauheitsabhängiger Mip-Level, Fresnel (Schlick), GGX-Verteilung, Geometry-Term |
| **Transluzent** | Transmission, Absorption (Beer'sches Gesetz), Dünnfilm-Fresnel, SSS-Näherung, inneres Leuchten |

Einziger öffentlicher Aufruf aus `main()` des Fragment-Shaders:

```glsl
color = shadeHit(p, n, rd, phase);
```

`shadingLib.js` ist ein GLSL-Chunk, der in `raymarchShader.js` nach `map()` interpoliert wird (notwendig, da `shadeCluster` `map()` für einen Materialdicken-Proxy aufruft). Austausch des Materialmodells erfordert nur Änderungen in `shadingLib.js`.

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
| Shading-Modul (shadingLib.js, shadeHit) | ✅ |
| Environment (dynamische PMREM, environmentShader.js) | ✅ |
| Autonome Kamera (elliptische Umlaufbahn + Bob, kein OrbitControls) | ✅ |
| Externes Eingabegerät (input.js) | ⚠️ Stub |
| Audio | ⚠️ Stub |
| Sensorik / augenähnliche Elemente | ⚠️ |
| Skybox / Hintergrund | ⚠️ |
| Bewegungsparameter (experimentell) | ⚠️ |

---

## Offene Punkte ⚠️

| # | Thema | Notiz |
|---|---|---|
| 1 | Kamera | ✅ implementiert: elliptische Umlaufbahn + Lissajous-Bob, OrbitControls entfernt |
| 2 | input.js | Externes Gerät: Personenerkennung → triggerPhase() |
| 3 | Audio | Phasenkopplung via onPhaseTransition, Stimmungsdesign |
| 4 | Sensorik / Augen | Augenähnliche Elemente als Reaktivitätsmerkmal |
| 5 | Skybox / Hintergrund | Separater Ansatz nötig |
| 6 | Bewegungsparameter | Experimentell: Driftgeschwindigkeit, Cluster-Übergang, Burst-Intensität |
| 7 | Interaktionsanleitung | "Augen zuhalten" etc. als Installationskonzept |
