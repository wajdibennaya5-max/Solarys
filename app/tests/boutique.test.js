/**
 * La boutique et la licence doivent parler de la même chose.
 *
 * Une offre vendue pour une formule que `licence.js` ne sait pas émettre,
 * c'est un client qui paie et qu'on ne peut pas servir. Ce fichier verrouille
 * cette correspondance.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OFFRES, ORDRE, CONTACT, estOuverte, boutiqueOuverte } from '../js/boutique.js';
import { PLANS, makeKey, readKey } from '../js/licence.js';

const formulesConnues = Object.values(PLANS).map((p) => p.id);

test('toute offre correspond à une formule que la licence sait émettre', () => {
  for (const plan of Object.keys(OFFRES)) {
    assert.ok(formulesConnues.includes(plan),
      `l'offre « ${plan} » n'existe pas dans licence.js`);
  }
});

test('une clé émise pour chaque offre est relue avec la bonne formule', () => {
  for (const plan of Object.keys(OFFRES)) {
    const cle = makeKey(`commande-test-${plan}`, { plan, credits: 3 });
    const lue = readKey(cle);
    assert.equal(lue.valid, true, `clé invalide pour ${plan}`);
    assert.equal(lue.plan, plan);
  }
});

test("l'ordre d'affichage couvre exactement les offres", () => {
  assert.deepEqual([...ORDRE].sort(), Object.keys(OFFRES).sort());
});

test('chaque offre porte un prix et une unité affichables', () => {
  for (const [plan, o] of Object.entries(OFFRES)) {
    assert.match(o.prix, /\d/, `prix illisible pour ${plan}`);
    assert.ok(typeof o.unite === 'string' && o.unite.length > 0,
      `unité manquante pour ${plan}`);
    assert.equal(typeof o.lien, 'string', `lien absent pour ${plan}`);
  }
});

test('un lien vide ferme la vente, un lien renseigné l\'ouvre', () => {
  const vide = { ...OFFRES.perpetual, lien: '' };
  assert.equal(Boolean(vide.lien), false);
  // `estOuverte` lit la configuration réelle : elle doit rester cohérente
  // avec elle, quel que soit son état au moment du test.
  for (const plan of ORDRE) {
    assert.equal(estOuverte(plan), Boolean(OFFRES[plan].lien));
  }
  assert.equal(boutiqueOuverte(), ORDRE.some((p) => Boolean(OFFRES[p].lien)));
});

test('une formule inconnue n\'est jamais achetable', () => {
  assert.equal(estOuverte('formule-qui-nexiste-pas'), false);
  assert.equal(estOuverte(undefined), false);
});

test('le contact reste une décision explicite du propriétaire', () => {
  // Vide par défaut : une adresse personnelle ne se publie pas par accident.
  assert.equal(typeof CONTACT, 'string');
});

test('tout lien renseigné est une adresse https', () => {
  for (const [plan, o] of Object.entries(OFFRES)) {
    if (!o.lien) continue;
    assert.match(o.lien, /^https:\/\//,
      `le lien de « ${plan} » doit être en https, sinon le navigateur bloquera le paiement`);
  }
});

/* ------------------------------------------------------------------ */
/* Commande directe — vendre sans plateforme de paiement               */
/* ------------------------------------------------------------------ */

// `lienAchat` lit la configuration du module. Pour éprouver ses trois états
// sans toucher au fichier livré, on recharge le module avec une configuration
// modifiée en mémoire.
async function avecConfig({ lien = '', whatsapp = '', courriel = '' }) {
  const m = await import(`../js/boutique.js?essai=${Math.random()}`);
  m.OFFRES.perpetual.lien = lien;
  m.COMMANDE.whatsapp = whatsapp;
  m.COMMANDE.courriel = courriel;
  return m;
}

test('sans rien de branché, aucune formule ne mène nulle part', async () => {
  const m = await avecConfig({});
  assert.equal(m.lienAchat('perpetual'), null);
  assert.equal(m.estVendable('perpetual'), false);
  assert.equal(m.boutiqueOuverte(), false);
});

test('un numéro WhatsApp suffit à ouvrir la vente', async () => {
  const m = await avecConfig({ whatsapp: '+216 12 345 678' });
  const lien = m.lienAchat('perpetual', 'Licence perpétuelle');
  assert.match(lien, /^https:\/\/wa\.me\/21612345678\?text=/);
  // Le message doit nommer la formule et son prix : l'acheteur n'a rien à écrire.
  const texte = decodeURIComponent(new URL(lien).searchParams.get('text'));
  assert.match(texte, /Licence perpétuelle/);
  assert.match(texte, /20 €/);
  assert.equal(m.estVendable('perpetual'), true);
  // Une commande directe n'est pas un paiement en ligne : le libellé diffère.
  assert.equal(m.estOuverte('perpetual'), false);
});

test('le numéro est nettoyé de tout ce qui n\'est pas un chiffre', async () => {
  const m = await avecConfig({ whatsapp: '+216-12.345 678' });
  assert.match(m.lienAchat('perpetual'), /wa\.me\/21612345678\?/);
});

test('à défaut de WhatsApp, le courriel prend le relais', async () => {
  const m = await avecConfig({ courriel: 'ventes@exemple.test' });
  const lien = m.lienAchat('perpetual', 'Licence perpétuelle');
  assert.match(lien, /^mailto:ventes@exemple\.test\?/);
  assert.match(lien, /subject=/);
  assert.match(decodeURIComponent(lien), /Licence perpétuelle/);
});

test('le paiement en ligne prime sur la commande directe', async () => {
  // Sinon un acheteur prêt à payer serait renvoyé vers une attente humaine.
  const m = await avecConfig({
    lien: 'https://paiement.test/x', whatsapp: '21612345678',
  });
  assert.equal(m.lienAchat('perpetual'), 'https://paiement.test/x');
  assert.equal(m.estOuverte('perpetual'), true);
});

test('une formule inconnue ne produit jamais de lien', async () => {
  const m = await avecConfig({ whatsapp: '21612345678' });
  assert.equal(m.lienAchat('formule-inexistante'), null);
  assert.equal(m.estVendable('formule-inexistante'), false);
});

test('le message de commande survit aux caractères à échapper', async () => {
  const m = await avecConfig({ whatsapp: '21612345678' });
  const lien = m.lienAchat('perpetual', 'Licence « perpétuelle » & co');
  assert.doesNotThrow(() => new URL(lien));
  assert.match(decodeURIComponent(new URL(lien).searchParams.get('text')),
    /Licence « perpétuelle » & co/);
});
