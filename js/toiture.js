/**
 * MESURER UN TOIT À PARTIR D'UN TRACÉ.
 *
 * POURQUOI CE FICHIER EXISTE. Le projet demandait deux cotes — longueur et
 * profondeur — et en déduisait un rectangle. Un toit tunisien réel est
 * rarement rectangulaire : il a un décroché, une terrasse, un pan coupé. Et
 * surtout, personne ne connaît ses cotes par cœur, alors qu'on sait très bien
 * suivre le bord de sa maison du doigt sur une image.
 *
 * CE QUE CE FICHIER SAIT, ET CE QU'IL NE SAIT PAS.
 *
 * Il sait convertir un polygone géographique en mètres carrés, en périmètre,
 * en longueurs de côtés et en orientations, avec la rigueur qu'on attend d'un
 * calcul. Il ne sait pas si le tracé suit vraiment le bord du toit : cela
 * dépend de l'image, de sa date, du soin de l'utilisateur et du décalage de
 * la prise de vue. **Toute valeur qui sort d'ici est une estimation**, et le
 * projet l'écrit partout où elle s'affiche.
 *
 * LE PIÈGE QUI COÛTE LE PLUS CHER : un tracé sur une image donne la surface
 * VUE DU CIEL, c'est-à-dire la projection horizontale. Un toit à 30° porte
 * 15 % de surface de plus que son emprise au sol. Confondre les deux fausse
 * le nombre de panneaux, donc la puissance, donc toute l'étude.
 *
 * Aucun accès au réseau ni à la page : uniquement du calcul.
 */
import { METRES_PAR_DEGRE_LAT, metresParDegreLon } from './localisation.js';

/** Un nombre, ou rien — `Number(null)` vaut zéro, et zéro n'est pas « rien ». */
function nb(v) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Un sommet exploitable ? */
export const sommetValide = (s) =>
  nb(s?.latitude) !== null && nb(s?.longitude) !== null;

/**
 * Projette des sommets géographiques dans un plan métrique local.
 *
 * À l'échelle d'un bâtiment, la Terre est plate : une projection
 * équirectangulaire centrée sur le tracé donne des mètres justes à bien mieux
 * que le centimètre. C'est la latitude moyenne qui sert de référence — la
 * prendre ailleurs introduirait une erreur d'échelle sur la longitude.
 */
export function projeter(sommets) {
  const bons = (sommets ?? []).filter(sommetValide);
  if (!bons.length) return { points: [], origine: null };
  const latMoy = bons.reduce((t, s) => t + Number(s.latitude), 0) / bons.length;
  const lonMoy = bons.reduce((t, s) => t + Number(s.longitude), 0) / bons.length;
  const parLon = metresParDegreLon(latMoy);
  return {
    origine: { latitude: latMoy, longitude: lonMoy },
    points: bons.map((s) => ({
      x: (Number(s.longitude) - lonMoy) * parLon,
      y: (Number(s.latitude) - latMoy) * METRES_PAR_DEGRE_LAT,
    })),
  };
}

/** L'opération inverse : un point métrique local redevient géographique. */
export function deprojeter(origine, { x, y }) {
  return {
    latitude: origine.latitude + y / METRES_PAR_DEGRE_LAT,
    longitude: origine.longitude + x / metresParDegreLon(origine.latitude),
  };
}

/**
 * L'aire d'un polygone, en mètres carrés — vue du ciel.
 *
 * Formule du lacet, en valeur absolue : le sens de parcours n'a pas à changer
 * le résultat, et personne ne dessine dans un sens convenu.
 *
 * @returns {number} 0 pour moins de trois sommets : une ligne n'a pas d'aire.
 */
export function aireProjetee(sommets) {
  const { points } = projeter(sommets);
  if (points.length < 3) return 0;
  let somme = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    somme += a.x * b.y - b.x * a.y;
  }
  return Math.abs(somme) / 2;
}

/**
 * LA SURFACE RÉELLE DU RAMPANT, pente comprise.
 *
 * C'est la valeur qui compte pour poser des panneaux : un toit à 30° porte
 * 15 % de surface de plus que son emprise vue du ciel. La confusion entre les
 * deux se paie en modules manquants sur le calepinage et en puissance annoncée
 * qui ne rentre pas.
 *
 * @param {number} penteDegres 0 pour une terrasse plate
 */
export function surfaceRampant(sommets, penteDegres = 0) {
  const projetee = aireProjetee(sommets);
  const p = nb(penteDegres);
  if (p === null || p <= 0) return projetee;
  // Au-delà de 80°, c'est un mur : le cosinus filerait vers l'infini et
  // produirait une surface absurde présentée comme un résultat.
  const borne = Math.min(80, p);
  return projetee / Math.cos(borne * Math.PI / 180);
}

/** Le périmètre du tracé, en mètres. */
export function perimetre(sommets, { ferme = true } = {}) {
  const { points } = projeter(sommets);
  if (points.length < 2) return 0;
  let total = 0;
  const dernier = ferme ? points.length : points.length - 1;
  for (let i = 0; i < dernier; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

/**
 * L'azimut d'un segment, en degrés depuis le nord, dans le sens horaire.
 * C'est la convention du compas, celle que tout le monde lit.
 */
export function capSegment(a, b) {
  const { points } = projeter([a, b]);
  if (points.length < 2) return null;
  const dx = points[1].x - points[0].x;
  const dy = points[1].y - points[0].y;
  if (dx === 0 && dy === 0) return null;
  return (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
}

/**
 * L'azimut d'un pan, dans la convention du projet : **0 = plein sud**,
 * négatif vers l'est, positif vers l'ouest.
 *
 * C'est la convention de PVGIS et celle de `pvgis/parametres.js`. En mélanger
 * deux dans un même projet produit des toits orientés au nord qui reçoivent
 * l'ensoleillement du sud, et personne ne s'en aperçoit avant le chantier.
 */
export function azimutSolaire(capDepuisNord) {
  const c = nb(capDepuisNord);
  if (c === null) return null;
  let a = (c - 180) % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  // Plein nord vaut +180 et non -180 : c'est l'écriture de la table
  // `AZIMUTS` du projet, et deux écritures du même cap finiraient par être
  // comparées entre elles.
  return a === -0 ? 0 : a;
}

/** Les seize points cardinaux, pour écrire un cap en français. */
const ROSE = ['nord', 'nord-nord-est', 'nord-est', 'est-nord-est', 'est',
  'est-sud-est', 'sud-est', 'sud-sud-est', 'sud', 'sud-sud-ouest', 'sud-ouest',
  'ouest-sud-ouest', 'ouest', 'ouest-nord-ouest', 'nord-ouest', 'nord-nord-ouest'];

/** Un cap, en français. */
export function capEnClair(capDepuisNord) {
  const c = nb(capDepuisNord);
  if (c === null) return null;
  return ROSE[Math.round(((c % 360) + 360) % 360 / 22.5) % 16];
}

/**
 * Chaque côté du tracé, avec sa longueur et son orientation.
 *
 * Le professionnel lit ces cotes pour vérifier le tracé contre ce qu'il voit :
 * une façade de 8,4 m qui sort à 14 m signale que l'échelle est fausse, bien
 * avant que l'erreur atteigne le nombre de panneaux.
 */
export function cotes(sommets) {
  const bons = (sommets ?? []).filter(sommetValide);
  if (bons.length < 2) return [];
  const { points } = projeter(bons);
  const liste = [];
  for (let i = 0; i < bons.length; i++) {
    const j = (i + 1) % bons.length;
    if (j === 0 && bons.length < 3) break;
    const longueur = Math.hypot(points[j].x - points[i].x, points[j].y - points[i].y);
    const cap = capSegment(bons[i], bons[j]);
    liste.push({
      index: i,
      de: bons[i],
      vers: bons[j],
      longueur,
      cap,
      capEnClair: capEnClair(cap),
    });
  }
  return liste;
}

/** Le centre du tracé, pour y poser un repère ou une cote. */
export function centre(sommets) {
  const { points, origine } = projeter(sommets);
  if (!origine || points.length === 0) return null;
  if (points.length < 3) {
    const m = points.reduce((t, p) => ({ x: t.x + p.x / points.length,
      y: t.y + p.y / points.length }), { x: 0, y: 0 });
    return deprojeter(origine, m);
  }
  // Le centre de gravité de la surface, pas la moyenne des sommets : sur un
  // toit en L, la moyenne des sommets tombe parfois hors du toit.
  let a = 0; let cx = 0; let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    const f = p.x * q.y - q.x * p.y;
    a += f;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  if (a === 0) return deprojeter(origine, points[0]);
  return deprojeter(origine, { x: cx / (3 * a), y: cy / (3 * a) });
}

/** Deux segments se croisent-ils ailleurs qu'à leurs extrémités partagées ? */
function seCroisent(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-12) return false;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  const marge = 1e-9;
  return t > marge && t < 1 - marge && u > marge && u < 1 - marge;
}

/**
 * Le tracé se recoupe-t-il ?
 *
 * Un polygone en nœud papillon a une aire mathématiquement définie et
 * physiquement absurde : les deux boucles se soustraient. Sans ce contrôle, un
 * tracé raté rendrait une surface plus petite que la vraie, sans rien dire.
 */
export function seRecoupe(sommets) {
  const { points } = projeter(sommets);
  const n = points.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Les côtés voisins partagent un sommet : ce n'est pas un croisement.
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      if (seCroisent(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n])) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Ce qui empêche d'exploiter un tracé, dit en clair.
 *
 * Séparé du calcul pour une raison précise : l'interface doit pouvoir dire
 * pourquoi elle refuse, et pas seulement refuser.
 *
 * @returns {{cle:string, message:string}|null} `null` si le tracé tient debout
 */
export function verifierTrace(sommets, { surfaceMin = 4, surfaceMax = 20000 } = {}) {
  const bons = (sommets ?? []).filter(sommetValide);
  if (bons.length < 3) {
    return { cle: 'incomplet',
      message: 'Un pan de toiture demande au moins trois points. Continuez le tracé.' };
  }
  if (seRecoupe(bons)) {
    return { cle: 'croise',
      message: 'Le tracé se recoupe : la surface calculée n’aurait aucun sens. '
        + 'Reprenez le contour sans croiser les côtés.' };
  }
  const aire = aireProjetee(bons);
  if (aire < surfaceMin) {
    return { cle: 'minuscule',
      message: `Ce tracé fait ${aire.toFixed(1)} m² vue du ciel : trop peu pour un pan `
        + 'de toiture. Vérifiez le zoom de la carte avant de retracer.' };
  }
  if (aire > surfaceMax) {
    return { cle: 'immense',
      message: `Ce tracé fait ${Math.round(aire)} m² : c’est l’échelle d’un quartier, `
        + 'pas d’un bâtiment. Vérifiez que le contour suit bien un seul toit.' };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Étalonnage : corriger l'échelle quand l'image ment                  */
/* ------------------------------------------------------------------ */

/**
 * L'ÉTALONNAGE MANUEL, et pourquoi il est indispensable.
 *
 * Une image aérienne n'est pas une carte au cordeau. La prise de vue est
 * oblique, le relief déplace les points, le géoréférencement a sa propre
 * erreur. Résultat : deux mètres tracés à l'écran peuvent en valoir deux et
 * dix. C'est peu — et cela suffit à décaler une rangée de panneaux.
 *
 * Le remède est celui des géomètres : mesurer sur place une longueur connue,
 * la retracer sur l'image, et corriger l'échelle du rapport constaté. Le
 * facteur reste **visible** : une correction cachée serait pire que pas de
 * correction du tout.
 *
 * On refuse au-delà de ±40 % : à ce point, ce n'est plus une image imprécise,
 * c'est un tracé qui ne suit pas la même chose que la mesure. Corriger
 * silencieusement masquerait une erreur bien plus grave.
 */
export const ETALONNAGE_MAX = 1.4;
export const ETALONNAGE_MIN = 1 / ETALONNAGE_MAX;

/**
 * Calcule un facteur d'échelle depuis une référence mesurée sur place.
 *
 * @param {number} longueurTracee ce que le tracé donne, en mètres
 * @param {number} longueurReelle ce que le mètre ruban donne, en mètres
 * @returns {{ok:true, facteur:number, ecart:number, message:string}
 *   |{ok:false, cle:string, message:string}}
 */
export function etalonner(longueurTracee, longueurReelle) {
  const tracee = nb(longueurTracee);
  const reelle = nb(longueurReelle);
  if (tracee === null || tracee <= 0) {
    return { ok: false, cle: 'sansTrace',
      message: 'Tracez d’abord la longueur de référence sur l’image.' };
  }
  if (reelle === null || reelle <= 0) {
    return { ok: false, cle: 'sansMesure',
      message: 'Indiquez la longueur réelle mesurée sur place, en mètres.' };
  }
  const facteur = reelle / tracee;
  if (facteur > ETALONNAGE_MAX || facteur < ETALONNAGE_MIN) {
    const pourcent = Math.round((facteur - 1) * 100);
    return { ok: false, cle: 'invraisemblable',
      message: `L’écart atteint ${pourcent > 0 ? '+' : ''}${pourcent} %. Ce n’est plus `
        + 'une imprécision d’image : vérifiez que le tracé et la mesure portent bien '
        + 'sur la même longueur.' };
  }
  const ecart = Math.round((facteur - 1) * 100);
  return {
    ok: true,
    facteur,
    ecart,
    message: ecart === 0
      ? 'L’image était déjà à l’échelle : aucune correction appliquée.'
      : `Échelle corrigée de ${ecart > 0 ? '+' : ''}${ecart} % d’après votre mesure `
        + `de ${reelle} m sur place.`,
  };
}

/**
 * Les mesures d'un pan, prêtes à afficher — et honnêtes sur leur nature.
 *
 * `facteur` applique l'étalonnage. Il porte sur les LONGUEURS : les surfaces
 * varient donc en son carré. L'oublier appliquerait une correction deux fois
 * trop faible sur les mètres carrés, c'est-à-dire sur le nombre de panneaux.
 *
 * @returns {object} toujours un objet : un tracé impossible rend ses raisons,
 *   jamais `null` — l'interface doit pouvoir dire pourquoi.
 */
export function mesurer(sommets, { pente = 0, facteur = 1, etalonne = false } = {}) {
  const bons = (sommets ?? []).filter(sommetValide);
  const f = nb(facteur);
  const k = f !== null && f >= ETALONNAGE_MIN && f <= ETALONNAGE_MAX ? f : 1;
  const probleme = verifierTrace(bons);

  const projetee = aireProjetee(bons) * k * k;
  const p = nb(pente) ?? 0;
  const rampant = surfaceRampant(bons, p) * k * k;
  const listeCotes = cotes(bons).map((c) => ({ ...c, longueur: c.longueur * k }));
  const plusLong = listeCotes.reduce((m, c) => (!m || c.longueur > m.longueur ? c : m), null);

  return {
    exploitable: probleme === null,
    probleme,
    sommets: bons,
    points: bons.length,
    surfaceProjetee: projetee,
    surfaceRampant: rampant,
    // Le supplément dû à la pente, isolé : c'est lui qu'on oublie, autant le
    // montrer plutôt que de le noyer dans un total.
    supplementPente: rampant - projetee,
    perimetre: perimetre(bons) * k,
    cotes: listeCotes,
    faitageProbable: plusLong,
    centre: centre(bons),
    facteur: k,
    etalonne: Boolean(etalonne) && k !== 1,
    pente: p,
    // LA PHRASE QUI NE DOIT JAMAIS DISPARAÎTRE. Une surface tracée sur une
    // image est une estimation, quelle que soit la qualité du tracé.
    reserve: etalonne && k !== 1
      ? 'Mesure estimée à partir de la carte, corrigée par votre relevé sur place. '
        + 'Une vérification sur site reste recommandée.'
      : 'Mesure estimée à partir de la carte. Une vérification sur site est recommandée.',
  };
}

/**
 * L'écart angulaire le plus court entre deux azimuts, en degrés.
 *
 * Le `+540` avant le modulo n'est pas une coquetterie : le reste d'un nombre
 * négatif est négatif en JavaScript, et sans lui la fonction rend
 * systématiquement l'écart complémentaire. Un pan plein sud ressort alors
 * plein nord — ce qui est exactement arrivé avant que ce calcul quitte le
 * contrôleur pour venir ici, sous test.
 */
export function ecartAngulaire(a, b) {
  const x = nb(a);
  const y = nb(b);
  if (x === null || y === null) return null;
  return Math.abs(((x - y + 540) % 360) - 180);
}

/**
 * L'orientation d'une table qui colle le mieux à un azimut mesuré.
 *
 * Le formulaire ne connaît que huit directions ; le tracé, lui, donne un angle
 * exact. On retient la plus proche, et l'appelant garde l'angle exact.
 *
 * @param {number} azimut convention du projet : 0 = plein sud
 * @param {Record<string, number>} table identifiants → azimuts
 * @returns {{id:string, ecart:number}|null}
 */
export function orientationLaPlusProche(azimut, table) {
  const az = nb(azimut);
  if (az === null || !table) return null;
  let meilleur = null;
  for (const [id, cible] of Object.entries(table)) {
    const d = ecartAngulaire(az, cible);
    if (d === null) continue;
    if (!meilleur || d < meilleur.ecart) meilleur = { id, ecart: d };
  }
  return meilleur;
}

/**
 * L'azimut probable du pan, déduit de son côté le plus long.
 *
 * Le côté le plus long d'un toit est le plus souvent le faîtage ou l'égout :
 * le pan regarde perpendiculairement. C'est une **déduction**, pas une mesure,
 * et le nom de la fonction le dit comme le champ qui la porte.
 *
 * @returns {number|null} `null` quand aucun côté ne permet de trancher
 */
export function azimutProbableDuPan(mesures) {
  const cote = mesures?.faitageProbable;
  if (!cote || cote.cap === null || cote.cap === undefined) return null;
  return azimutSolaire((cote.cap + 90) % 360);
}
