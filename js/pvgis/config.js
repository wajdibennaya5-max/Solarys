/**
 * LA CONFIGURATION PVGIS — un seul endroit, jamais dispersée.
 *
 * Aucune URL, aucune version, aucun délai d'attente ne doit apparaître
 * ailleurs dans le projet. Le jour où le service change de version, c'est ce
 * fichier qu'on modifie, et lui seul.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI LES APPELS PASSENT PAR NOTRE SERVEUR, ET NON PAR LE         │
 * │ NAVIGATEUR. Le service PVGIS ne renvoie pas d'en-tête                 │
 * │ `Access-Control-Allow-Origin` : un `fetch` depuis la page serait      │
 * │ refusé par le navigateur, quelle que soit la qualité du code. Les     │
 * │ requêtes passent donc par un relais sur notre propre serveur, qui     │
 * │ appelle le service et renvoie la réponse. C'est aussi ce qui permet   │
 * │ de mettre en cache côté serveur et de ne pas exposer notre volume     │
 * │ d'appels.                                                             │
 * │                                                                       │
 * │ TANT QUE CE RELAIS N'EST PAS DÉPLOYÉ, `RELAIS` vaut `null` : la       │
 * │ plateforme fonctionne exactement comme avant, sur son référentiel     │
 * │ interne, et chaque valeur le dit. Rien ne casse, rien ne ment.        │
 * └──────────────────────────────────────────────────────────────────────┘
 */

/**
 * L'adresse du relais, sur notre serveur.
 *
 * ELLE SE RÈGLE DANS `index.html`, EN UNE LIGNE :
 *
 *     <meta name="pvgis-relais" content="https://20122011.xyz/api/pvgis">
 *
 * Le contrôleur lit cette balise au démarrage et appelle `definirRelais()`.
 * Sans elle, la valeur reste `null` et la plateforme fonctionne sur son
 * référentiel interne — ce qui est un état normal, pas une panne. Mettre
 * l'adresse dans le HTML plutôt que dans le JavaScript permet de basculer
 * sans toucher au code, et de couper le service en une seconde si le serveur
 * tombe.
 */
let relais = null;

export const RELAIS = () => relais;

/**
 * Règle l'adresse du relais. Appelée par le contrôleur au démarrage, avec ce
 * qu'il a lu dans la page — ce fichier ne connaît pas le document, et ne doit
 * pas le connaître : c'est ce qui le garde testable sans navigateur.
 *
 * HTTPS SEULEMENT. Un relais en clair exposerait les coordonnées du visiteur
 * sur le réseau, et une adresse relative permettrait à une page compromise de
 * détourner les requêtes.
 */
export function definirRelais(url) {
  relais = (typeof url === 'string' && /^https:\/\//.test(url)) ? url : null;
  return relais;
}

/** Version de l'API interrogée. Figure dans chaque résultat. */
export const VERSION_API = 'v5_3';

/** Adresse du service, pour information et pour la construction côté relais. */
export const BASE = `https://re.jrc.ec.europa.eu/api/${VERSION_API}`;

/**
 * Les calculs que nous savons demander et interpréter.
 *
 * On n'en expose aucun autre : un point d'entrée qu'on ne sait pas normaliser
 * ne sert qu'à afficher du brut, et du brut n'aide personne.
 */
export const CALCULS = {
  production: {
    id: 'production',
    chemin: 'PVcalc',
    nom: 'Production photovoltaïque',
    resume: 'Production annuelle et mensuelle d’une installation raccordée',
    poids: 'leger',
  },
  rayonnement: {
    id: 'rayonnement',
    chemin: 'MRcalc',
    nom: 'Rayonnement mensuel',
    resume: 'Irradiation et température mois par mois',
    poids: 'leger',
  },
  horaire: {
    id: 'horaire',
    chemin: 'seriescalc',
    nom: 'Série horaire',
    resume: 'Production et rayonnement heure par heure',
    // Des milliers de lignes : jamais chargé sans demande explicite.
    poids: 'lourd',
  },
  journalier: {
    id: 'journalier',
    chemin: 'DRcalc',
    nom: 'Profil de journée',
    resume: 'Journée moyenne d’un mois, heure par heure',
    poids: 'leger',
  },
  tmy: {
    id: 'tmy',
    chemin: 'tmy',
    nom: 'Année météorologique type',
    resume: 'Une année horaire représentative du site',
    poids: 'lourd',
  },
  horizon: {
    id: 'horizon',
    chemin: 'printhorizon',
    nom: 'Horizon du terrain',
    resume: 'Hauteur du relief tout autour du site',
    poids: 'leger',
  },
  autonome: {
    id: 'autonome',
    chemin: 'SHScalc',
    nom: 'Installation autonome',
    resume: 'Comportement d’un système avec batterie, hors réseau',
    poids: 'leger',
  },
};

export const calcul = (id) => CALCULS[id] ?? null;

/** Délais et reprises. Un service scientifique gratuit peut être lent. */
export const DELAIS = {
  /** Pour les calculs légers, en millisecondes. */
  leger: 12000,
  /** Pour les séries horaires et les années types. */
  lourd: 45000,
  /** Nombre de reprises après un échec réseau. */
  reprises: 2,
  /** Attente avant la première reprise, doublée ensuite. */
  attenteReprise: 800,
};

/**
 * Politique de cache.
 *
 * Le rayonnement d'un lieu ne change pas d'un jour à l'autre : un résultat
 * garde sa valeur longtemps. Ce qui déclenche un nouvel appel, ce n'est pas
 * le temps qui passe, c'est un paramètre qui change — et la clé de cache est
 * construite exactement sur ces paramètres.
 */
export const CACHE = {
  /** Durée de vie d'une entrée, en millisecondes : trente jours. */
  duree: 30 * 24 * 60 * 60 * 1000,
  /** Entrées gardées au plus, pour ne pas remplir le stockage du visiteur. */
  capacite: 24,
  /** Préfixe du stockage local. */
  espace: 'solarys.pvgis',
};

/**
 * ATTRIBUTION. Quand un résultat vient du service, la page le dit — c'est une
 * exigence d'usage autant qu'une question d'honnêteté : un chiffre attribué
 * se vérifie, un chiffre anonyme se croit.
 */
export const ATTRIBUTION = {
  nom: 'PVGIS',
  editeur: 'Commission européenne, Centre commun de recherche (JRC)',
  mention: 'Données de rayonnement et de production : PVGIS, Commission '
    + 'européenne — JRC.',
  adresse: 'https://re.jrc.ec.europa.eu/pvg_tools/',
};

/** Le service est-il utilisable en l'état ? */
export const disponible = () => typeof relais === 'string' && relais.length > 0;

/**
 * Ce qu'on répond quand il ne l'est pas — sans dramatiser : la plateforme
 * n'en dépend pas, elle s'en enrichit.
 */
export const RAISON_INDISPONIBLE = 'Le relais vers le service de données solaires '
  + 'n’est pas encore déployé. L’étude utilise le référentiel interne, et chaque '
  + 'valeur indique son origine.';
