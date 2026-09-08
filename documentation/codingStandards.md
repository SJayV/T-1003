# Coding Standards

## 1. Idiome

**Namensschema:**

| Geltungsbereich | Konvention | Beispiel |
|---|---|---|
| Private JS-Modulsymbole (Variablen + Funktionen) | `_camelCase` | `_renderer`, `_firstFrame`, `_initializeGpuSetup` |
| Öffentliche JS-Exporte | `camelCase` | `initializeSimulation`, `getWeights` |
| JS-Modulkonstanten | `SCREAMING_SNAKE_CASE` | `BALL_COUNT`, `FRAME_TIME_STEP` |
| GLSL-interne Helfer | `_camelCase` | `_ballUnion`, `_computeOrbitState` |
| GLSL-öffentliche Chunk-Funktionen | `camelCase` | `blendShape`, `blendShading`, `normal` |
| GLSL-Uniforms | `camelCase`, identisch auf JS-Seite | `clusterWeight`, `motionSpeed` |
| GLSL-Tuning-Konstanten | `SCREAMING_SNAKE_CASE` | `ORBIT_SNAP_RATE`, `BURST_FORCE_OFFSET` |
| Dateien | `camelCase.js` | `gpuSetup.js`, `helpersChunk.js` |

**Unterstrich-Präfix:**
- **private Modul-Level-Symbole:**
  - `let`-Zustand
  - `const`-Helfer
  - nicht exportierte `function`-Deklarationen
- keine Geltung für block-lokale Variablen innerhalb eines Funktionskörpers

**Prädikate:** Aussage / Frage
- Funktionen mit Wahrheitswert: `_audioIsNotReady`, `_metaballShouldExit`, `_rendererSizeChanged`, `_isCentered`, `_isGazing`
- Übergangsbedingungen: `_shouldX`
- Ready-Guard am Funktionsanfang: `_isNotReady`

**Boolean-Flags:** Adjektiv / Partizip ohne `is`-Präfix
- kein Funktionsaufruf: `_ready`, `_firstFrame`, `_detectionInFlight`

**Phasen-Trias:**
- Namen projektweit fix: JS & GLSL
- parallele Funktionen `_clusterX` / `_metaballX` / `_burstX`
- **zusammenführende `blendX`:**
  - Gewichtung über `clusterWeight` / `metaballWeight` / `burstWeight`

**Inline:** nicht als Konstanten
- **mathematische Notwendigkeiten mit algorithmisch fixiertem Wert:**
  - Texel-Offset
  - Epsilon für finite Differenzen
- Normalisierungsdivisoren: direkte Kopplung an Literal-Anzahl in selbem Ausdruck
- universell benannte mathematische Konstanten (`PI`) & Standards mit etablierten Namen (Rec.-709-Luma-Gewichte → `LUMA_WEIGHTS`)
- Noise-Hash-Dekorrelations-Seeds (z. B. `127.1`, `311.7`, `43758.5453` in `_gradient3`) — bewusst arbiträr, keine vorgetäuschte Bedeutung durch Benennung

**Cross-File-Konstanten:**
- dieselbe konzeptionelle Konstante in mehr als einer Datei → einmalig in `src/constants.js` (siehe Patterns → Geteilte Konstanten)
- einmal verwendete Konstante lokal in ihrer Datei

**GLSL-Loop-Unrolling:**
- **WebGL1 (GLSL ES 1.00):**
  - konstante Ausdrücke als Schleifengrenze
  - Entrollen von `for`-Schleifen
- Dokumentation von Absicht: `const int` statt reinem Literal

**Kommentare:**
- **Warum-Kommentare:**
  - versteckte Bedingungen
  - nicht-offensichtliche Invarianten
  - Workarounds für konkrete Bugs
- Abschnitts-Header: `// ──── NAME ────` in JS & GLSL

## 2. Patterns

**Modul-Vertrag `getUniformDefinitions()` / `applyStateToMaterial()`:**
- vollständiger Uniform-Besitz bei jedem Modul mit Zustandslieferung an zentralen Shader
- **Verwendung:**
  - Definitionen: einmaliges Verteilen durch `main.js` bei Material-Setup
  - Zustandsanwendung: `applyStateToMaterial`-Aufruf jeden Frame
  - kein direkter Zugriff

```js
export function getUniformDefinitions() { return { name: { value: ... }, ... }; }
export function applyStateToMaterial(material) { material.uniforms.name.value = ...; }
```

**Direkter Import gemeinsamen Phasen-Zustands:**
- **Phasenwerte:**
  - direkter Import aus `phase.js`
  - Lesen durch jedes konsumierende Modul (`simulation.js`, `environment.js`, `audio.js`, `debug.js`)
- zentrale `animate()`-Schleife: Vermeidung von Prop-Drilling bei mehr Phasen-Zustand-Konsumenten
- Kosten: implizite globale Kopplung durch `phase.js` als zentrale FSM

**GPU-Fullscreen-Quad-Fabrik:**
- Fullscreen-Quad-Pass: `initializeGpuSetup(material)` aus `gpuSetup.js`
- **Konsistenz von Render-Target-Typen:**
  - `THREE.FloatType` für Simulationszustand
  - `THREE.HalfFloatType` für Postprocessing

**GLSL-Chunk-Injektion:**
- Export von Template-Strings: Einsetzen von Chunk-Dateien in umschließenden Shader per `${chunk}`
- Voraussetzung: Uniform-Deklarationen & Helferfunktionen umschließenden Shaders in Scope
- keine Kollision von Top-Level-`const`-Namen: Zusammenfügen von Chunks zu **einer** GLSL-Kompilationseinheit
- String-Export: keine Chunk-Fabrikfunktion mit Assembly-Zeit-Parametern

**Geteilte Konstanten:**
- `src/constants.js`: einzige Quelle für in **mehr als einer Datei** gebrauchte Konstanten
- JS-Modul: direkter Import
- **GLSL-Chunk / Shader:** Interpolation in Template-Literal-Quelltext (`` const int BALL_COUNT = ${BALL_COUNT}; ``)
  - Zahlen-Interpolation in `float`-Kontext über `glslFloat(n)`
  - expliziter Dezimalpunkt bei `float`-Literalen
- einmalig verwendete Konstanten: lokal

**Helfer-Extraktion:** Geltungsbereich der Extraktion analog zum Geltungsbereich der Duplikation
- Duplikation innerhalb Datei: `_camelCase`-interner Helfer neben Aufrufern
- Duplikation über Dateien hinweg: öffentliche `camelCase`-Funktion in geteiltem Chunk
- **Extraktion:**
  - nur mit gemeinsamer Invariante zwischen Aufrufstellen
  - nicht bei Helfer mit ebenso vielen Parametern wie Termen im Inline-Ausdruck

**Ping-Pong-Render-Targets:**
- **GPU-residenter Zustand über Frames hinweg:**
  - zwei `WebGLRenderTarget`s
  - Tausch in jeden Frame

## 3. Architekturstil

**Fünf-Ebenen-Architektur:**

| Ebene | Recheneinheit | Funktion |
|---|---|---|
| Anwendungsebene | CPU | Steuerlogik, Phasenübergänge, Nutzerinput, Uniform-Übergabe |
| Simulationsebene | GPU | Render-to-Texture, 1D-Zustandstextur, Ping-Pong-Buffering |
| Environment-Ebene | GPU | Render-to-Texture der überblendeten Equirectangular-Umgebung |
| Shader-Ebene | GPU | Raymarching, SDF-Auswertung, Normalenberechnung, Beleuchtung |
| Postprocessing | GPU | Bloom-Pipeline auf das fertige Bild |

**Ballzustand & Environment-Map:**
- vollständig auf GPU
- kein Roundtrip zur CPU pro Frame

**`phase.js` als zentrale FSM & impliziter Event-Bus:**
- **Singleton:**
  - Module-Level-mutabler Zustand: direkter Import
  - keine Dependency Injection durch `main.js`
- **Top-Level-`animate()`-Schleife:** Vermeidung von Prop-Drilling bei mehr Phasen-Zustand-Abonnenten
- **Kosten:** implizite globale Kopplung
  - Lesezugriff jedes Moduls auf geteilten Zustand
  - Rücksetzen-Pflicht für Tests (`vi.resetModules()` pro Test)

**Kein Build-Schritt:**
- reine ES-Module: Laden über eine auf ein CDN zeigende `importmap` (`index.html`)
- kein Bundler, keine Transpilation

## 4. Tests & Werkzeuge

**Testkonventionen:**
- **Isolation:**
  - privater Modul-Zustand zwischen Tests
  - Laden von Modul pro Test über `vi.resetModules()` + dynamischer `import()`
- **Inhalte:**
  - `describe` / `it`-Texte auf **Deutsch**
  - Beschreibung von Verhalten / Invarianten statt Implementierungsdetails
  - gleiche Abschnitts-Header-Konvention wie im Quellcode
- **Bestandteile:**
  - eine Testdatei pro Quellmodul (`tests/<modul>.test.js`)
  - themenbezogene Dateien (`balls.test.js`)
- **Mock-Objekt:** Simulation der Zeit über `advance(seconds)`-Hilfsfunktion mit festem `TIME_STEP`

**Linting:**
- **aktuelle Erzwingung durch `eslint.config.js`:**
  - `no-unused-vars` (außer Argumenten)
  - `eqeqeq`
  - `no-var`
- **kein Regelwerk zu Namensschema oder Dateistruktur:**
  - Konventionen rein durch Konsistenz im Code