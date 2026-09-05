/**
 * Ne jamais perdre une simulation en cours.
 *
 * LE DÉFAUT QUE CE FICHIER CORRIGE : rien n'était conservé. Le visiteur
 * remplissait cinq étapes, recevait un appel, revenait — et retrouvait un
 * formulaire vide. Sur Android, l'onglet en arrière-plan est tué sans
 * avertissement : ce n'est pas un cas rare, c'est le cas ordinaire.
 *
 * Tout reste dans le navigateur du visiteur. Rien ne part sur un serveur tant
 * qu'il n'a pas demandé à être rappelé — c'est ce que la page promet, donc
 * c'est ce qu'elle doit faire.
 */

const ESPACE = 'solarys.simulation';

/**
 * Au-delà de ce délai, une simulation reprise n'a plus de sens : les tarifs
 * ont pu changer, et le visiteur ne se souvient plus de ce qu'il avait saisi.
 * Mieux vaut repartir proprement que reprendre des chiffres périmés.
 */
export const PEREMPTION = 7 * 24 * 60 * 60 * 1000;

/** Le stockage disponible, ou `null` en navigation privée. */
function magasin() {
  try {
    const t = globalThis.localStorage;
    if (!t) return null;
    // Une écriture d'essai : certains navigateurs exposent l'objet et
    // refusent l'écriture. Le découvrir ici évite de le découvrir en plein
    // parcours.
    t.setItem(`${ESPACE}.essai`, '1');
    t.removeItem(`${ESPACE}.essai`);
    return t;
  } catch {
    return null;
  }
}

/** Le stockage est-il utilisable ? */
export const disponible = () => magasin() !== null;

/**
 * Range l'état de la simulation.
 * @returns {boolean} `false` si le navigateur l'a refusé — sans jamais lever.
 */
export function enregistrer(etat) {
  const t = magasin();
  if (!t) return false;
  try {
    t.setItem(ESPACE, JSON.stringify({ a: Date.now(), etat }));
    return true;
  } catch {
    // Quota dépassé, mode privé : une simulation non sauvegardée reste
    // utilisable. On ne bloque jamais le visiteur pour cela.
    return false;
  }
}

/**
 * Relit une simulation en cours.
 * @returns {{etat:object, age:number}|null} `null` si rien, illisible ou périmé
 */
export function relire() {
  const t = magasin();
  if (!t) return null;
  try {
    const brut = t.getItem(ESPACE);
    if (!brut) return null;
    const { a, etat } = JSON.parse(brut);
    if (!a || !etat || typeof etat !== 'object') return null;
    const age = Date.now() - a;
    if (age < 0 || age > PEREMPTION) { effacer(); return null; }
    return { etat, age };
  } catch {
    // Un stockage abîmé ne doit pas empêcher de recommencer.
    effacer();
    return null;
  }
}

/** Oublie la simulation en cours. */
export function effacer() {
  const t = magasin();
  if (!t) return;
  try { t.removeItem(ESPACE); } catch { /* rien à faire, rien à dire */ }
}

/** L'âge d'une reprise, en français : « il y a 3 heures ». */
export function ageEnClair(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 2) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} minutes`;
  const heures = Math.round(minutes / 60);
  if (heures < 24) return `il y a ${heures} heure${heures > 1 ? 's' : ''}`;
  const jours = Math.round(heures / 24);
  return `il y a ${jours} jour${jours > 1 ? 's' : ''}`;
}
