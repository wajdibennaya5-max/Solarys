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

/**
 * COMMANDE DIRECTE — vendre sans plateforme de paiement.
 *
 * Ouvrir un compte marchand demande une inscription, une vérification, et
 * n'est pas possible partout. Ce n'est pas une raison pour ne rien vendre :
 * un installateur qu'on connaît règle par virement ou de la main à la main,
 * et reçoit sa clé par retour de message.
 *
 * Renseigner l'un des deux ci-dessous suffit à ouvrir la vente aujourd'hui.
 * Le bouton d'une formule devient alors « Commander » et rédige la demande
 * à votre place — la formule et son prix y figurent déjà.
 *
 *   whatsapp : au format international, sans + ni espaces — '21612345678'
 *   courriel : l'adresse qui reçoit les commandes
 *
 * Vides par défaut : ce sont des données personnelles, elles ne se publient
 * que par une décision explicite de leur propriétaire.
 */
export const COMMANDE = {
  whatsapp: '',
  courriel: '',
};

/** Cette formule mène-t-elle à un paiement en ligne ? */
export const estOuverte = (plan) => Boolean(OFFRES[plan]?.lien);

/** Une commande directe est-elle possible ? */
export const commandeDirecte = () =>
  Boolean(COMMANDE.whatsapp || COMMANDE.courriel);

/**
 * Adresse vers laquelle mène le bouton d'une formule, ou `null` si rien
 * n'est encore branché.
 *
 * Le paiement en ligne prime : quand il existe, l'acheteur n'a pas à
 * attendre une réponse humaine.
 */
export function lienAchat(plan, nomFormule = plan) {
  const offre = OFFRES[plan];
  if (!offre) return null;
  if (offre.lien) return offre.lien;
  if (!commandeDirecte()) return null;

  const message =
    `Bonjour, je souhaite commander Solarys — ${nomFormule} (${offre.prix}${offre.unite ? ' ' + offre.unite : ''}).`
    + ' Merci de m\'indiquer comment régler.';

  if (COMMANDE.whatsapp) {
    const numero = COMMANDE.whatsapp.replace(/[^0-9]/g, '');
    return `https://wa.me/${numero}?text=${encodeURIComponent(message)}`;
  }
  return `mailto:${COMMANDE.courriel}`
    + `?subject=${encodeURIComponent('Commande Solarys — ' + nomFormule)}`
    + `&body=${encodeURIComponent(message)}`;
}

/** Une formule peut-elle être obtenue, d'une manière ou d'une autre ? */
export const estVendable = (plan) => lienAchat(plan) !== null;

/** Au moins une formule est-elle vendable ? */
export const boutiqueOuverte = () => Object.keys(OFFRES).some(estVendable);

/** Ordre d'affichage, de la plus légère à la plus complète. */
export const ORDRE = ['credits', 'perpetual', 'subscription'];
