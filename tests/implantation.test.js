import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pointDansPolygone, rectangleDansPolygone, retirerRive, implanter,
  airePolygone, eleverModules, distanceAuBord,
} from '../js/implantation.js';
import { RIVE, JEU, MODULE } from '../js/calepinage.js';
import { eleverToit } from '../js/scene3d.js';
import { MODULES } from '../js/materiel.js';

const carre = (L, P) => [
  { x: -L / 2, y: -P / 2 }, { x: L / 2, y: -P / 2 },
  { x: L / 2, y: P / 2 }, { x: -L / 2, y: P / 2 },
];
/** Un toit en L : 12 m de large, avec une aile de 6 m qui remonte. */
const enL = [
  { x: -6, y: -5 }, { x: 6, y: -5 }, { x: 6, y: 1 },
  { x: 0, y: 1 }, { x: 0, y: 5 }, { x: -6, y: 5 },
];

test('un point est dedans ou dehors, sans hésitation', () => {
  const c = carre(10, 8);
  assert.equal(pointDansPolygone({ x: 0, y: 0 }, c), true);
  assert.equal(pointDansPolygone({ x: 4.9, y: 3.9 }, c), true);
  assert.equal(pointDansPolygone({ x: 6, y: 0 }, c), false);
  assert.equal(pointDansPolygone({ x: 0, y: -9 }, c), false);
  assert.equal(pointDansPolygone({ x: 0, y: 0 }, []), false);
  // Le creux d'un L est bien dehors.
  assert.equal(pointDansPolygone({ x: 3, y: 3 }, enL), false);
  assert.equal(pointDansPolygone({ x: -3, y: 3 }, enL), true);
});

test('UN MODULE NE PEUT PAS ENJAMBER LE CREUX D’UN TOIT EN L', () => {
  // Les quatre coins dedans ne suffisent pas : sur un L, un rectangle peut
  // enjamber le creux, coins compris, et se retrouver posé sur le vide.
  const enjambe = [{ x: -5, y: 0.5 }, { x: 5, y: 0.5 },
    { x: 5, y: 4 }, { x: -5, y: 4 }];
  assert.equal(enjambe.every((p) => pointDansPolygone(p, enL)), false);
  // Un cas plus retors : tous les coins dedans, un côté qui coupe.
  const retors = [{ x: -1, y: 0.5 }, { x: -0.5, y: 0.5 },
    { x: -0.5, y: 4 }, { x: -1, y: 4 }];
  assert.equal(rectangleDansPolygone(retors, enL), true, 'celui-ci tient vraiment');
  const traverse = [{ x: -1, y: 0.5 }, { x: 1, y: 0.5 }, { x: 1, y: 4 }, { x: -1, y: 4 }];
  assert.equal(traverse.every((p) => pointDansPolygone(p, enL)), false);
  assert.equal(rectangleDansPolygone(traverse, enL), false);
});

test('LE RETRAIT DE RIVE RECULE BIEN DE LA DISTANCE DEMANDÉE', () => {
  // Un module posé au ras du bord s'arrache au premier coup de vent. Si le
  // retrait se trompe de facteur, la rive n'est pas celle qu'on annonce.
  const r = retirerRive(carre(10, 8), 0.35);
  assert.equal(r.length, 4);
  for (const p of r) {
    assert.ok(Math.abs(Math.abs(p.x) - 4.65) < 1e-9, `x=${p.x}`);
    assert.ok(Math.abs(Math.abs(p.y) - 3.65) < 1e-9, `y=${p.y}`);
  }
  // Le sens de parcours ne doit rien changer.
  const inverse = retirerRive([...carre(10, 8)].reverse(), 0.35);
  assert.ok(Math.abs(Math.abs(inverse[0].x) - 4.65) < 1e-9);
  // Un retrait nul ne bouge rien.
  assert.deepEqual(retirerRive(carre(10, 8), 0), carre(10, 8));
});

test('UN RETRAIT PLUS GRAND QUE LE PAN NE RETOURNE PAS LE POLYGONE', () => {
  // Sans ce contrôle, le contour se retourne et l'aire redevient positive :
  // un pan de 2 m annoncerait une surface posable, à l'envers.
  // Le cas qui trompait le contrôle par l'aire : les quatre coins basculent
  // ensemble et le carré ressort PLUS GRAND, du bon signe.
  // Le carré de 2 m rétréci de 3 m redonnait un carré de 4 m, PLUS GRAND que
  // l'original et du bon sens de parcours : un demi-tour conserve l'orientation.
  assert.deepEqual(retirerRive(carre(2, 2), 3), []);
  // Rétréci de 1,5 m il redonnait un carré de 1 m — plus petit ET contenu dans
  // l'original. Les deux contrôles évidents passaient tous les deux.
  assert.deepEqual(retirerRive(carre(2, 2), 1.5), []);
  assert.deepEqual(retirerRive(carre(1, 1), 0.5), []);
  // Sous la limite, le retrait reste valable et rétrécit bien.
  for (const d of [0.2, 0.4, 0.9]) {
    const juste = retirerRive(carre(2, 2), d);
    assert.equal(juste.length, 4, `retrait ${d} refusé à tort`);
    assert.ok(airePolygone(juste) < 4 && airePolygone(juste) > 0);
    // Et chaque sommet est bien à `d` du bord : c'est ce qu'on a demandé.
    for (const q of juste) {
      assert.ok(Math.abs(distanceAuBord(q, carre(2, 2)) - d) < 1e-9, `sommet à la mauvaise distance`);
    }
  }
  assert.deepEqual(retirerRive(carre(10, 8).slice(0, 2), 0.35), []);
  const p = implanter(carre(1.5, 1.5), { rive: RIVE });
  assert.equal(p.nombre, 0);
  assert.match(p.raison, /retrait de rive|trop petit|Aucun module/);
});

test('LA PENTE FAIT ENTRER PLUS DE MODULES, PAS MOINS', () => {
  // Un rampant est plus long que son ombre au sol : poser la grille sur
  // l'emprise ferait croire qu'il rentre 15 % de modules en moins.
  const plat = implanter(carre(10, 8), { pente: 0, azimut: 0 });
  const incline = implanter(carre(10, 8), { pente: 30, azimut: 0 });
  assert.ok(incline.nombre > plat.nombre,
    `${incline.nombre} devrait dépasser ${plat.nombre}`);
  assert.ok(incline.surfaceRampant > plat.surfaceRampant);
  // Et la surface de rampant suit bien le cosinus.
  assert.ok(Math.abs(incline.surfaceRampant - 80 / Math.cos(Math.PI / 6)) < 0.01);
});

test('LA GRILLE SUIT L’ORIENTATION DU PAN', () => {
  // La dilatation due à la pente s'applique dans le sens de la pente. Un pan
  // orienté au sud la subit sur la profondeur, un pan orienté à l'est sur la
  // largeur : la grille n'est donc pas la même, même quand le compte tombe
  // juste par hasard.
  const sud = implanter(carre(12, 6), { pente: 25, azimut: 0 });
  const est = implanter(carre(12, 6), { pente: 25, azimut: -90 });
  assert.ok(sud.nombre > 0 && est.nombre > 0);
  const empreinte = (p) => p.modules
    .map((m) => `${m.centre.x.toFixed(2)},${m.centre.y.toFixed(2)}`).sort().join('|');
  assert.notEqual(empreinte(sud), empreinte(est), 'les deux grilles sont identiques');
  // Le rampant, lui, est le même : c'est la même toiture vue autrement.
  assert.ok(Math.abs(sud.surfaceRampant - est.surfaceRampant) < 1e-9);
});

test('UN TOIT EN L PORTE MOINS DE MODULES QUE SON RECTANGLE ENGLOBANT', () => {
  // C'est toute la raison d'être de ce fichier : `calepinage.js` remplit un
  // rectangle, et sur un L cela pose des modules dans le vide.
  const L = implanter(enL, { pente: 20, azimut: 0 });
  const englobant = implanter(carre(12, 10), { pente: 20, azimut: 0 });
  assert.ok(L.nombre > 0, 'un L doit quand même porter des modules');
  assert.ok(L.nombre < englobant.nombre,
    `${L.nombre} modules sur le L contre ${englobant.nombre} sur le rectangle`);
  // Et aucun module ne dépasse du contour.
  const zone = retirerRive(enL, L.rive);
  for (const m of L.modules) {
    assert.ok(rectangleDansPolygone(m.coins, zone), 'un module déborde du pan');
  }
});

test('la puissance suit le module choisi, pas un module supposé', () => {
  const grand = MODULES.reduce((a, b) => (a.puissance >= b.puissance ? a : b));
  const p = implanter(carre(12, 9), { module: grand, pente: 20 });
  assert.equal(p.module, grand);
  assert.ok(Math.abs(p.puissance - p.nombre * grand.puissance / 1000) < 0.02);
  // Sans module précisé, on retombe sur la référence du calepinage.
  const defaut = implanter(carre(12, 9), { pente: 20 });
  assert.ok(Math.abs(defaut.puissance - defaut.nombre * MODULE.puissance) < 0.02);
});

test('une pose imposée est respectée, et son coût est dit', () => {
  const auto = implanter(carre(12, 9), { pose: 'auto', pente: 20 });
  const portrait = implanter(carre(12, 9), { pose: 'portrait', pente: 20 });
  const paysage = implanter(carre(12, 9), { pose: 'paysage', pente: 20 });
  assert.equal(portrait.orientation, 'portrait');
  assert.equal(paysage.orientation, 'paysage');
  assert.equal(auto.nombre, Math.max(portrait.nombre, paysage.nombre));
  // L'alternative dit ce que l'autre pose aurait donné.
  assert.equal(portrait.alternative, paysage.nombre);
  assert.equal(paysage.alternative, portrait.nombre);
  assert.equal(auto.alternative, null);
});

test('un pan qui ne porte rien dit pourquoi', () => {
  for (const mauvais of [null, [], [{ x: 0, y: 0 }], carre(1, 1)]) {
    const p = implanter(mauvais);
    assert.equal(p.nombre, 0);
    assert.deepEqual(p.modules, []);
    assert.equal(p.puissance, 0);
    assert.ok(p.raison && p.raison.length > 25, `refus sans explication : ${p.raison}`);
  }
});

test('les compteurs se recoupent', () => {
  const p = implanter(carre(14, 11), { pente: 25, azimut: 0 });
  assert.ok(p.nombre > 10);
  const M = MODULE;
  assert.ok(Math.abs(p.surfaceUtilisee - p.nombre * M.largeur * M.hauteur) < 1e-9);
  assert.ok(Math.abs(p.surfaceRestante - (p.surfaceRampant - p.surfaceUtilisee)) < 1e-9);
  assert.ok(Math.abs(p.tauxOccupation - p.surfaceUtilisee / p.surfaceRampant) < 1e-12);
  assert.ok(p.tauxOccupation > 0 && p.tauxOccupation < 1, 'un taux au-dessus de 1 est absurde');
  assert.equal(p.jeu, JEU);
});

test('l’aire d’un polygone ne dépend pas du sens de parcours', () => {
  assert.ok(Math.abs(airePolygone(carre(10, 8)) - 80) < 1e-9);
  assert.ok(Math.abs(airePolygone([...carre(10, 8)].reverse()) - 80) < 1e-9);
  // Le L : 12×6 + 6×4 = 96
  assert.ok(Math.abs(airePolygone(enL) - 96) < 1e-9);
  assert.equal(airePolygone([]), 0);
});

test('LES MODULES SE POSENT SUR LE RAMPANT, PAS SUR LE SOL', () => {
  // Posés à plat, ils traverseraient le bâtiment.
  const contour = carre(10, 8);
  const toit = eleverToit(contour, { pente: 30, azimut: 0, hauteurMur: 3 });
  const plan = implanter(contour, { pente: 30, azimut: 0 });
  const faces = eleverModules(plan, toit);
  assert.equal(faces.length, plan.nombre);
  for (const f of faces) {
    assert.equal(f.role, 'module');
    for (const p of f.sommets) {
      assert.ok(p.z > toit.hauteurMin, `module sous l’égout : ${p.z}`);
      assert.ok(p.z <= toit.hauteurMax + 0.1, `module au-dessus du faîtage : ${p.z}`);
    }
  }
  // Un module côté faîtage est plus haut qu'un module côté égout.
  const hauteurs = faces.map((f) => f.sommets[0].z);
  assert.ok(Math.max(...hauteurs) - Math.min(...hauteurs) > 1, 'le champ est plat');
  // Sur une terrasse, tous les modules sont à la même hauteur.
  const plat = eleverModules(implanter(contour, { pente: 0 }),
    eleverToit(contour, { pente: 0, hauteurMur: 3 }));
  const zPlat = plat.map((f) => f.sommets[0].z);
  assert.ok(Math.max(...zPlat) - Math.min(...zPlat) < 1e-9);
});

test('élever des modules sans toit ne lève pas', () => {
  assert.deepEqual(eleverModules(null, null), []);
  assert.deepEqual(eleverModules({ modules: [] }, { sommets: [] }), []);
  assert.deepEqual(eleverModules(implanter(carre(10, 8)), { sommets: [] }), []);
});
