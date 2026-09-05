/**
 * Personne ne connaît sa consommation annuelle. Ce fichier vérifie qu'on
 * n'exige plus que ce qui est imprimé sur une facture — et qu'on reconnaît
 * les deux erreurs que les gens font vraiment.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { versAnnuel, verifier, periode, PERIODES, REPERES, BORNES } from '../js/facture.js';

// Les chiffres d'une vraie facture STEG bimestrielle.
const REELLE = { quantite: 590, montant: 132.820, periode: 'bimestrielle' };

test('une facture bimestrielle vaut six factures dans l\'année', () => {
  const a = versAnnuel(REELLE);
  assert.equal(a.parAn, 6);
  assert.equal(a.consommationAnnuelle, 3540);   // 590 × 6
  assert.equal(a.montantAnnuel, 796.92);        // 132,820 × 6
});

test('le prix du kWh sort juste, et c\'est lui qui porte l\'étude', () => {
  const a = versAnnuel(REELLE);
  assert.ok(Math.abs(a.prixKwh - 0.225) < 0.001, `obtenu ${a.prixKwh}`);
  // Le rapport annuel doit donner le même prix : sinon l'étude et la facture
  // se contrediraient.
  assert.ok(Math.abs(a.montantAnnuel / a.consommationAnnuelle - a.prixKwh) < 1e-6);
});

test('les trois périodicités se convertissent correctement', () => {
  assert.equal(versAnnuel({ ...REELLE, periode: 'mensuelle' }).consommationAnnuelle, 7080);
  assert.equal(versAnnuel({ ...REELLE, periode: 'trimestrielle' }).consommationAnnuelle, 2360);
  assert.equal(periode('inconnue'), null);
  assert.equal(versAnnuel({ ...REELLE, periode: 'inconnue' }), null);
});

test('une seule périodicité est proposée par défaut', () => {
  const defauts = PERIODES.filter((p) => p.defaut);
  assert.equal(defauts.length, 1);
  assert.equal(defauts[0].parAn, 6, 'les factures STEG sont bimestrielles');
});

test('un index de compteur saisi à la place de la consommation est reconnu', () => {
  // L'erreur la plus fréquente : la facture affiche « Index 16338 » juste à
  // côté de « Quantité 590 ».
  const message = verifier({ ...REELLE, quantite: 16338 });
  assert.match(message, /index de compteur/i);
  assert.match(message, /Quantité/);
});

test('le montant à payer saisi à la place du total électricité est reconnu', () => {
  // 554 DT pour 590 kWh donnerait 0,94 DT/kWh : quatre fois le tarif réel.
  const message = verifier({ ...REELLE, montant: 554 });
  assert.match(message, /Montant à payer/);
  assert.match(message, /arriérés/);
});

test('une saisie cohérente ne déclenche aucun reproche', () => {
  assert.equal(verifier(REELLE), null);
  assert.equal(verifier({ quantite: 300, montant: 70, periode: 'bimestrielle' }), null);
  assert.equal(verifier({ quantite: 1200, montant: 320, periode: 'bimestrielle' }), null);
});

test('un champ vide est signalé en nommant où le trouver', () => {
  assert.match(verifier({ quantite: 0, montant: 100 }), /Quantité/);
  assert.match(verifier({ quantite: 590, montant: 0 }), /Total Electricité/);
});

test('chaque repère dit où chercher sur la facture', () => {
  // Un client cherche ce qu'il voit imprimé, pas ce qu'on aurait préféré.
  for (const [cle, r] of Object.entries(REPERES)) {
    assert.ok(r.libelle && r.colonne, `repère incomplet : ${cle}`);
    assert.ok(r.aide.length > 40, `aide trop courte : ${cle}`);
    assert.ok(r.exemple > 0, `exemple manquant : ${cle}`);
  }
  // L'aide du montant doit prévenir du piège des arriérés.
  assert.match(REPERES.montant.aide, /arriérés/);
});

test('les bornes de prix encadrent le tarif tunisien réel', () => {
  // Le tarif domestique STEG va d'environ 0,14 à 0,45 DT/kWh selon la tranche.
  // Une facture réelle doit donc tomber franchement dans la fourchette.
  const a = versAnnuel(REELLE);
  assert.ok(a.prixKwh > BORNES.prixKwh.min && a.prixKwh < BORNES.prixKwh.max,
    `une vraie facture donne ${a.prixKwh} DT/kWh, hors des bornes`);
});

test('le message nomme le prix obtenu, pour qu\'on voie l\'absurdité', () => {
  // « Valeur invalide » ne dit rien ; « 0,94 DT le kWh » se comprend seul.
  assert.match(verifier({ ...REELLE, montant: 554 }), /0,94 DT le kWh/);
  assert.match(verifier({ ...REELLE, quantite: 5000 }), /0,027 DT le kWh/);
});
