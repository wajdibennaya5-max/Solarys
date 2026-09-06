/**
 * LE BILAN ÉNERGÉTIQUE, HEURE PAR HEURE.
 *
 * ┌─ CE QUE CE FICHIER REMPLACE, ET POURQUOI ─────────────────────────────┐
 * │ Jusqu'ici l'autoconsommation venait d'une COURBE : un taux de         │
 * │ référence par type de bâtiment, corrigé selon la taille de            │
 * │ l'installation. C'était déjà mieux qu'une constante — la version      │
 * │ précédente donnait le même temps de retour à 2 kWc et à 5,5 kWc —     │
 * │ mais cela reste une abaque, pas un bilan.                             │
 * │                                                                       │
 * │ Or l'autoconsommation ne se décrète pas : elle se CONSTATE, heure par │
 * │ heure, en confrontant ce que les panneaux produisent à ce que le      │
 * │ bâtiment consomme au même instant. Un atelier qui tourne de 8 h à     │
 * │ 17 h et une maison vide toute la journée peuvent avoir la même        │
 * │ consommation annuelle et deux rentabilités opposées. Aucune courbe    │
 * │ ne distingue les deux ; un bilan horaire, oui.                        │
 * │                                                                       │
 * │ Et c'est la seule façon de simuler une batterie : une batterie ne se  │
 * │ résume à aucun taux, elle vit d'un état de charge qui monte et        │
 * │ descend heure après heure.                                            │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ CE QUE CE FICHIER N'EST PAS ─────────────────────────────────────────┐
 * │ Une mesure. Les profils horaires ci-dessous sont des FORMES TYPES,    │
 * │ pas des relevés de compteur. Ils décrivent l'allure d'une journée     │
 * │ moyenne pour un usage donné ; ils ne décrivent pas VOTRE journée.     │
 * │                                                                       │
 * │ Tant qu'un profil réel n'a pas été importé, chaque résultat qui sort  │
 * │ d'ici porte `mesure: false` et la réserve qui va avec. Le jour où le  │
 * │ client fournit sa courbe de charge, le même moteur tourne sur des     │
 * │ données réelles et `mesure` passe à `true` — sans qu'une seule ligne  │
 * │ de calcul change.                                                     │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * Aucun accès au réseau ni à la page : uniquement du calcul.
 */
import { MOIS } from './gisement.js';

/** Un nombre, ou rien. `Number(null)` vaut zéro, et zéro n'est pas « rien ». */
function nb(v) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export const HEURES_PAR_JOUR = 24;
export const JOURS_PAR_MOIS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const JOURS_PAR_AN = JOURS_PAR_MOIS.reduce((t, j) => t + j, 0);

/**
 * LES FORMES DE JOURNÉE, par usage.
 *
 * Chaque profil donne 24 poids, un par heure. Seule leur FORME compte : la
 * fonction de mise à l'échelle les normalise pour retomber sur la
 * consommation annuelle réelle du client. Écrire des kilowattheures ici
 * donnerait l'illusion d'une mesure ; des poids annoncent ce qu'ils sont.
 *
 * `ete` et `hiver` diffèrent parce qu'en Tunisie la climatisation déplace le
 * pic de consommation en plein après-midi — exactement quand les panneaux
 * produisent le plus. C'est ce décalage saisonnier qui décide de la
 * rentabilité, et une forme unique le gommerait.
 *
 * LE PIC VAUT 100 SUR AU MOINS UNE SAISON, pas forcément sur les deux : un
 * hiver plafonnant plus bas encode une AMPLITUDE, et non seulement une forme.
 * C'est ce qui distingue une exploitation agricole, qui irrigue l'été et
 * s'arrête l'hiver, d'un commerce ouvert à l'année.
 */
export const PROFILS = {
  maison: {
    id: 'maison',
    nom: 'Maison',
    aide: 'Creux la journée, pic le soir : le foyer est vide aux heures de production.',
    hiver: [30, 26, 24, 23, 23, 28, 45, 62, 55, 42, 38, 40,
      48, 44, 40, 42, 58, 88, 100, 96, 82, 66, 50, 38],
    ete: [34, 29, 26, 25, 25, 30, 44, 56, 52, 50, 56, 66,
      78, 86, 90, 88, 84, 88, 100, 98, 88, 72, 54, 42],
  },
  villa: {
    id: 'villa',
    nom: 'Villa',
    aide: 'Comme une maison, avec climatisation et pompe de piscine l’après-midi.',
    hiver: [34, 30, 28, 27, 27, 32, 48, 64, 58, 46, 44, 48,
      56, 52, 48, 50, 64, 90, 100, 96, 84, 70, 54, 42],
    ete: [40, 34, 30, 28, 28, 34, 48, 60, 62, 68, 80, 92,
      100, 100, 98, 94, 88, 90, 98, 96, 86, 72, 58, 48],
  },
  commerce: {
    id: 'commerce',
    nom: 'Commerce ou bureau',
    aide: 'Ouvert en journée : la consommation coïncide avec la production.',
    hiver: [18, 16, 15, 15, 15, 18, 30, 62, 92, 98, 100, 100,
      94, 96, 98, 96, 90, 76, 52, 34, 26, 22, 20, 19],
    ete: [22, 19, 18, 17, 17, 20, 34, 68, 94, 100, 100, 100,
      96, 100, 100, 98, 92, 78, 56, 38, 30, 26, 24, 23],
  },
  industrie: {
    id: 'industrie',
    nom: 'Atelier ou industrie',
    aide: 'Machines aux heures ouvrables, veilles la nuit.',
    hiver: [22, 20, 20, 20, 22, 34, 62, 92, 100, 100, 100, 96,
      70, 92, 100, 100, 96, 72, 40, 30, 26, 24, 23, 22],
    ete: [24, 22, 22, 22, 24, 36, 64, 94, 100, 100, 100, 98,
      74, 94, 100, 100, 98, 74, 42, 32, 28, 26, 25, 24],
  },
  agricole: {
    id: 'agricole',
    nom: 'Exploitation agricole',
    aide: 'Pompage en journée, très marqué l’été.',
    hiver: [14, 13, 13, 13, 14, 22, 46, 70, 82, 88, 90, 88,
      80, 84, 86, 82, 70, 48, 30, 22, 18, 16, 15, 14],
    ete: [18, 16, 16, 16, 20, 40, 76, 96, 100, 100, 100, 98,
      90, 96, 100, 100, 92, 68, 42, 30, 24, 21, 20, 19],
  },
};

/** Les mois comptés comme « été » en Tunisie : la climatisation tourne. */
export const MOIS_ETE = [4, 5, 6, 7, 8, 9];

export const profil = (id) => PROFILS[id] ?? PROFILS.maison;

/**
 * La consommation heure par heure, sur une année.
 *
 * @param {number} annuelle en kWh
 * @param {string} usage identifiant de profil
 * @returns {{heures:number[], mesure:false, source:string}|null}
 *   `heures` compte 8 760 valeurs en kWh. `mesure: false` n'est pas décoratif :
 *   c'est ce qui empêche le reste du projet d'appeler ce résultat un relevé.
 */
export function consommationHoraire(annuelle, usage = 'maison') {
  const total = nb(annuelle);
  if (total === null || total <= 0) return null;
  const p = profil(usage);

  const heures = [];
  let somme = 0;
  for (let mois = 0; mois < 12; mois++) {
    const forme = MOIS_ETE.includes(mois) ? p.ete : p.hiver;
    for (let jour = 0; jour < JOURS_PAR_MOIS[mois]; jour++) {
      for (let h = 0; h < HEURES_PAR_JOUR; h++) {
        heures.push(forme[h]);
        somme += forme[h];
      }
    }
  }
  // Mise à l'échelle : la somme des heures DOIT valoir la consommation
  // annoncée. Sans cette normalisation, les poids seraient pris pour des
  // kilowattheures et le bilan serait faux d'un facteur arbitraire.
  const facteur = total / somme;
  return {
    heures: heures.map((v) => v * facteur),
    mesure: false,
    source: `Forme type « ${p.nom} », mise à l’échelle sur ${Math.round(total)} kWh/an`,
    usage: p.id,
  };
}

/**
 * Reprend une courbe de charge FOURNIE par le client.
 *
 * C'est le chemin qui fait passer `mesure` à `true`. Le moteur ne change pas
 * d'un iota : seule la source des données change, et c'est tout l'intérêt.
 *
 * Accepte 8 760 valeurs (une année), 24 (une journée répétée) ou 168 (une
 * semaine répétée) — ce que produisent réellement les compteurs et les
 * tableurs.
 *
 * @returns {{heures:number[], mesure:true, source:string}|{erreur:string}}
 */
export function consommationImportee(valeurs, { unite = 'kWh' } = {}) {
  const brut = (Array.isArray(valeurs) ? valeurs : []).map(nb);
  if (!brut.length) return { erreur: 'Aucune valeur lue.' };
  if (brut.some((v) => v === null)) {
    return { erreur: 'Certaines lignes ne sont pas des nombres. Vérifiez le séparateur '
      + 'décimal : le point et la virgule ne se valent pas.' };
  }
  if (brut.some((v) => v < 0)) {
    return { erreur: 'Une consommation négative n’a pas de sens : vérifiez le fichier.' };
  }

  const tailles = { 24: 'une journée', 168: 'une semaine', 8760: 'une année' };
  if (!tailles[brut.length]) {
    return { erreur: `${brut.length} valeurs lues. Il en faut 24 (une journée), `
      + '168 (une semaine) ou 8760 (une année complète).' };
  }
  // Le compteur STEG donne des kWh ; certains exports donnent des watts.
  const k = unite === 'W' ? 0.001 : unite === 'kW' ? 1 : 1;
  const motif = brut.map((v) => v * k);

  const heures = [];
  for (let i = 0; i < JOURS_PAR_AN * HEURES_PAR_JOUR; i++) heures.push(motif[i % motif.length]);
  return {
    heures,
    mesure: true,
    source: `Courbe de charge fournie (${brut.length} valeurs, ${tailles[brut.length]})`
      + (brut.length < 8760 ? ', répétée sur l’année' : ''),
    usage: 'importe',
  };
}

/**
 * La production heure par heure.
 *
 * DEUX SOURCES, CHACUNE POUR CE QU'ELLE SAIT FAIRE.
 *
 * Les TOTAUX MENSUELS viennent du référentiel du projet — ou de PVGIS quand
 * il répond. Ce sont eux qui portent la météo réelle d'un lieu : la
 * nébulosité de janvier, la poussière d'août, la durée du jour.
 *
 * La FORME DE LA JOURNÉE vient de la position du soleil. C'est de
 * l'astronomie : elle donne l'heure du pic et la longueur de la journée
 * exactement, sans rien estimer.
 *
 * POURQUOI PAS LA GÉOMÉTRIE SEULE. Elle a d'abord été essayée. Confrontée au
 * référentiel du projet, elle surestimait mai de 99 kWh et sous-estimait
 * décembre de 78 — parce qu'un sinus d'élévation ignore les nuages d'hiver.
 * Le total annuel tombait juste et chaque mois était faux, ce qui est la
 * pire des situations : l'erreur ne se voit nulle part.
 *
 * @param {number[]} mensuelle douze totaux, en kWh
 * @param {(mois:number, heure:number) => number} hauteurSoleil en degrés
 */
export function productionHoraire(mensuelle, hauteurSoleil) {
  const mois12 = Array.isArray(mensuelle) ? mensuelle.map(nb) : null;
  if (!mois12 || mois12.length !== 12 || mois12.some((v) => v === null || v < 0)) return null;
  if (typeof hauteurSoleil !== 'function') return null;

  const heures = [];
  for (let mois = 0; mois < 12; mois++) {
    // Une seule journée type par mois, répétée : le soleil ne change pas
    // assez d'un jour au suivant pour justifier trente calculs distincts, et
    // cela divise le temps de calcul par autant sur un téléphone.
    const journee = [];
    let sommeJour = 0;
    for (let h = 0; h < HEURES_PAR_JOUR; h++) {
      const hauteur = Number(hauteurSoleil(mois, h)) || 0;
      // Sous trois degrés, le rayonnement est rasant et traverse trop
      // d'atmosphère : le compter gonflerait les heures creuses.
      const part = hauteur > 3 ? Math.sin(hauteur * Math.PI / 180) : 0;
      journee.push(part);
      sommeJour += part;
    }
    const jours = JOURS_PAR_MOIS[mois];
    // Chaque journée du mois porte la même énergie, répartie selon le soleil.
    const parJour = sommeJour > 0 ? mois12[mois] / jours / sommeJour : 0;
    for (let jour = 0; jour < jours; jour++) {
      for (const part of journee) heures.push(part * parJour);
    }
  }

  const total = mois12.reduce((t, v) => t + v, 0);
  return {
    heures,
    mensuelle: mois12,
    mesure: false,
    source: 'Totaux mensuels du référentiel, répartis dans la journée d’après la '
      + `position du soleil — ${Math.round(total)} kWh/an`,
  };
}

/* ------------------------------------------------------------------ */
/* La batterie                                                         */
/* ------------------------------------------------------------------ */

/**
 * Une batterie, telle qu'on l'achète.
 *
 * `profondeur` est la part réellement utilisable : une batterie de 10 kWh
 * annoncée à 90 % de profondeur en rend 9. Confondre capacité nominale et
 * capacité utile surestime l'autonomie de dix pour cent, tous les jours.
 */
export const BATTERIE_DEFAUT = {
  capaciteKwh: 0,
  puissanceKw: 0,
  profondeur: 0.9,
  /** Rendement d'un aller-retour charge → décharge. */
  rendement: 0.9,
  socDepart: 0.5,
};

export function batterie(reglages = {}) {
  const capacite = Math.max(0, nb(reglages.capaciteKwh) ?? 0);
  if (capacite <= 0) return null;
  const profondeur = Math.min(1, Math.max(0.2, nb(reglages.profondeur) ?? BATTERIE_DEFAUT.profondeur));
  const rendement = Math.min(1, Math.max(0.5, nb(reglages.rendement) ?? BATTERIE_DEFAUT.rendement));
  return {
    capaciteKwh: capacite,
    // Sans puissance déclarée, on retient C/2 : une batterie se charge
    // rarement en une heure, et supposer le contraire flatterait le résultat.
    puissanceKw: Math.max(0.1, nb(reglages.puissanceKw) || capacite / 2),
    profondeur,
    rendement,
    utileKwh: capacite * profondeur,
    socDepart: Math.min(1, Math.max(0, nb(reglages.socDepart) ?? BATTERIE_DEFAUT.socDepart)),
  };
}

/* ------------------------------------------------------------------ */
/* Le bilan                                                            */
/* ------------------------------------------------------------------ */

/**
 * Confronte production et consommation, heure par heure.
 *
 * L'ORDRE DES PRIORITÉS est celui d'une installation réelle, et il n'est pas
 * négociable : le solaire alimente d'abord la maison, le surplus charge la
 * batterie, ce qui reste part au réseau. Au manque, on puise dans la
 * batterie, puis on achète. Inverser deux lignes suffirait à faire vendre au
 * réseau une énergie qu'on rachètera plus cher le soir même.
 *
 * @returns {object} toujours un objet, avec sa réserve.
 */
export function bilan({ production, consommation, batterie: bat = null } = {}) {
  const prod = production?.heures;
  const conso = consommation?.heures;
  if (!Array.isArray(prod) || !Array.isArray(conso) || prod.length !== conso.length
    || !prod.length) {
    return {
      exploitable: false,
      raison: 'Il faut une production et une consommation horaires de même longueur.',
    };
  }

  const b = bat && bat.utileKwh > 0 ? bat : null;
  // Le rendement d'un aller-retour se répartit sur les deux sens : c'est la
  // convention des fiches techniques, et l'appliquer une seule fois
  // surestimerait le stockage.
  const rendementSimple = b ? Math.sqrt(b.rendement) : 1;
  let soc = b ? b.utileKwh * b.socDepart : 0;

  let directe = 0;
  let versBatterie = 0;
  let depuisBatterie = 0;
  let injectee = 0;
  let achetee = 0;
  let cycles = 0;

  const parMois = MOIS.map(() => ({ production: 0, consommation: 0, directe: 0,
    batterie: 0, injectee: 0, achetee: 0 }));
  let heure = 0;

  for (let mois = 0; mois < 12; mois++) {
    const fin = heure + JOURS_PAR_MOIS[mois] * HEURES_PAR_JOUR;
    for (; heure < fin; heure++) {
      const p = prod[heure];
      const c = conso[heure];
      const m = parMois[mois];
      m.production += p;
      m.consommation += c;

      // 1. Le solaire alimente le bâtiment.
      const surPlace = Math.min(p, c);
      directe += surPlace;
      m.directe += surPlace;
      let surplus = p - surPlace;
      let manque = c - surPlace;

      // 2. Le surplus charge la batterie, dans la limite de sa puissance et
      //    de la place restante.
      if (b && surplus > 0) {
        const place = (b.utileKwh - soc) / rendementSimple;
        const charge = Math.min(surplus, b.puissanceKw, Math.max(0, place));
        soc += charge * rendementSimple;
        surplus -= charge;
        versBatterie += charge;
        m.batterie += charge;
      }

      // 3. Ce qui reste part au réseau.
      injectee += surplus;
      m.injectee += surplus;

      // 4. Le manque puise dans la batterie…
      if (b && manque > 0 && soc > 0) {
        const dispo = soc * rendementSimple;
        const decharge = Math.min(manque, b.puissanceKw, dispo);
        soc -= decharge / rendementSimple;
        manque -= decharge;
        depuisBatterie += decharge;
        cycles += decharge / b.utileKwh;
      }

      // 5. … puis se paie au réseau.
      achetee += manque;
      m.achetee += manque;
    }
  }

  const productionTotale = prod.reduce((t, v) => t + v, 0);
  const consommationTotale = conso.reduce((t, v) => t + v, 0);
  const autoconsommee = directe + depuisBatterie;

  return {
    exploitable: true,
    productionTotale,
    consommationTotale,
    directe,
    versBatterie,
    depuisBatterie,
    autoconsommee,
    injectee,
    achetee,
    // Part de la PRODUCTION consommée sur place. C'est ce que le tarif de
    // rachat ne verra pas.
    tauxAutoconsommation: productionTotale > 0 ? autoconsommee / productionTotale : 0,
    // Part de la CONSOMMATION couverte par le solaire. Les deux se confondent
    // souvent dans les brochures ; ce ne sont pas les mêmes chiffres, et sur
    // une petite installation ils diffèrent du simple au triple.
    tauxAutoproduction: consommationTotale > 0 ? autoconsommee / consommationTotale : 0,
    cyclesParAn: b ? cycles : 0,
    parMois,
    avecBatterie: Boolean(b),
    batterie: b,
    // La réserve suit le maillon le plus faible : une production type
    // confrontée à une consommation type reste une simulation.
    mesure: Boolean(production.mesure && consommation.mesure),
    reserve: consommation.mesure
      ? 'Bilan calculé sur votre courbe de charge réelle et une année solaire type. '
        + 'La production d’une année donnée s’en écarte selon la météo.'
      : 'Bilan calculé sur une forme de consommation TYPE, pas sur vos relevés. '
        + 'Importez votre courbe de charge pour un résultat propre à votre usage.',
  };
}

/**
 * Ce qu'une batterie change, chiffré — et ce qu'elle coûte en énergie.
 *
 * Le rendement se paie : l'énergie qui entre dans une batterie n'en ressort
 * jamais entièrement. Afficher le gain sans la perte donnerait une image
 * flatteuse et fausse.
 */
export function apportBatterie(sansBatterie, avecBatterie) {
  if (!sansBatterie?.exploitable || !avecBatterie?.exploitable) return null;
  const gagne = avecBatterie.autoconsommee - sansBatterie.autoconsommee;
  const perdue = avecBatterie.versBatterie - avecBatterie.depuisBatterie;
  return {
    autoconsommationGagnee: gagne,
    achatEvite: sansBatterie.achetee - avecBatterie.achetee,
    injectionPerdue: sansBatterie.injectee - avecBatterie.injectee,
    pertesStockage: perdue,
    pointsGagnes: (avecBatterie.tauxAutoconsommation - sansBatterie.tauxAutoconsommation) * 100,
    cyclesParAn: avecBatterie.cyclesParAn,
  };
}
