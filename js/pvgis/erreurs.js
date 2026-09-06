/**
 * LES ERREURS DU SERVICE — traduites, jamais affichées brutes.
 *
 * Un client à qui l'on montre « TypeError: Failed to fetch » n'apprend rien,
 * s'inquiète, et n'a aucune action à entreprendre. Chaque situation reçoit
 * ici une phrase qui dit ce qui se passe, ce que cela change pour son étude,
 * et ce qu'il peut faire — le détail technique, lui, part au journal.
 */

export const GENRES = {
  indisponible: {
    id: 'indisponible',
    technique: 'Le relais n’est pas configuré ou le service ne répond pas.',
    client: 'Le service de données solaires est temporairement indisponible. '
      + 'Votre projet reste enregistré, et l’étude se poursuit avec notre '
      + 'référentiel interne.',
    recuperable: true,
  },
  parametres: {
    id: 'parametres',
    technique: 'Paramètres refusés par le service ou invalides avant envoi.',
    client: 'Certaines données de localisation ou de configuration doivent être '
      + 'corrigées avant de pouvoir interroger le service.',
    recuperable: false,
  },
  delai: {
    id: 'delai',
    technique: 'Délai d’attente dépassé.',
    client: 'Le calcul prend plus de temps que prévu. Vous pouvez réessayer, ou '
      + 'continuer : l’étude reste complète avec notre référentiel interne.',
    recuperable: true,
  },
  horsZone: {
    id: 'horsZone',
    technique: 'Coordonnées hors de la couverture des bases de données.',
    client: 'Ce point n’est pas couvert par la base de données solaires. '
      + 'Vérifiez la position sur la carte.',
    recuperable: false,
  },
  reponse: {
    id: 'reponse',
    technique: 'Réponse reçue mais illisible ou incomplète.',
    client: 'La réponse du service n’a pas pu être exploitée. L’étude se poursuit '
      + 'avec notre référentiel interne.',
    recuperable: true,
  },
  trafic: {
    id: 'trafic',
    technique: 'Trop de requêtes : limitation côté service.',
    client: 'Le service limite temporairement le nombre de calculs. Réessayez '
      + 'dans quelques minutes.',
    recuperable: true,
  },
};

export const genre = (id) => GENRES[id] ?? GENRES.indisponible;

/**
 * Un échec exploitable : ce que le client lit, ce que le journal garde.
 *
 * Il n'y a pas d'exception levée dans cette couche. Une intégration externe
 * qui lève casse la page qui l'appelle ; ici, un échec est une valeur comme
 * une autre, que l'appelant traite ou ignore.
 */
export function echec(idGenre, { detail = null, statut = null, calcul = null } = {}) {
  const g = genre(idGenre);
  return {
    ok: false,
    genre: g.id,
    recuperable: g.recuperable,
    messageClient: g.client,
    messageTechnique: g.technique,
    detail: detail === null ? null : String(detail).slice(0, 300),
    statut,
    calcul,
    horodatage: new Date().toISOString(),
  };
}

/** Le genre d'échec correspondant à un code HTTP. */
export function depuisStatut(statut) {
  const n = Number(statut);
  if (n === 400 || n === 422) return 'parametres';
  if (n === 404) return 'horsZone';
  if (n === 429) return 'trafic';
  if (n === 408 || n === 504) return 'delai';
  return 'indisponible';
}
