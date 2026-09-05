/**
 * Le tarif STEG, uniquement là où on ne peut pas faire autrement.
 *
 * LE PRINCIPE QUI GOUVERNE TOUT LE RESTE DU CALCUL : on ne devine pas le prix
 * du kilowattheure, on le lit sur la facture du client. Ce fichier est
 * l'exception, et il ne sert qu'aux clients qui n'ont pas leur facture sous
 * les yeux : celui qui sait seulement ce qu'il paie, et celui qui n'a aucune
 * facture parce que la maison n'est pas encore branchée.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ GRILLE À CONFIRMER. Les tranches ci-dessous reproduisent la structure │
 * │ du tarif basse tension domestique, mais leurs valeurs n'ont pas été   │
 * │ relues sur une grille officielle en vigueur. Tant que `verifiee`      │
 * │ vaut `false`, toute étude qui en dépend doit se présenter comme une   │
 * │ estimation, et jamais au même rang qu'une étude bâtie sur une         │
 * │ facture réelle.                                                       │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Une seule chose à modifier le jour où la grille est confirmée : ce tableau.
 */

export const GRILLE = {
  /** Passez à `true` seulement après relecture sur une facture STEG réelle. */
  verifiee: false,
  intitule: 'Basse tension — usage domestique',
  /**
   * Prix appliqué PAR TRANCHE : chaque kilowattheure est facturé au prix de
   * la tranche où il tombe, et non la totalité au prix de la dernière
   * atteinte. Les seuils sont mensuels ; une facture bimestrielle les double.
   */
  tranches: [
    { jusqua: 50, prix: 0.150 },
    { jusqua: 100, prix: 0.180 },
    { jusqua: 200, prix: 0.223 },
    { jusqua: 300, prix: 0.291 },
    { jusqua: 500, prix: 0.351 },
    { jusqua: Infinity, prix: 0.416 },
  ],
  /** Redevances et taxes forfaitaires, en dinars par mois. */
  fraisFixes: 1.5,
};

/**
 * Ce que coûte une consommation mensuelle, selon la grille.
 * @param {number} kwhParMois
 * @returns {number} dinars par mois, frais fixes compris
 */
export function montantDepuisConsommation(kwhParMois) {
  const kwh = Number(kwhParMois);
  if (!(kwh > 0)) return 0;
  let reste = kwh;
  let bas = 0;
  let total = 0;
  for (const t of GRILLE.tranches) {
    const largeur = t.jusqua - bas;
    const part = Math.min(reste, largeur);
    total += part * t.prix;
    reste -= part;
    bas = t.jusqua;
    if (reste <= 0) break;
  }
  return total + GRILLE.fraisFixes;
}

/**
 * L'opération inverse : ce qu'on consomme quand on sait ce qu'on paie.
 *
 * C'est ce que fait le client qui dit « je paie 200 dinars tous les deux
 * mois » sans savoir combien de kilowattheures cela représente. Le tarif
 * étant croissant par tranche, l'inversion est exacte — pas approchée.
 *
 * @param {number} dtParMois dinars par mois, frais fixes compris
 * @returns {number|null} kWh par mois, ou `null` si le montant ne couvre même
 *   pas les frais fixes : il n'y a alors aucune consommation à en déduire.
 */
export function consommationDepuisMontant(dtParMois) {
  const dt = Number(dtParMois) - GRILLE.fraisFixes;
  if (!(dt > 0)) return null;
  let reste = dt;
  let bas = 0;
  let kwh = 0;
  for (const t of GRILLE.tranches) {
    const largeur = t.jusqua - bas;
    const coutDeLaTranche = largeur * t.prix;
    if (reste <= coutDeLaTranche) return Math.round(kwh + reste / t.prix);
    reste -= coutDeLaTranche;
    kwh += largeur;
    bas = t.jusqua;
  }
  return Math.round(kwh);
}

/**
 * Prix moyen du kilowattheure à ce niveau de consommation.
 *
 * C'est le nombre à montrer au client quand l'étude ne repose pas sur sa
 * facture : il le reconnaît ou il le corrige, et l'hypothèse cachée devient
 * une affirmation vérifiable.
 *
 * @returns {number|null} dinars par kWh
 */
export function prixMoyen(kwhParMois) {
  const kwh = Number(kwhParMois);
  if (!(kwh > 0)) return null;
  return montantDepuisConsommation(kwh) / kwh;
}
