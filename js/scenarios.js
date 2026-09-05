/**
 * Trois façons de dimensionner la même toiture.
 *
 * LE PROBLÈME QUE CE FICHIER RÉSOUT : une seule puissance proposée, c'est un
 * chiffre à croire. Trois, c'est un choix à faire — et le client qui choisit
 * comprend ce qu'il achète. Il voit ce que coûte le kilowatt de plus, et ce
 * qu'il rapporte vraiment.
 *
 * Les trois ne diffèrent que par un objectif de production, exprimé en part de
 * la consommation annuelle. Tout le reste — rendement du gisement, orientation,
 * autoconsommation, prix réel du kWh — vient du même calcul, pour que la
 * comparaison ait un sens.
 */
import { etudier, HYPOTHESES, PUISSANCE } from './etude.js';
import { productible } from './gisement.js';
import { formaterRond } from './prix.js';
import { facteurOrientation } from './orientation.js';

/**
 * Les trois visées, en part de la consommation annuelle couverte par la
 * production. Ces nombres sont le cœur du fichier : les changer change ce
 * qu'on vend.
 */
export const VISEES = {
  /**
   * Ne produire à peu près que ce que le foyer consomme pendant la journée.
   * Au-delà, chaque kilowattheure part sur le réseau et ne vaut plus que le
   * prix de rachat — la moitié. C'est le scénario au meilleur rapport, et le
   * plus court à rembourser.
   */
  economique: HYPOTHESES.autoconsommation,
  /** Couvrir l'année : ce qui est injecté l'été revient l'hiver. */
  recommande: 1,
  /**
   * Prendre de l'avance : une climatisation, une voiture électrique, un
   * enfant qui revient. Le surplus rapporte moins, mais le gain sur vingt-cinq
   * ans reste le plus élevé — à condition que le toit suive.
   */
  performance: 1.3,
};

/** Ce qu'on dit de chaque scénario, en une phrase. */
export const PROFILS = [
  {
    cle: 'economique',
    nom: 'Économique',
    promesse: 'Le meilleur rapport, le remboursement le plus rapide',
    detail: 'Presque tout ce que vous produisez, vous le consommez : rien '
      + 'ne part sur le réseau au prix de rachat. C’est l’investissement le '
      + 'plus léger, et celui qui se rembourse le plus vite.',
  },
  {
    cle: 'recommande',
    nom: 'Recommandé',
    promesse: 'Votre consommation annuelle couverte',
    detail: 'L’installation produit sur l’année ce que vous consommez. Le '
      + 'surplus de l’été compense les mois d’hiver. C’est l’équilibre que '
      + 'nous conseillons dans la plupart des foyers.',
  },
  {
    cle: 'performance',
    nom: 'Performance',
    promesse: 'De la marge pour demain, le gain le plus élevé',
    detail: 'Une installation dimensionnée au-delà de vos besoins actuels : '
      + 'climatisation, véhicule électrique, agrandissement. Le retour est '
      + 'plus long, le gain sur vingt-cinq ans est le plus important.',
  },
];

/**
 * La puissance qui atteint une visée donnée, une fois le toit pris en compte.
 * @returns {number|null} kWc au demi près, ou `null` si le calcul est impossible
 */
export function puissancePourVisee({
  consommationAnnuelle, gouvernorat, surfaceDisponible = 0,
  orientation = null, pente = null, visee = 1,
}) {
  const rendement = productible(gouvernorat);
  const kwh = Number(consommationAnnuelle);
  if (!rendement || !(kwh > 0) || !(visee > 0)) return null;

  const f = facteurOrientation(orientation, pente);
  const effectif = rendement * (f ? f.facteur : 1);

  let kwc = (kwh * visee) / effectif;
  const bride = surfaceDisponible > 0;
  if (bride) kwc = Math.min(kwc, surfaceDisponible / HYPOTHESES.surfaceParKwc);

  kwc = Math.min(PUISSANCE.max, Math.max(PUISSANCE.min, kwc));
  // Vers le bas dès que la toiture contraint : proposer une installation qui
  // n'entre pas sur le toit, c'est promettre ce qu'on ne pourra pas poser.
  const arrondi = bride
    ? Math.floor(kwc / PUISSANCE.pas) * PUISSANCE.pas
    : Math.round(kwc / PUISSANCE.pas) * PUISSANCE.pas;
  return Math.max(PUISSANCE.min, arrondi);
}

/**
 * Les trois scénarios, calculés sur les mêmes données.
 *
 * @returns {Array<object>} les scénarios distincts, du plus léger au plus
 *   ambitieux, chacun portant son étude complète. Vide si le calcul échoue.
 *
 * Quand une petite toiture ramène deux scénarios à la même puissance, un seul
 * est renvoyé : afficher deux fois la même installation sous deux noms
 * différents ferait douter de tout le reste.
 */
export function comparer(donnees) {
  const sorties = [];
  for (const profil of PROFILS) {
    const puissance = puissancePourVisee({ ...donnees, visee: VISEES[profil.cle] });
    if (!puissance) continue;
    const etude = etudier({ ...donnees, puissance });
    if (!etude) continue;
    // Même puissance qu'un scénario déjà retenu : c'est la même installation.
    if (sorties.some((s) => s.puissance === puissance)) continue;
    sorties.push({ ...profil, puissance, etude });
  }
  return sorties;
}

/**
 * Le scénario à mettre en avant parmi ceux qui restent.
 *
 * « Recommandé » quand il a survécu au dédoublonnage ; sinon le plus proche,
 * pour qu'un toit contraint ne laisse jamais la page sans choix par défaut.
 */
export function scenarioParDefaut(scenarios) {
  if (!scenarios?.length) return null;
  return scenarios.find((s) => s.cle === 'recommande') ?? scenarios[scenarios.length - 1];
}

/**
 * De combien un scénario dépasse un autre, en clair.
 * @returns {string|null} « +2 kWc, +3 000 DT, +410 DT d'économie par an »
 */
export function ecart(depuis, vers) {
  if (!depuis || !vers) return null;
  const dp = vers.puissance - depuis.puissance;
  if (!dp) return null;
  const signe = (n) => (n > 0 ? '+' : '−');
  const dc = vers.etude.cout - depuis.etude.cout;
  const de = vers.etude.economieAnnuelle - depuis.etude.economieAnnuelle;
  // Les montants se lisent comme partout ailleurs sur la page : un « 4500 »
  // brut au milieu de « 4 500 DT » ferait tache et douter du reste.
  return `${signe(dp)}${String(Math.abs(dp)).replace('.', ',')} kWc, `
    + `${signe(dc)}${formaterRond(Math.abs(dc))} à l’achat, `
    + `${signe(de)}${formaterRond(Math.abs(de))} d’économie par an`;
}
