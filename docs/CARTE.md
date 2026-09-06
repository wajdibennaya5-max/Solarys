# La carte et la localisation

## Le problème que ça résout

Le gouvernorat suffit à estimer l'ensoleillement. Il ne suffit à rien d'autre.
Un toit se dessine sur une image, pas sur une case administrative — et le
centre de Sfax est à des dizaines de kilomètres du bâtiment du client.

Cette partie du projet fournit donc **un point**, avec ce qu'il vaut.

## Trois chemins, jamais un seul

| Chemin | Ce qu'il donne | Sa faiblesse |
|---|---|---|
| Capteur du terminal | latitude, longitude, précision annoncée, altitude, heure | inutilisable à l'intérieur d'un bâtiment ; le navigateur peut refuser |
| Repère posé sur la carte | un point désigné au geste | demande un fond de carte |
| Coordonnées saisies | un point exact si elles sont exactes | demande de connaître ses coordonnées |

Aucun n'est meilleur dans l'absolu. Les trois existent, et **chacun étiquette
ce qu'il produit** : `capteur-fin`, `capteur`, `carte`, `saisie`,
`centre-gouvernorat`, `inconnue`.

## Ce qu'une position autorise

`localisation.js` est le **seul** endroit du projet qui décide si une position
permet de raisonner sur une toiture. Une seule décision, un seul test.

| Classe | Seuil | Tracé de toiture |
|---|---|---|
| Précision fine | ≤ 10 m | oui |
| Bonne précision | ≤ 50 m | oui |
| Précision moyenne | ≤ 500 m | non |
| Précision faible | ≤ 5 km | non |
| Position régionale | au-delà, ou inconnue | non |
| **Point désigné** | aucune précision mesurée, mais un geste délibéré | oui |

La dernière ligne corrige un défaut réel : une coordonnée tapée à la main n'a
aucune précision annoncée — aucun capteur n'a parlé. Traitée comme une
précision inconnue, elle était classée « Position régionale » alors qu'elle
désigne un point au mètre près, et l'écran affichait « régionale » juste
au-dessus d'un tracé de toiture autorisé. Deux affirmations contradictoires.

Une précision **absente** n'est jamais un zéro. `Number(null)` vaut 0, et un 0
mal filtré signifierait « précision parfaite ». Le projet s'est déjà fait
prendre ; un test le garde maintenant.

## Le fond de carte n'est pas actif par défaut

Afficher le terrain demande un fournisseur de tuiles : un tiers, des
conditions d'utilisation, une attribution obligatoire, parfois une facture.
Le projet **n'engage personne** tant que ce n'est pas écrit dans la page :

```html
<meta name="carte-fond" content="esri-imagerie">
```

Sans cette balise, la carte fonctionne quand même — repère, coordonnées,
échelle graphique, quadrillage à la bonne dimension — et elle l'écrit :
« Aucun fond cartographique n'est configuré ». C'est un état normal, pas une
panne, et surtout **pas une image floue présentée comme le terrain**.

| Valeur | Nature | Tracé de toiture | Attribution |
|---|---|---|---|
| `esri-imagerie` | vue aérienne | possible | Esri, Maxar, Earthstar Geographics |
| `osm` | plan des rues | impossible — un plan ne montre pas les toits | contributeurs OpenStreetMap |

Un fond privé se déclare par description complète (`modele`, `attribution`,
`nature`). **Une description sans attribution est refusée** : c'est la seule
condition que tous les fournisseurs partagent. Une adresse en clair aussi.

### Le piège de la politique de sécurité

L'hôte du fournisseur doit figurer dans `img-src` de la CSP. Sinon le
navigateur refuse chaque tuile **en silence** : la carte paraît simplement
vide, et on cherche la panne du côté du réseau pendant une heure. Les deux
hôtes connus y sont déjà, et le contrôleur écrit un avertissement dans le
journal si un fond déclaré n'y est pas.

## La géométrie

`carte/tuiles.js` implémente la projection de Mercator sphérique — la même que
toutes les cartes en tuiles. Aucune bibliothèque : le projet n'embarque aucune
dépendance JavaScript, et cette projection est une formule, pas un moteur.

Ce qui compte ici n'est pas d'afficher des images, c'est que **la carte soit
mesurable**. `metresParPixel(latitude, zoom)` donne l'échelle réelle, et elle
dépend de la latitude : l'oublier gonflerait la Tunisie de vingt pour cent.
C'est ce nombre qui donnera plus tard les mètres du toit, donc les mètres
carrés, donc les kilowatts. Les tests le vérifient dans les deux sens :
un pixel converti en point puis reconverti doit retomber au même pixel.

Au zoom 18 sous Tunis, un pixel vaut 0,478 m.

## Ce que la carte ne prétend pas

- Une image aérienne est **d'archive**. Sa date n'est pas garantie, et un
  bâtiment récent peut en être absent. C'est écrit sous la carte.
- Une mesure prise sur une image reste **une estimation**, à confirmer sur
  site. Cette phrase accompagne le fond aérien en permanence.
- Un plan des rues ne montre pas de toiture, et l'interface refuse de faire
  semblant du contraire.

---

# Dessiner et mesurer le toit

## Pourquoi remplacer deux cotes par un tracé

Le formulaire demandait une largeur et une profondeur, et en déduisait un
rectangle. Un toit tunisien réel a un décroché, une terrasse, un pan coupé —
et surtout **personne ne connaît ses cotes par cœur**, alors qu'on sait très
bien suivre le bord de sa maison du doigt sur une image.

Les deux cotes restent : le tracé les remplit, il ne les supprime pas.

## Qui fait quoi

| Fichier | Rôle |
|---|---|
| `toiture.js` (domaine) | mesure : aire, périmètre, cotes, caps, étalonnage |
| `vues/carte.js` (vue) | dessine le contour et les cotes qu'on lui donne |
| `site.js` (contrôleur) | pose les points, demande la mesure, l'affiche |

**La vue ne mesure rien.** Elle reçoit des cotes déjà calculées. Deux chemins
de calcul finiraient par diverger, et rien ne dirait lequel est faux.

## Le piège qui coûte le plus cher

Un tracé sur une image donne la surface **vue du ciel** — la projection
horizontale. Un toit à 30° porte 15,5 % de surface de plus que son emprise au
sol ; à 45°, 41 %. Confondre les deux fausse le nombre de panneaux, donc la
puissance, donc le devis.

Les deux surfaces sont donc affichées séparément, et le supplément dû à la
pente est **isolé** plutôt que noyé dans un total.

## Ce qu'un tracé raté ne produit jamais

- **Moins de trois points** : pas de surface, et l'écran dit pourquoi.
- **Un contour qui se recoupe** : refusé. Un polygone en nœud papillon a une
  aire mathématiquement définie et physiquement absurde — les deux boucles se
  soustraient. Sans ce contrôle, un tracé raté rendrait une surface *trop
  petite*, sans rien dire.
- **Quatre mètres carrés, ou vingt mille** : refusés, avec la cause probable
  (zoom trop large, contour qui déborde sur le voisin).

Un refus sans explication ne sert à rien : chaque message dit quoi corriger.

## L'étalonnage manuel

Une image aérienne n'est pas une carte au cordeau : prise de vue oblique,
relief, erreur de géoréférencement. Deux mètres tracés à l'écran peuvent en
valoir deux et dix — assez pour décaler une rangée de panneaux.

Le remède est celui des géomètres : mesurer une longueur connue sur place, la
retracer sur l'image, corriger l'échelle du rapport constaté. **Le facteur
reste visible** : une correction cachée serait pire que pas de correction.

Deux garde-fous :

- Au-delà de ±40 %, la correction est **refusée**. À ce point ce n'est plus une
  image imprécise, c'est un tracé qui ne porte pas sur la même chose que la
  mesure ; corriger masquerait une erreur bien plus grave.
- Le facteur porte sur les **longueurs**. Les surfaces varient donc en son
  carré. L'appliquer tel quel aux mètres carrés donnerait une correction deux
  fois trop faible — donc un nombre de panneaux faux. Un test le vérifie.

## L'orientation déduite

Le côté le plus long d'un toit est le plus souvent le faîtage ou l'égout : le
pan regarde perpendiculairement. C'est une **déduction**, pas une mesure, et le
champ s'appelle `faitageProbable`.

L'azimut suit la convention du projet — **0 = plein sud**, celle de PVGIS —
et le test se confronte à la table de `pvgis/parametres.js` plutôt que de la
recopier. Mélanger deux conventions oriente des toits au nord en leur donnant
l'ensoleillement du sud, et personne ne s'en aperçoit avant le chantier.

Un défaut réel s'est produit là : le reste d'un nombre négatif est négatif en
JavaScript, et l'écart angulaire rendait son complément. Un pan plein sud
ressortait plein nord. Le calcul a quitté le contrôleur pour le domaine, où il
est sous test.

## Ce que le tracé ne devient jamais

Reprendre les cotes ne transforme pas une lecture d'image en relevé. Le
formulaire reçoit le rectangle de **même surface que le rampant**, dans les
proportions du tracé, et le message le dit. Le contour exact reste enregistré.

La réserve accompagne chaque chiffre, étalonnage compris :

> Mesure estimée à partir de la carte. Une vérification sur site est
> recommandée.
