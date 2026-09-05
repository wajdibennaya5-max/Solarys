/**
 * La vérification d'un paiement décide si un client est servi ou refusé.
 *
 * Trop laxiste, elle livre des clés sans encaisser. Trop stricte, elle refuse
 * un client qui a réellement payé — et celui-là ne revient pas. Ce fichier
 * éprouve les deux bords, sans jamais toucher au réseau : le nœud est
 * remplacé par une fonction qui répond ce qu'on lui dit de répondre.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  verifierPaiement, versHex, memeAdresse, empreinteValide,
  CONTRAT_USDT, RAISONS,
} from '../js/tron.js';

const NOTRE_ADRESSE = 'TBp9gdAeYdsiFvg7vKGoq2cM5TohLgbADB';
// Deux comptes distincts du nôtre ET du contrat USDT, en écriture
// hexadécimale — celle que les nœuds emploient la moitié du temps.
const AUTRE_JETON = '41' + '11'.repeat(20);
const AUTRE_COMPTE = '41' + '22'.repeat(20);
const TXID = 'a'.repeat(64);

/** Un nœud qui répond exactement ce qu'on lui demande de répondre. */
const noeudQuiRepond = (data, { ok = true } = {}) => async () => ({
  ok, json: async () => ({ data, success: true }),
});

/** Un transfert USDT tel que le nœud le décrit. */
const transfert = (to, valeur, contrat = CONTRAT_USDT) => ({
  event_name: 'Transfer',
  contract_address: contrat,
  result: { to, value: String(valeur) },
});

const verifier = (data, opts = {}) => verifierPaiement(TXID, {
  adresse: NOTRE_ADRESSE, montantMin: 20, fetchImpl: noeudQuiRepond(data), ...opts,
});

/* ------------------------------------------------------------------ */
/* Traduction des adresses                                             */
/* ------------------------------------------------------------------ */

test('une adresse base58 se traduit en hexadécimal', () => {
  const hex = versHex(NOTRE_ADRESSE);
  assert.match(hex, /^41[0-9a-f]{40}$/, 'préfixe 41 et 20 octets attendus');
});

test('ce qui n\'est pas une adresse ne se traduit pas', () => {
  // `0`, `O`, `I` et `l` sont hors de l'alphabet base58 ; une longueur autre
  // que 34 n'est pas une adresse.
  for (const x of ['', 'trop-court', null, undefined, 42, '0'.repeat(34), 'I'.repeat(34)]) {
    assert.equal(versHex(x), null, `traduit à tort : ${x}`);
  }
});

test('la traduction vérifie la structure, non la somme de contrôle', () => {
  // Une chaîne de 34 caractères base58 se décode en 21 octets même si sa
  // somme de contrôle est fausse. C'est sans danger : une telle adresse ne
  // correspondra simplement jamais à la nôtre.
  const bidon = versHex('T'.repeat(34));
  assert.match(bidon, /^41[0-9a-f]{40}$/);
  assert.equal(memeAdresse(bidon, NOTRE_ADRESSE), false);
});

test('les deux écritures d\'une adresse se reconnaissent', () => {
  // Les nœuds renvoient tantôt l'une tantôt l'autre : les confondre ferait
  // refuser un paiement pourtant reçu.
  assert.equal(memeAdresse(NOTRE_ADRESSE, versHex(NOTRE_ADRESSE)), true);
  assert.equal(memeAdresse(versHex(NOTRE_ADRESSE).toUpperCase(), NOTRE_ADRESSE), true);
  assert.equal(memeAdresse(NOTRE_ADRESSE, AUTRE_COMPTE), false);
  assert.equal(memeAdresse(NOTRE_ADRESSE, null), false);
});

/* ------------------------------------------------------------------ */
/* Forme de l'empreinte                                                */
/* ------------------------------------------------------------------ */

test('une empreinte valide fait 64 caractères hexadécimaux', () => {
  assert.equal(empreinteValide(TXID), true);
  assert.equal(empreinteValide(TXID.toUpperCase()), true);
  for (const x of ['', 'a'.repeat(63), 'a'.repeat(65), 'z'.repeat(64), null]) {
    assert.equal(empreinteValide(x), false, `accepté à tort : ${x}`);
  }
});

test('une empreinte mal formée ne déclenche aucun appel réseau', async () => {
  let appele = false;
  const r = await verifierPaiement('pas-une-empreinte', {
    adresse: NOTRE_ADRESSE, montantMin: 20,
    fetchImpl: async () => { appele = true; return { ok: true, json: async () => ({}) }; },
  });
  assert.equal(r.ok, false);
  assert.equal(r.raison, 'empreinte-invalide');
  assert.equal(appele, false, 'inutile de déranger le nœud pour une saisie évidemment fausse');
});

/* ------------------------------------------------------------------ */
/* Ce qui vaut paiement                                                */
/* ------------------------------------------------------------------ */

test('un transfert USDT du bon montant vers nous vaut paiement', async () => {
  const r = await verifier([transfert(NOTRE_ADRESSE, 20_000_000)]);
  assert.deepEqual(r, { ok: true, montant: 20 });
});

test('le nœud peut répondre en hexadécimal sans que rien ne change', async () => {
  const r = await verifier([transfert(versHex(NOTRE_ADRESSE), 20_000_000)]);
  assert.equal(r.ok, true);
});

test('payer plus que demandé reste un paiement', async () => {
  const r = await verifier([transfert(NOTRE_ADRESSE, 25_000_000)]);
  assert.equal(r.ok, true);
  assert.equal(r.montant, 25);
});

test('plusieurs transferts vers nous comptent ensemble', async () => {
  const r = await verifier([
    transfert(NOTRE_ADRESSE, 12_000_000),
    transfert(NOTRE_ADRESSE, 8_000_000),
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.montant, 20);
});

test('un arrondi de portefeuille ne fait pas refuser un client', async () => {
  // 19,995 USDT pour un prix de 20 : c'est une conversion, pas une fraude.
  const r = await verifier([transfert(NOTRE_ADRESSE, 19_995_000)]);
  assert.equal(r.ok, true);
});

/* ------------------------------------------------------------------ */
/* Ce qui ne vaut pas paiement                                         */
/* ------------------------------------------------------------------ */

test('une transaction inconnue de la chaîne est refusée', async () => {
  const r = await verifier([]);
  assert.deepEqual(r, { ok: false, raison: 'introuvable' });
});

test('un transfert d\'un autre jeton ne vaut pas paiement', async () => {
  const r = await verifier([transfert(NOTRE_ADRESSE, 20_000_000, AUTRE_JETON)]);
  assert.deepEqual(r, { ok: false, raison: 'pas-un-transfert' });
});

test('un transfert vers quelqu\'un d\'autre ne vaut pas paiement', async () => {
  const r = await verifier([transfert(AUTRE_COMPTE, 20_000_000)]);
  assert.deepEqual(r, { ok: false, raison: 'mauvais-destinataire' });
});

test('un montant franchement insuffisant est refusé', async () => {
  const r = await verifier([transfert(NOTRE_ADRESSE, 5_000_000)]);
  assert.deepEqual(r, { ok: false, raison: 'montant-insuffisant' });
});

test('un transfert sortant ne compte pas comme entrant', async () => {
  // Payer soi-même depuis son adresse ne débloque rien.
  const r = await verifier([{ event_name: 'Transfer', contract_address: CONTRAT_USDT,
    result: { from: NOTRE_ADRESSE, to: AUTRE_COMPTE, value: '20000000' } }]);
  assert.equal(r.ok, false);
});

test('un événement qui n\'est pas un transfert est ignoré', async () => {
  const r = await verifier([{ event_name: 'Approval', contract_address: CONTRAT_USDT,
    result: { to: NOTRE_ADRESSE, value: '99000000' } }]);
  assert.deepEqual(r, { ok: false, raison: 'pas-un-transfert' });
});

/* ------------------------------------------------------------------ */
/* Quand le réseau fait défaut                                         */
/* ------------------------------------------------------------------ */

test('un nœud en erreur ne fait pas passer un paiement', async () => {
  const r = await verifier([], { fetchImpl: noeudQuiRepond([], { ok: false }) });
  assert.deepEqual(r, { ok: false, raison: 'reseau' });
});

test('un réseau injoignable est dit comme tel, sans planter', async () => {
  const r = await verifierPaiement(TXID, {
    adresse: NOTRE_ADRESSE, montantMin: 20,
    fetchImpl: async () => { throw new Error('offline'); },
  });
  assert.deepEqual(r, { ok: false, raison: 'reseau' });
});

test('une réponse illisible ne fait pas passer un paiement', async () => {
  const r = await verifierPaiement(TXID, {
    adresse: NOTRE_ADRESSE, montantMin: 20,
    fetchImpl: async () => ({ ok: true, json: async () => { throw new Error('pas du JSON'); } }),
  });
  assert.deepEqual(r, { ok: false, raison: 'reseau' });
});

/* ------------------------------------------------------------------ */
/* Messages                                                            */
/* ------------------------------------------------------------------ */

test('chaque refus possible porte un message lisible', async () => {
  // Un refus sans explication est un client perdu qui ne sait pas quoi faire.
  const refus = ['empreinte-invalide', 'introuvable', 'pas-un-transfert',
    'mauvais-destinataire', 'montant-insuffisant', 'reseau'];
  for (const r of refus) {
    assert.ok(RAISONS[r] && RAISONS[r].length > 20, `message manquant pour « ${r} »`);
  }
});
