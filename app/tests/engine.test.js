import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as solar from '../js/core/solar.js';
import * as sizing from '../js/core/sizing.js';
import * as energy from '../js/core/energy.js';
import * as battery from '../js/core/battery.js';
import * as cabling from '../js/core/cabling.js';
import * as finance from '../js/core/finance.js';

// Site de référence : Tunis (36,8 °N), valeurs mensuelles usuelles.
const TUNIS_GHI = [2.6, 3.5, 4.7, 5.8, 6.6, 7.2, 7.3, 6.6, 5.3, 4.0, 2.9, 2.4];
const TUNIS_TA = [11.9, 12.4, 14.2, 16.8, 20.7, 24.9, 27.8, 28.3, 25.8, 22.0, 16.8, 13.2];

const MODULE = {
  ref: 'TEST-550', pmax: 550, voc: 49.9, vmp: 41.8, isc: 13.95, impp: 13.16,
  betaVoc: -0.25, alphaIsc: 0.045, gammaPmax: -0.34, noct: 45,
  length: 2.278, width: 1.134, reverseCurrent: 25,
};
const INVERTER = {
  ref: 'TEST-10K', pacNom: 10000, pdcMax: 15000, vdcMax: 1000, vdcStart: 150,
  mpptMin: 200, mpptMax: 850, mpptCount: 2, iMaxPerMppt: 26, iSccPerMppt: 40,
  effEuro: 0.976, phases: 3,
};

test('géométrie solaire : déclinaison aux solstices et équinoxes', () => {
  assert.ok(Math.abs(solar.declination(172) - 23.45) < 0.5);   // 21 juin
  assert.ok(Math.abs(solar.declination(355) + 23.45) < 0.5);   // 21 décembre
  assert.ok(Math.abs(solar.declination(81)) < 1.5);            // équinoxe de mars
});

test('angle horaire du coucher : 12 h de jour à l\'équateur, ~5,5 h au solstice à 60°N', () => {
  assert.ok(Math.abs(solar.sunsetHourAngle(0, 0) - 90) < 0.01);
  const daylight = 2 * solar.sunsetHourAngle(60, -23.45) / 15;
  assert.ok(daylight > 5 && daylight < 6, `durée du jour = ${daylight} h`);
});

test('irradiation extraterrestre cohérente (10-12 kWh/m²/j en été, 45°N)', () => {
  const h0 = solar.extraterrestrialDaily(45, 172) / 1000;
  assert.ok(h0 > 10.5 && h0 < 12.0, `H0=${h0}`);
});

test('transposition : gain de 10 à 20 % à l\'inclinaison optimale (Tunis)', () => {
  let poa = 0, ghi = 0;
  for (let m = 0; m < 12; m++) {
    poa += solar.planeOfArrayDaily({ latitude: 36.8, month: m, ghi: TUNIS_GHI[m], tilt: 31, azimuth: 0 }).poa
      * solar.DAYS_IN_MONTH[m];
    ghi += TUNIS_GHI[m] * solar.DAYS_IN_MONTH[m];
  }
  const gain = poa / ghi;
  assert.ok(gain > 1.08 && gain < 1.22, `gain=${gain}`);
});

test('transposition : un plan horizontal reçoit exactement le GHI', () => {
  const r = solar.planeOfArrayDaily({ latitude: 36.8, month: 5, ghi: 7.2, tilt: 0, azimuth: 0 });
  assert.ok(Math.abs(r.poa - 7.2) / 7.2 < 0.02, `poa=${r.poa}`);
});

test('inclinaison optimale proche de la latitude', () => {
  const t = solar.optimalTilt(36.8, TUNIS_GHI);
  assert.ok(Math.abs(t - 36.8) < 12, `tilt=${t}`);
});

test('température de cellule : +30 °C environ à 1000 W/m² et NOCT 45', () => {
  assert.equal(Math.round(solar.cellTemperature(25, 1000, 45)), 56);
});

test('bornes de mise en série cohérentes avec la plage onduleur', () => {
  const r = sizing.seriesRange(MODULE, INVERTER, { tMin: -5, tCellMax: 70 });
  assert.ok(r.feasible);
  assert.ok(r.vocCold > MODULE.voc, 'Voc augmente quand il fait froid');
  assert.ok(r.vmpHot < MODULE.vmp, 'Vmp baisse quand il fait chaud');
  assert.ok(r.max * r.vocCold <= INVERTER.vdcMax);
});

test('configuration du champ : cible respectée et contraintes satisfaites', () => {
  const c = sizing.configureArray({ module: MODULE, inverter: INVERTER, targetKwp: 11, temps: { tMin: -5, tCellMax: 70 } });
  assert.ok(c.feasible, JSON.stringify(c.issues));
  assert.ok(Math.abs(c.kwp - 11) / 11 < 0.15, `kwp=${c.kwp}`);
  assert.ok(c.vocStringCold <= INVERTER.vdcMax);
  assert.ok(c.stringsPerMppt * MODULE.impp <= INVERTER.iMaxPerMppt);
  assert.equal(c.moduleCount, c.seriesPerString * c.stringCount);
});

test('configuration impossible détectée (onduleur 600 V, string trop long)', () => {
  const small = { ...INVERTER, vdcMax: 60, mpptMin: 55 };
  const c = sizing.configureArray({ module: MODULE, inverter: small, targetKwp: 5 });
  assert.equal(c.feasible, false);
});

test('production spécifique réaliste à Tunis (1500-1900 kWh/kWc)', () => {
  const s = energy.simulate({
    latitude: 36.8, monthlyGhi: TUNIS_GHI, monthlyTa: TUNIS_TA,
    tilt: 31, azimuth: 0, kwp: 10, gammaPmax: -0.34, noct: 45, inverterEff: 0.976,
  });
  assert.ok(s.annual.specificYield > 1500 && s.annual.specificYield < 1900,
    `specific=${s.annual.specificYield}`);
  assert.ok(s.annual.performanceRatio > 0.72 && s.annual.performanceRatio < 0.86,
    `PR=${s.annual.performanceRatio}`);
  assert.equal(s.months.length, 12);
  // Un plan incliné à 31° aplatit la saisonnalité : le rapport été/hiver est
  // nettement plus faible que sur plan horizontal, mais reste marqué.
  const summerWinter = s.months[6].ac / s.months[11].ac;
  assert.ok(summerWinter > 1.4 && summerWinter < 2.2, `été/hiver = ${summerWinter}`);
  // Le ratio de performance est meilleur en hiver : les modules sont plus froids.
  assert.ok(s.months[11].pr > s.months[6].pr);
});

test('bilan des pertes cohérent avec la production annuelle', () => {
  const s = energy.simulate({
    latitude: 36.8, monthlyGhi: TUNIS_GHI, monthlyTa: TUNIS_TA,
    tilt: 31, azimuth: 0, kwp: 10, inverterEff: 0.97,
  });
  assert.ok(Math.abs(s.lossBreakdown.final - s.annual.ac) / s.annual.ac < 0.02);
});

test('autoconsommation : borne haute quand la production couvre à peine le besoin', () => {
  const a = energy.selfConsumption({ annualProduction: 2000, annualConsumption: 10000 });
  assert.ok(a.rate > 0.7, `rate=${a.rate}`);
  const b = energy.selfConsumption({ annualProduction: 12000, annualConsumption: 4000 });
  assert.ok(b.rate < 0.35, `rate=${b.rate}`);
  assert.ok(b.exported > b.selfUsed);
});

test('le stockage augmente le taux d\'autoconsommation', () => {
  const base = energy.selfConsumption({ annualProduction: 8000, annualConsumption: 6000 });
  const stored = energy.selfConsumption({ annualProduction: 8000, annualConsumption: 6000, hasBattery: true, batteryKwh: 10 });
  assert.ok(stored.rate > base.rate);
});

test('banc de batteries : capacité et arrangement', () => {
  const need = battery.sizeBank({ dailyEnergyKwh: 10, autonomyDays: 2, dod: 0.8, busVoltage: 48 });
  assert.ok(need.grossKwh > 25 && need.grossKwh < 35, `${need.grossKwh}`);
  const bat = { ref: 'LFP-48-100', vNom: 51.2, capacityAh: 100, dod: 0.9 };
  const arr = battery.arrangeBank({ battery: bat, targetKwh: need.grossKwh, busVoltage: 48 });
  assert.equal(arr.series, 1);
  assert.ok(arr.installedKwh >= need.grossKwh);
});

test('régulateur MPPT : courant côté batterie', () => {
  const c = battery.sizeChargeController({ pvKwp: 3, busVoltage: 48, type: 'mppt' });
  assert.ok(Math.abs(c.currentA - 78.1) < 1, `${c.currentA}`);
});

test('chute de tension : formule continue vérifiée à la main', () => {
  // 2 × 0,02314 × 30 m × 13 A / 6 mm² = 3,01 V
  const d = cabling.voltageDrop({ mode: 'dc', current: 13, length: 30, section: 6, voltage: 600 });
  assert.ok(Math.abs(d.volts - 3.008) < 0.02, `${d.volts}`);
  assert.ok(Math.abs(d.percent - 0.501) < 0.01);
});

test('sélection de section : la chute de tension devient dimensionnante sur les longues liaisons', () => {
  const short = cabling.selectSection({ mode: 'dc', current: 13, designCurrent: 17, length: 10, voltage: 600, maxDropPercent: 1 });
  const long = cabling.selectSection({ mode: 'dc', current: 13, designCurrent: 17, length: 200, voltage: 600, maxDropPercent: 1 });
  assert.ok(long.section > short.section);
  assert.equal(long.governing, 'drop');
  assert.ok(long.drop.percent <= 1);
});

test('courant admissible décroît avec la température ambiante', () => {
  assert.ok(cabling.ampacity(6, { ambientC: 60 }) < cabling.ampacity(6, { ambientC: 30 }));
  assert.ok(Math.abs(cabling.tempCorrection(60) - 0.71) < 1e-9);
});

test('protection de chaîne : requise au-delà de 2 chaînes en parallèle', () => {
  assert.equal(cabling.stringProtection({ isc: 13.95, stringCount: 2 }).required, false);
  const p = cabling.stringProtection({ isc: 13.95, stringCount: 4, moduleReverseCurrent: 25 });
  assert.equal(p.required, true);
  assert.ok(p.rating >= 1.5 * 13.95 && p.rating <= 2.4 * 13.95);
  assert.ok(p.ok);
});

test('disjoncteur alternatif : 1,25 × courant nominal, calibre normalisé', () => {
  const p = cabling.acProtection({ inverterPacW: 10000, voltage: 400, phases: 3, cosPhi: 1 });
  assert.ok(Math.abs(p.current - 14.43) < 0.1);
  assert.equal(p.rating, 20);
});

test('flux financiers : VAN, TRI et temps de retour cohérents', () => {
  const rows = finance.cashflows({
    capex: 9000, annualProduction: 16000, selfConsumptionRate: 0.6,
    tariffBuy: 0.25, tariffSell: 0.10, years: 25,
  });
  assert.equal(rows.length, 26);
  assert.equal(rows[0].net, -9000);
  const v = finance.npv(rows);
  const r = finance.irr(rows);
  const pb = finance.payback(rows);
  assert.ok(v > 0, `VAN=${v}`);
  assert.ok(r > 0.1 && r < 0.6, `TRI=${r}`);
  assert.ok(pb > 2 && pb < 12, `retour=${pb}`);
  // Le temps de retour actualisé est nécessairement plus long.
  assert.ok(finance.payback(rows, { discounted: true }) > pb);
});

test('TRI nul quand le projet ne rapporte jamais', () => {
  const rows = finance.cashflows({
    capex: 100000, annualProduction: 100, selfConsumptionRate: 1,
    tariffBuy: 0.01, tariffSell: 0, years: 25,
  });
  assert.equal(finance.irr(rows), null);
  assert.equal(finance.payback(rows), null);
});

test('LCOE dans la plage attendue pour une installation résidentielle', () => {
  const c = finance.lcoe({ capex: 9000, annualProduction: 16000, discountRate: 0.06, years: 25 });
  assert.ok(c > 0.03 && c < 0.12, `LCOE=${c}`);
});

test('CO₂ évité proportionnel à la production', () => {
  const a = finance.carbonAvoided({ annualProduction: 16000, gridFactor: 0.45 });
  assert.ok(a.avoidedTons > 100 && a.avoidedTons < 200, `${a.avoidedTons}`);
});
