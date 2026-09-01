/**
 * Câblage et protections.
 *
 * Sections déterminées par le plus contraignant des deux critères :
 *  1. courant admissible (IEC 60364-5-52, méthode E — câbles en l'air libre,
 *     avec facteurs de correction de température et de groupement) ;
 *  2. chute de tension maximale admissible (usuellement 1 % côté continu et
 *     3 % côté alternatif jusqu'au point de livraison).
 *
 * Calibres de protection selon l'IEC 62548 § 7 (protection contre les
 * surintensités des chaînes et des groupes).
 */

/** Sections normalisées, mm². */
export const SECTIONS = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300];

/**
 * Courant admissible de base (A) — conducteur cuivre, isolant réticulé 90 °C,
 * pose en l'air libre, 2 conducteurs chargés, ambiance 30 °C.
 */
const AMPACITY_CU = {
  1.5: 26, 2.5: 36, 4: 49, 6: 63, 10: 86, 16: 115, 25: 149, 35: 185,
  50: 225, 70: 289, 95: 352, 120: 410, 150: 473, 185: 542, 240: 641, 300: 741,
};

/** Résistivité à la température d'emploi (Ω·mm²/m), NF C 15-100 : ρ = 1,25·ρ20. */
export const RESISTIVITY = { copper: 0.02314, aluminium: 0.03700 };
/** Rapport des courants admissibles aluminium / cuivre. */
const ALU_FACTOR = 0.78;
/** Réactance linéique usuelle des câbles basse tension (Ω/m). */
const REACTANCE = 0.00008;

/** Facteur de correction de température pour isolant 90 °C. */
export function tempCorrection(ambientC) {
  const table = [[10, 1.15], [15, 1.12], [20, 1.08], [25, 1.04], [30, 1.0],
    [35, 0.96], [40, 0.91], [45, 0.87], [50, 0.82], [55, 0.76], [60, 0.71],
    [65, 0.65], [70, 0.58], [75, 0.50], [80, 0.41]];
  if (ambientC <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (ambientC <= table[i][0]) {
      const [t0, f0] = table[i - 1], [t1, f1] = table[i];
      return f0 + (f1 - f0) * (ambientC - t0) / (t1 - t0);
    }
  }
  return 0.41;
}

/** Facteur de groupement pour circuits jointifs sur un même chemin. */
export function groupingCorrection(circuits) {
  const table = { 1: 1.0, 2: 0.85, 3: 0.79, 4: 0.75, 5: 0.73, 6: 0.72, 7: 0.72, 8: 0.71, 9: 0.70 };
  return table[Math.min(9, Math.max(1, Math.round(circuits)))] ?? 0.70;
}

/** Courant admissible corrigé d'une section donnée. */
export function ampacity(section, { material = 'copper', ambientC = 30, circuits = 1 } = {}) {
  const base = AMPACITY_CU[section];
  if (!base) return 0;
  const mat = material === 'aluminium' ? ALU_FACTOR : 1;
  return base * mat * tempCorrection(ambientC) * groupingCorrection(circuits);
}

/**
 * Chute de tension d'un tronçon.
 *
 * @param {object} p
 * @param {'dc'|'ac1'|'ac3'} p.mode  continu, monophasé, triphasé
 * @param {number} p.current  courant d'emploi (A)
 * @param {number} p.length   longueur simple du tronçon (m)
 * @param {number} p.section  section (mm²)
 * @param {number} p.voltage  tension de référence (V)
 * @param {number} [p.cosPhi] facteur de puissance (alternatif)
 */
export function voltageDrop({ mode, current, length, section, voltage, material = 'copper', cosPhi = 1 }) {
  const rho = RESISTIVITY[material] ?? RESISTIVITY.copper;
  const r = rho * length / section;
  let dropV;
  if (mode === 'dc') {
    dropV = 2 * r * current;
  } else if (mode === 'ac3') {
    const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi ** 2));
    dropV = Math.sqrt(3) * current * (r * cosPhi + REACTANCE * length * sinPhi);
  } else {
    const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi ** 2));
    dropV = 2 * current * (r * cosPhi + REACTANCE * length * sinPhi);
  }
  return { volts: dropV, percent: voltage > 0 ? (dropV / voltage) * 100 : 0 };
}

/**
 * Choisit la plus petite section normalisée satisfaisant les deux critères.
 * Retourne également la section imposée par chaque critère, pour justification
 * dans la note de calcul.
 */
export function selectSection({
  mode, current, designCurrent, length, voltage, maxDropPercent,
  material = 'copper', ambientC = 30, circuits = 1, cosPhi = 1,
}) {
  const iz = designCurrent ?? current;
  const byAmpacity = SECTIONS.find((s) => ampacity(s, { material, ambientC, circuits }) >= iz);
  const byDrop = SECTIONS.find(
    (s) => voltageDrop({ mode, current, length, section: s, voltage, material, cosPhi }).percent <= maxDropPercent,
  );
  const chosen = Math.max(byAmpacity ?? SECTIONS.at(-1), byDrop ?? SECTIONS.at(-1));
  const drop = voltageDrop({ mode, current, length, section: chosen, voltage, material, cosPhi });
  return {
    section: chosen,
    byAmpacity: byAmpacity ?? null,
    byDrop: byDrop ?? null,
    governing: (byDrop ?? 0) > (byAmpacity ?? 0) ? 'drop' : 'ampacity',
    ampacity: ampacity(chosen, { material, ambientC, circuits }),
    drop,
    ok: chosen <= SECTIONS.at(-1) && drop.percent <= maxDropPercent,
  };
}

/** Calibres normalisés de fusibles et disjoncteurs (A). */
export const RATINGS = [1, 2, 4, 6, 10, 13, 16, 20, 25, 32, 40, 50, 63, 80, 100,
  125, 160, 200, 250, 315, 400, 500, 630];

const nextRating = (a) => RATINGS.find((r) => r >= a) ?? RATINGS.at(-1);

/**
 * Protection de chaîne (fusible gPV) selon l'IEC 62548.
 * Requise dès que le nombre de chaînes en parallèle dépasse 2 : au-delà, le
 * courant inverse que peut subir une chaîne en défaut dépasse sa tenue.
 */
export function stringProtection({ isc, stringCount, moduleReverseCurrent }) {
  const required = stringCount > 2;
  if (!required) return { required: false, reason: 'stringCount<=2' };
  const min = 1.5 * isc;
  const max = Math.min(2.4 * isc, moduleReverseCurrent ?? Infinity);
  const rating = nextRating(min);
  return {
    required: true, min, max, rating,
    ok: rating <= max,
    cableMinCurrent: 1.25 * isc,
  };
}

/** Protection générale côté continu (groupe de chaînes). */
export function arrayProtection({ isc, stringCount }) {
  const design = 1.25 * isc * stringCount;
  return { designCurrent: design, rating: nextRating(design) };
}

/** Disjoncteur de raccordement côté alternatif. */
export function acProtection({ inverterPacW, voltage, phases = 1, cosPhi = 1 }) {
  const current = phases === 3
    ? inverterPacW / (Math.sqrt(3) * voltage * cosPhi)
    : inverterPacW / (voltage * cosPhi);
  const design = current * 1.25;
  return { current, designCurrent: design, rating: nextRating(design), phases };
}

/**
 * Besoin en parafoudres selon l'exposition et la longueur des liaisons
 * (approche du guide UTE C 15-712-1 : critère de longueur critique).
 */
export function surgeProtection({ dcCableLengthM, keraunicLevel = 25, hasLps = false }) {
  const lCrit = 115 / Math.max(keraunicLevel, 1) * 1000; // longueur critique, m
  return {
    criticalLengthM: lCrit,
    dcRequired: hasLps || dcCableLengthM > lCrit,
    acRequired: keraunicLevel >= 25,
    type: hasLps ? 'Type 1+2' : 'Type 2',
  };
}
