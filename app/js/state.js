/**
 * Modèle de projet, persistance locale et chaîne de calcul complète.
 *
 * Toutes les données restent dans le navigateur (localStorage) : aucune donnée
 * client n'est envoyée à un serveur. C'est un argument commercial autant qu'un
 * choix de conformité.
 */

import { SITES, findSite, GRID_CARBON } from './data/sites.js';
import { MODULES, INVERTERS, BATTERIES, DEFAULT_COSTS } from './data/components.js';
import { optimalTilt } from './core/solar.js';
import { configureArray, inverterCount } from './core/sizing.js';
import { simulate, selfConsumption, DEFAULT_LOSSES } from './core/energy.js';
import { layoutField, simulateField } from './core/field.js';
import { blankSurface } from './model/surface.js';
import * as bat from './core/battery.js';
import * as cab from './core/cabling.js';
import * as fin from './core/finance.js';

const STORAGE_KEY = 'solarys.projects.v1';

/** Projet vierge avec des valeurs par défaut raisonnables. */
export function blankProject() {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    meta: {
      name: 'Nouveau projet',
      client: '', reference: '', address: '', engineer: '',
      systemType: 'grid',       // grid | hybrid | offgrid
      installType: 'roof',      // roof | ground | carport
    },
    site: {
      siteId: 'tn-tunis',
      lat: 36.80, lon: 10.18, country: 'Tunisie',
      ghi: null, ta: null,      // null = valeurs du site de référence
      tMin: 0, tMaxAmb: 44, albedo: 0.2,
      tilt: 30, azimuth: 0, autoTilt: true,
    },
    load: {
      mode: 'bill',             // bill | appliances | monthly
      annualKwh: 6000,
      monthlyKwh: null,
      appliances: [],
      peakLoadW: 3000,
      dailyKwh: null,
      profile: 'residential',   // residential | office | industrial
    },
    // Surfaces d'implantation : c'est d'elles que vient le nombre de modules
    // réellement posables, et non d'une puissance décidée à l'avance.
    surfaces: [blankSurface()],
    array: {
      moduleId: 'gen-mono-550',
      inverterId: 'inv-5k-1p',
      targetKwp: 5,
      // 'demand'  : puissance déduite du besoin
      // 'surface' : puissance déduite du calepinage réel
      // 'manual'  : puissance imposée
      sizingMode: 'demand',
      autoTarget: true,
      inverterQty: 1,
      losses: { ...DEFAULT_LOSSES },
    },
    storage: {
      enabled: false,
      batteryId: 'bat-lfp-51-100',
      autonomyDays: 1,
      busVoltage: 48,
      controllerType: 'mppt',
    },
    cabling: {
      stringLengthM: 30, arrayLengthM: 20, acLengthM: 15,
      maxDropDc: 1.0, maxDropAc: 3.0,
      material: 'copper', ambientC: 45, circuits: 2,
      keraunicLevel: 25, hasLps: false,
    },
    economics: {
      currency: 'EUR', currencySymbol: '€',
      costs: { ...DEFAULT_COSTS },
      capexOverride: null,
      subsidy: 0,
      tariffBuy: 0.22, tariffSell: 0.08,
      opexRate: 0.01, opexFixed: 0,
      degradation: 0.005, tariffEscalation: 0.02,
      discountRate: 0.06, years: 25,
      gridCarbon: 0.47,
    },
    branding: { company: '', logoDataUrl: null, phone: '', email: '', color: '#f59e0b' },
    // Métadonnées du dossier d'exécution : elles alimentent le cartouche de
    // chaque planche, à la manière d'un dossier de plans normalisé.
    dossier: {
      documentNo: '', format: 'A3', echelle: 'NTS',
      preparedBy: '', checkedBy: '', approvedBy: '',
      revisions: [
        { rev: '01', date: new Date().toISOString().slice(0, 10), designation: 'Établissement' },
      ],
      notes: [],
    },
  };
}

/* ------------------------------------------------------------------ */
/* Persistance                                                         */
/* ------------------------------------------------------------------ */

const readJson = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
};
const writeJson = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
};

export const loadProjects = () => readJson(STORAGE_KEY, []);
export const saveProjects = (list) => writeJson(STORAGE_KEY, list);
// Les préférences vivent dans `prefs.js`, sans dépendance : la page d'arrivée
// après paiement y dépose la licence sans charger le moteur de calcul.
export { loadPrefs, savePrefs } from './prefs.js';

/** Enregistre un projet (création ou mise à jour) et renvoie la liste. */
export function upsertProject(project) {
  const list = loadProjects();
  project.updatedAt = new Date().toISOString();
  const i = list.findIndex((p) => p.id === project.id);
  if (i >= 0) list[i] = project; else list.unshift(project);
  saveProjects(list);
  return list;
}

export function deleteProject(id) {
  const list = loadProjects().filter((p) => p.id !== id);
  saveProjects(list);
  return list;
}

/* ------------------------------------------------------------------ */
/* Chaîne de calcul                                                    */
/* ------------------------------------------------------------------ */

const byId = (list, id) => list.find((x) => x.id === id) ?? list[0];

/** Consommation annuelle retenue, quelle que soit la méthode de saisie. */
export function annualConsumption(project) {
  const l = project.load;
  if (l.mode === 'monthly' && Array.isArray(l.monthlyKwh)) {
    return l.monthlyKwh.reduce((s, v) => s + (Number(v) || 0), 0);
  }
  if (l.mode === 'appliances') {
    const daily = l.appliances.reduce(
      (s, a) => s + (Number(a.power) || 0) * (Number(a.hours) || 0) * (Number(a.qty) || 1) / 1000, 0);
    return daily * 365;
  }
  return Number(l.annualKwh) || 0;
}

/** Puissance crête conseillée pour couvrir un besoin donné. */
export function suggestKwp(project, specificYield = 1500) {
  const cons = annualConsumption(project);
  if (project.meta.systemType === 'offgrid') {
    // En autonome, on dimensionne sur le mois le plus défavorable avec marge.
    return Math.max(0.3, (cons / 365) * 365 / (specificYield * 0.65));
  }
  return Math.max(0.3, cons / specificYield);
}

/**
 * Exécute l'ensemble des calculs pour un projet.
 * Fonction pure : ne modifie pas le projet, renvoie un objet de résultats.
 */
export function computeAll(project) {
  const warnings = [];
  const site = findSite(project.site.siteId) ?? SITES[0];
  const ghi = project.site.ghi ?? site.ghi;
  const ta = project.site.ta ?? site.ta;
  const lat = Number(project.site.lat) || site.lat;

  const tilt = project.site.autoTilt
    ? optimalTilt(lat, ghi, Number(project.site.azimuth) || 0, project.site.albedo)
    : Number(project.site.tilt);
  const azimuth = Number(project.site.azimuth) || 0;

  const module = byId(MODULES, project.array.moduleId);
  const inverter = byId(INVERTERS, project.array.inverterId);
  const consumption = annualConsumption(project);

  // Première passe : estimation du productible spécifique pour 1 kWc, afin de
  // proposer une puissance cible cohérente avec le besoin.
  const probe = simulate({
    latitude: lat, monthlyGhi: ghi, monthlyTa: ta, tilt, azimuth, kwp: 1,
    gammaPmax: module.gammaPmax, noct: module.noct,
    inverterEff: inverter.effEuro, losses: project.array.losses, albedo: project.site.albedo,
  });

  // Calepinage : combien de modules tiennent réellement sur les surfaces.
  const field = layoutField({
    surfaces: project.surfaces ?? [], module, latitude: lat,
  });
  field.issues.forEach((i) => warnings.push(i));

  const mode = project.array.sizingMode
    ?? (project.array.autoTarget ? 'demand' : 'manual');
  const useLayout = mode === 'surface' && field.totalKwp > 0;

  const targetKwp = useLayout
    ? field.totalKwp
    : (mode === 'demand'
      ? suggestKwp(project, probe.annual.specificYield)
      : Number(project.array.targetKwp) || 1);

  // Le calepinage sert d'alerte même quand il ne pilote pas le dimensionnement :
  // annoncer une puissance qui ne tient pas sur la toiture est le défaut le
  // plus coûteux qu'un outil de ce type puisse commettre.
  if (!useLayout && field.totalKwp > 0 && targetKwp > field.totalKwp * 1.001) {
    warnings.push({
      level: 'warn', code: 'layout.exceedsSurface',
      detail: { needed: targetKwp, fits: field.totalKwp },
    });
  }

  const nInverters = Math.max(1, project.array.inverterQty || inverterCount(targetKwp, inverter));
  const perInverterKwp = targetKwp / nInverters;

  const config = configureArray({
    module, inverter, targetKwp: perInverterKwp,
    temps: { tMin: Number(project.site.tMin), tCellMax: Number(project.site.tMaxAmb) + 25 },
  });

  if (!config.feasible) {
    warnings.push({ level: 'error', code: 'array.infeasible', issues: config.issues });
  }
  config.issues?.forEach((i) => warnings.push(i));

  const kwp = (config.kwp ?? 0) * nInverters;
  const moduleCount = (config.moduleCount ?? 0) * nInverters;

  // Deuxième passe : production réelle. Quand le calepinage pilote, chaque
  // surface est simulée avec SA propre inclinaison et SON azimut, puis les
  // productions sont additionnées — une orientation moyenne donnerait faux.
  const production = (useLayout && simulateField({
    layouts: field.layouts, latitude: lat, monthlyGhi: ghi, monthlyTa: ta,
    module, inverterEff: inverter.effEuro,
    losses: project.array.losses, albedo: project.site.albedo,
  })) || simulate({
    latitude: lat, monthlyGhi: ghi, monthlyTa: ta, tilt, azimuth, kwp,
    gammaPmax: module.gammaPmax, noct: module.noct,
    inverterEff: inverter.effEuro, losses: project.array.losses, albedo: project.site.albedo,
  });

  /* --- Stockage -------------------------------------------------- */
  let storage = null;
  if (project.storage.enabled || project.meta.systemType !== 'grid') {
    const battery = byId(BATTERIES, project.storage.batteryId);
    const dailyKwh = consumption / 365;
    const busVoltage = Number(project.storage.busVoltage) || bat.recommendedBusVoltage(dailyKwh);
    const need = bat.sizeBank({
      dailyEnergyKwh: dailyKwh,
      autonomyDays: Number(project.storage.autonomyDays) || 1,
      dod: battery.dod, busVoltage, roundTrip: battery.roundTrip,
    });
    const bank = bat.arrangeBank({ battery, targetKwh: need.grossKwh, busVoltage });
    const controller = bat.sizeChargeController({
      pvKwp: kwp, busVoltage: bank.busVoltage, type: project.storage.controllerType,
      moduleIsc: module.isc, stringCount: (config.stringCount ?? 0) * nInverters,
    });
    const offGridInv = bat.sizeOffGridInverter({ peakLoadW: Number(project.load.peakLoadW) || 0 });
    storage = { battery, need, bank, controller, offGridInv, busVoltage: bank.busVoltage };
    // Une batterie LFP 51,2 V constitue un « système 48 V » : on n'alerte que
    // sur un écart réellement significatif de tension de bus.
    if (Math.abs(bank.busVoltage - busVoltage) / busVoltage > 0.15) {
      warnings.push({ level: 'warn', code: 'bus.adjusted', detail: { from: busVoltage, to: bank.busVoltage } });
    }
  }

  /* --- Câblage et protections ------------------------------------ */
  const c = project.cabling;
  const stringVoltage = config.vmpStringHot ?? 400;
  const stringSection = cab.selectSection({
    mode: 'dc', current: config.stringCurrent ?? 0,
    designCurrent: 1.25 * (config.stringCurrentSc ?? 0),
    length: Number(c.stringLengthM), voltage: stringVoltage,
    maxDropPercent: Number(c.maxDropDc), material: c.material,
    ambientC: Number(c.ambientC), circuits: Number(c.circuits),
  });
  const arrayProt = cab.arrayProtection({
    isc: config.stringCurrentSc ?? 0, stringCount: config.stringCount ?? 1,
  });
  const arraySection = cab.selectSection({
    mode: 'dc', current: config.arrayCurrent ?? 0, designCurrent: arrayProt.designCurrent,
    length: Number(c.arrayLengthM), voltage: stringVoltage,
    maxDropPercent: Number(c.maxDropDc), material: c.material,
    ambientC: Number(c.ambientC), circuits: 1,
  });
  const acProt = cab.acProtection({
    inverterPacW: inverter.pacNom * nInverters, voltage: inverter.vacNom,
    phases: inverter.phases, cosPhi: 1,
  });
  const acSection = cab.selectSection({
    mode: inverter.phases === 3 ? 'ac3' : 'ac1',
    current: acProt.current, designCurrent: acProt.designCurrent,
    length: Number(c.acLengthM), voltage: inverter.vacNom,
    maxDropPercent: Number(c.maxDropAc), material: c.material,
    ambientC: Number(c.ambientC), circuits: 1, cosPhi: 1,
  });
  const stringProt = cab.stringProtection({
    isc: module.isc, stringCount: config.stringCount ?? 1,
    moduleReverseCurrent: module.reverseCurrent,
  });
  const surge = cab.surgeProtection({
    dcCableLengthM: Number(c.stringLengthM) + Number(c.arrayLengthM),
    keraunicLevel: Number(c.keraunicLevel), hasLps: c.hasLps,
  });
  if (!stringSection.ok) warnings.push({ level: 'warn', code: 'cable.dc.oversized' });
  if (!acSection.ok) warnings.push({ level: 'warn', code: 'cable.ac.oversized' });
  if (stringProt.required && !stringProt.ok) warnings.push({ level: 'error', code: 'fuse.impossible' });

  /* --- Autoconsommation ------------------------------------------ */
  const sc = selfConsumption({
    annualProduction: production.annual.ac,
    annualConsumption: consumption,
    hasBattery: !!storage,
    batteryKwh: storage?.bank.usableKwh ?? 0,
  });

  /* --- Économie --------------------------------------------------- */
  const e = project.economics;
  const costs = e.costs;
  const bom = buildBom({ project, module, inverter, nInverters, moduleCount, kwp, storage, costs,
    stringSection, arraySection, acSection, arrayProt, acProt, stringProt, config });
  const capex = e.capexOverride != null && e.capexOverride !== ''
    ? Number(e.capexOverride)
    : bom.reduce((s, r) => s + r.total, 0);

  const replacements = [];
  if (storage && (storage.battery.chemistry === 'agm' || storage.battery.chemistry === 'gel')) {
    replacements.push({ year: 8, amount: storage.bank.installedKwh * costs.batteryPerKwh });
    replacements.push({ year: 16, amount: storage.bank.installedKwh * costs.batteryPerKwh });
  }
  replacements.push({ year: 13, amount: inverter.pacNom * nInverters * costs.inverterPerWac });

  const rows = fin.cashflows({
    capex, annualProduction: production.annual.ac, selfConsumptionRate: sc.rate,
    tariffBuy: Number(e.tariffBuy), tariffSell: Number(e.tariffSell),
    opexRate: Number(e.opexRate), opexFixed: Number(e.opexFixed),
    degradation: Number(e.degradation), tariffEscalation: Number(e.tariffEscalation),
    discountRate: Number(e.discountRate), years: Number(e.years),
    subsidy: Number(e.subsidy), replacements,
  });

  const economics = {
    capex, bom, rows,
    npv: fin.npv(rows),
    irr: fin.irr(rows),
    payback: fin.payback(rows),
    paybackDiscounted: fin.payback(rows, { discounted: true }),
    lcoe: fin.lcoe({
      capex, subsidy: Number(e.subsidy), annualProduction: production.annual.ac,
      opexRate: Number(e.opexRate), opexFixed: Number(e.opexFixed),
      degradation: Number(e.degradation), discountRate: Number(e.discountRate),
      years: Number(e.years), replacements,
    }),
    costPerWp: kwp > 0 ? capex / (kwp * 1000) : 0,
    year1Savings: rows[1] ? rows[1].savings + rows[1].revenue : 0,
  };

  const carbon = fin.carbonAvoided({
    annualProduction: production.annual.ac,
    gridFactor: Number(e.gridCarbon) || GRID_CARBON[site.country] || 0.45,
    years: Number(e.years), degradation: Number(e.degradation),
  });

  return {
    site, lat, tilt, azimuth, ghi, ta,
    module, inverter, nInverters, config,
    kwp: useLayout ? field.totalKwp : kwp,
    moduleCount: useLayout ? field.totalCount : moduleCount,
    field, sizingMode: mode, layoutDriven: useLayout,
    production, consumption, selfConsumption: sc,
    storage, economics, carbon, warnings,
    cabling: { stringSection, arraySection, acSection, stringProt, arrayProt, acProt, surge },
  };
}

/** Nomenclature chiffrée. */
function buildBom({ project, module, inverter, nInverters, moduleCount, kwp, storage,
  costs, stringSection, arraySection, acSection, arrayProt, acProt, stringProt, config }) {
  const wp = kwp * 1000;
  const rows = [];
  const add = (key, label, qty, unit, price) =>
    rows.push({ key, label, qty, unit, price, total: qty * price });

  add('module', `Module ${module.label}`, moduleCount, 'u', module.pmax * costs.modulePerWp);
  add('inverter', `Onduleur ${inverter.label}`, nInverters, 'u', inverter.pacNom * costs.inverterPerWac);
  if (storage) {
    add('battery', `Batterie ${storage.battery.label}`, storage.bank.count, 'u',
      storage.battery.capacityAh * storage.battery.vNom / 1000 * costs.batteryPerKwh);
    if (project.meta.systemType === 'offgrid') {
      add('controller', `Régulateur ${storage.controller.type.toUpperCase()} ${Math.ceil(storage.controller.currentA)} A`,
        1, 'u', storage.controller.currentA * 6);
    }
  }
  add('mounting', 'Structure de fixation', wp, 'Wc', costs.mountingPerWp);
  add('cabling', `Câblage DC ${stringSection.section} mm² / AC ${acSection.section} mm² + coffrets`,
    wp, 'Wc', costs.cablingPerWp);
  if (stringProt.required) {
    add('fuses', `Fusibles gPV ${stringProt.rating} A`, (config.stringCount ?? 1) * 2 * nInverters, 'u', 9);
  }
  add('protection', `Protections ${arrayProt.rating} A DC / ${acProt.rating} A AC + parafoudres`, 1, 'lot', 260);
  add('labour', 'Pose et mise en service', wp, 'Wc', costs.labourPerWp);
  add('engineering', 'Études, démarches et raccordement', 1, 'lot', costs.engineeringFixed);
  const subtotal = rows.reduce((s, r) => s + r.total, 0);
  if (costs.marginRate > 0) {
    add('margin', 'Frais généraux et marge', 1, 'lot', subtotal * costs.marginRate);
  }
  return rows;
}

export { SITES, MODULES, INVERTERS, BATTERIES, DEFAULT_COSTS, GRID_CARBON };
