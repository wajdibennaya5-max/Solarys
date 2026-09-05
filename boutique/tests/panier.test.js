/**
 * Le panier est ce que l'acheteur a décidé d'acheter. Une ligne perdue, une
 * quantité fausse, un total qui ne correspond pas à ce qu'il a vu : chacun
 * de ces défauts annule la vente au dernier moment.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ajouter, fixerQuantite, retirer, nombreArticles, detailler, lire }
  from '../js/panier.js';

const CATALOGUE = {
  'A-1': { ref: 'A-1', nom: 'Article un', prix: 49.9 },
  'A-2': { ref: 'A-2', nom: 'Article deux', prix: 129 },
};
const trouver = (ref) => CATALOGUE[ref] ?? null;

test('ajouter un article crée sa ligne', () => {
  const p = ajouter([], { ref: 'A-1' });
  assert.deepEqual(p, [{ ref: 'A-1', qte: 1, variante: null }]);
});

test('ajouter deux fois le même article cumule les quantités', () => {
  let p = ajouter([], { ref: 'A-1', qte: 2 });
  p = ajouter(p, { ref: 'A-1', qte: 3 });
  assert.equal(p.length, 1);
  assert.equal(p[0].qte, 5);
});

test('deux variantes du même article sont deux lignes distinctes', () => {
  // Une taille S et une taille M ne se cumulent pas : ce sont deux articles
  // différents à préparer et à livrer.
  let p = ajouter([], { ref: 'A-2', variante: 'Taille S' });
  p = ajouter(p, { ref: 'A-2', variante: 'Taille M' });
  assert.equal(p.length, 2);
  assert.equal(nombreArticles(p), 2);
});

test('une quantité nulle ou négative n\'ajoute rien', () => {
  assert.deepEqual(ajouter([], { ref: 'A-1', qte: 0 }), []);
  assert.deepEqual(ajouter([], { ref: 'A-1', qte: -3 }), []);
  assert.deepEqual(ajouter([], { ref: '', qte: 1 }), []);
});

test('fixer la quantité à zéro retire la ligne', () => {
  const p = ajouter([], { ref: 'A-1', qte: 4 });
  assert.deepEqual(fixerQuantite(p, { ref: 'A-1' }, 0), []);
  assert.deepEqual(retirer(p, { ref: 'A-1' }), []);
});

test('fixer une quantité ne touche pas aux autres lignes', () => {
  let p = ajouter(ajouter([], { ref: 'A-1' }), { ref: 'A-2', qte: 2 });
  p = fixerQuantite(p, { ref: 'A-1' }, 7);
  assert.equal(p.find((l) => l.ref === 'A-1').qte, 7);
  assert.equal(p.find((l) => l.ref === 'A-2').qte, 2);
});

test('le sous-total se calcule en millimes, sans dérive', () => {
  // 49,900 × 3 = 149,700 — en flottants, 149,70000000000002.
  const p = ajouter([], { ref: 'A-1', qte: 3 });
  const d = detailler(p, trouver);
  assert.equal(d.sousTotal, 149700);
  assert.equal(d.articles[0].total, 149700);
});

test('un article retiré de la vente est signalé, non escamoté', () => {
  // Le panier a pu dormir plusieurs jours. Faire disparaître une ligne en
  // silence, c'est livrer autre chose que ce que le client croyait acheter.
  const p = ajouter(ajouter([], { ref: 'A-1' }), { ref: 'DISPARU', qte: 2 });
  const d = detailler(p, trouver);
  assert.equal(d.articles.length, 1);
  assert.equal(d.introuvables.length, 1);
  assert.equal(d.introuvables[0].ref, 'DISPARU');
  assert.equal(d.sousTotal, 49900, 'un article introuvable ne compte pas dans le total');
});

test('un panier vide se détaille sans planter', () => {
  assert.deepEqual(detailler([], trouver), { articles: [], introuvables: [], sousTotal: 0 });
});

test('un stockage absent ou abîmé donne un panier vide, jamais une erreur', () => {
  // Navigation privée, stockage refusé, JSON corrompu : l'acheteur doit
  // pouvoir continuer, pas voir une page blanche.
  const initial = globalThis.localStorage;
  try {
    globalThis.localStorage = undefined;
    assert.deepEqual(lire(), []);
    globalThis.localStorage = { getItem: () => 'pas du JSON' };
    assert.deepEqual(lire(), []);
    globalThis.localStorage = { getItem: () => '{"pas":"un tableau"}' };
    assert.deepEqual(lire(), []);
    globalThis.localStorage = { getItem: () => { throw new Error('refusé'); } };
    assert.deepEqual(lire(), []);
  } finally {
    if (initial === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = initial;
  }
});

test('un panier relu est nettoyé de ce qui n\'a pas de sens', () => {
  const initial = globalThis.localStorage;
  try {
    globalThis.localStorage = { getItem: () => JSON.stringify([
      { ref: 'A-1', qte: 2 },
      { ref: 'A-2', qte: -5 },      // quantité absurde
      { ref: '', qte: 3 },           // sans référence
      { ref: 'A-2', qte: 'beaucoup' }, // quantité illisible
    ]) };
    assert.deepEqual(lire(), [{ ref: 'A-1', qte: 2, variante: null }]);
  } finally {
    if (initial === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = initial;
  }
});
