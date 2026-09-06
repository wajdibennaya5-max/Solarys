import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TAILLE, ZOOM_MIN, ZOOM_MAX, lonVersX, latVersY, xVersLon, yVersLat,
  metresParPixel, echelle, fenetre, pointSousPixel, pixelDuPoint, glisser,
  bornerZoom,
} from '../js/carte/tuiles.js';
import {
  FONDS, definirFond, fondActif, disponible, adresseTuile, hotesAAutoriser, capacites,
} from '../js/carte/fonds.js';

const TUNIS = { latitude: 36.8065, longitude: 10.1815 };

test('la projection revient exactement sur ses pas', () => {
  // C'est cette réversibilité qui rendra un toit dessiné à l'écran mesurable
  // en mètres. Une dérive ici se traduirait en mètres carrés faux.
  for (const z of [3, 10, 15, 18, 20]) {
    for (const [lat, lon] of [[36.8065, 10.1815], [33.88, 10.1], [37.27, 9.87], [0, 0]]) {
      assert.ok(Math.abs(yVersLat(latVersY(lat, z), z) - lat) < 1e-9, `lat z=${z}`);
      assert.ok(Math.abs(xVersLon(lonVersX(lon, z), z) - lon) < 1e-9, `lon z=${z}`);
    }
  }
});

test('les repères connus de la projection Mercator sont respectés', () => {
  // Au zoom 0 le monde tient dans une tuile : le méridien de Greenwich et
  // l'équateur tombent au milieu.
  assert.equal(lonVersX(0, 0), 0.5);
  assert.ok(Math.abs(latVersY(0, 0) - 0.5) < 1e-12);
  assert.equal(lonVersX(-180, 0), 0);
  assert.ok(Math.abs(lonVersX(180, 0) - 1) < 1e-12);
});

test('UN PIXEL NE VAUT PAS LE MÊME NOMBRE DE MÈTRES SELON LA LATITUDE', () => {
  // L'oublier gonflerait la Tunisie de vingt pour cent : Mercator étire les
  // hautes latitudes, et c'est précisément le piège des mesures sur carte.
  const equateur = metresParPixel(0, 18);
  const tunis = metresParPixel(36.8065, 18);
  assert.ok(tunis < equateur);
  assert.ok(Math.abs(tunis / equateur - Math.cos(36.8065 * Math.PI / 180)) < 1e-9);
  // Ordre de grandeur attendu au zoom des toitures : le demi-mètre.
  assert.ok(tunis > 0.4 && tunis < 0.55, `${tunis} m/px inattendu`);
});

test('doubler le zoom divise l’échelle par deux', () => {
  for (let z = 4; z <= 19; z++) {
    assert.ok(Math.abs(metresParPixel(36.8, z) / metresParPixel(36.8, z + 1) - 2) < 1e-9);
  }
});

test('l’échelle graphique annonce une longueur ronde et vérifiable', () => {
  const e = echelle(36.8065, 18, 120);
  assert.ok([1, 2, 5, 10, 20, 50, 100].includes(e.metres), `${e.metres} n’est pas rond`);
  assert.ok(e.pixels <= 120, 'la barre déborde de la place annoncée');
  // La barre doit mesurer ce qu'elle dit : c'est tout son intérêt.
  assert.ok(Math.abs(e.pixels * metresParPixel(36.8065, 18) - e.metres) < 1e-6);
  assert.equal(echelle(36.8065, 10, 120).texte.endsWith('km'), true);
});

test('la fenêtre couvre tout l’écran, sans trou ni tuile inutile', () => {
  const vue = { ...TUNIS, zoom: 18, largeur: 600, hauteur: 400 };
  const { tuiles } = fenetre(vue);
  assert.ok(tuiles.length >= 6 && tuiles.length <= 15, `${tuiles.length} tuiles`);
  for (const t of tuiles) {
    // Chaque tuile doit intersecter la fenêtre, sinon on la charge pour rien.
    assert.ok(t.gauche + TAILLE > 0 && t.gauche < 600, `tuile hors champ en x`);
    assert.ok(t.haut + TAILLE > 0 && t.haut < 400, `tuile hors champ en y`);
    assert.ok(Number.isInteger(t.x) && t.x >= 0 && t.x < 2 ** 18);
    assert.ok(Number.isInteger(t.y) && t.y >= 0 && t.y < 2 ** 18);
  }
  // Aucun trou : les quatre coins de la fenêtre sont couverts.
  for (const [px, py] of [[0, 0], [599, 0], [0, 399], [599, 399], [300, 200]]) {
    const couvre = tuiles.some((t) => px >= t.gauche && px < t.gauche + TAILLE
      && py >= t.haut && py < t.haut + TAILLE);
    assert.ok(couvre, `pixel ${px},${py} non couvert`);
  }
});

test('le centre de la fenêtre est bien le point demandé', () => {
  const vue = { ...TUNIS, zoom: 19, largeur: 640, hauteur: 480 };
  const p = pointSousPixel(vue, 320, 240);
  assert.ok(Math.abs(p.latitude - TUNIS.latitude) < 1e-9);
  assert.ok(Math.abs(p.longitude - TUNIS.longitude) < 1e-9);
  const px = pixelDuPoint(vue, TUNIS);
  assert.ok(Math.abs(px.x - 320) < 1e-6 && Math.abs(px.y - 240) < 1e-6);
});

test('un pixel converti en point puis reconverti retombe au même pixel', () => {
  const vue = { ...TUNIS, zoom: 18, largeur: 600, hauteur: 400 };
  for (const [x, y] of [[0, 0], [123, 45], [599, 399], [300, 12]]) {
    const r = pixelDuPoint(vue, pointSousPixel(vue, x, y));
    assert.ok(Math.abs(r.x - x) < 1e-6 && Math.abs(r.y - y) < 1e-6, `${x},${y}`);
  }
});

test('glisser de N pixels déplace la carte de N pixels, pas d’un autre nombre', () => {
  const vue = { ...TUNIS, zoom: 18 };
  const apres = glisser(vue, 100, 0);
  const vueApres = { ...apres, zoom: 18, largeur: 600, hauteur: 400 };
  // Le point qui était au centre se retrouve 100 px à droite.
  const px = pixelDuPoint(vueApres, TUNIS);
  assert.ok(Math.abs(px.x - 400) < 1e-6, `x = ${px.x}`);
  assert.ok(Math.abs(px.y - 200) < 1e-6);
});

test('le zoom reste dans les bornes où il existe des images', () => {
  assert.equal(bornerZoom(99), ZOOM_MAX);
  assert.equal(bornerZoom(0), ZOOM_MIN);
  assert.equal(bornerZoom(null), ZOOM_MIN);
  assert.equal(bornerZoom('18'), 18);
  const { zoom } = fenetre({ ...TUNIS, zoom: 40, largeur: 100, hauteur: 100 });
  assert.equal(zoom, ZOOM_MAX);
});

test('AUCUN FOND N’EST ACTIF SANS DÉCLARATION EXPLICITE', () => {
  // Le projet n'engage personne auprès d'un fournisseur tant que la page ne
  // l'a pas écrit noir sur blanc.
  definirFond(null);
  assert.equal(disponible(), false);
  assert.equal(fondActif(), null);
  assert.equal(adresseTuile({ x: 1, y: 1, z: 1 }), null);
  assert.deepEqual(hotesAAutoriser(), []);
  const c = capacites();
  assert.equal(c.image, false);
  assert.equal(c.toiture, false);
  assert.match(c.phrase, /Aucun fond/);
});

test('chaque fond connu porte son attribution et ses conditions', () => {
  for (const [id, f] of Object.entries(FONDS)) {
    assert.equal(f.id, id);
    assert.ok(f.attribution && f.attribution.length > 5, `${id} sans attribution`);
    assert.ok(f.conditions, `${id} sans conditions`);
    assert.ok(f.modele.startsWith('https://'), `${id} en clair`);
    assert.ok(['plan', 'aerien'].includes(f.nature));
    assert.ok(f.hote && !f.hote.includes('/'), `${id} : hôte mal formé`);
  }
});

test('UN PLAN N’AUTORISE PAS À DESSINER UN TOIT', () => {
  // Dessiner un pan de toiture sur un plan de rues reviendrait à mesurer une
  // maison qu'on ne voit pas.
  definirFond('osm');
  assert.equal(capacites().image, true);
  assert.equal(capacites().toiture, false);
  definirFond('esri-imagerie');
  assert.equal(capacites().toiture, true);
  // Même sur photo, la mesure reste une estimation, et la phrase le dit.
  assert.match(capacites().phrase, /estimation|confirmer sur site/);
});

test('une adresse de tuile est composée, jamais devinée', () => {
  definirFond('esri-imagerie');
  const a = adresseTuile({ x: 138484, y: 102209, z: 18 });
  assert.ok(a.includes('/18/102209/138484'), `ordre z/y/x non respecté : ${a}`);
  definirFond('osm');
  assert.ok(adresseTuile({ x: 138484, y: 102209, z: 18 }).endsWith('/18/138484/102209.png'));
  // Au-delà du zoom couvert, il n'y a pas d'image : on ne demande rien.
  assert.equal(adresseTuile({ x: 1, y: 1, z: 22 }), null);
  assert.equal(adresseTuile({ x: NaN, y: 1, z: 18 }), null);
});

test('un fond personnalisé sans attribution est refusé', () => {
  assert.equal(definirFond({ modele: 'https://x.tld/{z}/{x}/{y}.png' }), null);
  assert.equal(definirFond({ attribution: 'moi' }), null);
  // En clair, jamais : la page est servie en HTTPS.
  assert.equal(definirFond({ modele: 'http://x.tld/{z}/{x}/{y}.png', attribution: 'moi' }), null);
  // Sans les trois variables, l'adresse ne désigne aucune tuile.
  assert.equal(definirFond({ modele: 'https://x.tld/{z}/{x}.png', attribution: 'moi' }), null);
  const bon = definirFond({ modele: 'https://tuiles.exemple.tn/{z}/{x}/{y}.jpg',
    attribution: 'Service interne', nature: 'aerien' });
  assert.equal(bon.hote, 'tuiles.exemple.tn');
  assert.deepEqual(hotesAAutoriser(), ['tuiles.exemple.tn']);
  assert.equal(capacites().toiture, true);
  definirFond(null);
});
