import test from 'node:test';
import assert from 'node:assert/strict';
import { METHODES, FIABILITES, resoudre, verifier, methode, prixImplique,
  MOIS_MINIMUM, MOIS_PAR_AN, prixMoyenAnnuel } from '../js/consommation.js';
import { BORNES } from '../js/facture.js';

const FACTURE = { quantite: 1200, montant: 340, periode: 'bimestrielle' };
const DOUZE = [600, 580, 520, 480, 450, 500, 700, 750, 720, 540, 500, 560];
const PROFIL = { personnes: 4, surface: 120, climatiseurs: 1, chauffeEau: true };

test('les quatre portes existent, la facture en tête', () => {
  assert.equal(METHODES.length, 4);
  assert.equal(METHODES[0].id, 'facture');
  assert.equal(METHODES[0].conseil, true);
  assert.equal(METHODES.filter((m) => m.conseil).length, 1,
    'deux méthodes « conseillées » ne conseilleraient plus rien');
});

test('chaque méthode annonce une fiabilité qui existe', () => {
  for (const m of METHODES) {
    assert.ok(FIABILITES[m.fiabilite], `fiabilité inconnue : ${m.fiabilite}`);
    assert.ok(m.nom && m.resume);
  }
});

test('la méthode conseillée est la plus fiable', () => {
  const conseil = METHODES.find((m) => m.conseil);
  for (const m of METHODES) {
    assert.ok(FIABILITES[conseil.fiabilite].rang >= FIABILITES[m.fiabilite].rang,
      `${m.id} est plus fiable que la méthode conseillée`);
  }
});

test('les quatre portes mènent au même ordre de grandeur', () => {
  // Elles décrivent le même foyer : si elles divergeaient d'un facteur deux,
  // le client verrait deux études contradictoires du même logement.
  const r = {
    facture: resoudre('facture', FACTURE),
    mensuel: resoudre('mensuel', { mois: DOUZE }),
    montant: resoudre('montant', { montant: 340, parAn: 6 }),
  };
  const valeurs = Object.values(r).map((x) => x.consommationAnnuelle);
  const min = Math.min(...valeurs); const max = Math.max(...valeurs);
  assert.ok(max / min < 1.25, `écart trop grand entre méthodes : ${JSON.stringify(r)}`);
});

test('la facture reste la seule à donner le vrai prix du kWh', () => {
  const f = resoudre('facture', FACTURE);
  assert.equal(f.fiabilite, 'facture');
  assert.equal(f.prixKwh, 340 / 1200);
  for (const id of ['mensuel', 'montant', 'profil']) {
    const saisie = { facture: FACTURE, mensuel: { mois: DOUZE },
      montant: { montant: 340 }, profil: PROFIL }[id];
    assert.notEqual(resoudre(id, saisie).fiabilite, 'facture');
  }
});

test('chaque résultat porte de quoi être affiché honnêtement', () => {
  const cas = [['facture', FACTURE], ['mensuel', { mois: DOUZE }],
    ['montant', { montant: 340 }], ['profil', PROFIL]];
  for (const [id, saisie] of cas) {
    const r = resoudre(id, saisie);
    assert.ok(r, `${id} ne rend rien`);
    assert.ok(r.consommationAnnuelle > 0 && r.montantAnnuel > 0, id);
    assert.ok(FIABILITES[r.fiabilite], id);
    assert.ok(r.detail && r.detail.length > 10, `${id} n’explique pas d’où sort son chiffre`);
    // Le prix déduit doit rester dans ce que la page accepte d'une saisie.
    assert.ok(r.prixKwh >= BORNES.prixKwh.min && r.prixKwh <= BORNES.prixKwh.max,
      `${id} produit un prix hors bornes : ${r.prixKwh}`);
    assert.ok(Math.abs(prixImplique(r) - r.prixKwh) < 1e-9, id);
  }
});

test('mois par mois : moins de huit mois ne fait pas une année', () => {
  assert.equal(resoudre('mensuel', { mois: [500, 500, 500] }), null);
  assert.match(verifier('mensuel', { mois: [500, 500, 500] }), /8 mois/);
  assert.equal(verifier('mensuel', { mois: DOUZE }), null);
});

test('mois par mois : les mois manquants prennent la moyenne, et on le dit', () => {
  const dix = DOUZE.slice(0, 10);
  const r = resoudre('mensuel', { mois: dix });
  const moyenne = dix.reduce((s, v) => s + v, 0) / dix.length;
  assert.equal(r.consommationAnnuelle, Math.round(moyenne * MOIS_PAR_AN));
  assert.match(r.detail, /10 mois saisis/);
  assert.match(resoudre('mensuel', { mois: DOUZE }).detail, /douze mois/);
});

test('mois par mois : un zéro se distingue d’un mois non saisi', () => {
  // Un mois d'absence à zéro est une information ; une case vide n'en est pas
  // une, et la compter pour zéro écraserait la moyenne.
  const avecZero = resoudre('mensuel', { mois: [...DOUZE.slice(0, 11), 0] });
  const sansDouzieme = resoudre('mensuel', { mois: DOUZE.slice(0, 11) });
  assert.ok(avecZero.consommationAnnuelle < sansDouzieme.consommationAnnuelle);
  assert.equal(resoudre('mensuel', { mois: [...DOUZE.slice(0, 8), null, undefined, '', NaN] })
    .consommationAnnuelle > 0, true);
});

test('mois par mois : des index de compteur sont reconnus comme tels', () => {
  const index = new Array(12).fill(48219);
  assert.match(verifier('mensuel', { mois: index }), /index de compteur/);
});

test('ce que je paie : le montant saisi reste le montant annoncé', () => {
  const r = resoudre('montant', { montant: 340, parAn: 6 });
  assert.equal(r.montantAnnuel, 2040, 'on ne recalcule pas ce que le client a dit payer');
  assert.ok(r.consommationAnnuelle > 0);
});

test('ce que je paie : la périodicité change tout', () => {
  const bimestre = resoudre('montant', { montant: 340, parAn: 6 });
  const mensuel = resoudre('montant', { montant: 340, parAn: 12 });
  assert.ok(mensuel.consommationAnnuelle > bimestre.consommationAnnuelle);
});

test('ce que je paie : un montant aberrant est refusé en clair', () => {
  assert.match(verifier('montant', { montant: 0 }), /payez/);
  assert.match(verifier('montant', { montant: 1 }), /trop faible/);
  assert.match(verifier('montant', { montant: 99999 }), /dépasse/);
  assert.equal(verifier('montant', { montant: 340 }), null);
});

test('sans facture : le détail par poste voyage avec le résultat', () => {
  const r = resoudre('profil', PROFIL);
  assert.ok(Array.isArray(r.postes) && r.postes.length >= 3);
  assert.equal(r.postes.reduce((s, [, k]) => s + k, 0), r.consommationAnnuelle);
});

test('une méthode inconnue ne rend rien, et le dit', () => {
  assert.equal(resoudre('devinette', {}), null);
  assert.equal(methode('devinette'), null);
  assert.match(verifier('devinette', {}), /Choisissez/);
});

test('une saisie vide ne rend jamais un chiffre inventé', () => {
  for (const id of ['facture', 'mensuel', 'montant', 'profil']) {
    assert.equal(resoudre(id, {}), null, `${id} invente un résultat sur une saisie vide`);
  }
});

test('le prix moyen annuel suit la consommation', () => {
  assert.ok(prixMoyenAnnuel(12000) > prixMoyenAnnuel(2400));
  assert.equal(prixMoyenAnnuel(0), null);
});

test('MOIS_MINIMUM reste en deçà de l’année', () => {
  assert.ok(MOIS_MINIMUM > 0 && MOIS_MINIMUM < MOIS_PAR_AN);
});
