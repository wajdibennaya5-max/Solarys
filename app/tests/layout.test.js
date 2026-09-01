import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/core/layout.js';
import * as geo from '../js/model/geometry.js';

const MOD = {
  id: 'test-550', label: 'Test 550', pmax: 550,
  length: 2.278, width: 1.134,
};
const rect = (w, h) => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
const toiture = (w, h, extra = {}) =>
  ({ outline: rect(w, h), mounting: 'coplanar', tilt: 30, azimuth: 0, obstacles: [], ...extra });

test('empreinte : le portrait monte dans la pente, le paysage la traverse', () => {
  const p = L.moduleFootprint({ module: MOD, orientation: 'portrait', mounting: 'coplanar' });
  assert.equal(p.w, MOD.width);
  assert.equal(p.h, MOD.length);
  const l = L.moduleFootprint({ module: MOD, orientation: 'paysage', mounting: 'coplanar' });
  assert.equal(l.w, MOD.length);
  assert.equal(l.h, MOD.width);
});

test('empreinte : une structure inclinée raccourcit la profondeur au sol', () => {
  const plat = L.moduleFootprint({ module: MOD, orientation: 'portrait', mounting: 'tilted', frameTilt: 0 });
  const incline = L.moduleFootprint({ module: MOD, orientation: 'portrait', mounting: 'tilted', frameTilt: 30 });
  assert.equal(plat.h, MOD.length);
  assert.ok(Math.abs(incline.h - MOD.length * Math.cos(30 * Math.PI / 180)) < 1e-9);
  assert.equal(incline.slopeLength, MOD.length, 'la longueur réelle ne change pas');
});

test('zone utile : la marge de rive réduit le contour', () => {
  const { usable } = L.usableArea(toiture(12, 8), { setback: 0.4 });
  assert.ok(usable);
  assert.ok(Math.abs(geo.area(usable) - 11.2 * 7.2) < 1e-6);
});

test('zone utile : un contour impossible est signalé, pas deviné', () => {
  assert.equal(L.usableArea({ outline: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }, {}).reason, 'outline.tooFewPoints');
  assert.equal(L.usableArea(toiture(2, 2), { setback: 5 }).reason, 'setback.tooLarge');
  const croise = { outline: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }] };
  assert.equal(L.usableArea(croise, { setback: 0.4 }).reason, 'outline.selfIntersecting');
});

test('placement de base : compte, puissance et cohérence des rangées', () => {
  const r = L.placeModules({ surface: toiture(12, 8), module: MOD });
  assert.ok(r.feasible);
  assert.equal(r.count, 27);
  assert.equal(r.orientation, 'portrait');
  assert.equal(r.modules.length, r.count);
  assert.equal(r.perRow.reduce((a, b) => a + b, 0), r.count);
  assert.ok(Math.abs(r.kwp - 27 * 0.55) < 1e-9);
});

test('aucun module ne sort de la zone utile ni n\'en chevauche un autre', () => {
  const r = L.placeModules({ surface: toiture(12, 8), module: MOD });
  for (const m of r.modules) {
    assert.ok(geo.polygonInside(m.polygon, r.usable), `module (${m.x}, ${m.y}) déborde`);
  }
  for (let i = 0; i < r.modules.length; i++) {
    for (let j = i + 1; j < r.modules.length; j++) {
      assert.ok(!geo.convexOverlap(r.modules[i].polygon, r.modules[j].polygon),
        `les modules ${i} et ${j} se chevauchent`);
    }
  }
});

test('le mode automatique retient l\'orientation la plus productive', () => {
  const auto = L.placeModules({ surface: toiture(12, 8), module: MOD });
  const portrait = L.placeModules({ surface: toiture(12, 8), module: MOD, constraints: { orientation: 'portrait' } });
  const paysage = L.placeModules({ surface: toiture(12, 8), module: MOD, constraints: { orientation: 'paysage' } });
  assert.equal(auto.count, Math.max(portrait.count, paysage.count));
});

test('un obstacle retire des modules et aucun ne le recouvre', () => {
  const sans = L.placeModules({ surface: toiture(12, 8), module: MOD });
  const cheminee = { outline: [{ x: 5, y: 3.5 }, { x: 6.2, y: 3.5 }, { x: 6.2, y: 4.7 }, { x: 5, y: 4.7 }] };
  const avec = L.placeModules({ surface: toiture(12, 8, { obstacles: [cheminee] }), module: MOD });
  assert.ok(avec.count < sans.count, 'un obstacle doit coûter des modules');
  for (const m of avec.modules) {
    for (const b of avec.obstacles) {
      assert.ok(!geo.convexOverlap(m.polygon, b), 'un module empiète sur l\'obstacle');
    }
  }
});

test('le dégagement autour d\'un obstacle est respecté', () => {
  const cheminee = { outline: [{ x: 5, y: 3.5 }, { x: 6, y: 3.5 }, { x: 6, y: 4.5 }, { x: 5, y: 4.5 }] };
  const serre = L.placeModules({ surface: toiture(12, 8, { obstacles: [cheminee] }), module: MOD,
    constraints: { obstacleClearance: 0.1 } });
  const large = L.placeModules({ surface: toiture(12, 8, { obstacles: [cheminee] }), module: MOD,
    constraints: { obstacleClearance: 1.5 } });
  assert.ok(large.count < serre.count, 'un dégagement plus large coûte davantage de modules');
});

test('une marge de rive plus grande réduit le nombre de modules', () => {
  const a = L.placeModules({ surface: toiture(12, 8), module: MOD, constraints: { setback: 0.3 } });
  const b = L.placeModules({ surface: toiture(12, 8), module: MOD, constraints: { setback: 1.5 } });
  assert.ok(b.count < a.count);
});

test('toiture en L : le calepinage suit la forme', () => {
  const enL = [{ x: 0, y: 0 }, { x: 14, y: 0 }, { x: 14, y: 6 },
    { x: 6, y: 6 }, { x: 6, y: 12 }, { x: 0, y: 12 }];
  const r = L.placeModules({ surface: { outline: enL, mounting: 'coplanar', tilt: 25, azimuth: 0 }, module: MOD });
  assert.ok(r.count > 0);
  for (const m of r.modules) {
    assert.ok(geo.polygonInside(m.polygon, r.usable), 'un module sort de la forme en L');
  }
});

test('terrasse : l\'entraxe est calculé et le GCR renseigné', () => {
  const r = L.placeModules({
    surface: { outline: rect(30, 20), mounting: 'tilted', azimuth: 0 },
    module: MOD, latitude: 36.8, constraints: { frameTilt: 15 },
  });
  assert.equal(r.mounting, 'tilted');
  assert.equal(r.pitchInfo.source, 'calculé');
  assert.ok(r.rowPitch > MOD.length * Math.cos(15 * Math.PI / 180), 'l\'entraxe dépasse l\'emprise');
  assert.ok(r.gcr > 0 && r.gcr <= 1.1);
});

test('toiture inclinée : pas de GCR, la notion n\'a pas de sens', () => {
  const r = L.placeModules({ surface: toiture(12, 8), module: MOD });
  assert.equal(r.gcr, null);
});

test('plus la latitude est haute, moins il tient de modules en terrasse', () => {
  const terrasse = { outline: rect(30, 20), mounting: 'tilted', azimuth: 0 };
  const tunis = L.placeModules({ surface: terrasse, module: MOD, latitude: 36.8 });
  const berlin = L.placeModules({ surface: terrasse, module: MOD, latitude: 52.5 });
  assert.ok(berlin.count < tunis.count, `Tunis ${tunis.count}, Berlin ${berlin.count}`);
  assert.ok(berlin.rowPitch > tunis.rowPitch);
});

test('un entraxe imposé plus serré fait entrer plus de modules', () => {
  const terrasse = { outline: rect(30, 20), mounting: 'tilted', azimuth: 0 };
  const serre = L.placeModules({ surface: terrasse, module: MOD, latitude: 36.8, pitch: 3 });
  const large = L.placeModules({ surface: terrasse, module: MOD, latitude: 36.8, pitch: 5 });
  assert.ok(serre.count > large.count);
  assert.equal(serre.pitchInfo.source, 'imposé');
  assert.ok(serre.gcr > large.gcr);
});

test('une surface trop petite ne produit aucun module, sans planter', () => {
  const r = L.placeModules({ surface: toiture(1, 1), module: MOD });
  assert.equal(r.count, 0);
  assert.equal(r.feasible, false);
  assert.ok(r.issues.some((i) => i.code === 'layout.empty' || i.code === 'setback.tooLarge'));
});

test('la surface de modules ne dépasse jamais la zone utile', () => {
  for (const [w, h] of [[12, 8], [30, 20], [6, 4], [25, 9]]) {
    const r = L.placeModules({ surface: toiture(w, h), module: MOD });
    assert.ok(r.moduleAreaM2 <= r.usableAreaM2 + 1e-6,
      `${w}×${h} : ${r.moduleAreaM2} m² de modules pour ${r.usableAreaM2} m² utiles`);
    assert.ok(r.fillRatio <= 1 + 1e-9);
  }
});
