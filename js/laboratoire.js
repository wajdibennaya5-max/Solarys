/**
 * SIMULATION LAB — comparer des projets entiers, pas seulement des tailles.
 *
 * Les trois scénarios de l'étude comparent trois PUISSANCES sur le même toit.
 * Le laboratoire compare des PROJETS : un autre module, un autre jeu
 * financier, une autre orientation, un autre bâtiment. C'est l'outil du
 * professionnel qui prépare une visite, et du client qui hésite entre deux
 * pans de toiture.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ « MEILLEUR POUR… » N'EST DÉCERNÉ QUE SI LE CRITÈRE EST CALCULABLE     │
 * │ POUR TOUTES LES VARIANTES. Comparer un projet dont on connaît le      │
 * │ retour avec un projet dont on ne le connaît pas ne désigne pas un     │
 * │ vainqueur : cela cache une donnée manquante derrière une médaille.    │
 * └──────────────────────────────────────────────────────────────────────┘
 */
import { simuler } from './moteur.js';
import { flux, STANDARD, jeu } from './finances.js';

/** Le nombre de variantes qu'on peut tenir à l'écran sans les confondre. */
export const MAX_VARIANTES = 4;

/**
 * Les distinctions décernées, avec leur critère exact et ce qu'elles exigent.
 *
 * `exige` nomme les grandeurs qui doivent exister sur TOUTES les variantes
 * pour que la distinction ait un sens.
 */
export const DISTINCTIONS = [
  {
    id: 'economie',
    titre: 'Meilleur pour l’économie',
    critere: 'temps de retour actualisé le plus court',
    exige: ['retourActualise'],
    meilleur: (a, b) => a.retourActualise - b.retourActualise,
  },
  {
    id: 'equilibre',
    titre: 'Meilleur pour l’équilibre',
    critere: 'couverture annuelle la plus proche de 100 %',
    exige: ['couverture'],
    meilleur: (a, b) => Math.abs(a.couverture - 1) - Math.abs(b.couverture - 1),
  },
  {
    id: 'production',
    titre: 'Meilleur pour la production',
    critere: 'production annuelle la plus élevée',
    exige: ['production'],
    meilleur: (a, b) => b.production - a.production,
  },
  {
    id: 'gain',
    titre: 'Meilleur gain sur la durée',
    critere: 'valeur actuelle nette la plus élevée',
    exige: ['van'],
    meilleur: (a, b) => b.van - a.van,
  },
];

/** Les colonnes du comparatif, dans l'ordre où elles se lisent. */
export const COLONNES = [
  { cle: 'puissance', nom: 'Puissance', unite: 'kWc', decimales: 2 },
  { cle: 'modules', nom: 'Modules', unite: '' },
  { cle: 'production', nom: 'Production', unite: 'kWh/an' },
  { cle: 'couverture', nom: 'Couverture', unite: '%', pourcent: true },
  { cle: 'cout', nom: 'Coût estimé', unite: 'DT' },
  { cle: 'economieAnnuelle', nom: 'Économie an 1', unite: 'DT/an' },
  { cle: 'retour', nom: 'Retour simple', unite: 'ans', decimales: 1 },
  { cle: 'retourActualise', nom: 'Retour actualisé', unite: 'ans', decimales: 1 },
  { cle: 'van', nom: 'Valeur actuelle nette', unite: 'DT' },
  { cle: 'lcoe', nom: 'Coût du kWh produit', unite: 'DT/kWh', decimales: 3 },
  { cle: 'confiance', nom: 'Confiance des données', unite: '/100' },
  { cle: 'niveau', nom: 'Niveau d’étude', unite: '', texte: true },
];

/**
 * Évalue une variante : des entrées modifiées, tout le reste identique.
 *
 * @param {object} base les entrées de référence
 * @param {object} variante `{ nom, changements, puissance, jeuFinancier }`
 * @returns {object|null}
 */
export function evaluerVariante(base, variante) {
  if (!base || !variante) return null;
  const entrees = { ...base, ...(variante.changements ?? {}) };
  const sim = simuler(entrees, { puissance: variante.puissance ?? null });
  if (sim.statut !== 'ok') {
    return {
      id: variante.id, nom: variante.nom, sim,
      calculable: false,
      erreurs: sim.erreurs.map((e) => e.message),
      changements: variante.changements ?? {},
    };
  }
  const e = sim.resultats;
  const parametres = jeu(variante.jeuFinancier ?? 'standard').parametres;
  const f = flux({ puissance: e.puissance, autoconsomme: e.autoconsomme,
    surplus: e.surplus, prixKwh: e.prixKwh }, parametres);

  return {
    id: variante.id,
    nom: variante.nom,
    calculable: true,
    changements: variante.changements ?? {},
    jeuFinancier: variante.jeuFinancier ?? 'standard',
    sim,
    valeurs: {
      puissance: e.puissance,
      modules: e.modules,
      production: e.production,
      couverture: e.ratio,
      cout: e.cout,
      economieAnnuelle: e.economieAnnuelle,
      retour: f?.retour ?? null,
      retourActualise: f?.retourActualise ?? null,
      van: f?.van ?? null,
      lcoe: f?.lcoe ?? null,
      confiance: sim.confiance?.note ?? null,
      niveau: sim.niveau?.niveau?.nom ?? '—',
    },
  };
}

/**
 * Compare plusieurs variantes et décerne les distinctions calculables.
 *
 * @returns {{variantes, distinctions, nonDecernees, colonnes}}
 */
export function comparer(base, variantes = []) {
  const evaluees = variantes.slice(0, MAX_VARIANTES)
    .map((v) => evaluerVariante(base, v)).filter(Boolean);
  const calculables = evaluees.filter((v) => v.calculable);

  const distinctions = [];
  const nonDecernees = [];

  for (const d of DISTINCTIONS) {
    if (calculables.length < 2) {
      nonDecernees.push({ ...d, raison: 'Il faut au moins deux variantes calculables.' });
      continue;
    }
    const manquantes = calculables.filter((v) =>
      d.exige.some((cle) => v.valeurs[cle] === null || v.valeurs[cle] === undefined));
    if (manquantes.length) {
      // On ne décerne pas une médaille en cachant une donnée manquante.
      nonDecernees.push({
        ...d,
        raison: `${d.exige.join(', ')} n’est pas calculable pour : `
          + `${manquantes.map((v) => v.nom).join(', ')}.`,
      });
      continue;
    }
    const gagnante = [...calculables].sort((a, b) => d.meilleur(a.valeurs, b.valeurs))[0];
    // Une distinction qui ne départage rien n'en est pas une.
    const exaequo = calculables.filter((v) =>
      Math.abs(d.meilleur(v.valeurs, gagnante.valeurs)) < 1e-9);
    distinctions.push({
      ...d,
      variante: gagnante.id,
      nom: gagnante.nom,
      exaequo: exaequo.length > 1 ? exaequo.map((v) => v.nom) : null,
    });
  }

  return { variantes: evaluees, distinctions, nonDecernees, colonnes: COLONNES };
}

/**
 * Les variantes proposées d'office, à partir du projet ouvert.
 *
 * Elles ne sont pas décoratives : chacune répond à une question qu'un client
 * pose vraiment. « Et si je prends plus petit ? » « Et si l'électricité
 * n'augmente pas ? » « Et avec l'autre module ? »
 */
export function variantesProposees(base, { puissanceCourante = null } = {}) {
  const out = [{
    id: 'reference', nom: 'Projet actuel', changements: {},
    puissance: puissanceCourante, jeuFinancier: 'standard',
  }];

  if (puissanceCourante > 1.5) {
    out.push({
      id: 'plus-petit', nom: 'Plus petit',
      changements: {}, puissance: Math.round((puissanceCourante * 0.7) * 2) / 2,
      jeuFinancier: 'standard',
    });
  }
  out.push({
    id: 'plus-grand', nom: 'Plus grand',
    changements: {}, puissance: puissanceCourante
      ? Math.round((puissanceCourante * 1.4) * 2) / 2 : null,
    jeuFinancier: 'standard',
  });
  out.push({
    id: 'prudent', nom: 'Hypothèses prudentes',
    changements: {}, puissance: puissanceCourante, jeuFinancier: 'conservateur',
  });
  return out.slice(0, MAX_VARIANTES);
}

/** Ce qui distingue une variante de la référence, en clair. */
export function ecartsDeVariante(variante, reference) {
  if (!variante?.calculable || !reference?.calculable) return [];
  const out = [];
  for (const c of COLONNES) {
    if (c.texte) continue;
    const a = reference.valeurs[c.cle];
    const b = variante.valeurs[c.cle];
    if (a === null || b === null || a === undefined || b === undefined) continue;
    if (Math.abs(a - b) < 1e-9) continue;
    out.push({ cle: c.cle, nom: c.nom, de: a, a: b, hausse: b > a });
  }
  return out;
}
