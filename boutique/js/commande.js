/**
 * La commande — ce qui transforme un panier en argent.
 *
 * Il n'y a ni compte marchand ni passerelle de paiement : la commande part
 * sur WhatsApp, rédigée d'avance, et se règle à la livraison. C'est la façon
 * dont on achète en Tunisie, et elle a deux mérites — elle ne demande aucune
 * inscription à l'acheteur, et elle fonctionne dès aujourd'hui pour le
 * vendeur, sans attendre la validation de qui que ce soit.
 */
import { formater } from './prix.js';
import { fraisDePort, gouvernorat } from './livraison.js';

/**
 * OÙ ARRIVENT LES COMMANDES — à renseigner pour ouvrir la boutique.
 *
 *   whatsapp : format international, sans + ni espaces — '216xxxxxxxx'
 *   courriel : utilisé seulement si le numéro est vide
 *
 * Vides par défaut : ce sont des données personnelles, elles ne se publient
 * que par une décision explicite de leur propriétaire.
 */
export const VENDEUR = {
  nom: '',
  whatsapp: '',
  courriel: '',
};

/** Moyens de règlement proposés à la commande. */
export const REGLEMENTS = {
  livraison: { nom: 'Paiement à la livraison', nomAr: 'الدفع عند الاستلام', defaut: true },
  virement: { nom: 'Virement bancaire', nomAr: 'تحويل بنكي', defaut: false },
  d17: { nom: 'D17 / La Poste', nomAr: 'د17 / البريد', defaut: false },
};

/** La boutique peut-elle recevoir une commande ? */
export const boutiqueOuverte = () =>
  Boolean(VENDEUR.whatsapp || VENDEUR.courriel);

/**
 * Rédige la commande, telle que le vendeur la lira.
 *
 * Elle doit se suffire à elle-même : le vendeur ne doit pas avoir à réclamer
 * l'adresse, le téléphone ou le détail des articles. Chaque aller-retour
 * évité est une commande qui ne se perd pas.
 */
export function redigerCommande({ articles, sousTotal, client, reglement = 'livraison' }) {
  const g = gouvernorat(client?.gouvernorat);
  const port = fraisDePort(client?.gouvernorat, sousTotal / 1000);
  const total = sousTotal + (port ? port.frais * 1000 : 0);

  const lignes = articles.map((a) => {
    const variante = a.variante ? ` (${a.variante})` : '';
    return `• ${a.produit.nom}${variante} × ${a.qte} — ${formater(a.total / 1000)}`;
  });

  const corps = [
    'Bonjour, je souhaite commander :',
    '',
    ...lignes,
    '',
    `Sous-total : ${formater(sousTotal / 1000)}`,
    port
      ? `Livraison ${g.nom} : ${port.offerte ? 'offerte' : formater(port.frais)}`
      : 'Livraison : à confirmer',
    `TOTAL : ${formater(total / 1000)}`,
    '',
    `Nom : ${client?.nom || '—'}`,
    `Téléphone : ${client?.telephone || '—'}`,
    `Adresse : ${client?.adresse || '—'}`,
    `Gouvernorat : ${g?.nom || '—'}`,
    `Règlement : ${REGLEMENTS[reglement]?.nom ?? reglement}`,
  ];

  return corps.join('\n');
}

/**
 * L'adresse vers laquelle part la commande, ou `null` si rien n'est branché.
 * WhatsApp d'abord : c'est là que le vendeur répond le plus vite.
 */
export function lienCommande(texte) {
  if (VENDEUR.whatsapp) {
    const numero = VENDEUR.whatsapp.replace(/[^0-9]/g, '');
    return `https://wa.me/${numero}?text=${encodeURIComponent(texte)}`;
  }
  if (VENDEUR.courriel) {
    return `mailto:${VENDEUR.courriel}`
      + `?subject=${encodeURIComponent('Nouvelle commande')}`
      + `&body=${encodeURIComponent(texte)}`;
  }
  return null;
}

/** Ce qui manque pour qu'une commande puisse partir. */
export function champsManquants(client) {
  const requis = { nom: 'votre nom', telephone: 'votre téléphone',
    adresse: 'votre adresse', gouvernorat: 'votre gouvernorat' };
  return Object.entries(requis)
    .filter(([k]) => !String(client?.[k] ?? '').trim())
    .map(([, libelle]) => libelle);
}
