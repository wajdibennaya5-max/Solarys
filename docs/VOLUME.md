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
