/**
 * L'étude photovoltaïque, calculée depuis une facture STEG.
 *
 * LE PARTI PRIS QUI REND CETTE ÉTUDE HONNÊTE : on ne devine pas le tarif de
 * l'électricité. Les tranches STEG changent, elles diffèrent selon le contrat,
 * et un tarif supposé fausserait toute l'économie du projet. On demande donc
 * au client ce qu'il a réellement payé et ce qu'il a réellement consommé —
 * c'est écrit sur sa facture — et on en déduit son prix du kilowattheure.
 *
 * Une étude bâtie sur ses chiffres à lui, il la reconnaît. Une étude bâtie sur
 * une moyenne nationale, il la conteste.
 */
import { productible } from './gisement.js';

/**
 * HYPOTHÈSES ÉCONOMIQUES — à vérifier avant toute mise en ligne, et à revoir
 * chaque année. Ce sont les seuls nombres du calcul qui ne viennent pas du
 * client, donc les seuls qui puissent vieillir mal.
 */
export const HYPOTHESES = {
  /** Coût installé, en dinars par kWc, pose et matériel compris. */
  coutParKwc: 3000,
  /** Part autoconsommée d'une installation résidentielle sans batterie. */
  autoconsommation: 0.65,
  /** Ce que vaut le surplus injecté, en part du prix d'achat (rachat STEG). */
  valeurSurplus: 0.5,
  /** Hausse annuelle du prix de l'électricité. */
  hausseElectricite: 0.06,
  /** Perte de rendement annuelle des modules. */
  degradation: 0.005,
  /** Durée retenue pour l'économie cumulée. */
  duree: 25,
  /** Surface au sol nécessaire par kWc, en m². */
  surfaceParKwc: 6,
};

/** Puissance minimale et maximale proposées, en kWc. */
export const PUISSANCE = { min: 1, max: 30, pas: 0.5 };

/**
 * Prix réel du kilowattheure, déduit de la facture.
 * @returns {number|null} dinars par kWh, ou `null` si les chiffres ne
 *   permettent aucune déduction.
 */
export function prixDuKwh({ consommationAnnuelle, montantAnnuel }) {
  const kwh = Number(consommationAnnuelle);
  const dt = Number(montantAnnuel);
  if (!(kwh > 0) || !(dt > 0)) return null;
  return dt / kwh;
}

/**
 * Puissance à installer pour couvrir la consommation.
 *
 * On ne vise pas la couverture totale : au-delà de ce que le foyer consomme
 * réellement dans la journée, chaque kWc supplémentaire ne rapporte plus que
 * le prix du surplus, bien inférieur. Le dimensionnement s'arrête donc là où
 * il cesse d'être rentable, et non là où il serait le plus gros.
 */
export function puissanceRecommandee({ consommationAnnuelle, gouvernorat, surfaceDisponible }) {
  const rendement = productible(gouvernorat);
  const kwh = Number(consommationAnnuelle);
  if (!rendement || !(kwh > 0)) return null;

  let kwc = kwh / rendement;

  // La toiture disponible peut brider le projet avant l'économie.
  if (surfaceDisponible > 0) {
    kwc = Math.min(kwc, surfaceDisponible / HYPOTHESES.surfaceParKwc);
  }

  kwc = Math.min(PUISSANCE.max, Math.max(PUISSANCE.min, kwc));
  // On arrondit au demi-kilowatt : un onduleur ne se vend pas au centième.
  return Math.round(kwc / PUISSANCE.pas) * PUISSANCE.pas;
}

/**
 * L'étude complète.
 *
 * @returns {object|null} `null` si les données ne permettent pas de conclure.
 *   Une étude incomplète ne s'affiche pas à moitié : elle ne s'affiche pas.
 */
export function etudier({
  consommationAnnuelle, montantAnnuel, gouvernorat, surfaceDisponible = 0,
  puissance = null, hypotheses = HYPOTHESES,
}) {
  const prixKwh = prixDuKwh({ consommationAnnuelle, montantAnnuel });
  const rendement = productible(gouvernorat);
  const kwc = puissance ?? puissanceRecommandee({
    consommationAnnuelle, gouvernorat, surfaceDisponible });
  if (!prixKwh || !rendement || !kwc) return null;

  const production = kwc * rendement;
  const consommation = Number(consommationAnnuelle);

  // Ce qui est consommé directement vaut le prix d'achat ; le reste est
  // injecté et ne vaut que le prix de rachat.
  const autoconsomme = Math.min(consommation, production * hypotheses.autoconsommation);
  const surplus = Math.max(0, production - autoconsomme);
  const economieAn1 = autoconsomme * prixKwh
    + surplus * prixKwh * hypotheses.valeurSurplus;

  const cout = kwc * hypotheses.coutParKwc;

  // Économie cumulée : l'électricité renchérit, les modules s'usent.
  let cumul = 0;
  let retour = null;
  const annees = [];
  for (let an = 1; an <= hypotheses.duree; an++) {
    const economie = economieAn1
      * (1 + hypotheses.hausseElectricite) ** (an - 1)
      * (1 - hypotheses.degradation) ** (an - 1);
    cumul += economie;
    annees.push({ an, economie, cumul });
    if (retour === null && cumul >= cout) {
      // Interpolation dans l'année : « 6,4 ans » se comprend mieux que « 7 ».
      const manquant = cout - (cumul - economie);
      retour = an - 1 + manquant / economie;
    }
  }

  return {
    puissance: kwc,
    production: Math.round(production),
    productible: rendement,
    prixKwh,
    consommation,
    couverture: Math.min(1, production / consommation),
    autoconsomme: Math.round(autoconsomme),
    surplus: Math.round(surplus),
    economieAnnuelle: economieAn1,
    economieMensuelle: economieAn1 / 12,
    cout,
    retour,
    economieTotale: cumul,
    gainNet: cumul - cout,
    surface: Math.ceil(kwc * hypotheses.surfaceParKwc),
    modules: Math.ceil(kwc / 0.55), // modules de 550 Wc, courants en Tunisie
    annees,
  };
}
