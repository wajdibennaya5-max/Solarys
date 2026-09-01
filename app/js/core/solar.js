/**
 * Moteur solaire — géométrie, décomposition du rayonnement et transposition
 * sur plan incliné.
 *
 * Méthode : à partir de l'irradiation globale horizontale mensuelle moyenne
 * (kWh/m²/jour), on reconstitue un profil horaire sur le « jour moyen » du mois
 * (jours recommandés par Klein), on décompose global/diffus par la corrélation
 * d'Erbs, puis on transpose sur le plan des modules par le modèle HDKR
 * (Hay–Davies–Klucher–Reindl). Cette approche gère n'importe quelle
 * orientation, contrairement au facteur Rb moyen mensuel classique.
 *
 * Références : Duffie & Beckman, "Solar Engineering of Thermal Processes",
 * 4e éd., ch. 1-2 (géométrie), 2.10 (Erbs), 2.16 (Collares-Pereira & Rabl),
 * 5.9-5.10 (HDKR).
 */

const DEG = Math.PI / 180;
export const GSC = 1367; // constante solaire, W/m²

/** Jour moyen de chaque mois (Klein 1977) — numéro de jour dans l'année. */
export const MEAN_DAY = [17, 47, 75, 105, 135, 162, 198, 228, 258, 288, 318, 344];
/** Nombre de jours par mois (année non bissextile). */
export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Déclinaison solaire (degrés) pour le jour n. */
export function declination(n) {
  return 23.45 * Math.sin(2 * Math.PI * (284 + n) / 365);
}

/** Correction d'excentricité de l'orbite terrestre. */
export function eccentricity(n) {
  return 1 + 0.033 * Math.cos(2 * Math.PI * n / 365);
}

/** Angle horaire du coucher du soleil (degrés) sur plan horizontal. */
export function sunsetHourAngle(latitude, decl) {
  return Math.acos(clamp(-Math.tan(latitude * DEG) * Math.tan(decl * DEG), -1, 1)) / DEG;
}

/**
 * Irradiation extraterrestre journalière sur plan horizontal (Wh/m²/jour).
 */
export function extraterrestrialDaily(latitude, n) {
  const d = declination(n);
  const ws = sunsetHourAngle(latitude, d);
  return (24 / Math.PI) * GSC * eccentricity(n) * (
    Math.cos(latitude * DEG) * Math.cos(d * DEG) * Math.sin(ws * DEG) +
    (ws * DEG) * Math.sin(latitude * DEG) * Math.sin(d * DEG)
  );
}

/**
 * Fraction diffuse journalière — corrélation d'Erbs pour moyennes mensuelles.
 * @param {number} kt indice de clarté journalier moyen H/H0
 * @param {number} ws angle horaire du coucher (degrés)
 */
export function diffuseFractionErbs(kt, ws) {
  const k = clamp(kt, 0.05, 0.8);
  if (ws <= 81.4) {
    // Corrélation « hiver » (jours courts)
    if (k < 0.715) return 1.0 - 0.2727 * k + 2.4495 * k ** 2 - 11.9514 * k ** 3 + 9.3879 * k ** 4;
    return 0.143;
  }
  if (k < 0.722) return 1.0 + 0.2832 * k - 2.5557 * k ** 2 + 0.8448 * k ** 3;
  return 0.175;
}

/**
 * Répartition horaire de l'irradiation globale journalière
 * (Collares-Pereira & Rabl) : rt = I/H.
 */
function ratioGlobalHourly(w, ws) {
  const a = 0.409 + 0.5016 * Math.sin((ws - 60) * DEG);
  const b = 0.6609 - 0.4767 * Math.sin((ws - 60) * DEG);
  const cosW = Math.cos(w * DEG), cosWs = Math.cos(ws * DEG);
  const denom = Math.sin(ws * DEG) - (ws * DEG) * cosWs;
  if (denom <= 0) return 0;
  return (Math.PI / 24) * (a + b * cosW) * (cosW - cosWs) / denom;
}

/** Répartition horaire du diffus journalier (Liu & Jordan) : rd = Id/Hd. */
function ratioDiffuseHourly(w, ws) {
  const cosW = Math.cos(w * DEG), cosWs = Math.cos(ws * DEG);
  const denom = Math.sin(ws * DEG) - (ws * DEG) * cosWs;
  if (denom <= 0) return 0;
  return (Math.PI / 24) * (cosW - cosWs) / denom;
}

/** Cosinus de l'angle zénithal. */
export function cosZenith(latitude, decl, w) {
  const phi = latitude * DEG, d = decl * DEG, W = w * DEG;
  return Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(W);
}

/**
 * Cosinus de l'angle d'incidence sur un plan incliné.
 * @param {number} tilt inclinaison / horizontale (degrés)
 * @param {number} azimuth azimut du plan, 0 = Sud, +Ouest, -Est (degrés)
 */
export function cosIncidence(latitude, decl, w, tilt, azimuth) {
  const phi = latitude * DEG, d = decl * DEG, W = w * DEG;
  const b = tilt * DEG, g = azimuth * DEG;
  return (
    Math.sin(d) * Math.sin(phi) * Math.cos(b) -
    Math.sin(d) * Math.cos(phi) * Math.sin(b) * Math.cos(g) +
    Math.cos(d) * Math.cos(phi) * Math.cos(b) * Math.cos(W) +
    Math.cos(d) * Math.sin(phi) * Math.sin(b) * Math.cos(g) * Math.cos(W) +
    Math.cos(d) * Math.sin(b) * Math.sin(g) * Math.sin(W)
  );
}

/**
 * Irradiation journalière sur plan incliné pour un mois, modèle HDKR.
 *
 * @param {object} p
 * @param {number} p.latitude  latitude (degrés, + Nord)
 * @param {number} p.month     index 0-11
 * @param {number} p.ghi       irradiation globale horizontale, kWh/m²/jour
 * @param {number} p.tilt      inclinaison (degrés)
 * @param {number} p.azimuth   azimut (degrés, 0 = Sud dans l'hémisphère Nord)
 * @param {number} [p.albedo]  réflectivité du sol (0.2 par défaut)
 * @returns {{poa:number, beam:number, diffuse:number, ground:number,
 *            hours:Array<{w:number,poa:number,beam:number,diffuse:number,cosz:number}>,
 *            kt:number}}
 *          irradiations en kWh/m²/jour. `hours` porte le détail par pas de
 *          temps : il sert au calcul thermique et à celui de l'ombrage entre
 *          rangées, qui n'intercepte que la composante directe.
 */
export function planeOfArrayDaily({ latitude, month, ghi, tilt, azimuth, albedo = 0.2 }) {
  const n = MEAN_DAY[month];
  const decl = declination(n);
  const ws = sunsetHourAngle(latitude, decl);
  const h0 = extraterrestrialDaily(latitude, n) / 1000; // kWh/m²/j
  const kt = h0 > 0 ? clamp(ghi / h0, 0.02, 0.85) : 0;
  const hd = ghi * diffuseFractionErbs(kt, ws);
  const hb = Math.max(0, ghi - hd);

  const rBeam = (1 - Math.cos(tilt * DEG)) / 2; // vue du sol
  const rSky = (1 + Math.cos(tilt * DEG)) / 2;  // vue du ciel
  // Indice anisotrope (Hay & Davies) : part du diffus traitée comme circumsolaire.
  const ai = h0 > 0 ? clamp(hb / h0, 0, 1) : 0;
  // Facteur d'horizon (Reindl) pour le brillant de l'horizon.
  const f = ghi > 0 ? Math.sqrt(clamp(hb / ghi, 0, 1)) : 0;
  const sin3 = Math.sin((tilt / 2) * DEG) ** 3;

  let beam = 0, diffuse = 0, ground = 0;
  const hours = [];
  // Intégration par pas de 15 min sur la journée, centrée sur midi solaire.
  const stepMin = 15;
  const stepH = stepMin / 60;
  for (let w = -180 + stepMin / 4; w < 180; w += stepMin / 4) {
    const cosz = cosZenith(latitude, decl, w);
    if (cosz <= 0.0087) continue; // soleil sous ~0.5° de hauteur
    const rt = ratioGlobalHourly(w, ws);
    const rd = ratioDiffuseHourly(w, ws);
    if (rt <= 0) continue;
    const i = Math.max(0, ghi * rt) * stepH;   // global horaire (kWh/m² sur le pas)
    const id = Math.max(0, hd * rd) * stepH;   // diffus horaire
    const ib = Math.max(0, i - id);            // direct horizontal
    const cosT = cosIncidence(latitude, decl, w, tilt, azimuth);
    const rb = cosT > 0 ? cosT / cosz : 0;

    const eBeam = (ib + id * ai) * rb;
    const eDiff = id * (1 - ai) * rSky * (1 + f * sin3);
    const eGrnd = i * albedo * rBeam;
    beam += eBeam; diffuse += eDiff; ground += eGrnd;
    hours.push({
      w, cosz,
      poa: (eBeam + eDiff + eGrnd) / stepH,   // kW/m²
      beam: eBeam / stepH,                     // part directe, interceptable par une ombre
      diffuse: (eDiff + eGrnd) / stepH,
    });
  }
  return { poa: beam + diffuse + ground, beam, diffuse, ground, hours, kt };
}

/**
 * Température de cellule (modèle NOCT, IEC 61215).
 * @param {number} ta température ambiante (°C)
 * @param {number} g irradiance dans le plan (W/m²)
 * @param {number} noct température nominale d'utilisation (°C)
 */
export function cellTemperature(ta, g, noct = 45) {
  return ta + (noct - 20) / 800 * g;
}

/**
 * Inclinaison optimale approchée pour maximiser la production annuelle,
 * recherchée par balayage sur les 12 mois.
 */
export function optimalTilt(latitude, monthlyGhi, azimuth = 0, albedo = 0.2) {
  let best = { tilt: 0, poa: -1 };
  for (let tilt = 0; tilt <= 60; tilt += 1) {
    let sum = 0;
    for (let m = 0; m < 12; m++) {
      sum += planeOfArrayDaily({ latitude, month: m, ghi: monthlyGhi[m], tilt, azimuth, albedo })
        .poa * DAYS_IN_MONTH[m];
    }
    if (sum > best.poa) best = { tilt, poa: sum };
  }
  return best.tilt;
}
