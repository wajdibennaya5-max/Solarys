import test from 'node:test';
import assert from 'node:assert/strict';
import {
  jourDeLAnnee, declinaison, equationDuTemps, heureSolaire, angleHoraire,
  position, versLeSoleil, DATES, dateRepere, course, journee, midiSolaire,
  FUSEAU_TUNISIE,
} from '../js/soleil.js';
import { AZIMUTS } from '../js/pvgis/parametres.js';

const TUNIS = { latitude: 36.8065, longitude: 10.1815 };
const OBLIQUITE = 23.44;

test('le quantième du jour compte juste, années bissextiles comprises', () => {
  assert.equal(jourDeLAnnee(new Date(Date.UTC(2025, 0, 1))), 1);
  assert.equal(jourDeLAnnee(new Date(Date.UTC(2025, 11, 31))), 365);
  assert.equal(jourDeLAnnee(new Date(Date.UTC(2024, 11, 31))), 366);
  assert.equal(jourDeLAnnee(new Date(Date.UTC(2024, 1, 29))), 60);
  assert.equal(jourDeLAnnee('pas une date'), null);
});

test('LA DÉCLINAISON ATTEINT L’OBLIQUITÉ AUX SOLSTICES, ET ZÉRO AUX ÉQUINOXES', () => {
  // Si elle se trompe, tout le reste suit : c'est elle qui fait la saison.
  const hiver = declinaison(jourDeLAnnee(new Date(Date.UTC(2025, 11, 21))));
  const ete = declinaison(jourDeLAnnee(new Date(Date.UTC(2025, 5, 21))));
  assert.ok(Math.abs(hiver + OBLIQUITE) < 0.3, `${hiver} au solstice d’hiver`);
  assert.ok(Math.abs(ete - OBLIQUITE) < 0.3, `${ete} au solstice d’été`);
  const equinoxe = declinaison(jourDeLAnnee(new Date(Date.UTC(2025, 2, 20))));
  assert.ok(Math.abs(equinoxe) < 1, `${equinoxe} à l’équinoxe`);
  assert.equal(declinaison(null), null);
});

test('L’ÉQUATION DU TEMPS N’EST PAS UN DÉTAIL', () => {
  // Elle atteint un quart d'heure : l'ignorer décalerait les ombres d'hiver
  // de près de quatre degrés.
  const novembre = equationDuTemps(jourDeLAnnee(new Date(Date.UTC(2025, 10, 3))));
  assert.ok(novembre > 12 && novembre < 18, `${novembre} min début novembre`);
  const fevrier = equationDuTemps(jourDeLAnnee(new Date(Date.UTC(2025, 1, 11))));
  assert.ok(fevrier < -10 && fevrier > -16, `${fevrier} min mi-février`);
  assert.equal(equationDuTemps(null), null);
});

test('l’heure solaire corrige le fuseau, la longitude et l’équation du temps', () => {
  // Tunis est à 10,18° E dans un fuseau centré sur 15° E : le soleil y passe
  // au zénith une vingtaine de minutes APRÈS midi légal.
  const j = jourDeLAnnee(new Date(Date.UTC(2025, 5, 21)));
  const hs = heureSolaire(12, { longitude: TUNIS.longitude, jour: j });
  assert.ok(hs < 12, 'l’heure solaire est en retard sur l’heure légale à Tunis');
  assert.ok(Math.abs(hs - 12) < 0.5);
  assert.equal(heureSolaire(null, {}), null);
  assert.equal(angleHoraire(12), 0);
  assert.equal(angleHoraire(13), 15);
  assert.equal(angleHoraire(6), -90);
  assert.equal(angleHoraire(null), null);
});

test('LA HAUTEUR DU SOLEIL À MIDI EST CELLE QUE DIT LA GÉOMÉTRIE', () => {
  // Trois valeurs vérifiables au crayon : 90 − latitude ± obliquité.
  const attendu = {
    hiver: 90 - TUNIS.latitude - OBLIQUITE,
    equinoxe: 90 - TUNIS.latitude,
    ete: 90 - TUNIS.latitude + OBLIQUITE,
  };
  for (const [id, cible] of Object.entries(attendu)) {
    const m = midiSolaire({ ...TUNIS, date: dateRepere(id, 2025) });
    assert.ok(Math.abs(m.hauteur - cible) < 0.5,
      `${id} : ${m.hauteur.toFixed(2)}° au lieu de ${cible.toFixed(2)}°`);
    // Et au midi solaire, le soleil est plein sud.
    assert.ok(Math.abs(m.azimut - AZIMUTS.sud) < 1,
      `${id} : azimut ${m.azimut.toFixed(2)}° au midi solaire`);
  }
});

test('LE SOLEIL SE LÈVE À L’EST ET SE COUCHE À L’OUEST', () => {
  // Une erreur de signe ferait tourner toutes les ombres à l'envers : une
  // cheminée gênerait le soir au lieu du matin, et le calcul serait
  // parfaitement présentable.
  const date = dateRepere('equinoxe', 2025);
  const matin = position({ ...TUNIS, date, heure: 8 });
  const soir = position({ ...TUNIS, date, heure: 16 });
  assert.ok(matin.azimut < -40, `le matin, azimut ${matin.azimut} devrait être à l’est`);
  assert.ok(soir.azimut > 40, `le soir, azimut ${soir.azimut} devrait être à l’ouest`);
  // La convention est celle du projet : négatif = est.
  assert.ok(AZIMUTS.est < 0 && AZIMUTS.ouest > 0);
});

test('la durée du jour suit la saison', () => {
  const h = journee({ ...TUNIS, date: dateRepere('hiver', 2025) });
  const e = journee({ ...TUNIS, date: dateRepere('equinoxe', 2025) });
  const s = journee({ ...TUNIS, date: dateRepere('ete', 2025) });
  assert.ok(h.duree > 9 && h.duree < 10, `${h.duree} h en décembre`);
  assert.ok(Math.abs(e.duree - 12) < 0.4, `${e.duree} h à l’équinoxe`);
  assert.ok(s.duree > 14 && s.duree < 15, `${s.duree} h en juin`);
  assert.ok(h.lever > e.lever && e.lever > s.lever, 'on se lève plus tôt en été');
  assert.ok(h.coucher < e.coucher && e.coucher < s.coucher);
});

test('un soleil rasant n’est pas déclaré levé', () => {
  // À un demi-degré au-dessus de l'horizon, il ne projette aucune ombre
  // exploitable. Le dire évite de présenter du bruit comme un résultat.
  const date = dateRepere('hiver', 2025);
  const aube = course({ ...TUNIS, date, pas: 1 / 60 })
    .filter((p) => p.hauteur > 0 && p.hauteur < 3);
  assert.ok(aube.length > 0);
  for (const p of aube) assert.equal(p.leve, false);
  assert.equal(position({ ...TUNIS, date, heure: 2 }).leve, false);
  assert.equal(position({ ...TUNIS, date, heure: 12 }).leve, true);
});

test('LE VECTEUR VERS LE SOLEIL POINTE DU BON CÔTÉ', () => {
  // Repère de la scène : x vers l'est, y vers le nord, z vers le haut.
  const date = dateRepere('equinoxe', 2025);
  const midi = versLeSoleil(midiSolaire({ ...TUNIS, date }));
  assert.ok(midi.y < -0.5, 'à midi le soleil est au sud : y négatif');
  assert.ok(Math.abs(midi.x) < 0.1);
  assert.ok(midi.z > 0.7, 'et haut dans le ciel');

  // Le repère de la scène compte `x` VERS L'EST : le soleil du matin y est
  // donc en x positif. C'est le genre de signe qu'on croit connaître et qu'il
  // faut vérifier, parce qu'à l'envers les ombres du matin tombent le soir.
  const matin = versLeSoleil(position({ ...TUNIS, date, heure: 8 }));
  assert.ok(matin.x > 0.5, `le matin le soleil est à l’est : x = ${matin.x}`);
  const soir = versLeSoleil(position({ ...TUNIS, date, heure: 16 }));
  assert.ok(soir.x < -0.5, `le soir il est à l’ouest : x = ${soir.x}`);
  // Et le vecteur s'accorde avec la descente d'un pan dans `scene3d.js` :
  // un pan plein sud descend vers le sud, le soleil de midi vient du sud.
  assert.ok(matin.y < 0 && soir.y < 0, 'à ces heures le soleil reste au sud');

  // Le vecteur est unitaire — sans quoi les longueurs d'ombre seraient fausses.
  for (const v of [midi, matin, soir]) {
    assert.ok(Math.abs(Math.hypot(v.x, v.y, v.z) - 1) < 1e-9);
  }
  assert.equal(versLeSoleil(null), null);
});

test('un lieu ou une date manquante ne produit pas un faux soleil', () => {
  assert.equal(position({}), null);
  assert.equal(position({ latitude: 36.8 }), null);
  assert.equal(position({ ...TUNIS, heure: null }), null);
  assert.equal(position({ ...TUNIS, date: 'jamais' }), null);
});

test('les trois dates repères disent chacune ce qu’elles montrent', () => {
  assert.equal(DATES.length, 3);
  for (const d of DATES) {
    assert.ok(d.nom && d.aide.length > 30, `${d.id} sans explication`);
    const r = dateRepere(d.id, 2025);
    assert.equal(r.getUTCMonth(), d.mois);
    assert.equal(r.getUTCDate(), d.jourDuMois);
  }
  // Un identifiant inconnu retombe sur le cas moyen, pas sur une exception.
  assert.equal(dateRepere('n’existe pas', 2025).getUTCMonth(), 2);
});

test('la course couvre la journée entière, dans l’ordre', () => {
  const c = course({ ...TUNIS, date: dateRepere('ete', 2025), pas: 0.5 });
  assert.equal(c.length, 49);
  for (let i = 1; i < c.length; i++) assert.ok(c[i].heure > c[i - 1].heure);
  // Le sommet tombe autour du midi solaire, pas à minuit.
  const sommet = c.reduce((a, b) => (a.hauteur >= b.hauteur ? a : b));
  assert.ok(sommet.heure > 11.5 && sommet.heure < 13.5, `sommet à ${sommet.heure} h`);
  assert.equal(FUSEAU_TUNISIE, 1);
});

test('une nuit polaire ne rend pas un lever imaginaire', () => {
  // Personne n'installera de panneaux au Svalbard depuis ce site, mais un
  // calcul qui invente un lever de soleil inventerait aussi une production.
  const j = journee({ latitude: 79, longitude: 15, date: dateRepere('hiver', 2025) });
  assert.equal(j.lever, null);
  assert.equal(j.coucher, null);
  assert.equal(j.duree, 0);
});
