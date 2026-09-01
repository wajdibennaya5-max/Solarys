/**
 * Le champ photovoltaïque, vu comme un ensemble de sous-champs.
 *
 * Une villa réelle n'a pas une orientation, elle en a trois : un pan Sud, un
 * pan Ouest, une terrasse. Le dossier de référence qui a servi de modèle
 * comportait ainsi CPV01, CPV02 et CPV03, chacun avec sa puissance, son
 * inclinaison et son onduleur.
 *
 * Ce service calepine chaque surface, puis agrège les productions — chacune
 * calculée avec SA propre inclinaison et SON propre azimut. Additionner des
 * puissances puis simuler avec une orientation moyenne donnerait un résultat
 * faux ; c'est l'erreur que ce module évite.
 */

import { placeModules } from './layout.js';
import { mutualShadingLoss } from './rowspacing.js';
import { simulate, DEFAULT_LOSSES } from './energy.js';
import { resolveSurface, surfaceMetrics, validateSurface } from '../model/surface.js';
import { DAYS_IN_MONTH } from './solar.js';

/**
 * Calepine toutes les surfaces d'un projet.
 *
 * @param {object} p
 * @param {Array} p.surfaces
 * @param {object} p.module
 * @param {number} p.latitude
 * @returns {{layouts:Array, totalCount:number, totalKwp:number, issues:Array}}
 */
export function layoutField({ surfaces = [], module, latitude }) {
  const layouts = [];
  const issues = [];

  for (const raw of surfaces) {
    const controles = validateSurface(raw);
    controles.forEach((i) => issues.push({ ...i, surfaceId: raw.id, surfaceName: raw.name }));
    if (controles.some((i) => i.level === 'error')) {
      layouts.push({ surface: raw, feasible: false, count: 0, kwp: 0, issues: controles });
      continue;
    }

    const surface = resolveSurface(raw);
    const placement = placeModules({
      surface, module, constraints: surface.constraints,
      latitude, pitch: surface.pitch ?? undefined,
    });
    placement.issues?.forEach((i) => issues.push({ ...i, surfaceId: raw.id, surfaceName: raw.name }));

    layouts.push({
      surface: raw,
      resolved: surface,
      metrics: surfaceMetrics(raw),
      ...placement,
      // Inclinaison vue par les modules : celle de la couverture en pose
      // coplanaire, celle des structures en pose sur châssis.
      effectiveTilt: surface.mounting === 'tilted'
        ? Number(surface.constraints?.frameTilt ?? 15)
        : Number(surface.tilt ?? 0),
      azimuth: Number(surface.azimuth ?? 0),
    });
  }

  return {
    layouts,
    totalCount: layouts.reduce((s, l) => s + (l.count ?? 0), 0),
    totalKwp: layouts.reduce((s, l) => s + (l.kwp ?? 0), 0),
    issues,
  };
}

/**
 * Production du champ entier : chaque sous-champ est simulé avec sa propre
 * orientation, puis les productions mensuelles sont additionnées.
 *
 * L'ombrage entre rangées est ajouté aux pertes de chaque sous-champ posé sur
 * structures — il dépend de l'entraxe, donc du sous-champ, et non du projet.
 *
 * @returns {object} même forme que `simulate`, plus le détail par sous-champ
 */
export function simulateField({
  layouts, latitude, monthlyGhi, monthlyTa, module, inverterEff,
  losses = DEFAULT_LOSSES, albedo = 0.2,
}) {
  const actifs = layouts.filter((l) => (l.kwp ?? 0) > 0);
  if (!actifs.length) return null;

  const subFields = actifs.map((l) => {
    let pertes = { ...losses };
    let ombrage = null;

    if (l.mounting === 'tilted' && l.rowPitch > 0 && l.orientation) {
      ombrage = mutualShadingLoss({
        latitude, monthlyGhi, tilt: l.effectiveTilt, pitch: l.rowPitch,
        moduleLength: l.orientation === 'portrait' ? module.length : module.width,
        azimuth: l.azimuth, albedo,
      });
      // L'ombrage saisi à la main couvre les masques lointains ; celui-ci
      // s'ajoute et concerne les rangées entre elles.
      pertes = { ...pertes, rowShading: ombrage.loss };
    }

    const sim = simulate({
      latitude, monthlyGhi, monthlyTa,
      tilt: l.effectiveTilt, azimuth: l.azimuth, kwp: l.kwp,
      gammaPmax: module.gammaPmax, noct: module.noct,
      inverterEff, losses: pertes, albedo,
    });

    return {
      surfaceId: l.surface?.id,
      name: l.surface?.name,
      kwp: l.kwp, count: l.count,
      tilt: l.effectiveTilt, azimuth: l.azimuth,
      mounting: l.mounting,
      rowShading: ombrage,
      simulation: sim,
    };
  });

  // Agrégation mensuelle.
  const months = Array.from({ length: 12 }, (_, m) => {
    const jours = DAYS_IN_MONTH[m];
    let ac = 0, dc = 0, poa = 0, ghi = 0, poaPondere = 0;
    for (const sf of subFields) {
      const mm = sf.simulation.months[m];
      ac += mm.ac; dc += mm.dc;
      // L'irradiation dans le plan n'est comparable qu'en la pondérant par la
      // puissance de chaque sous-champ.
      poaPondere += mm.poa * sf.kwp;
      poa = poaPondere;
      ghi = mm.ghi;
    }
    const kwpTotal = subFields.reduce((s, sf) => s + sf.kwp, 0);
    const poaMoyen = kwpTotal > 0 ? poaPondere / kwpTotal : 0;
    return {
      month: m, days: jours, ghi,
      poa: poaMoyen, poaDaily: poaMoyen / jours,
      ta: subFields[0].simulation.months[m].ta,
      thermalFactor: subFields[0].simulation.months[m].thermalFactor,
      dc, ac,
      specific: kwpTotal > 0 ? ac / kwpTotal : 0,
      pr: poaMoyen > 0 ? ac / (kwpTotal * poaMoyen) : 0,
    };
  });

  const kwpTotal = subFields.reduce((s, sf) => s + sf.kwp, 0);
  const annualAc = months.reduce((s, m) => s + m.ac, 0);
  const annualDc = months.reduce((s, m) => s + m.dc, 0);
  const annualPoa = months.reduce((s, m) => s + m.poa, 0);
  const annualGhi = months.reduce((s, m) => s + m.ghi, 0);

  // Le bilan de pertes du sous-champ dominant reste représentatif ; il est
  // remis à l'échelle de la production totale pour rester lisible.
  const dominant = subFields.reduce((a, b) => (a.kwp >= b.kwp ? a : b));
  const facteur = dominant.simulation.annual.ac > 0
    ? annualAc / dominant.simulation.annual.ac : 1;
  const lossBreakdown = {
    nominal: dominant.simulation.lossBreakdown.nominal * facteur,
    steps: dominant.simulation.lossBreakdown.steps.map((s) => ({ ...s, loss: s.loss * facteur })),
    final: dominant.simulation.lossBreakdown.final * facteur,
  };

  return {
    months,
    annual: {
      ghi: annualGhi, poa: annualPoa,
      transpositionGain: annualGhi > 0 ? annualPoa / annualGhi : 1,
      dc: annualDc, ac: annualAc,
      specificYield: kwpTotal > 0 ? annualAc / kwpTotal : 0,
      performanceRatio: annualPoa > 0 ? annualAc / (kwpTotal * annualPoa) : 0,
      fullLoadHours: kwpTotal > 0 ? annualAc / kwpTotal : 0,
    },
    lossBreakdown,
    subFields,
    kwp: kwpTotal,
  };
}
