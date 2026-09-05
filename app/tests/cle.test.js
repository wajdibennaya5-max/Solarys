/**
 * L'outil d'émission des clés — le maillon entre le règlement et la livraison.
 *
 * Une clé mal formée, c'est un client qui a payé et que rien n'ouvre. Ce
 * fichier vérifie que ce qui sort de `tools/cle.mjs` se relit bien, porte la
 * formule payée, et que la ligne de commande refuse ce qu'elle ne sait pas
 * honorer plutôt que de livrer approximativement.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lireArguments, emettre } from '../../tools/cle.mjs';
import { readKey } from '../js/licence.js';
import { OFFRES } from '../js/boutique.js';

/* ------------------------------------------------------------------ */
/* Lecture de la ligne de commande                                     */
/* ------------------------------------------------------------------ */

test('un identifiant seul suffit, et vaut licence perpétuelle', () => {
  assert.deepEqual(lireArguments(['jean@exemple.test']),
    { client: 'jean@exemple.test', plan: 'perpetual', credits: 1, aide: false });
});

test('la formule et le nombre de dossiers se lisent, longs ou courts', () => {
  const long = lireArguments(['cmd-14', '--formule', 'credits', '--dossiers', '5']);
  const court = lireArguments(['cmd-14', '-f', 'credits', '-d', '5']);
  assert.deepEqual(long, court);
  assert.equal(long.plan, 'credits');
  assert.equal(long.credits, 5);
});

test('une formule inconnue arrête tout', () => {
  // Mieux vaut ne rien livrer qu'une clé qui n'ouvre pas ce qui a été payé.
  assert.throws(() => lireArguments(['x', '-f', 'premium']), /formule inconnue/);
});

test('un nombre de dossiers hors bornes arrête tout', () => {
  for (const n of ['0', '100', '2.5', 'beaucoup']) {
    assert.throws(() => lireArguments(['x', '-d', n]), /entier de 1 à 99/, `accepté : ${n}`);
  }
});

test('une option inconnue ou un argument en trop arrête tout', () => {
  assert.throws(() => lireArguments(['x', '--gratuit']), /option inconnue/);
  assert.throws(() => lireArguments(['x', 'y']), /argument en trop/);
});

test('sans identifiant client, rien n\'est émis', () => {
  assert.throws(() => lireArguments([]), /identifiant client manquant/);
});

test('l\'aide se demande sans identifiant', () => {
  assert.equal(lireArguments(['--aide']).aide, true);
  assert.equal(lireArguments(['-h']).aide, true);
});

/* ------------------------------------------------------------------ */
/* Émission                                                            */
/* ------------------------------------------------------------------ */

test('chaque offre du catalogue produit une clé que l\'application relit', () => {
  for (const plan of Object.keys(OFFRES)) {
    const { cle } = emettre({ client: `client-${plan}`, plan, credits: 3 });
    const lue = readKey(cle);
    assert.equal(lue.valid, true, `clé invalide pour ${plan}`);
    assert.equal(lue.plan, plan);
  }
});

test('la formule à l\'unité porte exactement les dossiers payés', () => {
  const { cle } = emettre({ client: 'cmd-88', plan: 'credits', credits: 7 });
  assert.equal(readKey(cle).credits, 7);
});

test('les formules illimitées n\'ont pas de compteur', () => {
  for (const plan of ['perpetual', 'subscription']) {
    const { cle } = emettre({ client: 'cmd-90', plan, credits: 3 });
    assert.equal(readKey(cle).credits, Infinity, `${plan} devrait être illimitée`);
  }
});

test('le même identifiant redonne toujours la même clé', () => {
  // C'est ce qui permet de rendre sa clé à un client qui l'a perdue, sans
  // tenir de registre.
  const a = emettre({ client: 'jean@exemple.test', plan: 'perpetual', credits: 1 });
  const b = emettre({ client: 'jean@exemple.test', plan: 'perpetual', credits: 1 });
  assert.equal(a.cle, b.cle);
});

test('deux clients distincts reçoivent deux clés distinctes', () => {
  const a = emettre({ client: 'jean@exemple.test', plan: 'perpetual', credits: 1 });
  const b = emettre({ client: 'jeanne@exemple.test', plan: 'perpetual', credits: 1 });
  assert.notEqual(a.cle, b.cle);
});

test('le message de livraison porte la clé, le prix et le mode d\'activation', () => {
  const { cle, message } = emettre({ client: 'cmd-1', plan: 'perpetual', credits: 1 });
  assert.ok(message.includes(cle), 'la clé doit figurer dans le message');
  assert.match(message, new RegExp(OFFRES.perpetual.prix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(message, /Réglages/);
  assert.match(message, /Clé de licence/);
});

test('le message dit le nombre de dossiers pour la formule à l\'unité', () => {
  const { message } = emettre({ client: 'cmd-2', plan: 'credits', credits: 5 });
  assert.match(message, /5 dossiers/);
  const un = emettre({ client: 'cmd-3', plan: 'credits', credits: 1 });
  assert.match(un.message, /1 dossier sans/); // singulier, pas « 1 dossiers »
});

test('une formule que la licence ignore ne produit jamais de clé', () => {
  assert.throws(() => emettre({ client: 'x', plan: 'premium', credits: 1 }), /formule inconnue/);
});
