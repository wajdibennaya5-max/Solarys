/**
 * Graphiques en SVG, sans dépendance externe.
 *
 * Chaque graphique reste sur un seul axe de valeurs, porte une légende dès
 * qu'il compte deux séries, et expose une infobulle au survol. Les couleurs
 * viennent de variables CSS (`--series-n`), ce qui permet de décliner les
 * thèmes clair et sombre sans toucher au code.
 */

import { t, locale } from '../i18n.js';

const NS = 'http://www.w3.org/2000/svg';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const fmt = (v, digits = 0) =>
  new Intl.NumberFormat(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v ?? 0);

export const fmtCompact = (v) =>
  new Intl.NumberFormat(locale(), { notation: 'compact', maximumFractionDigits: 1 }).format(v ?? 0);

const monthLabels = () => Array.from({ length: 12 }, (_, i) => t(`month.${i + 1}`));

/** Graduations « rondes » couvrant [0, max]. */
function niceTicks(max, count = 5) {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const ticks = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v);
  return ticks;
}

/** Enveloppe commune : cadre, grille et axes discrets. */
function frame({ width, height, pad, ticks, xLabels, yFormat = fmtCompact, title }) {
  const [pt, pr, pb, pl] = pad;
  const w = width - pl - pr, h = height - pt - pb;
  const maxTick = ticks.at(-1);
  const y = (v) => pt + h - (v / maxTick) * h;
  let g = '';
  for (const tk of ticks) {
    g += `<line class="grid" x1="${pl}" y1="${y(tk).toFixed(1)}" x2="${pl + w}" y2="${y(tk).toFixed(1)}"/>`;
    g += `<text class="axis" x="${pl - 8}" y="${(y(tk) + 4).toFixed(1)}" text-anchor="end">${esc(yFormat(tk))}</text>`;
  }
  let x = '';
  if (xLabels) {
    const step = w / xLabels.length;
    xLabels.forEach((lb, i) => {
      x += `<text class="axis" x="${(pl + step * (i + 0.5)).toFixed(1)}" y="${pt + h + 18}" text-anchor="middle">${esc(lb)}</text>`;
    });
  }
  return { w, h, pt, pl, y, grid: g + x, title };
}

function legend(items) {
  if (items.length < 2) return '';
  return `<div class="legend">${items.map((i) =>
    `<span class="legend-item"><span class="swatch" style="background:${i.color}"></span>${esc(i.label)}</span>`).join('')}</div>`;
}

/**
 * Production mensuelle (barres) comparée à la consommation (ligne).
 * Une seule échelle : les deux séries sont en kWh.
 */
export function monthlyChart({ production, consumption, width = 980, height = 300 }) {
  const labels = monthLabels();
  const max = Math.max(...production, ...(consumption ?? [0]));
  const ticks = niceTicks(max);
  const f = frame({ width, height, pad: [16, 12, 34, 52], ticks, xLabels: labels });
  const step = f.w / 12;
  const bw = Math.min(26, step * 0.5);

  let bars = '';
  production.forEach((v, i) => {
    const cx = f.pl + step * (i + 0.5);
    const yv = f.y(v), hh = Math.max(0, f.pt + f.h - yv);
    bars += `<rect class="mark" data-i="${i}" x="${(cx - bw / 2).toFixed(1)}" y="${yv.toFixed(1)}" `
      + `width="${bw.toFixed(1)}" height="${hh.toFixed(1)}" rx="4" fill="var(--series-2)"/>`;
  });

  let line = '';
  if (consumption) {
    const pts = consumption.map((v, i) => `${(f.pl + step * (i + 0.5)).toFixed(1)},${f.y(v).toFixed(1)}`).join(' ');
    line = `<polyline class="series-line" points="${pts}" fill="none" stroke="var(--series-1)" stroke-width="2"/>`
      + consumption.map((v, i) =>
        `<circle class="dot" cx="${(f.pl + step * (i + 0.5)).toFixed(1)}" cy="${f.y(v).toFixed(1)}" r="4" `
        + `fill="var(--series-1)" stroke="var(--surface-1)" stroke-width="2"/>`).join('');
  }

  // Zones de survol : une bande par mois, plus large que les marques.
  const hot = labels.map((lb, i) => {
    const tip = [`${lb}`,
      `${t('production.energy')} : ${fmt(production[i])} kWh`,
      consumption ? `${t('load.title')} : ${fmt(consumption[i])} kWh` : null].filter(Boolean).join('\n');
    return `<rect class="hot" x="${(f.pl + step * i).toFixed(1)}" y="${f.pt}" width="${step.toFixed(1)}" `
      + `height="${f.h.toFixed(1)}" fill="transparent" data-tip="${esc(tip)}"/>`;
  }).join('');

  return `<figure class="chart">
    <div class="chart-box"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(t('production.monthly'))}">
      ${f.grid}${bars}${line}${hot}
    </svg></div>
    ${legend([
      { label: t('production.energy'), color: 'var(--series-2)' },
      ...(consumption ? [{ label: t('load.title'), color: 'var(--series-1)' }] : []),
    ])}
  </figure>`;
}

/**
 * Cascade des pertes : de la production théorique à l'énergie livrée.
 * Une seule série — la longueur de la barre porte la magnitude.
 */
export function lossChart({ breakdown, width = 980 }) {
  const steps = breakdown.steps.filter((s) => s.loss > 0.5);
  const rowH = 26, padL = 168, padR = 84;
  const height = steps.length * rowH + 44;
  const max = Math.max(...steps.map((s) => s.loss));
  const w = width - padL - padR;

  const rows = steps.map((s, i) => {
    const y = 20 + i * rowH;
    const bw = Math.max(2, (s.loss / max) * w);
    const pct = (1 - s.factor) * 100;
    return `<text class="axis" x="${padL - 10}" y="${y + 14}" text-anchor="end">${esc(t(`loss.${s.key}`))}</text>`
      + `<rect class="mark hot" x="${padL}" y="${y + 3}" width="${bw.toFixed(1)}" height="${rowH - 10}" rx="4" `
      + `fill="var(--series-1)" data-tip="${esc(`${t(`loss.${s.key}`)}\n−${fmt(s.loss)} kWh (${fmt(pct, 1)} %)`)}"/>`
      + `<text class="value" x="${(padL + bw + 8).toFixed(1)}" y="${y + 14}">−${fmt(pct, 1)} %</text>`;
  }).join('');

  return `<figure class="chart"><div class="chart-box">
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(t('production.losses'))}">${rows}</svg>
  </div></figure>`;
}

/** Flux de trésorerie cumulé — série unique, avec la ligne du seuil de rentabilité. */
export function cashflowChart({ rows, currency = '€', width = 980, height = 280 }) {
  const values = rows.map((r) => r.cumulative);
  const min = Math.min(0, ...values), max = Math.max(0, ...values);
  const span = max - min || 1;
  const pad = [16, 16, 30, 62];
  const w = width - pad[3] - pad[1], h = height - pad[0] - pad[2];
  const x = (i) => pad[3] + (i / (rows.length - 1)) * w;
  const y = (v) => pad[0] + h - ((v - min) / span) * h;
  const zero = y(0);

  const ticks = [min, min + span / 2, max];
  const grid = ticks.map((v) =>
    `<line class="grid" x1="${pad[3]}" y1="${y(v).toFixed(1)}" x2="${pad[3] + w}" y2="${y(v).toFixed(1)}"/>`
    + `<text class="axis" x="${pad[3] - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${esc(fmtCompact(v))}</text>`).join('');

  const pts = rows.map((r, i) => `${x(i).toFixed(1)},${y(r.cumulative).toFixed(1)}`).join(' ');
  const area = `<polygon points="${pad[3]},${zero.toFixed(1)} ${pts} ${(pad[3] + w).toFixed(1)},${zero.toFixed(1)}" fill="var(--series-1)" opacity="0.14"/>`;

  const step = w / (rows.length - 1);
  const hot = rows.map((r, i) =>
    `<rect class="hot" x="${(x(i) - step / 2).toFixed(1)}" y="${pad[0]}" width="${step.toFixed(1)}" height="${h.toFixed(1)}" `
    + `fill="transparent" data-tip="${esc(`${t('economics.year')} ${r.year}\n${fmt(r.cumulative)} ${currency}`)}"/>`).join('');

  const xLabels = [0, 5, 10, 15, 20, 25].filter((n) => n < rows.length).map((n) =>
    `<text class="axis" x="${x(n).toFixed(1)}" y="${height - 10}" text-anchor="middle">${n}</text>`).join('');

  return `<figure class="chart"><div class="chart-box">
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(t('economics.cashflow'))}">
      ${grid}${area}
      <line class="zero" x1="${pad[3]}" y1="${zero.toFixed(1)}" x2="${pad[3] + w}" y2="${zero.toFixed(1)}"/>
      <polyline points="${pts}" fill="none" stroke="var(--series-1)" stroke-width="2"/>
      ${xLabels}${hot}
    </svg></div></figure>`;
}

/** Répartition autoconsommation / injection — anneau à deux parts. */
export function donutChart({ parts, width = 200 }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const r = 74, ring = 22, cx = 100, cy = 100;
  let a0 = -Math.PI / 2;
  const arcs = parts.map((p, i) => {
    const a1 = a0 + (p.value / total) * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const [x0, y0] = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)];
    const [x1, y1] = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
    a0 = a1;
    return `<path class="hot" d="M${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)}" `
      + `fill="none" stroke="var(--series-${i === 0 ? 3 : 1})" stroke-width="${ring}" stroke-linecap="butt" `
      + `data-tip="${esc(`${p.label}\n${fmt(p.value)} kWh (${fmt(p.value / total * 100)} %)`)}"/>`;
  }).join('');

  const head = fmt((parts[0]?.value ?? 0) / total * 100);
  return `<figure class="chart donut"><div class="chart-box">
    <svg viewBox="0 0 200 200" width="${width}" role="img" aria-label="${esc(t('kpi.selfuse'))}">
      ${arcs}
      <text class="donut-value" x="100" y="100" text-anchor="middle" dominant-baseline="central">${head} %</text>
      <text class="donut-label" x="100" y="126" text-anchor="middle">${esc(t('kpi.selfuse'))}</text>
    </svg></div>
    ${legend(parts.map((p, i) => ({ label: p.label, color: `var(--series-${i === 0 ? 3 : 1})` })))}
  </figure>`;
}

/**
 * Active les infobulles sur tous les graphiques d'un conteneur.
 * Une seule infobulle est partagée, positionnée au pointeur.
 */
export function bindTooltips(root) {
  let tip = root.querySelector('.chart-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;
    root.appendChild(tip);
  }
  const show = (e) => {
    const target = e.target.closest('[data-tip]');
    if (!target) { tip.hidden = true; return; }
    tip.textContent = target.dataset.tip;
    tip.hidden = false;
    const r = root.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    tip.style.left = `${Math.min(x + 14, r.width - tip.offsetWidth - 8)}px`;
    tip.style.top = `${Math.max(y - tip.offsetHeight - 12, 4)}px`;
  };
  root.addEventListener('pointermove', show);
  root.addEventListener('pointerleave', () => { tip.hidden = true; });
}
