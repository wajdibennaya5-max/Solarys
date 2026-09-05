/**
 * LE MODE TECHNICIEN : ce qu'un installateur doit vérifier avant de commander.
 *
 * Le client veut savoir combien il économise. L'installateur veut savoir si
 * la chaîne tient la tension un matin de janvier, et si le courant passe dans
 * l'entrée de l'onduleur. Ce sont deux métiers, et deux écrans.
 *
 * LES DEUX FAUTES QUE CE FICHIER SERT À NE PLUS COMMETTRE :
 *
 * 1. Dimensionner une chaîne sur la tension à 25 °C. La tension à vide monte
 *    quand il fait FROID : c'est au petit matin d'un jour d'hiver, modules
 *    froids et onduleur pas encore en charge, que la chaîne dépasse la
 *    tension maximale et détruit l'entrée. On calcule donc à la température
 *    minimale retenue, pas à celle de la fiche technique.
 * 2. Oublier que la tension s'effondre en été. À 70 °C de cellule, la tension
 *    au point de puissance chute d'un cinquième : une chaîne trop courte
 *    sort de la plage MPPT en plein mois d'août — au moment précis où elle
 *    devrait produire le plus.
 *
 * Chaque verdict nomme la valeur ET la limite qui l'a produit. « Hors
 * limites » sans le nombre n'aide personne à corriger.
 */
import { MODULE_DEFAUT, onduleurPour, vocA, vmpA, TEMPERATURES } from './materiel.js';

/** Les trois verdicts, du plus rassurant au plus grave. */
export const VERDICTS = {
  conforme: { rang: 0, signe: '✓', nom: 'Conforme selon les limites configurées' },
  verifier: { rang: 1, signe: '⚠', nom: 'À vérifier' },
  hors: { rang: 2, signe: '✕', nom: 'Configuration hors limites configurées' },
};

/**
 * Marge de sécurité sur le courant, avant l'entrée de l'onduleur.
 * Un ciel voilé qui se déchire donne brièvement plus que 1000 W/m².
 */
export const MARGE_COURANT = 1.25;

/** Plage de rapport puissance crête / puissance onduleur jugée saine. */
/**
 * Un rapport de 1 est parfaitement sain ; c'est en dessous de 0,95 que
 * l'onduleur devient trop grand pour son champ et travaille mal.
 */
export const RATIO = { bas: 0.95, haut: 1.35, plancher: 0.85, plafond: 1.50 };

/** Combien de modules pour atteindre une puissance crête. */
export function nombreDeModules(puissanceKwc, mod = MODULE_DEFAUT) {
  const kwc = Number(puissanceKwc);
  if (!(kwc > 0) || !mod?.puissance) return 0;
  return Math.max(1, Math.round((kwc * 1000) / mod.puissance));
}

/**
 * Les longueurs de chaîne électriquement acceptables.
 * @returns {{min:number, max:number, vocFroid:number, vmpChaud:number}}
 */
export function bornesChaine(mod, onduleur) {
  const m = mod ?? MODULE_DEFAUT;
  const vocFroid = vocA(m, TEMPERATURES.min);
  const vmpChaud = vmpA(m, TEMPERATURES.max);
  return {
    // Au-delà, la tension à vide d'un matin d'hiver dépasse la limite absolue.
    max: Math.floor(onduleur.vMax / vocFroid),
    // En deçà, la chaîne sort de la plage MPPT en plein été.
    min: Math.max(1, Math.ceil(onduleur.vMpptMin / vmpChaud)),
    vocFroid,
    vmpChaud,
  };
}

/**
 * Le dimensionnement complet d'un champ sur un onduleur.
 *
 * @returns {object|null} `null` si les données ne permettent pas de conclure
 */
export function dimensionner({ puissance, module: mod = MODULE_DEFAUT, onduleur = null }) {
  const kwc = Number(puissance);
  if (!(kwc > 0) || !mod) return null;

  const modules = nombreDeModules(kwc, mod);
  // L'onduleur se choisit sur la puissance RÉELLEMENT posée, pas sur celle
  // demandée : cinq modules de 550 font 2,75 kWc et non 3, et l'écart suffit
  // à faire basculer le rapport hors de la plage saine.
  const kwcReel = (modules * mod.puissance) / 1000;
  const ond = onduleur ?? onduleurPour(kwcReel);
  if (!ond) return null;
  const bornes = bornesChaine(mod, ond);
  const entrees = ond.mppt * ond.chainesParMppt;

  // TOUTES les répartitions sont pesées, pas seulement celles qui tombent
  // juste. Chercher d'abord une division exacte puis se rabattre sur une
  // formule approchée donnait, sur un champ de 30 kWc, cinq chaînes de onze
  // — la seule division exacte de 55 — alors que trois chaînes de dix-huit
  // passent le courant et les tensions sans rien forcer. Deux modules de
  // moins valent mieux qu'une entrée d'onduleur en surintensité.
  //
  // Les chaînes sont toutes de même longueur : mélanger deux longueurs sur un
  // même MPPT déséquilibre le suivi de puissance, et c'est une faute qu'on ne
  // propose pas.
  //
  // Le premier passage n'accepte qu'un quart d'écart sur le nombre de
  // modules : au-delà, ce n'est plus le champ demandé. Si rien ne tient dans
  // cette fenêtre, un second passage la lève — mieux vaut proposer la
  // meilleure configuration possible en disant que l'onduleur est trop petit
  // que ne rien rendre du tout à l'installateur.
  let retenu = null;
  let meilleurScore = -Infinity;
  let contraint = false;
  for (const fenetre of [Math.max(1, modules * 0.25), Infinity]) {
    for (let n = bornes.min; n <= bornes.max; n++) {
      for (let chaines = 1; chaines <= entrees; chaines++) {
        const total = n * chaines;
        if (Math.abs(total - modules) > fenetre) continue;

        const voc = n * bornes.vocFroid;
        const vmpChaud = n * bornes.vmpChaud;
        const vmpStc = n * mod.vmp;
        const parMppt = Math.ceil(chaines / ond.mppt);

        let score = 0;
        // Tomber juste sur le nombre de modules voulu prime sur tout le reste.
        score += total === modules ? 120 : -Math.abs(total - modules) * 14;
        // Une entrée en surintensité est écartée : la proposer serait proposer
        // une faute que le contrôle rejetterait aussitôt.
        if (mod.imp * parMppt > ond.iMpptMax
          || mod.isc * MARGE_COURANT * parMppt > ond.iScMax) score -= 500;
        // Marge de tension à vide : on en veut au moins dix pour cent.
        const margeVoc = 1 - voc / ond.vMax;
        score += margeVoc >= 0.10 ? 30 : margeVoc * 200;
        // Marge au bas de la plage MPPT par forte chaleur.
        const margeChaud = vmpChaud / ond.vMpptMin - 1;
        score += margeChaud >= 0.08 ? 30 : margeChaud * 200;
        // Travailler au cœur de la plage en conditions standard.
        const milieu = (ond.vMpptMin + ond.vMpptMax) / 2;
        score -= (Math.abs(vmpStc - milieu) / milieu) * 20;
        // À marges égales, moins de chaînes : moins de câble, moins de connecteurs.
        score -= chaines * 2;

        if (score > meilleurScore) {
          meilleurScore = score; retenu = { longueur: n, chaines };
        }
      }
    }
    if (retenu) break;
    // Le second passage n'a lieu que si le premier n'a rien trouvé.
    contraint = true;
  }
  if (!retenu) return null;
  const exact = retenu.longueur * retenu.chaines === modules;

  const { longueur, chaines } = retenu;
  const chainesParMppt = Math.ceil(chaines / ond.mppt);
  const puissanceDc = (longueur * chaines * mod.puissance) / 1000;
  const ratio = puissanceDc / ond.puissance;

  const vocChaine = longueur * bornes.vocFroid;
  const vmpChaineChaud = longueur * bornes.vmpChaud;
  const vmpChaineStc = longueur * mod.vmp;
  // Deux courants, et non un seul : celui qui circule en fonctionnement, et
  // celui d'un court-circuit majoré. Ils se comparent à deux limites
  // différentes de l'onduleur.
  const courantFonctionnement = mod.imp * chainesParMppt;
  const courantCourtCircuit = mod.isc * MARGE_COURANT * chainesParMppt;

  return {
    onduleur: ond,
    module: mod,
    modules: longueur * chaines,
    modulesVises: modules,
    repartitionExacte: exact,
    longueur,
    chaines,
    chainesParMppt,
    bornes,
    puissanceDc,
    puissanceAc: ond.puissance,
    ratio,
    vocChaine,
    vmpChaineChaud,
    vmpChaineStc,
    courantFonctionnement,
    courantCourtCircuit,
    controles: controler({
      ond, longueur, chaines, chainesParMppt, vocChaine, vmpChaineChaud,
      vmpChaineStc, courantFonctionnement, courantCourtCircuit, ratio, exact,
      bornes, modules, contraint,
    }),
  };
}

/** Le verdict le plus grave d'une liste de contrôles. */
export function verdictGlobal(controles) {
  if (!controles?.length) return 'conforme';
  return controles.reduce((pire, c) =>
    (VERDICTS[c.verdict].rang > VERDICTS[pire].rang ? c.verdict : pire), 'conforme');
}

/**
 * Les contrôles, un par un.
 * Chacun dit ce qu'il a mesuré, contre quelle limite, et pourquoi.
 */
function controler({ ond, longueur, chaines, chainesParMppt, vocChaine, vmpChaineChaud,
  vmpChaineStc, courantFonctionnement, courantCourtCircuit, ratio, exact,
  bornes, modules, contraint }) {
  // Le point décimal anglais au milieu d'une page française fait douter du
  // reste : « 13.1 A » se lit comme une coquille.
  const v = (n) => `${Math.round(n).toLocaleString('fr-FR')} V`;
  const a = (n) => `${n.toLocaleString('fr-FR', {
    minimumFractionDigits: 1, maximumFractionDigits: 1 })} A`;
  const controles = [];

  controles.push({
    cle: 'tension-froid',
    nom: `Tension à vide à ${TEMPERATURES.min} °C`,
    mesure: v(vocChaine),
    limite: `maximum ${v(ond.vMax)}`,
    verdict: vocChaine > ond.vMax ? 'hors'
      : vocChaine > ond.vMax * 0.95 ? 'verifier' : 'conforme',
    pourquoi: vocChaine > ond.vMax
      ? `${longueur} modules en série dépassent la tension maximale de l’onduleur `
        + 'un matin d’hiver. Raccourcissez la chaîne : l’entrée serait détruite.'
      : vocChaine > ond.vMax * 0.95
        ? 'La marge est inférieure à 5 %. Vérifiez la température minimale du '
          + 'site avant de valider — un site d’altitude descend plus bas.'
        : 'La chaîne reste sous la tension maximale, modules froids et à vide.',
  });

  controles.push({
    cle: 'tension-chaud',
    nom: `Tension MPP à ${TEMPERATURES.max} °C de cellule`,
    mesure: v(vmpChaineChaud),
    limite: `plage MPPT ${v(ond.vMpptMin)} – ${v(ond.vMpptMax)}`,
    verdict: vmpChaineChaud < ond.vMpptMin ? 'hors'
      : vmpChaineChaud < ond.vMpptMin * 1.08 ? 'verifier' : 'conforme',
    pourquoi: vmpChaineChaud < ond.vMpptMin
      ? 'En plein été, la chaîne sort de la plage MPPT : l’onduleur cesse de '
        + 'suivre le point de puissance au moment où le champ produit le plus. '
        + `Il faut au moins ${bornes.min} modules par chaîne.`
      : vmpChaineChaud < ond.vMpptMin * 1.08
        ? 'La chaîne frôle le bas de la plage MPPT par forte chaleur. Une '
          + 'toiture mal ventilée peut dépasser 70 °C de cellule.'
        : 'La chaîne reste dans la plage MPPT même par forte chaleur.',
  });

  controles.push({
    cle: 'tension-stc',
    nom: 'Tension MPP aux conditions standard',
    mesure: v(vmpChaineStc),
    limite: `plage MPPT ${v(ond.vMpptMin)} – ${v(ond.vMpptMax)}`,
    verdict: (vmpChaineStc > ond.vMpptMax || vmpChaineStc < ond.vMpptMin)
      ? 'verifier' : 'conforme',
    pourquoi: vmpChaineStc > ond.vMpptMax
      ? 'Au-dessus de la plage MPPT en conditions standard : l’onduleur '
        + 'écrêtera une partie de l’année.'
      : vmpChaineStc < ond.vMpptMin
        ? 'Sous la plage MPPT en conditions standard : le rendement de '
          + 'conversion sera dégradé une bonne partie de l’année.'
        : 'La chaîne travaille au cœur de la plage MPPT.',
  });

  controles.push({
    cle: 'courant',
    nom: `Courant de fonctionnement par MPPT (${chainesParMppt} chaîne${
      chainesParMppt > 1 ? 's' : ''} en parallèle)`,
    mesure: a(courantFonctionnement),
    limite: `maximum ${a(ond.iMpptMax)}`,
    verdict: courantFonctionnement > ond.iMpptMax ? 'hors'
      : courantFonctionnement > ond.iMpptMax * 0.95 ? 'verifier' : 'conforme',
    pourquoi: courantFonctionnement > ond.iMpptMax
      ? 'Trop de chaînes en parallèle sur une même entrée : l’onduleur écrêtera '
        + 'le courant. Répartissez sur davantage de MPPT, prenez un onduleur qui '
        + 'accepte plus de courant, ou scindez le champ sur deux onduleurs.'
      : 'Le courant au point de puissance reste dans les limites de l’entrée.',
  });

  controles.push({
    cle: 'court-circuit',
    nom: `Courant de court-circuit majoré (marge ${
      String(MARGE_COURANT).replace('.', ',')})`,
    mesure: a(courantCourtCircuit),
    limite: `maximum ${a(ond.iScMax)}`,
    verdict: courantCourtCircuit > ond.iScMax ? 'hors'
      : courantCourtCircuit > ond.iScMax * 0.95 ? 'verifier' : 'conforme',
    pourquoi: courantCourtCircuit > ond.iScMax
      ? 'Un ciel voilé qui se déchire peut dépasser les conditions standard. '
        + 'L’entrée doit tenir ce courant sans être endommagée.'
      : 'L’entrée tient le court-circuit, marge de surirradiance comprise.',
  });

  controles.push({
    cle: 'ratio',
    nom: 'Rapport puissance crête / puissance onduleur',
    mesure: ratio.toFixed(2).replace('.', ','),
    limite: `plage saine ${RATIO.bas.toFixed(2)} – ${RATIO.haut.toFixed(2)}`.replace(/\./g, ','),
    verdict: (ratio < RATIO.plancher || ratio > RATIO.plafond) ? 'hors'
      : (ratio < RATIO.bas || ratio > RATIO.haut) ? 'verifier' : 'conforme',
    pourquoi: ratio > RATIO.haut
      ? 'Le champ est nettement plus gros que l’onduleur : l’écrêtage sera '
        + 'sensible aux heures de pointe. Ce peut être un choix assumé sur un '
        + 'toit très bien exposé, ce n’est pas un accident acceptable ailleurs.'
      : ratio < RATIO.bas
        ? 'L’onduleur est plus grand que le champ : il travaillera souvent à '
          + 'faible charge, là où son rendement est le moins bon.'
        : 'Le champ est légèrement surdimensionné par rapport à l’onduleur, '
          + 'comme il se doit : les conditions standard ne sont presque jamais atteintes.',
  });

  if (contraint) {
    controles.push({
      cle: 'capacite',
      nom: 'Capacité de l’onduleur',
      mesure: `${chaines} × ${longueur} = ${chaines * longueur} modules`,
      limite: `${modules} modules visés`,
      verdict: 'hors',
      pourquoi: `Cet onduleur ne peut pas porter le champ demandé : ses `
        + `${ond.mppt} MPPT et ses bornes de tension plafonnent à `
        + `${chaines * longueur} modules. Prenez un onduleur plus grand, ou `
        + 'scindez le champ sur plusieurs onduleurs.',
    });
  }

  if (!exact && !contraint) {
    controles.push({
      cle: 'repartition',
      nom: 'Répartition en chaînes égales',
      mesure: `${chaines} × ${longueur} = ${chaines * longueur} modules`,
      limite: `${modules} modules visés`,
      verdict: 'verifier',
      pourquoi: 'Le nombre de modules ne se répartit pas en chaînes de longueur '
        + 'égale dans les bornes de tension. Ajustez le nombre de modules, ou '
        + 'prévoyez un second onduleur — mélanger deux longueurs sur un même '
        + 'MPPT déséquilibre le suivi de puissance.',
    });
  }

  return controles;
}
