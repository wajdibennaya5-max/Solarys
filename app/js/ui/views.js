/** Rendu des sections de l'application. Chaque vue est une fonction pure
 *  (projet, résultats) → balisage HTML. */

import { t, LANGUAGES } from '../i18n.js';
import { SITES, MODULES, INVERTERS, BATTERIES, annualConsumption } from '../state.js';
import { annualGhi } from '../data/sites.js';
import { card, grid, field, select, toggle, kpi, stat, table, warnings, esc } from './dom.js';
import { fmt, monthlyChart, lossChart, cashflowChart, donutChart } from './charts.js';
import { buildDossier } from './dossier.js';
import { planView } from './plan2d.js';
import { OBSTACLE_KINDS } from '../model/surface.js';
import { readKey, format as formatKey, isUnlimited, isProjectUnlocked,
  canUnlock, remainingCredits } from '../licence.js';
import { OFFRES, ORDRE, estOuverte, lienAchat } from '../boutique.js';

const cur = (p) => p.economics.currencySymbol || '€';
const money = (v, p, d = 0) => `${fmt(v, d)} ${cur(p)}`;
const pct = (v, d = 1) => `${fmt(v * 100, d)} %`;

/* ------------------------------------------------------------------ */

export function dashboard(p, r) {
  const e = r.economics;
  const tiles = [
    kpi(t('kpi.kwp'), fmt(r.kwp, 2), t('unit.kwp'), 'accent'),
    kpi(t('kpi.production'), fmt(r.production.annual.ac), t('unit.kwhYear')),
    kpi(t('kpi.specific'), fmt(r.production.annual.specificYield), t('unit.kwhKwp')),
    kpi(t('kpi.pr'), pct(r.production.annual.performanceRatio), ''),
    kpi(t('kpi.capex'), fmt(e.capex), cur(p)),
    kpi(t('kpi.payback'), e.payback ? fmt(e.payback, 1) : '—', t('unit.years')),
    kpi(t('kpi.irr'), e.irr != null ? pct(e.irr) : '—', ''),
    kpi(t('kpi.co2'), fmt(r.carbon.avoidedTons), t('unit.tons')),
  ].join('');

  const summary = [
    stat(t('kpi.modules'), `${r.moduleCount} × ${esc(r.module.label)}`),
    stat(t('array.series'), `${r.config.seriesPerString}S × ${r.config.stringCount}P`),
    stat(t('array.inverter'), `${r.nInverters} × ${esc(r.inverter.label)}`),
    stat(t('array.dcac'), fmt(r.config.dcAcRatio, 2)),
    stat(t('kpi.area'), `${fmt(r.config.arrayAreaM2 * r.nInverters, 1)} m²`),
    stat(t('site.tilt'), `${fmt(r.tilt)} ° / ${fmt(r.azimuth)} °`),
    stat(t('kpi.coverage'), pct(r.selfConsumption.coverage)),
    stat(t('kpi.savings'), money(e.year1Savings, p)),
  ].join('');

  const balance = donutChart({
    parts: [
      { label: t('kpi.selfuse'), value: r.selfConsumption.selfUsed },
      { label: t('economics.tariffSell'), value: r.selfConsumption.exported },
    ],
  });

  return `<div class="kpis">${tiles}</div>
    ${grid(
      card(t('production.monthly'), monthlyChart({
        production: r.production.months.map((m) => m.ac),
        consumption: monthlyLoad(p, r),
      })) +
      card(t('production.balance'), `<div class="split">${balance}<div class="stats">${summary}</div></div>`), 1)}
    ${card(t('warn.title'), warnings(r.warnings))}
    <p class="disclaimer">${esc(t('disclaimer.short'))}</p>`;
}

/** Répartition mensuelle de la consommation, pour comparaison graphique. */
function monthlyLoad(p, r) {
  if (p.load.mode === 'monthly' && Array.isArray(p.load.monthlyKwh)) {
    return p.load.monthlyKwh.map((v) => Number(v) || 0);
  }
  const total = annualConsumption(p);
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  // Profils saisonniers indicatifs, normalisés sur l'année.
  const shape = {
    residential: [1.15, 1.10, 1.02, 0.92, 0.88, 0.92, 0.98, 0.98, 0.90, 0.96, 1.06, 1.13],
    office: [1.05, 1.02, 0.98, 0.94, 0.98, 1.06, 1.08, 0.92, 0.98, 0.98, 1.00, 1.01],
    industrial: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.85, 0.80, 1.0, 1.0, 1.0, 1.0],
  }[p.load.profile] ?? [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
  const weights = shape.map((s, i) => s * days[i]);
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => total * w / sum);
}

/* ------------------------------------------------------------------ */

export function project(p) {
  return card(t('project.title'), grid(
    field({ label: t('project.name'), bind: 'meta.name', value: p.meta.name }) +
    field({ label: t('project.reference'), bind: 'meta.reference', value: p.meta.reference }) +
    field({ label: t('project.client'), bind: 'meta.client', value: p.meta.client }) +
    field({ label: t('project.engineer'), bind: 'meta.engineer', value: p.meta.engineer }) +
    field({ label: t('project.address'), bind: 'meta.address', value: p.meta.address }) +
    select({
      label: t('project.systemType'), bind: 'meta.systemType', value: p.meta.systemType,
      options: ['grid', 'hybrid', 'offgrid'].map((v) => ({ value: v, label: t(`project.type.${v}`) })),
    }) +
    select({
      label: t('project.installType'), bind: 'meta.installType', value: p.meta.installType,
      options: ['roof', 'ground', 'carport'].map((v) => ({ value: v, label: t(`project.install.${v}`) })),
    }),
  ));
}

/* ------------------------------------------------------------------ */

export function site(p, r) {
  const s = r.site;
  const monthly = table(
    [t('production.month'), t('site.ghi') + ' (kWh/m²/j)', t('site.ta') + ' (°C)', t('production.poa') + ' (kWh/m²/j)'],
    r.production.months.map((m) => [
      t(`month.${m.month + 1}`), fmt(r.ghi[m.month], 2), fmt(r.ta[m.month], 1), fmt(m.poaDaily, 2),
    ]),
  );

  return card(t('site.title'), grid(
    select({
      label: t('site.city'), bind: 'site.siteId', value: p.site.siteId,
      options: SITES.map((x) => ({ value: x.id, label: `${x.city} — ${x.country}` })),
    }) +
    field({ label: t('site.lat'), bind: 'site.lat', type: 'number', step: '0.01', value: p.site.lat, unit: '°' }) +
    field({ label: t('site.lon'), bind: 'site.lon', type: 'number', step: '0.01', value: p.site.lon, unit: '°' }) +
    field({ label: t('site.albedo'), bind: 'site.albedo', type: 'number', step: '0.05', min: 0, max: 0.9, value: p.site.albedo }) +
    field({ label: t('site.tMin'), bind: 'site.tMin', type: 'number', step: '1', value: p.site.tMin, unit: '°C' }) +
    field({ label: t('site.tMaxAmb'), bind: 'site.tMaxAmb', type: 'number', step: '1', value: p.site.tMaxAmb, unit: '°C' }) +
    toggle({ label: t('site.autoTilt'), bind: 'site.autoTilt', value: p.site.autoTilt }) +
    field({
      label: t('site.tilt'), bind: 'site.tilt', type: 'number', step: '1', min: 0, max: 90,
      value: p.site.autoTilt ? r.tilt : p.site.tilt, unit: '°',
      attrs: p.site.autoTilt ? 'disabled' : '',
    }) +
    field({
      label: t('site.azimuth'), bind: 'site.azimuth', type: 'number', step: '5', min: -180, max: 180,
      value: p.site.azimuth, unit: '°', hint: t('site.azimuthHint'),
    }),
  ) +
  `<div class="stats row">
    ${stat(t('site.annualGhi'), `${fmt(annualGhi({ ghi: r.ghi }))} kWh/m²`)}
    ${stat(t('production.poa'), `${fmt(r.production.annual.poa)} kWh/m²`)}
    ${stat(t('site.poaGain'), `+${fmt((r.production.annual.transpositionGain - 1) * 100, 1)} %`)}
  </div>
  <p class="notice info">${esc(t('site.dataNotice'))}</p>` + monthly);
}

/* ------------------------------------------------------------------ */

export function load(p, r) {
  const l = p.load;
  let inputs = '';
  if (l.mode === 'bill') {
    inputs = field({ label: t('load.annualKwh'), bind: 'load.annualKwh', type: 'number', step: '100', value: l.annualKwh, unit: 'kWh' });
  } else if (l.mode === 'monthly') {
    const vals = l.monthlyKwh ?? Array(12).fill(Math.round((l.annualKwh || 0) / 12));
    inputs = `<div class="grid cols-4">${vals.map((v, i) =>
      field({ label: t(`month.${i + 1}`), bind: `load.monthlyKwh.${i}`, type: 'number', step: '10', value: v, unit: 'kWh' })).join('')}</div>`;
  } else {
    const rows = (l.appliances ?? []).map((a, i) => `<tr>
      <td><input data-bind="load.appliances.${i}.name" value="${esc(a.name)}"></td>
      <td class="num"><input type="number" step="10" data-bind="load.appliances.${i}.power" value="${esc(a.power)}"></td>
      <td class="num"><input type="number" step="0.5" data-bind="load.appliances.${i}.hours" value="${esc(a.hours)}"></td>
      <td class="num"><input type="number" step="1" min="1" data-bind="load.appliances.${i}.qty" value="${esc(a.qty)}"></td>
      <td class="num">${fmt((a.power * a.hours * (a.qty || 1)) / 1000, 2)}</td>
      <td><button class="icon" data-action="removeAppliance" data-index="${i}" aria-label="${esc(t('action.delete'))}">×</button></td>
    </tr>`).join('');
    inputs = `<div class="table-wrap"><table>
      <thead><tr><th>${esc(t('load.appliance'))}</th><th>${esc(t('load.power'))} (W)</th>
      <th>${esc(t('load.hours'))}</th><th>${esc(t('load.qty'))}</th><th>kWh/${esc(t('unit.day'))}</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <button class="btn" data-action="addAppliance">+ ${esc(t('load.addAppliance'))}</button>`;
  }

  const total = annualConsumption(p);
  return card(t('load.title'),
    grid(
      select({
        label: t('load.mode'), bind: 'load.mode', value: l.mode,
        options: ['bill', 'monthly', 'appliances'].map((v) => ({ value: v, label: t(`load.mode.${v}`) })),
      }) +
      select({
        label: t('load.profile'), bind: 'load.profile', value: l.profile,
        options: ['residential', 'office', 'industrial'].map((v) => ({ value: v, label: t(`load.profile.${v}`) })),
      }) +
      field({ label: t('load.peakLoad'), bind: 'load.peakLoadW', type: 'number', step: '100', value: l.peakLoadW, unit: 'W' }),
    ) + inputs +
    `<div class="stats row">
      ${stat(t('load.annualKwh'), `${fmt(total)} kWh`)}
      ${stat(t('load.daily'), `${fmt(total / 365, 1)} kWh`)}
      ${stat(t('kpi.coverage'), pct(r.selfConsumption.coverage))}
    </div>`);
}

/* ------------------------------------------------------------------ */

/**
 * Section Calepinage : les surfaces, leurs obstacles, et la vue en plan qui
 * montre où les modules tombent réellement.
 */
export function layout(p, r) {
  const surfaces = p.surfaces ?? [];
  const layouts = r.field?.layouts ?? [];

  const resume = `<div class="stats row">
    ${stat(t('sizing.fits'), `${fmt(r.field?.totalKwp ?? 0, 2)} ${t('unit.kwp')}`, 'good')}
    ${stat(t('kpi.modules'), String(r.field?.totalCount ?? 0))}
    ${stat(t('kpi.kwp'), `${fmt(r.kwp, 2)} ${t('unit.kwp')}`)}
    ${stat(t('surface.title'), String(surfaces.length))}
  </div>`;

  const mode = card(t('sizing.mode'),
    grid(select({
      label: t('sizing.mode'), bind: 'array.sizingMode',
      value: p.array.sizingMode ?? (p.array.autoTarget ? 'demand' : 'manual'),
      options: ['demand', 'surface', 'manual'].map((v) => ({ value: v, label: t(`sizing.mode.${v}`) })),
    }), 1) + resume + warnings(r.warnings.filter((w) => w.code.startsWith('layout.'))));

  const cartes = surfaces.map((sf, i) => surfaceCard(p, r, sf, i, layouts[i])).join('');

  return mode + cartes + card('', `<div class="row-actions">
    <button class="btn primary" data-action="addSurface">+ ${esc(t('surface.add'))}</button>
  </div>`);
}

/** Une surface : ses paramètres, ses obstacles, et son plan. */
function surfaceCard(p, r, sf, i, lay) {
  const b = `surfaces.${i}`;
  const tilted = sf.mounting === 'tilted';

  const params = grid(
    field({ label: t('surface.name'), bind: `${b}.name`, value: sf.name }) +
    select({
      label: t('surface.mounting'), bind: `${b}.mounting`, value: sf.mounting,
      options: ['coplanar', 'tilted'].map((v) => ({ value: v, label: t(`surface.mounting.${v}`) })),
    }) +
    field({ label: t('surface.width'), bind: `${b}.width`, type: 'number', step: '0.1', min: 1, value: sf.width, unit: 'm' }) +
    field({ label: t('surface.depth'), bind: `${b}.depth`, type: 'number', step: '0.1', min: 1, value: sf.depth, unit: 'm' }) +
    (tilted
      ? field({ label: t('surface.frameTilt'), bind: `${b}.constraints.frameTilt`, type: 'number', step: '1', min: 0, max: 60, value: sf.constraints?.frameTilt ?? 15, unit: '°' })
      : field({ label: t('surface.tilt'), bind: `${b}.tilt`, type: 'number', step: '1', min: 0, max: 90, value: sf.tilt, unit: '°' })) +
    field({ label: t('surface.azimuth'), bind: `${b}.azimuth`, type: 'number', step: '5', min: -180, max: 180, value: sf.azimuth, unit: '°', hint: t('site.azimuthHint') }) +
    field({ label: t('surface.setback'), bind: `${b}.constraints.setback`, type: 'number', step: '0.05', min: 0, value: sf.constraints?.setback ?? 0.4, unit: 'm' }) +
    select({
      label: t('surface.orientation'), bind: `${b}.constraints.orientation`,
      value: sf.constraints?.orientation ?? 'auto',
      options: ['auto', 'portrait', 'paysage'].map((v) => ({ value: v, label: t(`surface.orientation.${v}`) })),
    }) +
    field({ label: t('surface.gapX'), bind: `${b}.constraints.gapX`, type: 'number', step: '0.005', min: 0, value: sf.constraints?.gapX ?? 0.02, unit: 'm' }) +
    field({ label: t('surface.clearance'), bind: `${b}.constraints.obstacleClearance`, type: 'number', step: '0.05', min: 0, value: sf.constraints?.obstacleClearance ?? 0.3, unit: 'm' }) +
    (tilted ? field({
      label: t('surface.pitch'), bind: `${b}.pitch`, type: 'number', step: '0.1', min: 0,
      value: sf.pitch ?? '', unit: 'm', hint: t('surface.pitchAuto'),
    }) : ''),
  );

  const m = lay?.metrics;
  const resultats = lay ? `<div class="stats row">
    ${stat(t('kpi.modules'), `${lay.count ?? 0} × ${fmt(r.module.pmax)} Wc`)}
    ${stat(t('kpi.kwp'), `${fmt(lay.kwp ?? 0, 2)} ${t('unit.kwp')}`, (lay.count ?? 0) > 0 ? 'good' : 'warn')}
    ${stat(t('surface.orientation'), lay.orientation ? t(`surface.orientation.${lay.orientation}`) : '—')}
    ${stat(t('surface.rows'), String(lay.rows ?? 0))}
    ${stat(t('surface.gross'), `${fmt(m?.grossM2 ?? 0, 1)} m²`)}
    ${stat(t('surface.usable'), `${fmt(lay.usableAreaM2 ?? 0, 1)} m²`)}
    ${stat(t('surface.fill'), pct(lay.fillRatio ?? 0, 0))}
    ${lay.rowPitch && lay.mounting === 'tilted'
      ? stat(t('surface.rowPitch'), `${fmt(lay.rowPitch, 2)} m (${esc(lay.pitchInfo?.source ?? '')})`) : ''}
    ${lay.gcr != null ? stat(t('surface.gcr'), fmt(lay.gcr, 2)) : ''}
  </div>` : '';

  const obstacles = (sf.obstacles ?? []).map((o, j) => `<tr>
    <td><input data-bind="${b}.obstacles.${j}.name" value="${esc(o.name)}"></td>
    <td><select data-bind="${b}.obstacles.${j}.kind" data-structural>${OBSTACLE_KINDS.map((k) =>
      `<option value="${k.id}"${k.id === o.kind ? ' selected' : ''}>${esc(t(`obstacle.kind.${k.id}`))}</option>`).join('')}</select></td>
    <td class="num"><input type="number" step="0.1" data-bind="${b}.obstacles.${j}.x" value="${esc(o.x)}"></td>
    <td class="num"><input type="number" step="0.1" data-bind="${b}.obstacles.${j}.y" value="${esc(o.y)}"></td>
    <td class="num"><input type="number" step="0.1" min="0.05" data-bind="${b}.obstacles.${j}.width" value="${esc(o.width)}"></td>
    <td class="num"><input type="number" step="0.1" min="0.05" data-bind="${b}.obstacles.${j}.height" value="${esc(o.height)}"></td>
    <td><button class="icon" data-action="removeObstacle" data-surface="${i}" data-index="${j}"
      aria-label="${esc(t('action.delete'))}">×</button></td>
  </tr>`).join('');

  const tableObstacles = `<div class="table-wrap"><table>
      <thead><tr><th>${esc(t('obstacle.name'))}</th><th>${esc(t('obstacle.kind'))}</th>
        <th>${esc(t('obstacle.x'))}</th><th>${esc(t('obstacle.y'))}</th>
        <th>${esc(t('obstacle.width'))}</th><th>${esc(t('obstacle.height'))}</th><th></th></tr></thead>
      <tbody>${obstacles}</tbody></table></div>
    <button class="btn" data-action="addObstacle" data-surface="${i}">+ ${esc(t('obstacle.add'))}</button>`;

  const plan = lay?.resolved
    ? `<div class="plan-wrap">${planView({ surface: lay.resolved, layout: lay })}</div>`
    : `<p class="notice warn">${esc(t('plan.noSurface'))}</p>`;

  const entete = `<button class="btn small" data-action="removeSurface" data-index="${i}">${esc(t('action.delete'))}</button>`;

  return card(sf.name || t('surface.title'),
    params + resultats
    + `<h3 class="sub">${esc(t('obstacle.title'))}</h3>` + tableObstacles
    + plan
    + `<div class="row-actions">
        <button class="btn" data-action="downloadPlan" data-index="${i}">${esc(t('plan.download'))}</button>
      </div>`
    + warnings((r.warnings ?? []).filter((w) => w.surfaceId === sf.id)),
    entete);
}

/* ------------------------------------------------------------------ */

export function array(p, r) {
  const a = p.array;
  const range = r.config.range ?? {};
  const results = `<div class="stats row">
    ${stat(t('array.series'), r.config.seriesPerString ?? '—')}
    ${stat(t('array.strings'), r.config.stringCount ?? '—')}
    ${stat(t('array.stringsPerMppt'), r.config.stringsPerMppt ?? '—')}
    ${stat(t('kpi.kwp'), `${fmt(r.kwp, 2)} kWc`)}
    ${stat(t('array.seriesRange'), `${range.min ?? '—'} … ${range.max ?? '—'}`)}
    ${stat(t('array.vocCold'), `${fmt(r.config.vocStringCold)} V / ${fmt(r.inverter.vdcMax)} V`,
      r.config.vocStringCold > r.inverter.vdcMax ? 'bad' : 'good')}
    ${stat(t('array.vmpHot'), `${fmt(r.config.vmpStringHot)} V ≥ ${fmt(r.inverter.mpptMin)} V`,
      r.config.vmpStringHot < r.inverter.mpptMin ? 'bad' : 'good')}
    ${stat(t('array.dcac'), fmt(r.config.dcAcRatio, 2),
      r.config.dcAcRatio > 1.35 || r.config.dcAcRatio < 0.85 ? 'warn' : 'good')}
  </div>`;

  const losses = grid(Object.keys(p.array.losses).map((k) =>
    field({
      label: t(`loss.${k}`), bind: `array.losses.${k}`, type: 'number',
      step: '0.005', min: 0, max: 0.4, value: p.array.losses[k],
    })).join(''), 4);

  return card(t('array.title'),
    grid(
      select({
        label: t('array.module'), bind: 'array.moduleId', value: a.moduleId,
        options: MODULES.map((m) => ({ value: m.id, label: m.label })),
      }) +
      select({
        label: t('array.inverter'), bind: 'array.inverterId', value: a.inverterId,
        options: INVERTERS.map((i) => ({ value: i.id, label: i.label })),
      }) +
      toggle({ label: t('array.autoTarget'), bind: 'array.autoTarget', value: a.autoTarget }) +
      field({
        label: t('array.targetKwp'), bind: 'array.targetKwp', type: 'number', step: '0.1', min: 0.1,
        value: a.autoTarget ? fmt(r.kwp, 2) : a.targetKwp, unit: t('unit.kwp'),
        attrs: a.autoTarget ? 'disabled' : '',
      }) +
      field({ label: t('array.inverterQty'), bind: 'array.inverterQty', type: 'number', step: '1', min: 1, value: a.inverterQty }),
    ) + results + warnings(r.warnings)) +
    card(t('array.losses'), losses);
}

/* ------------------------------------------------------------------ */

export function storage(p, r) {
  const s = p.storage;
  const inputs = grid(
    toggle({ label: t('storage.enabled'), bind: 'storage.enabled', value: s.enabled || p.meta.systemType !== 'grid' }) +
    select({
      label: t('storage.battery'), bind: 'storage.batteryId', value: s.batteryId,
      options: BATTERIES.map((b) => ({ value: b.id, label: b.label })),
    }) +
    field({ label: t('storage.autonomy'), bind: 'storage.autonomyDays', type: 'number', step: '0.5', min: 0.5, value: s.autonomyDays, unit: t('unit.day') }) +
    select({
      label: t('storage.busVoltage'), bind: 'storage.busVoltage', value: s.busVoltage,
      options: [12, 24, 48, 96, 192, 400].map((v) => ({ value: v, label: `${v} V` })),
    }) +
    select({
      label: t('storage.controller'), bind: 'storage.controllerType', value: s.controllerType,
      options: [{ value: 'mppt', label: 'MPPT' }, { value: 'pwm', label: 'PWM' }],
    }),
  );

  if (!r.storage) {
    return card(t('storage.title'), inputs + `<p class="notice info">${esc(t('storage.enabled'))} — ${esc(t('project.type.grid'))}.</p>`);
  }

  const st = r.storage;
  return card(t('storage.title'), inputs + `<div class="stats row">
    ${stat(t('storage.needed'), `${fmt(st.need.grossKwh, 1)} kWh`)}
    ${stat(t('storage.installed'), `${fmt(st.bank.installedKwh, 1)} kWh`)}
    ${stat(t('storage.usable'), `${fmt(st.bank.usableKwh, 1)} kWh`)}
    ${stat(t('storage.arrangement'), `${st.bank.series}S × ${st.bank.parallel}P (${st.bank.count} u)`)}
    ${stat(t('storage.busVoltage'), `${fmt(st.busVoltage, 1)} V`)}
    ${stat(t('storage.controllerCurrent'), `${fmt(Math.ceil(st.controller.currentA))} A ${st.controller.type.toUpperCase()}`)}
    ${stat(t('storage.offgridInverter'), `${fmt(st.offGridInv.apparentVa / 1000, 1)} kVA`)}
    ${st.bank.massKg ? stat('Masse', `${fmt(st.bank.massKg)} kg`) : ''}
  </div>`);
}

/* ------------------------------------------------------------------ */

export function cabling(p, r) {
  const c = p.cabling, k = r.cabling;
  const row = (labelKey, sel, mode) => [
    t(labelKey),
    `${sel.section} mm²`,
    `${fmt(sel.ampacity, 1)} A`,
    `${fmt(sel.drop.percent, 2)} %`,
    t(sel.governing === 'drop' ? 'cabling.byDrop' : 'cabling.byAmpacity'),
  ];

  const cables = table(
    ['', t('cabling.section'), t('cabling.ampacity'), t('cabling.drop'), t('cabling.governing')],
    [row('cabling.stringCable', k.stringSection), row('cabling.arrayCable', k.arraySection), row('cabling.acCable', k.acSection)],
  );

  const prot = `<div class="stats row">
    ${stat(t('cabling.stringFuse'), k.stringProt.required
      ? `${k.stringProt.rating} A gPV (${fmt(k.stringProt.min, 1)}–${fmt(k.stringProt.max, 1)} A)`
      : t('cabling.notRequired'), k.stringProt.required && !k.stringProt.ok ? 'bad' : '')}
    ${stat(t('cabling.dcBreaker'), `${k.arrayProt.rating} A — ${fmt(k.arrayProt.designCurrent, 1)} A`)}
    ${stat(t('cabling.acBreaker'), `${k.acProt.rating} A ${k.acProt.phases === 3 ? '4P' : '2P'} — ${fmt(k.acProt.current, 1)} A`)}
    ${stat(t('cabling.surge'), k.surge.dcRequired || k.surge.acRequired
      ? `${k.surge.type} (${k.surge.dcRequired ? 'DC' : ''}${k.surge.dcRequired && k.surge.acRequired ? ' + ' : ''}${k.surge.acRequired ? 'AC' : ''})`
      : t('cabling.notRequired'))}
  </div>`;

  return card(t('cabling.title'), grid(
    field({ label: t('cabling.stringLength'), bind: 'cabling.stringLengthM', type: 'number', step: '1', min: 1, value: c.stringLengthM, unit: 'm' }) +
    field({ label: t('cabling.arrayLength'), bind: 'cabling.arrayLengthM', type: 'number', step: '1', min: 1, value: c.arrayLengthM, unit: 'm' }) +
    field({ label: t('cabling.acLength'), bind: 'cabling.acLengthM', type: 'number', step: '1', min: 1, value: c.acLengthM, unit: 'm' }) +
    field({ label: t('cabling.maxDropDc'), bind: 'cabling.maxDropDc', type: 'number', step: '0.1', min: 0.1, value: c.maxDropDc, unit: '%' }) +
    field({ label: t('cabling.maxDropAc'), bind: 'cabling.maxDropAc', type: 'number', step: '0.1', min: 0.1, value: c.maxDropAc, unit: '%' }) +
    select({
      label: t('cabling.material'), bind: 'cabling.material', value: c.material,
      options: [{ value: 'copper', label: t('cabling.material.copper') }, { value: 'aluminium', label: t('cabling.material.aluminium') }],
    }) +
    field({ label: t('cabling.ambient'), bind: 'cabling.ambientC', type: 'number', step: '5', value: c.ambientC, unit: '°C' }) +
    field({ label: t('cabling.circuits'), bind: 'cabling.circuits', type: 'number', step: '1', min: 1, value: c.circuits }) +
    field({ label: t('cabling.keraunic'), bind: 'cabling.keraunicLevel', type: 'number', step: '5', min: 1, value: c.keraunicLevel }) +
    toggle({ label: t('cabling.hasLps'), bind: 'cabling.hasLps', value: c.hasLps }),
  ) + cables + prot + warnings(r.warnings.filter((w) => w.code.startsWith('cable') || w.code.startsWith('fuse'))));
}

/* ------------------------------------------------------------------ */

export function production(p, r) {
  const months = table(
    [t('production.month'), `${t('production.poa')} (kWh/m²)`, `${t('production.energy')} (kWh)`, `${t('kpi.specific')} (kWh/kWc)`, t('kpi.pr')],
    r.production.months.map((m) => [
      t(`month.${m.month + 1}`), fmt(m.poa, 1), fmt(m.ac), fmt(m.specific, 1), pct(m.pr),
    ]),
    {
      foot: [t('economics.year'), fmt(r.production.annual.poa), fmt(r.production.annual.ac),
        fmt(r.production.annual.specificYield), pct(r.production.annual.performanceRatio)],
    },
  );

  return card(t('production.monthly'), monthlyChart({
    production: r.production.months.map((m) => m.ac),
    consumption: monthlyLoad(p, r),
  })) +
  card(t('production.losses'), lossChart({ breakdown: r.production.lossBreakdown }) +
    `<div class="stats row">
      ${stat('Production théorique', `${fmt(r.production.lossBreakdown.nominal)} kWh`)}
      ${stat(t('production.energy'), `${fmt(r.production.annual.ac)} kWh`)}
      ${stat(t('kpi.pr'), pct(r.production.annual.performanceRatio))}
    </div>`) +
  card(t('production.title'), months);
}

/* ------------------------------------------------------------------ */

export function economics(p, r) {
  const e = p.economics, x = r.economics;
  const params = grid(
    field({ label: t('economics.currency'), bind: 'economics.currencySymbol', value: e.currencySymbol }) +
    field({ label: t('economics.tariffBuy'), bind: 'economics.tariffBuy', type: 'number', step: '0.01', value: e.tariffBuy, unit: `${cur(p)}/kWh` }) +
    field({ label: t('economics.tariffSell'), bind: 'economics.tariffSell', type: 'number', step: '0.01', value: e.tariffSell, unit: `${cur(p)}/kWh` }) +
    field({ label: t('economics.subsidy'), bind: 'economics.subsidy', type: 'number', step: '100', value: e.subsidy, unit: cur(p) }) +
    field({ label: t('economics.opexRate'), bind: 'economics.opexRate', type: 'number', step: '0.005', value: e.opexRate, unit: '× CAPEX' }) +
    field({ label: t('economics.degradation'), bind: 'economics.degradation', type: 'number', step: '0.001', value: e.degradation }) +
    field({ label: t('economics.escalation'), bind: 'economics.tariffEscalation', type: 'number', step: '0.005', value: e.tariffEscalation }) +
    field({ label: t('economics.discount'), bind: 'economics.discountRate', type: 'number', step: '0.005', value: e.discountRate }) +
    field({ label: t('economics.years'), bind: 'economics.years', type: 'number', step: '1', min: 5, max: 40, value: e.years, unit: t('unit.years') }) +
    field({ label: t('economics.capexOverride'), bind: 'economics.capexOverride', type: 'number', step: '100', value: e.capexOverride ?? '', unit: cur(p) }),
  );

  const costs = grid(Object.entries(e.costs).map(([k, v]) =>
    field({ label: t(`cost.${k}`) === `cost.${k}` ? k : t(`cost.${k}`), bind: `economics.costs.${k}`, type: 'number', step: '0.01', value: v })).join(''), 4);

  const bom = table(
    [t('economics.item'), t('economics.qty'), '', t('economics.unitPrice'), t('economics.total')],
    x.bom.map((b) => [esc(b.label), fmt(b.qty, b.unit === 'Wc' ? 0 : 0), b.unit, fmt(b.price, 2), fmt(b.total)]),
    { foot: [t('economics.total'), '', '', '', `<b>${fmt(x.capex)} ${cur(p)}</b>`] },
  );

  const kpis = `<div class="stats row">
    ${stat(t('kpi.capex'), money(x.capex, p))}
    ${stat('CAPEX / Wc', `${fmt(x.costPerWp, 2)} ${cur(p)}/Wc`)}
    ${stat(t('kpi.savings'), money(x.year1Savings, p))}
    ${stat(t('kpi.payback'), x.payback ? `${fmt(x.payback, 1)} ${t('unit.years')}` : '—', x.payback && x.payback < 10 ? 'good' : '')}
    ${stat(t('kpi.irr'), x.irr != null ? pct(x.irr) : '—', x.irr > 0.08 ? 'good' : '')}
    ${stat(t('kpi.npv'), money(x.npv, p), x.npv > 0 ? 'good' : 'bad')}
    ${stat(t('kpi.lcoe'), `${fmt(x.lcoe, 3)} ${cur(p)}/kWh`)}
    ${stat(t('kpi.co2'), `${fmt(r.carbon.avoidedTons)} t`)}
  </div>`;

  return card(t('economics.title'), params) +
    card(t('economics.costs'), costs) +
    card(t('economics.bom'), bom + kpis) +
    card(t('economics.cashflow'), cashflowChart({ rows: x.rows, currency: cur(p) }));
}

/* ------------------------------------------------------------------ */

export function sld(p, r, prefs) {
  const d = p.dossier ?? {};
  const pro = isProjectUnlocked(prefs, p.id);
  const sheets = buildDossier(r, p, { pro });

  const meta = grid(
    field({ label: t('dossier.documentNo'), bind: 'dossier.documentNo', value: d.documentNo }) +
    select({
      label: t('dossier.format'), bind: 'dossier.format', value: d.format,
      options: ['A4', 'A3', 'A2', 'A1'].map((v) => ({ value: v, label: v })),
    }) +
    field({ label: t('dossier.preparedBy'), bind: 'dossier.preparedBy', value: d.preparedBy }) +
    field({ label: t('dossier.checkedBy'), bind: 'dossier.checkedBy', value: d.checkedBy }) +
    field({ label: t('dossier.approvedBy'), bind: 'dossier.approvedBy', value: d.approvedBy }),
  );

  const revRows = (d.revisions ?? []).map((rv, i) => `<tr>
    <td><input data-bind="dossier.revisions.${i}.rev" value="${esc(rv.rev)}"></td>
    <td><input type="date" data-bind="dossier.revisions.${i}.date" value="${esc(rv.date)}"></td>
    <td><input data-bind="dossier.revisions.${i}.designation" value="${esc(rv.designation)}"></td>
    <td><button class="icon" data-action="removeRevision" data-index="${i}" aria-label="${esc(t('action.delete'))}">×</button></td>
  </tr>`).join('');

  const revisions = `<div class="table-wrap"><table>
      <thead><tr><th>${esc(t('dossier.rev'))}</th><th>${esc(t('dossier.date'))}</th>
        <th>${esc(t('dossier.designation'))}</th><th></th></tr></thead>
      <tbody>${revRows}</tbody></table></div>
    <button class="btn" data-action="addRevision">+ ${esc(t('dossier.addRevision'))}</button>`;

  const plates = sheets.map((sh, i) => `<section class="card sheet-card">
      <h2>${esc(t('dossier.sheet'))} ${esc(sh.folio)} — ${esc(sh.title)}
        <button class="btn small" data-action="downloadSheet" data-index="${i}">${esc(t('action.export'))} SVG</button></h2>
      <div class="sld-wrap">${sh.svg}</div>
    </section>`).join('');

  return card(t('dossier.title'), meta + revisions +
      `<div class="row-actions">
        <button class="btn primary" data-action="downloadAllSheets">${esc(t('dossier.downloadAll'))}</button>
        <button class="btn" data-action="print">${esc(t('action.print'))}</button>
      </div>
      <p class="notice info">${esc(t('dossier.hint'))}</p>`)
    + (pro ? '' : unlockCard(p, prefs))
    + plates
    + `<p class="disclaimer">${esc(t('sld.hint'))}</p>`;
}

/* ------------------------------------------------------------------ */

export function report(p, r, prefs) {
  const b = p.branding;
  return card(t('report.branding'), grid(
    field({ label: t('report.company'), bind: 'branding.company', value: b.company }) +
    field({ label: t('report.phone'), bind: 'branding.phone', value: b.phone }) +
    field({ label: t('report.email'), bind: 'branding.email', value: b.email }) +
    `<label class="field"><span class="field-label">${esc(t('report.logo'))}</span>
      <span class="field-input"><input type="file" accept="image/*" data-action="logo"></span></label>`,
  ) + `<div class="row-actions">
      <button class="btn primary" data-action="print">${esc(t('action.print'))}</button>
    </div>
    <p class="notice info">${esc(t('report.hint'))}</p>`) +
    `<div id="report-preview">${reportBody(p, r, prefs)}</div>`;
}

/**
 * Encart proposé quand les planches du projet portent encore le filigrane.
 * Selon la clé enregistrée, il propose de dépenser un crédit ou de choisir
 * une formule.
 */
function unlockCard(p, prefs) {
  const restant = remainingCredits(prefs);
  const disponible = canUnlock(prefs, p.id);

  const action = disponible
    ? `<div class="row-actions">
        <button class="btn primary" data-action="unlockProject">${esc(t('licence.unlock'))}</button>
        <span class="field-hint">${esc(t('licence.credits'))} : <b>${restant}</b></span>
      </div>
      <p class="notice info">${esc(t('licence.unlockHint'))}</p>`
    : `${restant === 0 && readKey(prefs?.licence).valid
        ? `<p class="notice warn">${esc(t('licence.noCredits'))}</p>` : ''}
      ${offersGrid()}`;

  return card(t('licence.upgrade'),
    `<p class="notice warn">${esc(t('licence.watermarked'))}</p>${action}`);
}

/**
 * Les trois formules payantes, présentées côte à côte.
 * Chacune mène au paiement dès qu'un lien est renseigné dans `boutique.js` ;
 * sinon elle le dit, au lieu d'ouvrir une page morte.
 */
function offersGrid() {
  const cartes = ORDRE.map((plan) => {
    const o = OFFRES[plan];
    const nom = t(`licence.plan.${plan}`);
    const lien = lienAchat(plan, nom);
    // Paiement en ligne, commande directe, ou rien : trois états, jamais un
    // bouton qui mène nulle part.
    const achat = lien
      ? `<a class="btn primary offer-buy" href="${esc(lien)}"
            target="_blank" rel="noopener noreferrer">${
              esc(t(estOuverte(plan) ? 'licence.buyPlan' : 'licence.order'))}</a>`
      : `<span class="offer-soon">${esc(t('licence.soon'))}</span>`;
    return `<div class="offer">
      <span class="offer-name">${esc(nom)}</span>
      <span class="offer-price">${esc(o.prix)}<small>${esc(o.unite)}</small></span>
      <span class="offer-note">${esc(t(`licence.offer.${plan}`))}</span>
      ${achat}
    </div>`;
  }).join('');

  return `<div class="offers">${cartes}</div>
    <div class="row-actions">
      <button class="btn" data-view="settings">${esc(t('licence.activate'))}</button>
      <span class="field-hint">${esc(t('licence.alreadyBought'))}</span>
    </div>`;
}

/** Corps du rapport, également utilisé pour l'impression. */
export function reportBody(p, r, prefs) {
  const e = r.economics, b = p.branding;
  const head = `<header class="rep-head">
    ${b.logoDataUrl ? `<img class="rep-logo" src="${b.logoDataUrl}" alt="">` : ''}
    <div><h1>${esc(p.meta.name || t('project.name'))}</h1>
      <p>${esc(b.company || '')} ${b.phone ? '· ' + esc(b.phone) : ''} ${b.email ? '· ' + esc(b.email) : ''}</p></div>
    <div class="rep-meta">
      <div>${esc(t('project.client'))} : <b>${esc(p.meta.client || '—')}</b></div>
      <div>${esc(t('project.reference'))} : <b>${esc(p.meta.reference || '—')}</b></div>
      <div>${new Date().toLocaleDateString()}</div>
    </div></header>`;

  const synth = table(
    ['', ''],
    [
      [t('kpi.kwp'), `${fmt(r.kwp, 2)} ${t('unit.kwp')}`],
      [t('kpi.modules'), `${r.moduleCount} × ${esc(r.module.label)}`],
      [t('array.inverter'), `${r.nInverters} × ${esc(r.inverter.label)}`],
      [t('array.series'), `${r.config.seriesPerString}S × ${r.config.stringCount}P`],
      [t('site.tilt') + ' / ' + t('site.azimuth'), `${fmt(r.tilt)}° / ${fmt(r.azimuth)}°`],
      [t('kpi.production'), `${fmt(r.production.annual.ac)} ${t('unit.kwhYear')}`],
      [t('kpi.specific'), `${fmt(r.production.annual.specificYield)} ${t('unit.kwhKwp')}`],
      [t('kpi.pr'), pct(r.production.annual.performanceRatio)],
      [t('kpi.selfuse'), pct(r.selfConsumption.rate)],
      [t('kpi.capex'), money(e.capex, p)],
      [t('kpi.payback'), e.payback ? `${fmt(e.payback, 1)} ${t('unit.years')}` : '—'],
      [t('kpi.lcoe'), `${fmt(e.lcoe, 3)} ${cur(p)}/kWh`],
      [t('kpi.co2'), `${fmt(r.carbon.avoidedTons)} t`],
    ],
  );

  const bom = table(
    [t('economics.item'), t('economics.qty'), t('economics.total')],
    r.economics.bom.map((x) => [esc(x.label), `${fmt(x.qty)} ${x.unit}`, `${fmt(x.total)} ${cur(p)}`]),
    { foot: [t('economics.total'), '', `<b>${fmt(e.capex)} ${cur(p)}</b>`] },
  );

  return `${head}
    <h2>${esc(t('kpi.production'))}</h2>${synth}
    <h2>${esc(t('production.monthly'))}</h2>
    ${monthlyChart({ production: r.production.months.map((m) => m.ac), consumption: monthlyLoad(p, r) })}
    <h2>${esc(t('cabling.title'))}</h2>
    ${table(['', t('cabling.section'), t('cabling.drop')], [
      [t('cabling.stringCable'), `${r.cabling.stringSection.section} mm²`, `${fmt(r.cabling.stringSection.drop.percent, 2)} %`],
      [t('cabling.arrayCable'), `${r.cabling.arraySection.section} mm²`, `${fmt(r.cabling.arraySection.drop.percent, 2)} %`],
      [t('cabling.acCable'), `${r.cabling.acSection.section} mm²`, `${fmt(r.cabling.acSection.drop.percent, 2)} %`],
      [t('cabling.acBreaker'), `${r.cabling.acProt.rating} A`, ''],
    ])}
    <h2>${esc(t('dossier.title'))}</h2>
    ${buildDossier(r, p, { pro: isProjectUnlocked(prefs, p.id) }).slice(1).map((sh) => `<div class="sld-wrap sheet-page">${sh.svg}</div>`).join('')}
    <h2>${esc(t('economics.bom'))}</h2>${bom}
    <h2>${esc(t('economics.cashflow'))}</h2>${cashflowChart({ rows: r.economics.rows, currency: cur(p) })}
    <p class="disclaimer">${esc(t('disclaimer.short'))}</p>`;
}

/* ------------------------------------------------------------------ */

export function library() {
  const mod = table(
    ['', 'Pmax (W)', 'Voc (V)', 'Vmp (V)', 'Isc (A)', 'Imp (A)', 'βVoc (%/°C)', 'γP (%/°C)', 'NOCT'],
    MODULES.map((m) => [esc(m.label), m.pmax, m.voc, m.vmp, m.isc, m.impp, m.betaVoc, m.gammaPmax, m.noct]),
  );
  const inv = table(
    ['', 'Pac (kW)', 'Vdc max (V)', 'MPPT (V)', 'MPPT', 'I/MPPT (A)', 'η', 'Ph.'],
    INVERTERS.map((i) => [esc(i.label), fmt(i.pacNom / 1000, 1), i.vdcMax,
      `${i.mpptMin}–${i.mpptMax}`, i.mpptCount, i.iMaxPerMppt, pct(i.effEuro), i.phases]),
  );
  const bat = table(
    ['', 'V', 'Ah', 'kWh', 'DoD', 'Cycles'],
    BATTERIES.map((b) => [esc(b.label), b.vNom, b.capacityAh,
      fmt(b.vNom * b.capacityAh / 1000, 2), pct(b.dod, 0), b.cycles]),
  );
  return `<p class="notice info">${esc(t('library.notice'))}</p>`
    + card(t('library.modules'), mod)
    + card(t('library.inverters'), inv)
    + card(t('library.batteries'), bat);
}

/* ------------------------------------------------------------------ */

export function settings(prefs) {
  const lu = readKey(prefs?.licence);
  const pro = lu.valid;
  const restant = remainingCredits(prefs);
  const licence = card(t('licence.title'),
    `<div class="stats row">
      ${stat(t('licence.title'),
        pro ? t(`licence.plan.${lu.plan}`) : t('licence.plan.free'), pro ? 'good' : 'warn')}
      ${pro ? stat(t('licence.credits'),
        isUnlimited(prefs) ? t('licence.unlimited') : String(restant),
        restant === 0 ? 'warn' : '') : ''}
      ${pro ? stat(t('licence.key'), esc(formatKey(prefs.licence))) : ''}
    </div>
    ${pro ? `<div class="row-actions">
        <button class="btn" data-action="removeLicence">${esc(t('licence.remove'))}</button>
      </div>`
      : `<div class="grid cols-2" style="margin-top:14px">
          <label class="field"><span class="field-label">${esc(t('licence.key'))}</span>
            <span class="field-input"><input id="licence-key" placeholder="SLRS-XXXX-XXXX-XXXX"
              autocomplete="off" spellcheck="false"></span></label>
        </div>
        <div class="row-actions">
          <button class="btn primary" data-action="activateLicence">${esc(t('licence.activate'))}</button>
        </div>
        <p class="notice info">${esc(t('licence.hint'))}</p>
        ${offersGrid()}`}`);

  return licence + card(t('settings.title'), grid(
    `<label class="field"><span class="field-label">${esc(t('settings.language'))}</span>
      <span class="field-input"><select data-action="lang">${LANGUAGES.map((l) =>
        `<option value="${l.code}"${l.code === prefs.lang ? ' selected' : ''}>${esc(l.label)}</option>`).join('')}</select></span></label>`
    + `<label class="field"><span class="field-label">${esc(t('settings.theme'))}</span>
      <span class="field-input"><select data-action="theme">
        <option value="dark"${prefs.theme === 'dark' ? ' selected' : ''}>${esc(t('settings.theme.dark'))}</option>
        <option value="light"${prefs.theme === 'light' ? ' selected' : ''}>${esc(t('settings.theme.light'))}</option>
      </select></span></label>`,
  )) + card(t('settings.data'),
    `<div class="row-actions">
      <button class="btn" data-action="exportAll">${esc(t('settings.exportAll'))}</button>
      <button class="btn" data-action="importAll">${esc(t('settings.importAll'))}</button>
    </div>
    <p class="notice info">${esc(t('settings.storageNotice'))}</p>`);
}
