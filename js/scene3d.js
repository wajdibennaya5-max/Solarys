/**
 * LA SCÈNE EN TROIS DIMENSIONS : géométrie et caméra, rien d'autre.
 *
 * POURQUOI CE FICHIER EXISTE. Le projet montrait un toit vu du dessus. Cela
 * suffit à mesurer une surface ; cela ne suffit pas à voir un toit. Une pente,
 * un débord, un mur mitoyen plus haut : rien de tout cela ne se lit à plat, et
 * c'est pourtant là que se décide l'implantation.
 *
 * POURQUOI PAS UNE BIBLIOTHÈQUE 3D. Le projet n'embarque aucune dépendance
 * JavaScript, et un test le vérifie. Une scène de quelques dizaines de faces
 * n'a pas besoin d'un moteur : une matrice de vue, une projection, un tri par
 * profondeur. Trois formules, testables sans navigateur.
 *
 * CE QUE CE FICHIER NE FAIT PAS. Il ne dessine rien — c'est le rôle de la vue.
 * Il ne calcule aucune ombre : un éclairage sert ici à rendre les volumes
 * lisibles, et **une teinte de face n'est pas une étude d'ombrage**. Le jour où
 * ce projet calculera des ombres, ce sera à partir de la position réelle du
 * soleil, et cela s'appellera autrement.
 *
 * REPÈRE. `x` vers l'est, `y` vers le nord, `z` vers le haut. Mètres partout.
 */

/** Un nombre, ou rien. `Number(null)` vaut zéro, et zéro n'est pas « rien ». */
function nb(v) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const rad = (d) => (Number(d) || 0) * Math.PI / 180;

export const soustraire = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const produitVectoriel = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const produitScalaire = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export function normaliser(v) {
  const n = Math.hypot(v.x, v.y, v.z);
  return n === 0 ? { x: 0, y: 0, z: 0 } : { x: v.x / n, y: v.y / n, z: v.z / n };
}

/* ------------------------------------------------------------------ */
/* La caméra                                                           */
/* ------------------------------------------------------------------ */

/**
 * Les points de vue qu'un professionnel demande, et leur raison d'être.
 *
 * `azimut` suit la convention du projet — **0 = plein sud**, comme partout
 * ailleurs ici. C'est la direction depuis laquelle on regarde.
 */
export const VUES = {
  isometrique: { nom: 'Isométrique', azimut: -45, elevation: 35,
    aide: 'La vue qui montre à la fois les pans et les hauteurs.' },
  dessus: { nom: 'Dessus', azimut: 0, elevation: 89.9,
    aide: 'Le plan de calepinage : les surfaces s’y lisent sans déformation.' },
  sud: { nom: 'Façade sud', azimut: 0, elevation: 6,
    aide: 'La façade la plus ensoleillée en Tunisie.' },
  nord: { nom: 'Façade nord', azimut: 180, elevation: 6, aide: 'La façade opposée au soleil.' },
  est: { nom: 'Façade est', azimut: -90, elevation: 6, aide: 'Ce que voit le soleil du matin.' },
  ouest: { nom: 'Façade ouest', azimut: 90, elevation: 6,
    aide: 'Ce que voit le soleil du soir.' },
};

/** L'élévation reste sous la verticale : à 90° pile, le repère s'effondre. */
export const ELEVATION_MIN = 2;
export const ELEVATION_MAX = 89.9;

const borner = (v, min, max) => Math.min(max, Math.max(min, v));

/**
 * Une caméra en orbite autour d'une cible.
 *
 * @param {object} o
 * @param {number} o.azimut d'où l'on regarde, 0 = depuis le sud
 * @param {number} o.elevation hauteur de l'œil, en degrés au-dessus du sol
 * @param {number} o.distance en mètres
 * @param {{x,y,z}} [o.cible]
 */
export function camera({ azimut = -45, elevation = 35, distance = 40,
  cible = { x: 0, y: 0, z: 0 } } = {}) {
  const az = nb(azimut) ?? -45;
  const el = borner(nb(elevation) ?? 35, ELEVATION_MIN, ELEVATION_MAX);
  const d = Math.max(1, nb(distance) ?? 40);

  // L'azimut du projet compte depuis le sud ; le repère compte depuis l'est.
  // La conversion tient en une ligne, et c'est la seule du fichier : la
  // dupliquer ailleurs finirait par en oublier une.
  const theta = rad(az) + Math.PI / 2;
  const phi = rad(el);

  const oeil = {
    x: cible.x - Math.cos(phi) * Math.cos(theta) * d,
    y: cible.y - Math.cos(phi) * Math.sin(theta) * d,
    z: cible.z + Math.sin(phi) * d,
  };

  const avant = normaliser(soustraire(cible, oeil));
  // Le « haut » du monde est z. La droite de la caméra en découle, puis son
  // propre haut : c'est le repère orthonormé classique d'un regard.
  const droite = normaliser(produitVectoriel(avant, { x: 0, y: 0, z: 1 }));
  const haut = produitVectoriel(droite, avant);

  return { oeil, cible, avant, droite, haut, azimut: az, elevation: el, distance: d };
}

/**
 * Projette un point du monde sur l'écran.
 *
 * Projection perspective : c'est elle qui donne la profondeur qu'une vue
 * orthographique refuse, et qui permet de juger d'un coup d'œil qu'un mur est
 * devant et non derrière.
 *
 * @returns {{x:number, y:number, profondeur:number, visible:boolean}}
 *   `visible` faux derrière la caméra — un point derrière l'œil se projetterait
 *   à l'envers, et dessinerait un bâtiment retourné sans le moindre message.
 */
export function projeter(point, cam, { largeur, hauteur, champ = 45 } = {}) {
  const v = soustraire(point, cam.oeil);
  const profondeur = produitScalaire(v, cam.avant);
  const L = Math.max(1, nb(largeur) ?? 1);
  const H = Math.max(1, nb(hauteur) ?? 1);
  if (profondeur <= 0.01) {
    return { x: 0, y: 0, profondeur, visible: false };
  }
  const echelle = (H / 2) / Math.tan(rad(champ) / 2);
  return {
    x: L / 2 + (produitScalaire(v, cam.droite) * echelle) / profondeur,
    y: H / 2 - (produitScalaire(v, cam.haut) * echelle) / profondeur,
    profondeur,
    visible: true,
  };
}

/** La distance qui cadre une scène de `rayon` mètres dans le champ donné. */
export const distancePourCadrer = (rayon, champ = 45) =>
  Math.max(6, (Math.max(1, rayon) / Math.tan(rad(champ) / 2)) * 1.35);

/* ------------------------------------------------------------------ */
/* Le bâtiment                                                         */
/* ------------------------------------------------------------------ */

/**
 * Élève un toit à partir de son emprise au sol.
 *
 * LE MODÈLE, ET SES LIMITES ANNONCÉES. Un seul pan incliné, d'une seule pente,
 * d'une seule orientation. C'est exactement le toit que le reste du projet
 * calcule : le gisement, le calepinage et l'étude ne connaissent qu'une pente
 * et qu'un azimut. Représenter ici une toiture à quatre pans que le calcul
 * ignore donnerait une belle image et une étude fausse.
 *
 * La hauteur de chaque sommet vient de sa position le long de la ligne de plus
 * grande pente : le point le plus haut est du côté opposé à l'azimut du pan,
 * puisqu'un pan orienté au sud descend vers le sud.
 *
 * @param {Array<{x:number,y:number}>} emprise en mètres, repère local
 * @param {object} o
 * @param {number} o.pente en degrés, 0 pour une terrasse
 * @param {number} o.azimut orientation du pan, 0 = plein sud
 * @param {number} o.hauteurMur hauteur du point bas du toit
 */
export function eleverToit(emprise, { pente = 0, azimut = 0, hauteurMur = 3 } = {}) {
  const pts = (emprise ?? []).filter((p) => nb(p?.x) !== null && nb(p?.y) !== null);
  if (pts.length < 3) return { sommets: [], faitage: null, egout: null, hauteurMax: 0 };

  const p = borner(nb(pente) ?? 0, 0, 80);
  const h0 = Math.max(0, nb(hauteurMur) ?? 3);
  // La direction vers laquelle le pan descend, dans le repère du monde.
  //
  // L'azimut du projet compte depuis le sud ; un cap de boussole compte depuis
  // le nord. `azimut + 180` fait la conversion, et le vecteur d'un cap `b` est
  // `{sin b, cos b}`. Signes inversés, le toit montait vers le sud : un pan
  // plein sud se retrouvait haut du côté ensoleillé, c'est-à-dire à l'envers.
  const theta = rad((nb(azimut) ?? 0) + 180);
  const descente = { x: Math.sin(theta), y: Math.cos(theta) };

  const projections = pts.map((q) => q.x * descente.x + q.y * descente.y);
  const bas = Math.max(...projections);
  const tan = Math.tan(rad(p));

  const sommets = pts.map((q, i) => ({
    x: q.x,
    y: q.y,
    // `bas - projection` vaut zéro à l'égout et croît vers le faîtage.
    z: h0 + (bas - projections[i]) * tan,
  }));

  const hauteurs = sommets.map((s) => s.z);
  return {
    sommets,
    hauteurMur: h0,
    hauteurMax: Math.max(...hauteurs),
    hauteurMin: Math.min(...hauteurs),
    pente: p,
    azimut: nb(azimut) ?? 0,
    // La normale du pan : elle sert à l'éclairage, et rien d'autre.
    normale: normaliser({
      x: Math.sin(theta) * Math.sin(rad(p)),
      y: Math.cos(theta) * Math.sin(rad(p)),
      z: Math.cos(rad(p)),
    }),
  };
}

/**
 * Assemble la scène : terrain, murs, toit.
 *
 * Chaque face porte son rôle et son nom pour que l'interface puisse les
 * allumer et les éteindre une à une — et pour qu'un clic sache sur quoi il
 * tombe.
 */
export function construireScene(emprise, {
  pente = 0, azimut = 0, hauteurMur = 3, terrain = true,
} = {}) {
  const toit = eleverToit(emprise, { pente, azimut, hauteurMur });
  if (!toit.sommets.length) return { faces: [], toit, rayon: 1, centre: { x: 0, y: 0, z: 0 } };

  const faces = [];
  const n = toit.sommets.length;

  if (terrain) {
    // Un terrain qui déborde un peu : sans lui le bâtiment flotte et l'œil ne
    // sait plus où est le sol.
    //
    // Le débord suit l'emprise plutôt qu'un rayon : un carré calé sur la
    // demi-diagonale d'un bâtiment allongé faisait quatre fois sa surface et
    // mangeait tout le cadre, réduisant le bâtiment à une vignette.
    const xs = toit.sommets.map((s) => s.x);
    const ys = toit.sommets.map((s) => s.y);
    const marge = Math.max(2, Math.min(6,
      0.18 * Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))));
    faces.push({
      role: 'terrain',
      nom: 'Terrain',
      sommets: [
        { x: Math.min(...xs) - marge, y: Math.min(...ys) - marge, z: 0 },
        { x: Math.max(...xs) + marge, y: Math.min(...ys) - marge, z: 0 },
        { x: Math.max(...xs) + marge, y: Math.max(...ys) + marge, z: 0 },
        { x: Math.min(...xs) - marge, y: Math.max(...ys) + marge, z: 0 },
      ],
      normale: { x: 0, y: 0, z: 1 },
    });
  }

  for (let i = 0; i < n; i++) {
    const a = toit.sommets[i];
    const b = toit.sommets[(i + 1) % n];
    faces.push({
      role: 'mur',
      nom: `Mur ${i + 1}`,
      index: i,
      sommets: [
        { x: a.x, y: a.y, z: 0 },
        { x: b.x, y: b.y, z: 0 },
        { x: b.x, y: b.y, z: b.z },
        { x: a.x, y: a.y, z: a.z },
      ],
      normale: normaliser(produitVectoriel(
        { x: b.x - a.x, y: b.y - a.y, z: 0 },
        { x: 0, y: 0, z: 1 },
      )),
    });
  }

  faces.push({
    role: 'toit',
    nom: 'Toiture',
    sommets: toit.sommets.map((s) => ({ ...s })),
    normale: toit.normale,
  });

  const tous = faces.flatMap((f) => f.sommets);
  const centre = {
    x: (Math.min(...tous.map((p) => p.x)) + Math.max(...tous.map((p) => p.x))) / 2,
    y: (Math.min(...tous.map((p) => p.y)) + Math.max(...tous.map((p) => p.y))) / 2,
    z: (Math.min(...tous.map((p) => p.z)) + Math.max(...tous.map((p) => p.z))) / 2,
  };
  const rayon = Math.max(...tous.map((p) => Math.hypot(p.x - centre.x, p.y - centre.y,
    p.z - centre.z)));

  return { faces, toit, centre, rayon: Math.max(1, rayon) };
}

/* ------------------------------------------------------------------ */
/* Le rendu : ordre et lisibilité                                      */
/* ------------------------------------------------------------------ */

/**
 * Ordonne les faces de la plus lointaine à la plus proche.
 *
 * L'algorithme du peintre. Il se trompe sur des faces qui s'interpénètrent —
 * ce que des murs et un toit ne font pas. Choisir la simplicité qui suffit
 * plutôt que la rigueur qui ne sert pas.
 */
export function trierParProfondeur(faces, cam) {
  return [...(faces ?? [])]
    .map((f) => {
      const pts = f.sommets;
      const c = {
        x: pts.reduce((t, p) => t + p.x, 0) / pts.length,
        y: pts.reduce((t, p) => t + p.y, 0) / pts.length,
        z: pts.reduce((t, p) => t + p.z, 0) / pts.length,
      };
      return { ...f, profondeur: produitScalaire(soustraire(c, cam.oeil), cam.avant) };
    })
    .sort((a, b) => b.profondeur - a.profondeur);
}

/**
 * L'éclairement d'une face, entre 0,35 et 1.
 *
 * CE QUE CE N'EST PAS : une étude d'ombrage. Cette valeur ne dépend d'aucune
 * date, d'aucune heure et d'aucun obstacle — c'est une lumière fixe, choisie
 * pour que l'œil distingue un mur d'un toit. Le confondre avec un calcul
 * solaire ferait croire à une simulation là où il n'y a qu'un dégradé.
 *
 * Le plancher à 0,35 n'est pas décoratif : une face plongée à zéro devient un
 * trou noir dans lequel on ne voit plus les arêtes.
 */
export const LUMIERE = normaliser({ x: -0.4, y: -0.5, z: 0.76 });

export function eclairement(normale) {
  if (!normale) return 1;
  return 0.35 + 0.65 * Math.max(0, produitScalaire(normaliser(normale), LUMIERE));
}

/**
 * Une face tourne-t-elle le dos à la caméra ?
 *
 * L'écarter évite de peindre l'intérieur des murs par-dessus l'extérieur, et
 * divise par deux le travail de rendu.
 */
export function faceVisible(face, cam) {
  if (!face?.normale) return true;
  const c = face.sommets[0];
  return produitScalaire(face.normale, soustraire(c, cam.oeil)) < 0;
}

/**
 * Toute la scène, projetée et prête à peindre.
 *
 * La vue n'a plus qu'à tracer des polygones dans l'ordre reçu : aucune
 * décision de géométrie ne lui reste.
 */
export function rendre(scene, cam, { largeur, hauteur, champ = 45,
  masquerDos = true } = {}) {
  const visibles = (scene?.faces ?? []).filter((f) =>
    !masquerDos || f.role === 'toit' || f.role === 'terrain' || faceVisible(f, cam));
  return trierParProfondeur(visibles, cam)
    .map((f) => {
      const points = f.sommets.map((p) => projeter(p, cam, { largeur, hauteur, champ }));
      return {
        ...f,
        points,
        // Une face dont un seul sommet passe derrière l'œil se déforme
        // n'importe comment : on ne la dessine pas plutôt que de dessiner faux.
        tracable: points.every((p) => p.visible),
        eclairement: eclairement(f.normale),
      };
    })
    .filter((f) => f.tracable);
}

/**
 * LE CADRAGE AUTOMATIQUE, mesuré plutôt que deviné.
 *
 * `distancePourCadrer` raisonne sur la sphère qui englobe la scène. C'est sûr
 * — rien ne dépasse jamais — et c'est trop large : le terrain déborde de
 * plusieurs mètres, la hauteur du faîtage gonfle le rayon, et le bâtiment se
 * retrouve minuscule au milieu d'un grand vide.
 *
 * Ici on projette réellement la scène et on ajuste le recul pour qu'elle
 * occupe la part de l'écran demandée. La projection perspective n'étant pas
 * tout à fait linéaire en distance, deux ou trois passes suffisent à
 * converger — et le résultat est un cadrage qu'on n'a pas eu à régler à la
 * main.
 *
 * @returns {number} la distance retenue, jamais inférieure au rayon : la
 *   caméra ne doit pas entrer dans le bâtiment.
 */
export function ajusterDistance(scene, { azimut, elevation, largeur, hauteur,
  champ = 45, remplissage = 0.82, passes = 4 } = {}) {
  if (!scene?.faces?.length) return 40;
  let d = distancePourCadrer(scene.rayon, champ);
  const L = Math.max(1, nb(largeur) ?? 1);
  const H = Math.max(1, nb(hauteur) ?? 1);

  for (let i = 0; i < passes; i++) {
    const cam = camera({ azimut, elevation, distance: d, cible: scene.centre });
    let demiLargeur = 0;
    let demiHauteur = 0;
    let tousVisibles = true;
    // On cadre sur le BÂTIMENT, pas sur le sol. Le terrain est un repère de
    // lecture : qu'il déborde un peu du cadre ne gêne personne, alors qu'un
    // bâtiment réduit à une vignette au milieu d'une pelouse, oui.
    const aCadrer = scene.faces.filter((f) => f.role !== 'terrain');
    for (const f of (aCadrer.length ? aCadrer : scene.faces)) {
      for (const p of f.sommets) {
        const q = projeter(p, cam, { largeur: L, hauteur: H, champ });
        if (!q.visible) { tousVisibles = false; continue; }
        demiLargeur = Math.max(demiLargeur, Math.abs(q.x - L / 2));
        demiHauteur = Math.max(demiHauteur, Math.abs(q.y - H / 2));
      }
    }
    // Un sommet passé derrière l'œil veut dire qu'on est trop près : on
    // recule franchement plutôt que de calculer sur une mesure fausse.
    if (!tousVisibles) { d *= 1.6; continue; }
    if (demiLargeur <= 0 || demiHauteur <= 0) break;
    const facteur = Math.max(demiLargeur / (L / 2 * remplissage),
      demiHauteur / (H / 2 * remplissage));
    if (Math.abs(facteur - 1) < 0.02) break;
    d *= facteur;
  }
  return Math.max(scene.rayon * 1.05, d);
}
