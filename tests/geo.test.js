/**
 * La localisation fait gagner un geste au visiteur. Mal faite, elle lui fait
 * calculer une étude pour une ville qui n'est pas la sienne — et le résultat
 * est faux sans qu'il s'en aperçoive.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CENTRES, enTunisie, distance, gouvernoratLePlusProche, localiser, REFUS }
  from '../js/geo.js';
import { GOUVERNORATS, productible } from '../js/gisement.js';

test('chaque gouvernorat de la liste a un centre, et réciproquement', () => {
  const listes = GOUVERNORATS.map((g) => g.id).sort();
  assert.deepEqual(Object.keys(CENTRES).sort(), listes);
});

test('chaque centre tombe bien en Tunisie', () => {
  for (const [id, [lat, lon]] of Object.entries(CENTRES)) {
    assert.ok(enTunisie(lat, lon), `centre hors de Tunisie : ${id}`);
    assert.ok(productible(id) > 0, `productible manquant : ${id}`);
  }
});

test('le centre d\'un gouvernorat désigne ce gouvernorat', () => {
  // La propriété minimale : partir du centre doit y revenir.
  for (const [id, [lat, lon]] of Object.entries(CENTRES)) {
    assert.equal(gouvernoratLePlusProche(lat, lon).id, id, `raté pour ${id}`);
  }
});

test('des villes réelles tombent dans le bon gouvernorat', () => {
  const villes = [
    ['La Marsa', 36.88, 10.32, 'ariana'],
    ['Sfax centre', 34.74, 10.76, 'sfax'],
    ['Djerba', 33.81, 10.85, 'medenine'],
    ['Tozeur', 33.92, 8.13, 'tozeur'],
    ['Bizerte', 37.27, 9.87, 'bizerte'],
  ];
  for (const [nom, lat, lon, attendu] of villes) {
    assert.equal(gouvernoratLePlusProche(lat, lon).id, attendu, `${nom} mal placée`);
  }
});

test('hors de Tunisie, rien n\'est proposé', () => {
  // Paris, Rome, Le Caire : mieux vaut la liste qu'un gouvernorat absurde.
  for (const [lat, lon] of [[48.85, 2.35], [41.90, 12.50], [30.04, 31.24]]) {
    assert.equal(gouvernoratLePlusProche(lat, lon), null);
  }
  assert.equal(enTunisie(NaN, 10), false);
  assert.equal(enTunisie(undefined, undefined), false);
});

test('la distance est symétrique et nulle sur place', () => {
  const a = CENTRES.tunis, b = CENTRES.sfax;
  assert.equal(distance(a, a), 0);
  assert.ok(Math.abs(distance(a, b) - distance(b, a)) < 1e-9);
  // Tunis–Sfax fait environ 240 km à vol d'oiseau.
  assert.ok(distance(a, b) > 200 && distance(a, b) < 280, `obtenu ${distance(a, b)} km`);
});

/* ------------------------------------------------------------------ */
/* Le navigateur                                                       */
/* ------------------------------------------------------------------ */

const geoQuiDonne = (latitude, longitude) => ({
  getCurrentPosition: (ok) => ok({ coords: { latitude, longitude } }),
});
const geoQuiRefuse = (code) => ({
  getCurrentPosition: (_, ko) => ko({ code }),
});

test('une position tunisienne donne le gouvernorat', async () => {
  const r = await localiser({ geo: geoQuiDonne(34.74, 10.76) });
  assert.equal(r.ok, true);
  assert.equal(r.id, 'sfax');
});

test('un refus de l\'utilisateur est dit comme tel', async () => {
  const r = await localiser({ geo: geoQuiRefuse(1) });
  assert.deepEqual(r, { ok: false, raison: 'refuse' });
});

test('une panne technique se distingue d\'un refus', async () => {
  // Le message diffère : « refusée » accuse à tort qui n'a rien refusé.
  const r = await localiser({ geo: geoQuiRefuse(2) });
  assert.deepEqual(r, { ok: false, raison: 'echec' });
});

test('un navigateur sans géolocalisation ne bloque pas le visiteur', async () => {
  assert.deepEqual(await localiser({ geo: undefined }), { ok: false, raison: 'indisponible' });
  assert.deepEqual(await localiser({ geo: {} }), { ok: false, raison: 'indisponible' });
});

test('une position étrangère renvoie vers la liste', async () => {
  const r = await localiser({ geo: geoQuiDonne(48.85, 2.35) });
  assert.deepEqual(r, { ok: false, raison: 'horsTunisie' });
});

test('chaque échec porte un message qui dit quoi faire', () => {
  for (const [cle, message] of Object.entries(REFUS)) {
    assert.ok(message.length > 30, `message trop court : ${cle}`);
    assert.match(message, /liste/, `${cle} doit renvoyer vers la liste`);
  }
});
