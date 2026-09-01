/**
 * Formules et droits d'usage.
 *
 * HONNÊTETÉ TECHNIQUE : cette application tourne entièrement dans le
 * navigateur. Une vérification de licence côté client est, par construction,
 * contournable — le code est lisible par quiconque ouvre les outils de
 * développement. Ce mécanisme n'est donc PAS une protection : c'est une
 * commodité, qui distingue un client d'un visiteur pour les gens honnêtes.
 *
 * Ce qui protège réellement un logiciel de ce type ne se trouve pas ici :
 * l'hébergement toujours à jour, les mises à jour, la bibliothèque de
 * composants enrichie et le support.
 *
 * Format de clé : SLRS-XXXX-XXXX-CCCC
 *   Les groupes 2 et 3 forment une charge utile de 8 caractères :
 *     [0]    lettre de formule — C crédits, P perpétuelle, A abonnement
 *     [1..2] nombre de dossiers pour la formule à l'unité (00 sinon)
 *     [3..7] identifiant du client
 *   Le dernier groupe est une somme de contrôle, qui évite les fautes de
 *   frappe à la saisie.
 */

const PREFIX = 'SLRS';
const ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // sans I ni O, confondus à la lecture

/**
 * Les formules, de la plus légère à la plus complète.
 * `unlimited` distingue celles qui ouvrent tous les dossiers de celle qui
 * s'achète au nombre d'études.
 */
export const PLANS = {
  C: { id: 'credits', unlimited: false },
  P: { id: 'perpetual', unlimited: true },
  A: { id: 'subscription', unlimited: true },
};

/** Empreinte FNV-1a d'une chaîne. */
function hash32(body) {
  let h = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) {
    h ^= body.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Traduit une empreinte en `n` caractères de l'alphabet lisible. */
function encode(h, n) {
  let out = '';
  for (let i = 0; i < n; i++) {
    out += ALPHABET[h % ALPHABET.length];
    h = Math.floor(h / ALPHABET.length) + (i + 1) * 7919;
  }
  return out;
}

/** Somme de contrôle déterministe des groupes utiles d'une clé. */
const checksum = (parts) => encode(hash32(parts.join('')), 4);

/** Normalise une saisie utilisateur : majuscules, tirets et espaces ignorés. */
export function normalise(key) {
  return String(key ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/** Met une clé en forme pour l'affichage. */
export const format = (key) => (normalise(key).match(/.{1,4}/g) ?? []).join('-');

/**
 * Lit une clé et renvoie les droits qu'elle porte.
 * @returns {{valid:boolean, plan:string|null, credits:number, id:string}}
 */
export function readKey(key) {
  const invalid = { valid: false, plan: null, credits: 0, id: '' };
  const raw = normalise(key);
  if (raw.length !== 16) return invalid;
  const groups = raw.match(/.{4}/g);
  if (!groups || groups[0] !== PREFIX) return invalid;
  if (checksum(groups.slice(0, 3)) !== groups[3]) return invalid;

  const payload = groups[1] + groups[2];
  const letter = payload[0];
  if (!PLANS[letter]) return invalid;

  const credits = PLANS[letter].unlimited ? Infinity : Number(payload.slice(1, 3));
  if (!PLANS[letter].unlimited && !(credits > 0)) return invalid;

  return { valid: true, plan: PLANS[letter].id, credits, id: payload.slice(3) };
}

/** Une clé est-elle bien formée ? */
export const isValidKey = (key) => readKey(key).valid;

/**
 * Fabrique une clé.
 * @param {string} customerId identifiant libre — commande, nom, courriel
 * @param {object} [opts]
 * @param {'credits'|'perpetual'|'subscription'} [opts.plan]
 * @param {number} [opts.credits] nombre de dossiers, formule à l'unité
 */
export function makeKey(customerId, { plan = 'perpetual', credits = 1 } = {}) {
  const letter = Object.keys(PLANS).find((k) => PLANS[k].id === plan);
  if (!letter) throw new Error(`formule inconnue : ${plan}`);
  const n = PLANS[letter].unlimited ? 0 : Math.min(99, Math.max(1, Math.round(credits)));
  // L'identifiant est une empreinte, non une troncature : deux commandes dont
  // les premiers caractères coïncident doivent donner deux clés distinctes.
  const id = encode(hash32(String(customerId)), 5);
  const payload = letter + String(n).padStart(2, '0') + id;
  const groups = [PREFIX, payload.slice(0, 4), payload.slice(4, 8)];
  return format(groups.join('') + checksum(groups));
}

/* ------------------------------------------------------------------ */
/* Droits effectifs                                                    */
/* ------------------------------------------------------------------ */

/** La licence ouvre-t-elle tous les dossiers, sans compter ? */
export function isUnlimited(prefs) {
  const k = readKey(prefs?.licence);
  return k.valid && k.credits === Infinity;
}

/** Crédits restants : total de la clé moins les dossiers déjà débloqués. */
export function remainingCredits(prefs) {
  const k = readKey(prefs?.licence);
  if (!k.valid || k.credits === Infinity) return k.valid ? Infinity : 0;
  return Math.max(0, k.credits - (prefs?.unlockedProjects?.length ?? 0));
}

/**
 * Ce projet donne-t-il des planches sans filigrane ?
 * Vrai si la licence est illimitée, ou si un crédit a déjà été dépensé pour lui.
 */
export function isProjectUnlocked(prefs, projectId) {
  if (isUnlimited(prefs)) return true;
  return !!projectId && (prefs?.unlockedProjects ?? []).includes(projectId);
}

/** Un crédit peut-il être dépensé pour ce projet ? */
export function canUnlock(prefs, projectId) {
  return !isProjectUnlocked(prefs, projectId) && remainingCredits(prefs) > 0;
}

/**
 * Dépense un crédit pour un projet. Renvoie les préférences modifiées, ou
 * `null` si l'opération n'est pas permise — au refus, rien n'est consommé.
 */
export function unlockProject(prefs, projectId) {
  if (!canUnlock(prefs, projectId)) return null;
  const list = prefs.unlockedProjects ?? [];
  return { ...prefs, unlockedProjects: [...list, projectId] };
}

/** Mention portée par les planches tant que le dossier n'est pas débloqué. */
export const WATERMARK = 'AVANT-PROJET';

/** Compatibilité : ancienne question binaire, encore utilisée par les vues. */
export const isPro = (prefs) => isUnlimited(prefs);
