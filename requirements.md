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
├── index.html              ← HTML-Grundgerüst + importmap (Three.js CDN)
├── main.js                 ← Szenenaufbau, Material, animate-Loop
├── src/
│   ├── renderer.js         ← WebGLRenderer, PerspectiveCamera, Resize
│   ├── simulation.js       ← Ping-Pong RenderTargets, Sim-Pass (→ GPU)
│   ├── phase.js            ← getPhase(), triggerPhase(), Phasenzyklus
│   ├── balls.js            ← Initialzustand der 12 Bälle (Startwerte)
│   ├── camera.js           ← statische Kamera, minimaler autonomer Schwenk
│   ├── input.js            ← externes Eingabegerät → ruft triggerPhase() etc.
│   ├── audio.js            ← Phasengekoppelte Klangkulisse (Stub)
│   └── envmap.js           ← CubeMap-Synthese + PMREM-Generierung
└── shaders/
    ├── simShader.js        ← Physik-GLSL (Sim-Pass, export: simVert, simFrag)
    ├── shadingLib.js       ← GLSL-Chunk: shadeMetal, shadeCluster, shadeHit (austauschbar)
    └── raymarchShader.js   ← Rendering-GLSL; interpoliert shadingLib (export: mainVert, mainFrag)
```

### Modul-Interface-Prinzip

Jedes Modul besitzt seine Uniforms vollständig. `main.js` kennt keine Uniform-Namen:

```javascript
// Einmalig beim Material-Setup:
...simulation.getUniformDefs()   // → { stateTex }
...envmap.getUniformDefs()       // → { envMap, envMapNext, envBlend }

// Jeden Frame:
simulation.applyStateToMaterial(material)
envmap.applyStateToMaterial(material, phase, time)

// Externer Trigger (aus input.js):
phase.triggerPhase(2.0)   // Burst erzwingen
phase.releasePhase()      // zurück zum Zeitzyklus
```

Implementierungswechsel (z.B. GPU-Simulation, PMREM) erfordern nur Änderungen im jeweiligen Modul.

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

**Perlin-Noise** N: ℝ³ × ℝ → [−1, 1], vollständig auf Shader-Ebene

**Radiusmodulation** (pro Ball, per Shader-Eval):
$$r_i(t) = r_i^0 \cdot \bigl(1 + \alpha \cdot \mathcal{N}(\mathbf{c}_i,\, t)\bigr)$$

**Oberflächenperturbation** (auf komponierten SDF):
$$\hat{d}(\mathbf{x}, t) = d(\mathbf{x}, t) + \beta \cdot \mathcal{N}(\mathbf{x},\, t)$$

Parameter α, β: empirisch zu bestimmen.

### Phasensystem

- Zyklisch, deterministisch zeitgesteuert; Phasenwert als kontinuierlicher Float
- Phasenwert steuert Physik-Dynamik (Sim-Shader) und Shading-Interpolation (Fragment-Shader)
- Externer Trigger via `triggerPhase(value)` / `releasePhase()` jederzeit möglich

| Phase | Wert | Dynamik | Shading |
|---|---|---|---|
| **Metaball** | 0.0 | Zirkulärer Drift, Wandreflexion | Metallisch-reflektierend |
| **Cluster** | 0.0→1.0 | Zentripetalkraft zum Masseschwerpunkt | Transluzent + lumineszent |
| **Burst** | 1.0→2.0 | Zentrifugalkraft vom Masseschwerpunkt | Metallisch-reflektierend |

**Cluster** — Masseschwerpunkt und Anziehung:
$$\hat{\mathbf{c}}(t) = \frac{1}{n}\sum_{i=1}^n \mathbf{c}_i(t), \qquad \mathbf{v}_i(t) \propto \hat{\mathbf{c}}(t) - \mathbf{c}_i(t)$$

**Burst** — Abstoßung:
$$\mathbf{v}_i(t) \propto \mathbf{c}_i(t) - \hat{\mathbf{c}}(t)$$

Burst-Stärke skalierbar mit erfasster Bewegungsgeschwindigkeit / Personenanzahl.

---

## Daten & Pipeline

### 1D-Zustandstextur ⚠️ geplant, noch nicht implementiert

Format: RGBA32F, Breite 36 (3 Texel × 12 Bälle), Höhe 1

| Texel | r | g | b | a |
|---|---|---|---|---|
| 3i   | pos.x | pos.y | pos.z | r_i^0 |
| 3i+1 | vel.x | vel.y | vel.z | noise_seed |
| 3i+2 | — | — | — | — |

Texel C reserviert für spätere Erweiterungen (z.B. Excitation, Color-Tint).

**Aktueller Stand:** Ballzustände noch als CPU-Array + p1–p12 Uniforms. Sim-Shader ist Stub.

### Ping-Pong Render-to-Texture

```
Frame N:
  [Sim-Pass]  simShader liest stateTexA → schreibt stateTexB
  [Main-Pass] mainShader liest stateTexB → rendert auf Screen
  swap(A, B)
```

Sim-Pass: Fullscreen Quad + OrthographicCamera → WebGLRenderTarget (FloatType).

### Uniforms (CPU → Shader, pro Frame)

| Uniform | Quelle | Beschreibung |
|---|---|---|
| `time` | phase.js | Globale Zeit |
| `phase` | phase.js | Phasenwert [0, 2] |
| `camPos` | renderer.js | Kameraposition |
| `resolution` | renderer.js | Viewport-Größe |
| `p1`–`p12` | simulation.js | Ballpositionen (→ später stateTex) |
| `envMap`, `envMapNext`, `envBlend` | envmap.js | Environment-Maps + Blend |

---

## Kamera

- **Statische Grundposition** mit minimalem autonomem Schwenk — kein OrbitControls in der finalen Version
- Kamerabewegung: langsame, algorithmisch gesteuerte Rotation um das Objekt, um einen eigenständigen Beobachtungscharakter zu erzeugen
- Keine direkte Nutzersteuerung der Kamera
- Kamera und externes Eingabegerät sind **vollständig getrennte Systeme**

---

## Input & Interaktion

### Zeit
Primärer deterministischer Input; steuert Phasenzyklus. Pseudozufällige Noise-Komponente sorgt dafür, dass das Objekt nie exakt gleich agiert.

### Externes Eingabegerät (`input.js`)
- Kamerabasiertes Gerät (z.B. Webcam + Personenerkennung) registriert Anwesenheit und Bewegung
- Ruft direkt Modul-Interfaces auf — keine Kopplung durch main.js:
  - `phase.triggerPhase(2.0)` bei erkannter Bewegung während Cluster-Phase → Burst
  - `phase.releasePhase()` nach Abklingen
  - Bewegungsgeschwindigkeit skaliert Burst-Stärke
- Anleitungsinteraktion als Installationskonzept denkbar: "nicht direkt ansehen" ⚠️ offen

### Environment (`envmap.js`)
- Synthetisierte **abstrakte CubeMap** — keine realistischen Umgebungen
- Laufzeit-Konvertierung → **PMREM** via Three.js `PMREMGenerator` ⚠️ geplant, noch nicht implementiert
- Derzeit: HDR-Datei-Loading als Übergangslösung
- Rauheitsabhängiges Sampling im Fragment-Shader (Mip-Level per roughness)
- PMREM periodisch oder bei Phasenwechsel neu generiert (~2–5ms), nicht per Frame
- Zwei PMREMs (current / next) im Shader geblended

Phasengekoppelte Stimmung der CubeMap:

| Parameter | Metaball | Cluster | Burst |
|---|---|---|---|
| Farbtemperatur | kühl-neutral | warm-diffus | harte Kontraste |
| Helligkeit | mittel | niedrig, gläsern | hohe Highlights |
| Direktivität | allseitig | weich, zentral | gerichtet, scharf |

### Audio (`audio.js`) ⚠️ offen
- Phasengekoppelt: niederfrequent (Ruhe/Cluster) ↔ hochfrequent (Burst/Unruhe)
- Kopplung mit CubeMap-Farbstimmung: hell/offen ↔ Dur; dunkel/gesättigt ↔ Moll/Dissonanz
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
- Abstrakte dynamische CubeMap — keine erkennbaren Strukturen

### Shading-Modul (`shadingLib.js`)

Da kein `MeshPhysicalMaterial` mit Raymarching kombinierbar ist (Pipeline-Inkompatibilität), wird das gesamte Shading manuell implementiert. Es ist als austauschbarer GLSL-Chunk (`shadingLib.js`) organisiert, der in `raymarchShader.js` per Template-Literal interpoliert wird:

```javascript
// raymarchShader.js
import { shadingLib } from './shadingLib.js';
export const mainFrag = `
  // ... SDF, noise, map(), normal(), raymarch() ...
  ${shadingLib}           // ← shadeMetal, shadeCluster, shadeHit injiziert
  void main() {
    loadBalls();
    // ...
    color = shadeHit(p, n, rd, phase);   // einziger Aufruf aus main()
  }
`;
```

`shadeHit(p, n, rd, phase)` ist die einzige nach außen sichtbare Funktion. Die interne Implementierung (Sampling-Methode, Materialmodell) ist vollständig gekapselt — Austausch gegen PMREM oder ein anderes Modell erfordert nur Änderungen in `shadingLib.js`. Das Chunk-Muster (Interpolation nach `map()`) ist notwendig, da `shadeCluster` `map()` für einen Materialdicken-Proxy aufruft.

### Audio
- Phasengekoppelte Klangkulisse ⚠️ offen
- Stimmungskopplung mit CubeMap-Parametern

---

## Implementierungsstand

| Komponente | Status |
|---|---|
| Raymarching + SDF + smin | ✅ implementiert |
| Perlin-Noise (Radius + Oberfläche) | ✅ implementiert |
| Phasensystem (zeitgesteuert) | ✅ implementiert |
| Phasensystem (externer Trigger) | ✅ `triggerPhase()` / `releasePhase()` |
| CPU-Simulation (3 Phasen) | ✅ implementiert |
| Modul-Interfaces (getUniformDefs, applyStateToMaterial) | ✅ implementiert |
| GPU-Simulation (1D-Textur, Sim-Shader, Ping-Pong) | ✅ implementiert |
| Shading-Modul (`shadingLib.js`, `shadeHit`) | ✅ implementiert |
| PMREM + synthetische CubeMap | ⚠️ geplant (derzeit HDR-Loading) |
| Statische Kamera + autonomer Schwenk | ⚠️ geplant (derzeit OrbitControls) |
| Externes Eingabegerät (input.js) | ⚠️ Stub |
| Audio | ⚠️ Stub |
| Sensorik / augenähnliche Elemente | ⚠️ offen |
| Skybox / Hintergrund | ⚠️ offen |
| Bewegungsparameter (experimentell) | ⚠️ offen |

---

## Offene Punkte ⚠️

| # | Thema | Notiz |
|---|---|---|
| 1 | GPU-Simulation | ✅ implementiert: RGBA32F 36×1, Ping-Pong, simShader.js |
| 2 | PMREM / CubeMap | Synthetisierte abstrakte Umgebung statt HDR-Dateien |
| 3 | Kamera | OrbitControls entfernen; statisch + autonomer Schwenk |
| 4 | input.js | Externes Gerät: Personenerkennung → triggerPhase() |
| 5 | Audio | Phasenkopplung, Stimmungsdesign |
| 6 | Sensorik / Augen | Augenähnliche Elemente als Reaktivitätsmerkmal |
| 7 | Skybox / Hintergrund | Separater Ansatz nötig |
| 8 | Bewegungsparameter | Experimentell: Driftgeschwindigkeit, Cluster-Übergang, Burst-Intensität |
| 9 | Interaktionsanleitung | "Augen zuhalten" etc. als Installationskonzept |
