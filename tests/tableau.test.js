import test from 'node:test';
import assert from 'node:assert/strict';
import { carteCentrale, grilleKpi, carteScore, avertissement, phraseCo2, ICONES }
  from '../js/tableau.js';
import { etudier, HYPOTHESES } from '../js/etude.js';
import { evaluer } from '../js/score.js';
import { grapheComparaison, diagrammeFlux } from '../js/graphe.js';
import { consommationMensuelle, PROFILS_MENSUELS } from '../js/batiment.js';
import { MOIS } from '../js/gisement.js';

const E = etudier({
  consommationAnnuelle: 7200, montantAnnuel: 2040, gouvernorat: 'sfax',
  puissance: 4, orientation: 'sud', pente: 'moyenne', batiment: 'maison',
});

/* ---- profils de consommation ---- */

test('chaque profil mensuel totalise bien douze mois moyens', () => {
  for (const [nom, profil] of Object.entries(PROFILS_MENSUELS)) {
    assert.equal(profil.length, 12, nom);
    const somme = profil.reduce((s, v) => s + v, 0);
    assert.ok(Math.abs(somme - 12) < 0.01, `${nom} totalise ${somme} au lieu de 12`);
  }
});

test('la consommation mensuelle retombe sur le total annuel', () => {
  for (const bat of ['maison', 'commerce', 'industrie', 'agricole']) {
    const mois = consommationMensuelle(7200, bat);
    const somme = mois.reduce((s, v) => s + v, 0);
    assert.ok(Math.abs(somme - 7200) < 20, `${bat} : ${somme} au lieu de 7200`);
  }
});

test('les relevés du client priment toujours sur le profil type', () => {
  const vrais = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200];
  assert.deepEqual(consommationMensuelle(7200, 'maison', vrais), vrais);
  // Douze mois incomplets ne sont pas des relevés : on retombe sur le profil.
  const partiel = vrais.slice(0, 9);
  assert.notDeepEqual(consommationMensuelle(7200, 'maison', partiel), partiel);
});

test('un logement est plus saisonnier qu’un atelier', () => {
  const creux = (p) => Math.min(...p) / Math.max(...p);
  assert.ok(creux(PROFILS_MENSUELS.residentiel) < creux(PROFILS_MENSUELS.industriel));
  assert.ok(creux(PROFILS_MENSUELS.agricole) < creux(PROFILS_MENSUELS.residentiel));
});

test('sans consommation, aucun profil n’est inventé', () => {
  assert.equal(consommationMensuelle(0, 'maison'), null);
  assert.equal(consommationMensuelle(-100, 'maison'), null);
});

/* ---- le tableau de bord ---- */

test('la carte centrale porte la puissance et de quoi la situer', () => {
  const html = carteCentrale(E);
  assert.match(html, /Puissance recommandée/);
  assert.match(html, /data-compte="4"/);
  assert.match(html, /kWc/);
  assert.match(html, new RegExp(`${E.modules} modules`));
  assert.match(carteCentrale(E, { titre: 'Puissance choisie' }), /Puissance choisie/);
});

test('la valeur finale est écrite avant toute animation', () => {
  // Si le script d'animation ne part pas, le chiffre doit être là quand même.
  assert.match(carteCentrale(E), />4<\/span>/);
});

test('les cinq chiffres de décision sont tous présents et chiffrés', () => {
  const html = grilleKpi(E);
  for (const attendu of ['Production annuelle', 'Couverture estimée',
    'Économies estimées', 'Retour estimé', 'CO₂ évité']) {
    assert.ok(html.includes(attendu), `${attendu} absent du tableau de bord`);
  }
  assert.equal((html.match(/data-compte=/g) ?? []).length, 5);
});

test('un retour au-delà de la durée d’étude ne s’invente pas un chiffre', () => {
  const lourd = etudier({ consommationAnnuelle: 7200, montantAnnuel: 2040,
    gouvernorat: 'sfax', puissance: 4,
    hypotheses: { ...HYPOTHESES, coutParKwc: HYPOTHESES.coutParKwc * 60 } });
  assert.equal(lourd.retour, null);
  const html = grilleKpi(lourd);
  assert.match(html, /&gt; 25|> 25/);
});

test('chaque icône annoncée existe', () => {
  const html = grilleKpi(E);
  for (const cle of Object.keys(ICONES)) assert.ok(ICONES[cle].startsWith('<svg'));
  assert.equal((html.match(/class="kpi-ic"/g) ?? []).length, 5);
});

test('la carte de score dit sa note, sa phrase et son détail', () => {
  const s = evaluer({ gouvernorat: 'sfax', orientation: 'sud', pente: 'moyenne',
    surfaceDisponible: 45, puissanceVisee: 4, tauxAutoconsommation: 0.67, retour: 6.6 });
  const html = carteScore(s);
  assert.match(html, new RegExp(`<b>${s.note}</b>`));
  assert.ok(html.includes(s.palier.phrase));
  for (const f of s.facteurs) assert.ok(html.includes(f.detail), f.cle);
  assert.ok(!html.includes('score-preliminaire'));
});

test('un score préliminaire le dit sur la carte, avec sa confiance', () => {
  const s = evaluer({ gouvernorat: 'sfax' });
  const html = carteScore(s);
  assert.match(html, /score-preliminaire/);
  assert.match(html, /Score préliminaire/);
  assert.match(html, /20 % des critères/);
  assert.match(html, /sorti du calcul plutôt que deviné/);
});

test('sans score, la carte disparaît au lieu d’afficher un vide', () => {
  assert.equal(carteScore(null), '');
  assert.equal(carteScore(undefined), '');
});

test('l’avertissement chiffre les hypothèses au lieu de les taire', () => {
  const html = avertissement(E, HYPOTHESES);
  assert.ok(html.includes(String(HYPOTHESES.duree)));
  assert.match(html, /ne remplace pas une visite/);
  assert.match(html, /non un devis/);
  assert.match(html, /% de hausse annuelle/);
});

test('le CO₂ est traduit en quelque chose de compréhensible', () => {
  const phrase = phraseCo2(E);
  assert.match(phrase, /arbres/);
  assert.match(phrase, /vingt-cinq ans/);
});

/* ---- les graphiques ---- */

test('la comparaison exige bien douze mois de chaque côté', () => {
  const conso = consommationMensuelle(7200, 'maison');
  assert.ok(grapheComparaison(E.mensuel, conso, MOIS));
  assert.equal(grapheComparaison(E.mensuel.slice(0, 6), conso, MOIS), null);
  assert.equal(grapheComparaison(E.mensuel, conso.slice(0, 6), MOIS), null);
  assert.equal(grapheComparaison(null, conso, MOIS), null);
});

test('la comparaison dit dans son texte de remplacement ce qu’elle montre', () => {
  const conso = consommationMensuelle(7200, 'maison');
  const svg = grapheComparaison(E.mensuel, conso, MOIS);
  const couverts = E.mensuel.filter((p, i) => p >= conso[i]).length;
  assert.match(svg, new RegExp(`${couverts} mois sur 12`));
});

test('le diagramme de flux nomme les quatre étapes et les deux sorties', () => {
  const svg = diagrammeFlux(E);
  for (const mot of ['Soleil', 'Panneaux', 'Onduleur', 'Votre bâtiment', 'Réseau STEG']) {
    assert.ok(svg.includes(mot), `${mot} absent du flux`);
  }
  assert.match(svg, /consommés sur place/);
  assert.match(svg, /vendus au réseau/);
});

test('une petite installation vend peu et achète beaucoup', () => {
  // Sur un gros consommateur, presque tout passe sur place : la flèche vers
  // le réseau doit être la plus mince, celle de l'achat la plus grosse.
  const petite = etudier({ consommationAnnuelle: 20000, montantAnnuel: 5600,
    gouvernorat: 'sfax', puissance: 2 });
  assert.ok(petite.surplus / petite.production < 0.1, 'surplus trop élevé pour ce cas');
  const svg = diagrammeFlux(petite);
  assert.match(svg, /encore achetés/);
  const epaisseurs = [...svg.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => Number(m[1]));
  // Aucune flèche ne descend sous le plancher lisible, et la plus mince — le
  // surplus — est nettement plus fine que celle qui va au bâtiment.
  assert.ok(Math.min(...epaisseurs) >= 5, `${Math.min(...epaisseurs)} px, illisible`);
  assert.ok(Math.min(...epaisseurs) < Math.max(...epaisseurs) / 2);
});

test('sans surplus du tout, aucune flèche ne part vers le réseau', () => {
  // Montrer une vente qui n'existe pas ferait attendre au client un revenu
  // qui ne viendra jamais.
  const svg = diagrammeFlux({ production: 3000, autoconsomme: 3000, surplus: 0,
    consommation: 9000, puissance: 2, productible: 1650 });
  assert.ok(!svg.includes('vendus au réseau'));
  assert.match(svg, /encore achetés/);
});

test('rien n’est dessiné sans étude', () => {
  assert.equal(diagrammeFlux(null), null);
  assert.equal(diagrammeFlux({}), null);
});
