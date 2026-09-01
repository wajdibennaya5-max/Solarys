/**
 * Dossier d'exécution : la suite de planches produite à partir d'un projet.
 *
 * Chaque planche partage le même cadre et le même cartouche, et porte son
 * folio. L'ensemble s'exporte en SVG planche par planche, ou s'imprime d'un
 * bloc au format retenu.
 */

import { t } from '../i18n.js';
import { fmt } from './charts.js';
import { buildSheet, place, FORMATS } from './sheet.js';
import { sldDrawing } from './sld.js';
import { saveFile } from '../download.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Tableau « description générale de la centrale », alimenté par le calcul. */
export function generalSpecs(r, project) {
  const gps = (project.site.lat != null && project.site.lon != null)
    ? `${fmt(project.site.lat, 4)}°N , ${fmt(project.site.lon, 4)}°E` : '—';
  const disposition = project.meta.installType === 'ground' ? 'AU SOL'
    : project.meta.installType === 'carport' ? 'OMBRIÈRE' : 'TOITURE';
  return [{
    title: 'DESCRIPTION GÉNÉRALE DE LA CENTRALE',
    rows: [
      ['PUISSANCE DC (kWc)', fmt(r.kwp, 3)],
      ['PUISSANCE AC (kVA)', fmt(r.inverter.pacNom * r.nInverters / 1000, 1)],
      ['NO. MODULES', String(r.moduleCount)],
      ['RÉPARTITION DES CHAÎNES', `${r.config.stringCount}×${r.config.seriesPerString}`],
      ['NOMBRE DE CHAÎNES', String(r.config.stringCount * r.nInverters)],
      ['TYPE DE MODULE', r.module.label],
      ['DIMENSIONS (mm)', `${Math.round(r.module.length * 1000)}×${Math.round(r.module.width * 1000)}`],
      ['DISPOSITION DES MODULES', disposition],
      ["ANGLE D'INCLINAISON", `${fmt(r.tilt)}°`],
      ['AZIMUT', `${fmt(r.azimuth)}°`],
      ['ONDULEURS', r.inverter.label],
      ['PUISSANCE ONDULEUR (kVA)', fmt(r.inverter.pacNom / 1000, 1)],
      ['NO. ONDULEURS', String(r.nInverters)],
      ['DC / AC RATIO', fmt(r.config.dcAcRatio, 2)],
      ['PRODUCTION (kWh/an)', fmt(r.production.annual.ac)],
      ['PRODUCTIBLE (kWh/kWc)', fmt(r.production.annual.specificYield)],
      ['COORDONNÉES GPS', gps],
      ['ADRESSE', project.meta.address || r.site.city],
    ],
  }];
}

/* ------------------------------------------------------------------ */

/** Planche 1 — page de garde. */
function coverSheet(r, project, pro) {
  return buildSheet({
    project, pro, title: 'PAGE DE GARDE', folio: '1.1',
    docNo: project.dossier?.documentNo,
    draw: (a) => {
      const cx = a.x + a.w / 2, cy = a.y + a.h / 2;
      return `<text class="t" x="${cx}" y="${cy - 40}" text-anchor="middle" style="font-size:34px">`
        + `INSTALLATION PHOTOVOLTAÏQUE</text>`
        + `<text class="t" x="${cx}" y="${cy + 6}" text-anchor="middle" style="font-size:30px">`
        + `${esc((project.meta.name || '').toUpperCase())}</text>`
        + `<text class="t" x="${cx}" y="${cy + 52}" text-anchor="middle" style="font-size:30px">`
        + `${esc(fmt(r.kwp, 3))} kWc</text>`;
    },
  });
}

/** Planche 2 — schéma unifilaire général. */
function sldSheet(r, project, pro) {
  const d = sldDrawing(r, project);
  const notes = [
    'Les sections de câbles sont déterminées par le plus contraignant des critères '
      + "de courant admissible et de chute de tension.",
    `Chute de tension retenue : ${fmt(project.cabling.maxDropDc, 1)} % côté continu, `
      + `${fmt(project.cabling.maxDropAc, 1)} % côté alternatif.`,
    `Tensions calculées à ${fmt(project.site.tMin)} °C (Voc) et `
      + `${fmt(Number(project.site.tMaxAmb) + 25)} °C de cellule (Vmpp).`,
  ];
  const legend = [
    { symbol: '<g><rect class="r" x="0" y="-7" width="22" height="14"/><path class="w" d="M0,7 L22,-7"/></g>',
      label: 'MODULE PHOTOVOLTAÏQUE' },
    { symbol: '<g><rect class="r" x="0" y="-8" width="12" height="16"/><path class="w" d="M6,-14 v6 M6,8 v6"/></g>',
      label: 'FUSIBLE gPV' },
    { symbol: '<g><path class="w" d="M4,-10 v6 M4,4 v6 M4,4 L14,-6"/></g>',
      label: 'SECTIONNEUR / DISJONCTEUR' },
    { symbol: '<g><rect class="r" x="0" y="-8" width="16" height="16"/><path class="w" d="M4,-3 L12,4 m0,0 l-5,0 m5,0 l0,-5"/></g>',
      label: 'PARAFOUDRE' },
    { symbol: '<g><path class="w" d="M8,-10 v8 M-3,-2 h22 M1,2 h14 M5,6 h6"/></g>',
      label: 'PRISE DE TERRE' },
    { symbol: '<g><circle class="r" cx="10" cy="0" r="9"/><text class="s" x="10" y="3" text-anchor="middle">kWh</text></g>',
      label: 'COMPTAGE D\'ÉNERGIE' },
  ];
  return buildSheet({
    project, pro, title: 'SCHÉMA UNIFILAIRE GÉNÉRAL', folio: '1.2',
    docNo: project.dossier?.documentNo,
    specs: generalSpecs(r, project),
    notes, legend,
    draw: (a) => place(d.markup, { srcW: d.width, srcH: d.height, area: a }),
  });
}

/** Planche 3 — câbles, protections et bilan de puissance. */
function cableSheet(r, project, pro) {
  const c = r.cabling;
  const cur = project.economics.currencySymbol || '€';

  const drawTable = (x, y, w, title, head, rows) => {
    const rowH = 20, headH = 22;
    const colW = head.map((h) => w * h.f);
    const cx = colW.reduce((acc, v) => (acc.push(acc.at(-1) + v), acc), [x]);
    let m = `<text class="b" x="${x}" y="${y - 7}">${esc(title)}</text>`;
    m += `<rect class="r2" x="${x}" y="${y}" width="${w}" height="${headH}"/>`;
    head.forEach((h, i) => {
      if (i > 0) m += `<path class="r" d="M${cx[i]},${y} L${cx[i]},${y + headH + rows.length * rowH}"/>`;
      m += `<text class="h" x="${cx[i] + colW[i] / 2}" y="${y + headH - 7}" text-anchor="middle">${esc(h.label)}</text>`;
    });
    rows.forEach((row, ri) => {
      const ry = y + headH + ri * rowH;
      m += `<rect class="r" x="${x}" y="${ry}" width="${w}" height="${rowH}"/>`;
      row.forEach((cell, i) => {
        m += `<text class="c" x="${i === 0 ? cx[i] + 6 : cx[i] + colW[i] / 2}" y="${ry + rowH - 6}" `
          + `text-anchor="${i === 0 ? 'start' : 'middle'}">${esc(cell)}</text>`;
      });
    });
    return { markup: m, height: headH + rows.length * rowH };
  };

  return buildSheet({
    project, pro, title: 'CÂBLES ET PROTECTIONS', folio: '1.3',
    docNo: project.dossier?.documentNo,
    specs: generalSpecs(r, project),
    draw: (a) => {
      let m = '', y = a.y + 26;
      const cables = drawTable(a.x, y, a.w, 'TABLEAU DES CÂBLES',
        [{ label: 'LIAISON', f: 0.28 }, { label: 'LONGUEUR', f: 0.12 },
          { label: 'SECTION', f: 0.12 }, { label: 'I ADMISSIBLE', f: 0.14 },
          { label: 'ΔU', f: 0.12 }, { label: 'CRITÈRE DIMENSIONNANT', f: 0.22 }],
        [
          [t('cabling.stringCable'), `${project.cabling.stringLengthM} m`,
            `${c.stringSection.section} mm²`, `${fmt(c.stringSection.ampacity, 1)} A`,
            `${fmt(c.stringSection.drop.percent, 2)} %`,
            t(c.stringSection.governing === 'drop' ? 'cabling.byDrop' : 'cabling.byAmpacity')],
          [t('cabling.arrayCable'), `${project.cabling.arrayLengthM} m`,
            `${c.arraySection.section} mm²`, `${fmt(c.arraySection.ampacity, 1)} A`,
            `${fmt(c.arraySection.drop.percent, 2)} %`,
            t(c.arraySection.governing === 'drop' ? 'cabling.byDrop' : 'cabling.byAmpacity')],
          [t('cabling.acCable'), `${project.cabling.acLengthM} m`,
            `${c.acSection.section} mm²`, `${fmt(c.acSection.ampacity, 1)} A`,
            `${fmt(c.acSection.drop.percent, 2)} %`,
            t(c.acSection.governing === 'drop' ? 'cabling.byDrop' : 'cabling.byAmpacity')],
        ]);
      m += cables.markup; y += cables.height + 46;

      const prot = drawTable(a.x, y, a.w, 'TABLEAU DES PROTECTIONS',
        [{ label: 'REPÈRE', f: 0.28 }, { label: 'TYPE', f: 0.30 },
          { label: 'CALIBRE', f: 0.20 }, { label: 'QUANTITÉ', f: 0.22 }],
        [
          [t('cabling.stringFuse'), 'Fusible gPV',
            c.stringProt.required ? `${c.stringProt.rating} A` : '—',
            c.stringProt.required ? String(r.config.stringCount * 2 * r.nInverters) : '0'],
          [t('cabling.dcBreaker'), 'Interrupteur-sectionneur DC',
            `${c.arrayProt.rating} A`, String(r.nInverters)],
          [t('cabling.acBreaker'), `Disjoncteur ${c.acProt.phases === 3 ? '4P' : '2P'}`,
            `${c.acProt.rating} A`, String(r.nInverters)],
          [t('cabling.surge'), c.surge.type,
            c.surge.dcRequired || c.surge.acRequired ? 'DC + AC' : '—',
            String((c.surge.dcRequired ? 1 : 0) + (c.surge.acRequired ? 1 : 0))],
        ]);
      m += prot.markup; y += prot.height + 46;

      const bom = drawTable(a.x, y, a.w, 'NOMENCLATURE',
        [{ label: 'DÉSIGNATION', f: 0.52 }, { label: 'QUANTITÉ', f: 0.16 },
          { label: 'P.U.', f: 0.16 }, { label: 'TOTAL', f: 0.16 }],
        r.economics.bom.map((b) => [b.label, `${fmt(b.qty)} ${b.unit}`,
          `${fmt(b.price, 2)} ${cur}`, `${fmt(b.total)} ${cur}`])
          .concat([['TOTAL', '', '', `${fmt(r.economics.capex)} ${cur}`]]));
      m += bom.markup;
      return m;
    },
  });
}

/* ------------------------------------------------------------------ */

/** Construit l'ensemble des planches du dossier. */
export function buildDossier(r, project, { pro = false } = {}) {
  return [
    { folio: '1.1', title: 'Page de garde', svg: coverSheet(r, project, pro) },
    { folio: '1.2', title: 'Schéma unifilaire général', svg: sldSheet(r, project, pro) },
    { folio: '1.3', title: 'Câbles, protections et nomenclature', svg: cableSheet(r, project, pro) },
  ];
}

/** Télécharge une planche au format SVG. */
export function downloadSheet(svg, filename) {
  saveFile(svg, filename, 'image/svg+xml;charset=utf-8');
}

export { FORMATS };
