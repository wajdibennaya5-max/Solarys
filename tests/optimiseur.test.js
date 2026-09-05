import test from 'node:test';
import assert from 'node:assert/strict';
import { optimiser, selonChaqueObjectif, OBJECTIFS, objectif, contraintesAppliquees }
  from '../js/optimiseur.js';
import { HYPOTHESES, PUISSANCE, etudier } from '../js/etude.js';
import { STANDARD, flux } from '../js/finances.js';

const D = {
  consommationAnnuelle: 7200, montantAnnuel: 2040, gouvernorat: 'sfax',
  orientation: 'sud', pente: 'moyenne', batiment: 'maison',
  surfaceDisponible: 45, toitL: 9, toitP: 5,
};

test('chaque objectif nomme le critère exact qu’il maximise ou minimise', () => {
  // « Optimal » sans son critère est une opinion déguisée en résultat.
  assert.equal(OBJECTIFS.length, 3);
  for (const o of OBJECTIFS) {
    assert.ok(o.nom && o.resume, o.id);
    assert.ok(o.critere.length > 20, `${o.id} : critère trop vague`);
    assert.ok(o.detail.length > 60, `${o.id} : détail trop court pour être contesté`);
    assert.equal(typeof o.note, 'function');
  }
  assert.equal(objectif('inconnu').id, 'equilibre', 'un objectif inconnu retombe sur l’équilibre');
});

test('les trois objectifs donnent trois réponses différentes', () => {
  // S'ils convergeaient, proposer un choix serait un décor.
  const r = selonChaqueObjectif(D);
  assert.equal(r.length, 3);
  const puissances = r.map((x) => x.puissance);
  assert.equal(new Set(puissances).size, 3, `réponses confondues : ${puissances}`);
});

test('économie rembourse le plus vite, production produit le plus', () => {
  const par = Object.fromEntries(selonChaqueObjectif(D).map((r) => [r.objectif.id, r.configuration]));
  assert.ok(par.economie.retourActualise <= par.production.retourActualise);
  assert.ok(par.production.production >= par.economie.production);
  assert.ok(par.production.production >= par.equilibre.production);
});

test('l’équilibre vise la couverture, pas la taille', () => {
  const par = Object.fromEntries(selonChaqueObjectif(D).map((r) => [r.objectif.id, r.configuration]));
  assert.ok(Math.abs(par.equilibre.couverture - 1) < 0.15,
    `couverture ${par.equilibre.couverture}`);
  assert.ok(Math.abs(par.equilibre.couverture - 1) < Math.abs(par.economie.couverture - 1));
  assert.ok(Math.abs(par.equilibre.couverture - 1) < Math.abs(par.production.couverture - 1));
});

test('aucune configuration proposée ne dépasse la toiture', () => {
  const r = optimiser(D, { objectif: 'production' });
  for (const c of r.configurations) {
    assert.ok(c.puissance * HYPOTHESES.surfaceParKwc <= D.surfaceDisponible + 0.01,
      `${c.puissance} kWc demande ${c.puissance * 6} m² sur ${D.surfaceDisponible}`);
  }
});

test('aucune configuration refusée par l’électricité n’est proposée', () => {
  // Proposer une installation qu'on ne peut pas poser n'est pas une optimisation.
  for (const o of OBJECTIFS) {
    for (const c of optimiser(D, { objectif: o.id }).configurations) {
      assert.notEqual(c.verdictElectrique, 'hors', `${o.id} : ${c.puissance} kWc`);
    }
  }
});

test('les configurations proposées sont distinctes', () => {
  const r = optimiser(D, { objectif: 'equilibre', combien: 3 });
  const vues = r.configurations.map((c) => `${c.module.id}:${c.puissance}`);
  assert.equal(new Set(vues).size, vues.length);
  assert.ok(r.configurations.length >= 2);
  assert.deepEqual(r.configurations.map((c) => c.lettre).slice(0, 3), ['A', 'B', 'C']);
});

test('la recommandation dit toujours selon quoi elle a été retenue', () => {
  for (const o of OBJECTIFS) {
    const r = optimiser(D, { objectif: o.id });
    assert.ok(r.recommandation.phrase.includes(o.nom), `${o.id} : objectif non nommé`);
    assert.ok(r.recommandation.phrase.includes(o.critere), `${o.id} : critère non nommé`);
    assert.match(r.recommandation.phrase, /contraintes/);
    assert.match(r.recommandation.phrase, /Un autre objectif donnerait une autre réponse/);
  }
});

test('les contraintes réellement appliquées sont énumérées', () => {
  const avec = contraintesAppliquees(D).map((c) => c.cle);
  assert.ok(avec.includes('surface'));
  assert.ok(avec.includes('electrique'));
  assert.ok(avec.includes('calepinage'));
  // Sans cotes, on le dit plutôt que de laisser croire à une contrainte.
  const sans = contraintesAppliquees({ ...D, surfaceDisponible: 0 });
  assert.ok(sans.some((c) => c.cle === 'sans-surface'));
  assert.ok(sans.some((c) => c.texte.includes('peuvent ne pas tenir')));
});

test('sans toiture, l’exploration reste bornée par la puissance maximale', () => {
  const r = optimiser({ ...D, surfaceDisponible: 0, toitL: 0, toitP: 0 },
    { objectif: 'production' });
  assert.ok(r);
  for (const c of r.configurations) {
    assert.ok(c.puissance <= PUISSANCE.max && c.puissance >= PUISSANCE.min);
  }
});

test('les chiffres d’une configuration sont ceux des moteurs, pas des approximations', () => {
  const c = optimiser(D, { objectif: 'equilibre' }).configurations[0];
  const e = etudier({ ...D, puissance: c.puissance, moduleWc: c.module.puissance });
  assert.equal(c.production, e.production);
  assert.equal(c.modules, e.modules);
  assert.equal(c.cout, e.cout);
  const f = flux({ puissance: e.puissance, autoconsomme: e.autoconsomme,
    surplus: e.surplus, prixKwh: e.prixKwh }, STANDARD);
  assert.ok(Math.abs(c.van - f.van) < 1e-6);
  assert.ok(Math.abs(c.retour - f.retour) < 1e-9);
});

test('un jeu financier différent change la recommandation ou l’assume', () => {
  const std = optimiser(D, { objectif: 'equilibre' });
  const cher = optimiser(D, { objectif: 'economie',
    parametresFinanciers: { ...STANDARD, coutParKwc: 5000 } });
  assert.ok(cher, 'un projet plus cher doit rester calculable');
  assert.ok(cher.configurations[0].cout > 0);
  assert.ok(std.exploré > 10, 'l’exploration doit couvrir un vrai espace');
});

test('des données inexploitables ne rendent aucune optimisation', () => {
  assert.equal(optimiser(null), null);
  assert.equal(optimiser({ ...D, consommationAnnuelle: 0 }), null);
  assert.equal(optimiser({ ...D, gouvernorat: 'atlantide' }), null);
});

test('la part fixe du coût rend les petites installations réalistes', () => {
  // Un coût purement proportionnel faisait du plus petit projet le plus
  // rentable, ce qu'aucun installateur ne facturera jamais.
  const parKwc = (k) => etudier({ ...D, puissance: k }).cout / k;
  assert.ok(parKwc(1) > parKwc(10), 'le coût par kWc doit baisser avec la taille');
  assert.ok(parKwc(10) > parKwc(30));
  assert.equal(etudier({ ...D, puissance: 4 }).cout,
    HYPOTHESES.coutFixe + 4 * HYPOTHESES.coutParKwc);
});
