/**
 * OÙ EST LE SOLEIL, ET QUAND.
 *
 * POURQUOI CE FICHIER EXISTE. Jusqu'ici, la scène en volume portait un
 * éclairage fixe, et l'interface le disait franchement : « ce n'est pas une
 * étude d'ombrage ». Pour que ç'en devienne une, il faut la position réelle du
 * soleil — une date, une heure, un lieu — et pas un dégradé.
 *
 * CE QUE CE FICHIER CALCULE. La déclinaison, l'équation du temps, l'angle
 * horaire, puis la hauteur et l'azimut du soleil. Les formules sont celles de
 * l'algorithme NOAA sous sa forme courante, précise à environ un dixième de
 * degré sur la période qui nous intéresse — largement au-delà de ce que vaut un
 * relevé d'obstacle fait au mètre ruban.
 *
 * CE QU'IL NE FAIT PAS. Il ne tient compte ni de la réfraction atmosphérique
 * près de l'horizon, ni du relief, ni des nuages. Un soleil calculé à 2° de
 * hauteur est un soleil qu'on ne voit pas forcément.
 *
 * CONVENTION D'AZIMUT : celle du projet, **0 = plein sud**, négatif vers l'est,
 * positif vers l'ouest. La même que `pvgis/parametres.js`, `toiture.js` et
 * `scene3d.js` — en mélanger deux ferait tourner les ombres à l'envers.
 *
 * Aucun accès au réseau ni à la page : uniquement du calcul.
 */

function nb(v) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const rad = (d) => d * Math.PI / 180;
const deg = (r) => r * 180 / Math.PI;

/**
 * La Tunisie vit à UTC+1 toute l'année.
 *
 * Ce n'est pas un détail : une heure d'écart déplace le soleil de quinze
 * degrés, ce qui suffit à faire passer une ombre d'un côté à l'autre d'une
 * cheminée. La constante est ici, nommée, plutôt que dispersée dans le code.
 */
export const FUSEAU_TUNISIE = 1;

/** Le quantième du jour, de 1 au 1er janvier à 365 ou 366 au 31 décembre. */
export function jourDeLAnnee(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const debut = Date.UTC(d.getUTCFullYear(), 0, 1);
  const ici = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((ici - debut) / 86400000) + 1;
}

/**
 * La déclinaison du soleil, en degrés.
 *
 * Elle varie de −23,44° au solstice d'hiver à +23,44° à celui d'été : c'est
 * elle qui fait qu'un toit plein sud reçoit deux fois plus en juin qu'en
 * décembre.
 */
export function declinaison(jour) {
  const j = nb(jour);
  if (j === null) return null;
  // Formule de Spencer, tronquée aux termes qui comptent : erreur inférieure
  // à 0,1° sur l'année.
  const b = rad((360 / 365.24) * (j - 81));
  return deg(Math.asin(Math.sin(rad(23.44)) * Math.sin(b)));
}

/**
 * L'équation du temps, en minutes.
 *
 * Le midi solaire ne tombe pas à midi. L'écart atteint un quart d'heure en
 * novembre : l'ignorer décalerait toutes les ombres d'hiver de près de quatre
 * degrés.
 */
export function equationDuTemps(jour) {
  const j = nb(jour);
  if (j === null) return null;
  const b = rad((360 / 365.24) * (j - 81));
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
}

/**
 * L'heure solaire vraie, en heures décimales.
 *
 * Trois corrections : le fuseau, la longitude du lieu dans son fuseau, et
 * l'équation du temps. Chacune se compte en minutes, et les trois ensemble
 * dépassent facilement la demi-heure.
 */
export function heureSolaire(heureLegale, { longitude, jour, fuseau = FUSEAU_TUNISIE } = {}) {
  const h = nb(heureLegale);
  const lon = nb(longitude);
  const j = nb(jour);
  if (h === null || lon === null || j === null) return null;
  const correction = 4 * (lon - 15 * fuseau) + equationDuTemps(j);
  return h + correction / 60;
}

/** L'angle horaire : 0 au midi solaire, 15° par heure, négatif le matin. */
export const angleHoraire = (heureSolaireVraie) => {
  const h = nb(heureSolaireVraie);
  return h === null ? null : 15 * (h - 12);
};

/**
 * La position du soleil, vue d'un point et à un instant.
 *
 * @param {object} o
 * @param {number} o.latitude
 * @param {number} o.longitude
 * @param {Date|string|number} o.date
 * @param {number} o.heure heure légale locale, décimale (13.5 = 13 h 30)
 * @returns {{hauteur:number, azimut:number, leve:boolean, jour:number,
 *   heureSolaire:number, declinaison:number}|null}
 */
export function position({ latitude, longitude, date = new Date(), heure = 12,
  fuseau = FUSEAU_TUNISIE } = {}) {
  const lat = nb(latitude);
  const lon = nb(longitude);
  const h = nb(heure);
  const j = jourDeLAnnee(date);
  if (lat === null || lon === null || h === null || j === null) return null;

  const d = declinaison(j);
  const hs = heureSolaire(h, { longitude: lon, jour: j, fuseau });
  const H = angleHoraire(hs);

  const sinHauteur = Math.sin(rad(lat)) * Math.sin(rad(d))
    + Math.cos(rad(lat)) * Math.cos(rad(d)) * Math.cos(rad(H));
  const hauteur = deg(Math.asin(Math.min(1, Math.max(-1, sinHauteur))));

  // Azimut compté depuis le sud, positif vers l'ouest : `atan2` donne
  // directement cette convention avec ces deux arguments, ce qui évite la
  // cascade de cas particuliers où les erreurs de signe se logent.
  const azimut = deg(Math.atan2(
    Math.cos(rad(d)) * Math.sin(rad(H)),
    Math.cos(rad(d)) * Math.cos(rad(H)) * Math.sin(rad(lat))
      - Math.sin(rad(d)) * Math.cos(rad(lat)),
  ));

  return {
    hauteur,
    azimut,
    // Le soleil « levé » à 0,5° au-dessus de l'horizon ne projette aucune
    // ombre exploitable : la limite est à trois degrés, et elle est dite.
    leve: hauteur > 3,
    jour: j,
    heureSolaire: hs,
    angleHoraire: H,
    declinaison: d,
  };
}

/**
 * Le vecteur qui pointe VERS le soleil, dans le repère de la scène 3D.
 * `x` vers l'est, `y` vers le nord, `z` vers le haut.
 */
export function versLeSoleil(pos) {
  if (!pos) return null;
  const h = rad(pos.hauteur);
  // L'azimut compte depuis le sud vers l'ouest : le cap boussole vaut
  // azimut + 180, et le vecteur d'un cap `b` est `{sin b, cos b}`.
  const b = rad(pos.azimut + 180);
  return {
    x: Math.cos(h) * Math.sin(b),
    y: Math.cos(h) * Math.cos(b),
    z: Math.sin(h),
  };
}

/** Les dates repères d'une étude d'ombrage, et pourquoi chacune compte. */
export const DATES = [
  { id: 'hiver', nom: '21 décembre', mois: 11, jourDuMois: 21,
    aide: 'Le soleil au plus bas : c’est le jour où les ombres sont les plus '
      + 'longues, et le pire cas d’une installation.' },
  { id: 'equinoxe', nom: '21 mars', mois: 2, jourDuMois: 21,
    aide: 'Le cas moyen, celui qui représente le mieux l’année entière.' },
  { id: 'ete', nom: '21 juin', mois: 5, jourDuMois: 21,
    aide: 'Le soleil au plus haut : les ombres les plus courtes.' },
];

/** La date d'un repère, pour l'année demandée. */
export function dateRepere(id, annee = new Date().getFullYear()) {
  const r = DATES.find((d) => d.id === id) ?? DATES[1];
  return new Date(Date.UTC(annee, r.mois, r.jourDuMois, 12, 0, 0));
}

/**
 * La course du soleil sur une journée, heure par heure.
 *
 * C'est la frise qui permet de faire glisser l'heure et de voir l'ombre
 * balayer le toit — la seule façon honnête de montrer qu'un obstacle gêne le
 * matin et plus du tout l'après-midi.
 */
export function course({ latitude, longitude, date, pas = 0.5,
  fuseau = FUSEAU_TUNISIE } = {}) {
  const points = [];
  for (let h = 0; h <= 24; h += pas) {
    const p = position({ latitude, longitude, date, heure: h, fuseau });
    if (p) points.push({ heure: h, ...p });
  }
  return points;
}

/**
 * Le lever et le coucher, en heure légale locale.
 * @returns {{lever:number|null, coucher:number|null, duree:number}}
 */
export function journee({ latitude, longitude, date, fuseau = FUSEAU_TUNISIE } = {}) {
  const pts = course({ latitude, longitude, date, pas: 1 / 60, fuseau });
  const leves = pts.filter((p) => p.hauteur > 0);
  if (!leves.length) return { lever: null, coucher: null, duree: 0 };
  const lever = leves[0].heure;
  const coucher = leves[leves.length - 1].heure;
  return { lever, coucher, duree: coucher - lever };
}

/** Le midi solaire, en heure légale locale — le sommet de la course. */
export function midiSolaire({ latitude, longitude, date, fuseau = FUSEAU_TUNISIE } = {}) {
  const pts = course({ latitude, longitude, date, pas: 1 / 60, fuseau });
  if (!pts.length) return null;
  return pts.reduce((a, b) => (a.hauteur >= b.hauteur ? a : b));
}
