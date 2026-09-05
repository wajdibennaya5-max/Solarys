# Solarys

Étude photovoltaïque gratuite pour les foyers tunisiens.

**Le site :** https://wajdibennaya5-max.github.io/Solarys/

Quatre questions, toutes tirées de la facture STEG, et le visiteur sait ce que
le solaire lui ferait économiser : puissance à installer, production, économie
mensuelle, temps de retour. Gratuit, immédiat, sans compte.

## Le parti pris

**On ne devine pas le tarif STEG.** Il est progressif, il dépend du contrat, et
un tarif supposé fausserait toute l'économie du projet. On demande donc la
consommation *et* le montant payés — tous deux écrits sur la facture — et on en
déduit le prix réel du kilowattheure.

Une étude bâtie sur ses chiffres, le client la reconnaît. Une étude bâtie sur
une moyenne nationale, il la conteste.

## Ce que le site ne fait pas

- Il ne voit ni l'orientation exacte du toit, ni l'ombre du bâtiment voisin,
  ni l'état du tableau électrique. L'estimation le dit à l'écran.
- Il n'affiche aucun témoignage ni compteur de clients : il n'y en a pas encore,
  et les inventer coûterait plus cher que le silence.
- Il n'a ni serveur ni base de données. Les réponses restent dans le navigateur
  du visiteur jusqu'à ce qu'il écrive lui-même sur WhatsApp.

## Structure

```
index.html          la page, entière
js/gisement.js      productible par zone, les 24 gouvernorats
js/etude.js         dimensionnement, production, économie, temps de retour
js/prix.js          le dinar en millimes, mise en forme tunisienne
js/prospect.js      la demande WhatsApp, et l'offre payante
js/site.js          le tunnel en quatre étapes et l'affichage du résultat
tests/              28 tests
```

## Le modèle

L'estimation en ligne est gratuite et le restera : c'est elle qui donne envie.
Ce qui se paie, c'est l'**étude détaillée** — le dossier qu'un installateur
accepte comme base de devis. Son prix et son contenu se règlent dans
`js/prospect.js`, tout comme le numéro WhatsApp qui reçoit les demandes.

## Démarrer localement

```bash
npm start   # http://localhost:8080
npm test    # 28 tests
```

Aucune dépendance, aucune étape de construction : des modules JavaScript natifs
servis tels quels.

## Hypothèses à revoir

`js/etude.js` regroupe dans `HYPOTHESES` les seuls nombres qui ne viennent pas
du client — coût au kWc, part autoconsommée, valeur du surplus, hausse du prix
de l'électricité. Ce sont eux qui vieillissent : à vérifier chaque année.

---

L'ancien produit — dimensionnement professionnel, dossier d'exécution, boutique
et paiement USDT — reste entier sur la branche `solarys-v1`.
