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
 * Publiée par décision explicite de son propriétaire.
 */
export const CONTACT = 'wajdibennaya5@gmail.com';

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
  courriel: 'wajdibennaya5@gmail.com',
};

/**
 * MOYENS DE RÈGLEMENT — ce que l'acheteur lit dans sa demande de commande.
 *
 * Sans cela, une commande demande « comment régler ? » et attend une réponse :
 * un aller-retour de plus, et autant d'acheteurs perdus en route. Renseigner
 * un moyen ici, c'est permettre à quelqu'un de payer dans la minute où il
 * décide d'acheter.
 *
 * HONNÊTETÉ TECHNIQUE : aucun de ces moyens ne confirme le paiement tout
 * seul. Le vendeur constate le règlement — relevé bancaire, explorateur de
 * chaîne — puis émet la clé avec `tools/cle.mjs`. C'est une vente au détail,
 * pas une caisse automatique ; en dessous de quelques ventes par jour, c'est
 * amplement suffisant, et cela évite d'attendre la validation d'un compte
 * marchand pour encaisser sa première licence.
 *
 *   usdt     : adresse de réception et réseau. Le réseau compte autant que
 *              l'adresse — un envoi sur le mauvais réseau est perdu.
 *   virement : RIB, IBAN, ou ce que la banque demande, en une ligne.
 *   autre    : tout ce qui se règle autrement — espèces, mandat, de la main
 *              à la main.
 *
 * Vides par défaut : des coordonnées de règlement ne se publient que par une
 * décision explicite de leur propriétaire.
 */
export const PAIEMENT = {
  usdt: { adresse: 'TBp9gdAeYdsiFvg7vKGoq2cM5TohLgbADB', reseau: 'TRON (TRC20)' },
  virement: '',
  autre: '',
};

/**
 * Les moyens de règlement renseignés, en phrases lisibles par l'acheteur.
 * Vide tant que rien n'est branché : on ne promet pas un moyen qu'on n'a pas.
 */
export function moyensDePaiement() {
  const out = [];
  const { adresse, reseau } = PAIEMENT.usdt ?? {};
  if (adresse) {
    // Le nom du réseau est repris tel que le portefeuille l'affiche : c'est
    // celui que l'acheteur devra sélectionner chez lui avant d'envoyer.
    out.push(`USDT${reseau ? `, réseau ${reseau}` : ''} : ${adresse}`);
  }
  if (PAIEMENT.virement) out.push(`Virement : ${PAIEMENT.virement}`);
  if (PAIEMENT.autre) out.push(PAIEMENT.autre);
  return out;
}

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

  // Quand un moyen de règlement est connu, l'acheteur peut payer sans
  // attendre de réponse ; sinon la demande reste une demande.
  const moyens = moyensDePaiement();
  const message =
    `Bonjour, je souhaite commander Solarys — ${nomFormule} (${offre.prix}${offre.unite ? ' ' + offre.unite : ''}).`
    + (moyens.length
      ? ` Règlement possible par — ${moyens.join(' — ')}.`
        + ' Je vous confirme dès que c\'est fait, et je reçois ma clé en retour.'
      : ' Merci de m\'indiquer comment régler.');

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
