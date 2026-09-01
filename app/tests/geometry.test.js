import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../js/model/geometry.js';

const carre = (c = 10) => [{ x: 0, y: 0 }, { x: c, y: 0 }, { x: c, y: c }, { x: 0, y: c }];
const proche = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;

test('aire et sens de parcours', () => {
  assert.equal(g.area(carre()), 100);
  assert.ok(g.isCounterClockwise(carre()));
  assert.ok(!g.isCounterClockwise(carre().reverse()));
  // L'aire ne dépend pas du sens de parcours.
  assert.equal(g.area(carre().reverse()), 100);
  assert.ok(g.isCounterClockwise(g.toCounterClockwise(carre().reverse())));
});

test('aire d\'un triangle et d\'une forme en L', () => {
  assert.equal(g.area([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }]), 6);
  // L de 10×10 amputé du rectangle x∈[4,10] y∈[6,10], soit 6×4 = 24 : 100 − 24 = 76
  const enL = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 },
    { x: 4, y: 6 }, { x: 4, y: 10 }, { x: 0, y: 10 }];
  assert.equal(g.area(enL), 76);
});

test('centre de gravité et rectangle englobant', () => {
  const c = g.centroid(carre());
  assert.ok(proche(c.x, 5) && proche(c.y, 5));
  const b = g.bbox(carre());
  assert.deepEqual([b.minX, b.minY, b.maxX, b.maxY, b.width, b.height], [0, 0, 10, 10, 10, 10]);
  assert.equal(g.perimeter(carre()), 40);
});

test('appartenance d\'un point, bord compris', () => {
  const c = carre();
  assert.ok(g.pointInPolygon({ x: 5, y: 5 }, c));
  assert.ok(g.pointInPolygon({ x: 0, y: 5 }, c), 'un point sur le bord est intérieur');
  assert.ok(g.pointInPolygon({ x: 0, y: 0 }, c), 'un sommet est intérieur');
  assert.ok(!g.pointInPolygon({ x: -0.01, y: 5 }, c));
  assert.ok(!g.pointInPolygon({ x: 15, y: 5 }, c));
});

test('appartenance dans une concavité', () => {
  const enL = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 },
    { x: 4, y: 6 }, { x: 4, y: 10 }, { x: 0, y: 10 }];
  assert.ok(g.pointInPolygon({ x: 2, y: 8 }, enL), 'dans la branche verticale');
  assert.ok(g.pointInPolygon({ x: 8, y: 3 }, enL), 'dans la branche horizontale');
  assert.ok(!g.pointInPolygon({ x: 8, y: 8 }, enL), 'dans l\'échancrure');
});

test('rotation et translation', () => {
  const r = g.rotate([{ x: 1, y: 0 }], Math.PI / 2)[0];
  assert.ok(proche(r.x, 0) && proche(r.y, 1));
  const t = g.translate(carre(), 3, -2);
  assert.deepEqual(t[0], { x: 3, y: -2 });
  // Une rotation conserve l'aire.
  assert.ok(proche(g.area(g.rotate(carre(), 0.7, { x: 5, y: 5 })), 100));
});

test('rectangle : aire et rotation autour de son coin', () => {
  const r = g.rectangle(0, 0, 2.278, 1.134);
  assert.ok(proche(g.area(r), 2.278 * 1.134));
  const tourne = g.rectangle(0, 0, 2.278, 1.134, Math.PI / 2);
  assert.ok(proche(g.area(tourne), 2.278 * 1.134));
  assert.ok(proche(tourne[0].x, 0) && proche(tourne[0].y, 0), 'le coin reste en place');
});

test('recouvrement de deux rectangles', () => {
  const a = g.rectangle(0, 0, 2, 1);
  assert.ok(g.convexOverlap(a, g.rectangle(1, 0.5, 2, 1)), 'chevauchement partiel');
  assert.ok(g.convexOverlap(a, g.rectangle(0.5, 0.2, 0.2, 0.2)), 'inclusion complète');
  assert.ok(!g.convexOverlap(a, g.rectangle(3, 0, 2, 1)), 'disjoints');
  assert.ok(!g.convexOverlap(a, g.rectangle(2, 0, 2, 1)), 'arêtes jointives, pas de recouvrement');
});

test('un module posé bord à bord ne recouvre pas son voisin', () => {
  // Deux modules 2,278 × 1,134 séparés de 2 cm : c'est le cas normal du calepinage.
  const m1 = g.rectangle(0, 0, 1.134, 2.278);
  const m2 = g.rectangle(1.154, 0, 1.134, 2.278);
  assert.ok(!g.convexOverlap(m1, m2));
});

test('inclusion d\'un polygone dans un autre', () => {
  const c = carre();
  assert.ok(g.polygonInside(g.rectangle(1, 1, 2, 2), c));
  assert.ok(g.polygonInside(g.rectangle(0, 0, 10, 10), c), 'à cheval sur le bord, mais dedans');
  assert.ok(!g.polygonInside(g.rectangle(9, 9, 3, 3), c), 'déborde');
  assert.ok(!g.polygonInside(g.rectangle(20, 20, 1, 1), c), 'entièrement dehors');
});

test('un rectangle qui enjambe une concavité est refusé', () => {
  const enL = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 },
    { x: 4, y: 6 }, { x: 4, y: 10 }, { x: 0, y: 10 }];
  // Ses quatre sommets sont dans le L, mais il traverse l'échancrure.
  assert.ok(!g.polygonInside(g.rectangle(1, 5, 8, 2), enL));
});

test('retrait de rive sur un carré', () => {
  const r = g.insetPolygon(carre(10), 1);
  assert.ok(r, 'le retrait doit aboutir');
  assert.ok(proche(g.area(r), 64), `aire obtenue ${g.area(r)}`);
  const b = g.bbox(r);
  assert.ok(proche(b.minX, 1) && proche(b.maxX, 9));
});

test('retrait de rive sur un triangle', () => {
  const t = [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 0, y: 9 }];
  const r = g.insetPolygon(t, 0.5);
  assert.ok(r);
  assert.ok(g.area(r) < g.area(t));
  assert.ok(g.polygonInside(r, t), 'le contour retiré reste dans la toiture');
});

test('un retrait trop grand est refusé plutôt que faux', () => {
  assert.equal(g.insetPolygon(carre(2), 5), null);
  assert.equal(g.insetPolygon(carre(2), 1), null, 'le retrait consomme toute la surface');
});

test('retrait nul et agrandissement', () => {
  assert.deepEqual(g.insetPolygon(carre(), 0), carre());
  const grand = g.insetPolygon(carre(10), -1);
  assert.ok(proche(g.area(grand), 144), `aire obtenue ${g.area(grand)}`);
});

test('détection de contour croisé', () => {
  assert.ok(!g.isSelfIntersecting(carre()));
  // Un « nœud papillon ».
  assert.ok(g.isSelfIntersecting([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }]));
});

test('intersection de segments et de droites', () => {
  assert.ok(g.segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }));
  assert.ok(!g.segmentsIntersect({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 5, y: 5 }, { x: 6, y: 6 }));
  const p = g.lineIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 3, y: -1 }, { x: 3, y: 1 });
  assert.ok(proche(p.x, 3) && proche(p.y, 0));
  assert.equal(g.lineIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }), null);
});
