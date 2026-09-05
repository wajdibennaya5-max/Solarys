/**
 * Le frais de port est la dernière chose lue avant de renoncer. Il doit être
 * juste, et annoncé avant la commande.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GOUVERNORATS, ZONES, FRANCO, gouvernorat, fraisDePort, resteAvantFranco }
  from '../js/livraison.js';

test('les vingt-quatre gouvernorats sont couverts', () => {
  assert.equal(GOUVERNORATS.length, 24);
});

test('chaque gouvernorat porte un identifiant unique et une zone connue', () => {
  const vus = new Set();
  for (const g of GOUVERNORATS) {
    assert.ok(g.id && !vus.has(g.id), `identifiant absent ou en double : ${g.id}`);
    vus.add(g.id);
    assert.ok(ZONES[g.zone], `zone inconnue pour ${g.nom} : ${g.zone}`);
    assert.ok(g.nom && g.nomAr, `libellé manquant pour ${g.id}`);
  }
});

test('le Grand Tunis coûte moins cher et arrive plus vite', () => {
  const t = fraisDePort('tunis', 50);
  const s = fraisDePort('tataouine', 50);
  assert.ok(t.frais <= s.frais, 'le Grand Tunis ne peut pas coûter davantage');
  assert.equal(t.delai, '24 h');
});

test('un gouvernorat inconnu n\'annonce aucun prix', () => {
  // Mieux vaut « à confirmer » qu'un montant que le livreur démentira.
  assert.equal(fraisDePort('atlantide', 50), null);
  assert.equal(fraisDePort('', 50), null);
  assert.equal(gouvernorat('atlantide'), null);
});

test('au-delà du franco, la livraison est offerte', () => {
  const p = fraisDePort('tataouine', FRANCO);
  assert.equal(p.frais, 0);
  assert.equal(p.offerte, true);
});

test('juste en dessous du franco, elle ne l\'est pas', () => {
  const p = fraisDePort('tataouine', FRANCO - 0.001);
  assert.ok(p.frais > 0);
  assert.equal(p.offerte, false);
});

test('le reste à ajouter pour la livraison offerte se calcule juste', () => {
  assert.equal(resteAvantFranco(FRANCO - 50), 50);
  assert.equal(resteAvantFranco(FRANCO), 0);
  assert.equal(resteAvantFranco(FRANCO + 10), 0);
  assert.equal(resteAvantFranco(0), FRANCO);
});

test('le reste à ajouter ne traîne pas de décimales parasites', () => {
  // 200 - 49,9 en flottants donne 150,10000000000002.
  assert.equal(resteAvantFranco(49.9), 150.1);
});
