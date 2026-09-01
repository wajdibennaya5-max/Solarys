# Solarys

Outil de dimensionnement de centrales photovoltaïques : calepinage réel des
modules, dossier d'exécution, dimensionnement électrique et étude économique.

**Le site :** https://wajdibennaya5-max.github.io/Solarys/
**L'application :** https://wajdibennaya5-max.github.io/Solarys/app/

Tout fonctionne dans le navigateur. Aucun compte, aucun serveur : les projets
restent sur le poste de l'utilisateur et s'exportent en fichier. Une fois la page
chargée, l'application s'installe et fonctionne hors ligne.

## Ce qu'elle fait

| Section | Contenu |
|---|---|
| **Site & gisement** | 34 villes de référence, inclinaison optimale calculée, données mensuelles modifiables |
| **Consommation** | Facture annuelle, relevé mensuel ou liste d'équipements |
| **Calepinage** | Surfaces, obstacles, marges de rive, placement des modules aux dimensions réelles, entraxe des rangées |
| **Champ PV** | Longueur de chaîne, compatibilité MPPT, ratio DC/AC, pertes détaillées |
| **Stockage** | Autonomie, profondeur de décharge, association série/parallèle, régulateur |
| **Câblage** | Sections par chute de tension et courant admissible, fusibles, disjoncteurs, parafoudres |
| **Production** | Productible mensuel, ratio de performance, cascade des pertes |
| **Économie** | Nomenclature chiffrée, flux de trésorerie, VAN, TRI, temps de retour, LCOE, CO₂ |
| **Dossier d'exécution** | Planches A4 à A1 : page de garde, schéma unifilaire, câbles et protections |
| **Rapport** | Document imprimable en marque blanche |

Interface en français, anglais et arabe, avec écriture de droite à gauche.

## Méthode de calcul

- **Gisement** — profil horaire reconstitué sur le jour moyen du mois (jours de
  Klein), décomposition direct/diffus par la corrélation d'Erbs, transposition
  sur plan incliné par HDKR. Gère n'importe quelle orientation.
- **Calepinage** — géométrie réelle : contour de la surface, marge de rive,
  obstacles avec leur dégagement, orientation la plus dense. Sur structures
  inclinées, l'entraxe suit la règle de non-ombrage au solstice d'hiver, et
  l'ombrage résiduel entre rangées est calculé géométriquement.
- **Chaînes** — tension à vide à la température minimale du site contre la
  limite continue de l'onduleur, tension MPP à chaud contre la plage MPPT
  (logique IEC 62548 / UTE C 15-712-1).
- **Câbles** — plus contraignant du courant admissible (IEC 60364-5-52,
  méthode E, corrections de température et de groupement) et de la chute de
  tension. Le critère dimensionnant est affiché.
- **Économie** — flux annuels avec dégradation, inflation et remplacements ;
  VAN, TRI par dichotomie, temps de retour simple et actualisé, LCOE.

Ordres de grandeur contrôlés par les tests : Tunis 36,8 °N à 31° →
1 640 kWh/kWc et un ratio de performance de 0,81 ; Paris → 1 050 kWh/kWc.

## Démarrer localement

```bash
cd app
npm start   # http://localhost:8080
npm test    # 94 tests du moteur de calcul et des traductions
```

Aucune dépendance, aucune étape de construction : ce sont des modules
JavaScript natifs servis tels quels.

## Limites assumées

- Les composants livrés sont des **archétypes génériques**, pas des copies de
  fiches techniques de fabricants : une caractéristique recopiée devient fausse
  à la révision suivante du produit, et un dimensionnement faux engage
  l'installateur.
- Les données de gisement sont **indicatives**, destinées à l'avant-projet. Une
  étude d'exécution demande les données du site réel (PVGIS, NASA POWER,
  Meteonorm ou station locale).
- Le taux d'autoconsommation est estimé par corrélation, faute de courbe de
  charge horaire.
- **Les résultats sont indicatifs.** Toute installation doit être validée par un
  professionnel qualifié au regard des normes applicables sur son marché.
