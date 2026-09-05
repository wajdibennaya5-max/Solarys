# Tests

```
npm test        # 361 tests, node:test, aucune dépendance
```

## Ce qui est couvert

| Domaine | Fichier | Ce qui est vérifié en priorité |
|---|---|---|
| Étude | `etude.test.js` | production, autoconsommation, retour, bornes |
| Scénarios | `scenarios.test.js` | la courbe d'autoconsommation ne remonte jamais ; l'énergie autoconsommée ne recule jamais |
| Tarif | `tarif.test.js` | grille croissante, inversion exacte au kWh près |
| Consommation | `consommation.test.js` | les quatre méthodes décrivent le même foyer à moins de 25 % d'écart |
| Bâtiment | `batiment.test.js` | un atelier autoconsomme plus qu'un logement |
| Technique | `technique.test.js` | aucune configuration ne dépasse la tension max, sur 3 modules × 13 puissances |
| Validation | *(dans technique)* | une donnée absente sort en UNKNOWN, jamais en conforme |
| Finances | `finances.test.js` | **les deux moteurs donnent le même temps de retour** |
| Optimiseur | `optimiseur.test.js` | trois objectifs, trois réponses distinctes ; rien qui dépasse le toit |
| Moteur | `moteur.test.js` | traçabilité complète, hypothèses toutes citées et existantes |
| Copilote | `copilote.test.js` | chaque question proposée est comprise ; deux projets ≠ même réponse |
| Laboratoire | *(dans copilote)* | aucune médaille sur un critère non calculable |
| Journal | `journal.test.js` | **aucune donnée personnelle n'entre au journal** |
| Architecture | `architecture.test.js` | le calcul ne touche pas la page ; la présentation ne calcule pas |
| Rapport | `rapport.test.js` | les deux comptages de modules concordent ; le nom du client est inerte |
| État | `etat.test.js` | aucune réponse ne se perd entre la saisie et le calcul |

## Les tests qui comptent le plus

Ce ne sont pas ceux qui couvrent le plus de lignes, mais ceux qui empêchent une
faute silencieuse :

1. **`les deux moteurs donnent le même temps de retour`** — deux chiffres
   différents sur la même page feraient douter de tout le reste.
2. **`aucune donnée personnelle n'entre au journal`** — un journal contenant
   l'annuaire des clients est un incident, pas un outil.
3. **`un champ manquant sort en INCONNU, jamais en conforme`** — le jour où le
   catalogue sera remplacé par un vrai, une fiche incomplète est certaine.
4. **`le domaine ne touche jamais à la page`** — c'est ce qui rend tous les
   autres tests possibles.
5. **`chaque exemple proposé est bien reconnu`** — proposer une question à
   laquelle on ne sait pas répondre est le pire défaut d'un assistant.

## Vérification en navigateur

Les tests unitaires ne voient pas une page blanche, un débordement horizontal
ni une pointe de flèche invisible. Chaque phase a été repassée dans Chromium
sur cinq largeurs — 360, 375, 390, 768 et 1280 px — de l'accueil au rapport
imprimé, en contrôlant :

- aucun débordement horizontal (`scrollWidth > innerWidth`)
- aucune erreur JavaScript ni violation de CSP
- aucune cible tactile sous 34 px
- le parcours complet quand le navigateur refuse le stockage local
- l'impression réelle du rapport en PDF

Trois défauts trouvés uniquement ainsi : les pointes de flèche invisibles
(`orient="auto-start-reverse"`), le PDF vidé par deux sélecteurs d'impression
trop larges, et la page blanche 12 s quand le CDN de polices est injoignable.
