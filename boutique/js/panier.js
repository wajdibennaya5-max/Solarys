/**
 * Le panier.
 *
 * Il vit dans le navigateur de l'acheteur et nulle part ailleurs : pas de
 * compte à créer, pas de serveur à interroger. Quelqu'un qui remplit son
 * panier le soir le retrouve intact le lendemain, sans s'être identifié.
 *
 * Tous les montants circulent en millimes entiers. Voir `prix.js` : compter
 * en dinars flottants finit par un total faux d'un millime, et un total faux
 * est un client qui ne revient pas.
 */
import { enMillimes } from './prix.js';

const ESPACE = 'boutique.panier';

/** Une ligne de panier : une référence, une quantité, et la variante choisie. */
const ligneVide = () => ({ ref: '', qte: 0, variante: null });

/** Deux lignes désignent-elles le même article ? La variante compte. */
const memeLigne = (a, b) => a.ref === b.ref && (a.variante ?? null) === (b.variante ?? null);

/** Lit le panier rangé dans le navigateur. Toujours un tableau. */
export function lire() {
  try {
    const brut = JSON.parse(globalThis.localStorage?.getItem(ESPACE) ?? '[]');
    if (!Array.isArray(brut)) return [];
    // On ne fait pas confiance à ce qu'on relit : un stockage peut avoir été
    // modifié à la main, ou écrit par une version antérieure.
    return brut
      .map((l) => ({ ...ligneVide(), ...l, qte: Math.max(0, Math.trunc(Number(l?.qte) || 0)) }))
      .filter((l) => l.ref && l.qte > 0);
  } catch {
    return []; // navigation privée, stockage refusé, JSON abîmé
  }
}

/** Range le panier. Renvoie `false` si le navigateur l'a refusé. */
export function ecrire(lignes) {
  try {
    globalThis.localStorage?.setItem(ESPACE, JSON.stringify(lignes));
    return true;
  } catch {
    return false;
  }
}

/**
 * Ajoute une quantité à une ligne, ou la crée.
 * Renvoie le panier modifié — la fonction ne range rien elle-même, pour
 * rester éprouvable sans navigateur.
 */
export function ajouter(lignes, { ref, qte = 1, variante = null }) {
  const n = Math.trunc(Number(qte) || 0);
  if (!ref || n <= 0) return lignes;
  const cible = { ref, variante };
  const existe = lignes.find((l) => memeLigne(l, cible));
  if (existe) {
    return lignes.map((l) => (memeLigne(l, cible) ? { ...l, qte: l.qte + n } : l));
  }
  return [...lignes, { ref, qte: n, variante }];
}

/** Fixe la quantité d'une ligne. Zéro ou moins la retire. */
export function fixerQuantite(lignes, { ref, variante = null }, qte) {
  const n = Math.trunc(Number(qte) || 0);
  const cible = { ref, variante };
  if (n <= 0) return lignes.filter((l) => !memeLigne(l, cible));
  return lignes.map((l) => (memeLigne(l, cible) ? { ...l, qte: n } : l));
}

/** Retire une ligne entière. */
export const retirer = (lignes, cible) => fixerQuantite(lignes, cible, 0);

/** Vide le panier. */
export const vider = () => [];

/** Nombre d'articles, toutes lignes confondues. */
export const nombreArticles = (lignes) =>
  lignes.reduce((n, l) => n + l.qte, 0);

/**
 * Détaille le panier à partir du catalogue : prix, sous-totaux, indisponibles.
 *
 * Une référence absente du catalogue n'est pas ignorée en silence — elle est
 * signalée. Un article retiré de la vente pendant que le panier dormait doit
 * être dit à l'acheteur, pas escamoté de son total.
 *
 * @param {Array} lignes
 * @param {(ref:string)=>object|null} trouver accès au catalogue
 */
export function detailler(lignes, trouver) {
  const articles = [];
  const introuvables = [];
  let sousTotal = 0;

  for (const l of lignes) {
    const p = trouver(l.ref);
    if (!p) { introuvables.push(l); continue; }
    const unitaire = enMillimes(p.prix);
    const total = unitaire * l.qte;
    sousTotal += total;
    articles.push({ ...l, produit: p, unitaire, total });
  }

  return { articles, introuvables, sousTotal };
}
