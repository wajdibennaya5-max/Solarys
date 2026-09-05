/**
 * Le dinar tunisien se compte en millimes — trois décimales, pas deux.
 *
 * Compter en dinars flottants, c'est accumuler des erreurs d'arrondi qui
 * finissent par un total faux d'un millime : sans gravité pour l'acheteur,
 * fatal pour la confiance quand il le remarque. Tout se calcule donc en
 * millimes entiers, et ne redevient dinars qu'à l'affichage.
 */

/** Un dinar vaut mille millimes. */
export const MILLIMES = 1000;

/** Dinars vers millimes, arrondi au plus proche. */
export const enMillimes = (dinars) => Math.round(Number(dinars || 0) * MILLIMES);

/** Millimes vers dinars. */
export const enDinars = (millimes) => Number(millimes || 0) / MILLIMES;

/**
 * Un montant tel qu'on l'écrit sur une facture tunisienne : « 129,500 DT ».
 * @param {number} dinars
 * @param {{devise?:boolean, langue?:'fr'|'ar'}} [opts]
 */
export function formater(dinars, { devise = true, langue = 'fr' } = {}) {
  const m = enMillimes(dinars);
  const entier = Math.trunc(Math.abs(m) / MILLIMES);
  const reste = String(Math.abs(m) % MILLIMES).padStart(3, '0');
  const signe = m < 0 ? '-' : '';
  // Séparateur de milliers : une espace insécable, comme partout en Tunisie.
  const groupe = String(entier).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const nombre = `${signe}${groupe},${reste}`;
  if (!devise) return nombre;
  // Insécable également devant la devise : « 1 234,500 » et « DT » ne
  // doivent jamais se retrouver sur deux lignes.
  const NBSP = '\u00a0';
  return langue === 'ar' ? `${nombre}${NBSP}د.ت` : `${nombre}${NBSP}DT`;
}
