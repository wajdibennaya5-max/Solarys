import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluer, palier, pourAffermir, FACTEURS, PALIERS, CONFIANCE_SUFFISANTE }
  from '../js/score.js';

const COMPLET = {
  gouvernorat: 'sfax', orientation: 'sud', pente: 'moyenne',
  surfaceDisponible: 45, puissanceVisee: 4,
  tauxAutoconsommation: 0.67, retour: 6.6,
};

test('un bon projet tunisien obtient une bonne note, en pleine confiance', () => {
  const s = evaluer(COMPLET);
  assert.ok(s.note >= 70 && s.note <= 100, `note ${s.note}`);
  assert.equal(s.confiance, 1);
  assert.equal(s.preliminaire, false);
  assert.equal(s.manquants.length, 0);
});

test('un toit au nord note nettement moins qu’un toit au sud', () => {
  const nord = evaluer({ ...COMPLET, orientation: 'nord' });
  assert.ok(nord.note < evaluer(COMPLET).note - 10, `${nord.note} contre ${evaluer(COMPLET).note}`);
});

test('une donnée absente n’est jamais devinée : elle sort du calcul', () => {
  const sansToit = evaluer({ ...COMPLET, orientation: null, pente: null });
  assert.ok(sansToit.manquants.some((m) => m.cle === 'orientation'));
  assert.ok(sansToit.confiance < 1);
  // Ni bonus ni malus : la note ne doit pas bouger dans un sens choisi.
  const facteursRestants = sansToit.facteurs.map((f) => f.cle);
  assert.ok(!facteursRestants.includes('orientation'));
});

test('la confiance dit exactement quelle part du barème est connue', () => {
  const total = FACTEURS.reduce((s, f) => s + f.poids, 0);
  const s = evaluer({ gouvernorat: 'sfax' });
  const attendu = FACTEURS.find((f) => f.cle === 'gisement').poids / total;
  assert.ok(Math.abs(s.confiance - attendu) < 1e-9, `confiance ${s.confiance}`);
});

test('en dessous du seuil, le score s’annonce préliminaire', () => {
  const maigre = evaluer({ gouvernorat: 'sfax' });
  assert.equal(maigre.preliminaire, true);
  assert.ok(maigre.confiance < CONFIANCE_SUFFISANTE);
  assert.equal(evaluer(COMPLET).preliminaire, false);
});

test('sans aucune donnée exploitable, aucun score n’est affiché', () => {
  assert.equal(evaluer({}), null);
  assert.equal(evaluer(), null);
  assert.equal(evaluer({ gouvernorat: 'nulle-part' }), null);
});

test('la note reste toujours entre 0 et 100', () => {
  const cas = [
    COMPLET,
    { ...COMPLET, orientation: 'nord', pente: 'forte', retour: 40, tauxAutoconsommation: 0.2,
      surfaceDisponible: 5 },
    { ...COMPLET, gouvernorat: 'tozeur', retour: 2, tauxAutoconsommation: 0.99,
      surfaceDisponible: 900 },
  ];
  for (const c of cas) {
    const s = evaluer(c);
    assert.ok(s.note >= 0 && s.note <= 100, `note hors bornes : ${s.note}`);
    for (const f of s.facteurs) assert.ok(f.note >= 0 && f.note <= 100, f.cle);
  }
});

test('chaque facteur retenu explique sa note', () => {
  for (const f of evaluer(COMPLET).facteurs) {
    assert.ok(f.detail && f.detail.length > 3, `${f.cle} ne dit pas d’où vient sa note`);
    assert.ok(f.nom && f.poids > 0);
  }
});

test('le total du barème fait bien cent', () => {
  assert.equal(FACTEURS.reduce((s, f) => s + f.poids, 0), 100);
});

test('les paliers couvrent toute l’échelle, du haut vers le bas', () => {
  for (let i = 1; i < PALIERS.length; i++) {
    assert.ok(PALIERS[i].min < PALIERS[i - 1].min);
  }
  assert.equal(PALIERS.at(-1).min, 0);
  for (const n of [0, 34, 35, 49, 50, 64, 65, 79, 80, 100]) {
    assert.ok(palier(n)?.phrase, `aucun palier pour ${n}`);
  }
});

test('ce qu’il manque est dit comme une action, pas comme un reproche', () => {
  const s = evaluer({ gouvernorat: 'sfax' });
  const phrase = pourAffermir(s);
  assert.match(phrase, /^Renseignez /);
  assert.equal(pourAffermir(evaluer(COMPLET)), null);
  assert.equal(pourAffermir(null), null);
});
