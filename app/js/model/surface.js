/**
 * Surfaces d'implantation — toitures, terrasses, terrains.
 *
 * Une surface porte sa forme, son orientation, ses obstacles et ses règles de
 * pose. C'est l'objet qui manquait : sans lui, un dimensionnement ne pouvait
 * pas savoir combien de modules tiennent réellement.
 *
 * Deux modes de pose :
 *  - `coplanar` : les modules épousent la couverture d'une toiture inclinée.
 *    Le contour est exprimé dans le plan de la couverture, en longueurs vraies.
 *  - `tilted` : les modules sont portés par des structures sur une terrasse ou
 *    au sol. Le contour est horizontal et l'entraxe des rangées est calculé.
 */

import * as geo from './geometry.js';
import { DEFAULT_CONSTRAINTS } from '../core/layout.js';

/** Surface rectangulaire par défaut : le cas le plus courant. */
export function blankSurface(overrides = {}) {
  return {
    id: (globalThis.crypto?.randomUUID?.() ?? `s${Date.now()}`),
    name: 'Toiture principale',
    mounting: 'coplanar',
    shape: 'rect',
    width: 12,          // m, dans l'axe X
    depth: 8,           // m, dans l'axe Y (la pente pour une toiture)
    outline: null,      // renseigné pour une forme quelconque
    tilt: 30,           // inclinaison de la couverture (mode coplanar)
    azimuth: 0,         // 0 = Sud, −90 = Est, +90 = Ouest
    obstacles: [],
    constraints: { ...DEFAULT_CONSTRAINTS },
    pitch: null,        // entraxe imposé ; null = calculé
    ...overrides,
  };
}

/** Obstacle rectangulaire par défaut. */
export function blankObstacle(overrides = {}) {
  return {
    id: (globalThis.crypto?.randomUUID?.() ?? `o${Date.now()}`),
    name: 'Obstacle',
    kind: 'chimney',    // chimney | vent | skylight | equipment | wall | other
    x: 1, y: 1, width: 1, height: 1,
    elevation: 1.0,     // hauteur au-dessus du plan, m — servira aux masques
    clearance: null,    // dégagement propre ; null = valeur générale
    ...overrides,
  };
}

/** Familles d'obstacles proposées, avec un dégagement d'usage. */
export const OBSTACLE_KINDS = [
  { id: 'chimney', clearance: 0.5, elevation: 1.2 },
  { id: 'vent', clearance: 0.3, elevation: 0.4 },
  { id: 'skylight', clearance: 0.3, elevation: 0.2 },
  { id: 'equipment', clearance: 0.6, elevation: 1.0 },
  { id: 'wall', clearance: 0.3, elevation: 1.0 },
  { id: 'other', clearance: 0.3, elevation: 0.5 },
];

/** Contour effectif : celui saisi, ou le rectangle décrit par largeur/profondeur. */
export function surfaceOutline(surface) {
  if (Array.isArray(surface.outline) && surface.outline.length >= 3) {
    return geo.toCounterClockwise(surface.outline);
  }
  const w = Math.max(0, Number(surface.width) || 0);
  const d = Math.max(0, Number(surface.depth) || 0);
  return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: d }, { x: 0, y: d }];
}

/** Contour d'un obstacle décrit par sa position et sa taille. */
export function obstacleOutline(o) {
  if (Array.isArray(o.outline) && o.outline.length >= 3) return o.outline;
  const x = Number(o.x) || 0, y = Number(o.y) || 0;
  const w = Math.max(0.05, Number(o.width) || 0), h = Math.max(0.05, Number(o.height) || 0);
  return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
}

/**
 * Surface normalisée, prête pour le moteur de calepinage : contours résolus et
 * obstacles convertis.
 */
export function resolveSurface(surface) {
  return {
    ...surface,
    outline: surfaceOutline(surface),
    obstacles: (surface.obstacles ?? []).map((o) => ({
      ...o,
      outline: obstacleOutline(o),
      clearance: o.clearance ?? undefined,
    })),
  };
}

/** Aire du support et aire réellement disponible après marge de rive. */
export function surfaceMetrics(surface) {
  const outline = surfaceOutline(surface);
  const brut = geo.area(outline);
  const setback = Number(surface.constraints?.setback) || 0;
  const inset = setback > 0 ? geo.insetPolygon(outline, setback) : outline;
  const obstacles = (surface.obstacles ?? [])
    .reduce((s, o) => s + geo.area(obstacleOutline(o)), 0);
  return {
    grossM2: brut,
    usableM2: inset ? Math.max(0, geo.area(inset) - obstacles) : 0,
    obstacleM2: obstacles,
    perimeterM: geo.perimeter(outline),
    valid: !!inset && !geo.isSelfIntersecting(outline),
  };
}

/**
 * Contrôles de vraisemblance sur une surface, avant tout calcul.
 * @returns {Array<{level:string, code:string, detail?:object}>}
 */
export function validateSurface(surface) {
  const issues = [];
  const outline = surfaceOutline(surface);
  if (outline.length < 3) issues.push({ level: 'error', code: 'surface.tooFewPoints' });
  if (geo.isSelfIntersecting(outline)) issues.push({ level: 'error', code: 'surface.selfIntersecting' });
  if (geo.area(outline) < 1) issues.push({ level: 'error', code: 'surface.tooSmall' });

  const setback = Number(surface.constraints?.setback) || 0;
  if (setback > 0 && !geo.insetPolygon(outline, setback)) {
    issues.push({ level: 'error', code: 'surface.setbackTooLarge' });
  }
  if (surface.mounting === 'coplanar') {
    const tilt = Number(surface.tilt);
    if (!(tilt >= 0 && tilt <= 90)) issues.push({ level: 'error', code: 'surface.tiltRange' });
  }
  // Un obstacle doit se trouver sur la surface qu'il encombre.
  for (const o of surface.obstacles ?? []) {
    const oo = obstacleOutline(o);
    const dehors = oo.every((p) => !geo.pointInPolygon(p, outline));
    if (dehors) issues.push({ level: 'warn', code: 'obstacle.outside', detail: { name: o.name } });
  }
  return issues;
}
