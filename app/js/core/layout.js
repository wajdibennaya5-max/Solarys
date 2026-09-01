/**
 * Calepinage — placement des modules sur une surface, aux dimensions réelles.
 *
 * C'est ce module qui répond à la seule question qui compte devant un client :
 * « combien de modules tiennent VRAIMENT sur cette toiture ? ». Il tient compte
 * de la forme du support, de la marge de rive, des obstacles, des couloirs de
 * maintenance, de l'orientation des modules et — en terrasse ou au sol — de
 * l'entraxe imposé par l'ombrage entre rangées.
 *
 * Repère : le plan de la surface, en mètres. Pour une toiture inclinée
 * (`coplanar`), les modules épousent la couverture et l'axe Y monte dans la
 * pente. Pour une terrasse ou une centrale au sol (`tilted`), le plan est
 * horizontal, les modules sont portés par des structures inclinées, et l'axe Y
 * est l'axe des rangées.
 */

import * as geo from '../model/geometry.js';
import { recommendedPitch, rowPitch } from './rowspacing.js';

const DEG = Math.PI / 180;

/** Valeurs par défaut, modifiables projet par projet. */
export const DEFAULT_CONSTRAINTS = {
  setback: 0.40,        // marge de rive, m
  gapX: 0.02,           // jeu entre modules d'une même rangée, m
  gapY: 0.02,           // jeu entre rangées jointives (toiture inclinée), m
  obstacleClearance: 0.30, // dégagement autour d'un obstacle, m
  orientation: 'auto',  // 'portrait' | 'paysage' | 'auto'
  frameTilt: 15,        // inclinaison des structures (terrasse / sol), degrés
  referenceHour: 9,     // heure solaire de référence pour l'entraxe
};

/**
 * Empreinte d'un module dans le plan de la surface.
 *
 * En toiture inclinée, le module est posé à plat sur la couverture : son
 * empreinte est sa taille réelle. Sur structure inclinée, l'empreinte dans le
 * plan horizontal est raccourcie par le cosinus de l'inclinaison.
 *
 * @returns {{w:number, h:number, slopeLength:number}} largeur (axe X),
 *          profondeur (axe Y), et longueur réelle dans la pente
 */
export function moduleFootprint({ module, orientation, mounting, frameTilt = 0 }) {
  const portrait = orientation === 'portrait';
  // En portrait, la grande dimension du module monte dans la pente.
  const along = portrait ? module.length : module.width;
  const across = portrait ? module.width : module.length;
  const shrink = mounting === 'tilted' ? Math.cos(frameTilt * DEG) : 1;
  return { w: across, h: along * shrink, slopeLength: along };
}

/**
 * Zone réellement disponible : contour retiré de la marge de rive.
 * @returns {{usable:Array|null, reason:string|null}}
 */
export function usableArea(surface, constraints) {
  const outline = surface.outline ?? [];
  if (outline.length < 3) return { usable: null, reason: 'outline.tooFewPoints' };
  if (geo.isSelfIntersecting(outline)) return { usable: null, reason: 'outline.selfIntersecting' };
  const setback = Number(constraints.setback) || 0;
  if (setback <= 0) return { usable: geo.toCounterClockwise(outline), reason: null };
  const inset = geo.insetPolygon(outline, setback);
  if (!inset) return { usable: null, reason: 'setback.tooLarge' };
  return { usable: inset, reason: null };
}

/** Contour d'un obstacle, élargi de son dégagement. */
function obstacleFootprint(obstacle, clearance) {
  const poly = geo.toCounterClockwise(obstacle.outline ?? []);
  if (poly.length < 3) return null;
  const own = obstacle.clearance ?? clearance;
  return own > 0 ? (geo.insetPolygon(poly, -own) ?? poly) : poly;
}

/**
 * Place les modules sur une surface.
 *
 * @param {object} p
 * @param {object} p.surface   `{ outline, mounting, tilt, azimuth, obstacles }`
 * @param {object} p.module    module de la bibliothèque (dimensions en mètres)
 * @param {object} [p.constraints]
 * @param {number} [p.latitude] requis pour l'entraxe sur structures inclinées
 * @param {number} [p.pitch]    entraxe imposé ; sinon calculé
 * @returns {object} placement complet et diagnostics
 */
export function placeModules({ surface, module, constraints = {}, latitude, pitch }) {
  const c = { ...DEFAULT_CONSTRAINTS, ...constraints };
  const mounting = surface.mounting === 'tilted' ? 'tilted' : 'coplanar';
  const issues = [];

  const { usable, reason } = usableArea(surface, c);
  if (!usable) {
    return { feasible: false, modules: [], count: 0, issues: [{ level: 'error', code: reason }] };
  }

  const blockers = (surface.obstacles ?? [])
    .map((o) => obstacleFootprint(o, c.obstacleClearance))
    .filter(Boolean);

  // Entraxe : imposé, calculé, ou simple jeu inter-rangées en toiture inclinée.
  let spacing = null;
  if (mounting === 'tilted') {
    if (pitch != null) {
      spacing = { pitch: Number(pitch), source: 'imposé' };
    } else if (latitude != null) {
      const r = recommendedPitch({
        latitude, moduleLength: 0, tilt: c.frameTilt, referenceHour: c.referenceHour,
        azimuth: surface.azimuth,
      });
      spacing = { pitch: null, source: 'calculé', reference: r };
    }
  }

  const orientations = c.orientation === 'auto'
    ? ['portrait', 'paysage']
    : [c.orientation];

  let best = null;
  for (const orientation of orientations) {
    const fp = moduleFootprint({ module, orientation, mounting, frameTilt: c.frameTilt });

    // Entraxe effectif, qui dépend de la longueur du module dans la pente.
    let rowPitchM = fp.h + c.gapY;
    let pitchInfo = { pitch: rowPitchM, source: 'jointif' };
    if (mounting === 'tilted') {
      if (pitch != null) {
        rowPitchM = Math.max(Number(pitch), fp.h);
        pitchInfo = { pitch: rowPitchM, source: 'imposé' };
      } else if (latitude != null) {
        const r = recommendedPitch({
          latitude, moduleLength: fp.slopeLength, tilt: c.frameTilt,
          referenceHour: c.referenceHour, azimuth: surface.azimuth,
        });
        if (r.feasible) {
          rowPitchM = Math.max(r.pitch, fp.h);
          pitchInfo = { pitch: rowPitchM, source: 'calculé', ...r };
        } else {
          issues.push({ level: 'warn', code: 'pitch.sunTooLow' });
        }
      } else {
        issues.push({ level: 'warn', code: 'pitch.noLatitude' });
      }
    }

    const placed = fillGrid({ usable, blockers, fp, gapX: c.gapX, rowPitch: rowPitchM });
    const candidate = { orientation, fp, rowPitch: rowPitchM, pitchInfo, ...placed };
    if (!best || candidate.count > best.count) best = candidate;
  }

  if (!best || best.count === 0) {
    issues.push({ level: 'warn', code: 'layout.empty' });
  }

  const kwp = (best?.count ?? 0) * module.pmax / 1000;
  const usableM2 = geo.area(usable);
  const modulesM2 = (best?.count ?? 0) * module.length * module.width;

  return {
    feasible: (best?.count ?? 0) > 0,
    mounting,
    orientation: best?.orientation ?? null,
    modules: best?.modules ?? [],
    count: best?.count ?? 0,
    rows: best?.rows ?? 0,
    perRow: best?.perRow ?? [],
    kwp,
    rowPitch: best?.rowPitch ?? null,
    pitchInfo: best?.pitchInfo ?? spacing,
    usable,
    usableAreaM2: usableM2,
    moduleAreaM2: modulesM2,
    // Part de la zone exploitable réellement couverte de modules.
    fillRatio: usableM2 > 0 ? modulesM2 / usableM2 : 0,
    // Le facteur d'occupation du sol ne veut rien dire pour des modules posés à
    // plat sur la couverture : il n'y a pas de rangée qui en ombre une autre.
    gcr: mounting === 'tilted' && best && best.rowPitch > 0
      ? best.fp.slopeLength / best.rowPitch : null,
    obstacles: blockers,
    issues,
  };
}

/**
 * Remplit la zone par un pavage régulier, en essayant plusieurs origines pour
 * ne pas perdre une rangée ou une colonne à cause d'un décalage malheureux.
 */
function fillGrid({ usable, blockers, fp, gapX, rowPitch }) {
  const box = geo.bbox(usable);
  const stepX = fp.w + gapX;
  if (stepX <= 0 || rowPitch <= 0) return { modules: [], count: 0, rows: 0, perRow: [] };

  // Balayage de l'origine : quelques décalages suffisent à récupérer les cas
  // limites, sans faire exploser le temps de calcul.
  const offsets = [0, 0.25, 0.5, 0.75];
  let best = { modules: [], count: 0, rows: 0, perRow: [] };

  for (const ox of offsets) {
    for (const oy of offsets) {
      const modules = [];
      const perRow = [];
      let row = 0;
      for (let y = box.minY + oy * rowPitch; y + fp.h <= box.maxY + 1e-9; y += rowPitch) {
        let inRow = 0;
        for (let x = box.minX + ox * stepX; x + fp.w <= box.maxX + 1e-9; x += stepX) {
          const rect = geo.rectangle(x, y, fp.w, fp.h);
          if (!geo.polygonInside(rect, usable)) continue;
          if (blockers.some((b) => geo.convexOverlap(rect, b))) continue;
          modules.push({ x, y, w: fp.w, h: fp.h, row, col: inRow, polygon: rect });
          inRow++;
        }
        if (inRow > 0) perRow.push(inRow);
        row++;
      }
      if (modules.length > best.count) {
        best = { modules, count: modules.length, rows: perRow.length, perRow };
      }
    }
  }
  return best;
}
