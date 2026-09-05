/**
 * Le graphique porte l'argument de vente : le moment où le client cesse de
 * payer et commence à gagner. Une échelle fausse, et il montre le contraire
 * de ce qui est vrai.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { graduations, abreger, construireGraphe, MARGES } from '../js/graphe.js';
import { etudier } from '../js/etude.js';

const ETUDE = etudier({ consommationAnnuelle: 4800, montantAnnuel: 1200, gouvernorat: 'sfax' });

test('les graduations sont des nombres ronds, qu\'on additionne de tête', () => {
  for (const max of [100, 4321, 42691, 157122, 9]) {
    const g = graduations(max, 4);
    assert.ok(g.length >= 2 && g.length <= 6, `trop ou trop peu de graduations pour ${max}`);
    assert.equal(g[0], 0, 'l\'axe part de zéro');
    const pas = g[1] - g[0];
    // Le pas doit être 1, 2, 2,5, 5 ou 10 fois une puissance de dix.
    const mantisse = pas / 10 ** Math.floor(Math.log10(pas));
    assert.ok([1, 2, 2.5, 5, 10].some((m) => Math.abs(m - mantisse) < 0.01),
      `pas illisible : ${pas} (mantisse ${mantisse})`);
    // Et surtout : le même écart partout. Des lignes inégales mentent sur
    // les proportions de la courbe qu'elles servent à lire.
    for (let i = 1; i < g.length; i++) {
      assert.ok(Math.abs((g[i] - g[i - 1]) - pas) < 1e-9,
        `écart irrégulier dans ${g.join(' / ')}`);
    }
  }
});

test('les graduations couvrent la valeur maximale', () => {
  // Une graduation qui s'arrête avant la courbe laisse un point hors cadre.
  for (const max of [100, 4321, 42691]) {
    assert.ok(graduations(max, 4).at(-1) >= max * 0.75, `couverture insuffisante pour ${max}`);
  }
});

test('un maximum nul ou absurde ne fait pas planter l\'échelle', () => {
  assert.deepEqual(graduations(0), [0]);
  assert.deepEqual(graduations(-5), [0]);
});

test('les montants s\'abrègent en français', () => {
  assert.equal(abreger(42691), '43 k');
  assert.equal(abreger(4321), '4,3 k');
  assert.equal(abreger(900), '900');
  assert.equal(abreger(0), '0');
  // Une étiquette nomme la valeur atteinte : 2,5 ne s'écrit pas « 3 ».
  assert.equal(abreger(2.5), '2,5');
  assert.doesNotMatch(abreger(4321), /\./, 'pas de point décimal anglais');
});

test('le graphique tient dans son cadre', () => {
  const { svg, points } = construireGraphe(ETUDE, { largeur: 620, hauteur: 260 });
  assert.match(svg, /viewBox="0 0 620 260"/);
  for (const p of points) {
    assert.ok(p.x >= MARGES.gauche - 0.5 && p.x <= 620 - MARGES.droite + 0.5,
      `point hors cadre en X : ${p.x}`);
    assert.ok(p.y >= MARGES.haut - 0.5 && p.y <= 260 - MARGES.bas + 0.5,
      `point hors cadre en Y : ${p.y}`);
  }
});

test('la courbe monte, comme l\'économie cumulée', () => {
  // En SVG, y descend quand la valeur monte : chaque point doit être plus haut.
  const { points } = construireGraphe(ETUDE);
  for (let i = 1; i < points.length; i++) {
    assert.ok(points[i].y < points[i - 1].y, `la courbe redescend à l'année ${points[i].an}`);
  }
});

test('le temps de retour est marqué et nommé', () => {
  const { svg } = construireGraphe(ETUDE);
  // Le nombre se relit dans l'étude plutôt que d'être figé ici : affiner le
  // modèle financier ne doit pas casser un test de graphique.
  const attendu = ETUDE.retour.toFixed(1).replace('.', ',');
  assert.match(svg, new RegExp(`remboursé en ${attendu} ans`));
  assert.match(svg, /investissement/);
});

test('un projet sans retour ne marque aucun croisement', () => {
  const sansRetour = { ...ETUDE, retour: null };
  const { svg } = construireGraphe(sansRetour);
  assert.doesNotMatch(svg, /remboursé en/);
  assert.match(svg, /investissement/, 'la ligne de coût reste, elle');
});

test('chaque forme dessinée porte un remplissage explicite', () => {
  // Sans fill, un navigateur remplit en noir : la surprise classique du SVG.
  const { svg } = construireGraphe(ETUDE);
  const formes = svg.match(/<(path|circle|line)[^>]*>/g) ?? [];
  for (const f of formes) {
    assert.match(f, /fill="/, `forme sans fill : ${f.slice(0, 60)}`);
  }
});

test('le graphique porte une description pour qui ne le voit pas', () => {
  const { svg } = construireGraphe(ETUDE);
  assert.match(svg, /role="img"/);
  assert.match(svg, /aria-label="[^"]{30,}"/);
});
