/**
 * LE SOLAR SCORE — une note, et de quoi la contester.
 *
 * Un score de 0 à 100 se retient là où six chiffres se perdent. Mais un score
 * qu'on ne peut pas ouvrir n'est qu'un argument de vente déguisé en mesure.
 * Ici, chaque facteur dit sa note, son poids et sa raison, et le total n'est
 * rien d'autre que leur moyenne pondérée.
 *
 * DEUX RÈGLES QUI PROTÈGENT L'HONNÊTETÉ DU CHIFFRE :
 *
 * 1. Un facteur dont la donnée manque n'est pas deviné : il sort du calcul,
 *    et le poids restant est renormalisé. Un toit dont on ignore
 *    l'orientation ne reçoit ni bonus ni malus — il reçoit un score moins
 *    sûr, et la page le dit.
 * 2. La confiance est rendue avec la note. En dessous du seuil, le score
 *    s'annonce « préliminaire » et non « établi ».
 */
import { productible } from './gisement.js';
import { facteurOrientation } from './orientation.js';
import { HYPOTHESES } from './etude.js';

/**
 * Bornes du gisement, en kWh/kWc/an, pour ramener le productible à une note.
 *
 * Elles sont volontairement plus larges que la Tunisie (1520 à 1760) : sur
 * une échelle mondiale, le pays est bien placé partout, et la note doit le
 * montrer plutôt que d'exagérer les écarts entre Bizerte et Tozeur.
 */
export const GISEMENT = { plancher: 1000, plafond: 1900 };

/** Le seuil en dessous duquel un score s'annonce comme préliminaire. */
export const CONFIANCE_SUFFISANTE = 0.7;

/** Ramène une valeur entre deux bornes à une note de 0 à 1. */
const borner = (v, min, max) => Math.max(0, Math.min(1, (v - min) / (max - min)));

/**
 * Les cinq facteurs, avec leur poids.
 *
 * Chacun rend `null` quand la donnée manque : c'est ce qui fait sortir le
 * facteur du calcul au lieu de lui inventer une valeur moyenne.
 */
export const FACTEURS = [
  {
    cle: 'gisement',
    nom: 'Potentiel solaire',
    poids: 20,
    note: ({ gouvernorat }) => {
      const p = productible(gouvernorat);
      if (!p) return null;
      return { valeur: borner(p, GISEMENT.plancher, GISEMENT.plafond),
        detail: `${p} kWh par kWc et par an` };
    },
  },
  {
    cle: 'orientation',
    nom: 'Orientation et inclinaison',
    poids: 25,
    note: ({ orientation, pente }) => {
      const f = facteurOrientation(orientation, pente);
      if (!f) return null;
      // Le plein nord vaut 0,53 : c'est le plancher réel, pas zéro. Étaler
      // la note de 0,5 à 1 évite de noter 53/100 un toit inexploitable.
      const perte = Math.round(f.perte * 100);
      return { valeur: borner(f.facteur, 0.5, 1),
        detail: perte <= 0 ? 'exposition optimale'
          : `${perte} % de moins qu’une exposition optimale` };
    },
  },
  {
    cle: 'surface',
    nom: 'Surface disponible',
    poids: 20,
    note: ({ surfaceDisponible, puissanceVisee }) => {
      if (!(surfaceDisponible > 0) || !(puissanceVisee > 0)) return null;
      const besoin = puissanceVisee * HYPOTHESES.surfaceParKwc;
      // Au-delà du nécessaire, la surface ne rapporte plus rien : la note
      // plafonne plutôt que de récompenser un hangar vide.
      return { valeur: borner(surfaceDisponible / besoin, 0.35, 1),
        detail: `${Math.round(surfaceDisponible)} m² pour ${Math.round(besoin)} m² utiles` };
    },
  },
  {
    cle: 'adequation',
    nom: 'Adéquation à votre consommation',
    poids: 20,
    note: ({ tauxAutoconsommation }) => {
      if (!(tauxAutoconsommation > 0)) return null;
      return { valeur: borner(tauxAutoconsommation, 0.4, 0.95),
        detail: `${Math.round(tauxAutoconsommation * 100)} % de la production consommée sur place` };
    },
  },
  {
    cle: 'rentabilite',
    nom: 'Rentabilité estimée',
    poids: 15,
    note: ({ retour }) => {
      if (!(retour > 0)) return null;
      // Cinq ans est excellent, quinze est le bord du raisonnable : au-delà
      // la note tombe à zéro sans passer sous zéro.
      return { valeur: borner(15 - retour, 0, 10),
        detail: `${retour.toFixed(1).replace('.', ',')} ans de retour` };
    },
  },
];

/** Ce que la note veut dire, en une phrase. */
export const PALIERS = [
  { min: 80, mot: 'Excellent', phrase: 'Excellent potentiel photovoltaïque.' },
  { min: 65, mot: 'Très bon', phrase: 'Très bon potentiel photovoltaïque.' },
  { min: 50, mot: 'Bon', phrase: 'Bon potentiel, avec quelques contraintes à optimiser.' },
  { min: 35, mot: 'Modéré', phrase: 'Potentiel modéré : certains paramètres pèsent sur le projet.' },
  { min: 0, mot: 'Limité', phrase: 'Potentiel limité en l’état. Une visite dirait ce qui peut être corrigé.' },
];

export const palier = (note) => PALIERS.find((p) => note >= p.min) ?? PALIERS.at(-1);

/**
 * Le Solar Score.
 *
 * @returns {{note:number, confiance:number, preliminaire:boolean,
 *   palier:object, facteurs:Array, manquants:Array}|null}
 *   `null` si rien n'est calculable : mieux vaut ne pas afficher de score
 *   qu'en afficher un qui ne repose sur rien.
 */
export function evaluer(donnees = {}) {
  const retenus = [];
  const manquants = [];
  let poidsTotal = 0;
  let poidsConnu = 0;

  for (const f of FACTEURS) {
    poidsTotal += f.poids;
    const n = f.note(donnees);
    if (!n || !Number.isFinite(n.valeur)) {
      manquants.push({ cle: f.cle, nom: f.nom, poids: f.poids });
      continue;
    }
    poidsConnu += f.poids;
    retenus.push({
      cle: f.cle, nom: f.nom, poids: f.poids,
      note: Math.round(n.valeur * 100), detail: n.detail,
    });
  }

  if (!poidsConnu) return null;

  const somme = retenus.reduce((s, f) => s + f.note * f.poids, 0);
  const note = Math.round(somme / poidsConnu);
  const confiance = poidsConnu / poidsTotal;

  return {
    note,
    confiance,
    preliminaire: confiance < CONFIANCE_SUFFISANTE,
    palier: palier(note),
    facteurs: retenus,
    manquants,
  };
}

/**
 * Ce qu'il manque pour affermir la note, dit au client comme une action.
 * @returns {string|null}
 */
export function pourAffermir(score) {
  if (!score?.manquants?.length) return null;
  const noms = score.manquants.map((m) => m.nom.toLowerCase());
  const liste = noms.length === 1 ? noms[0]
    : `${noms.slice(0, -1).join(', ')} et ${noms.at(-1)}`;
  return `Renseignez ${liste} pour un score établi plutôt que préliminaire.`;
}
