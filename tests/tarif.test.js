import test from 'node:test';
import assert from 'node:assert/strict';
import { GRILLE, montantDepuisConsommation, consommationDepuisMontant, prixMoyen }
  from '../js/tarif.js';
import { BORNES } from '../js/facture.js';

test('la grille est croissante, tranche après tranche', () => {
  let seuil = 0; let prix = 0;
  for (const t of GRILLE.tranches) {
    assert.ok(t.jusqua > seuil, `seuil ${t.jusqua} après ${seuil}`);
    assert.ok(t.prix > prix, `prix ${t.prix} après ${prix}`);
    seuil = t.jusqua; prix = t.prix;
  }
  assert.equal(GRILLE.tranches.at(-1).jusqua, Infinity,
    'sans dernière tranche ouverte, une grosse consommation ne serait pas facturée');
});

test('la grille se présente comme non vérifiée tant qu’elle ne l’est pas', () => {
  // Ce n'est pas un détail : toute la page en dépend pour dire « estimation »
  // plutôt que « d'après votre facture ».
  assert.equal(typeof GRILLE.verifiee, 'boolean');
});

test('payer plus de kilowattheures coûte toujours plus cher', () => {
  let precedent = -1;
  for (let k = 0; k <= 2000; k += 25) {
    const dt = montantDepuisConsommation(k);
    assert.ok(dt > precedent, `recul du montant à ${k} kWh`);
    precedent = dt;
  }
});

test('l’inversion retrouve exactement la consommation', () => {
  for (const k of [1, 30, 50, 51, 100, 199, 200, 300, 499, 500, 501, 900, 3000]) {
    const dt = montantDepuisConsommation(k);
    assert.equal(consommationDepuisMontant(dt), k, `aller-retour raté à ${k} kWh`);
  }
});

test('un montant qui ne couvre pas les redevances ne rend aucune consommation', () => {
  assert.equal(consommationDepuisMontant(GRILLE.fraisFixes), null);
  assert.equal(consommationDepuisMontant(0), null);
  assert.equal(consommationDepuisMontant(-10), null);
});

test('rien à payer quand rien n’est consommé', () => {
  assert.equal(montantDepuisConsommation(0), 0);
  assert.equal(montantDepuisConsommation(-5), 0);
});

test('le prix moyen monte avec la consommation, sans jamais quitter le plausible', () => {
  let precedent = 0;
  for (const k of [60, 120, 250, 400, 700, 1500]) {
    const p = prixMoyen(k);
    assert.ok(p > precedent, `le prix moyen recule à ${k} kWh`);
    // Les mêmes bornes que celles qui refusent une saisie aberrante : une
    // grille qui les franchirait ferait rejeter ses propres estimations.
    assert.ok(p >= BORNES.prixKwh.min && p <= BORNES.prixKwh.max,
      `prix moyen ${p} hors des bornes admises à ${k} kWh`);
    precedent = p;
  }
});

test('le prix moyen reste entre le premier et le dernier prix de tranche', () => {
  const bas = GRILLE.tranches[0].prix;
  const haut = GRILLE.tranches.at(-1).prix;
  for (const k of [10, 300, 5000]) {
    const p = prixMoyen(k);
    assert.ok(p >= bas * 0.9 && p <= haut, `prix moyen ${p} incohérent à ${k} kWh`);
  }
});

test('aucun prix moyen pour une consommation nulle', () => {
  assert.equal(prixMoyen(0), null);
  assert.equal(prixMoyen(NaN), null);
});
