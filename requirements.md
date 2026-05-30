# Requirements: T-1003

## Konzept & Ziel

- Interaktive Anwendung: abstraktes, nicht-anthropomorphes Lebewesen — mathematisch modelliert und animiert
- Kernthese: Tendenz, menschliche Verhaltensweisen in artifizielle Konstrukte hineinzuinterpretieren
- Zentraler Mechanismus: **Beobachtung verändert das Beobachtete** — Wesen reagiert auf wahrgenommene Präsenz
- Emotionale Doppelwirkung: Sicherheitsgefühl (gefangen, künstlich) + Unruhe (Andersartigkeit, Unvorhersehbarkeit)
- Ästhetische Referenz: T-1000

---

## Technische Architektur

- Browserbasierte **WebGL-Applikation** mit **Three.js** als Rendering-Framework
- Drei-Ebenen-Architektur:
  - **Anwendungsebene (CPU):** Steuerlogik, Phasenwechsel, Nutzerinput, Uniform-Übergabe
  - **Simulationsebene (GPU):** Render-to-Texture, 1D-Zustandstextur, Ping-Pong-Buffering
  - **Shader-Ebene (GPU):** Raymarching, SDF-Auswertung, Normalenberechnung, Beleuchtung
- Ballzustände verbleiben vollständig auf der GPU (kein CPU-Roundtrip pro Frame)

### Dateistruktur

```
T-1003/
├── index.html              ← HTML-Grundgerüst + importmap
├── main.js                 ← animate-Loop, Szenenaufbau
├── src/
│   ├── renderer.js         ← WebGLRenderer, Kamera, OrbitControls
│   ├── simulation.js       ← Ping-Pong RenderTargets, Sim-Pass
│   ├── phase.js            ← getPhase(), Phasenzyklus-Logik
│   ├── balls.js            ← Initialzustand der 12 Bälle
│   ├── camera.js           ← autonome Bewegung, externes 
│   ├── audio.js            ← Phasenkopplung, Steuerparameter
│   └── envmap.js           ← CubeMap-Generierung + PMREM
└── shaders/
    ├── simShader.js        ← export: simVert, simFrag
    └── raymarchShader.js   ← export: mainVert, mainFrag
```

> Shader als exportierte Template-Literal-Strings.

Jedes Modul exportiert ein stabiles Interface — `main.js` und der Shader wissen nichts über die Interna. Beispiel `envmap.js`:

```javascript
export function initEnvMap(renderer)
export function updateEnvMap(renderer, phase, time)
export function getEnvUniforms()   // → { envMap, envMapNext, envBlend }
```

Gleiches Prinzip gilt für alle Module: nach außen nur das Interface, Implementierung austauschbar durch Umschreiben der Datei.

---

## Kernkomponenten

### Metaballs

- **n = 12 Metaballs** (n experimentell anpassbar)
- Jeder Ball i definiert durch:
  - Position **c**_i ∈ ℝ³
  - Basisradius r_i^0 ∈ ℝ (gespeichert; modulierter Radius r_i(t) wird im Shader berechnet)
  - Geschwindigkeit **v**_i ∈ ℝ³
- Komposition der SDFs via **smooth minimum (smin)** zum Gesamt-SDF:

$$d(\mathbf{x}, t) = \operatorname{smin}_{i=1}^{n} \left( \|\mathbf{x} - \mathbf{c}_i\| - r_i(t) \right)$$

- Rendering: **Raymarching** auf fullscreen Quad (keine explizite Geometrie)
- Normalenberechnung: finite Differenzen auf dem SDF
- Sensoren / augenähnliche Elemente angedacht (Reaktivität als "Mimik"-Äquivalent) ⚠️ offen

### Noise

- **Perlin-Noise** N: ℝ³ × ℝ → [−1, 1], vollständig auf Shader-Ebene berechnet
- Zwei Modulationsebenen:

**Radiusmodulation** — r_i^0 wird pro Frame mit Noise skaliert:
$$r_i(t) = r_i^0 \cdot \bigl(1 + \alpha \cdot \mathcal{N}(\mathbf{c}_i, t)\bigr)$$

**Oberflächenperturbation** — Distanzwert wird nach smin gestört:
$$\hat{d}(\mathbf{x}, t) = d(\mathbf{x}, t) + \beta \cdot \mathcal{N}(\mathbf{x}, t)$$

- Parameter α, β experimentell zu bestimmen

### Phasensystem

- Drei Phasen, zyklisch und deterministisch zeitgesteuert
- Phasenwert als kontinuierlicher Float im Shader → weiche Shading-Interpolation zwischen Phasen

| Phase | Dynamik (Sim-Shader) | Shading (Fragment-Shader) |
|---|---|---|
| **Metaball** | Zirkulärer Drift, Wandreflexion | Metallisch-reflektierend, PMREM-Sampling |
| **Cluster** | Zentripetalkraft zum Masseschwerpunkt | Transluzent, lumineszent (Fresnel, Scatter, Dicke) |
| **Burst** | Zentrifugalkraft vom Masseschwerpunkt | Metallisch-reflektierend (zurückkehrend) |

**Cluster-Phase** — Masseschwerpunkt und Anziehungskraft:
$$\hat{\mathbf{c}}(t) = \frac{1}{n} \sum_{i=1}^{n} \mathbf{c}_i(t), \qquad \mathbf{v}_i(t) \propto \hat{\mathbf{c}}(t) - \mathbf{c}_i(t)$$

**Burst-Phase** — Abstoßung vom Masseschwerpunkt:
$$\mathbf{v}_i(t) \propto \mathbf{c}_i(t) - \hat{\mathbf{c}}(t)$$

- Burst-Stärke skalierbar mit Interaktionsgeschwindigkeit / Personenanzahl
- Phasenwechsel durch **externe Interaktion** auslösbar (Kernanforderung)

---

## Daten & Pipeline

### 1D-Zustandstextur

Format: RGBA32F, Breite 36 (3 Texel × 12 Bälle), Höhe 1

| Texel | r | g | b | a |
|---|---|---|---|---|
| 3i   | pos.x | pos.y | pos.z | r_i^0 |
| 3i+1 | vel.x | vel.y | vel.z | noise_seed |
| 3i+2 | — | — | — | — |

Texel C (3i+2) ist reserviert für spätere Erweiterungen (z.B. Excitation, Color-Tint).

### Ping-Pong Render-to-Texture

```
Frame N:
  [Sim-Pass]  simShader liest stateTexA → schreibt in stateTexB
  [Main-Pass] mainShader liest stateTexB → rendert auf Screen
  swap(A, B)
```

- Sim-Pass: Fullscreen Quad + OrthographicCamera → WebGLRenderTarget (FloatType)
- Ballzustände verbleiben vollständig auf der GPU

### Uniforms (CPU → GPU)

- Phasenwert, Zeit, Kameraposition
- Zwei Env-Map-Texturen + Überblendungsfaktor

---

## Input & Interaktion

- **Zeit:** primärer deterministischer Input, steuert Phasenzyklus
- **Kamera:**
  - Primär durch externes **visuelles Eingabegerät** gesteuert (Personenerkennung, Bewegungserfassung)
  - **Autonome Bewegung** bei ausbleibender Interaktion (eigenständiger Beobachtungscharakter) ⚠️ offen
- **Externes Eingabegerät:**
  - Erkennt Anwesenheit und Bewegungsgeschwindigkeit von Personen
  - Löst Phasenwechsel aus (z.B. Bewegung während Cluster-Phase → Burst)
  - Beeinflusst Geschwindigkeiten, Farbgebung; Personenanzahl skaliert Burst-Stärke
  - Anleitungsinteraktion denkbar: "Augen zuhalten", "nicht direkt ansehen" ⚠️ offen
- **Environment:**
  - Synthetisierte, **abstrakte dynamische CubeMap** (keine realistischen Umgebungen)
  - Laufzeit-Konvertierung → **PMREM** via Three.js `PMREMGenerator`
  - Rauheitsabhängiges Sampling im Fragment-Shader (Mip-Level per roughness)
  - PMREM wird periodisch oder bei Phasenwechsel neu generiert (~2–5ms), nicht per Frame
  - Zwei PMREMs (current / next) werden im Shader geblended — identisches Schema wie bisher
  - Abstrakte Szene: wenige farbige Pointlights + dunkler Hintergrund, gesteuert durch:

| Parameter | Metaball | Cluster | Burst |
|---|---|---|---|
| Farbtemperatur | kühl-neutral | warm-diffus | harte Kontraste |
| Helligkeit | mittel | niedrig, gläsern | hohe Highlights |
| Direktivität | allseitig | weich, zentral | gerichtet, scharf |

  - Implementation austauschbar über `envmap/index.js` (siehe Dateistruktur)
- **Audio (geplant):** ⚠️ offen
  - Phasengekoppelt: niederfrequent (Ruhe) ↔ hochfrequent (Unruhe/Grusel)
  - Tonart, Lautstärke, rhythmische Impulse als mögliche Steuerparameter
  - Transitive Kopplung: Audio → Env-Map → Nutzerinteraktion

---

## Design

### Geometrie
- Vollständig implizite Flächen; einziges Primitiv: fullscreen Quad
- Sichtbare Geometrie emergiert als Isofläche des komponierten SDF
- Topologie ändert sich kontinuierlich ohne Neuberechnung von Mesh-Daten

### Animation
- Bewegungsmuster experimentell herauszuarbeiten ⚠️ offen
- Metaball-Phase: Drift + zeitweiliges Verschwinden/Auftauchen einzelner Segmente
- Cluster-Phase: kompakte, pulsierende Masse; Übergangsanimation zu klären ⚠️ offen
- Burst-Phase: schlagartige Auflösung, Zerstreuung

### Grafik
- **Zwei kontrastierende Erscheinungsbilder:**
  - Metallisch-reflektierend (Metaball + Burst): PMREM-Sampling, rauheitsabhängig
  - Transluzent-lumineszent (Cluster): Fresnel, Streuung, angedeutete Materialdicke
- Schwarzer Hintergrund, ggf. Skybox ⚠️ offen
- Abstrakte, dynamische CubeMap — keine erkennbaren Räume oder Strukturen

### Audio
- Phasengekoppelte Klangkulisse ⚠️ offen
- Kopplung mit Env-Map-Farbstimmung (hell/offen ↔ Dur; dunkel/gesättigt ↔ Moll/Dissonanz)

---

## Offene Punkte ⚠️

| # | Thema | Notiz |
|---|---|---|
| 1 | Sensorik / Augen | Augenähnliche Elemente als Reaktivitätsmerkmal (Betreuer-Anforderung) |
| 2 | Autonome Kamera | Verhalten bei Nichtinteraktion konkretisieren |
| 3 | Interaktionsanleitung | "Augen zuhalten" etc. als Installationskonzept |
| 4 | Bewegungsmuster | Experimentell zu bestimmen |
| 5 | Cluster-Übergang | Animation des Zusammenziehens |
| 6 | Skybox/Hintergrund | Ggf. separater Ansatz |
| 7 | Audio | Technische Kulisse vs. Musik; Kopplung mit Interaktion |
