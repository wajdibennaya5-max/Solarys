/**
 * LES OBSTACLES, ET L'OMBRE QU'ILS PORTENT VRAIMENT.
 *
 * POURQUOI CE FICHIER EXISTE. Jusqu'ici le projet disait franchement qu'il ne
 * savait rien de l'ombrage : une alerte permanente, « ombrage non disponible ».
 * C'était honnête et c'était insuffisant — une cheminée mal placée peut coûter
 * un tiers de la production d'une rangée.
 *
 * CE QUE CE FICHIER CALCULE, ET CE QU'IL NE CALCULE PAS.
 *
 * Il projette l'ombre géométrique d'obstacles RELEVÉS PAR L'UTILISATEUR sur le
 * plan du toit, à une date et une heure données, depuis la position réelle du
 * soleil. C'est de la géométrie exacte sur des données approximatives : si la
 * cheminée est déclarée à 1,20 m alors qu'elle en fait 1,60, l'ombre calculée
 * est fausse d'autant, et aucun calcul ne peut le rattraper.
 *
 * IL NE S'AGIT DONC PAS D'UNE MESURE. Le projet ne présentera jamais ce
 * résultat comme un relevé : ce qui sort d'ici est une SIMULATION à partir de
 * cotes déclarées, et chaque écran qui l'affiche doit le dire.
 *
 * Ce qu'il ignore encore : le relief lointain, les bâtiments non relevés, les
 * arbres qui poussent, la lumière diffuse — un module à l'ombre directe produit
 * encore, il ne produit pas zéro. Le comptage se fait donc en modules
 * TOUCHÉS, jamais en pertes de kilowattheures : convertir une surface ombrée
 * en énergie perdue demanderait un modèle électrique que ce fichier n'a pas.
 *
 * Aucun accès au réseau ni à la page : uniquement du calcul.
 */
import { versLeSoleil, position, course, DATES, dateRepere } from './soleil.js';
import { pointDansPolygone } from './implantation.js';

function nb(v) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Les obstacles qu'on rencontre vraiment sur un toit tunisien.
 *
 * Les hauteurs proposées sont des ORDRES DE GRANDEUR pour aider la saisie, pas
 * des valeurs par défaut à accepter les yeux fermés — l'interface demande
 * toujours de confirmer, et le résultat rappelle d'où vient la cote.
 */
export const TYPES_OBSTACLE = [
  { id: 'cheminee', nom: 'Cheminée', hauteur: 1.2, largeur: 0.6, longueur: 0.6,
    aide: 'Souche de cheminée ou conduit de ventilation.' },
  { id: 'reservoir', nom: 'Réservoir d’eau', hauteur: 1.5, largeur: 1.2, longueur: 1.2,
    aide: 'Le bidon sur le toit : très fréquent, et souvent oublié du relevé.' },
  { id: 'chauffe-eau', nom: 'Chauffe-eau solaire', hauteur: 1.6, largeur: 2, longueur: 1.5,
    aide: 'Capteur thermique et son ballon : il occupe ET il ombre.' },
  { id: 'mur', nom: 'Muret ou acrotère', hauteur: 1, largeur: 6, longueur: 0.2,
    aide: 'Le rebord d’une terrasse porte une ombre longue en hiver.' },
  { id: 'voisin', nom: 'Bâtiment voisin', hauteur: 6, largeur: 8, longueur: 8,
    aide: 'Un étage de plus à côté change tout un pan.' },
  { id: 'arbre', nom: 'Arbre', hauteur: 5, largeur: 4, longueur: 4,
    aide: 'Il pousse : la cote d’aujourd’hui ne vaudra pas dans dix ans.' },
  { id: 'antenne', nom: 'Antenne ou mât', hauteur: 3, largeur: 0.3, longueur: 0.3,
    aide: 'Fine, mais son ombre balaie le toit toute la journée.' },
  { id: 'autre', nom: 'Autre', hauteur: 1, largeur: 1, longueur: 1,
    aide: 'À décrire vous-même.' },
];

export const typeObstacle = (id) =>
  TYPES_OBSTACLE.find((t) => t.id === id) ?? TYPES_OBSTACLE[TYPES_OBSTACLE.length - 1];

/**
 * Normalise un obstacle déclaré.
 * @returns {object|null} `null` si les cotes ne tiennent pas debout — un
 *   obstacle sans hauteur ne porte aucune ombre, et le prétendre serait pire
 *   que de l'ignorer.
 */
export function obstacle(brut) {
  const x = nb(brut?.x);
  const y = nb(brut?.y);
  const h = nb(brut?.hauteur);
  if (x === null || y === null || h === null || h <= 0) return null;
  const t = typeObstacle(brut?.type);
  const l = nb(brut?.largeur) ?? t.largeur;
  const p = nb(brut?.longueur) ?? t.longueur;
  if (l <= 0 || p <= 0) return null;
  return {
    id: brut.id ?? `${t.id}-${Math.round(x * 100)}-${Math.round(y * 100)}`,
    type: t.id,
    nom: brut?.nom || t.nom,
    x,
    y,
    // La hauteur est comptée depuis la SURFACE DU TOIT, pas depuis le sol :
    // c'est ce qu'on mesure sur place, un mètre à la main sur le rampant.
    hauteur: h,
    largeur: l,
    longueur: p,
    // `sol` distingue ce qui est posé sur le toit de ce qui vient d'à côté.
    surLeToit: brut?.surLeToit !== false,
  };
}

/** L'empreinte au sol d'un obstacle, dans le repère métrique de la scène. */
export function empreinte(o) {
  if (!o) return [];
  const dl = o.largeur / 2;
  const dp = o.longueur / 2;
  return [
    { x: o.x - dl, y: o.y - dp },
    { x: o.x + dl, y: o.y - dp },
    { x: o.x + dl, y: o.y + dp },
    { x: o.x - dl, y: o.y + dp },
  ];
}

/**
 * L'ombre portée d'un obstacle sur le plan du toit.
 *
 * Chaque sommet du sommet de l'obstacle glisse le long du rayon solaire
 * jusqu'à rencontrer le plan. L'ombre est l'enveloppe de l'empreinte et de
 * cette projection : un obstacle bas ombre à côté de lui, un obstacle haut
 * ombre loin.
 *
 * @param {object} o l'obstacle
 * @param {object} soleil position du soleil
 * @param {(p:{x:number,y:number}) => number} hauteurDuToit cote du rampant
 * @returns {Array<{x:number,y:number}>} le contour de l'ombre, `[]` si le
 *   soleil est trop bas — une ombre infinie n'est pas une information.
 */
export function ombrePortee(o, soleil, hauteurDuToit) {
  if (!o || !soleil?.leve) return [];
  const v = versLeSoleil(soleil);
  if (!v || v.z <= 0.05) return [];

  const base = empreinte(o);
  const projete = base.map((p) => {
    const zSommet = hauteurDuToit(p) + o.hauteur;
    // On descend le long du rayon jusqu'au plan du toit. Le rampant n'étant
    // pas horizontal, on itère : deux passes suffisent largement à l'échelle
    // d'un toit, et une troisième ne déplace plus rien de mesurable.
    let q = { ...p };
    for (let i = 0; i < 3; i++) {
      const chute = zSommet - hauteurDuToit(q);
      if (chute <= 0) break;
      const t = chute / v.z;
      q = { x: p.x - v.x * t, y: p.y - v.y * t };
    }
    return q;
  });

  return enveloppeConvexe([...base, ...projete]);
}

/**
 * L'enveloppe convexe d'un nuage de points — parcours de Graham.
 *
 * L'ombre d'une boîte est convexe ; celle de son empreinte réunie à sa
 * projection l'est aussi. Prendre l'enveloppe évite de raisonner sur des
 * polygones croisés, et un contour croisé donnerait une aire d'ombre absurde.
 */
export function enveloppeConvexe(points) {
  const pts = [...(points ?? [])]
    .filter((p) => nb(p?.x) !== null && nb(p?.y) !== null)
    .sort((a, b) => (a.x - b.x) || (a.y - b.y));
  if (pts.length < 3) return pts;
  const croix = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const moitie = (liste) => {
    const pile = [];
    for (const p of liste) {
      while (pile.length >= 2 && croix(pile[pile.length - 2], pile[pile.length - 1], p) <= 0) {
        pile.pop();
      }
      pile.push(p);
    }
    pile.pop();
    return pile;
  };
  return [...moitie(pts), ...moitie([...pts].reverse())];
}

/**
 * DÉCOUPE UNE OMBRE SUR LE CONTOUR DU TOIT.
 *
 * Sans cela, l'ombre d'une cheminée proche du bord se prolonge dans le vide :
 * la scène affiche une tache sombre suspendue à côté du bâtiment, à la hauteur
 * du plan du toit prolongé. C'est faux, et surtout c'est faux d'une manière qui
 * se voit — donc qui fait douter de tout le reste.
 *
 * Algorithme de Sutherland-Hodgman. Il exige que la FENÊTRE de découpe soit
 * convexe : c'est le cas de l'ombre d'une boîte, jamais garanti pour un toit en
 * L. On découpe donc le toit PAR l'ombre plutôt que l'inverse — l'intersection
 * est la même, et elle reste juste sur un toit concave.
 *
 * @param {Array} toit le contour du pan
 * @param {Array} ombre l'ombre portée, convexe
 * @returns {Array} l'ombre effectivement posée sur le toit, `[]` si aucune
 */
export function decouperSurLeToit(toit, ombre) {
  const sujet = toit ?? [];
  const fenetre = ombre ?? [];
  if (sujet.length < 3 || fenetre.length < 3) return [];

  // Le sens de parcours de la fenêtre décide du côté « dedans ».
  let aire = 0;
  for (let i = 0; i < fenetre.length; i++) {
    const a = fenetre[i];
    const b = fenetre[(i + 1) % fenetre.length];
    aire += a.x * b.y - b.x * a.y;
  }
  const sens = aire >= 0 ? 1 : -1;
  const dedans = (p, a, b) =>
    ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) * sens >= -1e-12;

  const coupe = (a, b, c, d) => {
    const r = { x: b.x - a.x, y: b.y - a.y };
    const s = { x: d.x - c.x, y: d.y - c.y };
    const den = r.x * s.y - r.y * s.x;
    if (Math.abs(den) < 1e-15) return { ...a };
    const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
    return { x: a.x + r.x * t, y: a.y + r.y * t };
  };

  let sortie = [...sujet];
  for (let i = 0; i < fenetre.length && sortie.length; i++) {
    const a = fenetre[i];
    const b = fenetre[(i + 1) % fenetre.length];
    const entree = sortie;
    sortie = [];
    for (let j = 0; j < entree.length; j++) {
      const courant = entree[j];
      const precedent = entree[(j - 1 + entree.length) % entree.length];
      const courantDedans = dedans(courant, a, b);
      const precedentDedans = dedans(precedent, a, b);
      if (courantDedans) {
        if (!precedentDedans) sortie.push(coupe(precedent, courant, a, b));
        sortie.push(courant);
      } else if (precedentDedans) {
        sortie.push(coupe(precedent, courant, a, b));
      }
    }
  }
  return sortie.length >= 3 ? sortie : [];
}

/** Un module est-il touché par une ombre ? */
export function moduleTouche(module, ombres) {
  if (!module?.coins?.length) return false;
  for (const ombre of ombres) {
    if (ombre.length < 3) continue;
    // Un coin dans l'ombre suffit à considérer le module touché : sur une
    // chaîne série, une cellule masquée pénalise déjà tout le reste.
    for (const c of module.coins) if (pointDansPolygone(c, ombre)) return true;
    // Et le centre, pour l'ombre qui traverse le module sans toucher un coin.
    if (module.centre && pointDansPolygone(module.centre, ombre)) return true;
  }
  return false;
}

/**
 * L'état d'ombrage d'une implantation à un instant donné.
 *
 * @returns {object} toujours un objet, avec sa réserve — jamais un chiffre nu.
 */
export function ombrageInstantane({
  plan, obstacles = [], soleil, hauteurDuToit, contourToit = null,
} = {}) {
  const liste = (obstacles ?? []).map(obstacle).filter(Boolean);
  const total = plan?.modules?.length ?? 0;

  if (!soleil) {
    return { calculable: false, total, touches: 0, ombres: [],
      raison: 'Position du soleil inconnue : le lieu ou la date manque.' };
  }
  if (!soleil.leve) {
    return { calculable: true, total, touches: 0, ombres: [], soleil,
      raison: 'Le soleil est sous l’horizon, ou trop bas pour qu’une ombre '
        + 'ait un sens : rien à calculer à cette heure.' };
  }
  if (!liste.length) {
    return { calculable: true, total, touches: 0, ombres: [], soleil,
      // On ne dit PAS « aucun ombrage » : on dit qu'aucun obstacle n'a été
      // relevé. La nuance est tout l'écart entre une mesure et une absence.
      raison: 'Aucun obstacle n’a été relevé. Ce n’est pas la preuve qu’il n’y '
        + 'en a pas : c’est l’absence de relevé.' };
  }

  const cote = typeof hauteurDuToit === 'function' ? hauteurDuToit : () => 0;
  const ombres = liste
    .map((o) => {
      const brute = ombrePortee(o, soleil, cote);
      // Découpée sur le toit quand on connaît son contour : une ombre qui
      // déborde du bâtiment est une tache suspendue dans le vide.
      return contourToit?.length >= 3 ? decouperSurLeToit(contourToit, brute) : brute;
    })
    .filter((c) => c.length >= 3);
  const modules = plan?.modules ?? [];
  const touches = modules.filter((m) => moduleTouche(m, ombres));

  return {
    calculable: true,
    soleil,
    obstacles: liste,
    ombres,
    total,
    touches: touches.length,
    indices: touches.map((m) => modules.indexOf(m)),
    part: total ? touches.length / total : 0,
    raison: null,
  };
}

/**
 * La frise d'une journée : combien de modules touchés, heure par heure.
 *
 * C'est la seule façon honnête de montrer qu'un obstacle gêne le matin et plus
 * du tout l'après-midi. Un chiffre unique, lui, laisserait croire à une perte
 * permanente.
 */
export function friseJournee({
  plan, obstacles = [], latitude, longitude, date, pas = 0.5, hauteurDuToit,
  contourToit = null,
} = {}) {
  const heures = course({ latitude, longitude, date, pas })
    .filter((p) => p.hauteur > 0);
  return heures.map((s) => {
    const r = ombrageInstantane({ plan, obstacles, soleil: s, hauteurDuToit, contourToit });
    return {
      heure: s.heure,
      hauteur: s.hauteur,
      azimut: s.azimut,
      leve: s.leve,
      touches: r.touches,
      part: r.part ?? 0,
    };
  });
}

/**
 * Le résumé d'une journée : le pire moment, et la moyenne des heures utiles.
 *
 * « Heures utiles » = soleil à plus de dix degrés. En dessous, la production
 * est marginale et compter l'ombrage y gonflerait artificiellement le chiffre.
 */
export const HAUTEUR_UTILE = 10;

export function resumeJournee(frise) {
  const utiles = (frise ?? []).filter((p) => p.hauteur >= HAUTEUR_UTILE);
  if (!utiles.length) {
    return { heuresUtiles: 0, pire: null, moyenne: 0, jamaisTouche: true };
  }
  const pire = utiles.reduce((a, b) => (a.touches >= b.touches ? a : b));
  const moyenne = utiles.reduce((t, p) => t + p.part, 0) / utiles.length;
  return {
    heuresUtiles: utiles.length,
    pire: pire.touches > 0 ? pire : null,
    moyenne,
    jamaisTouche: utiles.every((p) => p.touches === 0),
  };
}

/**
 * La phrase qui accompagne tout résultat d'ombrage, sans exception.
 *
 * Elle n'est pas décorative : c'est elle qui empêche qu'une simulation
 * géométrique sur des cotes déclarées soit lue comme un relevé.
 */
export function reserve({ obstacles = [], etalonne = false } = {}) {
  const n = (obstacles ?? []).length;
  if (!n) {
    return 'Aucun obstacle relevé : l’ombrage n’est pas calculé. L’absence de '
      + 'relevé n’est pas une absence d’ombre.';
  }
  return `Ombrage simulé à partir de ${n} obstacle${n > 1 ? 's' : ''} que vous avez `
    + 'déclaré' + (n > 1 ? 's' : '') + ', avec leurs cotes telles que saisies. '
    + 'C’est une simulation géométrique, pas une mesure : une hauteur estimée à '
    + '20 cm près décale l’ombre d’autant. '
    + (etalonne ? 'L’échelle du tracé a été corrigée par votre relevé sur place. ' : '')
    + 'Une vérification sur site reste nécessaire.';
}

export { DATES, dateRepere, position };
