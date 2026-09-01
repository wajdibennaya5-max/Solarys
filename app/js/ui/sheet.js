/**
 * Générateur de planches au format d'un dossier d'exécution.
 *
 * Anatomie d'une planche, reprise des conventions du dessin technique :
 *   ┌──────────────────────────────────────────┬──────────────┐
 *   │                                          │  tableaux de │
 *   │            zone de dessin                │ spécification│
 *   │                                          ├──────────────┤
 *   │  notes · légende · abréviations          │   cartouche  │
 *   └──────────────────────────────────────────┴──────────────┘
 *
 * Le cartouche contient le tableau de révisions (REV / DATE / DÉSIGNATION /
 * PRÉPARÉ / VÉRIFIÉ / APPROUVÉ), le bloc de marque, puis client, projet,
 * titre, numéro de document, format, échelle, date et folio.
 *
 * Tout est en SVG : la planche s'imprime nette à n'importe quelle taille et
 * s'ouvre dans n'importe quel éditeur vectoriel.
 */

import { t } from '../i18n.js';
import { WATERMARK } from '../licence.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Formats normalisés, en points à 96 ppp, orientation paysage. */
export const FORMATS = {
  A4: { w: 1123, h: 794 },
  A3: { w: 1587, h: 1123 },
  A2: { w: 2245, h: 1587 },
  A1: { w: 3175, h: 2245 },
};

const M = 22;   // marge extérieure
const PAD = 10; // retrait du cadre intérieur

const txt = (x, y, s, cls = 'c', anchor = 'start') =>
  `<text class="${cls}" x="${x}" y="${y}" text-anchor="${anchor}">${esc(s)}</text>`;
const line = (x1, y1, x2, y2, cls = 'r') => `<path class="${cls}" d="M${x1},${y1} L${x2},${y2}"/>`;
const rect = (x, y, w, h, cls = 'r') => `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;

/** Tronque un texte pour qu'il tienne dans une largeur donnée. */
const fit = (s, chars) => {
  s = String(s ?? '');
  return s.length > chars ? `${s.slice(0, chars - 1)}…` : s;
};

/* ------------------------------------------------------------------ */
/* Blocs de la planche                                                 */
/* ------------------------------------------------------------------ */

/**
 * Tableau de spécifications à deux colonnes, façon « DESCRIPTION GÉNÉRALE
 * DE LA CENTRALE ».
 * @returns {{markup:string, height:number}}
 */
export function specTable({ x, y, w, title, rows }) {
  const rowH = 15, headH = 18;
  const labelW = Math.round(w * 0.52);
  let m = rect(x, y, w, headH, 'r2')
    + txt(x + 6, y + headH - 5, title, 'h');
  rows.forEach((r, i) => {
    const ry = y + headH + i * rowH;
    m += rect(x, ry, w, rowH);
    m += line(x + labelW, ry, x + labelW, ry + rowH);
    m += txt(x + 5, ry + rowH - 4.5, r[0], 'c');
    m += txt(x + labelW + 5, ry + rowH - 4.5, `: ${fit(r[1], 26)}`, 'c');
  });
  return { markup: m, height: headH + rows.length * rowH };
}

/**
 * Cartouche complet.
 * @returns {{markup:string, height:number}}
 */
export function cartouche({ x, y, w, project, title, docNo, folio, format, echelle, pro = false }) {
  const d = project.dossier ?? {};
  const b = project.branding ?? {};
  const revs = (d.revisions ?? []).slice(-4).reverse();
  const revH = 14;

  // Colonnes du tableau de révisions, en fractions de la largeur.
  const cw = [0.07, 0.13, 0.44, 0.12, 0.12, 0.12].map((f) => f * w);
  const cx = cw.reduce((acc, v) => (acc.push(acc.at(-1) + v), acc), [x]);

  let m = '';
  let cy = y;

  const revRow = (cells, cls = 'c') => {
    let r = rect(x, cy, w, revH);
    cells.forEach((cell, i) => {
      if (i > 0) r += line(cx[i], cy, cx[i], cy + revH);
      const centre = i !== 2;
      r += txt(centre ? cx[i] + cw[i] / 2 : cx[i] + 4, cy + revH - 4,
        i === 2 ? fit(cell, 42) : cell, cls, centre ? 'middle' : 'start');
    });
    cy += revH;
    return r;
  };

  const shortDate = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? (iso ?? '') : d.toLocaleDateString('fr-FR');
  };
  for (const r of revs) {
    m += revRow([r.rev, shortDate(r.date), (r.designation ?? '').toUpperCase(),
      d.preparedBy || 'N.A', d.checkedBy || 'N.A', d.approvedBy || 'N.A']);
  }
  m += revRow(['REV', 'DATE', 'DÉSIGNATION', 'PRÉP.', 'VÉRIF.', 'APPR.'], 'hs');

  // Bloc de marque.
  // La marque blanche est réservée à la version Pro : sans licence, les
  // planches portent le nom du logiciel, pas celui de l'utilisateur.
  const logoH = 56;
  m += rect(x, cy, w, logoH);
  if (!pro) {
    m += txt(x + w / 2, cy + logoH / 2 + 8, 'SOLARYS', 'logo', 'middle');
  } else if (b.logoDataUrl) {
    m += `<image href="${b.logoDataUrl}" x="${x + 8}" y="${cy + 6}" `
      + `width="${w - 16}" height="${logoH - 12}" preserveAspectRatio="xMidYMid meet"/>`;
  } else {
    m += txt(x + w / 2, cy + logoH / 2 + 8, fit(b.company || 'SOLARYS', 22), 'logo', 'middle');
  }
  cy += logoH;

  // Client, puis projet.
  const blockH = 42;
  for (const [label, value] of [
    [t('project.client').toUpperCase(), project.meta.client || '—'],
    [t('nav.project').toUpperCase(), `${project.meta.name || '—'}`],
  ]) {
    m += rect(x, cy, w, blockH);
    m += txt(x + 5, cy + 11, `${label} :`, 'k');
    m += txt(x + w / 2, cy + 31, fit(value, 30), 'v', 'middle');
    cy += blockH;
  }

  // Titre de la planche et numéro de document.
  const titleH = 46, splitX = x + w * 0.6;
  m += rect(x, cy, w, titleH) + line(splitX, cy, splitX, cy + titleH);
  m += txt(x + 5, cy + 11, 'TITRE :', 'k');
  m += txt(splitX + 5, cy + 11, 'N° DOCUMENT :', 'k');
  m += txt(x + (splitX - x) / 2, cy + 30, fit(title, 26), 'v', 'middle');
  m += txt(splitX + (x + w - splitX) / 2, cy + 30, fit(docNo || '—', 14), 'v', 'middle');
  cy += titleH;

  // Bandeau format / échelle / date / folio.
  const footH = 16;
  const fw = w / 4;
  m += rect(x, cy, w, footH);
  [['FORMAT :', format], ['ÉCHELLE :', echelle], ['DATE :', new Date().toLocaleDateString('fr-FR')],
    ['FOLIO :', folio]].forEach(([k, v], i) => {
    if (i > 0) m += line(x + fw * i, cy, x + fw * i, cy + footH);
    m += txt(x + fw * i + 4, cy + footH - 4.5, `${k} ${v ?? ''}`, 'k');
  });
  cy += footH;

  return { markup: m, height: cy - y };
}

/** Bloc de notes numérotées. */
export function notesBlock({ x, y, title, items }) {
  if (!items?.length) return { markup: '', height: 0 };
  let m = txt(x, y, `${title} :`, 'h');
  items.forEach((n, i) => { m += txt(x, y + 16 + i * 13, `${i + 1}—  ${n}`, 'c'); });
  return { markup: m, height: 16 + items.length * 13 };
}

/** Légende de symboles : une vignette SVG par entrée. */
export function legendBlock({ x, y, items }) {
  let m = txt(x, y, 'LÉGENDE :', 'h');
  items.forEach((it, i) => {
    const ly = y + 20 + i * 20;
    m += `<g transform="translate(${x + 12},${ly})">${it.symbol}</g>`;
    m += txt(x + 60, ly + 3.5, it.label, 'c');
  });
  return { markup: m, height: 20 + items.length * 20 };
}

/* ------------------------------------------------------------------ */
/* Planche complète                                                    */
/* ------------------------------------------------------------------ */

/**
 * Compose une planche : cadre, zone de dessin, colonne de spécifications,
 * notes, légende et cartouche.
 *
 * @param {object} o
 * @param {object} o.project
 * @param {string} o.title       titre de la planche (cartouche)
 * @param {string} o.folio       numéro de folio, ex. « 1.3 »
 * @param {string} [o.docNo]
 * @param {string} [o.echelle]
 * @param {(area:{x:number,y:number,w:number,h:number}) => string} o.draw
 *        fonction de dessin, recevant la zone disponible
 * @param {Array<{title:string,rows:Array<[string,string]>}>} [o.specs]
 * @param {string[]} [o.notes]
 * @param {Array<{symbol:string,label:string}>} [o.legend]
 */
export function buildSheet({ project, title, folio, docNo, echelle = 'NTS',
  draw, specs = [], notes = [], legend = [], pro = false }) {
  const fmt = project.dossier?.format ?? 'A3';
  const { w: W, h: H } = FORMATS[fmt] ?? FORMATS.A3;

  const innerX = M + PAD, innerY = M + PAD;
  const innerW = W - 2 * (M + PAD), innerH = H - 2 * (M + PAD);

  // Colonne de droite : spécifications en haut, cartouche en bas.
  const colW = Math.round(innerW * 0.24);
  const colX = innerX + innerW - colW;

  const cart = cartouche({
    x: colX, y: 0, w: colW, project, title, docNo, folio,
    format: fmt, echelle, pro,
  });
  const cartY = innerY + innerH - cart.height;

  let right = '';
  let sy = innerY;
  for (const s of specs) {
    const tb = specTable({ x: colX, y: sy, w: colW, title: s.title, rows: s.rows });
    // On n'empile que ce qui tient au-dessus du cartouche.
    if (sy + tb.height > cartY - 10) break;
    right += tb.markup;
    sy += tb.height + 8;
  }
  right += `<g transform="translate(0,${cartY})">${cart.markup}</g>`;

  // Zone de dessin : tout ce qui reste à gauche de la colonne.
  const area = { x: innerX, y: innerY, w: colX - innerX - 18, h: innerH - 4 };
  const blocksH = (notes.length ? 20 + notes.length * 13 : 0)
    + (legend.length ? 30 + legend.length * 20 : 0);
  const drawArea = { ...area, h: area.h - blocksH - (blocksH ? 20 : 0) };

  let bottom = '';
  let by = innerY + innerH - blocksH;
  if (notes.length) {
    const nb = notesBlock({ x: innerX, y: by, title: 'NOTE', items: notes });
    bottom += nb.markup; by += nb.height + 10;
  }
  if (legend.length) bottom += legendBlock({ x: innerX, y: by, items: legend }).markup;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="sheet">
  <style>
    .sheet{font-family:ui-sans-serif,system-ui,'Segoe UI',Arial,sans-serif}
    .sheet rect,.sheet path,.sheet circle,.sheet polyline{fill:none;stroke:var(--sld-ink,#16202c)}
    .sheet .sym circle,.sheet .sym rect{stroke-width:1.5}
    .sheet .dot{fill:var(--sld-ink,#16202c);stroke:none}
    .sheet .r{stroke-width:0.9}
    .sheet .r2{stroke-width:1.4}
    .sheet .frame{stroke-width:1.6}
    .sheet .w{stroke-width:1.5;stroke-linecap:round}
    .sheet .bus{stroke-width:2.4}
    .sheet .fill{fill:var(--sld-ink,#16202c);stroke:none}
    .sheet text{fill:var(--sld-ink,#16202c);stroke:none}
    .sheet .c{font-size:9px}
    .sheet .k{font-size:7.5px;fill:var(--sld-ink-2,#5b6b7f)}
    .sheet .h{font-size:9px;font-weight:700}
    .sheet .hs{font-size:7px;font-weight:700}
    .sheet .v{font-size:12px}
    .sheet .logo{font-size:22px;font-weight:800;letter-spacing:.04em}
    .sheet .s{font-size:8px;fill:var(--sld-ink-2,#5b6b7f)}
    .sheet .b{font-size:10px;font-weight:600}
    .sheet .t{font-size:17px;font-weight:700}
    .sheet .wm{font-size:62px;font-weight:800;letter-spacing:.14em;
      fill:var(--sld-ink,#16202c);opacity:.085;stroke:none}
  </style>
  <rect x="0" y="0" width="${W}" height="${H}" fill="var(--sld-bg,#fff)" stroke="none"/>
  ${rect(M, M, W - 2 * M, H - 2 * M, 'frame')}
  ${rect(M + 5, M + 5, W - 2 * M - 10, H - 2 * M - 10, 'r')}
  ${draw ? draw(drawArea) : ''}
  ${pro ? '' : watermark(W, H)}
  ${bottom}
  ${right}
</svg>`;
}

/**
 * Filigrane de la version Découverte. Volontairement lisible mais discret :
 * il doit interdire l'usage en dossier client sans gêner l'évaluation.
 */
function watermark(W, H) {
  const step = 420;
  let m = '';
  for (let i = -1; i * step < W + H; i++) {
    const x = i * step;
    m += `<text class="wm" x="${x}" y="${H * 0.62}" `
      + `transform="rotate(-24 ${x} ${H * 0.62})">${esc(WATERMARK)}</text>`;
  }
  return `<g aria-hidden="true">${m}</g>`;
}

/** Enveloppe un dessin conçu dans son propre repère et le cale dans une zone. */
export function place(markup, { srcW, srcH, area, align = 'center', valign = 'top' }) {
  const k = Math.min(area.w / srcW, area.h / srcH, 1.6);
  const dx = area.x + (align === 'left' ? 0 : (area.w - srcW * k) / 2);
  const dy = area.y + (valign === 'top' ? 10 : (area.h - srcH * k) / 2);
  return `<g transform="translate(${dx.toFixed(1)},${dy.toFixed(1)}) scale(${k.toFixed(4)})">${markup}</g>`;
}
