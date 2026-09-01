/**
 * Entraxe des rangées et ombrage mutuel.
 *
 * En toiture-terrasse et au sol, l'espacement entre rangées est LE paramètre
 * dimensionnant : trop serré, les rangées s'ombrent l'une l'autre en hiver ;
 * trop large, on perd de la surface. Le compromis se lit sur deux grandeurs :
 *
 *  - l'ANGLE LIMITE D'OMBRAGE : hauteur solaire au-dessous de laquelle la
 *    rangée avant projette son ombre sur la suivante. La règle de la
 *    profession retient la hauteur du soleil au solstice d'hiver à une heure
 *    de référence (souvent 9 h ou 10 h solaire) ;
 *  - le FACTEUR D'OCCUPATION DU SOL (GCR, « ground coverage ratio ») :
 *    largeur de module rabattue sur l'entraxe. Il conditionne la puissance
 *    installable par mètre carré et les pertes d'ombrage mutuel.
 *
 * Références : Duffie & Beckman ch. 1 (géométrie solaire) ; la corrélation de
 * pertes d'ombrage mutuel est celle usuellement retenue pour les champs à
 * rangées régulières, et reste une ESTIMATION — elle ne remplace pas un calcul
 * d'ombrage géométrique heure par heure.
 */

import {
  declination, sunsetHourAngle, cosZenith, planeOfArrayDaily,
  MEAN_DAY, DAYS_IN_MONTH,
} from './solar.js';

const DEG = Math.PI / 180;

/**
 * Hauteur du soleil à une date et une heure solaire données.
 * @param {number} latitude degrés, positif au nord
 * @param {number} dayOfYear
 * @param {number} solarHour heure solaire vraie (12 = midi solaire)
 * @returns {number} hauteur en degrés, négative si le soleil est couché
 */
export function solarElevation(latitude, dayOfYear, solarHour) {
  const decl = declination(dayOfYear);
  const w = (solarHour - 12) * 15;
  return Math.asin(Math.max(-1, Math.min(1, cosZenith(latitude, decl, w)))) / DEG;
}

/**
 * Azimut du soleil, 0 = Sud, positif vers l'Ouest.
 * @returns {number} degrés
 */
export function solarAzimuth(latitude, dayOfYear, solarHour) {
  const decl = declination(dayOfYear) * DEG;
  const phi = latitude * DEG;
  const w = (solarHour - 12) * 15 * DEG;
  const cosZ = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(w);
  const sinZ = Math.sqrt(Math.max(0, 1 - cosZ * cosZ));
  if (sinZ < 1e-9 || Math.abs(Math.cos(phi)) < 1e-9) return 0;
  // Duffie & Beckman éq. 1.6.6 : azimut compté depuis le Sud, positif à l'Ouest.
  const cosA = (cosZ * Math.sin(phi) - Math.sin(decl)) / (sinZ * Math.cos(phi));
  const a = Math.acos(Math.max(-1, Math.min(1, cosA))) / DEG;
  return w >= 0 ? a : -a;
}

/** Jour de l'année du solstice d'hiver, selon l'hémisphère. */
export const winterSolsticeDay = (latitude) => (latitude >= 0 ? 355 : 172);

/**
 * Le soleil est-il levé, à cette date et cette heure, dans cet hémisphère ?
 * Sert à valider une heure de référence avant de l'utiliser.
 */
export function isSunUp(latitude, dayOfYear, solarHour) {
  const ws = sunsetHourAngle(latitude, declination(dayOfYear));
  return Math.abs((solarHour - 12) * 15) < ws;
}

/**
 * Entraxe minimal entre rangées pour qu'aucune ombre ne soit portée à
 * l'instant de référence.
 *
 *   hauteur de la rangée   h = L · sin(β)
 *   emprise au sol         b = L · cos(β)
 *   longueur d'ombre       o = h / tan(α)   projetée dans l'axe des rangées
 *   entraxe                p = b + o · cos(γ)
 *
 * où β est l'inclinaison des modules, α la hauteur solaire de référence, et
 * γ l'écart d'azimut entre le soleil et la normale des rangées — l'ombre
 * s'allonge quand le soleil n'est pas dans l'axe.
 *
 * @param {object} p
 * @param {number} p.moduleLength longueur du module dans le sens de la pente (m)
 * @param {number} p.tilt inclinaison des modules (degrés)
 * @param {number} p.sunElevation hauteur solaire de référence (degrés)
 * @param {number} [p.sunAzimuthOffset] écart d'azimut soleil / rangées (degrés)
 * @returns {{pitch:number, footprint:number, height:number, shadow:number, gcr:number}|null}
 *          `null` si le soleil est trop bas pour que l'ombre soit finie.
 */
export function rowPitch({ moduleLength, tilt, sunElevation, sunAzimuthOffset = 0 }) {
  if (!(sunElevation > 0.5)) return null; // ombre infinie ou soleil couché
  const b = tilt * DEG;
  const height = moduleLength * Math.sin(b);
  const footprint = moduleLength * Math.cos(b);
  const shadow = height / Math.tan(sunElevation * DEG);
  // Quand le soleil s'écarte fortement de l'axe des rangées, l'ombre porte de
  // côté : la composante utile diminue, mais l'entraxe ne peut jamais devenir
  // inférieur à l'emprise au sol de la rangée elle-même.
  const pitch = Math.max(footprint,
    footprint + shadow * Math.cos(sunAzimuthOffset * DEG));
  return {
    pitch,
    footprint,
    height,
    shadow,
    gap: pitch - footprint,
    gcr: pitch > 0 ? moduleLength / pitch : 0,
  };
}

/**
 * Entraxe recommandé pour un site, calculé au solstice d'hiver à l'heure de
 * référence retenue. Si le soleil est trop bas à cette heure-là — cas des
 * latitudes élevées —, l'heure est resserrée vers midi jusqu'à obtenir une
 * hauteur exploitable, et l'heure effectivement utilisée est renvoyée.
 *
 * @param {object} p
 * @param {number} p.latitude
 * @param {number} p.moduleLength longueur dans le sens de la pente (m)
 * @param {number} p.tilt
 * @param {number} [p.referenceHour] heure solaire de référence (9 par défaut)
 * @param {number} [p.azimuth] azimut des rangées, 0 = Sud, 180 = Nord.
 *        Par défaut, les rangées regardent l'équateur : Sud au nord de
 *        l'équateur, Nord au sud.
 */
export function recommendedPitch({ latitude, moduleLength, tilt, referenceHour = 9, azimuth }) {
  const day = winterSolsticeDay(latitude);
  const face = azimuth ?? (latitude >= 0 ? 0 : 180);
  let hour = referenceHour;
  let elevation = solarElevation(latitude, day, hour);

  // On rapproche l'heure de référence de midi tant que le soleil est trop bas.
  while (elevation < 8 && hour < 11.75) {
    hour += 0.25;
    elevation = solarElevation(latitude, day, hour);
  }
  if (elevation < 3) {
    return { feasible: false, reason: 'sun.tooLow', elevation, referenceHour: hour };
  }

  // L'écart d'azimut est ramené dans [−180, 180].
  let offset = solarAzimuth(latitude, day, hour) - face;
  offset = ((offset + 540) % 360) - 180;
  const r = rowPitch({ moduleLength, tilt, sunElevation: elevation, sunAzimuthOffset: offset });
  if (!r) return { feasible: false, reason: 'sun.tooLow', elevation, referenceHour: hour };
  return {
    feasible: true, ...r,
    elevation, referenceHour: hour, sunAzimuthOffset: offset, azimuth: face, day,
  };
}

/**
 * Angle limite d'ombrage : hauteur solaire, mesurée dans le plan perpendiculaire
 * aux rangées, au-dessous de laquelle une rangée commence à ombrer la suivante.
 *
 *   tan(α_limite) = hauteur de rangée / espace libre entre rangées
 *
 * C'est la grandeur que regarde un concepteur : plus elle est basse, moins il y
 * a d'heures ombrées dans l'année.
 */
export function shadingLimitAngle({ moduleLength, tilt, pitch }) {
  const b = tilt * DEG;
  const height = moduleLength * Math.sin(b);
  const footprint = moduleLength * Math.cos(b);
  const gap = pitch - footprint;
  if (height <= 1e-6) return 0;              // modules à plat : jamais d'ombre mutuelle
  if (gap <= 1e-6) return 90;                // rangées jointives : toujours ombrées
  return Math.atan(height / gap) / DEG;
}

/**
 * Angle de profil : hauteur du soleil ramenée dans le plan perpendiculaire aux
 * rangées. C'est lui, et non la hauteur solaire brute, qui décide de l'ombre :
 * un soleil bas mais très latéral passe entre les rangées.
 *
 * @returns {number|null} degrés, ou `null` si le soleil est derrière le champ
 */
export function profileAngle(elevation, azimuthOffset) {
  if (elevation <= 0) return null;
  const g = Math.abs(((azimuthOffset + 540) % 360) - 180);
  if (g >= 89.9) return null;                // soleil dans le plan des modules ou derrière
  return Math.atan(Math.tan(elevation * DEG) / Math.cos(g * DEG)) / DEG;
}

/**
 * Pertes d'ombrage entre rangées, calculées géométriquement.
 *
 * Pour chaque pas de temps de l'année, on compare l'angle de profil du soleil à
 * l'angle limite du champ. Sous cette limite, la rangée avant projette une ombre
 * dont on calcule la hauteur sur la rangée suivante ; la fraction ombrée est
 * retranchée de la composante DIRECTE reçue à cet instant — le diffus, lui,
 * arrive de tout le ciel et n'est pas intercepté de la même façon.
 *
 * Ce que ce calcul est : une évaluation optique de la perte de rayonnement
 * direct, fondée sur la géométrie réelle du champ.
 *
 * Ce qu'il n'est pas : une simulation électrique. La perte de production réelle
 * peut être supérieure — une cellule ombrée entraîne sa chaîne — ou inférieure
 * si les diodes de dérivation et les optimiseurs limitent la casse. Le champ
 * `confidence` le signale.
 *
 * @param {object} p
 * @param {number} p.latitude
 * @param {number[]} p.monthlyGhi irradiation globale horizontale, kWh/m²/jour
 * @param {number} p.tilt inclinaison des modules (degrés)
 * @param {number} p.pitch entraxe entre rangées (m)
 * @param {number} p.moduleLength longueur dans le sens de la pente (m)
 * @param {number} [p.azimuth] azimut des rangées, 0 = Sud
 * @param {number} [p.albedo]
 */
export function mutualShadingLoss({
  latitude, monthlyGhi, tilt, pitch, moduleLength, azimuth = 0, albedo = 0.2,
}) {
  const b = tilt * DEG;
  const height = moduleLength * Math.sin(b);
  const footprint = moduleLength * Math.cos(b);
  const gap = pitch - footprint;
  const limit = shadingLimitAngle({ moduleLength, tilt, pitch });

  let poaTotal = 0, beamLost = 0, shadedEnergy = 0;
  const months = [];

  for (let m = 0; m < 12; m++) {
    const days = DAYS_IN_MONTH[m];
    const day = planeOfArrayDaily({
      latitude, month: m, ghi: monthlyGhi[m], tilt, azimuth, albedo,
    });
    // Le pas de temps se déduit de la cohérence entre le détail et le total.
    const sumPoa = day.hours.reduce((a, h) => a + h.poa, 0);
    const stepH = sumPoa > 0 ? day.poa / sumPoa : 0;
    const decl = declination(MEAN_DAY[m]);

    let dayPoa = 0, dayLost = 0;
    for (const h of day.hours) {
      const energy = h.poa * stepH;
      dayPoa += energy;
      if (h.beam <= 0 || gap <= 0) {
        if (gap <= 0) dayLost += h.beam * stepH; // rangées jointives
        continue;
      }
      const elevation = Math.asin(Math.max(-1, Math.min(1, h.cosz))) / DEG;
      const offset = solarAzimuthFromDeclination(latitude, decl, h.w) - azimuth;
      const ap = profileAngle(elevation, offset);
      if (ap == null || ap >= limit) continue;

      // Hauteur d'ombre portée sur la rangée suivante, puis fraction ombrée.
      const shadowHeight = Math.min(height, Math.max(0, height - gap * Math.tan(ap * DEG)));
      const fraction = height > 0 ? shadowHeight / height : 0;
      if (fraction <= 0) continue;
      dayLost += fraction * h.beam * stepH;
      shadedEnergy += fraction * h.beam * stepH * days;
    }

    poaTotal += dayPoa * days;
    beamLost += dayLost * days;
    months.push({ month: m, poa: dayPoa * days, lost: dayLost * days });
  }

  return {
    loss: poaTotal > 0 ? beamLost / poaTotal : 0,
    limitAngle: limit,
    gap,
    height,
    footprint,
    gcr: pitch > 0 ? moduleLength / pitch : 0,
    months: months.map((x) => ({ ...x, loss: x.poa > 0 ? x.lost / x.poa : 0 })),
    confidence: 'optique',
    note: 'Perte de rayonnement direct par ombre portée. La perte électrique '
      + 'peut différer selon le câblage des chaînes et les diodes de dérivation.',
  };
}

/** Azimut solaire à partir d'une déclinaison déjà connue, pour éviter de la recalculer. */
function solarAzimuthFromDeclination(latitude, declDeg, hourAngleDeg) {
  const decl = declDeg * DEG, phi = latitude * DEG, w = hourAngleDeg * DEG;
  const cosZ = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(w);
  const sinZ = Math.sqrt(Math.max(0, 1 - cosZ * cosZ));
  if (sinZ < 1e-9 || Math.abs(Math.cos(phi)) < 1e-9) return 0;
  const cosA = (cosZ * Math.sin(phi) - Math.sin(decl)) / (sinZ * Math.cos(phi));
  const a = Math.acos(Math.max(-1, Math.min(1, cosA))) / DEG;
  return w >= 0 ? a : -a;
}

/**
 * Nombre de rangées tenant sur une profondeur donnée, et entraxe réel.
 * La dernière rangée n'a personne derrière elle : elle n'a besoin que de son
 * emprise, pas d'un entraxe complet.
 */
export function rowsInDepth({ depth, pitch, footprint }) {
  if (!(depth >= footprint)) return { rows: 0, usedDepth: 0 };
  const rows = 1 + Math.floor((depth - footprint) / pitch + 1e-9);
  return { rows, usedDepth: footprint + (rows - 1) * pitch };
}
