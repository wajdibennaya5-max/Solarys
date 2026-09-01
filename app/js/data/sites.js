/**
 * Gisement solaire — irradiation globale horizontale mensuelle moyenne
 * (kWh/m²/jour) et température ambiante moyenne (°C) pour un jeu de villes de
 * référence, plus la température minimale de dimensionnement.
 *
 * ATTENTION : ces valeurs sont INDICATIVES et destinées à l'avant-projet.
 * Pour une étude d'exécution, importez les données du site réel (PVGIS,
 * NASA POWER, Meteonorm ou station locale) via le bouton « Importer » de la
 * section Gisement. La température minimale conditionne la tension à vide des
 * chaînes : vérifiez-la sur les relevés locaux, c'est un point de sécurité.
 *
 * `tMin` : température ambiante minimale de dimensionnement (extrême retenu).
 * `tMaxAmb` : température ambiante maximale de dimensionnement.
 */

/**
 * @typedef {object} Site
 * @property {string} id
 * @property {string} city
 * @property {string} country
 * @property {number} lat
 * @property {number} lon
 * @property {number[]} ghi   12 valeurs, kWh/m²/jour
 * @property {number[]} ta    12 valeurs, °C
 * @property {number} tMin
 * @property {number} tMaxAmb
 */

/** @type {Site[]} */
export const SITES = [
  { id: 'tn-tunis', city: 'Tunis', country: 'Tunisie', lat: 36.80, lon: 10.18, tMin: 0, tMaxAmb: 44,
    ghi: [2.55, 3.45, 4.65, 5.75, 6.60, 7.25, 7.35, 6.60, 5.25, 3.90, 2.80, 2.30],
    ta: [11.9, 12.4, 14.2, 16.8, 20.7, 24.9, 27.8, 28.3, 25.8, 22.0, 16.8, 13.2] },
  { id: 'tn-sfax', city: 'Sfax', country: 'Tunisie', lat: 34.74, lon: 10.76, tMin: 0, tMaxAmb: 45,
    ghi: [2.70, 3.60, 4.90, 6.00, 6.90, 7.50, 7.60, 6.90, 5.50, 4.10, 3.00, 2.50],
    ta: [12.2, 13.0, 15.0, 17.6, 21.2, 25.0, 27.6, 28.3, 26.2, 22.6, 17.6, 13.6] },
  { id: 'tn-tozeur', city: 'Tozeur', country: 'Tunisie', lat: 33.92, lon: 8.13, tMin: -2, tMaxAmb: 50,
    ghi: [3.10, 4.00, 5.30, 6.40, 7.30, 7.90, 7.90, 7.20, 5.90, 4.50, 3.40, 2.80],
    ta: [11.0, 13.2, 16.5, 20.4, 25.1, 29.9, 33.0, 32.5, 29.0, 23.4, 16.6, 11.8] },
  { id: 'tn-kairouan', city: 'Kairouan', country: 'Tunisie', lat: 35.68, lon: 10.10, tMin: -2, tMaxAmb: 47,
    ghi: [2.60, 3.50, 4.80, 5.90, 6.80, 7.40, 7.50, 6.80, 5.40, 4.00, 2.90, 2.40],
    ta: [10.6, 11.8, 14.2, 17.4, 21.8, 26.2, 29.3, 29.4, 26.2, 21.5, 15.7, 11.4] },
  { id: 'tn-gabes', city: 'Gabès', country: 'Tunisie', lat: 33.88, lon: 10.10, tMin: 0, tMaxAmb: 47,
    ghi: [2.80, 3.70, 5.00, 6.10, 7.00, 7.60, 7.70, 7.00, 5.60, 4.20, 3.10, 2.60],
    ta: [12.0, 13.4, 15.9, 18.8, 22.3, 25.9, 28.2, 28.9, 26.8, 23.0, 17.9, 13.4] },
  { id: 'tn-bizerte', city: 'Bizerte', country: 'Tunisie', lat: 37.27, lon: 9.87, tMin: 0, tMaxAmb: 43,
    ghi: [2.50, 3.40, 4.60, 5.70, 6.50, 7.10, 7.20, 6.50, 5.10, 3.80, 2.70, 2.20],
    ta: [11.4, 11.9, 13.6, 15.9, 19.4, 23.3, 26.1, 26.8, 24.6, 21.0, 16.3, 12.7] },
  { id: 'tn-medenine', city: 'Médenine', country: 'Tunisie', lat: 33.35, lon: 10.50, tMin: 0, tMaxAmb: 48,
    ghi: [2.90, 3.80, 5.10, 6.20, 7.10, 7.70, 7.80, 7.10, 5.70, 4.30, 3.20, 2.70],
    ta: [12.3, 13.8, 16.4, 19.5, 23.2, 27.0, 29.5, 30.0, 27.6, 23.4, 18.1, 13.7] },
  { id: 'dz-alger', city: 'Alger', country: 'Algérie', lat: 36.75, lon: 3.06, tMin: 0, tMaxAmb: 42,
    ghi: [2.40, 3.30, 4.50, 5.60, 6.40, 7.00, 7.10, 6.40, 5.00, 3.70, 2.60, 2.20],
    ta: [11.9, 12.4, 14.0, 16.0, 19.1, 22.7, 25.6, 26.4, 24.2, 20.5, 16.1, 12.9] },
  { id: 'dz-oran', city: 'Oran', country: 'Algérie', lat: 35.70, lon: -0.63, tMin: 0, tMaxAmb: 43,
    ghi: [2.60, 3.50, 4.70, 5.80, 6.70, 7.30, 7.40, 6.70, 5.30, 3.90, 2.80, 2.30],
    ta: [11.6, 12.3, 14.1, 16.0, 18.9, 22.5, 25.4, 26.2, 24.0, 20.3, 15.8, 12.6] },
  { id: 'dz-tamanrasset', city: 'Tamanrasset', country: 'Algérie', lat: 22.79, lon: 5.53, tMin: 0, tMaxAmb: 44,
    ghi: [4.40, 5.20, 6.10, 6.80, 7.20, 7.30, 7.10, 6.90, 6.30, 5.50, 4.60, 4.20],
    ta: [12.8, 15.2, 19.0, 23.2, 26.8, 29.6, 29.2, 28.6, 27.0, 22.6, 17.4, 13.6] },
  { id: 'ma-casablanca', city: 'Casablanca', country: 'Maroc', lat: 33.57, lon: -7.59, tMin: 2, tMaxAmb: 40,
    ghi: [2.90, 3.70, 5.00, 6.10, 6.80, 7.20, 7.10, 6.50, 5.50, 4.20, 3.10, 2.70],
    ta: [13.0, 13.8, 15.0, 16.2, 18.0, 20.4, 22.4, 22.8, 21.9, 19.8, 16.8, 14.0] },
  { id: 'ma-marrakech', city: 'Marrakech', country: 'Maroc', lat: 31.63, lon: -7.99, tMin: -1, tMaxAmb: 47,
    ghi: [3.20, 4.10, 5.40, 6.50, 7.30, 7.80, 7.70, 7.00, 5.90, 4.60, 3.50, 3.00],
    ta: [12.0, 13.6, 16.0, 18.0, 21.2, 25.0, 28.9, 28.7, 25.4, 21.2, 16.4, 12.6] },
  { id: 'ma-ouarzazate', city: 'Ouarzazate', country: 'Maroc', lat: 30.93, lon: -6.91, tMin: -5, tMaxAmb: 46,
    ghi: [3.50, 4.40, 5.70, 6.70, 7.50, 8.00, 7.90, 7.20, 6.10, 4.90, 3.80, 3.30],
    ta: [8.6, 10.8, 14.0, 17.0, 21.0, 25.4, 29.6, 29.0, 24.4, 19.0, 13.2, 9.2] },
  { id: 'mr-nouakchott', city: 'Nouakchott', country: 'Mauritanie', lat: 18.08, lon: -15.98, tMin: 8, tMaxAmb: 45,
    ghi: [5.00, 5.80, 6.70, 7.10, 7.20, 6.90, 6.40, 6.10, 6.00, 5.70, 5.00, 4.60],
    ta: [21.4, 22.9, 24.3, 24.6, 26.5, 28.8, 29.5, 30.1, 30.4, 28.6, 25.5, 21.9] },
  { id: 'sn-dakar', city: 'Dakar', country: 'Sénégal', lat: 14.72, lon: -17.47, tMin: 14, tMaxAmb: 40,
    ghi: [4.90, 5.60, 6.40, 6.90, 6.80, 6.30, 5.60, 5.30, 5.40, 5.50, 5.00, 4.60],
    ta: [21.4, 20.9, 21.5, 22.1, 23.5, 26.2, 27.6, 27.7, 28.1, 28.2, 26.6, 23.7] },
  { id: 'ml-bamako', city: 'Bamako', country: 'Mali', lat: 12.65, lon: -8.00, tMin: 12, tMaxAmb: 45,
    ghi: [5.30, 5.90, 6.30, 6.40, 6.20, 5.80, 5.20, 5.00, 5.40, 5.60, 5.40, 5.10],
    ta: [24.8, 27.7, 30.7, 32.4, 31.6, 28.8, 26.6, 26.0, 26.6, 27.7, 26.6, 24.4] },
  { id: 'ne-niamey', city: 'Niamey', country: 'Niger', lat: 13.51, lon: 2.11, tMin: 12, tMaxAmb: 46,
    ghi: [5.40, 6.00, 6.40, 6.50, 6.40, 6.20, 5.60, 5.40, 5.70, 5.90, 5.60, 5.20],
    ta: [24.5, 27.5, 31.0, 33.8, 33.6, 30.9, 28.2, 26.9, 28.0, 30.0, 28.0, 25.1] },
  { id: 'ci-abidjan', city: 'Abidjan', country: "Côte d'Ivoire", lat: 5.35, lon: -4.02, tMin: 18, tMaxAmb: 36,
    ghi: [5.00, 5.30, 5.20, 5.10, 4.70, 3.60, 3.30, 3.40, 3.90, 4.50, 4.70, 4.70],
    ta: [27.0, 27.9, 28.0, 27.9, 27.1, 25.7, 24.7, 24.5, 25.3, 26.3, 27.2, 27.0] },
  { id: 'ng-lagos', city: 'Lagos', country: 'Nigeria', lat: 6.52, lon: 3.38, tMin: 18, tMaxAmb: 37,
    ghi: [4.90, 5.20, 5.10, 5.00, 4.60, 3.60, 3.20, 3.20, 3.70, 4.30, 4.70, 4.80],
    ta: [27.3, 28.3, 28.4, 28.0, 27.1, 25.8, 25.0, 24.8, 25.5, 26.4, 27.5, 27.4] },
  { id: 'cm-douala', city: 'Douala', country: 'Cameroun', lat: 4.05, lon: 9.70, tMin: 19, tMaxAmb: 35,
    ghi: [4.60, 4.80, 4.50, 4.40, 4.30, 3.50, 2.90, 2.80, 3.30, 3.80, 4.30, 4.50],
    ta: [26.9, 27.5, 27.2, 27.0, 26.7, 25.8, 24.8, 24.7, 25.3, 25.8, 26.4, 26.8] },
  { id: 'eg-caire', city: 'Le Caire', country: 'Égypte', lat: 30.04, lon: 31.24, tMin: 3, tMaxAmb: 45,
    ghi: [3.30, 4.20, 5.50, 6.50, 7.20, 7.60, 7.50, 7.00, 6.00, 4.70, 3.60, 3.00],
    ta: [14.0, 15.0, 17.9, 22.0, 25.7, 28.0, 28.7, 28.6, 26.8, 23.8, 19.4, 15.4] },
  { id: 'sa-riyad', city: 'Riyad', country: 'Arabie saoudite', lat: 24.71, lon: 46.68, tMin: 0, tMaxAmb: 50,
    ghi: [3.90, 4.80, 5.70, 6.30, 7.00, 7.60, 7.40, 7.00, 6.40, 5.30, 4.20, 3.70],
    ta: [14.4, 17.0, 21.4, 26.2, 31.4, 33.9, 34.7, 34.6, 31.9, 26.5, 20.2, 15.7] },
  { id: 'ae-dubai', city: 'Dubaï', country: 'Émirats arabes unis', lat: 25.20, lon: 55.27, tMin: 8, tMaxAmb: 48,
    ghi: [3.90, 4.70, 5.50, 6.20, 6.90, 7.10, 6.70, 6.40, 6.00, 5.20, 4.20, 3.70],
    ta: [19.3, 20.4, 23.2, 26.8, 31.0, 33.0, 34.7, 34.9, 32.5, 29.0, 24.6, 21.0] },
  { id: 'fr-paris', city: 'Paris', country: 'France', lat: 48.86, lon: 2.35, tMin: -10, tMaxAmb: 38,
    ghi: [0.85, 1.60, 2.80, 4.20, 5.20, 5.60, 5.60, 4.90, 3.50, 2.00, 1.05, 0.75],
    ta: [4.9, 5.6, 8.6, 11.2, 15.0, 18.3, 20.5, 20.3, 16.9, 12.9, 8.1, 5.5] },
  { id: 'fr-lyon', city: 'Lyon', country: 'France', lat: 45.76, lon: 4.84, tMin: -12, tMaxAmb: 39,
    ghi: [1.10, 1.90, 3.20, 4.50, 5.60, 6.30, 6.40, 5.50, 4.10, 2.40, 1.30, 0.90],
    ta: [3.4, 4.6, 8.3, 11.4, 15.6, 19.4, 22.0, 21.5, 17.4, 13.2, 7.7, 4.2] },
  { id: 'fr-marseille', city: 'Marseille', country: 'France', lat: 43.30, lon: 5.37, tMin: -6, tMaxAmb: 40,
    ghi: [1.60, 2.50, 4.00, 5.30, 6.40, 7.20, 7.40, 6.40, 4.80, 3.00, 1.80, 1.40],
    ta: [7.0, 7.6, 10.6, 13.4, 17.4, 21.4, 24.3, 24.0, 20.2, 16.4, 11.2, 7.9] },
  { id: 'fr-bordeaux', city: 'Bordeaux', country: 'France', lat: 44.84, lon: -0.58, tMin: -8, tMaxAmb: 40,
    ghi: [1.20, 2.00, 3.40, 4.70, 5.70, 6.40, 6.50, 5.70, 4.40, 2.60, 1.40, 1.00],
    ta: [6.4, 7.2, 10.0, 12.3, 16.0, 19.3, 21.3, 21.3, 18.4, 14.6, 9.7, 6.7] },
  { id: 'be-bruxelles', city: 'Bruxelles', country: 'Belgique', lat: 50.85, lon: 4.35, tMin: -12, tMaxAmb: 35,
    ghi: [0.75, 1.40, 2.50, 3.90, 4.90, 5.20, 5.10, 4.40, 3.10, 1.80, 0.90, 0.60],
    ta: [3.7, 4.1, 6.8, 9.8, 13.6, 16.4, 18.6, 18.3, 15.2, 11.4, 7.1, 4.2] },
  { id: 'ch-geneve', city: 'Genève', country: 'Suisse', lat: 46.20, lon: 6.14, tMin: -14, tMaxAmb: 37,
    ghi: [1.05, 1.80, 3.10, 4.30, 5.30, 6.00, 6.20, 5.30, 3.90, 2.20, 1.20, 0.85],
    ta: [1.5, 2.8, 6.5, 10.0, 14.4, 18.2, 20.6, 19.9, 16.0, 11.6, 5.8, 2.5] },
  { id: 'es-madrid', city: 'Madrid', country: 'Espagne', lat: 40.42, lon: -3.70, tMin: -6, tMaxAmb: 42,
    ghi: [1.90, 2.80, 4.30, 5.50, 6.50, 7.40, 7.70, 6.90, 5.20, 3.30, 2.10, 1.70],
    ta: [6.2, 7.9, 11.0, 12.8, 17.0, 22.6, 26.1, 25.6, 21.2, 15.4, 9.9, 6.7] },
  { id: 'es-seville', city: 'Séville', country: 'Espagne', lat: 37.39, lon: -5.98, tMin: -2, tMaxAmb: 45,
    ghi: [2.30, 3.20, 4.70, 6.00, 7.00, 7.80, 7.90, 7.10, 5.50, 3.70, 2.50, 2.00],
    ta: [11.0, 12.5, 15.4, 17.2, 20.6, 25.0, 28.2, 28.0, 24.9, 20.0, 15.1, 11.7] },
  { id: 'it-rome', city: 'Rome', country: 'Italie', lat: 41.90, lon: 12.50, tMin: -4, tMaxAmb: 40,
    ghi: [1.70, 2.50, 3.90, 5.20, 6.40, 7.00, 7.20, 6.30, 4.80, 3.10, 1.90, 1.50],
    ta: [8.1, 8.8, 11.2, 13.8, 18.0, 22.2, 25.0, 25.2, 21.4, 17.2, 12.5, 9.1] },
  { id: 'de-berlin', city: 'Berlin', country: 'Allemagne', lat: 52.52, lon: 13.40, tMin: -16, tMaxAmb: 36,
    ghi: [0.70, 1.40, 2.60, 4.00, 5.00, 5.30, 5.20, 4.50, 3.00, 1.70, 0.80, 0.55],
    ta: [0.9, 1.9, 5.0, 9.6, 14.3, 17.5, 19.4, 18.9, 14.9, 9.9, 5.2, 2.2] },
  { id: 'ca-montreal', city: 'Montréal', country: 'Canada', lat: 45.50, lon: -73.57, tMin: -32, tMaxAmb: 34,
    ghi: [1.50, 2.30, 3.60, 4.50, 5.30, 5.80, 5.70, 5.00, 3.70, 2.30, 1.30, 1.10],
    ta: [-9.7, -7.7, -2.0, 6.4, 13.4, 18.6, 21.2, 20.1, 15.5, 8.5, 1.6, -6.2] },
];

/** Retrouve un site par identifiant. */
export const findSite = (id) => SITES.find((s) => s.id === id);

/** Liste des pays représentés, triée. */
export const countries = () => [...new Set(SITES.map((s) => s.country))].sort((a, b) => a.localeCompare(b, 'fr'));

/**
 * Irradiation globale horizontale annuelle d'un site (kWh/m²/an).
 * Sert de contrôle de vraisemblance et d'affichage.
 */
export function annualGhi(site) {
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return site.ghi.reduce((s, v, i) => s + v * days[i], 0);
}

/**
 * Facteur d'émission du réseau électrique (kg CO₂ eq/kWh), valeurs indicatives.
 */
export const GRID_CARBON = {
  Tunisie: 0.47, Algérie: 0.49, Maroc: 0.61, Mauritanie: 0.55, Sénégal: 0.52,
  Mali: 0.45, Niger: 0.60, "Côte d'Ivoire": 0.42, Nigeria: 0.40, Cameroun: 0.25,
  Égypte: 0.45, 'Arabie saoudite': 0.62, 'Émirats arabes unis': 0.48,
  France: 0.06, Belgique: 0.17, Suisse: 0.04, Espagne: 0.17, Italie: 0.26,
  Allemagne: 0.35, Canada: 0.12, Autre: 0.45,
};
