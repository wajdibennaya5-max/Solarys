/**
 * LES PARAMÈTRES : validation, et surtout CONVERSION D'UNITÉS.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ C'EST ICI QUE SE PERDENT LES INTÉGRATIONS. Trois conventions          │
 * │ diffèrent entre notre plateforme et le service :                      │
 * │                                                                       │
 * │ 1. L'AZIMUT. Chez nous, une orientation porte un nom (« plein sud »). │
 * │    Chez PVGIS, `aspect` est un angle où 0 = SUD, −90 = EST,           │
 * │    +90 = OUEST. La convention géographique usuelle (0 = nord) donne   │
 * │    exactement le contraire : une confusion ici retourne l'installation│
 * │    et fait chuter la production de moitié sans rien casser à l'écran. │
 * │                                                                       │
 * │ 2. L'INCLINAISON. Nos catégories (plat, faible, moyenne, forte)       │
 * │    doivent devenir des degrés. Une terrasse n'est pas 0° dans le      │
 * │    calcul : les modules y sont posés sur châssis inclinés.            │
 * │                                                                       │
 * │ 3. LA PUISSANCE. `peakpower` est en kWc — pas en W, pas en kW de      │
 * │    sortie onduleur. Un facteur mille se voit ; un facteur 1,2 entre   │
 * │    kWc et kW AC ne se voit pas.                                       │
 * └──────────────────────────────────────────────────────────────────────┘
 */
import { ORIENTATIONS, PENTES } from '../orientation.js';

/** Bornes du service : au-delà, il n'a pas de données. */
export const BORNES = {
  latitude: { min: -90, max: 90 },
  longitude: { min: -180, max: 180 },
  puissance: { min: 0.001, max: 1000 },
  pertes: { min: 0, max: 100 },
  inclinaison: { min: 0, max: 90 },
  azimut: { min: -180, max: 180 },
};

/**
 * AZIMUT PVGIS : 0 = sud, négatif vers l'est, positif vers l'ouest.
 *
 * Chaque valeur est la même orientation que celle de `orientation.js`,
 * exprimée dans cette convention. Un test vérifie que les deux tables
 * décrivent bien les mêmes huit directions.
 */
export const AZIMUTS = {
  sud: 0,
  'sud-est': -45,
  'sud-ouest': 45,
  est: -90,
  ouest: 90,
  'nord-est': -135,
  'nord-ouest': 135,
  nord: 180,
};

/**
 * INCLINAISON, en degrés, pour chaque forme de toit.
 *
 * `plat` vaut 30° et non 0 : sur une terrasse, les modules sont posés sur
 * châssis inclinés, et c'est l'inclinaison du châssis qui compte. Mettre 0
 * sous-estimerait la production d'environ un dixième.
 */
export const INCLINAISONS = {
  plat: 30,
  faible: 15,
  moyenne: 30,
  forte: 45,
};

/**
 * Pertes du système, en pourcent, hors ombrage.
 *
 * Câblage, salissure, écart aux conditions standard, rendement de l'onduleur.
 * C'est le paramètre `loss` de PVGIS, et il ne comprend NI l'ombrage NI la
 * dégradation dans le temps — que nous traitons séparément.
 */
export const PERTES_DEFAUT = 14;

/** Technologies de module reconnues par le service. */
export const TECHNOLOGIES = {
  'mono-450': 'crystSi', 'mono-550': 'crystSi', 'mono-585': 'crystSi',
  defaut: 'crystSi',
};

/** Types de pose reconnus par le service. */
export const POSES = { toiture: 'building', sol: 'free' };

/** Les modes de suivi comparables. */
export const SUIVIS = [
  { id: 0, cle: 'fixe', nom: 'Fixe', resume: 'Modules immobiles, orientation choisie' },
  { id: 2, cle: 'axe-vertical', nom: 'Un axe vertical',
    resume: 'Les modules suivent le soleil d’est en ouest' },
  { id: 1, cle: 'axe-incline', nom: 'Un axe incliné',
    resume: 'Suivi sur un axe incliné, inclinaison fixe' },
  { id: 3, cle: 'deux-axes', nom: 'Deux axes',
    resume: 'Les modules suivent le soleil en site et en azimut' },
];

const nombre = (v) => {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const borne = (nom, v, { min, max }) => {
  const n = nombre(v);
  if (n === null) return `${nom} : valeur absente ou illisible.`;
  if (n < min || n > max) return `${nom} : ${n} hors des bornes admises (${min} à ${max}).`;
  return null;
};

/**
 * Convertit une orientation nommée en azimut PVGIS.
 * @returns {number|null} `null` si l'orientation est inconnue — jamais 0,
 *   qui signifierait « plein sud » et serait un mensonge par défaut.
 */
export function azimutDe(orientation) {
  if (orientation === null || orientation === undefined) return null;
  return Object.hasOwn(AZIMUTS, orientation) ? AZIMUTS[orientation] : null;
}

/** Convertit une forme de toit en inclinaison, en degrés. */
export function inclinaisonDe(pente) {
  if (pente === null || pente === undefined) return null;
  return Object.hasOwn(INCLINAISONS, pente) ? INCLINAISONS[pente] : null;
}

/**
 * Compose et valide les paramètres d'un calcul de production.
 *
 * @returns {{ok:true, parametres:object}|{ok:false, erreurs:Array<string>}}
 */
export function pourProduction({
  latitude, longitude, puissanceKwc, orientation = null, pente = null,
  pertes = PERTES_DEFAUT, moduleId = null, pose = 'toiture',
  utiliserHorizon = true, suivi = 0,
}) {
  const erreurs = [];
  for (const [nom, v, b] of [
    ['Latitude', latitude, BORNES.latitude],
    ['Longitude', longitude, BORNES.longitude],
    ['Puissance', puissanceKwc, BORNES.puissance],
    ['Pertes', pertes, BORNES.pertes],
  ]) {
    const souci = borne(nom, v, b);
    if (souci) erreurs.push(souci);
  }

  // Une terrasse ignore l'orientation du bâtiment : les modules y sont posés
  // plein sud sur châssis. C'est la même règle que dans notre propre calcul.
  const terrasse = pente === 'plat';
  const azimut = terrasse ? 0 : azimutDe(orientation);
  const inclinaison = inclinaisonDe(pente);

  if (inclinaison === null) {
    erreurs.push('Inclinaison : forme de toit non renseignée ou inconnue.');
  }
  if (azimut === null) {
    erreurs.push('Azimut : orientation non renseignée ou inconnue.');
  }
  if (!SUIVIS.some((s) => s.id === Number(suivi))) {
    erreurs.push(`Suivi : mode ${suivi} inconnu.`);
  }

  if (erreurs.length) return { ok: false, erreurs };

  return {
    ok: true,
    parametres: {
      lat: Number(latitude),
      lon: Number(longitude),
      // kWc, et rien d'autre : ni watts, ni puissance de sortie onduleur.
      peakpower: Number(puissanceKwc),
      loss: Number(pertes),
      angle: inclinaison,
      aspect: azimut,
      pvtechchoice: TECHNOLOGIES[moduleId] ?? TECHNOLOGIES.defaut,
      mountingplace: POSES[pose] ?? POSES.toiture,
      trackingtype: Number(suivi),
      usehorizon: utiliserHorizon ? 1 : 0,
      outputformat: 'json',
    },
  };
}

/** Paramètres d'un profil de journée moyenne, pour un mois donné. */
export function pourJournee({ latitude, longitude, mois, orientation = null,
  pente = null, avecProduction = true, puissanceKwc = null }) {
  const erreurs = [];
  for (const [nom, v, b] of [
    ['Latitude', latitude, BORNES.latitude],
    ['Longitude', longitude, BORNES.longitude],
  ]) {
    const souci = borne(nom, v, b);
    if (souci) erreurs.push(souci);
  }
  const m = nombre(mois);
  if (m === null || m < 1 || m > 12) erreurs.push('Mois : attendu entre 1 et 12.');
  if (avecProduction && !(nombre(puissanceKwc) > 0)) {
    erreurs.push('Puissance : nécessaire pour estimer la production de la journée.');
  }
  if (erreurs.length) return { ok: false, erreurs };

  const terrasse = pente === 'plat';
  return {
    ok: true,
    parametres: {
      lat: Number(latitude),
      lon: Number(longitude),
      month: m,
      angle: inclinaisonDe(pente) ?? 30,
      aspect: terrasse ? 0 : (azimutDe(orientation) ?? 0),
      global: 1,
      ...(avecProduction
        ? { localtime: 1, showtemperatures: 1, peakpower: Number(puissanceKwc), loss: PERTES_DEFAUT }
        : { showtemperatures: 1 }),
      outputformat: 'json',
    },
  };
}

/** Paramètres du profil d'horizon du terrain. */
export function pourHorizon({ latitude, longitude }) {
  const erreurs = [];
  for (const [nom, v, b] of [
    ['Latitude', latitude, BORNES.latitude],
    ['Longitude', longitude, BORNES.longitude],
  ]) {
    const souci = borne(nom, v, b);
    if (souci) erreurs.push(souci);
  }
  if (erreurs.length) return { ok: false, erreurs };
  return { ok: true,
    parametres: { lat: Number(latitude), lon: Number(longitude), outputformat: 'json' } };
}

/** Paramètres d'une installation autonome, avec batterie. */
export function pourAutonome({ latitude, longitude, puissanceKwc, batterieWh,
  consommationJourWh, dechargeMax = 40, orientation = null, pente = null }) {
  const erreurs = [];
  for (const [nom, v, b] of [
    ['Latitude', latitude, BORNES.latitude],
    ['Longitude', longitude, BORNES.longitude],
    ['Puissance', puissanceKwc, BORNES.puissance],
  ]) {
    const souci = borne(nom, v, b);
    if (souci) erreurs.push(souci);
  }
  if (!(nombre(batterieWh) > 0)) erreurs.push('Capacité de batterie : attendue en Wh.');
  if (!(nombre(consommationJourWh) > 0)) {
    erreurs.push('Consommation journalière : attendue en Wh par jour.');
  }
  const d = nombre(dechargeMax);
  if (d === null || d < 0 || d > 100) {
    erreurs.push('Décharge maximale : attendue en pourcent, entre 0 et 100.');
  }
  if (erreurs.length) return { ok: false, erreurs };

  return {
    ok: true,
    parametres: {
      lat: Number(latitude),
      lon: Number(longitude),
      // Le service attend des WATTS-CRÊTE ici, là où le calcul de production
      // attend des kWc. Un facteur mille, et aucun message d'erreur pour le
      // signaler : la conversion est faite ici, une fois pour toutes.
      peakpower: Number(puissanceKwc) * 1000,
      batterysize: Number(batterieWh),
      consumptionday: Number(consommationJourWh),
      cutoff: Number(dechargeMax),
      angle: inclinaisonDe(pente) ?? 30,
      aspect: pente === 'plat' ? 0 : (azimutDe(orientation) ?? 0),
      outputformat: 'json',
    },
  };
}

/** Toutes les orientations connues des deux côtés, pour vérification. */
export const orientationsCouvertes = () => ({
  interne: ORIENTATIONS.map((o) => o.id),
  pvgis: Object.keys(AZIMUTS),
  pentesInternes: PENTES.map((p) => p.id),
  pentesPvgis: Object.keys(INCLINAISONS),
});
