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
│   ├── phase.js                ← Gauß-Gewichtsystem, getWeights()/getMotionSpeed(), reportGazeDetected()/reportMotionEnergy(), onPhaseTransition()
│   ├── constants.js            ← Cross-Datei-Konstanten (BALL_COUNT, Cluster-Shape-Größen/-Rotationen, ...) + Initialzustand der 12 Bälle + glslFloat()
│   ├── camera.js               ← statische Kamera (stub)
│   ├── input.js                ← Webcam: Frame-Differencing (reportMotionEnergy) + face-api.js Gaze-Erkennung (reportGazeDetected) → phase.js Gewichtssystem
│   ├── audio.js                ← Phasengekoppelte Klangkulisse (Stub)
│   ├── environment.js          ← lädt zwei HDRI-Dateien (RGBELoader) aus resources/, blendet sie zur `envMap`
│   └── ui.js                   ← Temporäre manuelle Auswahl (Cluster-Shape-Variante, Cluster-/Metaball-Env-Map-Datei) — kollabierbare Sektionen, oben rechts
├── resources/                   ← statische Assets: geladene `.hdr`-Equirectangular-Environment-Maps
├── shaders/
│   ├── simulationShader.js     ← Physik-GLSL (Sim-Pass); interpoliert positionChunk
│   ├── environmentShader.js    ← Equirectangular-GLSL; interpoliert noiseChunk + colorChunk; nimmt zwei geladene Source-Maps als Uniforms entgegen
│   ├── raymarchShader.js       ← Rendering-GLSL; `buildMainFrag(clusterVariant)` interpoliert noiseChunk + colorChunk + shapeChunk(clusterVariant) + surfaceChunk
│   └── bloomShader.js          ← Bloom Post-Processing (brightExtract, blur, composite Fragment-Shader)
└── shaderChunks/
    ├── vertexChunk.js          ← GLSL-Chunk: gemeinsamer Passthrough-Vertex-Shader
    ├── noiseChunk.js           ← GLSL-Chunk: perlin2D, worley2D
    ├── colorChunk.js           ← GLSL-Chunk: Himmelsfarbe aus zwei gesampelten HDRI-Texturen (`_clusterEnvironment`/`_metaballEnvironment`/`_burstEnvironment`, `blendEnvironment(uv, clusterSourceMap, metaballSourceMap)`) — keine Farbkonstanten mehr
    ├── shapeChunk.js           ← GLSL-Chunk-Factory: `shapeChunk(clusterVariant)`; `_clusterShape`/`_metaballShape`/`_burstShape`, `blendShape()`, `normal()`, `raymarch()` — siehe Phasensystem → Cluster-Shape-Varianten
    ├── surfaceChunk.js         ← GLSL-Chunk: `_metaballShading`/`_clusterShading`/`_burstShading`, `blendShading()` — neutrales Metall (Metaball/Burst) + echte SDF-Glasbrechung (Cluster)
    └── positionChunk.js        ← GLSL-Chunk: `blendPosition` (gewichtet über clusterBlend/metaballBlend/burstBlend)
```

### Modul-Interface-Prinzip

Jedes Modul besitzt seine Uniforms vollständig. `main.js` kennt keine Uniform-Namen:

```javascript
// Einmalig beim Material-Setup:
...simulation.getUniformDefs()    // → { stateTex }
...environment.getUniformDefs()   // → { envMap }
input.initInput()                                    // Webcam-Stream + face-api.js-Modelle laden

// Jeden Frame:
input.updateInput()          // Frame-Differencing → reportMotionEnergy(); gedrosselte Gaze-Erkennung → reportGazeDetected()
stepSimulation()             // liest getWeights()/time/motionSpeed aus phase.js
applyStateToMaterial(material)
applyEnvState(material)
```

### Event-Koordination: Zeit / Input → Phase → Ausgaben

Phase ist der gemeinsame Intermediär zwischen Zeitsteuerung, externem Input und den Ausgabekanälen (Shading, Environment, Audio):

```
tick() / reportGazeDetected() / reportMotionEnergy(speed)
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
- Metaball- und Burst-Phase komponieren ihre 12 Bälle jeweils via **smooth minimum (smin)** zu einem eigenen Teil-SDF (`_metaballShape`/`_burstShape` in `shapeChunk.js`, je ein eigener Verschmelzungsradius $k$):

$$d_\text{metaball/burst}(\mathbf{x}, t) = \operatorname{smin}_{i=1}^{n}\bigl(\|\mathbf{x} - \mathbf{c}_i\| - r_i(t),\; k_\text{metaball/burst}\bigr) + \beta \cdot \mathcal{N}(\mathbf{x}, t)$$

Cluster hat kein eigenes Ball-SDF mehr — sein Teil-SDF ist eine von neun analytischen Primitiv-Varianten (Zylinder/Kugel/Box/Torus/Kapsel/Pyramide, siehe Phasensystem → Cluster). Die drei Teil-SDFs werden gewichtet über die Blend-Gewichte aus `phase.js` zum Gesamt-SDF summiert (siehe unten, „SDF-Komposition über Phasen").

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
| `BURST_HOLD` | **Abgeleitet**, nicht frei gewählt: `= LEAD·BURST_SIGMA`, damit Burst beim Hold-Ende garantiert voll eingeschwungen ist (siehe unten). Fix, nicht mit `motionSpeed` skaliert — der frühere Speed-Interpolations-Spread war kaum wahrnehmbar und erschwerte nur das Abstimmen |
| `METABALL_MIN_HOLD` | Mindestverweildauer in Metaball, unabhängig von Input |
| `METABALL_SILENCE_HOLD` | Stille-Dauer (nach `METABALL_MIN_HOLD`) vor Rückkehr zu Cluster |
| `METABALL_HANDOFF_LEAD` | `0` (nicht `LEAD`) — Metabolls Aktivierung beim Burst-Handoff, siehe unten |
| `CLUSTER_COOLDOWN` | Sperrzeit nach Burst vor dem nächsten — aktuell `0` (keine Sperre); der Vergleich lebt im Scheduler (`_scheduleTick`), Reaktivierung ist eine reine Konstantenänderung |

**Wichtig — Hold-Dauer ≠ Abklingbreite:** Wie lange eine Phase aktiv gehalten wird, ist eine rein verhaltensbezogene Entscheidung, unabhängig von `σ` (das nur die *visuelle* Anstiegs-/Abklinggeschwindigkeit eines Bumps bestimmt). Die nächste Phase wird immer **exakt** beim Ablauf der aktuellen Hold-Dauer aktiviert — nie erst nach einer zusätzlichen "erst abklingen lassen"-Verzögerung.

**Burst→Metaball als exakter 50/50-Übergang:** Cluster→Burst funktioniert von Natur aus gut (Burst aktiviert sofort bei Trigger, während Cluster noch nahe seinem Peak ist — die beiden Kurven kreuzen sich in der Mitte). Burst→Metaball braucht dafür zwei bewusste Entscheidungen: (1) `BURST_HOLD = LEAD·BURST_SIGMA` garantiert, dass `raw_burst` beim Hold-Ende bereits bei 1 angekommen ist, statt mittendrin abgeschnitten zu werden; (2) `METABALL_HANDOFF_LEAD = 0` setzt Metaballs `mu` exakt auf den Handoff-Zeitpunkt statt `LEAD·σ` in die Zukunft — `raw_metaball` startet damit ebenfalls bei 1, nicht beim üblichen ~1%-Boden. Im selben Moment sind beide Bumps auf ihrem Peak (1/1, exakt 50/50); ab da tracked Metaballs `mu` weiter mit `t_now` (bleibt bei 1), während Bursts `mu` einfriert und abklingt — die Gewichtsverteilung kippt rein durch Bursts eigenes Abklingen von 50/50 zu Metaball, ohne dass irgendwo gesprungen wird.

Dasselbe gilt auf der Bewegungsseite: `positionChunk.js` dämpft `vel` während Burst gar nicht (Faktor `1.0`, siehe `blendPosition`s `VEL_DECAY_META`/`VEL_DECAY_CLUSTER`-Mix). Bursts `vel` soll beim Handoff noch echten Schwung tragen, statt schon auf ~0 ausgerollt zu sein — Metaballs eigene Orbit-Korrektur (`_metaballPosition`/`_orbitTangentStep`) bleibt bewusst ein direktes, von `vel` unabhängiges Pos-Update (siehe unten), gerade damit sie mit Bursts Schwung interagiert statt ihn zu überschreiben.

**Parameter (in `input.js`):**

| Konstante | Semantik |
|---|---|
| `ENERGY_SENSITIVITY`, `ENERGY_PIXEL_THRESHOLD` | Skalierung/Rausch-Schwelle für `reportMotionEnergy` (Frame-Differencing, unabhängig von Gaze) |
| `GAZE_DETECT_INTERVAL_FRAMES` | Drosselung: face-api.js läuft nur alle N `updateInput()`-Aufrufe |
| `GAZE_PERSIST_CYCLES` | Konsekutive „blickend"-Erkennungszyklen vor `reportGazeDetected` (nur beim Anschalten, nicht beim Abschalten) |
| `GAZE_CENTER_FRACTION` | Breiten-/Höhenanteil des Kamerabilds, der als „zentriert" zählt |
| `GAZE_FRONTAL_THRESHOLD` | Max. normierter Nasenspitzen-Versatz, der noch als „frontal" zählt |

**Metaball** — direktes Orbit-Update, zwei unabhängige Terme (`positionChunk.js`):

Pro Frame wird der nächste Punkt auf der Orbit-Ellipse zur aktuellen Ballposition bestimmt (`_phiOnOrbit`, projiziert `pos` auf die Orbit-Basisebene). Zwei Terme, beide direkt auf `pos` angewendet (gewichtet mit `metaballBlend`, **nicht** über `vel` akkumuliert — siehe unten):
- **Radiale Rückholkraft** (`_metaballPosition`): `(nearPt - pos) · ORBIT_SNAP_RATE`. Selbstlimitierend — geht gegen 0, sobald der Ball auf seinem Orbit ist. "Zurück in den Orbit, falls Burst ihn zu weit hinausgetragen hat" folgt daraus ohne Sonderfall.
- **Tangentialer Orbit-Schritt** (`_orbitTangentStep`): der Winkel-Fortschritt des Orbits selbst pro Tick, unabhängig vom radialen Term — läuft immer mit voller Stärke, sobald Metaball gewichtet ist, nicht erst nachdem der Ball radial aufgeholt hat.

Beide Terme laufen **nicht** über `vel`: `vel` klingt nur wenige % pro Tick ab, eine Akkumulation dort würde sich jeden Frame aufsummieren statt sich auf die vorgesehene, selbstlimitierende Korrektur einzustellen — besonders der Tangential-Term, der nie gegen 0 geht (der Orbit schreitet immer weiter fort) und unbegrenzt aufschwingen würde. Der Burst→Metaball-Übergang wird stattdessen über die Gaußkurven-Überlappung und Bursts eigene, nie ganz auf 0 abklingende Kraft geglättet (siehe unten), nicht durch einen gemeinsamen Akkumulator der beiden Phasen.

`ORBIT_SNAP_RATE` ist so schnell wie ohne Orbit-Bruch möglich gewählt: `_nearestOrbitPhi` approximiert nur (projiziert auf die Basisebene der Ellipse statt den echten nächsten Punkt zu lösen), und eine radiale Korrektur in ähnlicher Größenordnung wie der Tangential-Schritt kann mit diesem Approximationsfehler resonieren und einen Ball dauerhaft festsetzen statt konvergieren zu lassen. Der Startwinkel $\phi_\text{rand} \sim \mathcal{U}[0, 2\pi)$ wird bei Programmstart gezogen, sodass jeder Run anders aussieht. Kein Noise in der Metaball-Phase.

$$\mathbf{c}_i^\text{orbit}(\phi) = \begin{pmatrix} r_i \cos\phi \\ r_i \sin\phi\,\sin\theta_i \\ r_i \sin\phi\,\cos\theta_i \cdot 0.28 \end{pmatrix}$$

Die effektive Winkelgeschwindigkeit skaliert additiv mit `motionSpeed` — stärkere erkannte Bewegung beschleunigt alle Orbits.

**Cluster** — kein Ziel-Tracking der Ballpositionen mehr: Eine frühere Version zog jeden Ball zu einem eigenen Punkt auf einer Helix um die Cluster-Geometrie (`_clusterTarget(ballIdx)`); diese Funktion wurde ersatzlos entfernt (`_clusterPosition(pos)` in `positionChunk.js` liefert heute ausschließlich eine organische Perlin-Noise-Störung, keine Zielkraft):

$$\mathbf{v}_i(t) \mathrel{+}= \mathcal{N}_2(\mathbf{c}_i, t) \cdot \text{clusterBlend}, \qquad \mathbf{v}_i(t) \mathrel{-}= \mathbf{c}_i \cdot \text{ORIGIN\_PULL} \cdot (\text{clusterBlend} + \text{burstBlend})$$

Die Bälle konvergieren also nur noch lose zum Ursprung (`ORIGIN_PULL`, gewichtet mit `clusterBlend + burstBlend`, aus demselben Grund direkt auf Kraft-Ebene statt erst bei der `pos`-Anwendung wie zuvor — siehe „floating around a point"-Regression in der Git-Historie), nicht auf ein shape-spezifisches Zielmuster — ein generisches, formunabhängiges Zusammenziehen zur Bildmitte wurde als ausreichend bewertet (aufgelöst durch bloßes Hochtunen von `ORIGIN_PULL`, kein shape-spezifischer Code nötig). Die tatsächliche *Form* im Cluster kommt weiterhin ausschließlich aus dem eigenständigen analytischen SDF (siehe SDF-Komposition unten); die Ballpositionen tragen dazu bei, dass die Bälle während einer Überblendung (wo `_metaballShape`/`_burstShape` noch mit ins Gesamtbild einfließen) nicht beliebig weit von der Shape entfernt sichtbar sind, ohne sie exakt zu konturieren.

`CLUSTER_CYL_CENTER_X`/`_Y` (`constants.js`, als `CLUSTER_CENTER` in `shapeChunk.js` zusammengesetzt) ist dadurch kein von der Physik gelesener Zielpunkt mehr, sondern ausschließlich das Zentrum, um das alle Cluster-SDF-Varianten (Zylinder/Kugel/Box/Torus/Kapsel/Pyramide) gebaut werden — ein rein empirisch bestimmter Wert für die Bildmitten-Zentrierung, **nicht** aus dem Kameramodell abgeleitet: sowohl `+CAMERA_START_POSITION.xy` als auch `-CAMERA_START_POSITION.xy` wurden probiert und überschossen die Bildmitte in entgegengesetzte Richtungen; der aktuelle Wert ist eine weitere empirische Korrektur danach.

**Burst** — Abstoßung mit exponentiellem Nahbereich und konstantem Sockel (`_burstPosition` in `positionChunk.js`, **nicht** asymptotisch auf 0 abklingend):
$$\mathbf{v}_i(t) \mathrel{+}= \hat{\mathbf{d}}_i \cdot \bigl(F_\text{offset} + F_\text{peak} \cdot e^{-\lambda\|\mathbf{d}_i\|}\bigr), \qquad \mathbf{d}_i = \mathbf{c}_i - \hat{\mathbf{c}}, \quad F_\text{peak} = F_\text{base} + \text{motionSpeed}\cdot F_\text{scale}$$

Nahe der Formation ist die Kraft am stärksten ($F_\text{offset}+F_\text{peak}$); mit wachsendem Abstand klingt sie exponentiell ab, aber nur bis zu einem konstanten Sockel $F_\text{offset}$ — die Bälle treiben also immer weiter nach außen, statt dass der Schub völlig ausläuft, sobald sie weit von der Formation entfernt sind. Diese Kraft wird jeden Frame ungedämpft in `vel` akkumuliert (siehe oben, `vel`-Decay `1.0` während Burst), daher sind $F_\text{base}$/$F_\text{scale}$ bewusst klein gehalten — die Akkumulation selbst erzeugt den Großteil der Bewegung. Balls, die die Sichtbarkeitsgrenzen überschreiten, werden reflektiert (`reflectBounds`).

### SDF-Komposition über Phasen

Analog zu Farbe und Position ist auch die Form pro Phase eine eigenständige, in sich geschlossene SDF-Funktion (`_clusterShape`/`_metaballShape`/`_burstShape` in `shapeChunk.js`), über `blendShape(p)` gewichtet mit denselben drei Gewichten zum Gesamt-SDF summiert:

$$d(\mathbf{x}, t) = w_\text{cluster}\cdot d_\text{cluster}(\mathbf{x}) + w_\text{metaball}\cdot d_\text{metaball}(\mathbf{x}, t) + w_\text{burst}\cdot d_\text{burst}(\mathbf{x}, t)$$

`_metaballShape`/`_burstShape` bleiben je eine vollständige, in sich geschlossene Ballunion inklusive eigenem Oberflächenrauschen, nur mit unterschiedlichem Verschmelzungsradius $k$ (Metaball loser fusioniert, Burst enger — liest sich "explodiert" statt "verschmolzen"). `_clusterShape` ist komplexer und in einem eigenen Abschnitt unten beschrieben (Cluster-Shape-Varianten).

Diese phasenübergreifende Summe ist eine **zeitliche Überblendung** (Gewichte laufen stetig gegen 0/1), keine räumliche Vereinigung: Ein `smin`/`min` über die drei Teil-SDFs wäre falsch, da `_clusterShape` überall im Raum definiert ist und so als geisterhaft "durchscheinende" feste Geometrie sichtbar würde, selbst wenn `clusterWeight ≈ 0`. `smin` bleibt exakt dort, wo es hingehört: innerhalb von `_metaballShape`/`_burstShape`, zur Verschmelzung der 12 gleichzeitig präsenten Bälle. `raymarch()` mildert das inhärente Risiko einer linearen SDF-Überblendung (kein exaktes Abstandsfeld während einer echten Überblendung) mit einem adaptiven, auf den Überblend-Gewichten basierenden konservativen Schrittfaktor, der im (dominanten) eingeschwungenen Zustand keine Kosten verursacht.

### Cluster-Shape-Varianten (`shapeChunk.js`)

`_clusterShape` ist keine einzelne feste Form mehr, sondern eine von neun möglichen Varianten. Sechs davon sind Kombinationen aus **Form** (Zylinder/Kugel/Box, alle um `CLUSTER_CENTER` zentriert, Größe fix aus `constants.js`: `CLUSTER_CYL_RADIUS`/`_HALF_HEIGHT`, `CLUSTER_SPHERE_RADIUS`, `CLUSTER_BOX_HALF_EXTENT` + `_ROTATION_X`/`_Y`) × **Modus** (voll / mit der Ballunion geschnitten); drei weitere Formen (Torus, Kapsel, Pyramide) existieren bislang nur als **Full**-Variante:

```
clusterCylinderFull / clusterCylinderIntersect
clusterSphereFull   / clusterSphereIntersect
clusterBoxFull       / clusterBoxIntersect
clusterTorusFull
clusterCapsuleFull
clusterPyramidFull
```

Jede ist eine explizite, nicht-verzweigende Funktion, die nur ihren Form-Helfer (`_clusterCylinder`/`_clusterSphere`/`_clusterBox`/`_clusterTorus`/`_clusterCapsule`/`_clusterPyramid`) und — bei den ersten drei — `_clusterIntersect` komponiert. `_clusterShape(p)` selbst ist ein Einzeiler, der auf genau eine dieser neun aliast — welche, entscheidet `shapeChunk(clusterVariant)` **beim Shader-Zusammenbau** (ein JS-String, der in den generierten GLSL-Quelltext eingesetzt wird), nicht ein Laufzeit-Branch. Ändern der Variante bedeutet: `raymarchShader.js`s `buildMainFrag(clusterVariant)` neu aufrufen und `material.fragmentShader`/`needsUpdate` setzen (siehe `main.js`).

**Primitiv-Helfer** (`_sdCappedCylinder`, `_sdSphere`, `_sdBox`, `_sdTorus`, `_sdCapsule`, `_sdPyramid`) sind reine, wiederverwendbare Distanzfunktionen ohne Cluster-Bezug; `_sdSphere` wird zusätzlich von `_foldBall`/`_ballUnion` für die 12 Metaball-Kugeln verwendet (vorher gab es dafür eine separate, redundante `sphere(p,c,r)`-Funktion mit Center-Parameter — inzwischen vereinheitlicht: der Aufrufer übersetzt `p` selbst). Die vier rotierten Formen (Zylinder, Box, Torus, Kapsel, Pyramide) teilen sich einen gemeinsamen Rotations-Helfer `_rotateYX(p, ry, rx)` statt die Sinus/Kosinus-Matrixmultiplikation pro Form zu duplizieren.

**Pyramide — abweichend von der kanonischen Formel:** Die naheliegende geschlossene Pyramiden-SDF (iq, Faltung über die Diagonale via `p.xz = (p.z>p.x) ? p.zx : p.xz`) erzeugt eine sichtbare Knick-Naht entlang beider Bodendiagonalen — der Abstandswert bleibt stetig, aber der Gradient (und damit die per finiten Differenzen berechnete Normale) nicht, was die eigentlich flache Grundfläche wie in Dreiecke zerschnitten aussehen lässt. `_sdPyramid` ist deshalb stattdessen als Schnittmenge (`max`) dreier Halbraum-Ebenen (zwei über `abs(p.x)`/`abs(p.z)` gefaltete Seitenflächen + eine Bodenebene `-p.y`) implementiert — jede Fläche ist dadurch eine echte, knickfreie Ebene; Kanten entstehen nur dort, wo die Pyramide tatsächlich welche hat.

**Intersect-Varianten** (`_clusterIntersect(shapeD, p)`, nur für Zylinder/Kugel/Box): Schnittmenge (`max`, nicht `min`) aus Form und der (rauschperturbierten) Ballunion — die Bälle wirken dadurch von der Form "abgeschnitten", statt als separate Blob-Wolke neben ihr zu schweben. Die Schnittmenge selbst blendet ein, während Metaball ausblendet (`1 - metaballBlend`, nicht `clusterBlend`):

$$d_\text{intersect}(\mathbf{x}) = \text{mix}\bigl(d_\text{ball}(\mathbf{x}),\; \max(d_\text{shape}(\mathbf{x}), d_\text{ball}(\mathbf{x})),\; 1-\text{metaballBlend}\bigr)$$

Bei `metaballBlend≈1` liefert das exakt die (ungeschnittene) Ballunion — identisch zu `_metaballShape`, `_clusterShape` verzerrt also nichts, solange Metaball dominiert. Bei `metaballBlend≈0` ist es die echte Schnittmenge mit der Form in ihrer wahren Zielgröße.

**Wichtig — Form-Größe bleibt immer fix, nur die Schnittmenge blendet:** Eine frühere Version interpolierte stattdessen den Radius/die Ausdehnung der Form selbst zwischen einem großen (die Ballbahnen umschließenden) und dem finalen Wert — das war ein Fehler: mitten in der Überblendung (wenn `metaballBlend` und `clusterBlend` beide relevant sind) hatte die Form dann einen überdimensionierten Zwischen-Radius, der von `clusterBlend` sichtbar ins Gesamtbild gemischt wurde — eine reale, falsch dimensionierte Aufblähung, kein Rendering-Artefakt.

**Full-Varianten** (alle neun Formen als Grundform, aber nur Zylinder/Kugel/Box/Torus/Kapsel/Pyramide *ausschließlich* als Full) brauchen den Intersect-Mechanismus gar nicht — sie referenzieren keine Bälle, sind immer ihre feste Zielgröße, und werden allein durch `clusterBlend`s eigenes Gewicht ein-/ausgeblendet, genau wie `_metaballShape`/`_burstShape`.

**Zufallsauswahl + UI:** `phase.js`s `getShapeVariant()` würfelt bei jedem Burst→Metaball-Übergang einen neuen Index aus `CLUSTER_SHAPE_VARIANTS` (nur die sechs Full-Varianten, siehe oben); `main.js` pollt das Ergebnis jeden Frame (gleiches Muster wie `getWeights()`/`getMotionSpeed()`) und baut bei Änderung `buildMainFrag(variant)` neu. Manuelle Buttons existieren weiterhin daneben, nicht als Ersatz, sondern zum Testen/Übersteuern: `src/ui.js`s `initClusterShapeUI(variants, onSelect)` baut die Buttons für `CLUSTER_SHAPE_VARIANTS_EXPERIMENTAL` (alle neun, inkl. der drei Intersect-Varianten) direkt per DOM-API, in einer kollabierbaren Sektion oben rechts. Ein manueller Klick und die automatische Auswahl halten sich über `main.js`s `_appliedShapeVariant` gegenseitig auf dem Laufenden, ohne sich zu überschreiben.

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

Pro Fragment liest der Shader die aktuelle Ball-Position/-Geschwindigkeit sowie Orbit-Parameter (Texel 3i+2). Die Physik wird **nicht** hart umgeschaltet, sondern kontinuierlich über dieselben drei Gewichte gemischt, die auch das Shading treibt (`blendPosition` liest `clusterBlend`/`metaballBlend`/`burstBlend` direkt als Uniforms — keine eigene, parallele Gewichtsberechnung mehr auf der GPU-Seite, da das frühere `_clusterActivation`-Gate mit dem Bump-basierten System entfällt).

**Positions-Update** (kombiniert):
$$\Delta\mathbf{c}_i = \Delta\mathbf{c}^\text{orbit} \cdot \text{metaballBlend} + \mathbf{v}_i \cdot (\text{clusterBlend} + \text{burstBlend})$$

**Kräfte**: Zentripetalkraft + Ursprungsanziehung sind mit `(clusterBlend+burstBlend)` gewichtet — direkt auf Kraft-Ebene, bevor sie in `vel` akkumulieren, nicht erst bei der `pos`-Anwendung. Dadurch laden sie sich während Burst weiter auf `vel` auf (Cluster erbt so Impuls in Richtung Helix-Ziel, siehe Phasensystem → Cluster), tragen aber ~0 zu `vel` bei, solange Metaball dominiert. Cluster-Noise und Burst-Abstoßung werden mit `clusterBlend` bzw. `burstBlend` gewichtet. Burst liest seine Kraftstärke live aus `motionSpeed`, nicht aus einer bei Trigger eingefrorenen Intensität, und klingt mit wachsendem Abstand nur bis zu einem konstanten Sockel ab (nicht auf 0). Velocity-Decay wird phasenabhängig interpoliert (`VEL_DECAY_META`/`VEL_DECAY_CLUSTER`, `mix`-Kette; während Burst keine Dämpfung, Faktor `1.0`). Nach dem Positions-Update wird `reflectBounds` aufgerufen.

`_clusterPosition`/`_burstPosition`/`_metaballPosition` geben jeweils ihren rohen, ungewichteten Beitrag zurück; `blendPosition` gewichtet und summiert sie zentral — dasselbe Muster wie `blendShape()` (`shapeChunk.js`) und `blendShading()` (`surfaceChunk.js`), nicht mehr "jede Funktion wendet ihr Gewicht selbst an".

### Uniforms (CPU → Shader, pro Frame)

| Uniform | Quelle | Beschreibung |
|---|---|---|
| `time` | phase.js | Globale Zeit |
| `metaballBlend`, `clusterBlend`, `burstBlend` | phase.js (`getWeights()`) | Vorberechnete Blend-Gewichte (Summe = 1); identisch an Shading- und Sim-Material übergeben |
| `motionSpeed` | phase.js (`getMotionSpeed()`) | Rohe, von der Blickerkennung unabhängige Bewegungsenergie ∈ [0,1] (`reportMotionEnergy`); exponentiell abklingend (×0.97/Tick) ohne gemeldete Energie; treibt auch Bursts Abstoßungsstärke live |
| `camPos` | renderer.js | Kameraposition |
| `resolution` | renderer.js | Viewport-Größe |
| `stateTex` | simulation.js | Ball-Zustandstextur (RGBA32F, 36×1) |
| `envMap` | environment.js | Equirectangular Environment-Map, jeden Frame aus zwei geladenen HDRI-Dateien neu zusammengesetzt (direkt gesampelt, keine PMREM-Prefilterung) — siehe Environment unten |

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

Zwei unabhängige, gleichzeitig laufende Signale — beide rufen `phase.js`-Interfaces direkt auf, keine Kopplung durch `main.js`:

- **Rohe Bewegungsenergie** (Frame-Differencing, wie zuvor): meldet kontinuierlich `reportMotionEnergy(speed)` — treibt ausschließlich visuelle Skalierung (Orbit-Winkelgeschwindigkeit, Burst-Abstoßungsstärke), **keine** Phasenauslösung mehr.
- **Blickerkennung** (face-api.js, siehe Facetracking unten): meldet `reportGazeDetected()`, sobald eine Person das Objekt gerade ansieht — dies ist der alleinige Auslöser für Cluster→Burst und hält Metaball, solange der Blick anhält (siehe Phasensystem).

Anleitungsinteraktion als Installationskonzept denkbar ⚠️ offen.

### Facetracking (`input.js`, face-api.js)

Ersetzt die ursprünglich als Phasenauslöser genutzte Bewegungserkennung durch echte Gesichts-/Blickerkennung — die Kernthese der Installation wird damit wörtlich eingelöst: **„Beobachtung verändert das Beobachtete"** reagiert jetzt tatsächlich darauf, *dass* (und mit welcher groben Kopf-Ausrichtung) eine Person das Objekt ansieht, statt nur pixelweise Veränderung zu messen.

- **Bibliothek:** [face-api.js](https://github.com/justadudewhohacks/face-api.js) (CDN via jsdelivrs `/+esm`-Auto-Wrap-Endpoint, siehe `index.html`-Importmap — die von der npm-Version ausgelieferten Dateien sind entweder ein UMD-Bundle oder ein ES6-Build mit externen Bare-Imports, keines davon direkt browser-ESM-tauglich ohne diesen Umweg); Modellgewichte (`tinyFaceDetector` + `faceLandmark68TinyNet`) liegen lokal in `resources/`.
- **Zentriert-Test:** Bounding-Box-Zentrum innerhalb der mittleren `GAZE_CENTER_FRACTION` (30%) des (horizontal gespiegelten) Kamerabilds — wer am Bildrand steht, gilt als „versteckt", unabhängig von der Kopfausrichtung.
- **Frontal-Test (Blick-Proxy):** Da die Tiny-Modelle keinen echten Iris-/Gaze-Vektor liefern, wird der horizontale Nasenspitzen-Versatz relativ zum Augen-Mittelpunkt, normiert auf den Augenabstand, als Näherung für „Kopf zeigt zur Kamera" verwendet (`GAZE_FRONTAL_THRESHOLD`) — jemand, der zentriert steht, aber zur Seite blickt, zählt nicht als beobachtend.
- Ein Gesicht gilt nur dann als „blickend", wenn **beide** Tests zutreffen — zentriert-aber-abgewandt und frontal-aber-am-Rand zählen beide nicht.
- **Drosselung + Debounce:** Die Erkennung läuft nur alle `GAZE_DETECT_INTERVAL_FRAMES` (4) Frames (Kosten deutlich höher als Frame-Differencing); `GAZE_PERSIST_CYCLES` (2) aufeinanderfolgende „blickend"-Zyklen müssen anschlagen, bevor das Signal „an" schaltet — Verlust des Blicks wird dagegen sofort übernommen (keine Debounce beim Abschalten).
- Modul-Interface-Prinzip bleibt gewahrt: `input.js` ruft weiterhin `phase.js`-Funktionen direkt auf, keine Vermittlung durch `main.js`.
- Offen: Datenschutz-Implikationen einer Gesichtserkennung im Installationskontext; echte Iris-/Gaze-Vektor-Auswertung (statt des Kopfausrichtungs-Proxys) wäre mit einem Modell mit Iris-Landmarks möglich, aktuell nicht implementiert.

### Environment (`environment.js`)

Die Umgebung ist keine rein prozedurale Textur mehr, sondern eine jeden Frame neu zusammengesetzte Equirectangular-Textur aus zwei **geladenen** HDRI-Dateien (`resources/*.hdr`, per `THREE.RGBELoader` aus `three/addons/`), die je nach Phase unterschiedlich gewichtet einfließen:

```
resources/*.hdr (RGBELoader)  →  clusterSourceMap / metaballSourceMap (sampler2D-Uniforms auf dem internen Env-Material)
environmentShader.js           →  WebGLRenderTarget (HalfFloat, Equirectangular)
                                →  material.uniforms.envMap
```

`ENV_MAP_FILES` (`environment.js`) listet alle in `resources/` verfügbaren Dateien — da eine statische Seite ohne Server das Verzeichnis nicht zur Laufzeit auslesen kann, muss diese Liste händisch gepflegt werden, sobald eine neue Datei hinzukommt. `CLUSTER_ENV_MAP_DEFAULT`/`METABALL_ENV_MAP_DEFAULT` legen die Standardauswahl pro Rolle fest; `setClusterEnvMapFile`/`setMetaballEnvMapFile` laden bei Bedarf eine andere Datei aus derselben Liste nach. **Wichtig:** `THREE.DataTexture` (was `RGBELoader` liefert) hat standardmäßig `flipY = false`, im Unterschied zu gewöhnlichen Bild-Texturen (`flipY = true`) — die Equirectangular-UV-Konvention in `colorChunk.js` erwartet Letzteres, daher wird `flipY` nach dem Laden explizit auf `true` gesetzt (sonst erscheint die Himmelskugel vertikal gespiegelt).

`colorChunk.js`s `blendEnvironment(uv, clusterSourceMap, metaballSourceMap)` sampelt beide Texturen mit derselben Equirectangular-Projektion und mischt sie gewichtet — die Cluster-Phase liest ausschließlich `clusterSourceMap`, Metaball **und** Burst teilen sich `metaballSourceMap`. Beide Quellen bekommen je einen festen Belichtungs-Multiplikator (`CLUSTER_ENV_EXPOSURE`, `METABALL_ENV_EXPOSURE`), da die geladenen Referenzdateien dunkler wirkten als gewünscht — reiner Helligkeitsausgleich, keine kreative Tönung. Die frühere prozedurale Ambient-Schicht (Worley-Speckle + rotierendes Key-Light, `_envKeyLight`/`_worleyContrast`, plus ein additiver Phasenfarben-Tint) ist vollständig entfernt, nicht nur deaktiviert; die einzige Differenzierung zwischen den drei Phasen ist, welche der beiden geladenen Dateien (und mit welcher Gewichtung) an einem gegebenen Punkt der Himmelskugel einfließt.

Da alle drei Phasen in **eine** gemeinsame `envMap`-Textur gewichtet einfließen (statt getrennt gesampelt zu werden), ist eine echte Isolation zwischen den beiden Quellbildern während einer Überblendung bewusst nicht gegeben: Bei relevanten Zwischen-Gewichten (z. B. Cluster→Burst) enthält das Ergebnis an jedem Pixel einen Mix aus beiden geladenen Bildern — Clusters Glasbrechung (siehe Shading-Modul) sampelt in diesem Moment also nicht rein `clusterSourceMap`, sondern die bereits gemischte Textur. Das ist explizit **kein Bug**, sondern dieselbe gewichtete Überblendung wie bei SDF-Komposition, Farbe und Position (siehe oben) — konsequent zu Ende gedacht: nirgends im System wird hart umgeschaltet, also auch hier nicht. Eine strikte Trennung (zweite, getrennt gesampelte Uniform statt der gemeinsamen `envMap`) wurde bewusst verworfen.

**UI (bewusst dauerhaft manuell):** `src/ui.js`s `initClusterEnvMapUI`/`initMetaballEnvMapUI` bauen je eine kollabierbare Sektion ("CLUSTER ENVIRONMENT"/"METABALL ENVIRONMENT") mit einem Button pro Datei aus `ENV_MAP_FILES`, oben rechts neben der Shape-Auswahl (siehe Cluster-Shape-Varianten oben) — alle drei Sektionen teilen sich ein gemeinsames, lazy erzeugtes Panel-Element. Anders als die Shape-Auswahl ist hier **keine** automatische Zufallsauswahl vorgesehen — die beiden Env-Map-Dateien bleiben eine reine Nutzerentscheidung.

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
- Cluster-Phase: Bälle driften nur noch lose zum Ursprung (keine formbezogene Zielkraft mehr, siehe Phasensystem → Cluster); die sichtbare Form kommt weiterhin ausschließlich aus einem eigenständigen SDF (Zylinder/Kugel/Box × voll/geschnitten + Torus/Kapsel/Pyramide nur voll, neun Varianten), nicht aus der Ballanordnung (siehe Cluster-Shape-Varianten)
- Burst-Phase: schlagartige Auflösung, Zerstreuung in alle Richtungen
- Shading-Übergänge: kontinuierlich über skalaren Phasenwert interpoliert

### Grafik
- **Metallisch-reflektierend, neutral** (Metaball + Burst): Env-Map-Sampling gegen ein festes, ungefärbtes `METAL_F0 = vec3(0.95)` (kein Phasen-Tint mehr) bei sehr niedriger Rauheit (`SURFACE_ROUGHNESS = 0.05`, nahezu Spiegel) — Metaball und Burst sind shading-seitig inzwischen **identisch**; sie unterscheiden sich nur noch über ihre SDF-Fusionsenge (`SMIN_K`) und Physik, nicht mehr über Farbe/Rauheit/Rim-Light (Rim-Light wurde als eigenständiger Effekt ganz entfernt).
- **Transluzent-lumineszent, echte Glasbrechung** (Cluster): kein Farbton-/Rim-Light-Ansatz mehr, sondern ein tatsächlicher, kurzer SDF-Raymarch durch das Cluster-Volumen (`_clusterTraceInterior`) mit Snell'scher Brechung beim Ein- und Austritt und Beer-Lambert-Absorption entlang des Innenwegs; Ergebnis wird Fresnel-gewichtet mit einer reinen Spiegelreflexion gemischt. Nur ein sehr dunkler, kaum wahrnehmbarer Tint (`GLASS_TINT_COLOR`) bleibt als Absorptions-Bodenfarbe für sehr lange Innenwege.
- Schwarzer Hintergrund; Skybox als Alternative ⚠️ offen
- **Geladene, nicht mehr rein prozedurale Environment-Map** (`resources/*.hdr`) — steht in Spannung zum ursprünglichen Anspruch "keine erkennbaren Strukturen" (siehe Environment oben); bewusste Entscheidung, um überhaupt harte, richtungsabhängige Reflexionsmerkmale zu bekommen, die die vorherige rein prozedurale Himmelskugel nicht lieferte
- **Bloom Post-Processing** (`bloomShader.js` + `gpuSetup.makeBloomSetup`): Hellste Bereiche extrahiert (Luma > threshold), 9-Tap-Gauß H+V geblurt, additiv überlagert; Intensität und Schwellenwert koppeln an `burstBlend` (mehr Leuchtkraft im Burst)

### Shading-Modul (`surfaceChunk.js`)

Da `MeshPhysicalMaterial` mit Raymarching inkompatibel ist (es operiert auf rasterisierter Geometrie, nicht auf SDF-ausgewerteten impliziten Flächen), wird das Shading vollständig manuell nachimplementiert. Keine Farbkonstanten mehr in diesem Modul — die einzige Farbquelle ist die gesampelte Environment-Map (siehe Environment oben).

Eine Funktion pro Phase, `blendShading` mischt alle drei gewichtet (immer 3-Wege, keine Early-Outs):

| Phase | Ansatz | Helfer |
|---|---|---|
| **Metaball** (`_metaballShading`) | Neutrales Metall, Cook-Torrance + Env-Map-Reflexion | `_shadeReflective` (geteilt mit Burst) |
| **Burst** (`_burstShading`) | Identisch zu Metaball | `_shadeReflective` (geteilt mit Metaball) |
| **Cluster** (`_clusterShading`) | Echte SDF-Glasbrechung: Fresnel-Mix aus Spiegelreflexion und einem kurzen Innen-Raymarch | `_clusterTraceInterior`/`_clusterRefractedColor` |

`_shadeReflective(n, rd, NdotV)` (kein Tint-Parameter mehr) verwendet ein festes `METAL_F0 = vec3(0.95)` sowohl für den direkten Cook-Torrance-Specular-Term als auch für die roughness-bewusste Fresnel-Gewichtung (`_fresnelSchlickRoughness`) des Env-Map-Samples; `SURFACE_ROUGHNESS = 0.05` (nahezu Spiegel) ist eine einzelne, von beiden Phasen geteilte Konstante. Kein Rim-Light-Term mehr (früher `_rimLight`/`RIM_WEIGHT`/`RIMLIGHT_COLOR`, ersatzlos entfernt, da er die Env-Map-Reflexion mit einer unkorrelierten Farbe überdeckte).

`_clusterShading(p, n, rd, NdotV)` verwendet inzwischen durchgehend das übergebene, geblendete `n`/`NdotV` — genau wie `_metaballShading`/`_burstShading` — statt einer eigenen, nur an `_clusterShape` gemessenen Normale (`_clusterNormal`, das diese Sonderbehandlung übernahm, wurde ersatzlos entfernt). Das war die gewählte Auflösung eines früheren offenen Punkts: der Trefferpunkt `p` kommt vom Raymarch über `blendShape` (die 3-Phasen-Summe), liegt also nicht notwendigerweise exakt auf `_clusterShape`s eigener Nullmenge — anstatt das per Korrektur des Eintrittspunkts zu beheben, wird die Abweichung jetzt bewusst in Kauf genommen und die Normalenbehandlung mit den anderen beiden Phasen vereinheitlicht (ein Test mit der geblendeten Normale las sich nicht schlechter als die Cluster-eigene, siehe Git-Historie). `_clusterTraceInterior(p, rd)` marschiert weiterhin bis zu `GLASS_TRACE_STEPS` Schritte durch `_clusterShape`s Inneres (Snell'sche Brechung beim Eintritt via `1.0/GLASS_IOR`, beim Austritt via `GLASS_IOR`) und bestimmt die Austrittsnormale jetzt ebenfalls über die geblendete `normal()` aus `shapeChunk.js` statt einer Cluster-eigenen; `_clusterRefractedColor` mischt das austretende Env-Map-Sample exponentiell mit `GLASS_TINT_COLOR` nach Weglänge (Beer-Lambert, `GLASS_ABSORPTION`). Das Endergebnis ist ein Fresnel-Mix (`_fresnelFactor`, `GLASS_FRESNEL_POWER`) aus dieser gebrochenen Farbe und einer reinen Spiegelreflexion derselben Env-Map.

Einziger öffentlicher Aufruf aus `main()` des Fragment-Shaders:

```glsl
color = blendShading(p, n, rd);
```

`surfaceChunk.js` ist ein GLSL-Chunk, der in `raymarchShader.js` nach `shapeChunk` (und damit nach `blendShape`/`_clusterShape`/`normal`) interpoliert wird (notwendig, da `_clusterTraceInterior` `_clusterShape` für den Innen-Raymarch und `normal()` für die Austrittsnormale direkt aufruft). Austausch eines Materialmodells erfordert nur Änderungen in der jeweiligen Phasenfunktion.

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
| Shading-Modul (surfaceChunk.js, blendShading, phasenweise: _metaballShading/_clusterShading/_burstShading) | ✅ |
| Environment (dynamische Equirectangular-Env-Map, immer 3-Wege-Blend, environmentShader.js) | ✅ |
| Externes Eingabegerät (input.js): Motion-Energie + Gaze-gesteuerte Phasenauslösung | ✅ |
| Facetracking / Anwesenheits- & Blickerkennung (face-api.js, zentriert + frontal) | ✅ |
| Audio | ⚠️ geplant |
| Cluster-Zielform (analytisch, eigenständiges SDF) | ✅ |
| Cluster-Shape-Varianten (Zylinder/Kugel/Box × voll/geschnitten + Torus/Kapsel/Pyramide nur voll) | ✅ |
| Cluster-Shape-Zufallsauswahl bei Burst→Metaball (`getShapeVariant()`) + manuelle Override-UI | ✅ |
| Bewegungsparameter (experimentell) | ✅ |
| Bloom Post-Processing | ✅ |
| SDF-Komposition über Phasen (`_clusterShape`/`_metaballShape`/`_burstShape`, gewichtet) | ✅ |
| Feinabstimmung Bump-Konstanten (`LEAD`, `*_SIGMA`, `BURST_HOLD`, `METABALL_SILENCE_HOLD`) | ✅ |
| Echte SDF-Glasbrechung (Cluster, `_clusterTraceInterior`) | ✅ |
| Neutrales Metall-Shading ohne Phasen-Tint (Metaball/Burst) | ✅ |
| Geladene HDRI-Environment-Maps (`resources/*.hdr`, getrennt für Cluster vs. Metaball/Burst) | ✅ |
| Konsolidierte UI (`src/ui.js`, kollabierbare Sektionen oben rechts) | ✅ |

---

## Offene Punkte ⚠️

| # | Thema | Notiz |
|---|---|---|
| 1 | Audio | Web Audio API; drei synthetische Schichten: Metaball = tiefer Drone (Frequenz skaliert mit motionSpeed), Cluster = Subbass-Puls im Atemrhythmus, Burst = perkussiver Anschlag + Hochfrequenz-Rauschen über burstBlend; OscillatorNode + BiquadFilterNode, kein Asset-Loading |
| 2 | Echte Blickrichtung (Iris-Vektor) | Aktuell approximiert `input.js` „blickend" über Zentrierung + Kopf-Frontalität (Nasenspitzen-Versatz), kein echter Iris-/Gaze-Vektor — ein Modell mit Iris-Landmarks könnte Blickrichtung unabhängig von der Kopfausrichtung auswerten |
| 3 | Datenschutz-Implikationen | Gesichtserkennung im Installationskontext wirft Fragen zu Zustimmung/Anzeige auf — bislang nicht adressiert |