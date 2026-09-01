/**
 * Modèle de production : de l'irradiation dans le plan des modules à l'énergie
 * injectée au point de livraison, avec un ratio de performance détaillé poste
 * par poste (méthode IEC 61724 / guide « Performance Ratio »).
 */

import { planeOfArrayDaily, cellTemperature, DAYS_IN_MONTH } from './solar.js';

/** Pertes par défaut, en fraction (0.02 = 2 %). Valeurs usuelles de la profession. */
export const DEFAULT_LOSSES = {
  soiling: 0.03,      // salissure / poussière
  shading: 0.02,      // masques proches et lointains
  mismatch: 0.02,     // dispersion des modules
  wiringDc: 0.015,    // câblage continu
  wiringAc: 0.01,     // câblage alternatif + transformateur
  lid: 0.015,         // dégradation initiale induite par la lumière
  nameplate: 0.01,    // tolérance de puissance
  availability: 0.01, // indisponibilité (maintenance, réseau)
};

/** Produit des rendements complémentaires des pertes fournies. */
export function lossFactor(losses = DEFAULT_LOSSES) {
  return Object.values(losses).reduce((acc, l) => acc * (1 - l), 1);
}

/**
 * Production mensuelle et annuelle.
 *
 * @param {object} p
 * @param {number} p.latitude
 * @param {number[]} p.monthlyGhi   irradiation globale horizontale, kWh/m²/jour
 * @param {number[]} p.monthlyTa    température ambiante moyenne, °C
 * @param {number} p.tilt
 * @param {number} p.azimuth
 * @param {number} p.kwp            puissance crête installée
 * @param {number} p.gammaPmax      coefficient de puissance, %/°C (négatif)
 * @param {number} p.noct
 * @param {number} p.inverterEff    rendement européen de l'onduleur (0-1)
 * @param {object} [p.losses]
 * @param {number} [p.albedo]
 * @returns {object} détail mensuel + agrégats annuels
 */
export function simulate({
  latitude, monthlyGhi, monthlyTa, tilt, azimuth, kwp,
  gammaPmax = -0.35, noct = 45, inverterEff = 0.97,
  losses = DEFAULT_LOSSES, albedo = 0.2,
}) {
  const kLoss = lossFactor(losses);
  const months = [];
  let annualPoa = 0, annualAc = 0, annualDc = 0, annualGhi = 0;

  for (let m = 0; m < 12; m++) {
    const days = DAYS_IN_MONTH[m];
    const poa = planeOfArrayDaily({
      latitude, month: m, ghi: monthlyGhi[m], tilt, azimuth, albedo,
    });

    // Rendement thermique pondéré par l'irradiance : chaque pas de temps est
    // pesé par son énergie, ce qui évite de surestimer l'effet des heures
    // faiblement ensoleillées où la cellule est froide.
    let weighted = 0, total = 0;
    for (const h of poa.hours) {
      const g = h.poa * 1000; // W/m²
      const tc = cellTemperature(monthlyTa[m], g, noct);
      const eff = 1 + (gammaPmax / 100) * (tc - 25);
      weighted += g * eff;
      total += g;
    }
    const thermal = total > 0 ? weighted / total : 1;

    const dcDay = kwp * poa.poa * thermal * kLoss;   // kWh/jour
    const acDay = dcDay * inverterEff;
    const dcMonth = dcDay * days;
    const acMonth = acDay * days;

    months.push({
      month: m, days,
      ghi: monthlyGhi[m] * days,
      poa: poa.poa * days,
      poaDaily: poa.poa,
      ta: monthlyTa[m],
      thermalFactor: thermal,
      dc: dcMonth,
      ac: acMonth,
      specific: acMonth / kwp,                       // kWh/kWc
      pr: poa.poa > 0 ? acDay / (kwp * poa.poa) : 0, // ratio de performance
    });

    annualPoa += poa.poa * days;
    annualGhi += monthlyGhi[m] * days;
    annualDc += dcMonth;
    annualAc += acMonth;
  }

  return {
    months,
    annual: {
      ghi: annualGhi,
      poa: annualPoa,
      transpositionGain: annualGhi > 0 ? annualPoa / annualGhi : 1,
      dc: annualDc,
      ac: annualAc,
      specificYield: annualAc / kwp,
      performanceRatio: annualPoa > 0 ? annualAc / (kwp * annualPoa) : 0,
      fullLoadHours: annualAc / kwp,
    },
    lossBreakdown: buildLossBreakdown({ annualPoa, kwp, losses, inverterEff, months }),
  };
}

/** Diagramme des pertes en kWh/an, du champ irradié à l'énergie livrée. */
function buildLossBreakdown({ annualPoa, kwp, losses, inverterEff, months }) {
  const nominal = kwp * annualPoa / 1; // production sans aucune perte, kWh
  const steps = [];
  let current = nominal;

  // Perte thermique moyenne pondérée par la production mensuelle.
  const totalPoa = months.reduce((s, m) => s + m.poa, 0);
  const thermal = totalPoa > 0
    ? months.reduce((s, m) => s + m.thermalFactor * m.poa, 0) / totalPoa
    : 1;
  const push = (key, factor) => {
    const after = current * factor;
    steps.push({ key, loss: current - after, factor });
    current = after;
  };

  push('temperature', thermal);
  for (const [key, value] of Object.entries(losses)) push(key, 1 - value);
  push('inverter', inverterEff);

  return { nominal, steps, final: current };
}

/**
 * Répartition autoconsommation / injection à partir d'un taux estimé.
 * Le taux d'autoconsommation dépend de la simultanéité entre production et
 * consommation ; à défaut de courbe de charge horaire, on utilise une
 * corrélation empirique fonction du ratio production/consommation.
 */
export function selfConsumption({ annualProduction, annualConsumption, hasBattery = false, batteryKwh = 0 }) {
  if (annualConsumption <= 0) {
    return { rate: 0, selfUsed: 0, exported: annualProduction, imported: 0, coverage: 0 };
  }
  const ratio = annualProduction / annualConsumption;
  // Corrélation usuelle (type « Sonnenertrag / ADEME ») : sans stockage le taux
  // d'autoconsommation décroît rapidement quand la production dépasse le besoin.
  let rate = ratio <= 0 ? 0 : Math.min(1, 0.32 / Math.max(ratio, 0.05) ** 0.55);
  rate = Math.min(rate, 0.95);
  if (hasBattery && batteryKwh > 0) {
    const dailyCons = annualConsumption / 365;
    const boost = Math.min(0.35, 0.30 * Math.min(1, batteryKwh / Math.max(dailyCons * 0.5, 0.1)));
    rate = Math.min(0.98, rate + boost);
  }
  const selfUsed = Math.min(annualProduction * rate, annualConsumption);
  return {
    rate: selfUsed / annualProduction,
    selfUsed,
    exported: annualProduction - selfUsed,
    imported: annualConsumption - selfUsed,
    coverage: selfUsed / annualConsumption,
  };
}
