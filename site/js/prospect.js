/**
 * Le prospect — ce qui transforme une étude gratuite en argent.
 *
 * Le site n'a ni serveur ni base de données : la demande part sur WhatsApp,
 * rédigée d'avance, avec l'étude déjà calculée dedans. Le client n'a rien à
 * retaper, et le vendeur reçoit un dossier complet plutôt qu'un « bonjour ».
 *
 * C'est aussi ce qui permet de recevoir la photo de la facture : le fichier
 * ne peut être téléversé nulle part sans serveur, mais il se joint en deux
 * gestes à la conversation qui vient de s'ouvrir.
 */
import { formater, formaterRond } from './prix.js';

/**
 * OÙ ARRIVENT LES DEMANDES — à renseigner pour ouvrir l'activité.
 * Vides par défaut : ce sont des données personnelles, elles ne se publient
 * que par une décision explicite de leur propriétaire.
 */
export const CONTACT = {
  nom: '',
  whatsapp: '',
  courriel: '',
};

/**
 * L'étude détaillée, celle qui se vend.
 *
 * L'estimation en ligne est gratuite et le restera : c'est elle qui donne
 * envie. Ce qui se paie, c'est le dossier qu'un installateur accepte comme
 * base de devis, et que le client peut opposer à trois devis contradictoires.
 */
export const OFFRE = {
  prix: 90,
  contenu: [
    'Dimensionnement détaillé : modules, onduleur, câblage, protections',
    'Calepinage de votre toiture, à ses dimensions réelles',
    'Production mois par mois, et non une moyenne annuelle',
    'Étude économique complète : trésorerie sur 25 ans, temps de retour',
    'Dossier remis en PDF, opposable à vos devis d’installateurs',
  ],
};

/** L'activité peut-elle recevoir une demande ? */
export const ouverte = () => Boolean(CONTACT.whatsapp || CONTACT.courriel);

/** Ce qui manque pour qu'une demande puisse partir. */
export function champsManquants(client) {
  const requis = { nom: 'votre nom', telephone: 'votre téléphone' };
  return Object.entries(requis)
    .filter(([k]) => !String(client?.[k] ?? '').trim())
    .map(([, libelle]) => libelle);
}

/**
 * Rédige la demande, telle que le vendeur la lira.
 * Elle porte l'étude entière : il peut chiffrer sans rappeler.
 */
export function redigerDemande({ etude, client, gouvernorat, payante = true }) {
  const lignes = [
    payante
      ? `Bonjour, je souhaite l’étude détaillée (${formaterRond(OFFRE.prix)}).`
      : 'Bonjour, je souhaite être rappelé au sujet de mon projet solaire.',
    '',
    `Nom : ${client?.nom || '—'}`,
    `Téléphone : ${client?.telephone || '—'}`,
    `Gouvernorat : ${gouvernorat || '—'}`,
    '',
    'Mon estimation en ligne :',
    `• Consommation : ${etude.consommation} kWh/an`,
    `• Prix payé : ${etude.prixKwh.toFixed(3)} DT/kWh`,
    `• Puissance conseillée : ${etude.puissance} kWc (${etude.modules} modules, ${etude.surface} m²)`,
    `• Production estimée : ${etude.production} kWh/an`,
    `• Économie estimée : ${formater(etude.economieAnnuelle)} par an`,
    `• Coût estimé : ${formater(etude.cout)}`,
    etude.retour
      ? `• Retour sur investissement : ${etude.retour.toFixed(1)} ans`
      : '• Retour sur investissement : au-delà de 25 ans',
    '',
    'Je joins la photo de ma facture STEG à ce message.',
  ];
  return lignes.join('\n');
}

/** L'adresse vers laquelle part la demande, ou `null` si rien n'est branché. */
export function lienDemande(texte) {
  if (CONTACT.whatsapp) {
    return `https://wa.me/${CONTACT.whatsapp.replace(/[^0-9]/g, '')}`
      + `?text=${encodeURIComponent(texte)}`;
  }
  if (CONTACT.courriel) {
    return `mailto:${CONTACT.courriel}`
      + `?subject=${encodeURIComponent('Demande d’étude photovoltaïque')}`
      + `&body=${encodeURIComponent(texte)}`;
  }
  return null;
}
