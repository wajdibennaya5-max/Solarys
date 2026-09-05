/**
 * La commande est le dernier maillon : ce que le vendeur lit sur son
 * téléphone. Elle doit se suffire à elle-même — un renseignement manquant,
 * c'est un aller-retour, et un aller-retour c'est une commande qui se perd.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redigerCommande, lienCommande, champsManquants, boutiqueOuverte, VENDEUR }
  from '../js/commande.js';
import { FRANCO } from '../js/livraison.js';

const ARTICLES = [
  { produit: { nom: 'Article un' }, qte: 2, variante: null, total: 99800 },
  { produit: { nom: 'Article deux' }, qte: 1, variante: 'Taille M', total: 129000 },
];
const CLIENT = {
  nom: 'Amine Ben Salah', telephone: '20123456',
  adresse: '12 rue de Carthage', gouvernorat: 'sfax',
};

const commande = (o = {}) => redigerCommande({
  articles: ARTICLES, sousTotal: 228800, client: CLIENT, ...o });

test('la commande nomme chaque article, sa quantité et son prix', () => {
  const t = commande();
  assert.match(t, /Article un/);
  assert.match(t, /× 2/);
  assert.match(t, /Article deux \(Taille M\)/, 'la variante doit figurer');
});

test('la commande porte tout ce qu\'il faut pour livrer', () => {
  const t = commande();
  for (const attendu of ['Amine Ben Salah', '20123456', '12 rue de Carthage', 'Sfax']) {
    assert.ok(t.includes(attendu), `manquant dans la commande : ${attendu}`);
  }
});

test('sous le franco, le port s\'ajoute au sous-total', () => {
  // 99,800 DT reste en dessous des 200 DT qui offrent la livraison.
  const t = commande({ articles: [ARTICLES[0]], sousTotal: 99800 });
  assert.match(t, /Sous-total : 99,800/);
  assert.match(t, /Livraison Sfax : 8,000/);
  assert.match(t, /TOTAL : 107,800/);
});

test('au-dessus du franco, le total n\'ajoute rien au sous-total', () => {
  const t = commande(); // 228,800 DT, au-delà des 200 DT
  assert.match(t, /Sous-total : 228,800/);
  assert.match(t, /Livraison Sfax : offerte/);
  assert.match(t, /TOTAL : 228,800/);
});

test('au-delà du franco, la livraison est annoncée offerte', () => {
  const t = commande({ sousTotal: FRANCO * 1000 + 5000 });
  assert.match(t, /Livraison Sfax : offerte/);
});

test('un gouvernorat inconnu n\'invente pas de frais', () => {
  const t = commande({ client: { ...CLIENT, gouvernorat: 'atlantide' } });
  assert.match(t, /Livraison : à confirmer/);
  assert.doesNotMatch(t, /TOTAL : 236/);
});

test('le moyen de règlement figure dans la commande', () => {
  assert.match(commande(), /Règlement : Paiement à la livraison/);
  assert.match(commande({ reglement: 'd17' }), /Règlement : D17/);
});

test('les renseignements manquants sont nommés, un par un', () => {
  // Un formulaire qui dit « erreur » sans dire quoi fait abandonner.
  assert.deepEqual(champsManquants({}), 
    ['votre nom', 'votre téléphone', 'votre adresse', 'votre gouvernorat']);
  assert.deepEqual(champsManquants(CLIENT), []);
  assert.deepEqual(champsManquants({ ...CLIENT, telephone: '   ' }), ['votre téléphone']);
});

test('la commande part sur WhatsApp quand un numéro est renseigné', () => {
  const initial = { ...VENDEUR };
  try {
    VENDEUR.whatsapp = '+216 20 123 456';
    const lien = lienCommande('Bonjour');
    assert.match(lien, /^https:\/\/wa\.me\/21620123456\?text=/);
    assert.equal(decodeURIComponent(new URL(lien).searchParams.get('text')), 'Bonjour');
    assert.equal(boutiqueOuverte(), true);
  } finally { Object.assign(VENDEUR, initial); }
});

test('à défaut de WhatsApp, le courriel prend le relais', () => {
  const initial = { ...VENDEUR };
  try {
    VENDEUR.whatsapp = '';
    VENDEUR.courriel = 'ventes@exemple.test';
    assert.match(lienCommande('Bonjour'), /^mailto:ventes@exemple\.test\?/);
  } finally { Object.assign(VENDEUR, initial); }
});

test('sans coordonnées, la boutique ne prétend pas prendre de commande', () => {
  const initial = { ...VENDEUR };
  try {
    VENDEUR.whatsapp = ''; VENDEUR.courriel = '';
    assert.equal(lienCommande('Bonjour'), null);
    assert.equal(boutiqueOuverte(), false);
  } finally { Object.assign(VENDEUR, initial); }
});

test('la commande survit aux caractères à échapper', () => {
  const initial = { ...VENDEUR };
  try {
    VENDEUR.whatsapp = '21620123456';
    const t = commande({ client: { ...CLIENT, adresse: 'Rue « des » Fleurs & Cie #3' } });
    const lien = lienCommande(t);
    assert.doesNotThrow(() => new URL(lien));
    assert.match(decodeURIComponent(new URL(lien).searchParams.get('text')),
      /Rue « des » Fleurs & Cie #3/);
  } finally { Object.assign(VENDEUR, initial); }
});
