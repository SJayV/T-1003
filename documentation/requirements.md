# Requirements

## 1. Konzept

Die Anwendung modelliert ein abstraktes, nicht-anthropomorphes Lebewesen, um zur Reflexion darüber anzuregen, ob und wie Betrachtende menschliche Verhaltens- und Gefühlsmuster in rein artifizielle Konstrukte hineininterpretieren.

Zentraler Mechanismus: *Beobachtung verändert das Beobachtete.*

Ein im Gleichgewicht ruhendes Wesen erschrickt, sobald es sich beobachtet wähnt, löst sich abrupt in Unruhe auf und beruhigt sich erst nach einer gewissen Zeit wieder.

Die virtuelle Umgebung rahmt das Wesen als in seinem Habitat gefangenes, fremdartiges Exemplar und erzeugt ein Wechselspiel aus Sicherheitsgefühl und Unbehagen gegenüber seiner Andersartigkeit.

Ästhetische Referenz für die reflektierend-morphende Oberfläche ist der T-1000.

## 2. Interaktion

**Ereignisse:**
- erkannte Beobachtung / Blickkontakt durch Person vor der Kamera
- Beenden des Ruhezustands / Auslösen des Schreckmoments

**Modulation:**
- Bewegung im Umfeld: Beeinflussung der Intensität / Geschwindigkeit in Unruhephase
- Unabhängigkeit vom Auslöser selbst

**Webcam als Eingabegerät:**
- Eingabegerät für Anwesenheitserkennung / Blickrichtungserkennung
- Berechnung von Bewegungsenergie aus Bilddifferenzen
- **Anwendungsebene:** Verarbeitung der Daten
- **Shader:** Verwendung daraus abgeleiteter, bereits gewichteter Zustandsgrößen

**Szenenkamera:**
- Bildkamera der 3D-Szene
- statisch, keine Nutzersteuerung

## 3. Phasensystem

**Wiederkehrender Zyklus:**

| Phase | Bedeutung | Auslöser für nächste Phase |
|---|---|---|
| **Metaball** | Unruhe: losen Orbitieren der metallisch-reflektierenden Bestandteile | Fortsetzung durch Beobachtung; Abklingen nach Mindestdauer + kurzer Stille |
| **Cluster** | Gleichgewicht: Verschmelzung zu einem einzelnen, glasartig-transparenten, statischen Körper | erkannte Beobachtung |
| **Burst** | Schreck: Explosionsartige Abstoßung der Bestandteile vom gemeinsamen Schwerpunkt | fixe Haltedauer / Abklingdauer |

**Kein abrupter Sprung zwischen Phasen:** kontinuierliche Überblendung von Form / Shading / Environment / Bewegung / Audio zu jedem Zeitpunkt

**Kein Cooldown:** jederzeit sofortige Auslösung eines neuen Zyklus durch erneute Beobachtung

## 4. Objektdarstellung

**Erscheinungsformen des Objekts:**
- **Varianten:**
  - $n$ Metaballs
  - geometrischer Körper
- **implizite Definition** über Signed-Distance-Fields
- **Rendering** per Raymarching
- **keine explizite Mesh-Geometrie** außer einem bildschirmfüllenden Quad

**Metaball-Oberfläche:**
- **Daten:**
  - $i$: Index
  - $\mathbf{c}_i(t)$: Position
  - $r_i(t)$: Radius
- **kombiniertes SDF** des Gesamtobjekts per Glättungsfunktion $\operatorname{smin}_k$:

$$S_M(\mathbf{x},t)=\operatorname*{smin}_k\;\bigl(\|\mathbf{x}-\mathbf{c}_i(t)\|-r_i(t)\bigr),\quad i=1,\dots,n$$

**Geometrischer Körper im Cluster-Zustand:**
- **kombiniertes SDF** $S_K$ aus Menge vorgefertigter, geschlossener Grundformen
- zufällige Auswahl bei jedem Phaseneintritt

**Pseudozufällige Noise-Funktion:**

$$\mathcal{N}(\mathbf{x},t)$$

- additive Perturbation des kombinierten SDFs, Erzeugung organisch wirkender, nicht perfekt glatter Oberfläche

$$\hat S_M(\mathbf{x},t)=S_M(\mathbf{x},t)+\beta\cdot\mathcal{N}(\mathbf{x},t)$$

- additive Modulation des Radius jedes Balls, unabhängig von der Oberflächenperturbation, keine Kopplung an die Sichtbarkeit einzelner Bälle innerhalb der Ballunion

$$r_i(t) = r_i^0+\alpha\cdot\mathcal{N}(\mathbf{c}_i(t),t)$$

## 5. Gewichtung der Phasen

**Gewichtungsfunktion:** unnormierter Gauß-Kernel für jede Phase $p\in\{\text{Metaball, Cluster, Burst}\}$

$$\mathcal{G}_p(t\mid\mu_p(t),\sigma_p^2)$$

**normierte Gewichte:**

$$\hat w_p(t)=\frac{\mathcal{G}_p(t\mid\mu_p,\sigma_p^2)}{\sum_{q}\mathcal{G}_q(t\mid\mu_q,\sigma_q^2)}$$

**Prinzip:** gleiche Phasengewichte für alle Attribute

**phasenabhängige Attributsfunktion $a_p$:** tatsächlich wirksamer Wert als Konvexkombination

$$a(\xi,t)=\sum_p \hat w_p(t)\cdot a_p(\xi,t)$$

**Parameter:**
- $\sigma_p^2$: Sanftheit des Phasenübergangs
- $\mu_p(t)$: Zeitpunkt des Phasenübergangs
  - $\mu_p=t$: sofortiges Einsetzen
  - $\mu_p=t+l\cdot\sigma_p$: verzögertes Einsetzen

## 6. Bewegung pro Phase

1. **Metaball:**
    - **Orbitbewegung:** Bewegung entlang eines festen, geneigten Orbits um das Szenenzentrum
    - **Orbitparameter:**
      - $\rho_i$: Orbit-Radius
      - $\nu_i$: Orbit-Neigung
      - $\varsigma_z$: globale Stauchung in $z$-Richtung
      - $\varphi(t)$: Winkel entlang des Orbits

    $$\mathbf{q}_i(\varphi(t)) = \rho_i\begin{pmatrix}
      \cos\varphi(t)\\
      \sin\varphi(t)\sin\nu_i\\
      \varsigma_z\cdot\sin\varphi(t)\cos\nu_i
    \end{pmatrix}$$

    - **Orbiteigenschaften:**
      - zufälliger Anfangswinkel auf jeweiligen Orbits
      - inkommensurable Orbitgeschwindigkeiten: kein exaktes Wiederholen des Bewegungsbilds
    - zusätzliche Modulation der Winkelgeschwindigkeit durch die erkannte Bewegungsenergie

2. **Cluster:**
    - **Ursprungszug:** sanfter Zug zum Szenenursprung

    $$\mathbf{v}_i\propto \mathbf{o}-\mathbf{c}_i$$

    - Verschmelzung zu einem Körper
3. **Burst:**
    - **Abstoßung:** Beschleunigung fort von gemeinsamem Schwerpunkt

    $$\hat{\mathbf{c}}(t)=\frac1n\sum_i\mathbf{c}_i(t)$$

    - **Kraftskalierung:** von der Bewegungsenergie abhängige Stärke

    $$\mathbf{v}_i\propto \mathbf{c}_i-\hat{\mathbf{c}}$$

## 7. Architektur (Implementationsebenen)

**Technologische Basis:** browserbasierte WebGL-Anwendung mit Three.js als Rendering-Framework

**Fünf Ebenen:** Durchlauf pro Frame in folgender Reihenfolge

1. **Anwendungsebene:**
    - CPU
    - Input-Verarbeitung
    - Phasen-Steuerlogik
    - **Uniforms:** Zeit / Gewichte / Eingabedaten
2. **Simulationsebene:**
    - GPU & Fragment-Shader
    - Render-to-Texture
    - **1D-Zustandstextur:** pro Frame Aktualisierung von Position / Geschwindigkeit / Radius jedes Balls
    - **Ping-Pong-Mechanismus:** Textur im Folgeframe wiederum als Eingabe
3. **Environment-Ebene:**
    - GPU & Fragment-Shader
    - gewichtsabhängige Modulierung zweier phasenspezifischer Environment-Maps
    - kontinuierliche Rotation des Ergebnisses
4. **Shader-Ebene:**
    - GPU
    - **Raymarching:** Rekonstruktion eines Sehstrahls je Fragment
    - **Isofläche:** Lokalisierung & Approximation der Normale
    - **Shading:** Berechnung unter Verwendung der Environment-Textur
5. **Postprocessing:**
    - GPU
    - **Bloom-Filter:** gewichtsabhängige Modulierung von Intensität / Schwellwert

**Kein Build-Schritt:** Anwendung als Sammlung aus ES-Modulen
- Laden von three.js per `importmap` von einem CDN
- lokaler Webserver, kein `file://`-Aufruf

## 8. Audio

**Klangebenen:** phasengekoppelte Endlosschleifen
- **Cluster:** ruhig / niederfrequent
- **Burst:** Knall / Explosion
- **Metaball:** hochfrequent / alienhaft

## 9. Robustheit

**Best Effort:** Kamera-, Mikrofon- und Ressourcenzugriffe
- verweigerte Berechtigungen oder fehlende Dateien: Warnung, kein Fehler
- ggf. dauerhafter Verbleib im Cluster-Zustand

**Hysterese:**
- Bestätigung der Beobachtungserkennung über mehrere Frames
- Vermeidung von Flackern durch einzelne Fehlerkennungen
