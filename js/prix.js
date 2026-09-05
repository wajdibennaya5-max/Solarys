/**
 * Le dinar tunisien se compte en millimes — trois décimales, pas deux.
 *
 * Un montant mal écrit décrédibilise une étude payante plus sûrement qu'une
 * erreur de calcul : le client ne vérifie pas le kilowattheure, mais il voit
 * tout de suite « 1015.3 DT » là où sa facture dit « 1 015,300 ».
 */

/** Un dinar vaut mille millimes. */
export const MILLIMES = 1000;

/** Dinars vers millimes, arrondi au plus proche. */
export const enMillimes = (dinars) => Math.round(Number(dinars || 0) * MILLIMES);

/** Millimes vers dinars. */
export const enDinars = (millimes) => Number(millimes || 0) / MILLIMES;

/**
 * Un montant tel qu'on l'écrit sur une facture tunisienne : « 1 015,300 DT ».
 *
 * Aucune espace sécable : le séparateur de milliers est une espace FINE
 * INSÉCABLE (U+202F) et la devise est précédée d'une insécable ordinaire.
 * Un prix ne doit jamais se couper en fin de ligne.
 */
export function formater(dinars, { devise = true, langue = 'fr', decimales = 3 } = {}) {
  const m = enMillimes(dinars);
  const entier = Math.trunc(Math.abs(m) / MILLIMES);
  const reste = String(Math.abs(m) % MILLIMES).padStart(3, '0').slice(0, decimales);
  const signe = m < 0 ? '-' : '';
  const groupe = String(entier).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const nombre = decimales > 0 ? `${signe}${groupe},${reste}` : `${signe}${groupe}`;
  if (!devise) return nombre;
  return langue === 'ar' ? `${nombre} د.ت` : `${nombre} DT`;
}

/** Un montant arrondi au dinar, pour les grands nombres d'une étude. */
export const formaterRond = (dinars, opts = {}) =>
  formater(Math.round(Number(dinars || 0)), { ...opts, decimales: 0 });

/**
 * ÉCHAPPE UN TEXTE AVANT DE L'INSÉRER DANS DU HTML.
 *
 * Le seul rempart d'un site sans serveur contre l'injection : tout ce qui
 * vient d'une saisie, d'une URL ou d'une réponse réseau passe par ici avant
 * de toucher `innerHTML`. Échapper le seul `<` suffit à empêcher d'ouvrir une
 * balise, mais laisse passer des entités cassées et des attributs rompus —
 * autant tout échapper, cela ne coûte rien.
 */
export function echapper(texte) {
  return String(texte ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
