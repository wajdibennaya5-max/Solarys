/**
 * Le logo est la première chose vue et la dernière retenue. Il doit tenir à
 * toutes les tailles, et rester lisible en une seule couleur — sur un dossier
 * imprimé, sur un tampon, sur une facture en noir et blanc.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { symbole, logo, MARQUE } from '../js/marque.js';

test('le symbole est carré et se redimensionne', () => {
  for (const t of [16, 40, 512]) {
    const s = symbole(t);
    assert.match(s, new RegExp(`width="${t}"`));
    assert.match(s, new RegExp(`height="${t}"`));
    assert.match(s, /viewBox="0 0 48 48"/, 'le cadre doit rester carré');
  }
});

test('chaque forme porte un remplissage explicite', () => {
  // Sans fill, un navigateur remplit en noir : le piège classique du SVG.
  for (const f of symbole().match(/<(path|circle)[^>]*>/g) ?? []) {
    assert.match(f, /fill="/, `forme sans fill : ${f.slice(0, 50)}`);
  }
});

test('le symbole se réduit à une seule couleur, pour l\'impression', () => {
  // Un logo qui ne survit pas au noir et blanc ne va pas sur un document.
  const s = symbole(40, { monochrome: '#000000' });
  const couleurs = new Set(s.match(/#[0-9a-f]{3,6}/gi) ?? []);
  assert.deepEqual([...couleurs], ['#000000'],
    `le symbole monochrome porte ${couleurs.size} couleurs : ${[...couleurs]}`);
  // Et en couleur, il en porte plusieurs — sinon le test ci-dessus ne
  // vérifierait rien.
  assert.ok(new Set(symbole().match(/#[0-9a-f]{3,6}/gi) ?? []).size > 1);
});

test('le symbole porte une description pour qui ne le voit pas', () => {
  assert.match(symbole(), /role="img"/);
  assert.match(symbole(), new RegExp(`aria-label="${MARQUE.nom}"`));
});

test('le logo complet porte le nom et la baseline', () => {
  const l = logo();
  assert.ok(l.includes(MARQUE.nom));
  assert.ok(l.includes(MARQUE.baseline));
});

test('le logo s\'adapte à un fond sombre', () => {
  assert.match(logo({ sombre: true }), /color:#fff/);
  assert.doesNotMatch(logo({ sombre: false }), /color:#fff/);
});
