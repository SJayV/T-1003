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
│   ├── phase.js                ← getPhase(), triggerPhase(), onPhaseTransition()
│   ├── balls.js                ← Initialzustand der 12 Bälle (Startwerte für GPU-Textur)
│   ├── camera.js               ← statische Kamera, minimaler autonomer Schwenk
│   ├── input.js                ← externes Eingabegerät → ruft triggerPhase() etc.
│   ├── audio.js                ← Phasengekoppelte Klangkulisse (Stub)
│   └── environment.js          ← dynamische PMREM-Generierung
└── shaders/
    ├── simulationShader.js     ← Physik-GLSL (Sim-Pass): Ballbewegung, Phasendynamik
    ├── noiseLib.js             ← GLSL-Chunk: perlin2D, worley2D, worley3D
    ├── shadingLib.js           ← GLSL-Chunk: shadeMetal, shadeCluster, shadeHit
    ├── environmentShader.js    ← Equirectangular-GLSL für synthetische Umgebung
    └── raymarchShader.js       ← Rendering-GLSL; interpoliert noiseLib + shadingLib
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
- Phasenwert steuert Physik-Dynamik (`simulationShader.js`) und Shading-Interpolation (`shadingLib.js`)
- Externer Trigger via `triggerPhase(value)` / `releasePhase()` jederzeit möglich

| Phase | Wert | Dynamik | Shading |
|---|---|---|---|
| **Metaball** | 0.0 | Zirkulärer Drift, stochastische Perturbation, Wandreflexion | Metallisch-reflektierend |
| **Cluster** | 0.0→1.0 | Zentripetalkraft zum Masseschwerpunkt | Transluzent + lumineszent |
| **Burst** | 1.0→2.0 | Zentrifugalkraft vom Masseschwerpunkt | Metallisch-reflektierend |

**Cluster** — Masseschwerpunkt und Anziehung:
$$\hat{\mathbf{c}}(t) = \frac{1}{n}\sum_{i=1}^n \mathbf{c}_i(t), \qquad \mathbf{v}_i(t) \propto \hat{\mathbf{c}}(t) - \mathbf{c}_i(t)$$

**Burst** — Abstoßung:
$$\mathbf{v}_i(t) \propto \mathbf{c}_i(t) - \hat{\mathbf{c}}(t)$$

Burst-Stärke skalierbar mit erfasster Bewegungsgeschwindigkeit / Personenanzahl.

---

## Daten & Pipeline

### 1D-Zustandstextur

Format: RGBA32F, Breite 36 (3 Texel × 12 Bälle), Höhe 1

| Texel | r | g | b | a |
|---|---|---|---|---|
| 3i   | pos.x | pos.y | pos.z | r_i^0 |
| 3i+1 | vel.x | vel.y | vel.z | noise_seed |
| 3i+2 | — | — | — | — |

Texel 3i+2 reserviert für spätere Erweiterungen (z.B. Excitation, Color-Tint).

### Render-Passes pro Frame

```
[Sim-Pass]   simulationShader liest stateTexA → schreibt stateTexB; swap(A,B)
[Env-Pass]   environmentShader rendert 512×256 Equirectangular → PMREMGenerator  (alle 4 Frames)
[Main-Pass]  raymarchShader liest stateTexB + envMap → Screen
```

Alle Passes: Fullscreen Quad + OrthographicCamera → WebGLRenderTarget (außer Main-Pass → Screen).

### Physik- und Phasendynamik (GPU, `simulationShader.js`)

Pro Fragment (= ein Texel) liest der Shader die aktuelle Ball-Position und -Geschwindigkeit, bestimmt anhand von `phase` den Physik-Zweig und schreibt den neuen Zustand:

- **Metaball** (`ceil(phase) == 0`): stochastisches Rauschen + schwache Kreisrotation + Zentrierung
- **Cluster** (`ceil(phase) == 1`): Zentripetalkraft zu globalem Schwerpunkt (alle 12 Positionen gelesen)
- **Burst** (`ceil(phase) == 2`): Zentrifugalkraft + stochastische Perturbation

Zufallskomponente: `rand(seed, time)` — deterministisch pro Ball (seed aus Zustandstextur), variiert pro Frame (time-Uniform).

### Uniforms (CPU → Shader, pro Frame)

| Uniform | Quelle | Beschreibung |
|---|---|---|
| `time` | phase.js | Globale Zeit |
| `phase` | phase.js | Phasenwert [0, 2] |
| `camPos` | renderer.js | Kameraposition |
| `resolution` | renderer.js | Viewport-Größe |
| `stateTex` | simulation.js | Ball-Zustandstextur (RGBA32F, 36×1) |
| `envMap` | environment.js | PMREM Environment-Map (dynamisch regeneriert) |

---

## Kamera

- **Statische Grundposition** mit minimalem autonomem Schwenk — kein OrbitControls in der finalen Version ⚠️
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
| Statische Kamera + autonomer Schwenk | ⚠️ |
| Externes Eingabegerät (input.js) | ⚠️ Stub |
| Audio | ⚠️ Stub |
| Sensorik / augenähnliche Elemente | ⚠️ |
| Skybox / Hintergrund | ⚠️ |
| Bewegungsparameter (experimentell) | ⚠️ |

---

## Offene Punkte ⚠️

| # | Thema | Notiz |
|---|---|---|
| 1 | Kamera | OrbitControls entfernen; statisch + autonomer Schwenk |
| 2 | input.js | Externes Gerät: Personenerkennung → triggerPhase() |
| 3 | Audio | Phasenkopplung via onPhaseTransition, Stimmungsdesign |
| 4 | Sensorik / Augen | Augenähnliche Elemente als Reaktivitätsmerkmal |
| 5 | Skybox / Hintergrund | Separater Ansatz nötig |
| 6 | Bewegungsparameter | Experimentell: Driftgeschwindigkeit, Cluster-Übergang, Burst-Intensität |
| 7 | Interaktionsanleitung | "Augen zuhalten" etc. als Installationskonzept |
