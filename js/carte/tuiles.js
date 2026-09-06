/**
 * LA GÉOMÉTRIE D'UNE CARTE GLISSANTE, sans aucune dépendance.
 *
 * POURQUOI PAS UNE BIBLIOTHÈQUE. Le projet n'embarque aucune dépendance
 * JavaScript, et un test le vérifie. Une carte interactive tient pourtant en
 * quelques dizaines de lignes : la projection de Mercator sphérique est une
 * formule, pas un moteur. L'écrire ici la rend testable sans navigateur et
 * sans réseau — ce qui compte davantage, car c'est cette géométrie qui donnera
 * plus tard l'échelle du toit, donc les mètres carrés, donc les kilowatts.
 *
 * Convention : identique à celle de toutes les cartes en tuiles (« XYZ »).
 * `x` croît vers l'est, `y` vers le sud, l'origine est en haut à gauche.
 *
 * Aucun accès au réseau ni à la page : uniquement du calcul.
 */

/** Côté d'une tuile, en pixels. Universel pour les fonds courants. */
export const TAILLE = 256;

/** Le monde entier tient dans une tuile au zoom 0. */
export const ZOOM_MIN = 3;

/**
 * Au-delà de 20, presque aucun fond n'a d'image : on afficherait un damier
 * gris en prétendant zoomer. La limite honnête est celle des données.
 */
export const ZOOM_MAX = 20;

/** Latitude au-delà de laquelle Mercator part à l'infini. */
export const LAT_MAX = 85.05112878;

const borner = (v, min, max) => Math.min(max, Math.max(min, v));

/** Longitude → abscisse continue, en tuiles, à ce zoom. */
export const lonVersX = (lon, z) => ((Number(lon) + 180) / 360) * (2 ** z);

/** Latitude → ordonnée continue, en tuiles, à ce zoom. */
export function latVersY(lat, z) {
  const l = borner(Number(lat), -LAT_MAX, LAT_MAX) * Math.PI / 180;
  return (1 - Math.log(Math.tan(l) + 1 / Math.cos(l)) / Math.PI) / 2 * (2 ** z);
}

/** Abscisse en tuiles → longitude. */
export const xVersLon = (x, z) => (x / (2 ** z)) * 360 - 180;

/** Ordonnée en tuiles → latitude. */
export function yVersLat(y, z) {
  const n = Math.PI - 2 * Math.PI * y / (2 ** z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/**
 * Combien de mètres représente un pixel, ici, à ce zoom.
 *
 * C'est le nombre qui rend la carte mesurable. Il dépend de la latitude :
 * l'oublier ferait grandir la Tunisie de dix pour cent.
 */
export const metresParPixel = (lat, z) =>
  (156543.03392804097 * Math.cos(borner(Number(lat), -LAT_MAX, LAT_MAX) * Math.PI / 180))
  / (2 ** z);

/**
 * Une échelle graphique honnête : la plus grande longueur ronde qui tient
 * dans la largeur proposée.
 * @returns {{metres:number, pixels:number, texte:string}}
 */
export function echelle(lat, z, pixelsMax = 120) {
  const mpp = metresParPixel(lat, z);
  const brut = mpp * pixelsMax;
  const rondes = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
  let metres = rondes[0];
  for (const r of rondes) if (r <= brut) metres = r;
  return {
    metres,
    pixels: metres / mpp,
    texte: metres >= 1000 ? `${metres / 1000} km` : `${metres} m`,
  };
}

/**
 * Les tuiles à afficher pour couvrir une fenêtre centrée sur un point.
 *
 * Rend aussi la position en pixels de chacune dans la fenêtre : le contrôleur
 * n'a plus qu'à poser des images, il ne calcule rien.
 *
 * @returns {{tuiles:Array<{x:number,y:number,z:number,gauche:number,haut:number}>,
 *   centre:{x:number,y:number}, zoom:number}}
 */
export function fenetre({ latitude, longitude, zoom, largeur, hauteur }) {
  const z = Math.round(borner(Number(zoom) || ZOOM_MIN, ZOOM_MIN, ZOOM_MAX));
  const L = Math.max(1, Math.round(Number(largeur) || 0));
  const H = Math.max(1, Math.round(Number(hauteur) || 0));
  const cx = lonVersX(longitude, z);
  const cy = latVersY(latitude, z);

  // Coin haut-gauche de la fenêtre, en pixels du monde.
  const gauche = cx * TAILLE - L / 2;
  const haut = cy * TAILLE - H / 2;

  const xMin = Math.floor(gauche / TAILLE);
  const yMin = Math.floor(haut / TAILLE);
  const xMax = Math.floor((gauche + L - 1) / TAILLE);
  const yMax = Math.floor((haut + H - 1) / TAILLE);

  const cote = 2 ** z;
  const tuiles = [];
  for (let y = yMin; y <= yMax; y++) {
    // Hors du monde en latitude : il n'existe aucune tuile, on n'en invente pas.
    if (y < 0 || y >= cote) continue;
    for (let x = xMin; x <= xMax; x++) {
      tuiles.push({
        // La longitude fait le tour du monde ; l'indice aussi.
        x: ((x % cote) + cote) % cote,
        y,
        z,
        gauche: Math.round(x * TAILLE - gauche),
        haut: Math.round(y * TAILLE - haut),
      });
    }
  }
  return { tuiles, zoom: z, centre: { x: cx, y: cy },
    origine: { gauche, haut } };
}

/** Le point géographique sous un pixel de la fenêtre. */
export function pointSousPixel({ latitude, longitude, zoom, largeur, hauteur }, px, py) {
  const z = Math.round(borner(Number(zoom) || ZOOM_MIN, ZOOM_MIN, ZOOM_MAX));
  const x = lonVersX(longitude, z) + (px - Number(largeur) / 2) / TAILLE;
  const y = latVersY(latitude, z) + (py - Number(hauteur) / 2) / TAILLE;
  return { latitude: yVersLat(y, z), longitude: xVersLon(x, z) };
}

/** Le pixel de la fenêtre où tombe un point géographique. */
export function pixelDuPoint({ latitude, longitude, zoom, largeur, hauteur }, point) {
  const z = Math.round(borner(Number(zoom) || ZOOM_MIN, ZOOM_MIN, ZOOM_MAX));
  return {
    x: (lonVersX(point.longitude, z) - lonVersX(longitude, z)) * TAILLE + Number(largeur) / 2,
    y: (latVersY(point.latitude, z) - latVersY(latitude, z)) * TAILLE + Number(hauteur) / 2,
  };
}

/** Recentre la carte après un glissement de `dx`, `dy` pixels. */
export function glisser({ latitude, longitude, zoom }, dx, dy) {
  const z = Math.round(borner(Number(zoom) || ZOOM_MIN, ZOOM_MIN, ZOOM_MAX));
  const x = lonVersX(longitude, z) - dx / TAILLE;
  const y = borner(latVersY(latitude, z) - dy / TAILLE, 0, 2 ** z);
  return { latitude: yVersLat(y, z), longitude: xVersLon(x, z) };
}

/** Le zoom borné, pour que les boutons ne mènent jamais à un damier vide. */
export const bornerZoom = (z) => Math.round(borner(Number(z) || ZOOM_MIN, ZOOM_MIN, ZOOM_MAX));
