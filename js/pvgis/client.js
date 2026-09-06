/**
 * LE CLIENT — le SEUL endroit du projet qui parle au service.
 *
 * Aucun composant d'interface n'appelle le service directement. Tout passe
 * ici : construction, validation, appel via le relais, délai, reprises,
 * cache, normalisation, traduction des erreurs. Un seul point de passage, un
 * seul endroit à corriger, un seul endroit à surveiller.
 *
 * DEUX PROMESSES TENUES PAR CE FICHIER :
 *
 * 1. IL NE LÈVE JAMAIS. Un service extérieur qui casse la page qui l'appelle
 *    est un service qu'il vaut mieux ne pas intégrer. Ici, un échec est une
 *    valeur : `{ok: false, messageClient, …}`, que l'appelant traite ou
 *    ignore. La plateforme fonctionne entièrement sans lui.
 *
 * 2. IL NE DEVINE RIEN. Quand le service ne répond pas, le client ne
 *    fabrique pas une valeur de remplacement : il rend un échec, et c'est au
 *    moteur de décider s'il retombe sur le référentiel interne — en le
 *    disant.
 */
import { RELAIS, DELAIS, CALCULS, disponible as serviceDisponible,
  RAISON_INDISPONIBLE } from './config.js';
import * as parametres from './parametres.js';
import * as reponse from './reponse.js';
import * as cache from './cache.js';
import { echec, depuisStatut } from './erreurs.js';

/** Les compteurs de la session, pour le diagnostic. */
const compteurs = { appels: 0, cache: 0, echecs: 0, reprises: 0 };
export const statistiques = () => ({ ...compteurs, enCache: cache.compte() });

/** Attend, sans bloquer. */
const patienter = (ms) => new Promise((r) => { setTimeout(r, ms); });

/**
 * Un appel au relais, avec délai d'attente ferme.
 *
 * `AbortController` coupe la requête pour de bon : sans lui, une requête
 * lente continue de tourner après l'expiration et consomme le réseau du
 * téléphone pour un résultat que plus personne n'attend.
 */
async function appeler(chemin, params, delai, chercher) {
  const url = `${RELAIS()}?calcul=${encodeURIComponent(chemin)}&`
    + new URLSearchParams(params).toString();
  const controleur = new AbortController();
  const minuterie = setTimeout(() => controleur.abort(), delai);
  try {
    const r = await chercher(url, { signal: controleur.signal,
      headers: { accept: 'application/json' } });
    if (!r.ok) {
      return { ok: false, statut: r.status, genre: depuisStatut(r.status) };
    }
    return { ok: true, corps: await r.json() };
  } catch (erreur) {
    const avorte = erreur?.name === 'AbortError';
    return { ok: false, genre: avorte ? 'delai' : 'indisponible',
      detail: String(erreur?.message ?? erreur) };
  } finally {
    clearTimeout(minuterie);
  }
}

/**
 * Interroge le service, ou explique pourquoi il ne l'a pas fait.
 *
 * @param {string} idCalcul une clé de `CALCULS`
 * @param {object} composition résultat d'un `pour…()` de `parametres.js`
 * @param {Function} normaliser le convertisseur de `reponse.js`
 * @param {object} [options]
 */
export async function interroger(idCalcul, composition, normaliser, {
  chercher = globalThis.fetch?.bind(globalThis),
  utiliserCache = true, contexte = {},
} = {}) {
  const c = CALCULS[idCalcul];
  if (!c) return echec('parametres', { detail: `calcul inconnu : ${idCalcul}` });

  // 1. Les paramètres d'abord : inutile d'appeler pour se faire refuser.
  if (!composition?.ok) {
    return echec('parametres', {
      detail: (composition?.erreurs ?? ['paramètres illisibles']).join(' '),
      calcul: idCalcul,
    });
  }
  const params = composition.parametres;

  // 2. Le cache ensuite : un résultat déjà obtenu ne se redemande pas.
  const k = cache.cle(idCalcul, params);
  if (utiliserCache) {
    const garde = cache.lire(k);
    if (garde) {
      compteurs.cache += 1;
      const normalise = normaliser(garde, { parametres: params, ...contexte });
      if (normalise.ok) return { ok: true, depuisCache: true, ...normalise };
      // Une entrée en cache devenue illisible ne doit pas empoisonner : on
      // l'ignore et on rappelle.
    }
  }

  // 3. Le relais enfin — s'il existe.
  if (!serviceDisponible() || typeof chercher !== 'function') {
    return echec('indisponible', { detail: RAISON_INDISPONIBLE, calcul: idCalcul });
  }

  const delai = c.poids === 'lourd' ? DELAIS.lourd : DELAIS.leger;
  let dernier = null;
  for (let essai = 0; essai <= DELAIS.reprises; essai++) {
    if (essai > 0) {
      compteurs.reprises += 1;
      await patienter(DELAIS.attenteReprise * (2 ** (essai - 1)));
    }
    compteurs.appels += 1;
    dernier = await appeler(c.chemin, params, delai, chercher);
    if (dernier.ok) break;
    // Une erreur de paramètres ne se corrige pas en réessayant.
    if (dernier.genre === 'parametres' || dernier.genre === 'horsZone') break;
  }

  if (!dernier?.ok) {
    compteurs.echecs += 1;
    return echec(dernier?.genre ?? 'indisponible', {
      detail: dernier?.detail, statut: dernier?.statut, calcul: idCalcul });
  }

  const normalise = normaliser(dernier.corps, { parametres: params, ...contexte });
  if (!normalise.ok) {
    compteurs.echecs += 1;
    return echec('reponse', { detail: normalise.raison, calcul: idCalcul });
  }

  if (utiliserCache) cache.ecrire(k, dernier.corps);
  return { ok: true, depuisCache: false, ...normalise };
}

/* ------------------------------------------------------------------ */
/* Les quatre demandes que la plateforme sait faire                    */
/* ------------------------------------------------------------------ */

export const production = (site, options = {}) => interroger(
  'production', parametres.pourProduction(site), reponse.production,
  { ...options, contexte: { puissanceKwc: site.puissanceKwc } });

export const journee = (site, options = {}) => interroger(
  'journalier', parametres.pourJournee(site), reponse.journee,
  { ...options, contexte: { mois: site.mois } });

export const horizon = (site, options = {}) => interroger(
  'horizon', parametres.pourHorizon(site), reponse.horizon, options);

export const autonome = (site, options = {}) => interroger(
  'autonome', parametres.pourAutonome(site), reponse.autonome, options);

/**
 * Compare plusieurs modes de suivi sur le même site.
 *
 * Séquentiel et non parallèle : un service scientifique gratuit se ménage,
 * et quatre requêtes simultanées depuis mille visiteurs le feraient tomber.
 */
export async function comparerSuivis(site, modes, options = {}) {
  const sorties = [];
  for (const mode of modes) {
    const r = await production({ ...site, suivi: mode.id }, options);
    sorties.push({ mode, resultat: r });
  }
  return sorties;
}

export { cache };
