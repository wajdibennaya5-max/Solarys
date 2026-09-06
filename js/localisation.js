/**
 * LA POSITION, AVEC CE QU'ELLE VAUT.
 *
 * POURQUOI CE FICHIER EXISTE. Le projet manipulait déjà des coordonnées, mais
 * il ne savait pas les qualifier. Or « 36.8065, 10.1815 » n'a pas le même sens
 * selon qu'il vient d'un GPS à trois mètres, d'une adresse retrouvée à trois
 * cents mètres, ou du centre d'un gouvernorat à trente kilomètres. Le calcul
 * de production accepte les trois ; l'implantation d'un panneau sur un toit
 * n'en accepte qu'une.
 *
 * La règle tenue ici : une position n'est jamais un simple couple de nombres.
 * Elle porte toujours son origine, sa précision annoncée et l'heure de sa
 * mesure — et l'on refuse d'en tirer plus qu'elle ne permet.
 *
 * Aucun accès au réseau, au capteur ni à la page : uniquement du calcul.
 */

/**
 * Un nombre, ou rien — jamais un zéro de consolation.
 *
 * `Number(null)` vaut 0, `Number('')` aussi, et `Number(false)` encore. Ce
 * projet s'est déjà fait piéger : une donnée absente devenait un 0 exploité
 * comme une mesure, et une absence était présentée comme un résultat. Ici,
 * une précision inconnue deviendrait « précision fine » — le mensonge exact
 * que ce fichier existe pour empêcher.
 */
function nb(v) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Un degré de latitude, en mètres. Constant à la précision qui nous occupe. */
export const METRES_PAR_DEGRE_LAT = 111320;

/** Un degré de longitude, en mètres, à cette latitude. */
export const metresParDegreLon = (lat) =>
  METRES_PAR_DEGRE_LAT * Math.cos((Number(lat) || 0) * Math.PI / 180);

/**
 * Ce qu'une précision annoncée permet réellement de faire.
 *
 * Les seuils ne sont pas décoratifs : ils décident de ce que l'application
 * s'autorise à proposer. Dessiner un toit sur une position à trois cents
 * mètres reviendrait à dessiner le toit du voisin.
 */
export const PRECISIONS = [
  { cle: 'fine', max: 10, libelle: 'Précision fine',
    phrase: 'Position au mètre près : suffisante pour situer le bâtiment.',
    permetToiture: true },
  { cle: 'bonne', max: 50, libelle: 'Bonne précision',
    phrase: 'Position à quelques dizaines de mètres : le bâtiment est identifiable, '
      + 'vérifiez le repère sur la carte.',
    permetToiture: true },
  { cle: 'moyenne', max: 500, libelle: 'Précision moyenne',
    phrase: 'Position approchée : elle situe le quartier, pas le bâtiment. '
      + 'Déplacez le repère sur la carte avant de dessiner un toit.',
    permetToiture: false },
  { cle: 'faible', max: 5000, libelle: 'Précision faible',
    phrase: 'Position approchée à plusieurs centaines de mètres : utilisable pour '
      + 'le calcul d’ensoleillement, pas pour l’implantation.',
    permetToiture: false },
  { cle: 'regionale', max: Infinity, libelle: 'Position régionale',
    phrase: 'Position à l’échelle de la région : le calcul d’ensoleillement reste '
      + 'valable, aucune mesure de toiture ne l’est.',
    permetToiture: false },
];

/**
 * Le cas que l'échelle en mètres ne sait pas décrire : un point désigné.
 *
 * DÉFAUT CORRIGÉ. Une coordonnée tapée à la main n'a aucune précision
 * annoncée — aucun capteur n'a parlé. Traitée comme une précision inconnue,
 * elle était classée « Position régionale » alors qu'elle désigne un point au
 * mètre près. L'interface affichait donc « régionale » à côté d'un tracé de
 * toiture autorisé : deux affirmations contradictoires sur le même écran.
 *
 * Un point désigné n'est ni mesuré ni approximatif : il vaut ce que vaut le
 * geste, et c'est exactement ce qui est écrit.
 */
export const DESIGNEE = {
  cle: 'designee',
  libelle: 'Point désigné',
  phrase: 'Point désigné à la main : aucune précision n’a été mesurée. Sa justesse '
    + 'est celle du geste — vérifiez le repère avant d’en tirer des mesures.',
  permetToiture: true,
};

/**
 * Classe une précision annoncée, en mètres.
 * @returns {object} jamais `null` : une précision inconnue est traitée comme
 *   régionale, ce qui est le choix prudent.
 */
export function classer(metres) {
  const m = nb(metres);
  if (m === null || m < 0) return PRECISIONS[PRECISIONS.length - 1];
  return PRECISIONS.find((p) => m <= p.max);
}

/**
 * D'où vient une position, et ce que cela vaut.
 *
 * `confiance` reprend l'échelle du reste du projet (`provenance.js`) : elle
 * se propage au maillon le plus faible, jamais en moyenne.
 */
export const ORIGINES = {
  'capteur-fin': { libelle: 'GPS du terminal', methode: 'Mesure satellite haute précision',
    confiance: 'elevee' },
  capteur: { libelle: 'Localisation du navigateur',
    methode: 'Capteur du terminal (GPS, Wi-Fi ou réseau mobile)', confiance: 'moyenne' },
  carte: { libelle: 'Repère placé sur la carte',
    methode: 'Point désigné à la main sur le fond cartographique', confiance: 'moyenne' },
  saisie: { libelle: 'Coordonnées saisies',
    methode: 'Coordonnées entrées par l’utilisateur', confiance: 'moyenne' },
  'centre-gouvernorat': { libelle: 'Centre du gouvernorat',
    methode: 'Repli sur le centre administratif, faute de position',
    confiance: 'faible' },
  inconnue: { libelle: 'Position inconnue', methode: 'Aucune', confiance: 'nulle' },
};

/** Le libellé d'une origine, sans jamais lever sur une valeur inattendue. */
export const origine = (cle) => ORIGINES[cle] ?? ORIGINES.inconnue;

/** Ces coordonnées sont-elles des nombres plausibles ? */
export const coordonneesValides = (lat, lon) =>
  nb(lat) !== null && nb(lon) !== null
  && Math.abs(nb(lat)) <= 90 && Math.abs(nb(lon)) <= 180;

const DECIMAL = /^\s*(-?\d{1,3}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*$/;
const DMS = new RegExp(
  '^\\s*(\\d{1,3})\\s*[°d]\\s*(\\d{1,2})?\\s*[\'′m]?\\s*([\\d.,]+)?\\s*["″s]?\\s*([NSns])'
  + '\\s*[,;\\s]\\s*'
  + '(\\d{1,3})\\s*[°d]\\s*(\\d{1,2})?\\s*[\'′m]?\\s*([\\d.,]+)?\\s*["″s]?\\s*([EOWeow])\\s*$');

const nombre = (v) => (v === undefined || v === '' ? 0 : Number(String(v).replace(',', '.')));

/**
 * Lit des coordonnées écrites à la main.
 *
 * Les gens collent ce qu'ils ont : « 36.8065, 10.1815 » depuis une carte,
 * « 36°48'23"N 10°10'53"E » depuis un relevé, parfois avec une virgule
 * décimale. Refuser ces formats revient à refuser la saisie manuelle, qui est
 * pourtant le dernier recours quand le capteur est indisponible.
 *
 * @returns {{latitude:number, longitude:number, format:string}|null}
 */
export function lireCoordonnees(texte) {
  const t = String(texte ?? '').trim();
  if (!t) return null;

  const dms = DMS.exec(t);
  if (dms) {
    const lat = nombre(dms[1]) + nombre(dms[2]) / 60 + nombre(dms[3]) / 3600;
    const lon = nombre(dms[5]) + nombre(dms[6]) / 60 + nombre(dms[7]) / 3600;
    const latitude = /[Ss]/.test(dms[4]) ? -lat : lat;
    // « O » comme Ouest en français, « W » en anglais : les deux se collent.
    const longitude = /[OWow]/.test(dms[8]) ? -lon : lon;
    return coordonneesValides(latitude, longitude)
      ? { latitude, longitude, format: 'degres-minutes-secondes' } : null;
  }

  const dec = DECIMAL.exec(t);
  if (dec) {
    const latitude = nombre(dec[1]);
    const longitude = nombre(dec[2]);
    return coordonneesValides(latitude, longitude)
      ? { latitude, longitude, format: 'decimal' } : null;
  }
  return null;
}

/** Écrit des coordonnées comme on les relit : décimales, six chiffres. */
export function formater(lat, lon, decimales = 6) {
  if (!coordonneesValides(lat, lon)) return '—';
  return `${Number(lat).toFixed(decimales)}, ${Number(lon).toFixed(decimales)}`;
}

/** Les mêmes, en degrés-minutes-secondes, pour un relevé ou un rapport. */
export function formaterDMS(lat, lon) {
  if (!coordonneesValides(lat, lon)) return '—';
  const part = (v, positif, negatif) => {
    const abs = Math.abs(Number(v));
    const d = Math.floor(abs);
    const m = Math.floor((abs - d) * 60);
    const s = ((abs - d) * 60 - m) * 60;
    return `${d}°${String(m).padStart(2, '0')}'${s.toFixed(1).padStart(4, '0')}"`
      + `${Number(v) >= 0 ? positif : negatif}`;
  };
  return `${part(lat, 'N', 'S')} ${part(lon, 'E', 'O')}`;
}

/**
 * Déplace un point d'un nombre de mètres vers le nord et vers l'est.
 * Sert au repère déplacé à la main et, plus tard, au tracé d'un toit.
 */
export function deplacer(lat, lon, versNord = 0, versEst = 0) {
  const dLat = (Number(versNord) || 0) / METRES_PAR_DEGRE_LAT;
  const parDegre = metresParDegreLon(lat);
  const dLon = parDegre === 0 ? 0 : (Number(versEst) || 0) / parDegre;
  return { latitude: Number(lat) + dLat, longitude: Number(lon) + dLon };
}

/** Distance en mètres entre deux points proches — projection locale. */
export function distanceMetres(a, b) {
  const dLat = (b.latitude - a.latitude) * METRES_PAR_DEGRE_LAT;
  const dLon = (b.longitude - a.longitude) * metresParDegreLon((a.latitude + b.latitude) / 2);
  return Math.hypot(dLat, dLon);
}

/**
 * Le portrait complet d'une position : ce qu'elle est, d'où elle vient,
 * ce qu'elle vaut et ce qu'elle interdit.
 *
 * Cette fonction est le seul endroit du projet qui décide si une position
 * autorise une mesure de toiture. Une seule décision, un seul test.
 */
export function decrire(p = {}) {
  const lat = nb(p.latitude);
  const lon = nb(p.longitude);
  if (!coordonneesValides(lat, lon)) {
    return {
      connue: false,
      texte: '—',
      origine: origine('inconnue'),
      precision: classer(null),
      permetToiture: false,
      horodatage: null,
      altitude: null,
      phrase: 'Aucune position n’est connue pour ce projet.',
    };
  }
  const o = origine(p.origine);
  const alt = nb(p.altitude);
  const annoncee = nb(p.precision) !== null;
  // Un point posé ou saisi sans précision annoncée n'est pas une position
  // dont on ignore tout : c'est un point que quelqu'un a désigné.
  const designe = !annoncee && (p.origine === 'carte' || p.origine === 'saisie');
  const prec = designe ? DESIGNEE : classer(p.precision);
  return {
    connue: true,
    latitude: lat,
    longitude: lon,
    texte: formater(lat, lon),
    dms: formaterDMS(lat, lon),
    origine: o,
    precision: prec,
    precisionMetres: nb(p.precision),
    // Une position saisie ou pointée n'a pas de précision mesurée : le
    // capteur n'a rien annoncé. On ne lui en invente pas une.
    precisionAnnoncee: annoncee,
    altitude: alt,
    horodatage: nb(p.horodatage),
    permetToiture: prec.permetToiture,
    phrase: prec.phrase,
  };
}

/** L'heure d'une mesure, écrite pour être lue. */
export function heureDeMesure(horodatage) {
  const t = nb(horodatage);
  if (t === null || t <= 0) return null;
  const d = new Date(t);
  const deuxChiffres = (n) => String(n).padStart(2, '0');
  return `${deuxChiffres(d.getDate())}/${deuxChiffres(d.getMonth() + 1)}/${d.getFullYear()}`
    + ` à ${deuxChiffres(d.getHours())}:${deuxChiffres(d.getMinutes())}`;
}
