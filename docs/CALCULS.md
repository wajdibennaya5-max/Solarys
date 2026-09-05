# Les calculs, et d'où viennent leurs nombres

> Toute valeur marquée **à vérifier** n'a pas été relue sur un document
> officiel en vigueur. Ce n'est pas la même chose que « fausse » : c'est
> l'endroit où porter son attention en premier.

Le moteur republie toutes ces hypothèses à chaque simulation
(`moteur.js → hypothesesUtilisees`), et la page les affiche avec leur source
et leur état. Rien n'est caché dans le code.

## Version du moteur

`moteur.js → VERSION`. Elle figure dans chaque résultat et chaque rapport.
Deux études du même toit qui ne donnent pas le même chiffre doivent pouvoir se
comparer : sans version, on ne saurait pas si c'est la saisie ou le calcul qui
a changé.

- **majeur** — un résultat change pour les mêmes entrées
- **mineur** — une capacité s'ajoute sans changer les résultats
- **correctif** — correction sans effet sur les chiffres

## Gisement solaire — `gisement.js`

Productible par gouvernorat, de **1 520** (Bizerte) à **1 760** kWh/kWc/an
(Tozeur). Vingt-quatre valeurs, une par gouvernorat. Profil mensuel interpolé
entre un profil nord et un profil sud.

*Vérifié* : les ordres de grandeur sont ceux du bassin méditerranéen sud.

## Orientation et inclinaison — `orientation.js`

Huit orientations (plein sud 1,00 → plein nord 0,53) et quatre inclinaisons
(terrasse 0,89, moyenne 1,00). Sur une toiture-terrasse, l'orientation du
bâtiment ne compte plus : les modules se posent sur châssis inclinés au sud.

Sans réponse, **aucune perte n'est appliquée** — supposer le pire écarterait
un visiteur à tort, mais le résultat est alors le meilleur cas possible, et le
diagnostic le dit.

## Autoconsommation — `etude.js → COURBE_AUTOCONSOMMATION`

**Le taux dépend de la taille de l'installation**, il n'est pas constant. Le
soleil produit à midi ; une petite installation passe presque entièrement dans
les appareils allumés, une grosse déborde sur le réseau au prix de rachat.

| production ÷ consommation | part autoconsommée |
|---|---|
| 0,25 | 90 % |
| 0,50 | 80 % |
| 1,00 | **65 %** (point d'ancrage) |
| 1,50 | 52 % |
| 3,00 | 33 % |

Le point d'ancrage se règle par **type de bâtiment** (`batiment.js`) : maison
65 %, commerce 80 %, agricole 85 %, industrie 88 %. À midi, une maison est
vide et un atelier tourne.

**À vérifier** : ces taux sont des ordres de grandeur de terrain. Le *rapport*
entre eux est plus solide que leur valeur absolue.

## Tarif STEG — `tarif.js`

Tranches progressives, appliquées **par tranche** et non en bloc. Sert
uniquement quand la consommation n'a pas été lue sur une facture.

**À VÉRIFIER — `GRILLE.verifiee = false`.** La structure reproduit celle d'un
tarif basse tension domestique, mais les valeurs n'ont pas été relues sur une
grille officielle. Contrôle de vraisemblance disponible : sur un cas où la
facture réelle donne 0,283 DT/kWh, la grille en déduit 0,297 — 5 % d'écart.
Un test interdit par ailleurs à la grille de produire un prix que la page
refuserait d'un client (0,08 à 0,60 DT/kWh).

C'est **le seul tableau à corriger** le jour où une facture réelle est
disponible.

## Coût de l'installation — `etude.js`

`coût = 1 200 DT + 2 700 DT × kWc`

La part fixe couvre coffret, câblage principal, mise à la terre et
déplacement : elle se paie une fois, que l'installation fasse un kilowatt ou
dix. Sans elle, le coût par kWc serait constant et le moteur d'optimisation
recommanderait toujours la plus petite installation.

Résultat : 3 900 DT/kWc à 1 kWc, 3 000 à 4 kWc, 2 740 à 30 kWc.

**À vérifier** : ordres de grandeur du marché tunisien.

## Analyse financière — `finances.js`

Huit paramètres, tous visibles et modifiables. Trois jeux — conservateur,
standard, optimiste — qui sont trois **valeurs** des mêmes paramètres, avec
l'écart affiché à côté du résultat.

Indicateurs : retour simple, retour actualisé, valeur actuelle nette, taux de
rendement interne (bissection), et **coût actualisé du kWh produit**. Ce
dernier est le seul chiffre qui se compare directement au tarif payé.

**Non pris en compte, et dit** : aucune subvention, aucun crédit, aucun effet
fiscal, remplacement d'onduleur supposé couvert par l'entretien.

Le temps de retour de `finances.js` et celui de `etude.js` sont vérifiés
identiques à un centième d'année près, sur sept puissances. Deux temps de
retour différents sur la même page feraient douter de tout le reste.

## CO₂ — `co2.js`

**0,47 kgCO₂/kWh**, réseau tunisien majoritairement au gaz naturel.

**À VÉRIFIER — `VERIFIE = false`.** Ordre de grandeur, non relu sur une
publication officielle. Équivalences : 22 kg absorbés par arbre et par an,
0,15 kg par kilomètre en voiture.

## Dimensionnement électrique — `technique.js` + `validation.js`

Températures de dimensionnement : **0 °C** minimum, **70 °C** de cellule
maximum, 25 °C de référence.

- La tension à vide **monte quand il fait froid** : c'est au petit matin d'un
  jour d'hiver que la chaîne dépasse la tension maximale et détruit l'entrée.
- La tension MPP **s'effondre en été** : à 70 °C elle chute d'un cinquième, et
  une chaîne trop courte sort de la plage MPPT au moment où elle devrait
  produire le plus.

Six contrôles, quatre états : **PASS / UNKNOWN / WARNING / FAIL**. UNKNOWN est
obligatoire dès qu'une donnée manque et ne s'efface jamais derrière un PASS.

Deux courants distincts, contre deux limites distinctes : l'Imp contre le
courant d'entrée, l'Isc majoré de 1,25 contre le courant de court-circuit
admissible.

## Solar Score — `score.js`

Cinq facteurs pondérés : potentiel solaire 20, orientation 25, surface 20,
adéquation 20, rentabilité 15.

Un facteur dont la donnée manque **sort du calcul** et le barème est
renormalisé — jamais deviné. La confiance est rendue avec la note ; en dessous
de 70 % du barème connu, le score s'annonce **préliminaire**.

## Ombrage

**Non calculé.** Aucune donnée d'obstacle, de hauteur ni d'horizon n'est
collectée. Tous les chiffres supposent un toit entièrement dégagé toute la
journée, et le diagnostic l'annonce systématiquement.
