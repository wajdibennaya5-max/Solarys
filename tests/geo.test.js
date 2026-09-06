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

/** Un capteur simulé, pour éprouver ce qu'on retient de sa réponse. */
const capteur = (coords, timestamp = 1700000000000) => ({
  getCurrentPosition: (ok, _ko, options) => ok({ coords, timestamp, options }),
});

test('LA MESURE REMONTE ENTIÈRE : altitude, heure et précision', async () => {
  // Sans l'altitude, une installation à Aïn Draham est calculée comme au bord
  // de mer. Sans l'heure, on ne sait pas si la position date d'aujourd'hui.
  const r = await localiser({ haute: true, geo: capteur({
    latitude: 36.8065, longitude: 10.1815, accuracy: 6,
    altitude: 23.4, altitudeAccuracy: 3,
  }) });
  assert.equal(r.ok, true);
  assert.equal(r.precision, 6);
  assert.equal(r.altitude, 23.4);
  assert.equal(r.precisionAltitude, 3);
  assert.equal(r.horodatage, 1700000000000);
  assert.equal(r.origine, 'capteur-fin');
  assert.equal(r.id, 'tunis');
});

test('UNE ALTITUDE ABSENTE NE DEVIENT PAS LE NIVEAU DE LA MER', () => {
  // `Number(null)` vaut 0 : le piège transformerait « je ne sais pas » en
  // « zéro mètre », et une précision absente en « parfaite ».
  return localiser({ geo: capteur({
    latitude: 36.8065, longitude: 10.1815, accuracy: null,
    altitude: null, altitudeAccuracy: null,
  }) }).then((r) => {
    assert.equal(r.altitude, null);
    assert.equal(r.precisionAltitude, null);
    assert.equal(r.precision, null);
    // Sans précision annoncée, on ne décerne pas la mention « GPS fin ».
    assert.equal(r.origine, 'capteur');
  });
});

test('« GPS fin » n’est décerné que si le relevé le mérite', async () => {
  // Demander la haute précision ne suffit pas : c'est le résultat qui compte.
  const large = await localiser({ haute: true, geo: capteur({
    latitude: 36.8065, longitude: 10.1815, accuracy: 900 }) });
  assert.equal(large.origine, 'capteur');
  const sansDemande = await localiser({ haute: false, geo: capteur({
    latitude: 36.8065, longitude: 10.1815, accuracy: 4 }) });
  assert.equal(sansDemande.origine, 'capteur');
});

test('la haute précision ne se contente pas d’un relevé périmé', async () => {
  let vues = null;
  await localiser({ haute: true, geo: {
    getCurrentPosition: (ok, _ko, options) => {
      vues = options;
      ok({ coords: { latitude: 36.8, longitude: 10.18, accuracy: 5 }, timestamp: 1 });
    },
  } });
  assert.equal(vues.enableHighAccuracy, true);
  assert.equal(vues.maximumAge, 0, 'un cache de dix minutes annulerait la demande');
});
