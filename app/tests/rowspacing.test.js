import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as rs from '../js/core/rowspacing.js';

const TUNIS = { lat: 36.8, ghi: [2.55, 3.45, 4.65, 5.75, 6.60, 7.25, 7.35, 6.60, 5.25, 3.90, 2.80, 2.30] };
const L = 2.278;
const proche = (a, b, tol) => Math.abs(a - b) < tol;

test('hauteur solaire : maximale à midi, nulle au lever', () => {
  const midi = rs.solarElevation(36.8, 172, 12);
  assert.ok(midi > 70 && midi < 80, `${midi}°`);
  assert.ok(rs.solarElevation(36.8, 172, 12) > rs.solarElevation(36.8, 172, 9));
  assert.ok(rs.solarElevation(36.8, 355, 12) < rs.solarElevation(36.8, 172, 12),
    'le soleil est plus bas en hiver');
  assert.ok(rs.solarElevation(36.8, 355, 2) < 0, 'nuit');
});

test('azimut solaire : Sud à midi, Est le matin, Ouest le soir', () => {
  assert.ok(proche(rs.solarAzimuth(36.8, 355, 12), 0, 0.5), 'plein Sud à midi solaire');
  assert.ok(rs.solarAzimuth(36.8, 355, 9) < -20, 'à l\'Est le matin');
  assert.ok(rs.solarAzimuth(36.8, 355, 15) > 20, 'à l\'Ouest le soir');
});

test('solstice d\'hiver selon l\'hémisphère', () => {
  assert.equal(rs.winterSolsticeDay(36.8), 355);
  assert.equal(rs.winterSolsticeDay(-33.9), 172);
});

test('entraxe : plus le soleil est bas, plus il faut d\'espace', () => {
  const haut = rs.rowPitch({ moduleLength: L, tilt: 20, sunElevation: 40 });
  const bas = rs.rowPitch({ moduleLength: L, tilt: 20, sunElevation: 15 });
  assert.ok(bas.pitch > haut.pitch);
  // Emprise et hauteur ne dépendent que de l'inclinaison.
  assert.ok(proche(haut.footprint, L * Math.cos(20 * Math.PI / 180), 1e-9));
  assert.ok(proche(haut.height, L * Math.sin(20 * Math.PI / 180), 1e-9));
});

test('entraxe : plus les modules sont inclinés, plus il faut d\'espace', () => {
  const a = rs.recommendedPitch({ latitude: 36.8, moduleLength: L, tilt: 10 });
  const b = rs.recommendedPitch({ latitude: 36.8, moduleLength: L, tilt: 30 });
  assert.ok(b.pitch > a.pitch);
  assert.ok(b.gcr < a.gcr, 'et le champ occupe moins densément le sol');
});

test('entraxe : plus la latitude est haute, plus il faut d\'espace', () => {
  const dakar = rs.recommendedPitch({ latitude: 14.7, moduleLength: L, tilt: 20 });
  const berlin = rs.recommendedPitch({ latitude: 52.5, moduleLength: L, tilt: 20 });
  assert.ok(berlin.pitch > dakar.pitch * 1.5, `Dakar ${dakar.pitch}, Berlin ${berlin.pitch}`);
});

test('hémisphère sud : les rangées regardent le Nord', () => {
  const sud = rs.recommendedPitch({ latitude: -33.9, moduleLength: L, tilt: 20 });
  assert.equal(sud.azimuth, 180);
  assert.ok(sud.feasible);
  assert.ok(sud.pitch > sud.footprint, 'et l\'entraxe reste exploitable');
});

test('l\'entraxe ne descend jamais sous l\'emprise au sol', () => {
  const r = rs.rowPitch({ moduleLength: L, tilt: 30, sunElevation: 80, sunAzimuthOffset: 85 });
  assert.ok(r.pitch >= r.footprint - 1e-9);
});

test('angle limite d\'ombrage', () => {
  // Rangées jointives : ombrées dès que le soleil n'est pas au zénith.
  assert.equal(rs.shadingLimitAngle({ moduleLength: L, tilt: 20, pitch: L * Math.cos(20 * Math.PI / 180) }), 90);
  // Modules à plat : jamais d'ombre mutuelle.
  assert.equal(rs.shadingLimitAngle({ moduleLength: L, tilt: 0, pitch: 3 }), 0);
  // Plus l'entraxe est large, plus l'angle limite est bas.
  const serre = rs.shadingLimitAngle({ moduleLength: L, tilt: 20, pitch: 3 });
  const large = rs.shadingLimitAngle({ moduleLength: L, tilt: 20, pitch: 6 });
  assert.ok(large < serre);
});

test('angle de profil : égal à la hauteur quand le soleil est dans l\'axe', () => {
  assert.ok(proche(rs.profileAngle(30, 0), 30, 1e-9));
  // Hors axe, l'angle de profil est plus grand que la hauteur.
  assert.ok(rs.profileAngle(30, 45) > 30);
  assert.equal(rs.profileAngle(-5, 0), null, 'soleil couché');
  assert.equal(rs.profileAngle(30, 120), null, 'soleil derrière le champ');
});

test('cohérence croisée : l\'angle limite retrouve l\'angle de profil de référence', () => {
  // Deux chemins de calcul indépendants doivent donner le même angle.
  const p = rs.recommendedPitch({ latitude: 36.8, moduleLength: L, tilt: 20 });
  const limite = rs.shadingLimitAngle({ moduleLength: L, tilt: 20, pitch: p.pitch });
  const profil = rs.profileAngle(p.elevation, p.sunAzimuthOffset);
  assert.ok(proche(limite, profil, 0.05), `limite ${limite}° vs profil ${profil}°`);
});

test('pertes d\'ombrage : faibles à l\'entraxe recommandé, quel que soit le tilt', () => {
  for (const tilt of [10, 20, 30]) {
    const p = rs.recommendedPitch({ latitude: TUNIS.lat, moduleLength: L, tilt });
    const m = rs.mutualShadingLoss({
      latitude: TUNIS.lat, monthlyGhi: TUNIS.ghi, tilt, pitch: p.pitch, moduleLength: L,
    });
    assert.ok(m.loss < 0.015, `à ${tilt}° la perte vaut ${(m.loss * 100).toFixed(2)} %`);
  }
});

test('pertes d\'ombrage : croissent quand on resserre les rangées', () => {
  const perte = (pitch) => rs.mutualShadingLoss({
    latitude: TUNIS.lat, monthlyGhi: TUNIS.ghi, tilt: 20, pitch, moduleLength: L,
  }).loss;
  const serie = [6, 5, 4, 3.5, 3, 2.6].map(perte);
  for (let i = 1; i < serie.length; i++) {
    assert.ok(serie[i] > serie[i - 1],
      `resserrer devrait coûter davantage : ${serie[i - 1]} puis ${serie[i]}`);
  }
  assert.ok(serie.at(-1) > 0.1, 'des rangées très serrées coûtent cher');
});

test('modules à plat : aucune perte d\'ombrage mutuel', () => {
  const m = rs.mutualShadingLoss({
    latitude: TUNIS.lat, monthlyGhi: TUNIS.ghi, tilt: 0, pitch: 3, moduleLength: L,
  });
  assert.equal(m.loss, 0);
});

test('le détail mensuel se recompose en total annuel', () => {
  const m = rs.mutualShadingLoss({
    latitude: TUNIS.lat, monthlyGhi: TUNIS.ghi, tilt: 20, pitch: 3, moduleLength: L,
  });
  assert.equal(m.months.length, 12);
  const poa = m.months.reduce((s, x) => s + x.poa, 0);
  const perdu = m.months.reduce((s, x) => s + x.lost, 0);
  assert.ok(proche(perdu / poa, m.loss, 1e-9));
  // L'hiver est plus pénalisé que l'été.
  assert.ok(m.months[11].loss > m.months[5].loss, 'décembre doit souffrir plus que juin');
});

test('nombre de rangées dans une profondeur donnée', () => {
  // Emprise 2 m, entraxe 4 m : la dernière rangée n'a besoin que de son emprise.
  assert.deepEqual(rs.rowsInDepth({ depth: 10, pitch: 4, footprint: 2 }).rows, 3);
  assert.equal(rs.rowsInDepth({ depth: 2, pitch: 4, footprint: 2 }).rows, 1);
  assert.equal(rs.rowsInDepth({ depth: 1.5, pitch: 4, footprint: 2 }).rows, 0);
  const r = rs.rowsInDepth({ depth: 10, pitch: 4, footprint: 2 });
  assert.equal(r.usedDepth, 10);
});
