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
│   ├── phase.js                ← Gauß-Gewichtsystem, getWeights()/MotionSpeed, reportMotion(), onPhaseTransition()
│   ├── constants.js            ← Cross-Datei-Konstanten (BALL_COUNT, Cluster-Zylinder, Mood-Farben, ...) + Initialzustand der 12 Bälle + glslFloat()/glslVec3()
│   ├── camera.js               ← statische Kamera (stub)
│   ├── input.js                ← Webcam Frame-Differencing → reportMotion() → phase.js Gewichtssystem
│   ├── audio.js                ← Phasengekoppelte Klangkulisse (Stub)
│   └── environment.js          ← dynamische Equirectangular-Env-Map-Generierung
├── shaders/
│   ├── simulationShader.js     ← Physik-GLSL (Sim-Pass); interpoliert positionChunk
│   ├── environmentShader.js    ← Equirectangular-GLSL; interpoliert noiseChunk + colorChunk
│   ├── raymarchShader.js       ← Rendering-GLSL; interpoliert noiseChunk + colorChunk + shapeChunk + surfaceChunk
│   └── bloomShader.js          ← Bloom Post-Processing (brightExtract, blur, composite Fragment-Shader)
└── shaderChunks/
    ├── vertexChunk.js          ← GLSL-Chunk: gemeinsamer Passthrough-Vertex-Shader
    ├── noiseChunk.js           ← GLSL-Chunk: perlin2D, worley2D
    ├── colorChunk.js           ← GLSL-Chunk: Farbpalette (MOOD_*), moodColor(), Himmelsfarbe (envCluster/envMetaball/envBurst, blendEnvironment(uv))
    ├── shapeChunk.js           ← GLSL-Chunk: clusterSDF/metaballSDF/burstSDF, map(), normal(), raymarch()
    ├── surfaceChunk.js         ← GLSL-Chunk: shadeMetaball, shadeCluster, shadeBurst, shadeHit
    └── positionChunk.js        ← GLSL-Chunk: applySimulation (gewichtet über clusterBlend/metaballBlend/burstBlend)
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
stepSimulation()             // liest getWeights()/time/motionSpeed aus phase.js
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
- Metaball- und Burst-Phase komponieren ihre 12 Bälle jeweils via **smooth minimum (smin)** zu einem eigenen Teil-SDF (`metaballSDF`/`burstSDF` in `shapeChunk.js`, je ein eigener Verschmelzungsradius $k$):

$$d_\text{metaball/burst}(\mathbf{x}, t) = \operatorname{smin}_{i=1}^{n}\bigl(\|\mathbf{x} - \mathbf{c}_i\| - r_i(t),\; k_\text{metaball/burst}\bigr) + \beta \cdot \mathcal{N}(\mathbf{x}, t)$$

Cluster hat kein eigenes Ball-SDF mehr — sein Teil-SDF ist ein analytischer Zylinder (siehe Phasensystem → Cluster). Die drei Teil-SDFs werden gewichtet über die Blend-Gewichte aus `phase.js` zum Gesamt-SDF summiert (siehe unten, „SDF-Komposition über Phasen").

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

**Kontinuierliches Gauß-Gewichtssystem** — kein Zeitzyklus; Übergänge durch registrierte Bewegung aus `input.js`. Ersetzt die frühere diskrete FSM: statt eines scharf umschaltenden Zustands liefert `phase.js` pro Frame drei stetige Gewichte `clusterWeight`, `metaballWeight`, `burstWeight` (Summe ≡ 1, nie exakt 0), die die **einzige** Schnittstelle sind, über die Phasenzugehörigkeit in Farbe, Position und SDF einfließt:

$$\text{Farbe/Position/SDF}(t) = w_\text{cluster}\cdot(\cdot)_\text{cluster} + w_\text{metaball}\cdot(\cdot)_\text{metaball} + w_\text{burst}\cdot(\cdot)_\text{burst}$$

Intern führt `phase.js` weiterhin einen diskreten Zeiger `_state` (`S_CLUSTER`/`S_BURST`/`S_METABALL`) — funktional identisch zum früheren `logicalPhase`, nur nicht mehr nach außen exponiert. `_state` entscheidet ausschließlich, welche Bewegungserkennung wie interpretiert wird und wann `onPhaseTransition` feuert; kein Farbwert, keine Position und kein SDF-Term hängt je direkt an `_state`, nur indirekt vermittelt über die drei Gewichte.

**Bump-Mechanismus:** Jede Phase führt eine unnormierte Gaußkurve mit Peak-Höhe 1:

$$\text{raw}_i(t) = \text{activated}_i \;?\; \exp\!\Bigl(-\frac{(t - \mu_i)^2}{2\sigma_i^2}\Bigr) \;:\; 0, \qquad w_i(t) = \frac{\text{raw}_i(t)}{\sum_j \text{raw}_j(t) + \varepsilon}$$

$\mu_i$ ist nie fallend (`mu = max(mu, t_now)`) und wird bei Aktivierung nicht auf den Trigger-Zeitpunkt $\tau$, sondern auf $\tau + \text{LEAD}\cdot\sigma_i$ gesetzt — dadurch startet jede Aktivierung bei $\text{raw}_i(\tau) \approx e^{-\text{LEAD}^2/2} \approx 0{,}011$ und steigt organisch auf 1, ganz ohne Sondercode für den weichen Anstieg. Cluster ist die einzige Ausnahme: bei Programmstart ist $\mu_\text{cluster}(0) = 0$ (sofort voll gewichtet), jede spätere Rückkehr aus Metaball bekommt denselben LEAD-Anstieg wie Burst/Metaball.

**Zeitbasis:** `tick(t_now)` nimmt echte verstrichene Sekunden entgegen (`performance.now()/1000` in `main.js`) — unabhängig von der Framerate. Das ist bewusst nur auf das Gewichtssystem selbst beschränkt: `getTime()` (treibt Shader-Noise) und die GPU-Physikkonstanten in `positionChunk.js` bleiben vorerst frame-getaktet.

**Parameter (alle in `phase.js`, Sekunden, am Kopf der Datei erklärt):**

| Konstante | Semantik |
|---|---|
| `LEAD` | Anstiegsfaktor: eine Aktivierung braucht `LEAD·σ` Sekunden vom Trigger bis nahezu voller Gewichtung |
| `CLUSTER_SIGMA`, `METABALL_SIGMA`, `BURST_SIGMA` | Bump-Breite je Phase — bestimmt sowohl Anstiegs- als auch Abklingdauer |
| `BURST_HOLD_MIN` | **Abgeleitet**, nicht frei gewählt: `= LEAD·BURST_SIGMA`, damit Burst beim Hold-Ende garantiert voll eingeschwungen ist (siehe unten) |
| `BURST_HOLD_MAX` | `BURST_HOLD_MIN` + fixe Spanne, linear mit der bei Trigger erkannten `motionSpeed` interpoliert — deterministisch, kein Zufallsanteil |
| `METABALL_MIN_HOLD` | Mindestverweildauer in Metaball, unabhängig von Input |
| `METABALL_SILENCE_HOLD` | Stille-Dauer (nach `METABALL_MIN_HOLD`) vor Rückkehr zu Cluster |
| `METABALL_HANDOFF_LEAD` | `0` (nicht `LEAD`) — Metabolls Aktivierung beim Burst-Handoff, siehe unten |
| `CLUSTER_COOLDOWN` | Sperrzeit nach Burst vor dem nächsten — aktuell `0` (keine Sperre); der Vergleich lebt im Scheduler (`_scheduleTick`), Reaktivierung ist eine reine Konstantenänderung |

**Wichtig — Hold-Dauer ≠ Abklingbreite:** Wie lange eine Phase aktiv gehalten wird, ist eine rein verhaltensbezogene Entscheidung, unabhängig von `σ` (das nur die *visuelle* Anstiegs-/Abklinggeschwindigkeit eines Bumps bestimmt). Die nächste Phase wird immer **exakt** beim Ablauf der aktuellen Hold-Dauer aktiviert — nie erst nach einer zusätzlichen "erst abklingen lassen"-Verzögerung.

**Burst→Metaball als exakter 50/50-Übergang:** Cluster→Burst funktioniert von Natur aus gut (Burst aktiviert sofort bei Trigger, während Cluster noch nahe seinem Peak ist — die beiden Kurven kreuzen sich in der Mitte). Burst→Metaball braucht dafür zwei bewusste Entscheidungen: (1) `BURST_HOLD_MIN = LEAD·BURST_SIGMA` garantiert, dass `raw_burst` beim Hold-Ende bereits bei 1 angekommen ist, statt mittendrin abgeschnitten zu werden; (2) `METABALL_HANDOFF_LEAD = 0` setzt Metaballs `mu` exakt auf den Handoff-Zeitpunkt statt `LEAD·σ` in die Zukunft — `raw_metaball` startet damit ebenfalls bei 1, nicht beim üblichen ~1%-Boden. Im selben Moment sind beide Bumps auf ihrem Peak (1/1, exakt 50/50); ab da tracked Metaballs `mu` weiter mit `t_now` (bleibt bei 1), während Bursts `mu` einfriert und abklingt — die Gewichtsverteilung kippt rein durch Bursts eigenes Abklingen von 50/50 zu Metaball, ohne dass irgendwo gesprungen wird.

Dasselbe gilt auf der Bewegungsseite: `positionChunk.js`s `VEL_DECAY_BURST` ist aktuell `1.0` — **kein** Abklingen während Burst, experimentell, um zu testen, ob Metaballs Orbit-Snap den Übergang allein glätten kann, sobald sein Gewicht steigt. Bursts `vel` soll beim Handoff noch echten Schwung tragen, statt schon auf ~0 ausgerollt zu sein; wäre `vel` zu diesem Zeitpunkt bereits leer, würde Metaballs direkter Orbit-Snap die Bewegung faktisch allein übernehmen, was sich trotz glatter Gewichts-Überblendung wie ein harter Schnitt in der Bewegung liest, nicht wie eine Übergabe. Falls `1.0` zu wild wirkt (Bälle fliegen zu weit, bevor Metaball greift), ist ein Wert knapp darunter (z. B. 0.97–0.99) der nächste Versuch.

**Parameter (in `input.js`, unverändert):**

| Konstante | Semantik |
|---|---|
| `INPUT_SPEED_THRESHOLD` | Minimale normierte Geschwindigkeit |
| `INPUT_PERSIST_FRAMES` | Konsekutive Frames mit Bewegung vor `reportMotion` |

**Burst-Intensität:** `s = clamp(speed, 0, 1)` aus `input.js` bestimmt die Burst-Haltedauer bei Trigger. Die Abstoßungskraft $F_0$ liest davon entkoppelt live `motionSpeed` (nicht die eingefrorene Trigger-Intensität) — reagiert also weiter auf Bewegung, während Burst aktiv ist.

**Metaball** — direktes Orbit-Update (nearest-phi):

Pro Frame wird der nächste Punkt auf der Orbit-Ellipse zur aktuellen Ballposition bestimmt. Die radiale Annäherung an diesen Punkt ist geschwindigkeitsgleich mit dem tangentialen Orbit-Schritt (per `min()` überschwingungsfrei gekappt) — kein fixer, langsamer Kriechwert. Das ist bewusst so gewählt: ein aus dem Burst verstreuter Ball soll mit derselben Dringlichkeit zurückschnappen, mit der er anschließend orbitiert, statt sichtbar langsam anzukommen und erst danach auf Orbit-Tempo zu beschleunigen — letzteres läse sich als Zögern, nicht als das intendierte "Panik"-Verhalten des Übergangs. Der Startwinkel $\phi_\text{rand} \sim \mathcal{U}[0, 2\pi)$ wird bei Programmstart gezogen, sodass jeder Run anders aussieht. Kein Noise in der Metaball-Phase.

$$\mathbf{c}_i^\text{orbit}(\phi) = \begin{pmatrix} r_i \cos\phi \\ r_i \sin\phi\,\sin\theta_i \\ r_i \sin\phi\,\cos\theta_i \cdot 0.28 \end{pmatrix}$$

Die effektive Winkelgeschwindigkeit skaliert additiv mit `motionSpeed` — stärkere erkannte Bewegung beschleunigt alle Orbits.

**Cluster** — Konvergenz zu einem Zylinder: Die Bälle werden nicht mehr zu einem formlosen Massezentrum gezogen, sondern jeweils zu einem eigenen Punkt auf einer einwindigen Helix um einen analytischen Zylinder (`_clusterTarget(ballIdx)` in `positionChunk.js`, Radius aus `CLUSTER_CYL_RADIUS` in `constants.js`; die Helix-Höhe ist bewusst auf `HELIX_HALF_HEIGHT=0.9` gekappt, unabhängig von der viel größeren visuellen `CLUSTER_CYL_HALF_HEIGHT` des Zylinders selbst — siehe unten):

$$\mathbf{t}_i = \mathbf{c}_\text{cyl} + \Bigl(R\cos\phi_i,\; \text{lerp}(-H_\text{helix}, H_\text{helix}, u_i),\; R\sin\phi_i\Bigr), \qquad u_i = \tfrac{i+0.5}{n},\; \phi_i = 2\pi u_i$$

$$\mathbf{v}_i(t) \mathrel{+}= k_1(\mathbf{t}_i - \mathbf{c}_i)$$

Perlin-Noise-Störung auf $\mathbf{v}_i$ sorgt weiterhin für organische, unregelmäßige Bewegung während der Konvergenz. Die tatsächliche *Form* im Cluster kommt aber nicht aus der Ballanordnung, sondern aus einem eigenständigen analytischen SDF (siehe SDF-Komposition unten) — die Helix-Zielpunkte sorgen nur dafür, dass die Bälle beim Einblenden visuell zum Zylinder hin konvergieren, statt an einer beliebigen Stelle zu verschwinden; sie müssen dabei nicht die volle (Bild-überragende) Höhe des Zylinders abdecken, da `reflectBounds` Bälle ohnehin auf `BY=1.0` begrenzt.

**Zylinder-Geometrie und Kamera-Zentrierung:** `CLUSTER_CYL_RADIUS=0.14` (ein dünner Stab, ein Viertel des ursprünglichen 0.55), `CLUSTER_CYL_HALF_HEIGHT=1.5` (überragt absichtlich Bild-oben/-unten). Der Zylindermittelpunkt $\mathbf{c}_\text{cyl}$ liegt **nicht** im Weltursprung, sondern bei `CLUSTER_CYL_CENTER_X`/`_Y` = `camera.js`s `CAMERA_START_POSITION.xy` (beide aus `constants.js`, einzige Quelle): `raymarchShader.js`s Kameramodell rotiert die Strahlrichtung nie zu `lookAt(0,0,0)` (bleibt immer exakt `-Z`), wodurch am Weltursprung platzierte Geometrie um einen zu `camPos.xy` proportionalen Betrag außermittig erscheint. Ein Objekt exakt bei `(camPos.x, camPos.y, 0)` erscheint unter diesem vereinfachten Modell exakt bildschirmmittig, unabhängig vom genauen Vorzeichen dieser Verschiebung.

**Burst** — exponentiell abklingende Abstoßung (stark lokal, asymptotisch 0):
$$\mathbf{v}_i(t) \mathrel{+}= \hat{\mathbf{d}}_i \cdot F_0 \cdot e^{-\lambda\|\mathbf{d}_i\|}, \qquad \mathbf{d}_i = \mathbf{c}_i - \hat{\mathbf{c}}$$

$F_0$ skaliert mit der live gelesenen `motionSpeed` $\in [0,1]$. Balls, die die Sichtbarkeitsgrenzen überschreiten, werden reflektiert (`reflectBounds`).

### SDF-Komposition über Phasen

Analog zu Farbe und Position ist auch die Form pro Phase eine eigenständige, in sich geschlossene SDF-Funktion (`clusterSDF`/`metaballSDF`/`burstSDF` in `shapeChunk.js`), gewichtet über dieselben drei Gewichte zum Gesamt-SDF summiert:

$$d(\mathbf{x}, t) = w_\text{cluster}\cdot d_\text{cluster}(\mathbf{x}) + w_\text{metaball}\cdot d_\text{metaball}(\mathbf{x}, t) + w_\text{burst}\cdot d_\text{burst}(\mathbf{x}, t)$$

`clusterSDF` ist ein analytischer, gerundeter Zylinder ohne Ballunion und ohne Rauschen — die "saubere" Form, die Cluster als eigenständige Formsprache tragen sollte (löst den früheren Offenen Punkt „Zielform/Linie in Cluster"). `metaballSDF`/`burstSDF` bleiben je eine vollständige, in sich geschlossene Ballunion inklusive eigenem Oberflächenrauschen, nur mit unterschiedlichem Verschmelzungsradius $k$ (Metaball loser fusioniert, Burst enger — liest sich "explodiert" statt "verschmolzen").

Diese phasenübergreifende Summe ist eine **zeitliche Überblendung** (Gewichte laufen stetig gegen 0/1), keine räumliche Vereinigung: Ein `smin`/`min` über die drei Teil-SDFs wäre falsch, da `clusterSDF` überall im Raum definiert ist und so als geisterhaft "durchscheinende" feste Geometrie sichtbar würde, selbst wenn `clusterWeight ≈ 0`. `smin` bleibt exakt dort, wo es hingehört: innerhalb von `metaballSDF`/`burstSDF`, zur Verschmelzung der 12 gleichzeitig präsenten Bälle. `raymarch()` mildert das inhärente Risiko einer linearen SDF-Überblendung (kein exaktes Abstandsfeld während einer echten Überblendung) mit einem adaptiven, auf den Überblend-Gewichten basierenden konservativen Schrittfaktor, der im (dominanten) eingeschwungenen Zustand keine Kosten verursacht.

---

## Daten & Pipeline

### 1D-Zustandstextur

Format: RGBA32F, Breite 36 (3 Texel × 12 Bälle), Höhe 1

| Texel | r | g | b | a |
|---|---|---|---|---|
| 3i   | pos.x | pos.y | pos.z | r_i^0 |
| 3i+1 | vel.x | vel.y | vel.z | radiusMod(pos, r_i^0) |
| 3i+2 | orbitRadius | orbitSpeed | phi0 (zufällig bei Init) | orbitInclination |

Texel 3i+2: statische Orbit-Parameter; `orbitPhase` wird bei Init mit einem zufälligen Offset $\phi_\text{rand} \sim \mathcal{U}[0, 2\pi)$ addiert, sodass jeder Run anders aussieht. Passthrough im Sim-Shader — nie überschrieben.

Texel 3i+1's `a`-Kanal war ungenutzt und trägt jetzt den rauschmodulierten Radius: `positionChunk.js`s `radiusMod()` läuft im Sim-Pass genau einmal pro Ball (der Pass rendert ja bereits einen Fragment pro Ball), statt — wie ursprünglich — einmal pro Bildschirmpixel im Raymarch-Pass erneut gerechnet zu werden. `shapeChunk.js` liest den fertigen Wert direkt aus der Zustandstextur (`gRad_i`), keine erneute Rauschauswertung dort.

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

### Physik- und Phasendynamik (GPU, `positionChunk.js`)

Pro Fragment liest der Shader die aktuelle Ball-Position/-Geschwindigkeit sowie Orbit-Parameter (Texel 3i+2). Die Physik wird **nicht** hart umgeschaltet, sondern kontinuierlich über dieselben drei Gewichte gemischt, die auch das Shading treibt (`applySimulation` liest `clusterBlend`/`metaballBlend`/`burstBlend` direkt als Uniforms — keine eigene, parallele Gewichtsberechnung mehr auf der GPU-Seite, da das frühere `_clusterActivation`-Gate mit dem Bump-basierten System entfällt).

**Positions-Update** (kombiniert):
$$\Delta\mathbf{c}_i = \Delta\mathbf{c}^\text{orbit} \cdot \text{metaballBlend} + \mathbf{v}_i \cdot (\text{clusterBlend} + \text{burstBlend})$$

**Kräfte**: Zentripetalkraft ist immer aktiv und baut $\mathbf{v}_i$ schon während der Metaball-Phase auf — beim Übergang zu Cluster ist so bereits Impuls in der richtigen Richtung vorhanden (Zielpunkt: die Helix-Position auf dem Cluster-Zylinder, siehe Phasensystem → Cluster). Cluster-Noise und Burst-Abstoßung werden mit `clusterBlend` bzw. `burstBlend` gewichtet. Burst liest seine Kraftstärke live aus `motionSpeed`, nicht aus einer bei Trigger eingefrorenen Intensität. Velocity-Decay wird phasenabhängig interpoliert (hoch bei Burst, niedrig bei Cluster — siehe Phasensystem → Burst→Metaball für warum `VEL_DECAY_BURST` bewusst sanft ist). Nach dem Positions-Update wird `reflectBounds` aufgerufen.

`_simulateCluster`/`_simulateBurst`/`_simulateMetaball` geben jeweils ihren rohen, ungewichteten Beitrag zurück; `applySimulation` gewichtet und summiert sie zentral — dasselbe Muster wie `map()` (`shapeChunk.js`) und `shadeHit()` (`surfaceChunk.js`), nicht mehr "jede Funktion wendet ihr Gewicht selbst an".

### Uniforms (CPU → Shader, pro Frame)

| Uniform | Quelle | Beschreibung |
|---|---|---|
| `time` | phase.js | Globale Zeit |
| `metaballBlend`, `clusterBlend`, `burstBlend` | phase.js (`getWeights()`) | Vorberechnete Blend-Gewichte (Summe = 1); identisch an Shading- und Sim-Material übergeben |
| `motionSpeed` | phase.js (`getMotionSpeed()`) | Erkannte Bewegungsgeschwindigkeit ∈ [0,1]; exponentiell abklingend (×0.97/Tick) ohne Bewegung; treibt auch Bursts Abstoßungsstärke live |
| `camPos` | renderer.js | Kameraposition |
| `resolution` | renderer.js | Viewport-Größe |
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

`environmentShader.js` erzeugt abstrakte, nicht-gegenständliche Umgebungen parameterisiert durch `metaballBlend/clusterBlend/burstBlend` und `time` (Worley-Blobs, Perlin-Ambient, gerichtetes Licht). Regenerierung periodisch + bei Phasenübergängen (via `onPhaseTransition`). Rauheitsabhängige Unschärfe der Reflexion wird beim Sampling im Shader approximiert (`_envSampleLod`, Cone-Sampling — siehe `surfaceChunk.js`), nicht durch Mip-Level einer vorgefilterten Textur.

Phasengekoppelte Stimmung der Umgebung:

| Parameter | Metaball | Cluster | Burst |
|---|---|---|---|
| Farbtemperatur | neutral-grau | warm-diffus | harte Kontraste |
| Helligkeit | mittel | niedrig, gläsern | hohe Highlights |
| Direktivität | gerichtet, scharf (Key-Light + Worley) | weich, zentral (Top-Glow) | gerichtet, scharf (Key-Light + Worley) |

Metaball und Burst teilen sich denselben Generator (`_envKeyLight` in `colorChunk.js`, Worley-Speckle + rotierendes Key-Light), unterschieden nur durch den Tint (`MOOD_METABALL` vs. `MOOD_BURST`, je eine eigene, nach der Phase benannte Konstante) — Metaballs Umgebung liest sich damit als kühlere Variante desselben Wesens, nicht als eigenständige Stimmung. `AMBIENT_FLOOR` hält den Hintergrund zwischen Speckles/Key-Light über Schwarz, statt Farbtöne auf schwarzem Grund.

`environmentShader.js`s `main()` blendet immer alle drei Phasenfarben gewichtet (`blendEnvironment()` aus `colorChunk.js`, kein `envSelect`-Codepfad) — genau wie `shadeHit()`/`moodColor()` für die Ball-Oberflächen. Keine Preset-UI (mehr): `environment.js` setzt seine Blend-Uniforms immer direkt aus `getWeights()`.

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
- Cluster-Phase: Bälle konvergieren auf eine Helix um einen analytischen Zylinder; die Zylinderform selbst kommt aus einem eigenständigen SDF, nicht aus der Ballanordnung (siehe Phasensystem → Cluster, SDF-Komposition über Phasen)
- Burst-Phase: schlagartige Auflösung, Zerstreuung in alle Richtungen
- Shading-Übergänge: kontinuierlich über skalaren Phasenwert interpoliert

### Grafik
- **Metallisch-reflektierend** (Metaball + Burst): Env-Map-Sampling, rauheitsabhängig; Reflexionen fremd und nicht verortbar. Metaball und Burst shading-seitig getrennt: gleiche Technik (`_shadeReflective`), unterschiedlicher Tint (Metaball grau via `MOOD_METABALL_METAL`, Burst via `MOOD_BURST`) und Rauheit (Metaball 0.15, Burst 1.0 — maximal, diffuses Streulicht passend zur chaotischen Burst-Stimmung). Beide tragen ein deutlich schwächeres Rim-Light als Cluster (`REFLECTIVE_RIM_WEIGHT` vs. Clusters `RIM_WEIGHT`), gefärbt nach aktuellem `moodColor()`.
- **Transluzent-lumineszent** (Cluster): Fresnel, Streuung, angedeutete Materialdicke; inneres Leuchten; primärer Rim-Light-Träger
- Schwarzer Hintergrund; Skybox als Alternative ⚠️ offen
- Abstrakte dynamische Environment-Map — keine erkennbaren Strukturen
- **Bloom Post-Processing** (`bloomShader.js` + `gpuSetup.makeBloomSetup`): Hellste Bereiche extrahiert (Luma > threshold), 9-Tap-Gauß H+V geblurt, additiv überlagert; Intensität und Schwellenwert koppeln an `burstBlend` (mehr Leuchtkraft im Burst)

### Shading-Modul (`surfaceChunk.js`)

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

`surfaceChunk.js` ist ein GLSL-Chunk, der in `raymarchShader.js` nach `shapeChunk` (und damit nach `map()`) interpoliert wird (notwendig, da `shadeCluster` `map()` für einen Materialdicken-Proxy aufruft). Austausch eines Materialmodells erfordert nur Änderungen in der jeweiligen Phasenfunktion.

### Audio
- Phasengekoppelte Klangkulisse ⚠️ offen
- Stimmungskopplung mit Environment-Parametern

---

## Implementierungsstand

| Komponente | Status |
|---|---|
| Raymarching + SDF + smin | ✅ |
| Noise-Bibliothek (Perlin, Worley 2D) | ✅ |
| Phasensystem (Gauß-Gewichtssystem, externer Trigger, onPhaseTransition) | ✅ |
| GPU-Simulation (1D-Textur RGBA32F, Ping-Pong, simulationShader.js) | ✅ |
| Shading-Modul (surfaceChunk.js, shadeHit, phasenweise: shadeMetaball/shadeCluster/shadeBurst) | ✅ |
| Environment (dynamische Equirectangular-Env-Map, immer 3-Wege-Blend, environmentShader.js) | ✅ |
| Externes Eingabegerät (input.js) | ✅ |
| Audio | ⚠️ geplant |
| Anwesenheitserkennung (Presence vs. Motion) | ⚠️ geplant |
| Facetracking | ⚠️ geplant (#3) |
| Cluster-Zielform (analytischer Zylinder, eigenständiges SDF) | ✅ |
| Bewegungsparameter (experimentell) | ✅ |
| Bloom Post-Processing | ✅ |
| SDF-Komposition über Phasen (clusterSDF/metaballSDF/burstSDF, gewichtet) | ✅ |
| Feinabstimmung Bump-Konstanten (`LEAD`, `*_SIGMA`, `BURST_HOLD`, `METABALL_SILENCE_HOLD`) | ✅ |

---

## Offene Punkte ⚠️

| # | Thema | Notiz |
|---|---|---|
| 1 | Audio | Web Audio API; drei synthetische Schichten: Metaball = tiefer Drone (Frequenz skaliert mit motionSpeed), Cluster = Subbass-Puls im Atemrhythmus, Burst = perkussiver Anschlag + Hochfrequenz-Rauschen über burstBlend; OscillatorNode + BiquadFilterNode, kein Asset-Loading |
| 2 | Anwesenheitserkennung | input.js liefert nur Motion-Speed; zweite Schicht: Hintergrundmodell erkennt Präsenz ohne Bewegung → Kreatur reagiert auf bloße Anwesenheit (aufmerksam werden, ohne Burst zu triggern); psychologisch stärker als reiner Bewegungs-Trigger |
| 3 | Facetracking | Konkrete Technik für #2: Gesichtserkennung statt/neben Frame-Differencing in `input.js`; macht "Beobachtung verändert das Beobachtete" wörtlich. Siehe Input & Interaktion → Facetracking. Offen: Bibliothek/Modell, Performance-Budget, Blickrichtung vs. reine Anwesenheit, Datenschutz |