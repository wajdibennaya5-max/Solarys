# Le bâtiment en volume

## Pourquoi la 3D n'est pas ici pour faire joli

Une surface se mesure à plat. Une implantation, non. Une pente, un débord, un
mur mitoyen plus haut : rien de tout cela ne se lit sur un plan.

La preuve est venue toute seule. Le premier jet de la géométrie inversait le
sens de la pente : un pan plein sud montait vers le sud au lieu d'en descendre.
Sur un plan, rien à voir. En volume, c'est visible en une seconde.

## Un modèle délibérément pauvre

**Un seul pan, une seule pente, une seule orientation.**

Ce n'est pas une limite qu'on subit, c'est le toit que le reste du projet
calcule : le gisement, le calepinage et l'étude ne connaissent qu'une pente et
qu'un azimut. Dessiner ici une toiture à quatre pans que ces calculs ignorent
donnerait une belle image et des chiffres faux — la sorte de mensonge tranquille
que ce projet refuse.

Le jour où l'étude saura traiter plusieurs pans, la scène en montrera plusieurs.
Pas avant.

## Pas de bibliothèque 3D

Le projet n'embarque aucune dépendance JavaScript, et un test le vérifie. Une
scène de quelques dizaines de faces n'a pas besoin d'un moteur :

| Ce qu'il faut | Ce que c'est |
|---|---|
| Placer l'œil | trigonométrie, six lignes |
| Projeter un point | une division par la profondeur |
| Ordonner les faces | tri par profondeur du centre (algorithme du peintre) |
| Écarter le dos des murs | un produit scalaire |
| Rendre les volumes lisibles | un cosinus contre une lumière fixe |

L'algorithme du peintre se trompe sur des faces qui s'interpénètrent. Des murs
et un toit ne le font pas : choisir la simplicité qui suffit plutôt que la
rigueur qui ne sert pas.

## Ce que l'éclairage n'est pas

**Ce n'est pas une étude d'ombrage.** La teinte d'une face ne dépend d'aucune
date, d'aucune heure et d'aucun obstacle : c'est une lumière fixe, choisie pour
que l'œil distingue un mur d'un toit. La phrase est écrite sous la scène, en
permanence, et un test vérifie qu'elle reste vraie.

Le jour où ce projet calculera des ombres, ce sera à partir de la position
réelle du soleil, et cela s'appellera autrement.

## Les garde-fous

- **La caméra ne bascule jamais à la verticale exacte.** À 90° pile le repère
  s'effondre et la scène disparaît sans message. L'élévation est bornée à 89,9°.
- **Un point derrière l'œil n'est pas dessiné.** Il se projetterait en miroir et
  dessinerait un bâtiment retourné, l'air parfaitement normal.
- **Une pente de 89° ne fait pas une tour.** Le cosinus est borné, sinon la
  hauteur file à l'infini et le cadrage avec elle.
- **La hauteur appartient au conteneur, pas au composant.** Une toile qui pousse
  son conteneur relance l'observateur de taille, qui relance le rendu, qui
  repousse la toile. La boucle ne s'arrête jamais et plus aucun bouton n'est
  cliquable. Deux garde-fous : on ignore un redimensionnement qui ne change
  rien, et on ne redessine qu'une fois par image.

## Le cadrage est mesuré, pas deviné

Un premier calcul raisonnait sur la sphère englobant la scène. C'est sûr — rien
ne dépasse — et c'est trop large : le bâtiment se retrouvait à 3 % de l'écran au
milieu d'un grand vide.

La scène est donc réellement projetée, et le recul ajusté en trois passes pour
qu'elle occupe la part d'écran voulue. Le cadrage porte sur le **bâtiment**, pas
sur le terrain : le sol est un repère de lecture, qu'il déborde du cadre ne gêne
personne. Le bâtiment est passé de 3 % à 16 % de la toile.

## Qui fait quoi

| Fichier | Rôle |
|---|---|
| `scene3d.js` (domaine) | caméra, projection, élévation du toit, tri, cadrage |
| `vues/scene.js` (vue) | peint le canvas, écoute l'orbite, le zoom, le clavier |
| `site.js` (contrôleur) | construit la scène depuis le tracé et la pente |

La vue ne calcule aucune géométrie : si elle projetait un point elle-même, deux
géométries coexisteraient et l'une serait fausse. Un test d'architecture le
vérifie.

Le contour est géographique, la scène est métrique. C'est **la même projection**
qui sert aux mesures — deux projections différentes donneraient un volume qui ne
correspondrait pas aux mètres carrés affichés juste au-dessus.

---

# Poser les modules sur le toit tracé

## Pourquoi un second module de calepinage

`calepinage.js` remplit un rectangle. C'est exactement ce qu'il faut quand on ne
connaît du toit que deux cotes, et il reste le calcul de référence du projet.

Mais depuis que le toit se trace, on connaît sa vraie forme. Un toit en L rempli
comme un rectangle **annonce des modules posés dans le vide**. `implantation.js`
découpe donc la grille sur le contour : un module n'est retenu que s'il tient
entièrement dans le pan, retrait de rive compris.

## Le piège de la pente, encore

Un module posé sur un rampant à 30° n'occupe, vu du ciel, que 87 % de sa
longueur. Poser la grille sur l'emprise au sol reviendrait à croire qu'il rentre
15 % de modules **en moins** qu'en réalité.

Le calcul se fait donc dans le plan du toit, puis redescend au sol. Sur un carré
de 10 × 8 m : 24 modules à plat, **28 à 30°**.

## Les quatre coins ne suffisent pas

Sur un toit en L, un rectangle peut enjamber le creux — **coins compris** — et se
retrouver posé sur le vide. Un module n'est accepté que si ses quatre coins sont
dedans *et* qu'aucun de ses côtés ne coupe le contour.

## Le retrait de rive, et le piège qu'il cachait

Un module au ras du bord s'arrache au premier coup de vent ; aucun couvreur ne
l'accepterait. Le contour est donc rétréci de la rive avant tout calcul.

Un retrait plus grand que le pan retourne le polygone — et **ni l'aire ni le sens
de parcours ne s'en aperçoivent**. Sur un carré, reculer chaque coin au-delà du
centre les fait tous basculer ensemble : c'est une rotation d'un demi-tour, qui
conserve l'orientation.

| Carré de 2 m | Retrait | Résultat naïf | Détecté par |
|---|---|---|---|
| aire signée | 3 m | carré de 4 m, **plus grand**, du bon signe | ni l'aire ni le signe |
| contenance | 1,5 m | carré de 1 m, plus petit **et contenu dedans** | ni l'aire ni le signe ni la contenance |

Le seul critère qui tienne est celui qu'on a demandé : chaque sommet rentré doit
se trouver à **au moins `d`** du bord d'origine. Exact sur un polygone convexe,
prudent sur un concave — et dans le doute, refuser vaut mieux que poser des
panneaux dans le vide.

## Ce que les compteurs disent, et ce qu'ils ne disent pas

Modules, puissance continue, surface occupée, rampant restant, taux
d'occupation, disposition. Et deux réserves qui ne disparaissent jamais :

> Elle ne tient compte d'aucun obstacle de toiture : ceux-ci ne sont pas encore
> relevés.

> Ces X kWc sont ce que le toit peut **porter**. L'étude, elle, dimensionne
> d'après votre consommation : les deux chiffres n'ont pas à coïncider, et le
> plus petit des deux commande.

C'est délibéré. Réconcilier silencieusement les deux nombres serait la manière la
plus rapide d'en rendre un faux.

Une pose imposée est respectée telle quelle — c'est parfois la contrainte du toit
— et l'écran dit ce qu'elle coûte : « Pose imposée en portrait. En paysage, le
pan porterait 231 modules (−7). »
