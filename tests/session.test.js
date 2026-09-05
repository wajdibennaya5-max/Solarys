/**
 * Une simulation perdue est un prospect perdu. Sur un téléphone, l'onglet en
 * arrière-plan est tué sans avertissement : ce n'est pas un cas rare, c'est le
 * cas ordinaire.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enregistrer, relire, effacer, disponible, ageEnClair, PEREMPTION }
  from '../js/session.js';

/** Un stockage en mémoire, comme celui d'un navigateur. */
function fauxStockage({ refuseEcriture = false } = {}) {
  const donnees = new Map();
  return {
    getItem: (c) => (donnees.has(c) ? donnees.get(c) : null),
    setItem: (c, v) => { if (refuseEcriture) throw new Error('quota'); donnees.set(c, v); },
    removeItem: (c) => donnees.delete(c),
    taille: () => donnees.size,
  };
}

function avecStockage(t, action) {
  const initial = globalThis.localStorage;
  try {
    globalThis.localStorage = t;
    return action();
  } finally {
    if (initial === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = initial;
  }
}

test('une simulation enregistrée se relit à l\'identique', () => {
  const t = fauxStockage();
  avecStockage(t, () => {
    const etat = { gouvernorat: 'sfax', facture: { quantite: 590, montant: 132.82 } };
    assert.equal(enregistrer(etat), true);
    const r = relire();
    assert.deepEqual(r.etat, etat);
    assert.ok(r.age >= 0 && r.age < 1000);
  });
});

test('sans rien d\'enregistré, il n\'y a rien à reprendre', () => {
  avecStockage(fauxStockage(), () => assert.equal(relire(), null));
});

test('une simulation périmée n\'est pas reprise, et disparaît', () => {
  // Au-delà d'une semaine, les tarifs ont pu changer et le visiteur ne se
  // souvient plus de ce qu'il avait saisi : reprendre serait pire que rien.
  const t = fauxStockage();
  avecStockage(t, () => {
    t.setItem('solarys.simulation', JSON.stringify({
      a: Date.now() - PEREMPTION - 1000, etat: { gouvernorat: 'sfax' } }));
    assert.equal(relire(), null);
    assert.equal(t.taille(), 0, 'la simulation périmée doit être effacée');
  });
});

test('un stockage abîmé n\'empêche pas de recommencer', () => {
  const t = fauxStockage();
  avecStockage(t, () => {
    t.setItem('solarys.simulation', 'pas du JSON');
    assert.equal(relire(), null);
    assert.equal(t.taille(), 0);
  });
  const t2 = fauxStockage();
  avecStockage(t2, () => {
    t2.setItem('solarys.simulation', JSON.stringify({ a: Date.now() }));
    assert.equal(relire(), null, 'un état manquant ne se reprend pas');
  });
});

test('une date future est rejetée', () => {
  // Horloge déréglée : un âge négatif ferait afficher « il y a -3 heures ».
  const t = fauxStockage();
  avecStockage(t, () => {
    t.setItem('solarys.simulation', JSON.stringify({
      a: Date.now() + 60_000, etat: { gouvernorat: 'sfax' } }));
    assert.equal(relire(), null);
  });
});

test('la navigation privée ne fait jamais échouer le parcours', () => {
  // Le visiteur doit pouvoir simuler sans sauvegarde, pas voir une erreur.
  avecStockage(undefined, () => {
    assert.equal(disponible(), false);
    assert.equal(enregistrer({ x: 1 }), false);
    assert.equal(relire(), null);
    assert.doesNotThrow(() => effacer());
  });
  avecStockage(fauxStockage({ refuseEcriture: true }), () => {
    assert.equal(disponible(), false);
    assert.equal(enregistrer({ x: 1 }), false);
  });
});

test('effacer oublie tout', () => {
  const t = fauxStockage();
  avecStockage(t, () => {
    enregistrer({ gouvernorat: 'sfax' });
    effacer();
    assert.equal(relire(), null);
  });
});

test('l\'âge se dit en français, sans jamais choquer', () => {
  assert.equal(ageEnClair(30_000), 'à l’instant');
  assert.equal(ageEnClair(25 * 60_000), 'il y a 25 minutes');
  assert.equal(ageEnClair(2 * 3600_000), 'il y a 2 heures');
  assert.equal(ageEnClair(3600_000), 'il y a 1 heure');
  assert.equal(ageEnClair(3 * 24 * 3600_000), 'il y a 3 jours');
  assert.equal(ageEnClair(24 * 3600_000), 'il y a 1 jour');
});
