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
