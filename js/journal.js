/**
 * OBSERVABILITÉ — savoir qu'une chose a cassé, sans exposer le client.
 *
 * CE QUE CE FICHIER PEUT ET NE PEUT PAS FAIRE. Le site est statique : il n'y
 * a pas de serveur pour recevoir des journaux, et il n'y en aura pas tant que
 * l'hébergement ne change pas. Ce fichier tient donc un journal LOCAL, dans
 * l'onglet du visiteur, et le rend consultable et copiable.
 *
 * C'est peu, et c'est déjà tout ce qui manquait : quand un client écrit « ça
 * ne marche pas », on n'avait rien à lui demander. On peut maintenant lui
 * demander un identifiant de session et le contenu du journal, et savoir quoi
 * chercher. Le jour où un serveur existe, `envoyer()` a déjà sa place.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ AUCUNE DONNÉE PERSONNELLE N'ENTRE ICI. Ni nom, ni téléphone, ni       │
 * │ courriel, ni adresse. Les valeurs enregistrées sont expurgées avant   │
 * │ d'être écrites, et un test le vérifie sur les champs du formulaire de │
 * │ contact. Un journal de diagnostic qui contient l'annuaire des clients │
 * │ est un incident de sécurité, pas un outil.                            │
 * └──────────────────────────────────────────────────────────────────────┘
 */

/** Combien d'entrées on garde. Au-delà, les plus anciennes tombent. */
export const CAPACITE = 60;

/** Les champs qui ne doivent jamais être journalisés, quoi qu'il arrive. */
export const INTERDITS = ['nom', 'prenom', 'telephone', 'tel', 'courriel', 'email',
  'mail', 'adresse', 'reference', 'motdepasse', 'password', 'token', 'cle', 'apikey'];

const NIVEAUX = ['debug', 'info', 'avertissement', 'erreur'];

/**
 * L'identifiant de corrélation de cette session.
 *
 * Il ne dit rien de la personne : c'est un nombre tiré au hasard à
 * l'ouverture de la page. Il sert uniquement à relier entre elles les lignes
 * d'un même incident quand un client nous les transmet.
 */
export const CORRELATION = (() => {
  try {
    const a = new Uint8Array(6);
    (globalThis.crypto ?? {}).getRandomValues?.(a);
    const hex = [...a].map((x) => x.toString(16).padStart(2, '0')).join('');
    return hex.length === 12 ? hex : Math.random().toString(16).slice(2, 14);
  } catch {
    return Math.random().toString(16).slice(2, 14);
  }
})();

const entrees = [];

/** Retire tout ce qui pourrait identifier quelqu'un. */
export function expurger(valeur, profondeur = 0) {
  if (valeur === null || valeur === undefined) return valeur;
  if (profondeur > 4) return '…';
  if (typeof valeur === 'number' || typeof valeur === 'boolean') return valeur;
  if (typeof valeur === 'string') {
    // Une chaîne longue peut contenir n'importe quoi : on la tronque et on
    // masque ce qui ressemble à un courriel ou à un numéro.
    return valeur.slice(0, 120)
      .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[courriel]')
      // Six chiffres au minimum entre le premier et le dernier : un numéro
      // tunisien en compte huit, et `{7,}` en exigeait neuf — il passait donc
      // entier dans le journal.
      .replace(/\+?\d[\d\s.-]{6,}\d/g, '[numéro]');
  }
  if (Array.isArray(valeur)) return valeur.slice(0, 20).map((v) => expurger(v, profondeur + 1));
  if (typeof valeur === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(valeur)) {
      const cle = k.toLowerCase();
      if (INTERDITS.some((mot) => cle.includes(mot))) { out[k] = '[expurgé]'; continue; }
      out[k] = expurger(v, profondeur + 1);
    }
    return out;
  }
  return String(valeur).slice(0, 120);
}

/**
 * Écrit une ligne au journal.
 * @returns {object} l'entrée écrite, pour pouvoir la citer
 */
export function noter(niveau, evenement, details = {}) {
  const entree = {
    horodatage: new Date().toISOString(),
    correlation: CORRELATION,
    niveau: NIVEAUX.includes(niveau) ? niveau : 'info',
    evenement: String(evenement).slice(0, 80),
    details: expurger(details),
  };
  entrees.push(entree);
  // On plafonne : un journal qui grossit sans fin finit par peser sur la page
  // qu'il est censé surveiller.
  while (entrees.length > CAPACITE) entrees.shift();
  return entree;
}

export const journal = () => entrees.slice();
export const vider = () => { entrees.length = 0; };

/** Combien d'entrées par niveau — le résumé qu'on regarde en premier. */
export function resume() {
  const c = { debug: 0, info: 0, avertissement: 0, erreur: 0 };
  for (const e of entrees) c[e.niveau] += 1;
  return { ...c, correlation: CORRELATION, total: entrees.length };
}

/** Le journal en texte, prêt à être copié dans un message. */
export function enTexte() {
  return [`Solarys — journal de diagnostic`, `Session ${CORRELATION}`, '']
    .concat(entrees.map((e) => `${e.horodatage} [${e.niveau}] ${e.evenement} `
      + `${JSON.stringify(e.details)}`))
    .join('\n');
}

/**
 * Exécute une fonction en journalisant ce qui casse — sans casser la page.
 *
 * C'EST LE POINT IMPORTANT : une erreur dans un panneau secondaire ne doit
 * pas emporter tout le tableau de bord. Auparavant, une exception dans un
 * seul rendu vidait l'écran ; le visiteur voyait une page blanche et
 * repartait sans rien dire.
 *
 * @param {string} ou le nom du bloc, pour retrouver la panne
 * @param {Function} faire
 * @param {*} [secours] ce qu'on rend si ça casse
 */
export function proteger(ou, faire, secours = null) {
  try {
    return faire();
  } catch (erreur) {
    noter('erreur', `échec: ${ou}`, {
      message: String(erreur?.message ?? erreur).slice(0, 200),
      pile: String(erreur?.stack ?? '').split('\n').slice(0, 3).join(' | ').slice(0, 300),
    });
    return secours;
  }
}

/** Ce qu'on montre au visiteur : simple, sans détail technique. */
export const MESSAGE_VISITEUR = 'Une partie de l’étude n’a pas pu s’afficher. '
  + 'Les chiffres principaux restent valables. Rechargez la page si le problème '
  + 'persiste.';

/**
 * Branche la surveillance globale des erreurs.
 *
 * Le visiteur ne voit jamais le détail technique : il voit une phrase claire,
 * et le détail reste dans le journal, accessible au diagnostic.
 */
export function surveiller(surErreur = null) {
  if (typeof globalThis.addEventListener !== 'function') return;
  globalThis.addEventListener('error', (ev) => {
    noter('erreur', 'erreur non rattrapée', {
      message: String(ev?.message ?? '').slice(0, 200),
      fichier: String(ev?.filename ?? '').split('/').pop(),
      ligne: ev?.lineno ?? null,
    });
    surErreur?.(MESSAGE_VISITEUR);
  });
  globalThis.addEventListener('unhandledrejection', (ev) => {
    noter('erreur', 'promesse rejetée', {
      message: String(ev?.reason?.message ?? ev?.reason ?? '').slice(0, 200),
    });
    surErreur?.(MESSAGE_VISITEUR);
  });
  noter('info', 'session ouverte', { agent: 'navigateur' });
}
