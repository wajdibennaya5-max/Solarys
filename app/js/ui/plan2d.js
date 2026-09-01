/**
 * Vue en plan du calepinage — dessin à l'échelle, en SVG.
 *
 * Ce que la vue montre, et que rien ne montrait jusqu'ici : la forme réelle du
 * support, la marge de rive, les obstacles avec leur dégagement, et chaque
 * module à ses vraies dimensions, à sa vraie place.
 *
 * Le SVG est choisi pour la même raison que le reste de l'application : il
 * s'imprime net, s'exporte tel quel, et ne demande aucune bibliothèque.
 */

import { t } from '../i18n.js';
import * as geo from '../model/geometry.js';
import { fmt } from './charts.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const path = (poly, close = true) =>
  `M${poly.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' L')}${close ? ' Z' : ''}`;

/** Pas de grille lisible : 1, 2 ou 5 mètres selon l'étendue du dessin. */
function gridStep(span) {
  const brut = span / 12;
  const mag = 10 ** Math.floor(Math.log10(Math.max(brut, 0.1)));
  const n = brut / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

/**
 * Dessine la vue en plan.
 *
 * @param {object} p
 * @param {object} p.surface  surface d'implantation
 * @param {object} p.layout   résultat de `placeModules`
 * @param {object} [p.opts]
 * @param {boolean} [p.opts.grid]        afficher la grille cotée
 * @param {boolean} [p.opts.dimensions]  afficher les cotes d'encombrement
 * @param {boolean} [p.opts.rowLabels]   numéroter les rangées
 * @param {number}  [p.opts.width]       largeur du dessin en points
 * @returns {string} document SVG
 */
export function planView({ surface, layout, opts = {} }) {
  const {
    grid = true, dimensions = true, rowLabels = true, width = 900,
  } = opts;

  const outline = geo.toCounterClockwise(surface.outline ?? []);
  if (outline.length < 3) {
    return `<svg viewBox="0 0 ${width} 200" class="plan2d">
      <text class="p-msg" x="${width / 2}" y="100" text-anchor="middle">${esc(t('plan.noSurface'))}</text></svg>`;
  }

  const box = geo.bbox(outline);
  const marge = Math.max(box.width, box.height) * 0.12 + 1.2; // place pour les cotes
  const vbW = box.width + marge * 2;
  const vbH = box.height + marge * 2;
  const scale = width / vbW;
  const height = vbH * scale;

  // Le repère du dessin a son Y vers le bas : on retourne le plan pour que le
  // Nord — et la montée de la pente — soit en haut, comme sur un plan.
  const toDraw = (p) => ({ x: p.x - box.minX + marge, y: box.maxY - p.y + marge });
  const conv = (poly) => poly.map(toDraw);

  /* --- grille cotée --- */
  let gridMarkup = '';
  if (grid) {
    const step = gridStep(Math.max(box.width, box.height));
    const x0 = Math.ceil(box.minX / step) * step;
    const y0 = Math.ceil(box.minY / step) * step;
    for (let x = x0; x <= box.maxX + 1e-9; x += step) {
      const a = toDraw({ x, y: box.minY }), b = toDraw({ x, y: box.maxY });
      gridMarkup += `<path class="p-grid" d="M${a.x.toFixed(2)},${a.y.toFixed(2)} L${b.x.toFixed(2)},${b.y.toFixed(2)}"/>`;
    }
    for (let y = y0; y <= box.maxY + 1e-9; y += step) {
      const a = toDraw({ x: box.minX, y }), b = toDraw({ x: box.maxX, y });
      gridMarkup += `<path class="p-grid" d="M${a.x.toFixed(2)},${a.y.toFixed(2)} L${b.x.toFixed(2)},${b.y.toFixed(2)}"/>`;
    }
  }

  /* --- support, zone utile, obstacles --- */
  let markup = `<path class="p-outline" d="${path(conv(outline))}"/>`;
  if (layout?.usable) {
    markup += `<path class="p-usable" d="${path(conv(layout.usable))}"/>`;
  }
  for (const b of layout?.obstacles ?? []) {
    markup += `<path class="p-clearance" d="${path(conv(b))}"/>`;
  }
  for (const o of surface.obstacles ?? []) {
    if ((o.outline ?? []).length < 3) continue;
    markup += `<path class="p-obstacle" d="${path(conv(o.outline))}"/>`;
    const c = toDraw(geo.centroid(o.outline));
    if (o.name) {
      markup += `<text class="p-label" x="${c.x.toFixed(2)}" y="${(c.y + 0.12).toFixed(2)}" text-anchor="middle">${esc(o.name)}</text>`;
    }
  }

  /* --- modules --- */
  let modulesMarkup = '';
  for (const m of layout?.modules ?? []) {
    const q = conv(m.polygon);
    modulesMarkup += `<path class="p-module" d="${path(q)}"/>`;
    // Le trait diagonal est le symbole conventionnel du module photovoltaïque.
    modulesMarkup += `<path class="p-diag" d="M${q[0].x.toFixed(2)},${q[0].y.toFixed(2)} L${q[2].x.toFixed(2)},${q[2].y.toFixed(2)}"/>`;
  }

  /* --- numéros de rangée --- */
  let rowMarkup = '';
  if (rowLabels && layout?.modules?.length) {
    const parRangee = new Map();
    for (const m of layout.modules) {
      if (!parRangee.has(m.row)) parRangee.set(m.row, []);
      parRangee.get(m.row).push(m);
    }
    let n = 1;
    for (const [, mods] of [...parRangee.entries()].sort((a, b) => b[0] - a[0])) {
      const gauche = mods.reduce((a, b) => (a.x < b.x ? a : b));
      const p = toDraw({ x: gauche.x, y: gauche.y + gauche.h / 2 });
      rowMarkup += `<text class="p-row" x="${(p.x - 0.35).toFixed(2)}" y="${(p.y + 0.12).toFixed(2)}" text-anchor="end">R${n}</text>`;
      n++;
    }
  }

  /* --- cotes d'encombrement --- */
  let dimMarkup = '';
  if (dimensions) {
    const d = marge * 0.45;
    const bas = box.minY - d, gauche = box.minX - d;
    const a1 = toDraw({ x: box.minX, y: bas }), b1 = toDraw({ x: box.maxX, y: bas });
    dimMarkup += dimensionLine(a1, b1, `${fmt(box.width, 2)} m`);
    const a2 = toDraw({ x: gauche, y: box.minY }), b2 = toDraw({ x: gauche, y: box.maxY });
    dimMarkup += dimensionLine(a2, b2, `${fmt(box.height, 2)} m`, true);
  }

  /* --- rose des vents --- */
  const nx = marge * 0.5, ny = marge * 0.5;
  const nord = `<g class="p-north" transform="translate(${nx.toFixed(2)},${ny.toFixed(2)})">
    <circle r="0.42"/><path d="M0,-0.34 L0.15,0.12 L0,0.02 L-0.15,0.12 Z" class="p-north-fill"/>
    <text class="p-north-txt" x="0" y="-0.52" text-anchor="middle">N</text></g>`;

  const echelle = `<text class="p-scale" x="${(vbW - 0.2).toFixed(2)}" y="${(vbH - 0.2).toFixed(2)}" text-anchor="end">`
    + `${esc(t('plan.grid'))} ${fmt(gridStep(Math.max(box.width, box.height)), 0)} m</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW.toFixed(3)} ${vbH.toFixed(3)}"
    class="plan2d" role="img" aria-label="${esc(t('plan.title'))}"
    data-scale="${scale.toFixed(4)}" style="--u:${(1 / scale).toFixed(5)}">
  <style>
    .plan2d{font-family:ui-sans-serif,system-ui,sans-serif}
    .plan2d path{vector-effect:non-scaling-stroke;fill:none}
    .plan2d .p-grid{stroke:var(--plan-grid,#0001);stroke-width:1}
    .plan2d .p-outline{stroke:var(--plan-ink,#16202c);stroke-width:2;fill:var(--plan-roof,#f4f6f9)}
    .plan2d .p-usable{stroke:var(--plan-ink-2,#8a97a8);stroke-width:1;stroke-dasharray:6 4}
    .plan2d .p-clearance{stroke:none;fill:var(--plan-clearance,#e6676722)}
    .plan2d .p-obstacle{stroke:var(--plan-obstacle,#c0392b);stroke-width:1.4;fill:var(--plan-obstacle-fill,#c0392b33)}
    .plan2d .p-module{stroke:var(--plan-module-ink,#1b3a63);stroke-width:1;fill:var(--plan-module,#2f6fb2)}
    .plan2d .p-diag{stroke:var(--plan-module-ink,#1b3a63);stroke-width:0.8;opacity:.55}
    .plan2d text{fill:var(--plan-ink,#16202c);stroke:none}
    .plan2d .p-label{font-size:0.34px;fill:var(--plan-obstacle,#c0392b)}
    .plan2d .p-row{font-size:0.4px;fill:var(--plan-ink-2,#8a97a8);font-weight:600}
    .plan2d .p-dim{stroke:var(--plan-ink-2,#8a97a8);stroke-width:1}
    .plan2d .p-dim-txt{font-size:0.42px;fill:var(--plan-ink-2,#8a97a8)}
    .plan2d .p-scale{font-size:0.38px;fill:var(--plan-ink-2,#8a97a8)}
    .plan2d .p-north circle{fill:none;stroke:var(--plan-ink-2,#8a97a8);stroke-width:1;vector-effect:non-scaling-stroke}
    .plan2d .p-north-fill{fill:var(--plan-ink,#16202c);stroke:none}
    .plan2d .p-north-txt{font-size:0.34px;fill:var(--plan-ink-2,#8a97a8)}
    .plan2d .p-msg{font-size:14px;fill:var(--plan-ink-2,#8a97a8)}
  </style>
  ${gridMarkup}${markup}${modulesMarkup}${rowMarkup}${dimMarkup}${nord}${echelle}
</svg>`;
}

/** Ligne de cote avec ses extrémités et son texte. */
function dimensionLine(a, b, label, vertical = false) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const tick = 0.16;
  const t1 = vertical
    ? `M${a.x - tick},${a.y} L${a.x + tick},${a.y} M${b.x - tick},${b.y} L${b.x + tick},${b.y}`
    : `M${a.x},${a.y - tick} L${a.x},${a.y + tick} M${b.x},${b.y - tick} L${b.x},${b.y + tick}`;
  return `<path class="p-dim" d="M${a.x.toFixed(2)},${a.y.toFixed(2)} L${b.x.toFixed(2)},${b.y.toFixed(2)}"/>`
    + `<path class="p-dim" d="${t1}"/>`
    + `<text class="p-dim-txt" x="${mx.toFixed(2)}" y="${(my - 0.18).toFixed(2)}" text-anchor="middle"`
    + `${vertical ? ` transform="rotate(-90 ${mx.toFixed(2)} ${my.toFixed(2)})"` : ''}>${esc(label)}</text>`;
}
