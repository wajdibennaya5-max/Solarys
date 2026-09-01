import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { t, setLanguage, direction, LANGUAGES } from '../js/i18n.js';

/** Extrait les clés d'un dictionnaire du fichier source. */
function keysOf(name) {
  const src = readFileSync(new URL('../js/i18n.js', import.meta.url), 'utf8');
  const start = src.indexOf(`const ${name} = {`);
  const end = src.indexOf('\n};', start);
  const body = src.slice(start, end);
  return new Set([...body.matchAll(/'([a-zA-Z][\w.]*)'\s*:/g)].map((m) => m[1]));
}

// Le nom du produit est une marque : il reste identique dans toutes les langues.
const UNTRANSLATED = new Set(['app.name']);

test('les trois langues couvrent toutes les clés du français', () => {
  const fr = keysOf('fr');
  assert.ok(fr.size > 100, `${fr.size} clés`);
  for (const lang of ['en', 'ar']) {
    const dict = keysOf(lang);
    const missing = [...fr].filter((k) => !dict.has(k) && !UNTRANSLATED.has(k));
    assert.deepEqual(missing, [], `clés manquantes en ${lang} : ${missing.join(', ')}`);
  }
});

test('l\'arabe passe en écriture de droite à gauche', () => {
  setLanguage('ar');
  assert.equal(direction(), 'rtl');
  setLanguage('fr');
  assert.equal(direction(), 'ltr');
});

test('une clé inconnue retombe sur elle-même sans planter', () => {
  setLanguage('en');
  assert.equal(t('cle.inexistante'), 'cle.inexistante');
  setLanguage('fr');
});

test('les langues déclarées ont toutes un dictionnaire', () => {
  for (const l of LANGUAGES) {
    setLanguage(l.code);
    assert.notEqual(t('nav.dashboard'), 'nav.dashboard', `dictionnaire ${l.code} absent`);
  }
  setLanguage('fr');
});

/**
 * Filet de sécurité : toute clé effectivement demandée par le code doit exister
 * dans le dictionnaire français.
 *
 * Ce contrôle vient d'une vraie mésaventure : une insertion de traductions
 * n'avait pas atterri, et toute une section s'est affichée en clés brutes
 * — `surface.width`, `obstacle.kind.chimney` — sans qu'aucun test ne bronche,
 * parce que les trois dictionnaires étaient également incomplets.
 */
test('toute clé utilisée dans le code existe en français', () => {
  const fr = keysOf('fr');
  const racine = new URL('../js/', import.meta.url);
  const fichiers = [];
  const parcourir = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const u = new URL(`${e.name}${e.isDirectory() ? '/' : ''}`, dir);
      if (e.isDirectory()) parcourir(u);
      else if (e.name.endsWith('.js')) fichiers.push(u);
    }
  };
  parcourir(racine);

  const manquantes = new Map();
  for (const f of fichiers) {
    const src = readFileSync(f, 'utf8');
    // Seules les clés littérales sont vérifiables ; celles construites par
    // interpolation sont couvertes par les tests d'énumération ci-dessous.
    for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z][\w.]*)'/g)) {
      if (!fr.has(m[1])) {
        if (!manquantes.has(m[1])) manquantes.set(m[1], f.pathname.split('/js/')[1]);
      }
    }
  }
  assert.deepEqual([...manquantes.entries()], [],
    `clés absentes du dictionnaire français : ${[...manquantes].map(([k, f]) => `${k} (${f})`).join(', ')}`);
});

test('les clés construites par énumération existent toutes', () => {
  const fr = keysOf('fr');
  // Familles dont le suffixe vient d'une donnée et non d'un littéral.
  const familles = {
    'nav.': ['dashboard', 'project', 'site', 'load', 'layout', 'array', 'storage',
      'cabling', 'production', 'economics', 'sld', 'report', 'library', 'settings'],
    'nav.group.': ['study', 'design', 'results', 'tools'],
    'month.': Array.from({ length: 12 }, (_, i) => String(i + 1)),
    'project.type.': ['grid', 'hybrid', 'offgrid'],
    'project.install.': ['roof', 'ground', 'carport'],
    'load.mode.': ['bill', 'monthly', 'appliances'],
    'load.profile.': ['residential', 'office', 'industrial'],
    'surface.mounting.': ['coplanar', 'tilted'],
    'surface.orientation.': ['auto', 'portrait', 'paysage'],
    'obstacle.kind.': ['chimney', 'vent', 'skylight', 'equipment', 'wall', 'other'],
    'sizing.mode.': ['demand', 'surface', 'manual'],
    'licence.plan.': ['free', 'credits', 'perpetual', 'subscription'],
    'licence.offer.': ['credits', 'perpetual', 'subscription'],
    'cabling.material.': ['copper', 'aluminium'],
    'loss.': ['soiling', 'shading', 'mismatch', 'wiringDc', 'wiringAc', 'lid',
      'nameplate', 'availability', 'temperature', 'inverter', 'rowShading'],
    'warn.': ['array.infeasible', 'series.impossible', 'current.exceeded', 'voc.exceeded',
      'mppt.low', 'dcac.high', 'dcac.low', 'cable.dc.oversized', 'cable.ac.oversized',
      'fuse.impossible', 'bus.adjusted', 'layout.exceedsSurface', 'layout.empty',
      'surface.tooFewPoints', 'surface.selfIntersecting', 'surface.tooSmall',
      'surface.setbackTooLarge', 'surface.tiltRange', 'obstacle.outside',
      'setback.tooLarge', 'outline.tooFewPoints', 'outline.selfIntersecting',
      'pitch.sunTooLow', 'pitch.noLatitude'],
  };
  const manquantes = [];
  for (const [prefixe, suffixes] of Object.entries(familles)) {
    for (const suffixe of suffixes) {
      const k = prefixe + suffixe;
      if (!fr.has(k)) manquantes.push(k);
    }
  }
  assert.deepEqual(manquantes, [], `clés manquantes : ${manquantes.join(', ')}`);
});
