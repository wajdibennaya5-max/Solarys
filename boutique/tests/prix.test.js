/**
 * Le dinar se compte en millimes. Un total faux d'un millime ne coûte rien
 * au vendeur et tout à sa crédibilité, le jour où l'acheteur le remarque.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enMillimes, enDinars, formater } from '../js/prix.js';

// Un prix ne contient aucune espace sécable : fine insécable entre les
// milliers, insécable ordinaire devant la devise.
const FINE = '\u202f';
const NBSP = '\u00a0';

test('les dinars se convertissent en millimes entiers', () => {
  assert.equal(enMillimes(12.5), 12500);
  assert.equal(enMillimes(0.001), 1);
  assert.equal(enMillimes(129.9), 129900);
  assert.equal(enMillimes(0), 0);
});

test('ce qui n\'est pas un nombre vaut zéro, sans planter', () => {
  for (const x of [null, undefined, '', NaN]) assert.equal(enMillimes(x), 0);
});

test('additionner en millimes évite la dérive des flottants', () => {
  // 0,1 + 0,2 en flottants donne 0,30000000000000004 : le piège classique.
  const enDinarsFlottants = 0.1 + 0.2;
  assert.notEqual(enDinarsFlottants, 0.3);
  assert.equal(enMillimes(0.1) + enMillimes(0.2), 300);
  assert.equal(enDinars(300), 0.3);
});

test('un montant s\'écrit comme sur une facture tunisienne', () => {
  assert.equal(formater(12.5), `12,500${NBSP}DT`);
  assert.equal(formater(129.9), `129,900${NBSP}DT`);
  assert.equal(formater(7), `7,000${NBSP}DT`);
  assert.equal(formater(0), `0,000${NBSP}DT`);
});

test('les milliers sont séparés pour rester lisibles', () => {
  // Le séparateur est une espace FINE INSÉCABLE (U+202F), non une espace
  // ordinaire : c'est le séparateur typographique français, et surtout il
  // interdit qu'un prix se coupe en fin de ligne — « 1 » d'un côté,
  // « 234,500 DT » de l'autre. Ne pas le remplacer par ' '.
  assert.equal(formater(1234.5), `1${FINE}234,500${NBSP}DT`);
  assert.equal(formater(1234567.89), `1${FINE}234${FINE}567,890${NBSP}DT`);
  assert.doesNotMatch(formater(1234.5), / /, 'aucune espace sécable dans un prix');
});

test('la devise s\'écrit en arabe quand la page l\'est', () => {
  assert.equal(formater(12.5, { langue: 'ar' }), `12,500${NBSP}د.ت`);
});

test('un montant peut s\'afficher sans sa devise', () => {
  assert.equal(formater(12.5, { devise: false }), '12,500');
});

test('un montant négatif garde son signe', () => {
  // Une remise, un avoir : cela existe et ne doit pas s'afficher à l'envers.
  assert.equal(formater(-12.5), `-12,500${NBSP}DT`);
});
