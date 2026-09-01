/**
 * Dimensionnement du champ photovoltaïque et appariement avec l'onduleur.
 *
 * Les vérifications de tension suivent la logique de l'IEC 62548 (« Réseaux
 * PV — exigences de conception ») et du guide UTE C 15-712-1 :
 *  - la tension à vide du string à la température minimale du site ne doit
 *    jamais dépasser la tension DC maximale admissible de l'onduleur ;
 *  - la tension MPP à la température de cellule maximale doit rester dans la
 *    plage MPPT de l'onduleur.
 */

/** Coefficients de température exprimés en %/°C. */
const REF_TEMP = 25;

/** Tension à vide d'un module à une température de cellule donnée. */
export function vocAt(module, tCell) {
  return module.voc * (1 + (module.betaVoc / 100) * (tCell - REF_TEMP));
}

/** Tension au point de puissance maximale à une température de cellule donnée. */
export function vmpAt(module, tCell) {
  // À défaut de coefficient dédié, on utilise celui de Voc : hypothèse usuelle
  // et conservative pour la borne basse de la plage MPPT.
  const beta = module.betaVmp ?? module.betaVoc;
  return module.vmp * (1 + (beta / 100) * (tCell - REF_TEMP));
}

/** Courant de court-circuit d'un module à une température de cellule donnée. */
export function iscAt(module, tCell) {
  return module.isc * (1 + (module.alphaIsc / 100) * (tCell - REF_TEMP));
}

/**
 * Bornes admissibles du nombre de modules en série.
 *
 * @param {object} module      module PV de la bibliothèque
 * @param {object} inverter    onduleur de la bibliothèque
 * @param {object} temps
 * @param {number} temps.tMin  température ambiante minimale du site (°C)
 * @param {number} temps.tCellMax température de cellule maximale retenue (°C)
 * @returns {{min:number,max:number,vocCold:number,vmpHot:number,feasible:boolean}}
 */
export function seriesRange(module, inverter, { tMin = -10, tCellMax = 70 } = {}) {
  const vocCold = vocAt(module, tMin);
  const vmpHot = vmpAt(module, tCellMax);
  const max = Math.floor(inverter.vdcMax / vocCold);
  const byMppt = Math.ceil(inverter.mpptMin / vmpHot);
  const byStart = Math.ceil((inverter.vdcStart ?? inverter.mpptMin) / vmpHot);
  const min = Math.max(byMppt, byStart, 1);
  return { min, max, vocCold, vmpHot, feasible: max >= min };
}

/**
 * Propose une configuration de strings pour une puissance crête cible.
 *
 * @param {object} p
 * @param {object} p.module    module PV
 * @param {object} p.inverter  onduleur
 * @param {number} p.targetKwp puissance crête visée (kWc)
 * @param {object} [p.temps]   températures de dimensionnement
 * @returns {object} configuration retenue et diagnostics
 */
export function configureArray({ module, inverter, targetKwp, temps }) {
  const range = seriesRange(module, inverter, temps);
  const issues = [];
  if (!range.feasible) {
    issues.push({
      level: 'error', code: 'series.impossible',
      detail: { min: range.min, max: range.max },
    });
    return { feasible: false, issues, range };
  }

  const targetModules = Math.max(1, Math.round(targetKwp * 1000 / module.pmax));
  const mpptCount = inverter.mpptCount ?? 1;

  // On explore toutes les longueurs de string admissibles et on retient celle
  // qui approche au mieux la cible tout en respectant les limites de courant.
  let best = null;
  for (let ns = range.min; ns <= range.max; ns++) {
    const npTotal = Math.max(1, Math.round(targetModules / ns));
    // Répartition équilibrée sur les entrées MPPT.
    const perMppt = Math.ceil(npTotal / mpptCount);
    const iMpptMax = inverter.iMaxPerMppt ?? inverter.iMaxDc ?? Infinity;
    const iSccMax = inverter.iSccPerMppt ?? (iMpptMax * 1.25);
    const iString = module.impp;
    const iStringSc = iscAt(module, temps?.tCellMax ?? 70);
    if (perMppt * iString > iMpptMax) continue;
    if (perMppt * iStringSc > iSccMax) continue;

    const modules = ns * npTotal;
    const kwp = modules * module.pmax / 1000;
    const error = Math.abs(kwp - targetKwp);
    const dcAc = kwp * 1000 / inverter.pacNom;
    // On pénalise les configurations dont le ratio DC/AC sort de la plage usuelle.
    const penalty = dcAc > (inverter.dcAcMax ?? 1.35) ? (dcAc - 1.35) * targetKwp : 0;
    const score = error + penalty;
    if (!best || score < best.score) {
      best = { ns, np: npTotal, perMppt, modules, kwp, dcAc, score, iString, iStringSc };
    }
  }

  if (!best) {
    issues.push({ level: 'error', code: 'current.exceeded' });
    return { feasible: false, issues, range };
  }

  const vocString = best.ns * range.vocCold;
  const vmpString = best.ns * range.vmpHot;
  if (vocString > inverter.vdcMax) {
    issues.push({ level: 'error', code: 'voc.exceeded', detail: { vocString, limit: inverter.vdcMax } });
  }
  if (vmpString < inverter.mpptMin) {
    issues.push({ level: 'warn', code: 'mppt.low', detail: { vmpString, limit: inverter.mpptMin } });
  }
  if (best.dcAc > (inverter.dcAcMax ?? 1.35)) {
    issues.push({ level: 'warn', code: 'dcac.high', detail: { ratio: best.dcAc } });
  }
  if (best.dcAc < 0.85) {
    issues.push({ level: 'warn', code: 'dcac.low', detail: { ratio: best.dcAc } });
  }

  return {
    feasible: issues.every((i) => i.level !== 'error'),
    issues, range,
    seriesPerString: best.ns,
    stringCount: best.np,
    stringsPerMppt: best.perMppt,
    moduleCount: best.modules,
    kwp: best.kwp,
    dcAcRatio: best.dcAc,
    vocStringCold: vocString,
    vmpStringHot: vmpString,
    stringCurrent: best.iString,
    stringCurrentSc: best.iStringSc,
    arrayCurrent: best.np * best.iString,
    arrayAreaM2: best.modules * (module.length * module.width),
  };
}

/**
 * Nombre d'onduleurs identiques nécessaires pour couvrir une puissance crête,
 * en restant sous le ratio DC/AC maximal.
 */
export function inverterCount(targetKwp, inverter, dcAcMax = 1.25) {
  return Math.max(1, Math.ceil(targetKwp * 1000 / (inverter.pacNom * dcAcMax)));
}
