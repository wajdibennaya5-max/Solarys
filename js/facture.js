/**
 * Lire une facture STEG, sans rien savoir.
 *
 * LE DÉFAUT QUE CE FICHIER CORRIGE : on demandait la consommation ANNUELLE et
 * le montant ANNUEL. Personne ne les connaît. Un client a sa dernière facture
 * sous les yeux, et rien d'autre — alors on lui demande ce qui y est écrit,
 * et on fait le reste.
 *
 * Les factures STEG sont bimestrielles : six par an. Deux nombres suffisent
 * donc, tous deux imprimés au même endroit sur toutes les factures.
 */

/** Nombre de factures dans l'année, selon la périodicité du contrat. */
export const PERIODES = [
  { id: 'bimestrielle', nom: 'Tous les 2 mois', parAn: 6, defaut: true },
  { id: 'mensuelle', nom: 'Tous les mois', parAn: 12, defaut: false },
  { id: 'trimestrielle', nom: 'Tous les 3 mois', parAn: 4, defaut: false },
];

export const periode = (id) => PERIODES.find((p) => p.id === id) ?? null;

/**
 * Où trouver chaque nombre sur la facture, pour le dire à l'écran.
 * Les libellés sont ceux imprimés par la STEG, en français comme sur le
 * document : le client cherche ce qu'il voit, pas ce qu'on aurait préféré.
 */
export const REPERES = {
  quantite: {
    libelle: 'Quantité',
    colonne: 'Colonne « Quantité (1) », ligne Électricité',
    exemple: 590,
    aide: 'Dans le tableau « Consommation & Services », c’est le nombre de kWh '
      + 'consommés sur la période. Ne prenez pas les index du compteur.',
  },
  montant: {
    libelle: 'Total Électricité',
    colonne: 'Case « Total Electricité »',
    exemple: 132.820,
    aide: 'La case encadrée juste sous le tableau. Pas le « Montant à payer », '
      + 'qui peut contenir des arriérés d’anciennes factures — et fausserait '
      + 'toute l’étude.',
  },
};

/**
 * Bornes de vraisemblance, par facture.
 *
 * Elles sont calées sur la réalité tunisienne, non choisies au hasard : le
 * tarif domestique STEG va d'environ 0,14 à 0,45 dinar le kilowattheure selon
 * la tranche. Frais fixes compris, une facture domestique tombe entre 0,08 et
 * 0,60. Hors de cette fourchette, ce n'est pas un cas rare — c'est une erreur
 * de saisie, et il vaut mieux la nommer que la laisser fausser l'étude.
 */
export const BORNES = {
  quantite: { min: 10, max: 6000 },
  montant: { min: 3, max: 4000 },
  prixKwh: { min: 0.08, max: 0.60 },
};

/**
 * Convertit une facture en chiffres annuels.
 *
 * @param {object} facture
 * @param {number} facture.quantite kWh de la facture
 * @param {number} facture.montant dinars de la facture
 * @param {string} facture.periode identifiant de périodicité
 * @returns {{consommationAnnuelle:number, montantAnnuel:number, prixKwh:number,
 *   parAn:number}|null}
 */
export function versAnnuel({ quantite, montant, periode: idPeriode = 'bimestrielle' }) {
  const p = periode(idPeriode);
  const q = Number(quantite);
  const m = Number(montant);
  if (!p || !(q > 0) || !(m > 0)) return null;
  return {
    consommationAnnuelle: Math.round(q * p.parAn),
    montantAnnuel: Math.round(m * p.parAn * 1000) / 1000,
    prixKwh: m / q,
    parAn: p.parAn,
  };
}

/**
 * Ce qui cloche dans une saisie, dit en clair.
 *
 * On ne se contente pas de bornes : on reconnaît les deux erreurs que les gens
 * font vraiment, et on les nomme. « Valeur invalide » ne dit pas quoi corriger.
 *
 * @returns {string|null} `null` si la saisie tient debout
 */
export function verifier({ quantite, montant, periode: idPeriode = 'bimestrielle' }) {
  const q = Number(quantite);
  const m = Number(montant);

  if (!(q > 0)) return 'Indiquez la quantité en kWh, colonne « Quantité » de votre facture.';
  if (!(m > 0)) return 'Indiquez le montant, case « Total Electricité » de votre facture.';

  // L'index du compteur est imprimé juste à côté de la quantité, et il compte
  // cinq chiffres là où la consommation en compte trois. C'est la confusion la
  // plus fréquente, et la plus lourde : elle diviserait l'étude par trente.
  if (q > BORNES.quantite.max) {
    return 'Ce nombre paraît être un index de compteur, non une consommation. '
      + 'Prenez la colonne « Quantité (1) », pas les colonnes « Index ».';
  }
  if (q < BORNES.quantite.min) {
    return 'Cette consommation paraît trop faible pour une facture entière.';
  }
  if (m > BORNES.montant.max) {
    return 'Ce montant dépasse ce qu’une facture domestique atteint. Avez-vous '
      + 'saisi le « Montant à payer », qui peut contenir des arriérés ?';
  }
  if (m < BORNES.montant.min) return 'Ce montant paraît trop faible pour une facture.';

  // Le prix du kilowattheure trahit une confusion entre deux cases mieux que
  // n'importe quelle borne prise séparément : il croise les deux nombres.
  const prix = m / q;
  if (prix > BORNES.prixKwh.max) {
    return `Le prix obtenu, ${prix.toFixed(2).replace('.', ',')} DT le kWh, dépasse `
      + 'largement le tarif STEG. Avez-vous saisi le « Montant à payer » plutôt '
      + 'que le « Total Electricité » ? Le premier peut contenir des arriérés '
      + 'd’anciennes factures.';
  }
  if (prix < BORNES.prixKwh.min) {
    return `Le prix obtenu, ${prix.toFixed(3).replace('.', ',')} DT le kWh, est bien `
      + 'en dessous du tarif STEG. Vérifiez la quantité — l’index du compteur '
      + 'se confond facilement avec la consommation.';
  }
  return null;
}
