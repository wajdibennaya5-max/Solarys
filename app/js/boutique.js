/**
 * La boutique — un seul endroit où brancher l'encaissement.
 *
 * Tant qu'un lien est vide, l'offre correspondante s'affiche mais ne se vend
 * pas : le bouton dit honnêtement que le paiement n'est pas encore ouvert,
 * plutôt que de mener à une page morte.
 *
 * POUR OUVRIR LA VENTE — coller l'adresse de paiement dans `lien`, rien
 * d'autre. La vitrine et l'application se mettent à jour toutes les deux :
 * elles lisent ce fichier, elles ne dupliquent ni les prix ni les liens.
 *
 *   perpetual: { …, lien: 'https://votreboutique.example/solarys-perpetuelle' }
 *
 * Les identifiants de formule sont ceux de `licence.js` : une offre vendue
 * ici correspond exactement à une clé émise là-bas.
 */

/** Les formules payantes, dans l'ordre où on les présente. */
export const OFFRES = {
  credits: {
    prix: '9 €',
    unite: '/ dossier',
    lien: '',
  },
  perpetual: {
    prix: '20 €',
    unite: 'une fois',
    lien: '',
  },
  subscription: {
    prix: '149 €',
    unite: '/ an',
    lien: '',
  },
};

/**
 * Adresse à laquelle un acheteur écrit si sa clé n'arrive pas.
 * Laissée vide volontairement : c'est une donnée personnelle, elle ne doit
 * être publiée que par une décision explicite de son propriétaire.
 */
export const CONTACT = '';

/** Cette formule est-elle achetable maintenant ? */
export const estOuverte = (plan) => Boolean(OFFRES[plan]?.lien);

/** Au moins une formule est-elle achetable ? */
export const boutiqueOuverte = () => Object.keys(OFFRES).some(estOuverte);

/** Ordre d'affichage, de la plus légère à la plus complète. */
export const ORDRE = ['credits', 'perpetual', 'subscription'];
