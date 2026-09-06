import test from 'node:test';
import assert from 'node:assert/strict';
import {
  camera, projeter, VUES, ELEVATION_MIN, ELEVATION_MAX, distancePourCadrer,
  eleverToit, construireScene, trierParProfondeur, eclairement, faceVisible,
  rendre, normaliser, produitScalaire, LUMIERE,
} from '../js/scene3d.js';
import { AZIMUTS } from '../js/pvgis/parametres.js';

/** Une emprise de 10 m est-ouest sur 8 m nord-sud, centrée sur l'origine. */
const EMPRISE = [{ x: -5, y: -4 }, { x: 5, y: -4 }, { x: 5, y: 4 }, { x: -5, y: 4 }];
const [SO, SE, NE, NO] = [0, 1, 2, 3];

test('UN PAN PLEIN SUD DESCEND VERS LE SUD', () => {
  // DÉFAUT CORRIGÉ : signes inversés, le toit montait du côté ensoleillé. Une
  // image parfaitement nette d'un bâtiment à l'envers, que rien ne signalait.
  const t = eleverToit(EMPRISE, { pente: 30, azimut: AZIMUTS.sud, hauteurMur: 3 });
  assert.ok(Math.abs(t.sommets[SO].z - 3) < 0.01, 'l’angle sud-ouest est à l’égout');
  assert.ok(Math.abs(t.sommets[SE].z - 3) < 0.01, 'l’angle sud-est est à l’égout');
  assert.ok(t.sommets[NE].z > 7 && t.sommets[NO].z > 7, 'le faîtage est au nord');
  // 8 m de profondeur à 30° : 8 × tan(30°) = 4,62 m de dénivelé.
  assert.ok(Math.abs((t.sommets[NE].z - t.sommets[SE].z) - 4.619) < 0.01);
});

test('les quatre orientations descendent chacune du bon côté', () => {
  const bas = (az) => {
    const t = eleverToit(EMPRISE, { pente: 30, azimut: az, hauteurMur: 3 });
    return t.sommets.map((s, i) => ({ i, z: s.z }))
      .filter((s) => s.z < 3.01).map((s) => s.i).sort().join(',');
  };
  assert.equal(bas(AZIMUTS.sud), `${SO},${SE}`);
  assert.equal(bas(AZIMUTS.nord), `${NE},${NO}`);
  assert.equal(bas(AZIMUTS.est), `${SE},${NE}`);
  assert.equal(bas(AZIMUTS.ouest), `${SO},${NO}`);
});

test('LA NORMALE DU TOIT REGARDE LÀ OÙ LE PAN REGARDE', () => {
  // Si la normale et la pente se contredisent, l'éclairage montre un toit
  // orienté au nord sur un bâtiment orienté au sud.
  const sud = eleverToit(EMPRISE, { pente: 30, azimut: AZIMUTS.sud }).normale;
  assert.ok(sud.y < -0.4, 'la normale d’un pan sud pointe vers le sud');
  assert.ok(Math.abs(sud.x) < 1e-9);
  const est = eleverToit(EMPRISE, { pente: 30, azimut: AZIMUTS.est }).normale;
  assert.ok(est.x > 0.4, 'la normale d’un pan est pointe vers l’est');
  // Une terrasse regarde le ciel, quelle que soit l'orientation déclarée.
  for (const az of Object.values(AZIMUTS)) {
    const plat = eleverToit(EMPRISE, { pente: 0, azimut: az }).normale;
    assert.ok(Math.abs(plat.z - 1) < 1e-9, `azimut ${az} : une terrasse doit regarder en haut`);
  }
});

test('une terrasse plate est plate', () => {
  const t = eleverToit(EMPRISE, { pente: 0, azimut: 0, hauteurMur: 3.2 });
  for (const s of t.sommets) assert.ok(Math.abs(s.z - 3.2) < 1e-9);
  assert.equal(t.hauteurMax, t.hauteurMin);
});

test('une pente absurde ne produit pas un bâtiment absurde', () => {
  // À 90° le toit devient un mur et la hauteur file à l'infini.
  const t = eleverToit(EMPRISE, { pente: 89.99, azimut: 0, hauteurMur: 3 });
  assert.ok(Number.isFinite(t.hauteurMax));
  assert.ok(t.hauteurMax < 100, `${t.hauteurMax} m est une tour, pas une maison`);
  assert.equal(eleverToit(EMPRISE, { pente: null }).hauteurMax,
    eleverToit(EMPRISE, { pente: 0 }).hauteurMax);
});

test('moins de trois points ne font pas un toit', () => {
  for (const rien of [null, [], [{ x: 0, y: 0 }], [{ x: 0, y: 0 }, { x: 1, y: 1 }]]) {
    const t = eleverToit(rien, { pente: 30 });
    assert.deepEqual(t.sommets, []);
    assert.equal(t.hauteurMax, 0);
    assert.deepEqual(construireScene(rien).faces, []);
  }
});

test('la scène porte un terrain, un mur par côté et une toiture', () => {
  const s = construireScene(EMPRISE, { pente: 30, azimut: 0, hauteurMur: 3 });
  const roles = s.faces.map((f) => f.role);
  assert.equal(roles.filter((r) => r === 'terrain').length, 1);
  assert.equal(roles.filter((r) => r === 'mur').length, 4);
  assert.equal(roles.filter((r) => r === 'toit').length, 1);
  // Chaque face se nomme : l'interface doit pouvoir les allumer une à une.
  for (const f of s.faces) assert.ok(f.nom && f.nom.length > 2, `face sans nom : ${f.role}`);
  assert.ok(s.rayon > 5 && s.rayon < 40);
  assert.equal(construireScene(EMPRISE, { terrain: false }).faces
    .filter((f) => f.role === 'terrain').length, 0);
});

test('les murs montent du sol jusqu’au toit, sans trou ni dépassement', () => {
  const s = construireScene(EMPRISE, { pente: 30, azimut: 0, hauteurMur: 3 });
  const murs = s.faces.filter((f) => f.role === 'mur');
  const toit = s.faces.find((f) => f.role === 'toit');
  for (const m of murs) {
    assert.equal(m.sommets.filter((p) => p.z === 0).length, 2, 'un mur touche le sol');
    // Le haut de chaque mur doit coïncider avec un sommet du toit.
    for (const haut of m.sommets.filter((p) => p.z > 0)) {
      const colle = toit.sommets.some((t) => Math.abs(t.x - haut.x) < 1e-9
        && Math.abs(t.y - haut.y) < 1e-9 && Math.abs(t.z - haut.z) < 1e-9);
      assert.ok(colle, 'un mur dépasse ou n’atteint pas le toit');
    }
  }
});

test('LA CAMÉRA REGARDE DEPUIS L’AZIMUT DEMANDÉ', () => {
  // Convention du projet : 0 = depuis le sud. Une caméra qui prendrait 0 pour
  // le nord montrerait la façade arrière en la nommant « façade sud ».
  const sud = camera({ azimut: 0, elevation: 20, distance: 30 });
  assert.ok(sud.oeil.y < -25, 'regarder « depuis le sud » place l’œil au sud');
  assert.ok(Math.abs(sud.oeil.x) < 1e-9);
  const est = camera({ azimut: AZIMUTS.est, elevation: 20, distance: 30 });
  assert.ok(est.oeil.x < -25, 'regarder « depuis l’est » place l’œil à l’est');
  const nord = camera({ azimut: AZIMUTS.nord, elevation: 20, distance: 30 });
  assert.ok(nord.oeil.y > 25);
});

test('la caméra ne bascule jamais à la verticale exacte', () => {
  // À 90° pile, le repère s'effondre : la scène disparaîtrait sans message.
  const haut = camera({ elevation: 90 });
  assert.ok(haut.elevation <= ELEVATION_MAX);
  assert.ok(Number.isFinite(haut.droite.x + haut.droite.y + haut.droite.z));
  assert.ok(Math.hypot(haut.droite.x, haut.droite.y, haut.droite.z) > 0.9);
  assert.equal(camera({ elevation: -50 }).elevation, ELEVATION_MIN);
  assert.ok(camera({ distance: -10 }).distance >= 1);
});

test('le repère de la caméra reste orthonormé', () => {
  for (const az of [-180, -45, 0, 37, 90, 180]) {
    for (const el of [3, 35, 89]) {
      const c = camera({ azimut: az, elevation: el, distance: 25 });
      for (const v of [c.avant, c.droite, c.haut]) {
        assert.ok(Math.abs(Math.hypot(v.x, v.y, v.z) - 1) < 1e-9, `norme ${az}/${el}`);
      }
      assert.ok(Math.abs(produitScalaire(c.avant, c.droite)) < 1e-9);
      assert.ok(Math.abs(produitScalaire(c.avant, c.haut)) < 1e-9);
      assert.ok(Math.abs(produitScalaire(c.droite, c.haut)) < 1e-9);
    }
  }
});

test('la cible se projette au centre de l’écran', () => {
  const c = camera({ azimut: -45, elevation: 30, distance: 40, cible: { x: 2, y: 3, z: 1 } });
  const p = projeter({ x: 2, y: 3, z: 1 }, c, { largeur: 600, hauteur: 400 });
  assert.ok(p.visible);
  assert.ok(Math.abs(p.x - 300) < 1e-6);
  assert.ok(Math.abs(p.y - 200) < 1e-6);
  assert.ok(Math.abs(p.profondeur - 40) < 1e-6);
});

test('UN POINT DERRIÈRE L’ŒIL N’EST PAS DESSINÉ À L’ENVERS', () => {
  // Sans ce garde-fou, un point derrière la caméra se projette en miroir et
  // dessine un bâtiment retourné, sans le moindre message.
  const c = camera({ azimut: 0, elevation: 10, distance: 20 });
  const derriere = { x: c.oeil.x, y: c.oeil.y - 10, z: c.oeil.z };
  const p = projeter(derriere, c, { largeur: 600, hauteur: 400 });
  assert.equal(p.visible, false);
  assert.ok(p.profondeur <= 0);
});

test('ce qui est plus haut à l’écran est plus haut dans le monde', () => {
  const c = camera({ azimut: 0, elevation: 15, distance: 40 });
  const bas = projeter({ x: 0, y: 0, z: 0 }, c, { largeur: 600, hauteur: 400 });
  const haut = projeter({ x: 0, y: 0, z: 5 }, c, { largeur: 600, hauteur: 400 });
  assert.ok(haut.y < bas.y, 'l’axe écran descend, le monde monte');
});

test('les faces se peignent de la plus lointaine à la plus proche', () => {
  const s = construireScene(EMPRISE, { pente: 30, azimut: 0, hauteurMur: 3 });
  const c = camera({ azimut: -45, elevation: 35, distance: 50, cible: s.centre });
  const ordre = trierParProfondeur(s.faces, c);
  for (let i = 1; i < ordre.length; i++) {
    assert.ok(ordre[i - 1].profondeur >= ordre[i].profondeur, 'ordre du peintre rompu');
  }
});

test('les faces qui tournent le dos sont écartées', () => {
  const s = construireScene(EMPRISE, { pente: 30, azimut: 0, hauteurMur: 3 });
  const c = camera({ azimut: 0, elevation: 20, distance: 50, cible: s.centre });
  const murs = s.faces.filter((f) => f.role === 'mur');
  const devant = murs.filter((m) => faceVisible(m, c));
  assert.ok(devant.length > 0 && devant.length < murs.length,
    'on ne garde ni tous les murs ni aucun');
  const peintes = rendre(s, c, { largeur: 600, hauteur: 400 });
  assert.ok(peintes.length >= 3);
  assert.ok(peintes.some((f) => f.role === 'toit'));
});

test('L’ÉCLAIREMENT EST UN DÉGRADÉ, PAS UNE ÉTUDE D’OMBRAGE', () => {
  // Il ne dépend d'aucune date, d'aucune heure et d'aucun obstacle. Le
  // confondre avec un calcul solaire ferait croire à une simulation.
  const e = eclairement({ x: 0, y: 0, z: 1 });
  assert.ok(e > 0.35 && e <= 1);
  // Le plancher évite qu'une face devienne un trou noir sans arêtes.
  const dos = eclairement({ x: -LUMIERE.x, y: -LUMIERE.y, z: -LUMIERE.z });
  assert.ok(Math.abs(dos - 0.35) < 1e-9);
  assert.equal(eclairement(null), 1);
  // Une face tournée vers la lumière est la plus claire de toutes.
  assert.ok(Math.abs(eclairement(LUMIERE) - 1) < 1e-9);
  assert.ok(Math.abs(Math.hypot(LUMIERE.x, LUMIERE.y, LUMIERE.z) - 1) < 1e-9);
});

test('chaque point de vue proposé a un nom et une raison', () => {
  for (const [id, v] of Object.entries(VUES)) {
    assert.ok(v.nom, `${id} sans nom`);
    assert.ok(v.aide && v.aide.length > 15, `${id} sans explication`);
    assert.ok(v.elevation >= ELEVATION_MIN && v.elevation <= ELEVATION_MAX,
      `${id} : élévation hors bornes`);
  }
  assert.equal(VUES.sud.azimut, AZIMUTS.sud);
  assert.equal(VUES.nord.azimut, AZIMUTS.nord);
  assert.equal(VUES.est.azimut, AZIMUTS.est);
  assert.equal(VUES.ouest.azimut, AZIMUTS.ouest);
});

test('le cadrage automatique fait tenir la scène dans le champ', () => {
  const s = construireScene(EMPRISE, { pente: 30, azimut: 0, hauteurMur: 3 });
  const d = distancePourCadrer(s.rayon);
  const c = camera({ azimut: -45, elevation: 35, distance: d, cible: s.centre });
  const peintes = rendre(s, c, { largeur: 800, hauteur: 600 });
  const tous = peintes.flatMap((f) => f.points);
  assert.ok(tous.length > 0);
  for (const p of tous) {
    assert.ok(p.x > -400 && p.x < 1200, `x=${p.x} très hors champ`);
    assert.ok(p.y > -300 && p.y < 900, `y=${p.y} très hors champ`);
  }
  // La toiture, elle, doit rester entièrement visible.
  for (const p of peintes.find((f) => f.role === 'toit').points) {
    assert.ok(p.x >= 0 && p.x <= 800, `toit hors cadre en x : ${p.x}`);
    assert.ok(p.y >= 0 && p.y <= 600, `toit hors cadre en y : ${p.y}`);
  }
});

test('normaliser ne divise pas par zéro', () => {
  assert.deepEqual(normaliser({ x: 0, y: 0, z: 0 }), { x: 0, y: 0, z: 0 });
  const n = normaliser({ x: 3, y: 4, z: 0 });
  assert.ok(Math.abs(Math.hypot(n.x, n.y, n.z) - 1) < 1e-12);
});
