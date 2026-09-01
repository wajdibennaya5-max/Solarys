/**
 * Géométrie plane — le socle du calepinage.
 *
 * Convention : un polygone est un tableau de points `{x, y}` exprimés en
 * MÈTRES dans le plan de la surface considérée. Pour une toiture inclinée, ce
 * plan est celui de la couverture : les longueurs sont donc vraies, sans
 * projection. Pour une toiture-terrasse ou une centrale au sol, le plan est
 * horizontal et l'inclinaison des modules est portée par les structures.
 *
 * Aucune dépendance : ces fonctions sont testables sans navigateur.
 */

const EPS = 1e-9;

/* ------------------------------------------------------------------ */
/* Mesures                                                             */
/* ------------------------------------------------------------------ */

/**
 * Aire algébrique (formule du lacet). Positive si le polygone est parcouru
 * dans le sens trigonométrique, négative sinon.
 */
export function signedArea(poly) {
  let s = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** Aire, toujours positive. */
export const area = (poly) => Math.abs(signedArea(poly));

/** Le polygone est-il parcouru dans le sens trigonométrique ? */
export const isCounterClockwise = (poly) => signedArea(poly) > 0;

/** Renvoie le polygone dans le sens trigonométrique. */
export const toCounterClockwise = (poly) =>
  (isCounterClockwise(poly) ? poly.slice() : poly.slice().reverse());

/** Centre de gravité de la surface. */
export function centroid(poly) {
  const a = signedArea(poly);
  if (Math.abs(a) < EPS) {
    // Polygone dégénéré : on retombe sur la moyenne des sommets.
    const n = poly.length || 1;
    return {
      x: poly.reduce((s, p) => s + p.x, 0) / n,
      y: poly.reduce((s, p) => s + p.y, 0) / n,
    };
  }
  let cx = 0, cy = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

/** Rectangle englobant. */
export function bbox(poly) {
  const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/** Périmètre. */
export function perimeter(poly) {
  let s = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    s += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return s;
}

/* ------------------------------------------------------------------ */
/* Transformations                                                     */
/* ------------------------------------------------------------------ */

/** Rotation d'un point autour d'un centre, angle en radians. */
export function rotatePoint(p, angle, about = { x: 0, y: 0 }) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const dx = p.x - about.x, dy = p.y - about.y;
  return { x: about.x + dx * c - dy * s, y: about.y + dx * s + dy * c };
}

/** Rotation d'un polygone. */
export const rotate = (poly, angle, about) => poly.map((p) => rotatePoint(p, angle, about));

/** Translation d'un polygone. */
export const translate = (poly, dx, dy) => poly.map((p) => ({ x: p.x + dx, y: p.y + dy }));

/**
 * Rectangle sous forme de polygone, défini par son coin bas-gauche avant
 * rotation. L'angle est en radians, autour de ce même coin.
 */
export function rectangle(x, y, w, h, angle = 0) {
  const pts = [
    { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
  ];
  return angle ? rotate(pts, angle, { x, y }) : pts;
}

/* ------------------------------------------------------------------ */
/* Appartenance et intersections                                       */
/* ------------------------------------------------------------------ */

/**
 * Le point est-il dans le polygone ? Lancer de rayon, avec les points du bord
 * comptés comme intérieurs.
 */
export function pointInPolygon(pt, poly, tol = 1e-9) {
  // Un point posé sur une arête doit être accepté : le test de parité seul
  // le classe de façon instable.
  for (let i = 0, n = poly.length; i < n; i++) {
    if (pointOnSegment(pt, poly[i], poly[(i + 1) % n], tol)) return true;
  }
  let inside = false;
  for (let i = 0, n = poly.length, j = n - 1; i < n; j = i++) {
    const a = poly[i], b = poly[j];
    const straddles = (a.y > pt.y) !== (b.y > pt.y);
    if (straddles && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Le point est-il sur le segment [a, b] ? */
export function pointOnSegment(p, a, b, tol = 1e-9) {
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  if (Math.abs(cross) > tol * Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))) return false;
  const dot = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);
  const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  return dot >= -tol && dot <= len2 + tol;
}

/** Les segments [p1,p2] et [p3,p4] se croisent-ils ? */
export function segmentsIntersect(p1, p2, p3, p4) {
  const d = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
    && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return pointOnSegment(p1, p3, p4) || pointOnSegment(p2, p3, p4)
    || pointOnSegment(p3, p1, p2) || pointOnSegment(p4, p1, p2);
}

/**
 * Deux polygones CONVEXES se recouvrent-ils ? Théorème de l'axe séparateur.
 * Les modules et les obstacles étant des rectangles, cette hypothèse tient.
 * Un simple contact d'arêtes ne compte pas comme un recouvrement.
 */
export function convexOverlap(a, b, tol = 1e-9) {
  for (const poly of [a, b]) {
    for (let i = 0, n = poly.length; i < n; i++) {
      const p = poly[i], q = poly[(i + 1) % n];
      // Normale à l'arête : axe candidat de séparation.
      const nx = -(q.y - p.y), ny = q.x - p.x;
      const len = Math.hypot(nx, ny);
      if (len < tol) continue;
      const ax = nx / len, ay = ny / len;
      const proj = (pts) => {
        let lo = Infinity, hi = -Infinity;
        for (const pt of pts) {
          const v = pt.x * ax + pt.y * ay;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        return [lo, hi];
      };
      const [aLo, aHi] = proj(a), [bLo, bHi] = proj(b);
      if (aHi <= bLo + tol || bHi <= aLo + tol) return false; // axe séparateur trouvé
    }
  }
  return true;
}

/**
 * Le polygone `inner` est-il entièrement contenu dans `outer` ?
 * Tous ses sommets doivent être dedans, et aucune arête ne doit traverser
 * le contour — ce qui écarte le cas d'un polygone qui « enjambe » une
 * concavité.
 */
export function polygonInside(inner, outer, tol = 1e-9) {
  for (const p of inner) if (!pointInPolygon(p, outer, tol)) return false;
  for (let i = 0, n = inner.length; i < n; i++) {
    const a = inner[i], b = inner[(i + 1) % n];
    for (let j = 0, m = outer.length; j < m; j++) {
      const c = outer[j], d = outer[(j + 1) % m];
      // Un contact franc du bord est toléré ; une vraie traversée ne l'est pas.
      if (properCrossing(a, b, c, d, tol)) return false;
    }
  }
  return true;
}

/**
 * Croisement franc de deux segments, contacts et recouvrements d'arêtes exclus.
 *
 * La tolérance n'est pas cosmétique : un contour issu d'un retrait de rive
 * porte des erreurs d'arrondi de l'ordre de 1e-15, et deux arêtes confondues
 * produisent alors des produits vectoriels minuscules mais signés. Sans
 * tolérance, un module posé le long du bord serait déclaré « croisant » le
 * contour et rejeté du calepinage.
 */
function properCrossing(p1, p2, p3, p4, tol = 1e-9) {
  const d = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const echelle = Math.max(1,
    Math.hypot(p2.x - p1.x, p2.y - p1.y),
    Math.hypot(p4.x - p3.x, p4.y - p3.y));
  const eps = tol * echelle;
  const signe = (v) => (v > eps ? 1 : v < -eps ? -1 : 0);
  const s1 = signe(d(p3, p4, p1)), s2 = signe(d(p3, p4, p2));
  const s3 = signe(d(p1, p2, p3)), s4 = signe(d(p1, p2, p4));
  return s1 * s2 < 0 && s3 * s4 < 0;
}

/* ------------------------------------------------------------------ */
/* Retrait de rive                                                     */
/* ------------------------------------------------------------------ */

/**
 * Rétrécit un polygone d'une distance constante — la marge de rive imposée
 * par les règles de pose et l'accès de maintenance.
 *
 * Méthode : chaque arête est décalée vers l'intérieur, puis les arêtes
 * consécutives sont réintersectées. C'est exact sur un polygone convexe et
 * juste sur les formes concaves usuelles d'une toiture. Sur une forme très
 * concave, le contour décalé peut se replier sur lui-même : la fonction
 * renvoie alors `null` plutôt qu'un résultat faux.
 *
 * @param {Array<{x:number,y:number}>} poly
 * @param {number} d retrait en mètres ; négatif pour agrandir
 * @returns {Array<{x:number,y:number}>|null}
 */
export function insetPolygon(poly, d) {
  if (Math.abs(d) < EPS) return poly.slice();
  const p = toCounterClockwise(poly);
  const n = p.length;
  if (n < 3) return null;

  // Chaque arête est décalée le long de sa normale intérieure.
  const lines = [];
  for (let i = 0; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n];
    const ex = b.x - a.x, ey = b.y - a.y;
    const len = Math.hypot(ex, ey);
    if (len < EPS) continue;
    const nx = -ey / len, ny = ex / len; // normale intérieure (sens trigo)
    lines.push({
      a: { x: a.x + nx * d, y: a.y + ny * d },
      b: { x: b.x + nx * d, y: b.y + ny * d },
    });
  }
  if (lines.length < 3) return null;

  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const prev = lines[(i - 1 + lines.length) % lines.length];
    const cur = lines[i];
    const pt = lineIntersection(prev.a, prev.b, cur.a, cur.b);
    if (!pt) return null; // arêtes parallèles : décalage indéterminé
    out.push(pt);
  }

  // Contrôle de validité : le retrait doit réduire l'aire sans retourner le
  // polygone ni le faire se croiser.
  if (out.length < 3) return null;
  const before = area(p), after = area(out);
  if (d > 0 && (after >= before || after < EPS)) return null;
  if (!isCounterClockwise(out)) return null;
  if (isSelfIntersecting(out)) return null;
  return out;
}

/** Intersection de deux droites (et non de deux segments). */
export function lineIntersection(a1, a2, b1, b2) {
  const d1x = a2.x - a1.x, d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x, d2y = b2.y - b1.y;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < EPS) return null;
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / den;
  return { x: a1.x + t * d1x, y: a1.y + t * d1y };
}

/** Le contour se croise-t-il lui-même ? */
export function isSelfIntersecting(poly) {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // On ignore les arêtes voisines, qui partagent un sommet.
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      if (properCrossing(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return true;
    }
  }
  return false;
}
