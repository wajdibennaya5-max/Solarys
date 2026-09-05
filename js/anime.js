/**
 * Les animations — et la règle qui les gouverne.
 *
 * Un chiffre qui monte de zéro à sa valeur se regarde ; le même chiffre posé
 * d'un coup se lit et s'oublie. C'est tout l'intérêt, et c'est aussi toute la
 * limite : au-delà de ce qui aide à comprendre, une animation fait attendre.
 *
 * DEUX RÈGLES, SANS EXCEPTION :
 *
 * 1. `prefers-reduced-motion` est respecté. Ce n'est pas une préférence
 *    esthétique : certains visiteurs ont des vertiges devant une page qui
 *    bouge. Chez eux, la valeur finale s'affiche immédiatement.
 * 2. Rien n'est jamais caché en attendant son animation. Si le script échoue,
 *    ne se charge pas, ou si l'onglet est en arrière-plan, le chiffre est là.
 */

/** Le visiteur a-t-il demandé moins de mouvement ? */
export function mouvementReduit() {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

/** Adoucissement : rapide au début, posé à la fin. */
const adoucir = (t) => 1 - (1 - t) ** 3;

/**
 * Fait monter un nombre jusqu'à sa valeur.
 *
 * @param {HTMLElement} noeud
 * @param {number} valeur la valeur finale
 * @param {object} [options]
 * @param {(n:number)=>string} [options.format] comment écrire chaque étape
 * @param {number} [options.duree] en millisecondes
 * @returns {void}
 */
export function compter(noeud, valeur, { format = String, duree = 900 } = {}) {
  if (!noeud) return;
  const fin = Number(valeur);
  if (!Number.isFinite(fin)) return;

  // La valeur finale d'abord : elle reste juste quoi qu'il arrive ensuite.
  noeud.textContent = format(fin);
  if (mouvementReduit() || duree <= 0) return;

  const depart = performance.now();
  const pas = (maintenant) => {
    const t = Math.min(1, (maintenant - depart) / duree);
    noeud.textContent = format(fin * adoucir(t));
    if (t < 1) requestAnimationFrame(pas);
    else noeud.textContent = format(fin);
  };
  requestAnimationFrame(pas);
}

/**
 * Anime tous les chiffres d'un conteneur, quand il entre dans l'écran.
 *
 * Compter pendant que le bloc est encore hors de vue gaspille l'effet : le
 * visiteur arrive devant un chiffre déjà posé. On attend qu'il le regarde.
 *
 * Chaque nœud porte `data-compte` (la valeur) et, si besoin, `data-decimales`.
 */
export function animerChiffres(conteneur, { duree = 900 } = {}) {
  if (!conteneur) return;
  const noeuds = [...conteneur.querySelectorAll('[data-compte]')];
  if (!noeuds.length) return;

  const lancer = (n) => {
    if (n.dataset.compteFait === 'oui') return;
    n.dataset.compteFait = 'oui';
    const decimales = Number(n.dataset.decimales) || 0;
    const suffixe = n.dataset.suffixe ?? '';
    compter(n, Number(n.dataset.compte), {
      duree,
      format: (v) => v.toLocaleString('fr-FR', {
        minimumFractionDigits: decimales, maximumFractionDigits: decimales }) + suffixe,
    });
  };

  // Sans IntersectionObserver — navigateur ancien, environnement de test —
  // on lance tout de suite plutôt que de ne rien afficher.
  if (typeof IntersectionObserver !== 'function') {
    noeuds.forEach(lancer);
    return;
  }

  const guetteur = new IntersectionObserver((entrees) => {
    for (const e of entrees) {
      if (!e.isIntersecting) continue;
      lancer(e.target);
      guetteur.unobserve(e.target);
    }
  }, { threshold: 0.35 });
  noeuds.forEach((n) => guetteur.observe(n));
}

/**
 * Un squelette de chargement, aux dimensions du contenu à venir.
 *
 * Il n'apparaît qu'au-delà d'un délai : un squelette affiché puis remplacé en
 * cinquante millisecondes ne fait que clignoter, et donne l'impression d'un
 * site qui rame là où il est instantané.
 */
export const DELAI_SQUELETTE = 180;

export function squelette(lignes = 3) {
  return `<div class="squelette" aria-hidden="true">${
    Array.from({ length: lignes }, (_, i) =>
      `<span style="width:${[92, 74, 84, 66][i % 4]}%"></span>`).join('')}</div>`;
}
