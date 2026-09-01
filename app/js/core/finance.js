/**
 * Analyse économique : flux de trésorerie sur la durée de vie, valeur actuelle
 * nette, taux de rentabilité interne, temps de retour et coût actualisé de
 * l'énergie (LCOE).
 */

/**
 * Construit la chronique de flux annuels.
 *
 * @param {object} p
 * @param {number} p.capex                investissement initial
 * @param {number} p.annualProduction     production année 1 (kWh)
 * @param {number} p.selfConsumptionRate  part autoconsommée (0-1)
 * @param {number} p.tariffBuy            prix d'achat du kWh au réseau
 * @param {number} p.tariffSell           prix de revente du kWh injecté
 * @param {number} [p.opexRate]           OPEX annuel en % du CAPEX
 * @param {number} [p.opexFixed]          OPEX annuel fixe
 * @param {number} [p.degradation]        dégradation annuelle des modules
 * @param {number} [p.tariffEscalation]   inflation annuelle du prix de l'énergie
 * @param {number} [p.discountRate]       taux d'actualisation
 * @param {number} [p.years]              horizon d'étude
 * @param {number} [p.subsidy]            prime ou subvention déduite du CAPEX
 * @param {Array<{year:number,amount:number}>} [p.replacements] remplacements
 */
export function cashflows({
  capex, annualProduction, selfConsumptionRate, tariffBuy, tariffSell,
  opexRate = 0.01, opexFixed = 0, degradation = 0.005, tariffEscalation = 0.02,
  discountRate = 0.06, years = 25, subsidy = 0, replacements = [],
}) {
  const netCapex = capex - subsidy;
  const rows = [{
    year: 0, production: 0, savings: 0, revenue: 0, opex: 0,
    net: -netCapex, discounted: -netCapex,
    cumulative: -netCapex, cumulativeDiscounted: -netCapex,
  }];
  let cum = -netCapex, cumD = -netCapex;

  for (let y = 1; y <= years; y++) {
    const production = annualProduction * (1 - degradation) ** (y - 1);
    const escal = (1 + tariffEscalation) ** (y - 1);
    const selfUsed = production * selfConsumptionRate;
    const exported = production - selfUsed;
    const savings = selfUsed * tariffBuy * escal;
    const revenue = exported * tariffSell * escal;
    const replacement = replacements
      .filter((r) => r.year === y)
      .reduce((s, r) => s + r.amount, 0);
    const opex = (capex * opexRate + opexFixed) * escal + replacement;
    const net = savings + revenue - opex;
    const discounted = net / (1 + discountRate) ** y;
    cum += net; cumD += discounted;
    rows.push({
      year: y, production, savings, revenue, opex, replacement,
      net, discounted, cumulative: cum, cumulativeDiscounted: cumD,
    });
  }
  return rows;
}

/** Valeur actuelle nette d'une chronique. */
export const npv = (rows) => rows.reduce((s, r) => s + r.discounted, 0);

/**
 * Taux de rentabilité interne, par dichotomie sur [-0.95, 2].
 * Retourne null si aucun changement de signe (projet jamais rentable).
 */
export function irr(rows) {
  const f = (rate) => rows.reduce((s, r) => s + r.net / (1 + rate) ** r.year, 0);
  let lo = -0.95, hi = 2.0;
  let flo = f(lo), fhi = f(hi);
  if (flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2, fm = f(mid);
    if (Math.abs(fm) < 1e-9) return mid;
    if (flo * fm <= 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}

/** Temps de retour (années, interpolé), simple ou actualisé. */
export function payback(rows, { discounted = false } = {}) {
  const key = discounted ? 'cumulativeDiscounted' : 'cumulative';
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][key] >= 0) {
      const prev = rows[i - 1][key];
      const delta = rows[i][key] - prev;
      return delta === 0 ? rows[i].year : rows[i - 1].year + (-prev / delta);
    }
  }
  return null;
}

/**
 * Coût actualisé de l'énergie : somme actualisée des coûts divisée par la
 * somme actualisée de l'énergie produite.
 */
export function lcoe({ capex, subsidy = 0, annualProduction, opexRate = 0.01,
  opexFixed = 0, degradation = 0.005, discountRate = 0.06, years = 25,
  replacements = [] }) {
  let costs = capex - subsidy, energy = 0;
  for (let y = 1; y <= years; y++) {
    const replacement = replacements.filter((r) => r.year === y).reduce((s, r) => s + r.amount, 0);
    costs += (capex * opexRate + opexFixed + replacement) / (1 + discountRate) ** y;
    energy += annualProduction * (1 - degradation) ** (y - 1) / (1 + discountRate) ** y;
  }
  return energy > 0 ? costs / energy : null;
}

/**
 * CO₂ évité sur la durée de vie.
 * @param {number} annualProduction kWh/an
 * @param {number} gridFactor       kg CO₂ eq / kWh du réseau
 * @param {number} pvFootprint      kg CO₂ eq / kWh du solaire (ACV, ~0,04)
 */
export function carbonAvoided({ annualProduction, gridFactor = 0.45, pvFootprint = 0.04, years = 25, degradation = 0.005 }) {
  let total = 0;
  for (let y = 1; y <= years; y++) total += annualProduction * (1 - degradation) ** (y - 1);
  const avoided = total * (gridFactor - pvFootprint);
  return {
    lifetimeKwh: total,
    avoidedKg: avoided,
    avoidedTons: avoided / 1000,
    equivalentTreesYear: avoided / 25, // ~25 kg CO₂ absorbés par arbre et par an
    equivalentKmCar: avoided / 0.12,   // ~120 g CO₂/km
  };
}
