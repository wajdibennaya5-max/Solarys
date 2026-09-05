# Vendre Solarys, et être payé

Ce document décrit la chaîne complète, de la commande d'un client jusqu'à
l'argent disponible sur une carte. Il n'y a rien à développer pour la mettre
en route : tout ce qu'elle utilise existe déjà dans le dépôt.

## La chaîne, en entier

```
   client sur le site
        │  clique « Commander »
        ▼
   WhatsApp / courriel ────► la demande arrive, formule et prix déjà écrits
        │                     (app/js/boutique.js — COMMANDE)
        │  le client règle
        ▼
   USDT / virement / espèces ─► vous constatez le règlement vous-même
        │                        (app/js/boutique.js — PAIEMENT)
        │
        ▼
   node tools/cle.mjs "<client>" ─► la clé, et le message à renvoyer
        │
        ▼
   le client colle la clé ────► Réglages → « Clé de licence »
```

Aucune étape n'est automatique entre le règlement et la clé : **c'est vous qui
constatez le paiement et qui émettez**. En dessous de quelques ventes par jour,
c'est le bon compromis — cela évite d'attendre la validation d'un compte
marchand pour encaisser sa première licence, et cela fonctionne dans les pays
où Stripe et PayPal n'encaissent pas.

## 1. Ouvrir la vente

Un seul fichier à modifier : `app/js/boutique.js`. La vitrine et l'application
le lisent toutes les deux ; il n'y a pas de prix ni de lien à recopier ailleurs.

```js
export const COMMANDE = {
  whatsapp: '216XXXXXXXX',   // format international, sans + ni espaces
  courriel: '',              // utilisé seulement si whatsapp est vide
};

export const PAIEMENT = {
  usdt: { adresse: 'T...', reseau: 'TRC20' },
  virement: '',
  autre: '',
};
```

Dès qu'un de ces champs est renseigné, les boutons du site deviennent
« Commander » et rédigent la demande à la place du client — formule, prix et
moyens de règlement y figurent déjà. Il n'a plus qu'à envoyer.

> **Ce sont des données personnelles.** Le dépôt est public : un numéro et une
> adresse écrits ici sont lisibles par tout le monde, et le resteront dans
> l'historique git même après suppression. C'est le prix à payer pour vendre
> sans plateforme — mais c'est une décision à prendre en connaissance de cause.
> Un numéro dédié à la vente vaut mieux qu'un numéro personnel.

## 2. Émettre une clé, une fois le règlement reçu

```sh
node tools/cle.mjs "jean@bureau-etudes.fr"
node tools/cle.mjs "commande-2026-014" --formule credits --dossiers 5
node tools/cle.mjs "atelier-sfax" --formule subscription
```

L'outil affiche la clé **et** le message à renvoyer au client, activation
comprise. La clé est relue avant d'être affichée : si elle n'était pas valide,
l'outil s'arrêterait plutôt que de vous laisser livrer une clé morte.

L'identifiant client est libre, mais il détermine la clé : **le même
identifiant redonne toujours la même clé**. Un client qui perd la sienne la
retrouve en relançant la même commande — inutile de tenir un registre. Le
corollaire compte autant : deux clients doivent recevoir deux identifiants
différents, sinon ils partagent la même clé.

## 3. Faire arriver l'argent sur la carte

Trois chemins, du plus simple au plus contraignant.

| Chemin | Pour qui | Délai | Ce qu'il faut |
|---|---|---|---|
| **USDT en direct** | client déjà à l'aise avec le crypto | minutes | l'adresse de dépôt Bybit |
| **Virement ou espèces, puis P2P** | bureau d'études, installateur, client local | 1 à 2 jours | un compte bancaire ou de la main à la main |
| **Plateforme (Payoneer, Paddle…)** | vente à l'international, à terme | jours | un compte vérifié |

### USDT en direct

Dans Bybit : *Dépôt → USDT → choisir le réseau*. Copier l'adresse **et** noter
le réseau, puis les mettre dans `PAIEMENT.usdt`.

Deux points sur lesquels on ne se rattrape pas :

- **Le réseau doit correspondre.** Un USDT envoyé sur un réseau que l'adresse
  ne dessert pas est perdu, définitivement. C'est pour cela que le réseau est
  annoncé au client en même temps que l'adresse.
- **Rien ne confirme le paiement à votre place.** Vous vérifiez l'arrivée dans
  Bybit, ou sur l'explorateur de chaîne, avant d'émettre la clé.

### Virement ou espèces, puis P2P

C'est le chemin réaliste pour un client professionnel : un bureau d'études
règle par virement, pas en USDT. L'argent arrive sur votre compte ou en
espèces, puis vous achetez de l'USDT en P2P sur Bybit pour alimenter la carte.

Sur le marché P2P, ne validez la réception qu'après avoir vu les fonds
réellement crédités sur votre compte — une capture d'écran d'ordre de virement
n'est pas un virement reçu.

### Ce que la carte permet ensuite

Une carte Bybit approvisionnée en USDT paie comme une carte Mastercard
ordinaire : abonnements, hébergement, outils en ligne. C'est bien le circuit
qui referme la boucle — l'application est vendue, et le produit de la vente
paie les outils qui la font vivre.

## 4. Ce qu'il reste à savoir

- **Une vente n'est pas qu'un encaissement.** Selon votre pays, vendre un
  logiciel demande une déclaration, et parfois une facture. Cela ne bloque pas
  la première vente, mais cela ne s'ignore pas indéfiniment. Renseignez-vous
  auprès d'un comptable de votre juridiction avant que le volume ne monte.
- **La licence est une commodité, pas une protection.** `app/js/licence.js` le
  dit lui-même : l'application tourne dans le navigateur, la vérification est
  contournable. Ce qui protège réellement ce produit, c'est la mise à jour, le
  support et la connaissance du métier — pas la clé.
- **Le paiement en ligne reste le but.** Le jour où un compte marchand est
  ouvert, il suffit de coller l'adresse de paiement dans `OFFRES[…].lien` :
  le bouton passe de « Commander » à « Acheter », et l'acheteur n'attend plus
  de réponse humaine. Le reste de la chaîne ne bouge pas.
