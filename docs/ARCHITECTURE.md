# Architecture

## Le principe, en une phrase

**Le calcul ne connaît pas la page ; la page ne calcule pas.** Tout le reste
en découle, et deux tests le vérifient à chaque exécution
(`tests/architecture.test.js`).

C'est ce qui rend les 361 tests possibles sans navigateur : on peut vérifier
une tension de chaîne, un temps de retour ou une part autoconsommée en
important un module et en l'appelant.

## Les cinq couches

Elles sont aujourd'hui des **ensembles de fichiers** dans `js/`, et non des
répertoires. Le découpage physique viendrait ensuite et ne changerait rien aux
règles — ce sont elles qui portent la valeur, et elles sont **vérifiées**, pas
seulement écrites. Un test refuse tout fichier non classé : personne ne peut
ajouter un module sans dire à quelle couche il appartient.

### DOMAINE — le calcul

`etude` · `scenarios` · `tarif` · `profil` · `consommation` · `batiment` ·
`co2` · `score` · `technique` · `validation` · `calepinage` · `gisement` ·
`orientation` · `facture` · `materiel` · `finances` · `prix`

Interdits par test : `document`, `window`, `innerHTML`, `localStorage`,
`getElementById`, `addEventListener`, `fetch`. Interdit aussi d'importer une
couche supérieure — un calcul qui dépend d'un graphique ne peut plus servir au
rapport ni au serveur.

### APPLICATION — l'orchestration

`moteur` · `diagnostics` · `optimiseur` · `copilote` · `laboratoire` ·
`heros` · `etat`

Compose le domaine, ne dessine rien. Mêmes interdits que le domaine sur le
DOM. `etat.js` porte l'état de la simulation et l'assemblage des données du
calcul : c'est le seul endroit où l'on décide quelle consommation, quel
bâtiment et quel module entrent dans l'étude.

### PRÉSENTATION — la mise en forme

`tableau` · `graphe` · `rapport` · `marque` · `anime`

Reçoit des résultats déjà calculés et rend du HTML ou du SVG. **Interdit
d'importer un moteur de calcul** : deux chemins produiraient deux chiffres, et
ils divergeraient.

### INFRASTRUCTURE — le monde extérieur

`session` (stockage local) · `prospect` (envoi au serveur) · `geo`
(géolocalisation) · `journal` (observabilité) · `pvgis/client` (réseau) ·
`pvgis/cache` (stockage)

Seule couche autorisée à parler au stockage, au réseau et au capteur de
position.

### VUES — un composant, un élément

`vues/carte.js` (carte interactive)

Cette couche est née d'un défaut mesurable : le contrôleur dépassait dix-huit
cents lignes, et la carte y aurait ajouté le glissement, le zoom, le
pincement, le chargement des tuiles et le clavier.

Une vue a le droit de toucher au document — **mais seulement à l'élément qu'on
lui confie**. Elle n'a pas le droit de calculer : la géométrie vient du
domaine (`carte/tuiles.js`), la question du fournisseur aussi
(`carte/fonds.js`). Elle ne connaît ni le contrôleur, ni l'état global : deux
tests le vérifient, ainsi qu'un troisième qui interdit d'écrire une adresse de
tuile en dur.

### CONTRÔLEUR — le point d'entrée

`site.js`, et lui seul. Le seul fichier autorisé à orchestrer la page entière.
Il n'exporte rien : personne ne doit pouvoir l'importer, sous peine de cycle.

## Le flux d'une simulation

```
  Le visiteur répond            etat.js assemble           moteur.js orchestre
  ──────────────────           ──────────────────         ────────────────────
  localisation                  donneesEtude()             etudier()
  bâtiment            ───────►  {conso, gouvernorat,  ───► comparer()   (scénarios)
  consommation                   orientation, pente,       evaluer()    (score)
  toiture                        surface, batiment,        dimensionner()
  installation                   moduleWc, moduleId}       analyser()   (diagnostics)
                                                           ↓
                                          SimulationResult ─────────────┐
                                          version, entrées, résultats,  │
                                          hypothèses, traçabilité,      │
                                          avertissements, erreurs,      │
                                          niveau, confiance             │
                                                                        ▼
                          tableau.js · graphe.js · rapport.js · copilote.js
                                    (mise en forme seulement)
```

Un seul chemin, un seul résultat. Le tableau de bord, le rapport imprimé et
l'assistant lisent **le même objet** : ils ne peuvent pas se contredire.

## Ce qui n'est pas ici

Authentification, autorisations, tableau de bord d'administration, CRM,
persistance serveur. Le site est **statique** (GitHub Pages) : il n'a pas de
serveur à lui. Ces fonctions appartiennent au dépôt `cer-expert`, qui reçoit
déjà les demandes d'étude par `POST /api/etude`. Voir `docs/SECURITE.md`.
