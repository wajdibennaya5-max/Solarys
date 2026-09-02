/**
 * Préférences de l'utilisateur, et leur persistance.
 *
 * Isolé du reste du modèle à dessein : la page d'arrivée après paiement doit
 * pouvoir déposer une clé de licence sans charger tout le moteur de calcul.
 * Ce module ne dépend de rien.
 *
 * Le nom de l'espace de stockage n'existe qu'ici. Toute autre partie du site
 * qui lit ou écrit les préférences passe par `loadPrefs` / `savePrefs`, pour
 * qu'une clé recopiée à la main ne puisse jamais diverger.
 */

const PREFS_KEY = 'solarys.prefs.v1';

/** L'état d'un visiteur qui n'a encore rien réglé. */
export const defaultPrefs = () => ({
  lang: 'fr',
  theme: 'dark',
  lastProjectId: null,
  licence: null,
  // Projets pour lesquels un crédit a été dépensé, formule à l'unité.
  unlockedProjects: [],
});

/**
 * Lit les préférences. Un stockage refusé (navigation privée, réglage du
 * navigateur) n'est pas une erreur : on repart des valeurs par défaut.
 */
export function loadPrefs() {
  try {
    return { ...defaultPrefs(), ...(JSON.parse(localStorage.getItem(PREFS_KEY)) ?? {}) };
  } catch {
    return defaultPrefs();
  }
}

/** Écrit les préférences. Renvoie `false` si le stockage les a refusées. */
export function savePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}

/**
 * Dépose une clé de licence dans les préférences.
 * @returns {boolean} vrai si la clé a bien été conservée.
 */
export function storeLicence(key) {
  const prefs = loadPrefs();
  prefs.licence = key;
  return savePrefs(prefs);
}
