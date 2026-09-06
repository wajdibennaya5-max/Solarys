/**
 * L'ÉTAT DE LA SIMULATION, et l'assemblage des données du calcul.
 *
 * POURQUOI CE FICHIER EXISTE. Ces quelques fonctions étaient au milieu du
 * contrôleur, entre deux `innerHTML`. Ce sont pourtant elles qui décident de
 * TOUT : quelle consommation entre dans le calcul, quel bâtiment, quel
 * module, quelle surface. Une erreur ici ne fait pas planter la page — elle
 * produit une étude fausse, proprement affichée, que personne ne remarque.
 *
 * Séparées du DOM, elles se testent sans navigateur. C'est la seule raison
 * de ce fichier, et elle suffit.
 *
 * Rien ici ne touche à la page : ni `document`, ni `innerHTML`, ni écoute.
 */
import { resoudre } from './consommation.js';
import { etudier } from './etude.js';
import { comparer } from './scenarios.js';
import { moduleParId } from './materiel.js';
import { TYPE_DEFAUT } from './batiment.js';
import { CENTRES } from './geo.js';

/** Les réponses du visiteur, étape par étape. */
export const reponses = {};

/**
 * Ce que le visiteur a réglé lui-même sur le tableau de bord.
 *
 * `sienne` distingue une puissance qu'il a choisie d'une puissance que nous
 * recommandons : la carte centrale ne s'attribue pas un chiffre qu'elle n'a
 * pas proposé.
 */
export const simulation = { puissance: null, surface: 0, sienne: false };

/** Repart d'un tableau de bord neuf, sur la toiture déclarée. */
export function reinitialiserSimulation() {
  const { L, P } = cotesToit();
  simulation.puissance = null;
  simulation.surface = L * P;
  simulation.sienne = false;
  return simulation;
}

/** Efface toutes les réponses — « refaire une estimation ». */
export function oublierReponses() {
  for (const cle of Object.keys(reponses)) delete reponses[cle];
}

/** Les cotes du pan, quand le visiteur les a données. */
export function cotesToit() {
  const t = reponses.toit ?? {};
  return { L: Number(t.L) || 0, P: Number(t.P) || 0 };
}

/** Le module et la pose retenus à l'étape Installation. */
export function reglagePose() {
  const i = reponses.installation ?? {};
  return { module: moduleParId(i.module), pose: i.pose ?? 'auto' };
}

/**
 * Les données du foyer, telles que le calcul les attend.
 *
 * Un seul endroit où elles se composent : l'étude affichée, les trois
 * scénarios comparés et le rapport imprimé doivent reposer exactement sur
 * les mêmes chiffres, sans quoi la comparaison ne voudrait rien dire.
 *
 * @returns {object|null} `null` tant que la consommation n'est pas
 *   exploitable — mieux vaut ne rien calculer qu'un résultat que le client
 *   croira vrai.
 */
export function donneesEtude() {
  const toit = reponses.toit ?? {};
  const c = reponses.consommation ?? {};
  const annuel = resoudre(c.methode, c.saisie ?? {});
  if (!annuel) return null;
  return {
    consommationAnnuelle: annuel.consommationAnnuelle,
    montantAnnuel: annuel.montantAnnuel,
    fiabilite: annuel.fiabilite,
    detailConso: annuel.detail,
    mois: annuel.mois ?? null,
    gouvernorat: reponses.gouvernorat,
    surfaceDisponible: simulation.surface,
    orientation: toit.orientation ?? null,
    pente: toit.pente ?? null,
    batiment: reponses.batiment ?? TYPE_DEFAUT,
    moduleWc: reglagePose().module.puissance,
    moduleId: reglagePose().module.id,
    productibleMesure,
    ...position(),
  };
}

/**
 * Le productible mesuré au point par le service de données solaires, quand il
 * en existe un.
 *
 * Le contrôleur le pose ici après avoir interrogé le service ; tout le reste
 * du calcul le reprend sans savoir d'où il vient. C'est ce qui permet
 * d'intégrer une source externe sans la répandre dans tout le code.
 */
let productibleMesure = null;

export function definirProductibleMesure(v) {
  const n = Number(v);
  productibleMesure = Number.isFinite(n) && n > 0 ? n : null;
  return productibleMesure;
}

export const productibleMesureCourant = () => productibleMesure;

/**
 * Le point exact, quand il est connu.
 *
 * Le gouvernorat suffit à notre référentiel de gisement ; il ne suffit pas à
 * un service de rayonnement, qui travaille au point. Sans géolocalisation, on
 * retombe sur le centre du gouvernorat, et on le DIT : c'est une position
 * approchée de plusieurs dizaines de kilomètres, pas la toiture du client.
 */
export function position() {
  const p = reponses.position ?? {};
  if (Number.isFinite(p.latitude) && Number.isFinite(p.longitude)) {
    return {
      latitude: p.latitude,
      longitude: p.longitude,
      precisionPosition: Number.isFinite(p.precision) ? p.precision : null,
      originePosition: p.origine ?? 'capteur',
      // L'altitude change le rayonnement de plusieurs pour cent en altitude,
      // et l'heure du relevé dit si cette position est encore celle du
      // chantier. Les jeter revenait à ne plus pouvoir les afficher.
      altitude: Number.isFinite(p.altitude) ? p.altitude : null,
      horodatagePosition: Number.isFinite(p.horodatage) ? p.horodatage : null,
    };
  }
  // DÉFAUT CORRIGÉ : `CENTRES` range ses points en tableaux `[lat, lon]`,
  // et ce code lisait `centre.lat`. Il rendait donc `undefined` à chaque
  // fois : le repli sur le centre du gouvernorat n'a jamais fonctionné, et
  // le service de rayonnement était interrogé sans coordonnées — donc pas
  // interrogé du tout, silencieusement.
  const centre = CENTRES[reponses.gouvernorat];
  if (Array.isArray(centre)) {
    return {
      latitude: centre[0],
      longitude: centre[1],
      // Un centre de gouvernorat est à des dizaines de kilomètres de la
      // toiture. On l'annonce en mètres pour que la précision affichée ne
      // soit jamais flatteuse.
      precisionPosition: 30000,
      originePosition: 'centre-gouvernorat',
      altitude: null,
      horodatagePosition: null,
    };
  }
  return { latitude: null, longitude: null, precisionPosition: null,
    originePosition: 'inconnue', altitude: null, horodatagePosition: null };
}

/**
 * Retient une position, quelle que soit sa provenance.
 *
 * Un seul point d'entrée : le capteur, la saisie manuelle et le repère posé
 * sur la carte passent tous par ici. C'est ce qui garantit qu'une position
 * porte toujours son origine — et qu'aucun chemin ne peut en glisser une
 * sans étiquette.
 *
 * @returns {object|null} la position retenue, ou `null` si elle est
 *   inexploitable — on préfère garder la précédente qu'en écrire une fausse.
 */
export function definirPosition(p) {
  const lat = Number(p?.latitude);
  const lon = Number(p?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)
    || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const nb = (v) => {
    if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  reponses.position = {
    latitude: lat,
    longitude: lon,
    precision: nb(p.precision),
    altitude: nb(p.altitude),
    precisionAltitude: nb(p.precisionAltitude),
    horodatage: nb(p.horodatage) ?? Date.now(),
    origine: p.origine ?? 'saisie',
  };
  return reponses.position;
}

/** Oublie la position retenue — le visiteur repart du gouvernorat seul. */
export function oublierPosition() { delete reponses.position; }

/** L'étude, avec les réglages courants du tableau de bord. */
export function etudeCourante() {
  const d = donneesEtude();
  if (!d) return null;
  return etudier({ ...d, puissance: simulation.puissance });
}

/** Les trois scénarios, sur les mêmes données que l'étude affichée. */
export function scenariosCourants() {
  const d = donneesEtude();
  return d ? comparer(d) : [];
}
