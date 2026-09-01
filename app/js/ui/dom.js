/** Fabriques de balisage réutilisées par toutes les vues. */

import { t } from '../i18n.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const card = (title, body, extra = '') =>
  `<section class="card">${title ? `<h2>${esc(title)}${extra}</h2>` : extra}${body}</section>`;

export const grid = (body, cols = 2) => `<div class="grid cols-${cols}">${body}</div>`;

/** Champ de saisie lié à un chemin du projet (`data-bind`). */
export function field({ label, bind, type = 'text', value, unit, step, min, max, hint, attrs = '' }) {
  const id = `f-${bind.replace(/\./g, '-')}`;
  return `<label class="field" for="${id}">
    <span class="field-label">${esc(label)}</span>
    <span class="field-input">
      <input id="${id}" type="${type}" data-bind="${bind}" value="${esc(value)}"
        ${step != null ? `step="${step}"` : ''} ${min != null ? `min="${min}"` : ''}
        ${max != null ? `max="${max}"` : ''} ${attrs}>
      ${unit ? `<span class="unit">${esc(unit)}</span>` : ''}
    </span>
    ${hint ? `<span class="field-hint">${esc(hint)}</span>` : ''}
  </label>`;
}

/** Liste déroulante liée à un chemin du projet. */
export function select({ label, bind, value, options, hint }) {
  const id = `f-${bind.replace(/\./g, '-')}`;
  const opts = options.map((o) =>
    `<option value="${esc(o.value)}"${String(o.value) === String(value) ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
  return `<label class="field" for="${id}">
    <span class="field-label">${esc(label)}</span>
    <span class="field-input"><select id="${id}" data-bind="${bind}" data-structural>${opts}</select></span>
    ${hint ? `<span class="field-hint">${esc(hint)}</span>` : ''}
  </label>`;
}

/** Interrupteur booléen. */
export function toggle({ label, bind, value, hint }) {
  const id = `f-${bind.replace(/\./g, '-')}`;
  return `<label class="field toggle" for="${id}">
    <span class="field-input">
      <input id="${id}" type="checkbox" data-bind="${bind}" data-structural${value ? ' checked' : ''}>
      <span class="switch" aria-hidden="true"></span>
    </span>
    <span class="field-label">${esc(label)}</span>
    ${hint ? `<span class="field-hint">${esc(hint)}</span>` : ''}
  </label>`;
}

/** Tuile d'indicateur. */
export const kpi = (label, value, unit, tone = '') =>
  `<div class="kpi ${tone}"><span class="kpi-label">${esc(label)}</span>
    <span class="kpi-value">${value}<span class="kpi-unit">${esc(unit ?? '')}</span></span></div>`;

/** Ligne de résultat calculé. */
export const stat = (label, value, tone = '') =>
  `<div class="stat ${tone}"><span>${esc(label)}</span><b>${value}</b></div>`;

/** Tableau simple. */
export function table(headers, rows, opts = {}) {
  return `<div class="table-wrap"><table class="${opts.class ?? ''}">
    <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c, i) =>
      `<td${i > 0 ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody>
    ${opts.foot ? `<tfoot><tr>${opts.foot.map((c, i) => `<td${i > 0 ? ' class="num"' : ''}>${c}</td>`).join('')}</tr></tfoot>` : ''}
  </table></div>`;
}

/** Bandeau d'alerte issu des vérifications du dimensionnement. */
export function warnings(list) {
  if (!list.length) return `<p class="notice ok">${esc(t('warn.none'))}</p>`;
  const seen = new Set();
  return list.filter((w) => {
    if (seen.has(w.code)) return false;
    seen.add(w.code); return true;
  }).map((w) => `<p class="notice ${w.level}">${esc(t(`warn.${w.code}`))}</p>`).join('');
}
