import test from 'node:test';
import assert from 'node:assert/strict';
import { construireRapport, conclusion, dateDuJour, echapper, SECTIONS }
  from '../js/rapport.js';
import { etudier, HYPOTHESES } from '../js/etude.js';
import { evaluer } from '../js/score.js';
import { dimensionner, nombreDeModules } from '../js/technique.js';
import { consommationMensuelle } from '../js/batiment.js';
import { resoudre } from '../js/consommation.js';
import { MODULE_DEFAUT, MODULES } from '../js/materiel.js';

const E = etudier({
  consommationAnnuelle: 7200, montantAnnuel: 2040, gouvernorat: 'sfax',
  puissance: 4, orientation: 'sud', pente: 'moyenne', batiment: 'maison',
  surfaceDisponible: 45,
});

const RAPPORT = (extra = {}) => construireRapport({
  etude: E,
  source: resoudre('facture', { quantite: 1200, montant: 340, periode: 'bimestrielle' }),
  score: evaluer({ gouvernorat: 'sfax', orientation: 'sud', pente: 'moyenne',
    surfaceDisponible: 45, puissanceVisee: 4, tauxAutoconsommation: E.tauxAutoconsommation,
    retour: E.retour }),
  dimensionnement: dimensionner({ puissance: 4 }),
  toit: { orientation: 'sud', pente: 'moyenne', L: 9, P: 5 },
  consoMensuelle: consommationMensuelle(7200, 'maison'),
  gouvernorat: 'sfax',
  hypotheses: HYPOTHESES,
  reglagePose: { module: MODULE_DEFAUT },
  offre: { prix: 90 },
  quand: new Date('2026-03-14T10:00:00Z'),
  ...extra,
});

test('les neuf sections annoncées sont toutes écrites', () => {
  const html = RAPPORT();
  assert.equal(SECTIONS.length, 9);
  for (const [i, titre] of SECTIONS.entries()) {
    assert.ok(html.includes(titre), `section absente : ${titre}`);
    assert.ok(html.includes(`>${String(i + 1).padStart(2, '0')}<`), `numéro ${i + 1} absent`);
  }
});

test('le rapport ne compte pas les modules de deux façons différentes', () => {
  // Il annonçait « 8 modules » en page 3 et « 1 chaîne de 7 modules » en
  // page 8 : un document qui se contredit ne se défend devant aucun
  // installateur.
  for (const kwc of [2, 3, 4, 5.5, 8, 12, 20]) {
    for (const mod of MODULES) {
      const etude = etudier({ consommationAnnuelle: 7200, montantAnnuel: 2040,
        gouvernorat: 'sfax', puissance: kwc, moduleWc: mod.puissance });
      assert.equal(etude.modules, nombreDeModules(kwc, mod),
        `${kwc} kWc en ${mod.id} : ${etude.modules} contre ${nombreDeModules(kwc, mod)}`);
    }
  }
});

test('le nombre entier de modules ne promet jamais moins que l’étude', () => {
  // Toute la production annoncée est calculée sur la puissance visée :
  // arrondir vers le bas installerait moins que ce qui a été promis.
  for (const kwc of [1, 2.5, 4, 7.5, 13, 26]) {
    const e = etudier({ consommationAnnuelle: 7200, montantAnnuel: 2040,
      gouvernorat: 'sfax', puissance: kwc });
    assert.ok(e.puissanceInstallee >= kwc,
      `${kwc} kWc visés, ${e.puissanceInstallee} kWc posés`);
  }
});

test('la puissance réellement posée figure au rapport', () => {
  assert.match(RAPPORT(), /Puissance réellement posée/);
  assert.match(RAPPORT(), /Puissance visée/);
});

test('le nom du client ne peut pas refermer une balise', () => {
  // Ce document finit imprimé, envoyé, archivé.
  const html = RAPPORT({ client: { nom: '<img src=x onerror=alert(1)>' } });
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img src=x'));
  assert.equal(echapper('a & b < c'), 'a &amp; b &lt; c');
  assert.equal(echapper(null), '');
});

test('la conclusion s’adapte à ce que le calcul a donné', () => {
  const bon = conclusion(E, { note: 85, palier: {} });
  const faible = conclusion(E, { note: 30, palier: {} });
  assert.notEqual(bon, faible, 'une conclusion identique pour tout ne conclut rien');
  assert.match(bon, /favorable/);
  assert.match(faible, /pèsent sur/);
  // Dans les deux cas, la visite reste annoncée comme indispensable.
  for (const c of [bon, faible]) assert.match(c, /visite technique/);
});

test('la conclusion accorde le possessif, quel que soit le bâtiment', () => {
  for (const bat of ['maison', 'commerce', 'industrie', 'agricole']) {
    const e = etudier({ consommationAnnuelle: 7200, montantAnnuel: 2040,
      gouvernorat: 'sfax', puissance: 4, batiment: bat });
    const c = conclusion(e, { note: 80, palier: {} });
    assert.ok(!/\bce (maison|exploitation)/.test(c), `accord fautif : ${c.slice(0, 80)}`);
    assert.match(c, /votre /);
  }
});

test('un retour au-delà de la durée d’étude est dit, pas masqué', () => {
  const lourd = etudier({ consommationAnnuelle: 7200, montantAnnuel: 2040,
    gouvernorat: 'sfax', puissance: 4,
    hypotheses: { ...HYPOTHESES, coutParKwc: HYPOTHESES.coutParKwc * 60 } });
  assert.match(conclusion(lourd, { note: 70, palier: {} }), /dépasse la durée/);
});

test('le rapport porte les hypothèses, et dit qu’il n’est pas un devis', () => {
  const html = RAPPORT();
  // Les retours à la ligne du gabarit tombent au milieu des phrases : on
  // cherche le sens, pas la mise en forme.
  const plat = html.replace(/\s+/g, ' ');
  assert.match(plat, /ne constituent pas un devis/);
  assert.match(plat, /ni un devis, ni une garantie de performance/);
  assert.ok(html.includes(String(HYPOTHESES.duree)));
});

test('le rapport renvoie vers l’étude technique payante, sans se confondre avec elle', () => {
  const html = RAPPORT();
  assert.match(html, /étude technique détaillée/);
  assert.match(html, /90/);
});

test('sans cotes de toiture, l’implantation est annoncée absente plutôt qu’inventée', () => {
  const html = RAPPORT({ toit: { orientation: 'sud', pente: 'moyenne' } });
  assert.match(html, /cotes de la toiture n’ont pas été communiquées/);
  assert.ok(!html.includes('Modules posés'));
});

test('une toiture-terrasse est décrite comme telle', () => {
  const html = RAPPORT({ toit: { pente: 'plat', L: 9, P: 5 } });
  assert.match(html, /toiture-terrasse/);
});

test('la date est écrite en toutes lettres, en français', () => {
  assert.equal(dateDuJour(new Date('2026-03-14T10:00:00Z')), '14 mars 2026');
  assert.ok(RAPPORT().includes('14 mars 2026'));
});

test('sans étude, aucun rapport n’est produit', () => {
  assert.equal(construireRapport({ etude: null, hypotheses: HYPOTHESES }), '');
});
