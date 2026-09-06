# Intégration du service de données solaires (PVGIS)

## Où passe la donnée

```
  index.html                     <meta name="pvgis-relais" content="https://…">
      │                          (une ligne — c'est le seul interrupteur)
      ▼
  js/site.js  ───► definirRelais()
      │
      ▼
  js/moteur.js  enrichirDepuisService()      ← la seule porte vers l'extérieur
      │
      ▼
  js/pvgis/client.js        validation → cache → relais → normalisation → erreurs
      │                     (le SEUL fichier du projet qui appelle le réseau)
      ▼
  cer-expert  /api/pvgis    liste blanche de calculs et de paramètres, limite
      │                     de débit, délai ferme, cache HTTP
      ▼
  re.jrc.ec.europa.eu/api/v5_3
      │
      ▼
  js/pvgis/reponse.js       chaque champ enveloppé avec sa provenance
      │
      ▼
  js/etude.js               productibleRetenu() ← LA MESURE ENTRE DANS LE CALCUL
      │
      ▼
  js/fusion.js              étiquetage : SOURCE / CALCUL / SAISIE / HYPOTHÈSE
      │
      ▼
  tableau de bord · rapport · assistant
```

## Pourquoi un relais serveur

Le service ne renvoie pas d'en-tête `Access-Control-Allow-Origin`. Un `fetch`
depuis la page est refusé par le navigateur, quelle que soit la qualité du
code. Le relais (`cer-expert`, route `/api/pvgis`) appelle le service depuis
le serveur et renvoie la réponse **sans la transformer** : la normalisation
reste côté site, avec ses tests. Un relais qui interprète devient un second
endroit où la logique peut diverger.

## Activer

1. Déployer la branche `claude/monetize-open-source-dwfrib` de `cer-expert`
   (la route `/api/pvgis` y est).
2. Vérifier : `curl 'https://20122011.xyz/api/pvgis?calcul=PVcalc&lat=34.74&lon=10.76&peakpower=4&loss=14&angle=30&aspect=0&outputformat=json'`
3. Dans `index.html` de Solarys, décommenter :
   `<meta name="pvgis-relais" content="https://20122011.xyz/api/pvgis">`
4. L'adresse doit figurer dans `connect-src` de la politique de sécurité —
   elle y est déjà pour `20122011.xyz`. **Sur un autre hôte, le navigateur
   bloque l'appel sans message** ; le journal le signale (« relais absent de
   la politique de sécurité »).

Pour couper le service : recommenter la ligne. Rien d'autre à faire.

## Vérifier les convertisseurs

Ils sont écrits d'après le contrat documenté de l'API v5.3 et **n'ont pas été
confrontés à une réponse réelle** depuis l'environnement de développement,
dont la sortie réseau est fermée.

```
node scripts/verifier-pvgis.mjs            # Sfax
node scripts/verifier-pvgis.mjs 36.80 10.18   # Tunis
```

Le script appelle le service en direct, passe la réponse dans nos
convertisseurs, et dit **champ par champ** ce qui a été lu et ce qui manque.
Un champ « ABSENT » signifie que le contrat a changé : corriger
`js/pvgis/reponse.js`.

## Les trois conversions qui perdent les intégrations

| | Chez nous | Chez le service |
|---|---|---|
| **Azimut** | orientation nommée | `aspect` : **0 = sud**, −90 = est, +90 = ouest |
| **Inclinaison** | plat / faible / moyenne / forte | `angle` en degrés ; **terrasse = 30°**, pas 0 |
| **Puissance** | kWc | `peakpower` en **kWc** pour `PVcalc`, en **Wc** pour `SHScalc` |

La convention géographique usuelle (0 = nord) donne exactement le contraire de
la première ligne : plein sud deviendrait 180, l'installation serait
retournée, et la production chuterait de moitié **sans qu'aucune erreur ne
s'affiche**. Un test vérifie qu'un azimut plus proche de zéro correspond bien
à une orientation qui produit davantage selon notre propre moteur.

## Ce qui vient du service, ce qui vient de nous

| Valeur | Origine |
|---|---|
| Production annuelle, irradiation, altitude, base de données, période | **SOURCE** |
| Productible (production ÷ puissance demandée) | **CALCUL** |
| Puissance, autoconsommation, économies, retour, CO₂ | **CALCUL** |
| Consommation, prix du kWh (sur facture), toiture | **SAISIE** |
| Taux d'autoconsommation, coûts, hausse du tarif | **HYPOTHÈSE** |
| Productible sans service | **INTERNE** |

Confondre production et productible attribuerait au service un chiffre qu'il
n'a jamais donné. Un test le verrouille.

## Cache

La clé est construite sur **exactement les paramètres envoyés**. Changer
l'inclinaison, l'azimut ou la puissance produit une clé différente, donc un
appel ; changer son nom n'en produit aucun. Les coordonnées sont arrondies à
cent mètres : en deçà le rayonnement est identique, et garder plus de chiffres
ferait manquer le cache à chaque frémissement du marqueur.

Durée : trente jours, vingt-quatre entrées. Repli en mémoire si le navigateur
refuse le stockage.

## Ce qui n'est pas fait

- **Séries horaires et année type (TMY)** : la couche sait les demander
  (`CALCULS.horaire`, `CALCULS.tmy`, délai de 60 s) mais aucun convertisseur
  ni aucune interface ne les exploite. Des milliers de lignes ne se chargent
  pas sans une raison précise.
- **Comparaison de suivis** : `client.comparerSuivis()` existe et fonctionne ;
  aucune page ne l'appelle encore.
- **Horizon du terrain** : le convertisseur existe et distingue le relief des
  obstacles de toiture ; l'interface circulaire n'est pas faite.
- **Hors réseau avec batterie** : paramètres et convertisseur écrits, interface
  non faite.
