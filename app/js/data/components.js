/**
 * Bibliothèques de composants livrées avec l'application.
 *
 * Choix assumé : ces entrées sont des ARCHÉTYPES GÉNÉRIQUES, représentatifs des
 * familles de produits du marché, et non des copies de fiches techniques de
 * fabricants. Deux raisons :
 *  - exactitude : une caractéristique recopiée devient fausse à la révision
 *    suivante du produit, et un dimensionnement faux engage l'installateur ;
 *  - propriété intellectuelle : les fiches techniques et visuels des fabricants
 *    ne sont pas librement redistribuables.
 *
 * L'utilisateur crée sa propre bibliothèque à partir des fiches techniques de
 * ses fournisseurs (formulaire « Composants » ou import CSV/JSON). Les
 * archétypes servent d'avant-projet et de valeurs par défaut.
 */

/**
 * @typedef {object} PvModule
 * @property {string} id
 * @property {string} label
 * @property {string} technology       techno de cellule
 * @property {number} pmax             puissance crête STC (W)
 * @property {number} voc              tension à vide STC (V)
 * @property {number} vmp              tension MPP STC (V)
 * @property {number} isc              courant de court-circuit STC (A)
 * @property {number} impp             courant MPP STC (A)
 * @property {number} betaVoc          coefficient de température de Voc (%/°C)
 * @property {number} alphaIsc         coefficient de température de Isc (%/°C)
 * @property {number} gammaPmax        coefficient de température de Pmax (%/°C)
 * @property {number} noct             température nominale d'utilisation (°C)
 * @property {number} length           longueur (m)
 * @property {number} width            largeur (m)
 * @property {number} massKg
 * @property {number} efficiency       rendement (0-1)
 * @property {number} reverseCurrent   courant inverse admissible (A)
 * @property {number} systemVoltage    tension système maximale (V)
 */

/** @type {PvModule[]} */
export const MODULES = [
  {
    id: 'gen-mono-330', label: 'Monocristallin 330 Wc (60 cellules)',
    technology: 'mono-PERC', pmax: 330, voc: 40.9, vmp: 34.0, isc: 10.30, impp: 9.71,
    betaVoc: -0.28, alphaIsc: 0.048, gammaPmax: -0.37, noct: 45,
    length: 1.684, width: 1.002, massKg: 18.5, efficiency: 0.196,
    reverseCurrent: 20, systemVoltage: 1000,
  },
  {
    id: 'gen-mono-410', label: 'Monocristallin 410 Wc (108 demi-cellules)',
    technology: 'mono-PERC', pmax: 410, voc: 37.4, vmp: 31.3, isc: 13.90, impp: 13.10,
    betaVoc: -0.27, alphaIsc: 0.048, gammaPmax: -0.35, noct: 44,
    length: 1.722, width: 1.134, massKg: 21.0, efficiency: 0.210,
    reverseCurrent: 25, systemVoltage: 1000,
  },
  {
    id: 'gen-mono-550', label: 'Monocristallin 550 Wc (144 demi-cellules)',
    technology: 'mono-PERC', pmax: 550, voc: 49.9, vmp: 41.8, isc: 13.95, impp: 13.16,
    betaVoc: -0.26, alphaIsc: 0.046, gammaPmax: -0.34, noct: 45,
    length: 2.278, width: 1.134, massKg: 28.6, efficiency: 0.213,
    reverseCurrent: 25, systemVoltage: 1500,
  },
  {
    id: 'gen-topcon-580', label: 'TOPCon 580 Wc bifacial',
    technology: 'n-TOPCon', pmax: 580, voc: 51.9, vmp: 43.5, isc: 14.10, impp: 13.34,
    betaVoc: -0.24, alphaIsc: 0.045, gammaPmax: -0.29, noct: 44,
    length: 2.278, width: 1.134, massKg: 32.0, efficiency: 0.225,
    reverseCurrent: 30, systemVoltage: 1500, bifacialGain: 0.08,
  },
  {
    id: 'gen-topcon-630', label: 'TOPCon 630 Wc grand format',
    technology: 'n-TOPCon', pmax: 630, voc: 56.2, vmp: 47.2, isc: 14.20, impp: 13.35,
    betaVoc: -0.24, alphaIsc: 0.045, gammaPmax: -0.28, noct: 44,
    length: 2.382, width: 1.134, massKg: 33.5, efficiency: 0.233,
    reverseCurrent: 30, systemVoltage: 1500, bifacialGain: 0.09,
  },
  {
    id: 'gen-hjt-450', label: 'Hétérojonction 450 Wc',
    technology: 'HJT', pmax: 450, voc: 41.6, vmp: 34.9, isc: 13.80, impp: 12.90,
    betaVoc: -0.24, alphaIsc: 0.036, gammaPmax: -0.24, noct: 43,
    length: 1.903, width: 1.134, massKg: 23.5, efficiency: 0.209,
    reverseCurrent: 25, systemVoltage: 1500, bifacialGain: 0.10,
  },
  {
    id: 'gen-poly-280', label: 'Polycristallin 280 Wc (stock ancien)',
    technology: 'poly', pmax: 280, voc: 38.6, vmp: 31.4, isc: 9.42, impp: 8.92,
    betaVoc: -0.31, alphaIsc: 0.052, gammaPmax: -0.41, noct: 46,
    length: 1.650, width: 0.992, massKg: 18.2, efficiency: 0.171,
    reverseCurrent: 15, systemVoltage: 1000,
  },
];

/**
 * @typedef {object} Inverter
 * @property {string} id
 * @property {string} label
 * @property {'grid'|'hybrid'|'offgrid'|'micro'} family
 * @property {number} pacNom      puissance active nominale (W)
 * @property {number} pdcMax      puissance continue maximale admissible (W)
 * @property {number} vdcMax      tension continue maximale (V)
 * @property {number} vdcStart    tension de démarrage (V)
 * @property {number} mpptMin     borne basse de la plage MPPT (V)
 * @property {number} mpptMax     borne haute de la plage MPPT (V)
 * @property {number} mpptCount   nombre d'entrées MPPT
 * @property {number} iMaxPerMppt courant d'entrée maximal par MPPT (A)
 * @property {number} iSccPerMppt courant de court-circuit admissible par MPPT (A)
 * @property {number} effEuro     rendement européen (0-1)
 * @property {1|3} phases
 * @property {number} vacNom      tension alternative nominale (V)
 */

/** @type {Inverter[]} */
export const INVERTERS = [
  { id: 'inv-1k5-1p', label: 'Réseau 1,5 kW monophasé', family: 'grid', pacNom: 1500, pdcMax: 2250, vdcMax: 600, vdcStart: 80, mpptMin: 80, mpptMax: 500, mpptCount: 1, iMaxPerMppt: 12, iSccPerMppt: 16, effEuro: 0.965, phases: 1, vacNom: 230 },
  { id: 'inv-3k-1p', label: 'Réseau 3 kW monophasé', family: 'grid', pacNom: 3000, pdcMax: 4500, vdcMax: 600, vdcStart: 90, mpptMin: 90, mpptMax: 520, mpptCount: 2, iMaxPerMppt: 12, iSccPerMppt: 18, effEuro: 0.970, phases: 1, vacNom: 230 },
  { id: 'inv-5k-1p', label: 'Réseau 5 kW monophasé', family: 'grid', pacNom: 5000, pdcMax: 7500, vdcMax: 600, vdcStart: 100, mpptMin: 100, mpptMax: 550, mpptCount: 2, iMaxPerMppt: 14, iSccPerMppt: 20, effEuro: 0.972, phases: 1, vacNom: 230 },
  { id: 'inv-6k-3p', label: 'Réseau 6 kW triphasé', family: 'grid', pacNom: 6000, pdcMax: 9000, vdcMax: 1000, vdcStart: 160, mpptMin: 200, mpptMax: 850, mpptCount: 2, iMaxPerMppt: 16, iSccPerMppt: 22, effEuro: 0.975, phases: 3, vacNom: 400 },
  { id: 'inv-10k-3p', label: 'Réseau 10 kW triphasé', family: 'grid', pacNom: 10000, pdcMax: 15000, vdcMax: 1000, vdcStart: 160, mpptMin: 200, mpptMax: 850, mpptCount: 2, iMaxPerMppt: 26, iSccPerMppt: 40, effEuro: 0.977, phases: 3, vacNom: 400 },
  { id: 'inv-20k-3p', label: 'Réseau 20 kW triphasé', family: 'grid', pacNom: 20000, pdcMax: 30000, vdcMax: 1100, vdcStart: 180, mpptMin: 200, mpptMax: 1000, mpptCount: 2, iMaxPerMppt: 32, iSccPerMppt: 48, effEuro: 0.982, phases: 3, vacNom: 400 },
  { id: 'inv-50k-3p', label: 'Réseau 50 kW triphasé', family: 'grid', pacNom: 50000, pdcMax: 75000, vdcMax: 1100, vdcStart: 200, mpptMin: 200, mpptMax: 1000, mpptCount: 4, iMaxPerMppt: 40, iSccPerMppt: 60, effEuro: 0.985, phases: 3, vacNom: 400 },
  { id: 'inv-100k-3p', label: 'Centrale 100 kW triphasé', family: 'grid', pacNom: 100000, pdcMax: 150000, vdcMax: 1100, vdcStart: 200, mpptMin: 200, mpptMax: 1000, mpptCount: 8, iMaxPerMppt: 40, iSccPerMppt: 60, effEuro: 0.987, phases: 3, vacNom: 800 },
  { id: 'inv-hyb-5k', label: 'Hybride 5 kW 48 V monophasé', family: 'hybrid', pacNom: 5000, pdcMax: 7500, vdcMax: 500, vdcStart: 90, mpptMin: 120, mpptMax: 450, mpptCount: 2, iMaxPerMppt: 13, iSccPerMppt: 20, effEuro: 0.968, phases: 1, vacNom: 230, batteryVoltage: 48 },
  { id: 'inv-hyb-10k-3p', label: 'Hybride 10 kW triphasé haute tension', family: 'hybrid', pacNom: 10000, pdcMax: 15000, vdcMax: 1000, vdcStart: 150, mpptMin: 200, mpptMax: 850, mpptCount: 2, iMaxPerMppt: 16, iSccPerMppt: 25, effEuro: 0.974, phases: 3, vacNom: 400, batteryVoltage: 400 },
  { id: 'inv-off-3k', label: 'Autonome 3 kVA 24 V', family: 'offgrid', pacNom: 3000, pdcMax: 4500, vdcMax: 450, vdcStart: 60, mpptMin: 60, mpptMax: 400, mpptCount: 1, iMaxPerMppt: 18, iSccPerMppt: 25, effEuro: 0.940, phases: 1, vacNom: 230, batteryVoltage: 24 },
  { id: 'inv-micro-800', label: 'Micro-onduleur 800 W (2 modules)', family: 'micro', pacNom: 800, pdcMax: 1200, vdcMax: 60, vdcStart: 22, mpptMin: 25, mpptMax: 55, mpptCount: 2, iMaxPerMppt: 15, iSccPerMppt: 20, effEuro: 0.962, phases: 1, vacNom: 230 },
];

/**
 * @typedef {object} Battery
 * @property {string} id
 * @property {string} label
 * @property {'lfp'|'nmc'|'agm'|'gel'|'opzs'} chemistry
 * @property {number} vNom        tension nominale (V)
 * @property {number} capacityAh  capacité nominale (Ah)
 * @property {number} dod         profondeur de décharge recommandée (0-1)
 * @property {number} roundTrip   rendement de cycle (0-1)
 * @property {number} cycles      durée de vie en cycles à la DoD indiquée
 * @property {number} massKg
 */

/** @type {Battery[]} */
export const BATTERIES = [
  { id: 'bat-lfp-51-100', label: 'LiFePO₄ 51,2 V — 100 Ah (5,12 kWh)', chemistry: 'lfp', vNom: 51.2, capacityAh: 100, dod: 0.90, roundTrip: 0.95, cycles: 6000, massKg: 45 },
  { id: 'bat-lfp-51-200', label: 'LiFePO₄ 51,2 V — 200 Ah (10,24 kWh)', chemistry: 'lfp', vNom: 51.2, capacityAh: 200, dod: 0.90, roundTrip: 0.95, cycles: 6000, massKg: 88 },
  { id: 'bat-lfp-25-100', label: 'LiFePO₄ 25,6 V — 100 Ah (2,56 kWh)', chemistry: 'lfp', vNom: 25.6, capacityAh: 100, dod: 0.90, roundTrip: 0.95, cycles: 5000, massKg: 24 },
  { id: 'bat-lfp-12-100', label: 'LiFePO₄ 12,8 V — 100 Ah (1,28 kWh)', chemistry: 'lfp', vNom: 12.8, capacityAh: 100, dod: 0.90, roundTrip: 0.95, cycles: 4000, massKg: 12 },
  { id: 'bat-agm-12-200', label: 'AGM 12 V — 200 Ah (2,4 kWh)', chemistry: 'agm', vNom: 12, capacityAh: 200, dod: 0.50, roundTrip: 0.85, cycles: 700, massKg: 58 },
  { id: 'bat-gel-12-250', label: 'GEL 12 V — 250 Ah (3,0 kWh)', chemistry: 'gel', vNom: 12, capacityAh: 250, dod: 0.50, roundTrip: 0.85, cycles: 1200, massKg: 68 },
  { id: 'bat-opzs-2-1000', label: 'OPzS 2 V — 1000 Ah (2 kWh)', chemistry: 'opzs', vNom: 2, capacityAh: 1000, dod: 0.60, roundTrip: 0.86, cycles: 3000, massKg: 62 },
];

/** Coûts unitaires indicatifs, à ajuster au marché local dans les réglages. */
export const DEFAULT_COSTS = {
  modulePerWp: 0.28,       // €/Wc, fourniture module
  inverterPerWac: 0.12,    // €/W onduleur
  batteryPerKwh: 320,      // €/kWh installé
  mountingPerWp: 0.10,     // €/Wc structure
  cablingPerWp: 0.06,      // €/Wc câbles + protections
  labourPerWp: 0.25,       // €/Wc pose et mise en service
  engineeringFixed: 400,   // études, démarches, raccordement
  marginRate: 0.15,        // frais généraux et marge de l'installateur
};
