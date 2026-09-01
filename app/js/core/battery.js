/**
 * Dimensionnement du stockage et du régulateur de charge — installations
 * autonomes (off-grid) et hybrides.
 */

/** Tension de bus recommandée selon la puissance de l'installation. */
export function recommendedBusVoltage(dailyEnergyKwh) {
  if (dailyEnergyKwh < 2) return 12;
  if (dailyEnergyKwh < 6) return 24;
  return 48;
}

/**
 * Capacité de banc nécessaire.
 *
 * @param {object} p
 * @param {number} p.dailyEnergyKwh consommation journalière à couvrir
 * @param {number} p.autonomyDays   jours d'autonomie sans production
 * @param {number} p.dod            profondeur de décharge admissible (0-1)
 * @param {number} p.busVoltage     tension du bus continu (V)
 * @param {number} [p.roundTrip]    rendement de cycle du banc
 * @param {number} [p.inverterEff]  rendement de l'onduleur/chargeur
 * @param {number} [p.wiringEff]    rendement du câblage
 * @param {number} [p.tempDerate]   déclassement lié à la température (0-1)
 */
export function sizeBank({
  dailyEnergyKwh, autonomyDays = 1, dod = 0.8, busVoltage = 48,
  roundTrip = 0.92, inverterEff = 0.94, wiringEff = 0.98, tempDerate = 1,
}) {
  const useful = dailyEnergyKwh * autonomyDays / (inverterEff * wiringEff);
  const gross = useful / (dod * roundTrip * tempDerate);
  return {
    usefulKwh: useful,
    grossKwh: gross,
    capacityAh: gross * 1000 / busVoltage,
    busVoltage,
  };
}

/**
 * Association série/parallèle d'un modèle de batterie pour atteindre la
 * capacité et la tension visées.
 */
export function arrangeBank({ battery, targetKwh, busVoltage }) {
  const series = Math.max(1, Math.round(busVoltage / battery.vNom));
  const unitKwh = battery.capacityAh * battery.vNom / 1000;
  const stringKwh = unitKwh * series;
  const parallel = Math.max(1, Math.ceil(targetKwh / stringKwh));
  const count = series * parallel;
  return {
    series, parallel, count,
    installedKwh: count * unitKwh,
    usableKwh: count * unitKwh * (battery.dod ?? 0.8),
    busVoltage: series * battery.vNom,
    massKg: battery.massKg ? count * battery.massKg : null,
  };
}

/**
 * Régulateur de charge : courant de charge maximal côté batterie.
 * Marge de 25 % conforme aux pratiques d'installation (courant permanent).
 */
export function sizeChargeController({ pvKwp, busVoltage, type = 'mppt', moduleIsc = 0, stringCount = 0 }) {
  if (type === 'mppt') {
    const current = (pvKwp * 1000) / busVoltage * 1.25;
    return { type, currentA: current, note: 'courant côté batterie, marge 25 %' };
  }
  // Un régulateur PWM travaille au courant du champ, pas à sa puissance.
  const current = moduleIsc * stringCount * 1.25;
  return { type, currentA: current, note: 'courant côté champ, marge 25 %' };
}

/**
 * Puissance apparente minimale de l'onduleur autonome, en tenant compte des
 * pointes de démarrage des charges inductives.
 */
export function sizeOffGridInverter({ peakLoadW, surgeFactor = 1.3, powerFactor = 0.9 }) {
  return {
    continuousW: peakLoadW * surgeFactor,
    apparentVa: (peakLoadW * surgeFactor) / powerFactor,
    surgeW: peakLoadW * 3,
  };
}
