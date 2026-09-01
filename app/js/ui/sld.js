/**
 * Génération du schéma unifilaire à partir du dimensionnement.
 *
 * Le schéma est produit en SVG pur : il reste net à l'impression, se télécharge
 * tel quel et s'ouvre dans n'importe quel éditeur vectoriel. Les symboles sont
 * dessinés à la main (pas d'images de fabricants) : le fichier reste léger et
 * librement diffusable.
 */

import { t } from '../i18n.js';
import { fmt } from './charts.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* --- Primitives de dessin ---------------------------------------- */

const wire = (x1, y1, x2, y2) => `<path class="w" d="M${x1},${y1} L${x2},${y2}"/>`;
const label = (x, y, text, cls = 'lb') => `<text class="${cls}" x="${x}" y="${y}">${esc(text)}</text>`;
const labelMid = (x, y, text, cls = 'lb') => `<text class="${cls}" x="${x}" y="${y}" text-anchor="middle">${esc(text)}</text>`;

/** Symbole de module photovoltaïque (rectangle barré en diagonale). */
function pvSymbol(x, y, w = 54, h = 34) {
  return `<g class="sym">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/>
    <path class="w" d="M${x},${y + h} L${x + w},${y}"/>
    <path class="w" d="M${x + w * 0.18},${y + h * 0.72} l10,-10 m-4,0 h4 v4"/>
  </g>`;
}

/**
 * Boîtier d'équipement : le symbole occupe la partie haute, les deux lignes
 * de texte la partie basse. Rien ne se superpose au dessin.
 */
function box(x, y, w, h, title, sub) {
  return `<g class="sym"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4"/>
    <path class="w" d="M${x},${y + h - 34} h${w}"/>
    ${labelMid(x + w / 2, y + h - 20, title, 'lb-b')}
    ${sub ? labelMid(x + w / 2, y + h - 7, sub) : ''}</g>`;
}

/** Fusible : rectangle traversé par le conducteur. */
const fuse = (x, y) => `<g class="sym"><rect x="${x - 7}" y="${y - 11}" width="14" height="22" rx="1"/>
  <path class="w" d="M${x},${y - 20} L${x},${y - 11} M${x},${y + 11} L${x},${y + 20}"/></g>`;

/** Sectionneur / disjoncteur : contact ouvert incliné. */
const breaker = (x, y) => `<g class="sym">
  <path class="w" d="M${x},${y - 18} L${x},${y - 7}"/>
  <path class="w" d="M${x},${y + 7} L${x},${y + 18}"/>
  <path class="w" d="M${x},${y + 7} L${x + 11},${y - 8}"/>
  <circle class="dot" cx="${x}" cy="${y - 7}" r="2.2"/><circle class="dot" cx="${x}" cy="${y + 7}" r="2.2"/></g>`;

/** Parafoudre : rectangle avec flèche vers la terre. */
const spd = (x, y) => `<g class="sym"><rect x="${x - 8}" y="${y - 10}" width="16" height="20" rx="1"/>
  <path class="w" d="M${x - 4},${y - 4} L${x + 4},${y + 4} m0,0 l-5,0 m5,0 l0,-5"/></g>`;

/** Prise de terre. */
const earth = (x, y) => `<g class="sym"><path class="w" d="M${x},${y - 12} L${x},${y}"/>
  <path class="w" d="M${x - 11},${y} h22 M${x - 7},${y + 4} h14 M${x - 3},${y + 8} h6"/></g>`;

/** Compteur d'énergie. */
const meter = (x, y) => `<g class="sym"><circle cx="${x}" cy="${y}" r="15"/>
  ${labelMid(x, y + 4, 'kWh', 'lb-s')}</g>`;

/** Raccourcit un libellé pour qu'il tienne dans le schéma. */
const short = (s, n = 34) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/* --- Schéma complet ----------------------------------------------- */

/**
 * Dessin du schéma unifilaire, dans son propre repère.
 * La mise en planche (cadre, cartouche, spécifications) est faite par
 * `sheet.js` ; ici on ne produit que le dessin.
 *
 * @param {object} r résultats de `computeAll`
 * @param {object} project projet courant
 * @returns {{markup:string, width:number, height:number}}
 */
export function sldDrawing(r, project) {
  const hasBattery = !!r.storage && (project.meta.systemType !== 'grid' || project.storage.enabled);
  const offgrid = project.meta.systemType === 'offgrid';
  const total = r.config.stringCount ?? 1;
  const shown = Math.min(total, 4);
  const c = r.cabling;

  const BOX_H = 104;
  const yTop = 46;           // première chaîne
  const rowGap = 64;
  const busX = 260;

  /* --- Chaînes de modules --- */
  let body = '';
  const x0 = 4;
  for (let i = 0; i < shown; i++) {
    const y = yTop + i * rowGap;
    body += pvSymbol(x0, y - 17) + pvSymbol(x0 + 62, y - 17);
    body += `<text class="lb-s" x="${x0 + 126}" y="${y + 4}">…</text>`;
    body += wire(x0 + 54, y, x0 + 62, y);
    body += wire(x0 + 118, y, busX - 34, y);
    body += label(x0, y - 24, `${t('sld.string')} ${i + 1} — ${r.config.seriesPerString} × ${fmt(r.module.pmax)} Wc`, 'lb-s');
    if (c.stringProt.required) {
      body += fuse(busX - 24, y);
      body += wire(busX - 24, y, busX, y);
    } else {
      body += wire(busX - 34, y, busX, y);
    }
  }
  if (total > shown) {
    body += label(x0, yTop + shown * rowGap - 8,
      `+ ${total - shown} ${t('array.strings').toLowerCase()} identiques`, 'lb-s');
  }

  const busTop = yTop - 22;
  const busBot = yTop + (shown - 1) * rowGap + 22;
  // Les blocs d'équipement sont centrés sur les chaînes, mais jamais assez haut
  // pour que leur légende vienne heurter le titre du schéma.
  const midY = Math.max(88, Math.round((busTop + busBot) / 2));
  const boxY = midY - BOX_H / 2;
  // Le jeu de barres descend jusqu'au départ vers le coffret continu.
  body += `<path class="w bus" d="M${busX},${Math.min(busTop, midY - 16)} `
    + `L${busX},${Math.max(busBot, midY + 16)}"/>`;

  /* --- Coffret de protection continu --- */
  const cbX = 316, cbW = 150;
  body += wire(busX, midY, cbX, midY);
  body += box(cbX, boxY, cbW, BOX_H, t('cabling.dcBreaker'),
    `${c.arrayProt.rating} A · ${fmt(r.config.vocStringCold)} V`);
  body += breaker(cbX + 44, boxY + 34);
  body += spd(cbX + 100, boxY + 34);
  body += wire(cbX + 100, boxY + 44, cbX + 100, boxY + 54);
  body += earth(cbX + 100, boxY + 54);
  body += label(cbX, boxY - 10,
    `DC : ${c.arraySection.section} mm² · ${fmt(c.arraySection.drop.percent, 2)} %`, 'lb-s');

  /* --- Onduleur --- */
  const invX = 536, invW = 160;
  body += wire(cbX + cbW, midY, invX, midY);
  body += box(invX, boxY, invW, BOX_H,
    `${r.nInverters > 1 ? r.nInverters + ' × ' : ''}${t('array.inverter')}`,
    `${fmt(r.inverter.pacNom / 1000, 1)} kW · ${r.inverter.phases === 3 ? '3~' : '1~'}`);
  const icx = invX + invW / 2, icy = boxY + 32;
  body += `<path class="w" d="M${icx - 34},${icy - 16} h22"/>`;
  body += `<path class="w" d="M${icx - 34},${icy - 8} h5 m5,0 h5 m5,0 h5"/>`;
  body += `<path class="w" d="M${icx + 6},${icy + 12} q9,-20 18,0 q9,20 18,0"/>`;
  body += `<path class="w" d="M${icx - 40},${icy + 22} L${icx + 40},${icy - 24}"/>`;
  body += label(invX, boxY - 10, short(r.inverter.label, 26), 'lb-s');

  /* --- Tableau alternatif --- */
  const acX = 772, acW = 150;
  body += wire(invX + invW, midY, acX, midY);
  body += box(acX, boxY, acW, BOX_H, t('cabling.acBreaker'),
    `${c.acProt.rating} A · ${r.inverter.phases === 3 ? '400 V' : '230 V'}`);
  body += breaker(acX + 44, boxY + 34);
  body += spd(acX + 100, boxY + 34);
  body += wire(acX + 100, boxY + 44, acX + 100, boxY + 54);
  body += earth(acX + 100, boxY + 54);
  body += label(acX, boxY - 10,
    `AC : ${c.acSection.section} mm² · ${fmt(c.acSection.drop.percent, 2)} %`, 'lb-s');

  /* --- Comptage et réseau (ou charges en site isolé) --- */
  const mX = 970;
  body += wire(acX + acW, midY, mX - 15, midY);
  body += meter(mX, midY);
  body += wire(mX + 15, midY, mX + 58, midY);
  if (offgrid) {
    body += box(mX + 58, midY - 34, 92, 68, t('load.title'), '');
  } else {
    const gx = mX + 74;
    body += `<g class="sym"><path class="w" d="M${gx},${midY - 20} L${gx},${midY + 20}"/>
      <path class="w" d="M${gx - 13},${midY - 12} h26 M${gx - 13},${midY} h26 M${gx - 13},${midY + 12} h26"/></g>`;
    body += labelMid(gx, midY + 38, r.inverter.phases === 3 ? '400 V 3~ 50 Hz' : '230 V 1~ 50 Hz', 'lb-s');
  }

  /* --- Branche batterie --- */
  let contentBottom = Math.max(busBot, midY + 16, boxY + BOX_H + 44);
  if (hasBattery) {
    const by = contentBottom + 62;
    const bx = invX + invW / 2;
    body += wire(bx, boxY + BOX_H, bx, by);
    body += wire(bx, by, bx + 96, by);
    body += breaker(bx + 60, by);
    body += box(bx + 96, by - 34, 230, 68, t('storage.battery'),
      `${fmt(r.storage.bank.installedKwh, 1)} kWh · ${fmt(r.storage.busVoltage)} V`);
    body += label(bx + 96, by - 42,
      `${r.storage.bank.series}S × ${r.storage.bank.parallel}P — ${short(r.storage.battery.label, 26)}`, 'lb-s');
    contentBottom = by + 44;
  }

  const width = 1180;
  const height = contentBottom + 20;
  return { markup: body, width, height };
}
