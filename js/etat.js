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
    ...position(),
  };
}

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
    };
  }
  const centre = CENTRES[reponses.gouvernorat];
  if (centre) {
    return {
      latitude: centre.lat,
      longitude: centre.lon,
      precisionPosition: null,
      originePosition: 'centre-gouvernorat',
    };
  }
  return { latitude: null, longitude: null, precisionPosition: null,
    originePosition: 'inconnue' };
}

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
