/**
 * SOLAR ENGINE — le point de passage unique de toute simulation.
 *
 * POURQUOI CE FICHIER. Les calculs existaient déjà, corrects et testés, mais
 * dispersés : l'étude ici, les scénarios là, la validation électrique
 * ailleurs. Personne ne pouvait répondre à la question qui décide de tout
 * dans ce métier : « d'où vient ce chiffre ? »
 *
 * Le moteur ne recalcule rien lui-même. Il orchestre, et il rend un résultat
 * qui SE JUSTIFIE : chaque valeur importante porte la méthode qui l'a
 * produite, les paramètres qui y sont entrés, les hypothèses retenues et la
 * version du moteur. Une étude qu'on peut ouvrir se défend ; une étude qu'on
 * doit croire se conteste.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ AUCUNE HYPOTHÈSE N'EST CACHÉE DANS LE CODE. Toutes remontent dans     │
 * │ `hypotheses`, avec leur valeur, leur unité, leur source, et le        │
 * │ drapeau `verifiee` qui dit si elle a été relue sur un document        │
 * │ officiel ou si c'est un ordre de grandeur. Le rapport et l'assistant  │
 * │ lisent cette liste ; ils ne la réécrivent pas.                        │
 * └──────────────────────────────────────────────────────────────────────┘
 */
import { etudier, HYPOTHESES } from './etude.js';
import { comparer } from './scenarios.js';
import { evaluer } from './score.js';
import { dimensionner, verdictGlobal, manquePourConclure } from './technique.js';
import { consommationMensuelle, typeBatiment } from './batiment.js';
import { resoudre, FIABILITES } from './consommation.js';
import { GRILLE } from './tarif.js';
import { FACTEUR as FACTEUR_CO2, SOURCE as SOURCE_CO2, VERIFIE as CO2_VERIFIE } from './co2.js';
import { productible, nomGouvernorat, zoneSolaire } from './gisement.js';
import { facteurOrientation } from './orientation.js';
import { moduleParId, CATALOGUE_REEL } from './materiel.js';
import { analyser } from './diagnostics.js';

/**
 * Version du moteur de calcul.
 *
 * Elle figure dans chaque résultat et dans chaque rapport. Deux études du
 * même toit qui ne donnent pas le même chiffre doivent pouvoir se comparer :
 * sans numéro de version, on ne saurait pas si c'est la saisie qui a changé
 * ou le calcul.
 *
 * MAJEUR : un résultat change pour les mêmes entrées.
 * MINEUR : une capacité s'ajoute sans changer les résultats existants.
 * CORRECTIF : une correction sans effet sur les chiffres.
 */
export const VERSION = '2.0.0';

/**
 * LES TROIS NIVEAUX D'ÉTUDE.
 *
 * Ils ne se choisissent pas : ils se CONSTATENT. Un visiteur ne décide pas
 * que son étude est professionnelle — c'est la présence des données qui en
 * décide. Annoncer un niveau qu'on n'a pas les moyens de tenir est le plus
 * sûr moyen de perdre la confiance d'un installateur.
 */
export const NIVEAUX = [
  {
    id: 'rapide',
    rang: 1,
    nom: 'Estimation rapide',
    phrase: 'Estimation préliminaire, sur les données minimales : localisation '
      + 'et consommation. Les ordres de grandeur sont justes ; le dimensionnement '
      + 'ne l’est pas encore.',
    exige: ['gouvernorat', 'consommation'],
  },
  {
    id: 'avance',
    rang: 2,
    nom: 'Étude avancée',
    phrase: 'Étude bâtie sur votre toiture réelle : orientation, inclinaison et '
      + 'cotes du pan. Les hypothèses retenues sont listées ci-dessous.',
    exige: ['gouvernorat', 'consommation', 'orientation', 'toiture', 'batiment'],
  },
  {
    id: 'pro',
    rang: 3,
    nom: 'Conception professionnelle préparatoire',
    phrase: 'Conception préparatoire : matériel choisi, chaînes calculées et '
      + 'contrôles électriques passés. Une étude finale reste à valider selon '
      + 'les exigences techniques, réglementaires et propres au projet.',
    exige: ['gouvernorat', 'consommation', 'orientation', 'toiture', 'batiment',
      'materiel', 'electrique'],
  },
];

/** Les critères de données, et comment on constate qu'ils sont remplis. */
export const CRITERES = {
  gouvernorat: {
    nom: 'Localisation',
    rempli: (e) => Boolean(productible(e.gouvernorat)),
  },
  consommation: {
    nom: 'Consommation',
    rempli: (e) => Number(e.consommationAnnuelle) > 0,
  },
  batiment: {
    nom: 'Type de bâtiment',
    rempli: (e) => Boolean(typeBatiment(e.batiment)),
  },
  orientation: {
    nom: 'Orientation et inclinaison',
    rempli: (e) => Boolean(facteurOrientation(e.orientation, e.pente)),
  },
  toiture: {
    nom: 'Cotes de la toiture',
    rempli: (e) => Number(e.surfaceDisponible) > 0,
  },
  materiel: {
    nom: 'Matériel choisi',
    rempli: (e) => Boolean(e.moduleId),
  },
  electrique: {
    nom: 'Contrôles électriques complets et passés',
    // Deux conditions, pas une : aucune donnée ne doit manquer, ET aucun
    // contrôle ne doit être en échec. Une configuration refusée par le
    // moteur électrique n'est pas une « conception professionnelle », même
    // si toutes les fiches sont complètes.
    rempli: (e, ctx) => Boolean(ctx?.dimensionnement)
      && !ctx.dimensionnement.incomplet
      && manquePourConclure(ctx.dimensionnement).length === 0
      && !(ctx.dimensionnement.controles ?? []).some((c) => c.verdict === 'hors'),
  },
  releves: {
    nom: 'Relevés mensuels réels',
    rempli: (e) => Array.isArray(e.mois) && e.mois.length === 12,
  },
};

/** Le niveau atteint, et le détail critère par critère. */
export function niveauAtteint(entrees, contexte = {}) {
  const etat = {};
  for (const [cle, c] of Object.entries(CRITERES)) {
    etat[cle] = Boolean(c.rempli(entrees, contexte));
  }
  let atteint = null;
  for (const n of NIVEAUX) {
    if (n.exige.every((cle) => etat[cle])) atteint = n;
  }
  const suivant = atteint
    ? NIVEAUX.find((n) => n.rang === atteint.rang + 1)
    : NIVEAUX[0];
  return {
    niveau: atteint,
    suivant: suivant ?? null,
    // Ce qu'il faudrait ajouter pour monter d'un cran : une liste d'actions,
    // pas un reproche.
    pourMonter: suivant ? suivant.exige.filter((cle) => !etat[cle])
      .map((cle) => ({ cle, nom: CRITERES[cle].nom })) : [],
    criteres: Object.entries(CRITERES)
      .map(([cle, c]) => ({ cle, nom: c.nom, rempli: etat[cle] })),
  };
}

/**
 * Les hypothèses réellement utilisées, chacune avec sa source.
 *
 * `verifiee: false` n'est pas une faiblesse à cacher : c'est l'information la
 * plus utile de la liste. Elle dit à l'installateur où porter son attention.
 */
export function hypothesesUtilisees(entrees, hypotheses = HYPOTHESES) {
  const bat = typeBatiment(entrees.batiment);
  const liste = [
    { cle: 'coutParKwc', nom: 'Coût installé retenu', valeur: hypotheses.coutParKwc,
      unite: 'DT/kWc', source: 'ordre de grandeur du marché tunisien', verifiee: false },
    { cle: 'hausseElectricite', nom: 'Hausse annuelle du prix de l’électricité',
      valeur: hypotheses.hausseElectricite * 100, unite: '%/an',
      source: 'hypothèse d’étude', verifiee: false },
    { cle: 'valeurSurplus', nom: 'Valeur du surplus injecté',
      valeur: hypotheses.valeurSurplus * 100, unite: '% du prix d’achat',
      source: 'rachat STEG', verifiee: false },
    { cle: 'degradation', nom: 'Perte annuelle de rendement des modules',
      valeur: hypotheses.degradation * 100, unite: '%/an',
      source: 'garantie constructeur usuelle', verifiee: false },
    { cle: 'duree', nom: 'Durée retenue pour l’analyse', valeur: hypotheses.duree,
      unite: 'ans', source: 'convention d’étude', verifiee: true },
    { cle: 'surfaceParKwc', nom: 'Surface nécessaire par kWc',
      valeur: hypotheses.surfaceParKwc, unite: 'm²/kWc',
      source: 'calepinage aux cotes des modules', verifiee: true },
    { cle: 'autoconsommation', nom: 'Part autoconsommée de référence',
      valeur: (bat?.autoconsommation ?? hypotheses.autoconsommation) * 100, unite: '%',
      source: `profil ${bat ? bat.nom.toLowerCase() : 'logement'}, sans batterie`,
      verifiee: false },
    { cle: 'productible', nom: 'Gisement solaire du gouvernorat',
      valeur: productible(entrees.gouvernorat) ?? null, unite: 'kWh/kWc/an',
      source: `zone ${zoneSolaire(entrees.gouvernorat) ?? '—'}`, verifiee: true },
    { cle: 'co2', nom: 'Contenu carbone du réseau', valeur: FACTEUR_CO2,
      unite: 'kgCO₂/kWh', source: SOURCE_CO2, verifiee: CO2_VERIFIE },
  ];

  // Le tarif n'entre en jeu QUE si la consommation n'a pas été lue sur une
  // facture. L'écrire sinon laisserait croire qu'on l'a supposé.
  if (entrees.fiabilite && entrees.fiabilite !== 'facture') {
    liste.push({ cle: 'grilleTarifaire', nom: 'Grille tarifaire STEG retenue',
      valeur: GRILLE.intitule, unite: '', source: 'structure de tranches',
      verifiee: GRILLE.verifiee });
  }
  if (entrees.moduleId) {
    liste.push({ cle: 'catalogue', nom: 'Fiches du matériel',
      valeur: moduleParId(entrees.moduleId).nom, unite: '',
      source: CATALOGUE_REEL ? 'catalogue fournisseur'
        : 'classes de matériel typiques, sans référence commerciale',
      verifiee: CATALOGUE_REEL });
  }
  return liste;
}

/**
 * D'OÙ VIENT CHAQUE CHIFFRE — la traçabilité, résultat par résultat.
 *
 * Chaque entrée nomme la méthode, les paramètres qui y sont entrés avec leur
 * valeur, et les hypothèses dont elle dépend. C'est ce qui permet à
 * l'assistant de répondre « pourquoi 12 kWc ? » sans inventer, et à un
 * installateur de refaire le calcul à la main s'il en doute.
 */
export function tracer(etude, entrees) {
  const f = etude.facteurOrientation;
  const nb = (v, d = 0) => Number(v).toLocaleString('fr-FR',
    { minimumFractionDigits: d, maximumFractionDigits: d });

  return [
    {
      cle: 'prixKwh',
      nom: 'Prix du kilowattheure',
      valeur: `${etude.prixKwh.toFixed(3).replace('.', ',')} DT`,
      methode: entrees.fiabilite === 'facture'
        ? 'montant annuel ÷ consommation annuelle, tous deux lus sur la facture'
        : 'montant déduit de la grille tarifaire ÷ consommation',
      parametres: [
        ['montant annuel', `${nb(etude.consommation * etude.prixKwh)} DT`],
        ['consommation annuelle', `${nb(etude.consommation)} kWh`],
      ],
      hypotheses: entrees.fiabilite === 'facture' ? [] : ['grilleTarifaire'],
    },
    {
      cle: 'puissance',
      nom: 'Puissance retenue',
      valeur: `${String(etude.puissance).replace('.', ',')} kWc`,
      methode: Number(entrees.surfaceDisponible) > 0
        ? 'consommation ÷ productible effectif, plafonnée par la surface de '
          + 'toiture et arrondie au demi-kilowatt inférieur'
        : 'consommation ÷ productible effectif, arrondie au demi-kilowatt',
      parametres: [
        ['consommation annuelle', `${nb(etude.consommation)} kWh`],
        ['productible', `${etude.productible} kWh/kWc/an`],
        ['facteur d’orientation', f.toFixed(2).replace('.', ',')],
        ...(Number(entrees.surfaceDisponible) > 0
          ? [['surface disponible', `${nb(entrees.surfaceDisponible)} m²`],
            ['surface par kWc', `${HYPOTHESES.surfaceParKwc} m²`]] : []),
      ],
      hypotheses: ['productible', 'surfaceParKwc'],
    },
    {
      cle: 'production',
      nom: 'Production annuelle',
      valeur: `${nb(etude.production)} kWh`,
      methode: 'puissance × productible du gouvernorat × facteur d’orientation',
      parametres: [
        ['puissance', `${String(etude.puissance).replace('.', ',')} kWc`],
        ['productible', `${etude.productible} kWh/kWc/an`],
        ['facteur d’orientation', f.toFixed(2).replace('.', ',')],
      ],
      hypotheses: ['productible'],
    },
    {
      cle: 'autoconsomme',
      nom: 'Énergie consommée sur place',
      valeur: `${nb(etude.autoconsomme)} kWh`,
      methode: 'production × taux d’autoconsommation, ce taux dépendant du '
        + 'rapport production / consommation et du type de bâtiment',
      parametres: [
        ['production', `${nb(etude.production)} kWh`],
        ['rapport production / consommation', `${Math.round(etude.ratio * 100)} %`],
        ['taux d’autoconsommation', `${Math.round(etude.tauxAutoconsommation * 100)} %`],
        ['référence du profil', `${Math.round(etude.autoconsommationReference * 100)} %`],
      ],
      hypotheses: ['autoconsommation'],
    },
    {
      cle: 'economieAnnuelle',
      nom: 'Économie la première année',
      valeur: `${nb(etude.economieAnnuelle)} DT`,
      methode: '(énergie consommée sur place × prix du kWh) + (surplus injecté '
        + '× prix du kWh × valeur du surplus)',
      parametres: [
        ['consommé sur place', `${nb(etude.autoconsomme)} kWh`],
        ['injecté', `${nb(etude.surplus)} kWh`],
        ['prix du kWh', `${etude.prixKwh.toFixed(3).replace('.', ',')} DT`],
        ['valeur du surplus', `${Math.round(HYPOTHESES.valeurSurplus * 100)} %`],
      ],
      hypotheses: ['valeurSurplus', 'autoconsommation'],
    },
    {
      cle: 'retour',
      nom: 'Temps de retour',
      valeur: etude.retour
        ? `${etude.retour.toFixed(1).replace('.', ',')} ans`
        : `au-delà de ${HYPOTHESES.duree} ans`,
      methode: 'année où l’économie cumulée rattrape le coût, interpolée dans '
        + 'l’année ; l’économie croît avec le prix de l’électricité et décroît '
        + 'avec l’usure des modules',
      parametres: [
        ['coût', `${nb(etude.cout)} DT`],
        ['économie année 1', `${nb(etude.economieAnnuelle)} DT`],
        ['hausse de l’électricité', `${Math.round(HYPOTHESES.hausseElectricite * 100)} %/an`],
        ['dégradation', `${(HYPOTHESES.degradation * 100).toFixed(1).replace('.', ',')} %/an`],
      ],
      hypotheses: ['coutParKwc', 'hausseElectricite', 'degradation', 'duree'],
    },
    {
      cle: 'co2Annuel',
      nom: 'CO₂ évité',
      valeur: `${nb(etude.co2Annuel)} kg/an`,
      methode: 'production annuelle × contenu carbone du réseau',
      parametres: [
        ['production', `${nb(etude.production)} kWh`],
        ['contenu carbone', `${FACTEUR_CO2} kgCO₂/kWh`],
      ],
      hypotheses: ['co2'],
    },
  ];
}

/**
 * LA CONFIANCE — une note, et ce qui la fait monter ou descendre.
 *
 * Elle ne mesure pas la qualité du projet (c'est le Solar Score) mais la
 * qualité des DONNÉES qui ont servi à l'étudier. Un excellent projet mal
 * renseigné doit afficher une confiance basse, et le dire.
 */
export function confiance(entrees, contexte = {}) {
  const facteurs = [];
  const ajoute = (nom, poids, obtenu, note) => facteurs.push({ nom, poids, obtenu, note });

  const fiab = FIABILITES[entrees.fiabilite];
  ajoute('Origine de la consommation', 30,
    fiab ? Math.round((fiab.rang / 3) * 30) : 0,
    fiab ? fiab.nom : 'consommation non renseignée');

  const orientationConnue = Boolean(facteurOrientation(entrees.orientation, entrees.pente));
  ajoute('Orientation et inclinaison', 20, orientationConnue ? 20 : 0,
    orientationConnue ? 'renseignées' : 'non renseignées — aucune perte supposée');

  const toiture = Number(entrees.surfaceDisponible) > 0;
  ajoute('Cotes de la toiture', 20, toiture ? 20 : 0,
    toiture ? 'relevées' : 'non communiquées — aucune contrainte de surface appliquée');

  const releves = Array.isArray(entrees.mois) && entrees.mois.length === 12;
  ajoute('Répartition mensuelle', 15, releves ? 15 : 5,
    releves ? 'douze relevés réels' : 'profil type du bâtiment');

  const dim = contexte.dimensionnement;
  const electriqueSain = dim && !dim.incomplet && manquePourConclure(dim).length === 0;
  ajoute('Contrôles électriques', 15, electriqueSain ? 15 : 0,
    !dim ? 'non calculés'
      : electriqueSain ? 'complets' : 'incomplets — fiches matériel partielles');

  const note = facteurs.reduce((s, f) => s + f.obtenu, 0);
  return {
    note,
    niveau: note >= 80 ? 'haute' : note >= 55 ? 'moyenne' : 'basse',
    phrase: note >= 80
      ? 'Les données couvrent l’essentiel de ce que le calcul demande.'
      : note >= 55
        ? 'Plusieurs paramètres reposent sur des valeurs par défaut. L’ordre de '
          + 'grandeur tient, le détail est à confirmer.'
        : 'L’étude repose largement sur des valeurs par défaut. À traiter comme '
          + 'une première approche, pas comme un dimensionnement.',
    facteurs,
  };
}

/**
 * UNE SIMULATION COMPLÈTE, avec tout ce qui permet de la juger.
 *
 * @param {object} entrees les données assemblées par `etat.js`
 * @param {object} [options]
 * @param {number} [options.puissance] puissance imposée, sinon recommandée
 * @param {object} [options.hypotheses]
 * @returns {{version, horodatage, entrees, resultats, hypotheses, tracabilite,
 *   avertissements, erreurs, niveau, confiance, scenarios, score,
 *   dimensionnement, statut}}
 *   Toujours un objet : une simulation qui échoue le DIT, avec ses erreurs,
 *   plutôt que de rendre `null` et de laisser l'appelant deviner.
 */
export function simuler(entrees, { puissance = null, hypotheses = HYPOTHESES } = {}) {
  const base = {
    version: VERSION,
    horodatage: new Date().toISOString(),
    entrees: { ...entrees, puissanceImposee: puissance },
    resultats: null,
    hypotheses: [],
    tracabilite: [],
    avertissements: [],
    erreurs: [],
    niveau: null,
    confiance: null,
    scenarios: [],
    score: null,
    dimensionnement: null,
    statut: 'echec',
  };

  if (!entrees || typeof entrees !== 'object') {
    base.erreurs.push({ cle: 'entrees', message: 'Aucune donnée à calculer.' });
    return base;
  }

  const etude = etudier({ ...entrees, puissance, hypotheses });
  if (!etude) {
    base.erreurs.push({
      cle: 'calcul',
      message: 'Les données ne permettent pas de conclure : il manque la '
        + 'localisation, la consommation ou le montant payé.',
    });
    base.niveau = niveauAtteint(entrees);
    base.confiance = confiance(entrees);
    base.avertissements = analyser(entrees, { etude: null });
    return base;
  }

  const dimensionnement = entrees.moduleId
    ? dimensionner({ puissance: etude.puissance, module: moduleParId(entrees.moduleId) })
    : dimensionner({ puissance: etude.puissance });

  const contexte = { etude, dimensionnement };
  const score = evaluer({
    gouvernorat: entrees.gouvernorat,
    orientation: entrees.orientation,
    pente: entrees.pente,
    surfaceDisponible: entrees.surfaceDisponible,
    puissanceVisee: etude.puissance,
    tauxAutoconsommation: etude.tauxAutoconsommation,
    retour: etude.retour,
  });

  return {
    ...base,
    statut: 'ok',
    resultats: etude,
    scenarios: comparer(entrees),
    score,
    dimensionnement,
    mensuelConsommation: consommationMensuelle(
      etude.consommation, etude.batiment, entrees.mois ?? null),
    hypotheses: hypothesesUtilisees(entrees, hypotheses),
    tracabilite: tracer(etude, entrees),
    niveau: niveauAtteint(entrees, contexte),
    confiance: confiance(entrees, contexte),
    avertissements: analyser(entrees, contexte),
    verdictElectrique: dimensionnement ? verdictGlobal(dimensionnement.controles) : 'inconnu',
    lieu: nomGouvernorat(entrees.gouvernorat),
  };
}

/** Une hypothèse par sa clé, pour que la traçabilité puisse y renvoyer. */
export function hypothesePar(cle, liste) {
  return (liste ?? []).find((h) => h.cle === cle) ?? null;
}
