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
import { formaterRond } from './prix.js';

/** En français, la décimale est une virgule. Un « 7.4 » trahit le copier-coller. */
const virgule = (x) => String(x).replace('.', ',');

/**
 * OÙ ARRIVENT LES DEMANDES — à renseigner pour ouvrir l'activité.
 * Vides par défaut : ce sont des données personnelles, elles ne se publient
 * que par une décision explicite de leur propriétaire.
 */
export const CONTACT = {
  nom: 'Solarys',
  whatsapp: '21654062596',
  courriel: 'wajdibennaya5@gmail.com',
};

/**
 * Le service qui reçoit les demandes, sur votre serveur.
 *
 * Vide, la demande part sur WhatsApp comme avant. Renseigné, elle est
 * enregistrée, apparaît dans votre console d'administration, et déclenche les
 * deux courriels — le vôtre et celui du client.
 *
 * WHATSAPP RESTE LE FILET : si le serveur ne répond pas — téléphone éteint,
 * tunnel tombé, réseau coupé —, la demande bascule sur WhatsApp au lieu de se
 * perdre. Un prospect ne doit jamais disparaître parce qu'une machine dormait.
 */
export const API = 'https://20122011.xyz/api/etude';

/** Les chiffres transmis au serveur : ceux que le visiteur a sous les yeux. */
export function chiffresEtude(etude, toiture, toit) {
  return {
    consommation: etude.consommation,
    prixKwh: Number(etude.prixKwh.toFixed(4)),
    puissance: etude.puissance,
    modules: etude.modules,
    surface: etude.surface,
    production: etude.production,
    // Arrondis avant de partir : « 1014,7499 DT » dans un courriel ferait
    // douter de tout le reste.
    economieAnnuelle: Math.round(etude.economieAnnuelle),
    cout: Math.round(etude.cout),
    retour: etude.retour === null ? null : Number(etude.retour.toFixed(2)),
    ...(toiture?.L && toiture?.P
      ? { toiture: { largeur: toiture.L, profondeur: toiture.P } }
      : {}),
    // L'orientation pèse davantage que tout le reste : le vendeur doit
    // l'avoir avant de chiffrer, pas la découvrir sur place.
    ...(toit?.orientation && toit?.pente
      ? { toit: { orientation: toit.orientation, pente: toit.pente } }
      : {}),
  };
}

/**
 * Envoie la demande au serveur.
 * @returns {Promise<{ok:true, reference:string}|{ok:false, message:string}>}
 */
export async function envoyerAuServeur({ client, etude, toiture, toit, gouvernorat }) {
  if (!API) return { ok: false, message: 'Aucun serveur configuré.' };
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: client.nom,
        phone: client.telephone,
        email: client.courriel || '',
        area: gouvernorat || '',
        etude: chiffresEtude(etude, toiture, toit),
      }),
    });
    const corps = await r.json().catch(() => ({}));
    if (r.ok && corps.reference) return { ok: true, reference: corps.reference };
    // Un champ refusé se dit précisément : le visiteur doit savoir quoi corriger.
    const champ = corps.fields && Object.values(corps.fields)[0];
    return { ok: false, message: champ || corps.error || 'Le serveur a refusé la demande.' };
  } catch {
    return { ok: false, message: 'Serveur injoignable.' };
  }
}

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
    `• Consommation : ${etude.consommation.toLocaleString('fr-FR')} kWh/an`,
    `• Prix payé : ${virgule(etude.prixKwh.toFixed(3))} DT/kWh`,
    `• Puissance conseillée : ${virgule(etude.puissance)} kWc (${etude.modules} modules, ${etude.surface} m²)`,
    `• Production estimée : ${etude.production.toLocaleString('fr-FR')} kWh/an`,
    // Une estimation ne se donne pas au millime près : la fausse précision
    // se retourne contre celui qui l'affiche.
    `• Économie estimée : ${formaterRond(etude.economieAnnuelle)} par an`,
    `• Coût estimé : ${formaterRond(etude.cout)}`,
    etude.retour
      ? `• Retour sur investissement : ${virgule(etude.retour.toFixed(1))} ans`
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
