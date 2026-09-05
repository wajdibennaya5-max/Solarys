import test from 'node:test';
import assert from 'node:assert/strict';
import { CAS, calculerCas, tousLesCas, DUREE } from '../js/heros.js';
import { etudier } from '../js/etude.js';
import { typeBatiment } from '../js/batiment.js';

test('les trois cas de l’accueil sont réellement calculés, pas écrits à la main', () => {
  // C'est ce qui autorise à les afficher avant que le visiteur ait saisi quoi
  // que ce soit : on ne lui promet rien, on montre le moteur qui tourne.
  for (const cas of CAS) {
    const calcule = calculerCas(cas);
    const direct = etudier(cas.donnees);
    assert.equal(calcule.chiffres.find((c) => c.cle === 'production').valeur,
      direct.production, cas.id);
    assert.equal(calcule.chiffres.find((c) => c.cle === 'economie').valeur,
      Math.round(direct.economieAnnuelle), cas.id);
  }
});

test('chaque cas est nommé et situé : rien n’est présenté comme universel', () => {
  for (const c of tousLesCas()) {
    assert.ok(c.intitule && c.detail, 'un exemple anonyme serait une promesse');
    assert.ok(c.lieu && c.lieu.length > 1);
    assert.ok(c.puissance > 0);
  }
});

test('les trois cas couvrent trois profils de bâtiment différents', () => {
  const profils = new Set(CAS.map((c) => typeBatiment(c.donnees.batiment).profil));
  assert.equal(profils.size, 3, 'trois maisons ne montreraient qu’un tiers du site');
});

test('les quatre chiffres affichés sont toujours les quatre mêmes', () => {
  for (const c of tousLesCas()) {
    assert.deepEqual(c.chiffres.map((x) => x.cle),
      ['production', 'couverture', 'economie', 'co2']);
    // Un seul est mis en avant : deux « fort » ne mettent plus rien en avant.
    assert.equal(c.chiffres.filter((x) => x.fort).length, 1);
  }
});

test('les consommations des exemples restent plausibles pour la Tunisie', () => {
  for (const cas of CAS) {
    const { consommationAnnuelle, montantAnnuel } = cas.donnees;
    const prix = montantAnnuel / consommationAnnuelle;
    assert.ok(prix > 0.15 && prix < 0.45, `${cas.id} : ${prix} DT/kWh invraisemblable`);
  }
});

test('un cas mal formé ne rend rien plutôt qu’un exemple faux', () => {
  assert.equal(calculerCas(null), null);
  assert.equal(calculerCas({}), null);
  assert.equal(calculerCas({ donnees: { consommationAnnuelle: 0 } }), null);
});

test('le défilement laisse le temps de lire', () => {
  assert.ok(DUREE >= 4000, 'une carte qui part en trois secondes ne se lit pas');
});
