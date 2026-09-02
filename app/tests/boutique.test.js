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
