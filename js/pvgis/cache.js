/**
 * LE CACHE — appeler une fois, pas dix.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ CE QUI DÉCLENCHE UN NOUVEL APPEL, CE N'EST PAS LE TEMPS QUI PASSE :   │
 * │ c'est un paramètre qui change. Le rayonnement d'un lieu ne bouge pas  │
 * │ d'un jour à l'autre. La clé est donc construite sur EXACTEMENT les    │
 * │ paramètres envoyés au service : changer l'inclinaison, l'azimut ou la │
 * │ puissance produit une clé différente et donc un appel ; changer son   │
 * │ nom ou son numéro de téléphone n'en produit aucun.                    │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Le stockage est celui du visiteur. S'il le refuse — navigation privée —,
 * le cache retombe silencieusement en mémoire : plus lent au rechargement,
 * jamais bloquant.
 */
import { CACHE } from './config.js';

/** Repli en mémoire quand le stockage du navigateur est refusé. */
const memoire = new Map();

function magasin() {
  try {
    const t = globalThis.localStorage;
    if (!t) return null;
    t.setItem(`${CACHE.espace}.essai`, '1');
    t.removeItem(`${CACHE.espace}.essai`);
    return t;
  } catch {
    return null;
  }
}

/**
 * La clé d'une requête : le calcul, plus ses paramètres triés.
 *
 * Les coordonnées sont arrondies au cinquième de décimale — environ cent
 * mètres. En deçà, le rayonnement est identique, et garder plus de chiffres
 * ferait manquer le cache à chaque micro-déplacement du marqueur.
 */
export function cle(idCalcul, parametres = {}) {
  const propres = {};
  for (const k of Object.keys(parametres).sort()) {
    const v = parametres[k];
    propres[k] = (k === 'lat' || k === 'lon') && Number.isFinite(Number(v))
      ? Math.round(Number(v) * 200) / 200
      : v;
  }
  return `${CACHE.espace}:${idCalcul}:${JSON.stringify(propres)}`;
}

/** Lit une entrée valide, ou `null`. */
export function lire(k) {
  const enMemoire = memoire.get(k);
  if (enMemoire && Date.now() - enMemoire.a <= CACHE.duree) return enMemoire.v;

  const t = magasin();
  if (!t) return null;
  try {
    const brut = t.getItem(k);
    if (!brut) return null;
    const { a, v } = JSON.parse(brut);
    if (!a || Date.now() - a > CACHE.duree) { t.removeItem(k); return null; }
    memoire.set(k, { a, v });
    return v;
  } catch {
    return null;
  }
}

/** Range une entrée. Ne lève jamais : un cache plein n'est pas une panne. */
export function ecrire(k, v) {
  memoire.set(k, { a: Date.now(), v });
  const t = magasin();
  if (!t) return false;
  try {
    t.setItem(k, JSON.stringify({ a: Date.now(), v }));
    elaguer(t);
    return true;
  } catch {
    // Quota dépassé : on purge et on retente une fois, puis on abandonne
    // sans bruit. Le résultat reste en mémoire pour cette visite.
    try {
      vider();
      t.setItem(k, JSON.stringify({ a: Date.now(), v }));
      return true;
    } catch {
      return false;
    }
  }
}

/** Ne garde que les entrées les plus récentes. */
function elaguer(t) {
  const nos = [];
  for (let i = 0; i < t.length; i++) {
    const k = t.key(i);
    if (k?.startsWith(`${CACHE.espace}:`)) {
      try { nos.push([k, JSON.parse(t.getItem(k)).a ?? 0]); } catch { nos.push([k, 0]); }
    }
  }
  if (nos.length <= CACHE.capacite) return;
  nos.sort((a, b) => a[1] - b[1]);
  for (const [k] of nos.slice(0, nos.length - CACHE.capacite)) t.removeItem(k);
}

/** Oublie tout ce que ce cache contient — et rien d'autre. */
export function vider() {
  memoire.clear();
  const t = magasin();
  if (!t) return;
  const aRetirer = [];
  for (let i = 0; i < t.length; i++) {
    const k = t.key(i);
    if (k?.startsWith(`${CACHE.espace}:`)) aRetirer.push(k);
  }
  for (const k of aRetirer) t.removeItem(k);
}

/** Combien d'entrées sont en cache, pour l'afficher au diagnostic. */
export function compte() {
  const t = magasin();
  if (!t) return memoire.size;
  let n = 0;
  for (let i = 0; i < t.length; i++) {
    if (t.key(i)?.startsWith(`${CACHE.espace}:`)) n += 1;
  }
  return n;
}

/**
 * Les paramètres dont un changement doit invalider le cache.
 *
 * Ils sont ceux de la requête, et rien d'autre : c'est la définition même
 * d'une clé de cache correcte. Cette liste sert à l'expliquer à l'écran.
 */
export const PARAMETRES_SENSIBLES = ['lat', 'lon', 'peakpower', 'angle', 'aspect',
  'loss', 'pvtechchoice', 'mountingplace', 'trackingtype', 'usehorizon',
  'batterysize', 'consumptionday', 'cutoff', 'month'];
