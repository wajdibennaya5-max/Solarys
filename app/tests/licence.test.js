import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as lic from '../js/licence.js';

test('chaque formule se relit telle qu\'elle a été fabriquée', () => {
  const perp = lic.readKey(lic.makeKey('c1', { plan: 'perpetual' }));
  assert.equal(perp.plan, 'perpetual');
  assert.equal(perp.credits, Infinity);

  const abo = lic.readKey(lic.makeKey('c2', { plan: 'subscription' }));
  assert.equal(abo.plan, 'subscription');
  assert.equal(abo.credits, Infinity);

  const cred = lic.readKey(lic.makeKey('c3', { plan: 'credits', credits: 7 }));
  assert.equal(cred.plan, 'credits');
  assert.equal(cred.credits, 7);
});

test('une clé se lit avec ou sans tirets, en minuscules', () => {
  const key = lic.makeKey('commande-1042');
  assert.ok(lic.isValidKey(key));
  assert.ok(lic.isValidKey(key.replace(/-/g, '')));
  assert.ok(lic.isValidKey(key.toLowerCase()));
  assert.ok(lic.isValidKey(` ${key} `));
});

test('une clé altérée est rejetée', () => {
  const parts = lic.makeKey('commande-1042').split('-');
  parts[1] = parts[1] === 'AAAA' ? 'BBBB' : 'AAAA';
  assert.equal(lic.isValidKey(parts.join('-')), false);
});

test('les entrées vides ou mal formées sont rejetées', () => {
  for (const bad of ['', null, undefined, 'SLRS', 'SLRS-1234',
    'XXXX-1234-5678-9012', 'a'.repeat(16)]) {
    assert.equal(lic.isValidKey(bad), false, `acceptée à tort : ${bad}`);
  }
});

test('une lettre de formule inconnue est rejetée', () => {
  // On reconstruit une clé valide, puis on remplace la lettre de formule.
  const key = lic.normalise(lic.makeKey('c1'));
  const falsifiee = `${key.slice(0, 4)}Z${key.slice(5)}`;
  assert.equal(lic.isValidKey(falsifiee), false);
});

test('deux identifiants proches donnent deux clés différentes', () => {
  // Le piège d'une simple troncature : ces deux-là partagent leur début.
  assert.notEqual(lic.makeKey('commande-1042'), lic.makeKey('commande-1043'));
  assert.notEqual(lic.makeKey('client-a'), lic.makeKey('client-b'));
});

test('mille identifiants donnent mille clés distinctes et valides', () => {
  const vues = new Set();
  for (let i = 0; i < 1000; i++) {
    const k = lic.makeKey(`commande-${i}`);
    assert.ok(lic.isValidKey(k));
    vues.add(k);
  }
  assert.equal(vues.size, 1000);
});

test('une licence illimitée ouvre tous les projets', () => {
  const prefs = { licence: lic.makeKey('c1', { plan: 'perpetual' }) };
  assert.ok(lic.isUnlimited(prefs));
  assert.ok(lic.isProjectUnlocked(prefs, 'nimporte-quel-projet'));
  assert.equal(lic.remainingCredits(prefs), Infinity);
});

test('sans licence, aucun projet n\'est ouvert', () => {
  for (const prefs of [{ licence: null }, {}, undefined]) {
    assert.equal(lic.isUnlimited(prefs), false);
    assert.equal(lic.isProjectUnlocked(prefs, 'p1'), false);
    assert.equal(lic.remainingCredits(prefs), 0);
  }
});

test('un crédit se dépense une fois par projet', () => {
  let prefs = { licence: lic.makeKey('c1', { plan: 'credits', credits: 2 }), unlockedProjects: [] };
  assert.equal(lic.remainingCredits(prefs), 2);

  prefs = lic.unlockProject(prefs, 'p1');
  assert.equal(lic.remainingCredits(prefs), 1);
  assert.ok(lic.isProjectUnlocked(prefs, 'p1'));

  // Redemander le même projet ne consomme rien de plus.
  assert.equal(lic.canUnlock(prefs, 'p1'), false);
  assert.equal(lic.unlockProject(prefs, 'p1'), null);
  assert.equal(lic.remainingCredits(prefs), 1);
});

test('les crédits épuisés bloquent les projets suivants', () => {
  let prefs = { licence: lic.makeKey('c1', { plan: 'credits', credits: 1 }), unlockedProjects: [] };
  prefs = lic.unlockProject(prefs, 'p1');
  assert.equal(lic.remainingCredits(prefs), 0);
  assert.equal(lic.canUnlock(prefs, 'p2'), false);
  assert.equal(lic.unlockProject(prefs, 'p2'), null);
  assert.equal(lic.isProjectUnlocked(prefs, 'p2'), false);
  // Le projet déjà payé reste ouvert.
  assert.ok(lic.isProjectUnlocked(prefs, 'p1'));
});

test('unlockProject ne modifie pas les préférences reçues', () => {
  const prefs = { licence: lic.makeKey('c1', { plan: 'credits', credits: 3 }), unlockedProjects: [] };
  const suivant = lic.unlockProject(prefs, 'p1');
  assert.deepEqual(prefs.unlockedProjects, [], 'les préférences d\'origine ont été modifiées');
  assert.deepEqual(suivant.unlockedProjects, ['p1']);
});

test('une formule à crédits sans dossier est refusée', () => {
  // On fabrique à la main une clé « C00 », que makeKey ne produit jamais.
  const raw = 'SLRS' + 'C00' + 'ABCDE';
  const groups = raw.match(/.{4}/g);
  const key = groups.join('') + lic.normalise(lic.makeKey('x')).slice(12);
  assert.equal(lic.isValidKey(key), false);
});
