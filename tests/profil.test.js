import test from 'node:test';
import assert from 'node:assert/strict';
import { estimer, verifier, POSTES, BORNES, QUESTIONS } from '../js/profil.js';

const FOYER = { personnes: 4, surface: 120, climatiseurs: 1, chauffeEau: true };

test('un foyer tunisien ordinaire tombe dans un ordre de grandeur crédible', () => {
  const e = estimer(FOYER);
  assert.ok(e.consommationAnnuelle > 3000 && e.consommationAnnuelle < 9000,
    `${e.consommationAnnuelle} kWh/an pour quatre personnes`);
});

test('chaque équipement en plus consomme en plus, jamais en moins', () => {
  const base = estimer(FOYER).consommationAnnuelle;
  assert.ok(estimer({ ...FOYER, climatiseurs: 2 }).consommationAnnuelle > base);
  assert.ok(estimer({ ...FOYER, personnes: 5 }).consommationAnnuelle > base);
  assert.ok(estimer({ ...FOYER, surface: 200 }).consommationAnnuelle > base);
  assert.ok(estimer({ ...FOYER, piscine: true }).consommationAnnuelle > base);
  assert.ok(estimer({ ...FOYER, chauffeEau: false }).consommationAnnuelle < base);
});

test('le détail par poste s’additionne exactement au total', () => {
  const e = estimer({ ...FOYER, piscine: true });
  const somme = e.postes.reduce((s, [, kwh]) => s + kwh, 0);
  assert.equal(somme, e.consommationAnnuelle,
    'un détail qui ne fait pas le total ferait douter de toute l’étude');
});

test('les postes absents ne sont pas listés à zéro', () => {
  const e = estimer({ ...FOYER, climatiseurs: 0, chauffeEau: false, piscine: false });
  assert.ok(!e.postes.some(([, kwh]) => kwh === 0));
  assert.ok(!e.postes.some(([nom]) => /piscine|chauffe/i.test(nom)));
});

test('les libellés s’accordent en nombre', () => {
  assert.ok(estimer({ ...FOYER, personnes: 1 }).postes.some(([n]) => n === '1 personne'));
  assert.ok(estimer({ ...FOYER, personnes: 4 }).postes.some(([n]) => n === '4 personnes'));
  assert.ok(estimer({ ...FOYER, climatiseurs: 1 }).postes.some(([n]) => n === '1 climatiseur'));
  assert.ok(estimer({ ...FOYER, climatiseurs: 3 }).postes.some(([n]) => n === '3 climatiseurs'));
});

test('une saisie hors du plausible ne rend rien', () => {
  assert.equal(estimer({ ...FOYER, personnes: 0 }), null);
  assert.equal(estimer({ ...FOYER, personnes: 99 }), null);
  assert.equal(estimer({ ...FOYER, surface: 5 }), null);
  assert.equal(estimer({ ...FOYER, surface: 5000 }), null);
  assert.equal(estimer({ ...FOYER, climatiseurs: 40 }), null);
  assert.equal(estimer(), null);
});

test('et elle est refusée avec une phrase qui dit quoi corriger', () => {
  assert.match(verifier({ ...FOYER, personnes: 0 }), /personnes/);
  assert.match(verifier({ ...FOYER, surface: 5 }), /surface/i);
  assert.match(verifier({ ...FOYER, climatiseurs: 99 }), /climatiseurs/);
  assert.equal(verifier(FOYER), null);
});

test('chaque question porte sur un poste réellement calculé', () => {
  for (const q of QUESTIONS) {
    assert.ok(q.cle in POSTES || q.cle in BORNES || q.cle === 'personnes'
      || q.cle === 'surface' || q.cle === 'climatiseurs',
      `la question « ${q.libelle} » ne mène à aucun calcul`);
    assert.ok(q.libelle && q.type);
  }
});
