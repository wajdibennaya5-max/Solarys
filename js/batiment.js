/**
 * À qui appartient le toit — et pourquoi cela change tout le calcul.
 *
 * LE DÉFAUT QUE CE FICHIER CORRIGE : le calcul supposait un foyer, toujours.
 * Or le soleil produit à midi. Une maison est vide à midi : ses habitants
 * travaillent, et l'électricité produite part sur le réseau au prix de
 * rachat, moitié moindre. Un bureau, un atelier, une école sont pleins à
 * midi : ils consomment presque tout ce qu'ils produisent.
 *
 * Deux bâtiments identiques, même toit, même soleil, même facture, n'ont donc
 * PAS la même rentabilité — et l'étude leur annonçait la même. Sur une
 * entreprise, l'erreur se compte en années de retour.
 *
 * C'est la première question de l'assistant parce que c'est celle qui
 * gouverne toutes les suivantes.
 */

/**
 * Le taux d'autoconsommation de référence, à production égale à la
 * consommation annuelle. C'est le point d'ancrage de la courbe de `etude.js`.
 *
 * Ces valeurs sont des ordres de grandeur de terrain, à recaler sur des
 * relevés réels quand il y en aura. Elles ne sont pas interchangeables : le
 * rapport entre elles — un tertiaire autoconsomme nettement plus qu'un
 * logement — est plus solide que leur valeur absolue.
 */
export const TYPES = [
  {
    id: 'maison',
    nom: 'Maison',
    resume: 'Villa, appartement, logement',
    icone: 'maison',
    autoconsommation: 0.65,
    /** Le foyer consomme surtout le soir : le surplus de midi part au réseau. */
    note: 'La maison est souvent vide à midi, quand le soleil donne le plus. '
      + 'Une partie de la production part sur le réseau.',
    profil: 'residentiel',
  },
  {
    id: 'commerce',
    nom: 'Commerce ou bureau',
    resume: 'Boutique, cabinet, agence',
    icone: 'commerce',
    autoconsommation: 0.80,
    note: 'Ouvert en pleine journée : presque toute la production est '
      + 'consommée sur place, au prix d’achat et non au prix de rachat.',
    profil: 'tertiaire',
  },
  {
    id: 'industrie',
    nom: 'Atelier ou industrie',
    resume: 'Production, froid, pompage',
    icone: 'industrie',
    autoconsommation: 0.88,
    note: 'Machines et froid tournent aux heures de soleil : c’est le profil '
      + 'où le photovoltaïque rapporte le plus vite.',
    profil: 'industriel',
  },
  {
    id: 'agricole',
    nom: 'Exploitation agricole',
    resume: 'Pompage, irrigation, élevage',
    icone: 'agricole',
    autoconsommation: 0.85,
    note: 'Le pompage suit le soleil presque heure par heure : l’adéquation '
      + 'entre production et besoin y est naturellement forte.',
    profil: 'agricole',
  },
];

export const typeBatiment = (id) => TYPES.find((t) => t.id === id) ?? null;

/** Le type retenu par défaut, quand la question n'a pas encore été posée. */
export const TYPE_DEFAUT = 'maison';

/**
 * Le taux d'autoconsommation de référence pour un type de bâtiment.
 * Sans réponse, on retient celui du logement : c'est le plus prudent des
 * quatre, donc celui qui ne surpromet à personne.
 */
export function autoconsommationDe(id) {
  return (typeBatiment(id) ?? typeBatiment(TYPE_DEFAUT)).autoconsommation;
}
