# Le soleil, les obstacles et l'ombre

## Ce que le projet disait avant

> « Ombrage non disponible. »

C'était honnête et c'était insuffisant. Une cheminée mal placée peut couper une
rangée entière de modules à neuf heures en décembre.

## Ce qu'il dit maintenant, et ce qu'il ne dira jamais

| Il calcule | Il ne calcule pas |
|---|---|
| l'ombre géométrique d'obstacles **que vous avez relevés** | les obstacles que vous n'avez pas relevés |
| depuis la position **réelle** du soleil, à une date et une heure | le relief lointain, les arbres qui pousseront |
| projetée sur le plan du toit, **découpée sur son contour** | la lumière diffuse — un module à l'ombre produit encore |
| le nombre de modules **touchés** | les kilowattheures perdus |

Ce dernier point est délibéré. Convertir une surface ombrée en énergie perdue
demanderait un modèle électrique que cette étude n'a pas. Compter les modules
touchés est vérifiable ; annoncer « −12 % de production » ne le serait pas.

**Et surtout** : c'est de la géométrie exacte sur des données approximatives. Si
la cheminée est déclarée à 1,20 m alors qu'elle en fait 1,60, l'ombre calculée
est fausse d'autant, et aucun calcul ne rattrape cela. La réserve accompagne
chaque chiffre :

> Ombrage simulé à partir de N obstacles que vous avez déclarés, avec leurs cotes
> telles que saisies. C'est une simulation géométrique, pas une mesure : une
> hauteur estimée à 20 cm près décale l'ombre d'autant.

## L'absence de relevé n'est pas une absence d'ombre

Sans obstacle saisi, l'écran ne dit **jamais** « aucun ombrage ». Il dit :

> Aucun obstacle n'a été relevé. Ce n'est pas la preuve qu'il n'y en a pas :
> c'est l'absence de relevé.

Toute la différence entre une mesure et un trou dans les données. Un test le
vérifie, et interdit explicitement la formulation rassurante.

## La position du soleil

Algorithme NOAA sous sa forme courante. Trois valeurs vérifiables au crayon pour
Tunis (36,81° N), et le test s'y confronte :

| Date | Hauteur à midi solaire | Formule |
|---|---|---|
| 21 décembre | **29,75°** | 90 − latitude − 23,44 |
| 21 mars | **52,80°** | 90 − latitude |
| 21 juin | **76,63°** | 90 − latitude + 23,44 |

Deux corrections qu'on oublie facilement, et qui comptent :

- **Le fuseau.** La Tunisie vit à UTC+1 toute l'année. Une heure d'écart déplace
  le soleil de quinze degrés — assez pour faire passer une ombre d'un côté à
  l'autre d'une cheminée.
- **L'équation du temps.** Le midi solaire ne tombe pas à midi ; l'écart atteint
  un quart d'heure début novembre. L'ignorer décalerait toutes les ombres
  d'hiver de près de quatre degrés.

Un soleil sous 3° n'est pas déclaré « levé » : il ne projette aucune ombre
exploitable.

## L'ombre est découpée sur le toit

Sans découpe, l'ombre d'une cheminée proche du bord se prolonge dans le vide : la
scène affiche une tache sombre **suspendue à côté du bâtiment**, à la hauteur du
plan du toit prolongé. Faux, et faux d'une manière qui se voit — donc qui fait
douter de tout le reste.

Sutherland-Hodgman exige que la fenêtre de découpe soit convexe. C'est le cas de
l'ombre d'une boîte, jamais garanti pour un toit en L. On découpe donc **le toit
par l'ombre** plutôt que l'inverse : l'intersection est la même et elle reste
juste sur un toit concave.

## La frise : pourquoi un seul chiffre mentirait

Le même obstacle, le même toit, la même installation :

| Moment | Modules touchés |
|---|---|
| 21 décembre, 9 h (soleil à 15,6°) | 8 / 104 |
| 21 décembre, midi (soleil à 31,7°) | 8 / 104 |
| 21 juin, midi (soleil à 76,6°) | **0 / 104** |

Un chiffre unique laisserait croire à une perte permanente. La frise montre
l'ombre balayer le toit heure par heure, et le bilan ne retient que les heures où
le soleil dépasse **10°** — plus bas, la production est marginale et l'y compter
gonflerait le chiffre.

## Les cotes proposées ne sont pas des vérités

Chaque type d'obstacle — cheminée, réservoir, chauffe-eau solaire, muret,
bâtiment voisin, arbre, antenne — arrive avec un **ordre de grandeur** pour aider
la saisie. Ce sont des points de départ modifiables, jamais des valeurs à
accepter les yeux fermés. Un obstacle sans hauteur n'est pas retenu : `Number(null)`
vaut zéro, et un obstacle « de hauteur nulle » passerait pour relevé, ne porterait
aucune ombre, et rassurerait à tort.
