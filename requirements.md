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
  - **Simulationsebene (GPU):** Compute-Shader, Render-to-Texture, 1D-Zustandstextur der Breite n
  - **Shader-Ebene (GPU):** Raymarching, SDF-Auswertung, Normalenberechnung, Beleuchtung
- Ballzustände verbleiben vollständig auf der GPU (kein CPU-Roundtrip pro Frame)

---

## Kernkomponenten

### Metaballs

- **n 3D-Metaballs** (n experimentell zu bestimmen, aktuell 12)
- Jeder Ball i: Position **c**_i ∈ ℝ³, zeitabhängiger Radius r_i(t), eigenes SDF
- Komposition via **smooth minimum (smin)** zu einem Gesamt-SDF
- Rendering: **Raymarching** auf fullscreen Quad (keine explizite Geometrie)
- Normalenberechnung: finite Differenzen auf dem SDF
- Sensoren / augenähnliche Elemente angedacht (Reaktivität als "Mimik"-Äquivalent) ⚠️ offen

### Noise

- **Perlin-Noise** N: ℝ³ × ℝ → [−1, 1]
- Zwei Ebenen der Modulation:
  - **Radiusmodulation:** r_i(t) = r_i⁰ · (1 + α · N(**c**_i, t))
  - **Oberflächenperturbation:** d̂(**x**, t) = d(**x**, t) + β · N(**x**, t)
- Parameter α, β experimentell zu bestimmen

### Phasensystem

- Drei Phasen, zyklisch und deterministisch zeitgesteuert
- Phasenwert als kontinuierlicher Float im Shader → weiche Shading-Interpolation zwischen Phasen

| Phase | Dynamik (CPU) | Shading (GPU) |
|---|---|---|
| **Metaball** | Zirkulärer Drift, Wandreflexion | Metallisch-reflektierend, PMREM-Sampling |
| **Cluster** | Zentripetalkraft zum Masseschwerpunkt | Transluzent, lumineszent (Fresnel, Scatter, Dicke) |
| **Burst** | Zentrifugalkraft vom Masseschwerpunkt | Metallisch-reflektierend (zurückkehrend) |

- Burst-Stärke skalierbar mit Interaktionsgeschwindigkeit / Personenanzahl
- Phasenwechsel durch **externe Interaktion** auslösbar (Kernanforderung)

---

## Daten & Pipeline

- **1D-GPU-Textur** (Breite n): kodiert Position, Geschwindigkeit, Radius jedes Balls als Texel
- **Render-to-Texture:** Textur wird pro Frame als Render-Target beschrieben, im Folgeframe gesampelt
- **Uniforms (CPU → GPU):** Phasenwert, Zeit, Kameraposition, zwei Env-Map-Texturen + Überblendungsfaktor
- Shader hat keinen persistenten Zustand — reine Auswertung der Eingabedaten

---

## Input & Interaktion

- **Zeit:** primärer deterministischer Input, steuert Phasenzyklus
- **Kamera:**
  - Primär durch externes **visuelles Eingabegerät** gesteuert (Personenerkennung, Bewegungserfassung)
  - **Autonome Bewegung** bei ausbleibender Interaktion (eigenständiger Beobachtungscharakter)
- **Externes Eingabegerät:**
  - Erkennt Anwesenheit und Bewegungsgeschwindigkeit von Personen
  - Löst Phasenwechsel aus (z.B. Bewegung während Cluster-Phase → Burst)
  - Beeinflusst Geschwindigkeiten, Farbgebung, ggf. Personenanzahl skaliert Burst-Stärke
  - Anleitungsinteraktion denkbar: "Augen zuhalten", "nicht direkt ansehen" ⚠️ offen
- **Environment:**
  - Synthetisierte, **abstrakte dynamische CubeMap** (keine realistischen Umgebungen)
  - Laufzeit-Konvertierung → **PMREM** via Three.js PMREMGenerator
  - Rauheitsabhängiges Sampling im Fragment-Shader
- **Audio (geplant):**
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
  - Metallisch-reflektierend (Metaball + Burst): PMREM-Sampling, rauheitsabhängig, Reflexionen fremd/nicht verortbar
  - Transluzent-lumineszent (Cluster): Fresnel, Streuung, angedeutete Materialdicke
- Schwarzer Hintergrund, ggf. Skybox ⚠️ offen
- Abstrakte, dynamische CubeMap — keine erkennbaren Räume oder Strukturen

### Audio
- Phasengekoppelte Klangkulisse (technische Soundkulisse oder Musik) ⚠️ offen
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
| 8 | n (Ballanzahl) | Experimentell zu optimieren |
