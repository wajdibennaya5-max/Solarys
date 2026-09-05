# Vendre Solarys, et être payé

Ce document décrit la chaîne complète, de la commande d'un client jusqu'à
l'argent disponible sur une carte. Il n'y a rien à développer pour la mettre
en route : tout ce qu'elle utilise existe déjà dans le dépôt.

## La chaîne, en entier

Depuis le règlement automatique, il y a deux chemins. Le premier ne vous
demande **rien du tout**.

### Chemin automatique — USDT, sans vous

```
   client sur le site
        │  clique « Acheter »
        ▼
   paiement.html ──────► montant en USDT, adresse, réseau
        │  il envoie depuis son portefeuille
        │  il colle l'empreinte de sa transaction
        ▼
   vérification sur la chaîne TRON, dans son navigateur
        │  transfert USDT · vers notre adresse · montant suffisant
        ▼
   clé émise, licence déposée, application ouverte sans filigrane
```

Vous n'intervenez pas. Vous constatez l'USDT arrivé sur Bybit, c'est tout.

La clé est dérivée de l'empreinte de la transaction : **rejouer la même
transaction redonne toujours la même clé**, jamais une nouvelle. Personne ne
peut donc en fabriquer à la chaîne avec un paiement unique.

### Chemin manuel — virement, espèces, tout le reste

```
   client ──► WhatsApp / courriel ──► vous constatez le règlement
                                            │
                                            ▼
                            node tools/cle.mjs "<client>"
                                            │
                                            ▼
                            vous envoyez la clé
```

C'est le chemin des clients professionnels, qui règlent par virement et non
en USDT. Il reste indispensable : un bureau d'études européen ne paiera pas
en crypto.

### Ce que la vérification automatique ne fait pas

Elle tourne dans le navigateur de l'acheteur, donc elle est contournable, et
l'empreinte d'une transaction est publique — un tiers pourrait reprendre
celle d'un vrai client. Le pire cas reste une clé partagée, exactement ce que
`app/js/licence.js` assume déjà : la licence est une commodité, pas une
protection. Ce qui protège ce produit, c'est la mise à jour et le support.

Elle n'attend pas non plus les 20 confirmations que Bybit exige pour créditer
votre solde : la clé part dès que la transaction est indexée sur la chaîne.
Sur TRON l'écart se compte en secondes, et pour 22 USDT le risque est
négligeable — mais il est réel, et il vaut mieux le savoir.

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

### USDT en direct — automatique

**Déjà en place.** L'adresse, le réseau et les prix en USDT sont dans
`app/js/boutique.js`, et `paiement.html` fait le reste. Un test valide la
somme de contrôle de l'adresse à chaque exécution de la suite : si un
caractère venait à changer, les tests échoueraient avant qu'un client n'envoie
quoi que ce soit dans le vide.

Les prix en USDT se relisent dans `OFFRES` :

```js
credits:      { prix: '9 €',   usdt: 10  },
perpetual:    { prix: '20 €',  usdt: 22  },
subscription: { prix: '149 €', usdt: 160 },
```

Ce ne sont pas des conversions du jour, mais des prix arrondis avec la marge
qui absorbe le change et les frais de réseau. Corrigez-les si l'euro décroche.
Retirer la valeur `usdt` d'une formule ferme son règlement automatique sans
rien casser ailleurs.

Pour changer l'adresse un jour : dans Bybit, *Dépôt → USDT → choisir le
réseau*, copier l'adresse **et** noter le réseau. Ne la recopiez jamais à
l'œil depuis une capture d'écran — lancez `npm test` après.

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
