/**
 * LE FOND DE CARTE : déclaré, attribué, et jamais imposé.
 *
 * POURQUOI CE FICHIER EXISTE. Afficher une vue aérienne demande un fournisseur
 * de tuiles. Ce n'est pas un détail technique : c'est un tiers, des conditions
 * d'utilisation, une attribution obligatoire, et parfois une facture. Coder en
 * dur l'adresse d'un service dans quinze fichiers reviendrait à engager le
 * projet sans le dire.
 *
 * Alors la règle est la même que pour le service de données solaires : rien
 * n'est actif par défaut. Le fond se déclare en une ligne dans la page, et
 * tant qu'il ne l'est pas la carte fonctionne quand même — en repère et
 * échelle, sans image, et en le disant.
 *
 * CE QUE CE FICHIER NE FAIT PAS : aucun appel réseau. Il décrit des adresses,
 * il n'en visite aucune.
 */

/**
 * Les fonds connus, avec ce qu'ils montrent et ce qu'ils exigent.
 *
 * `attribution` n'est pas facultative : chacun de ces services l'impose, et
 * l'interface l'affiche en permanence sur la carte.
 */
export const FONDS = {
  osm: {
    id: 'osm',
    nom: 'Plan OpenStreetMap',
    nature: 'plan',
    modele: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    hote: 'tile.openstreetmap.org',
    zoomMax: 19,
    attribution: '© contributeurs OpenStreetMap',
    lien: 'https://www.openstreetmap.org/copyright',
    // Un plan montre les rues et les emprises de bâtiments, pas les toits.
    // Le dire évite qu'on croie dessiner un pan sur une photo.
    avertissement: 'Un plan ne montre pas la toiture : il situe le bâtiment. '
      + 'Pour dessiner un toit, un fond aérien est nécessaire.',
    conditions: 'Usage modéré uniquement, attribution obligatoire.',
  },
  'esri-imagerie': {
    id: 'esri-imagerie',
    nom: 'Vue aérienne Esri World Imagery',
    nature: 'aerien',
    modele: 'https://server.arcgisonline.com/ArcGIS/rest/services/'
      + 'World_Imagery/MapServer/tile/{z}/{y}/{x}',
    hote: 'server.arcgisonline.com',
    zoomMax: 19,
    attribution: 'Sources : Esri, Maxar, Earthstar Geographics',
    lien: 'https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9',
    avertissement: 'Image aérienne d’archive : sa date n’est pas garantie et un '
      + 'bâtiment récent peut en être absent.',
    conditions: 'Attribution obligatoire. Vérifiez les conditions du fournisseur '
      + 'avant tout usage commercial.',
  },
};

/** Le fond choisi pour cette page, ou `null` — l'état par défaut. */
let choisi = null;

/** Le fond actif, ou `null` si la page n'en a déclaré aucun. */
export const fondActif = () => choisi;

/** Un fond a-t-il été déclaré ? */
export const disponible = () => choisi !== null;

/**
 * Déclare le fond de carte de cette page.
 *
 * Accepte l'identifiant d'un fond connu, ou une description complète pour un
 * service dont le projet ne sait rien — un serveur interne, un abonnement.
 * Une description sans attribution est refusée : c'est la seule condition que
 * tous les fournisseurs partagent.
 *
 * @returns {object|null} le fond retenu, ou `null` si la déclaration est
 *   inutilisable — jamais d'exception : une carte absente ne casse pas la page.
 */
export function definirFond(valeur) {
  if (!valeur) { choisi = null; return null; }

  if (typeof valeur === 'string') {
    choisi = FONDS[valeur] ?? null;
    return choisi;
  }

  const { modele, attribution } = valeur;
  const modeleValide = typeof modele === 'string'
    && /^https:\/\//.test(modele)
    && modele.includes('{z}') && modele.includes('{x}') && modele.includes('{y}');
  if (!modeleValide || !attribution) { choisi = null; return null; }

  let hote = '';
  try { hote = new URL(modele.replace(/\{[zxys]\}/g, '1')).host; } catch { return (choisi = null); }

  choisi = {
    id: 'personnalise',
    nom: valeur.nom || 'Fond cartographique',
    nature: valeur.nature === 'aerien' ? 'aerien' : 'plan',
    modele,
    hote,
    zoomMax: Number.isFinite(Number(valeur.zoomMax)) ? Number(valeur.zoomMax) : 19,
    attribution: String(attribution),
    lien: valeur.lien ?? null,
    avertissement: valeur.avertissement ?? null,
    conditions: valeur.conditions ?? 'Conditions du fournisseur à vérifier.',
  };
  return choisi;
}

/**
 * L'adresse d'une tuile.
 * @returns {string|null} `null` sans fond : l'appelant affiche alors le
 *   quadrillage, il n'affiche pas une image cassée.
 */
export function adresseTuile({ x, y, z }, fond = choisi) {
  if (!fond) return null;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  if (z > fond.zoomMax) return null;
  return fond.modele
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y))
    .replace('{s}', 'a');
}

/**
 * Ce que la politique de sécurité de la page doit autoriser pour ce fond.
 *
 * Le projet interdit par défaut toute image extérieure. Un fond déclaré sans
 * cette autorisation ne montrerait rien, sans le moindre message d'erreur —
 * exactement le genre de panne muette que ce projet refuse.
 */
export const hotesAAutoriser = (fond = choisi) => (fond ? [fond.hote] : []);

/** Ce qu'on peut honnêtement faire avec ce fond, ou sans. */
export function capacites(fond = choisi) {
  if (!fond) {
    return {
      image: false,
      toiture: false,
      phrase: 'Aucun fond cartographique n’est configuré : la carte affiche le repère, '
        + 'les coordonnées et l’échelle, sans image du terrain.',
    };
  }
  if (fond.nature !== 'aerien') {
    return {
      image: true,
      toiture: false,
      phrase: 'Fond en plan : il situe le bâtiment mais ne montre pas la toiture. '
        + 'Les mesures de toit tracées dessus seraient sans support visuel.',
    };
  }
  return {
    image: true,
    toiture: true,
    phrase: 'Fond aérien : le tracé du toit est possible. Toute mesure qui en découle '
      + 'reste une estimation à partir de l’image, à confirmer sur site.',
  };
}
