/**
 * PROVENANCE — d'où vient chaque valeur, et ce qu'elle vaut.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ LA RÈGLE : aucune valeur ne circule nue dans la plateforme. Chacune   │
 * │ voyage avec sa source, sa méthode, sa confiance et son horodatage.    │
 * │                                                                       │
 * │ POURQUOI MAINTENANT. Tant que tous les chiffres venaient du même      │
 * │ moteur, on savait d'où ils sortaient. Dès qu'une source extérieure    │
 * │ entre — un service scientifique de rayonnement, par exemple — deux    │
 * │ productions annuelles peuvent coexister à l'écran sans que rien ne    │
 * │ dise laquelle a été mesurée, laquelle a été estimée, et laquelle a    │
 * │ été calculée par nous à partir de l'autre. C'est exactement là que    │
 * │ les plateformes solaires deviennent invérifiables.                    │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Une valeur enveloppée reste utilisable comme un nombre : `valeur.valeur`
 * porte le nombre, et `nu()` le rend quand on n'a pas besoin du reste.
 */

/**
 * Les origines possibles d'une donnée, de la plus solide à la plus fragile.
 *
 * `rang` sert à propager la confiance : une valeur calculée à partir de trois
 * autres ne peut pas être plus sûre que la moins sûre des trois.
 */
export const SOURCES = {
  saisie: {
    rang: 5,
    id: 'saisie',
    nom: 'Saisi par vous',
    court: 'SAISIE',
    phrase: 'Cette valeur vient de ce que vous avez renseigné.',
  },
  mesure: {
    rang: 4,
    id: 'mesure',
    nom: 'Donnée mesurée',
    court: 'MESURE',
    phrase: 'Cette valeur provient d’un relevé, non d’une estimation.',
  },
  externe: {
    rang: 3,
    id: 'externe',
    nom: 'Source scientifique externe',
    court: 'SOURCE',
    phrase: 'Cette valeur provient d’un service de données extérieur, cité avec '
      + 'sa version et sa date d’interrogation.',
  },
  catalogue: {
    rang: 3,
    id: 'catalogue',
    nom: 'Catalogue matériel',
    court: 'CATALOGUE',
    phrase: 'Cette valeur vient de la fiche technique du matériel retenu.',
  },
  calcul: {
    rang: 2,
    id: 'calcul',
    nom: 'Calculé par la plateforme',
    court: 'CALCUL',
    phrase: 'Cette valeur est dérivée d’autres données par nos propres calculs.',
  },
  interne: {
    rang: 2,
    id: 'interne',
    nom: 'Référentiel interne',
    court: 'INTERNE',
    phrase: 'Cette valeur vient de notre référentiel, faute de source externe '
      + 'disponible au moment du calcul.',
  },
  hypothese: {
    rang: 1,
    id: 'hypothese',
    nom: 'Hypothèse',
    court: 'HYPOTHÈSE',
    phrase: 'Cette valeur est une hypothèse de travail, pas une mesure. Elle est '
      + 'affichée et modifiable.',
  },
  absente: {
    rang: 0,
    id: 'absente',
    nom: 'Non disponible',
    court: 'ABSENTE',
    phrase: 'Cette donnée n’est pas disponible. Elle n’a pas été remplacée par '
      + 'une valeur inventée.',
  },
};

export const source = (id) => SOURCES[id] ?? SOURCES.absente;

/** Les trois niveaux de confiance affichables. */
export const CONFIANCES = {
  elevee: { rang: 3, id: 'elevee', nom: 'Élevée' },
  moyenne: { rang: 2, id: 'moyenne', nom: 'Moyenne' },
  preliminaire: { rang: 1, id: 'preliminaire', nom: 'Préliminaire' },
};

/** La confiance par défaut d'une source, quand rien de plus n'est su. */
const CONFIANCE_PAR_SOURCE = {
  saisie: 'elevee', mesure: 'elevee', externe: 'elevee', catalogue: 'elevee',
  calcul: 'moyenne', interne: 'moyenne', hypothese: 'preliminaire',
  absente: 'preliminaire',
};

/**
 * Enveloppe une valeur avec sa provenance.
 *
 * @param {*} valeur le nombre, la chaîne, le tableau
 * @param {object} quoi
 * @param {string} quoi.source une clé de `SOURCES`
 * @param {string} [quoi.methode] comment elle a été obtenue, en clair
 * @param {string} [quoi.unite]
 * @param {string} [quoi.confiance] une clé de `CONFIANCES`
 * @param {object} [quoi.details] ce qui permet d'auditer : version, paramètres…
 * @param {Array} [quoi.depuis] les valeurs enveloppées dont celle-ci découle
 */
export function tracer(valeur, {
  source: idSource, methode = null, unite = '', confiance = null,
  details = null, depuis = null, horodatage = null,
} = {}) {
  const s = source(idSource);
  // Une valeur dérivée n'est jamais plus sûre que la moins sûre de ses
  // sources : c'est la seule règle de propagation qui ne surpromet pas.
  const heritee = Array.isArray(depuis) && depuis.length
    ? depuis.reduce((pire, d) => {
      const c = CONFIANCES[d?.confiance] ?? CONFIANCES.preliminaire;
      return c.rang < pire.rang ? c : pire;
    }, CONFIANCES.elevee).id
    : null;
  const propre = confiance ?? CONFIANCE_PAR_SOURCE[s.id] ?? 'preliminaire';
  const retenue = heritee
    ? ((CONFIANCES[heritee].rang < CONFIANCES[propre].rang) ? heritee : propre)
    : propre;

  return {
    valeur,
    source: s.id,
    sourceNom: s.nom,
    methode,
    unite,
    confiance: retenue,
    details: details ?? null,
    depuis: Array.isArray(depuis)
      ? depuis.map((d) => ({ source: d?.source ?? 'absente', unite: d?.unite ?? '' }))
      : null,
    horodatage: horodatage ?? new Date().toISOString(),
  };
}

/** Une donnée qu'on n'a pas — dite absente plutôt que remplacée par zéro. */
export const absente = (methode = null) =>
  tracer(null, { source: 'absente', methode, confiance: 'preliminaire' });

/** Le nombre nu, quand le reste ne sert pas. `null` si la donnée est absente. */
export const nu = (v) => (v && typeof v === 'object' && 'valeur' in v ? v.valeur : v);

/** Est-ce une valeur enveloppée ? */
export const estTracee = (v) => Boolean(v && typeof v === 'object'
  && 'valeur' in v && 'source' in v && 'horodatage' in v);

/** La donnée existe-t-elle vraiment ? */
export const disponible = (v) => estTracee(v)
  ? (v.source !== 'absente' && v.valeur !== null && v.valeur !== undefined)
  : (v !== null && v !== undefined);

/**
 * La confiance globale d'un ensemble de valeurs : celle de la plus faible.
 *
 * On ne fait pas de moyenne. Une étude dont un seul chiffre est préliminaire
 * est une étude préliminaire : moyenner reviendrait à diluer le point faible
 * dans les points forts, ce qui est précisément ce qu'il ne faut pas faire.
 */
export function confianceGlobale(valeurs) {
  const tracees = (valeurs ?? []).filter(estTracee);
  if (!tracees.length) return CONFIANCES.preliminaire.id;
  return tracees.reduce((pire, v) => {
    const c = CONFIANCES[v.confiance] ?? CONFIANCES.preliminaire;
    return c.rang < CONFIANCES[pire].rang ? c.id : pire;
  }, CONFIANCES.elevee.id);
}

/** Le compte par source, pour montrer d'un coup d'œil la composition d'une étude. */
export function composition(valeurs) {
  const out = {};
  for (const v of (valeurs ?? []).filter(estTracee)) {
    out[v.source] = (out[v.source] ?? 0) + 1;
  }
  return out;
}

/**
 * L'explication complète d'une valeur : ce qu'un client clique pour savoir
 * « comment ce chiffre est calculé ? ».
 */
export function expliquer(v, nom = 'Cette valeur') {
  if (!estTracee(v)) {
    return { nom, valeur: v, source: 'absente', phrase: SOURCES.absente.phrase,
      methode: null, details: null, confiance: 'preliminaire' };
  }
  const s = source(v.source);
  return {
    nom,
    valeur: v.valeur,
    unite: v.unite,
    source: s.id,
    sourceNom: s.nom,
    court: s.court,
    phrase: s.phrase,
    methode: v.methode,
    details: v.details,
    confiance: v.confiance,
    confianceNom: (CONFIANCES[v.confiance] ?? CONFIANCES.preliminaire).nom,
    horodatage: v.horodatage,
    depuis: v.depuis,
  };
}
