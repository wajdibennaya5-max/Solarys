/**
 * POSER DE VRAIS MODULES SUR LE TOIT RÉELLEMENT TRACÉ.
 *
 * POURQUOI CE FICHIER EXISTE, À CÔTÉ DE `calepinage.js`.
 *
 * `calepinage.js` remplit un rectangle. C'est exactement ce qu'il faut quand on
 * ne connaît du toit que deux cotes, et il reste le calcul de référence du
 * projet. Mais depuis que le toit se trace, on connaît sa vraie forme — et un
 * toit en L rempli comme un rectangle annonce des modules posés dans le vide.
 *
 * Ici, la grille est découpée sur le contour : un module n'est retenu que s'il
 * tient ENTIÈREMENT dans le pan, retrait de rive compris.
 *
 * LE PIÈGE DE LA PENTE. Un module posé sur un rampant à 30° n'occupe, vu du
 * ciel, que 87 % de sa longueur. Poser la grille sur l'emprise au sol
 * reviendrait à croire qu'il rentre 15 % de modules en moins qu'en réalité.
 * On travaille donc DANS LE PLAN DU TOIT, et l'on redescend ensuite.
 *
 * Aucun accès au réseau ni à la page : uniquement du calcul.
 */
import { RIVE, JEU, MODULE } from './calepinage.js';

function nb(v) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const rad = (d) => (Number(d) || 0) * Math.PI / 180;

/**
 * Ce point est-il dans le polygone ? Lancer de rayon.
 *
 * Un point exactement sur une arête est ambigu par nature ; il n'y en a
 * jamais dans une grille posée au hasard sur un contour tracé à la main, et
 * les retraits de rive écartent le cas de toute façon.
 */
export function pointDansPolygone(p, sommets) {
  const pts = sommets ?? [];
  if (pts.length < 3) return false;
  let dedans = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    const traverse = (a.y > p.y) !== (b.y > p.y);
    if (traverse && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) dedans = !dedans;
  }
  return dedans;
}

/** Deux segments se croisent-ils vraiment ? */
function segmentsSeCroisent(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-12) return false;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/**
 * Ce rectangle tient-il entièrement dans le polygone ?
 *
 * Les quatre coins dedans ne suffisent pas : sur un toit en L, un module peut
 * enjamber le creux, coins compris, et se retrouver posé sur le vide. Il faut
 * aussi qu'aucun de ses côtés ne coupe le contour.
 */
export function rectangleDansPolygone(coins, sommets) {
  if (!coins?.length || !sommets?.length) return false;
  for (const c of coins) if (!pointDansPolygone(c, sommets)) return false;
  for (let i = 0; i < coins.length; i++) {
    const a = coins[i];
    const b = coins[(i + 1) % coins.length];
    for (let j = 0; j < sommets.length; j++) {
      const c = sommets[j];
      const d = sommets[(j + 1) % sommets.length];
      if (segmentsSeCroisent(a, b, c, d)) return false;
    }
  }
  return true;
}

/**
 * Rétrécit un polygone vers l'intérieur, d'une distance donnée.
 *
 * LE RETRAIT DE RIVE N'EST PAS UN ORNEMENT : un module posé au ras du bord
 * s'arrache au premier coup de vent, et aucun couvreur ne l'accepterait. Le
 * rétrécissement se fait par déplacement de chaque sommet le long de sa
 * bissectrice — approximation qui suffit pour des retraits de quelques
 * dizaines de centimètres sur des toits de quelques dizaines de mètres.
 *
 * @returns {Array} le contour rétréci, ou `[]` si le retrait le fait
 *   disparaître — un pan plus petit que ses rives ne porte aucun module,
 *   et c'est la vérité qu'il faut dire.
 */
export function retirerRive(sommets, distance) {
  const pts = sommets ?? [];
  const d = nb(distance) ?? 0;
  if (pts.length < 3) return [];
  if (d <= 0) return [...pts];

  // Le sens de parcours décide de quel côté est « l'intérieur ».
  let aire = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    aire += a.x * b.y - b.x * a.y;
  }
  const sens = aire >= 0 ? 1 : -1;

  const rentre = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const avant = pts[(i - 1 + pts.length) % pts.length];
    const apres = pts[(i + 1) % pts.length];

    const n1 = normaleInterieure(avant, p, sens);
    const n2 = normaleInterieure(p, apres, sens);
    const somme = { x: n1.x + n2.x, y: n1.y + n2.y };
    const norme = Math.hypot(somme.x, somme.y);
    if (norme < 1e-9) { rentre.push({ ...p }); continue; }
    // Le sommet se déplace le long de la bissectrice. Pour que les DEUX côtés
    // reculent bien de `d`, il faut avancer de `d / cos(demi-angle)` — et la
    // demi-norme de la somme des deux normales unitaires vaut exactement ce
    // cosinus. Sur un angle droit, cela donne d√2, ce qu'on vérifie en test.
    const pas = d / (norme / 2);
    rentre.push({ x: p.x + (somme.x / norme) * pas, y: p.y + (somme.y / norme) * pas });
  }

  // UN RETRAIT TROP GRAND RETOURNE LE POLYGONE, ET NI L'AIRE NI LE SENS DE
  // PARCOURS NE S'EN APERÇOIVENT.
  //
  // Sur un carré, reculer chaque coin au-delà du centre les fait tous basculer
  // ensemble : c'est une rotation d'un demi-tour, qui conserve le sens de
  // parcours. Un carré de 2 m rétréci de 3 m redonnait un carré de 4 m — plus
  // grand que l'original, du bon signe — sur lequel on aurait implanté des
  // modules dans le vide. Et rétréci de 1,5 m il redonnait un carré de 1 m,
  // plus petit ET contenu dans l'original : les deux contrôles évidents
  // passaient tous les deux.
  //
  // Le seul critère qui tienne est celui qu'on a demandé : chaque sommet
  // rentré doit se trouver à AU MOINS `d` du bord d'origine. Exact sur un
  // polygone convexe, prudent sur un polygone concave — et dans le doute,
  // refuser vaut mieux que poser des panneaux dans le vide.
  let aire2 = 0;
  for (let i = 0; i < rentre.length; i++) {
    const a = rentre[i];
    const b = rentre[(i + 1) % rentre.length];
    aire2 += a.x * b.y - b.x * a.y;
  }
  if (Math.abs(aire2) < 1e-6 || Math.abs(aire2) >= Math.abs(aire)) return [];
  for (const q of rentre) {
    if (!pointDansPolygone(q, pts)) return [];
    if (distanceAuBord(q, pts) < d * 0.999) return [];
  }
  return rentre;
}

/** La distance d'un point au bord d'un polygone — le plus proche des côtés. */
export function distanceAuBord(p, sommets) {
  const pts = sommets ?? [];
  if (pts.length < 2) return Infinity;
  let mini = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const carre = dx * dx + dy * dy;
    // Un côté de longueur nulle se réduit à son point de départ.
    const t = carre < 1e-18 ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / carre));
    mini = Math.min(mini, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return mini;
}

/** La normale d'un côté, tournée vers l'intérieur du polygone. */
function normaleInterieure(a, b, sens) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const n = Math.hypot(dx, dy);
  if (n < 1e-12) return { x: 0, y: 0 };
  return { x: (-dy / n) * sens, y: (dx / n) * sens };
}

/**
 * Implante des modules sur un contour de toiture.
 *
 * @param {Array<{x:number,y:number}>} contour en mètres, emprise au sol
 * @param {object} o
 * @param {object} [o.module] du catalogue ; à défaut le module de référence
 * @param {'auto'|'portrait'|'paysage'} [o.pose]
 * @param {number} [o.pente] en degrés
 * @param {number} [o.azimut] orientation du pan, 0 = plein sud
 * @param {number} [o.rive] retrait de bord, en mètres
 * @param {number} [o.jeu] espace entre modules
 * @returns {object} toujours un objet : un pan qui ne porte rien dit pourquoi
 */
export function implanter(contour, {
  module: mod = null, pose = 'auto', pente = 0, azimut = 0,
  rive = RIVE, jeu = JEU,
} = {}) {
  const pts = (contour ?? []).filter((p) => nb(p?.x) !== null && nb(p?.y) !== null);
  const M = mod
    ? { largeur: mod.largeur, hauteur: mod.hauteur, puissance: mod.puissance / 1000 }
    : MODULE;

  const vide = (raison) => ({
    modules: [], nombre: 0, puissance: 0, colonnes: 0, rangees: 0,
    orientation: null, surfaceUtilisee: 0, tauxOccupation: 0,
    module: mod, rive, jeu, pente: nb(pente) ?? 0, raison,
  });

  if (pts.length < 3) return vide('Le contour du toit n’est pas encore tracé.');

  const zone = retirerRive(pts, rive);
  if (zone.length < 3) {
    return vide(`Après le retrait de rive de ${rive} m sur tout le pourtour, `
      + 'il ne reste plus de surface posable. Ce pan est trop petit.');
  }

  // On travaille dans le repère du toit : `u` en travers de la pente, `v` dans
  // le sens de la pente. Les distances en `v` sont ensuite dilatées par la
  // pente, parce qu'un rampant est plus long que son ombre au sol.
  const theta = rad((nb(azimut) ?? 0) + 180);
  const versV = { x: Math.sin(theta), y: Math.cos(theta) };
  const versU = { x: versV.y, y: -versV.x };
  const cos = Math.cos(rad(Math.min(80, Math.max(0, nb(pente) ?? 0))));
  const dilate = cos > 0.05 ? 1 / cos : 1;

  const enPlan = (u, v) => ({
    x: versU.x * u + versV.x * v * cos,
    y: versU.y * u + versV.y * v * cos,
  });
  const enToit = (p) => ({
    u: p.x * versU.x + p.y * versU.y,
    v: (p.x * versV.x + p.y * versV.y) * dilate,
  });

  const zoneToit = zone.map(enToit);
  const us = zoneToit.map((p) => p.u);
  const vs = zoneToit.map((p) => p.v);
  const uMin = Math.min(...us);
  const vMin = Math.min(...vs);
  const largeurUtile = Math.max(...us) - uMin;
  const hauteurUtile = Math.max(...vs) - vMin;

  const essai = (l, h, nom) => {
    const colonnes = Math.max(0, Math.floor((largeurUtile + jeu) / (l + jeu)));
    const rangees = Math.max(0, Math.floor((hauteurUtile + jeu) / (h + jeu)));
    if (!colonnes || !rangees) return { nom, l, h, modules: [], colonnes: 0, rangees: 0 };

    // On centre la grille dans l'emprise : une grille collée dans un coin
    // perd des modules du côté opposé sur un toit qui n'est pas rectangulaire.
    const u0 = uMin + (largeurUtile - (colonnes * l + (colonnes - 1) * jeu)) / 2;
    const v0 = vMin + (hauteurUtile - (rangees * h + (rangees - 1) * jeu)) / 2;

    const modules = [];
    const colonnesTenues = new Set();
    const rangeesTenues = new Set();
    for (let r = 0; r < rangees; r++) {
      for (let c = 0; c < colonnes; c++) {
        const u = u0 + c * (l + jeu);
        const v = v0 + r * (h + jeu);
        // Le module est jugé DANS LE PLAN DU TOIT, puis redescendu au sol :
        // le tester au sol l'aurait rétréci de la pente et en aurait fait
        // entrer davantage qu'il n'en tient vraiment.
        const coinsToit = [{ u, v }, { u: u + l, v }, { u: u + l, v: v + h }, { u, v: v + h }];
        const coins = coinsToit.map((q) => enPlan(q.u, q.v));
        if (!rectangleDansPolygone(coins, zone)) continue;
        colonnesTenues.add(c);
        rangeesTenues.add(r);
        modules.push({
          coins,
          centre: enPlan(u + l / 2, v + h / 2),
          u, v, l, h,
          colonne: c, rangee: r,
        });
      }
    }
    return { nom, l, h, modules,
      colonnes: colonnesTenues.size, rangees: rangeesTenues.size };
  };

  const portrait = essai(M.largeur, M.hauteur, 'portrait');
  const paysage = essai(M.hauteur, M.largeur, 'paysage');
  // Une pose imposée est respectée telle quelle : c'est parfois la contrainte
  // du toit, et le professionnel sait pourquoi il l'impose.
  const retenu = pose === 'portrait' ? portrait
    : pose === 'paysage' ? paysage
      : (paysage.modules.length > portrait.modules.length ? paysage : portrait);

  if (!retenu.modules.length) {
    return vide('Aucun module ne tient entièrement dans ce pan, retrait de rive '
      + 'compris. Un pan plus grand, un module plus petit ou une rive plus '
      + 'faible changeraient ce résultat.');
  }

  const nombre = retenu.modules.length;
  // La surface du rampant, pas celle de l'emprise : c'est sur le rampant que
  // les modules sont posés.
  const surfaceRampant = airePolygone(pts) * dilate;
  const surfacePosee = nombre * M.largeur * M.hauteur;

  return {
    modules: retenu.modules,
    nombre,
    colonnes: retenu.colonnes,
    rangees: retenu.rangees,
    orientation: retenu.nom,
    puissance: Math.round(nombre * M.puissance * 100) / 100,
    surfaceUtilisee: surfacePosee,
    surfaceRampant,
    surfaceRestante: Math.max(0, surfaceRampant - surfacePosee),
    tauxOccupation: surfaceRampant > 0 ? surfacePosee / surfaceRampant : 0,
    module: mod,
    rive,
    jeu,
    pente: nb(pente) ?? 0,
    azimut: nb(azimut) ?? 0,
    // Ce que l'autre pose aurait donné : imposer une pose a un coût, dis-le.
    alternative: pose === 'auto' ? null
      : (pose === 'portrait' ? paysage.modules.length : portrait.modules.length),
    raison: null,
  };
}

/** L'aire d'un polygone métrique — formule du lacet. */
export function airePolygone(sommets) {
  const pts = sommets ?? [];
  if (pts.length < 3) return 0;
  let somme = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    somme += a.x * b.y - b.x * a.y;
  }
  return Math.abs(somme) / 2;
}

/**
 * Élève les modules sur le plan du toit, pour la scène en volume.
 *
 * Chaque module devient une face à sa vraie hauteur. Les poser à plat sur le
 * sol donnerait un champ qui traverse le bâtiment.
 */
export function eleverModules(plan, toit) {
  if (!plan?.modules?.length || !toit?.sommets?.length) return [];
  // L'équation du plan du toit, tirée de trois de ses sommets.
  const [a, b, c] = toit.sommets;
  const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const v = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
  const n = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
  if (Math.abs(n.z) < 1e-9) return [];
  const hauteur = (p) => a.z - (n.x * (p.x - a.x) + n.y * (p.y - a.y)) / n.z;

  const normale = toit.normale ?? { x: 0, y: 0, z: 1 };
  return plan.modules.map((m, i) => ({
    role: 'module',
    nom: `Module ${i + 1}`,
    index: i,
    // Deux centimètres au-dessus du rampant : sinon le module et le toit se
    // disputent les mêmes pixels et clignotent.
    sommets: m.coins.map((p) => ({ x: p.x, y: p.y, z: hauteur(p) + 0.02 })),
    normale,
  }));
}
