import test from 'node:test';
import assert from 'node:assert/strict';
import { reponses, simulation, reinitialiserSimulation, oublierReponses, cotesToit,
  reglagePose, donneesEtude, etudeCourante, scenariosCourants } from '../js/etat.js';
import { MODULE_DEFAUT, moduleParId } from '../js/materiel.js';
import { TYPE_DEFAUT } from '../js/batiment.js';
import { etudier } from '../js/etude.js';

/**
 * Ces fonctions décident de tout : quelle consommation entre dans le calcul,
 * quel bâtiment, quel module, quelle surface. Une erreur ici ne fait pas
 * planter la page — elle produit une étude fausse, proprement affichée.
 */

const remplir = (extra = {}) => {
  oublierReponses();
  Object.assign(reponses, {
    gouvernorat: 'sfax',
    batiment: 'commerce',
    consommation: { methode: 'facture',
      saisie: { quantite: 1200, montant: 340, periode: 'bimestrielle' } },
    toit: { orientation: 'sud', pente: 'moyenne', L: 9, P: 5 },
    installation: { module: 'mono-450', pose: 'portrait' },
    ...extra,
  });
  reinitialiserSimulation();
};

test('la surface se déduit des cotes du pan, et se remet à jour', () => {
  remplir();
  assert.deepEqual(cotesToit(), { L: 9, P: 5 });
  assert.equal(simulation.surface, 45);
  reponses.toit = { ...reponses.toit, L: 12, P: 6 };
  reinitialiserSimulation();
  assert.equal(simulation.surface, 72);
});

test('sans cotes, la surface ne contraint rien plutôt que de valoir zéro utile', () => {
  remplir({ toit: { orientation: 'sud', pente: 'moyenne' } });
  assert.equal(simulation.surface, 0);
  assert.equal(donneesEtude().surfaceDisponible, 0);
});

test('le module retenu à l’étape Installation gouverne tout le calcul', () => {
  remplir();
  assert.equal(reglagePose().module.id, 'mono-450');
  assert.equal(donneesEtude().moduleWc, moduleParId('mono-450').puissance);
  // Sans choix, on retombe sur le module par défaut plutôt que sur rien.
  remplir({ installation: {} });
  assert.equal(reglagePose().module.id, MODULE_DEFAUT.id);
  assert.equal(reglagePose().pose, 'auto');
});

test('toutes les réponses arrivent au calcul, aucune ne se perd en route', () => {
  remplir();
  const d = donneesEtude();
  assert.equal(d.gouvernorat, 'sfax');
  assert.equal(d.batiment, 'commerce');
  assert.equal(d.orientation, 'sud');
  assert.equal(d.pente, 'moyenne');
  assert.equal(d.surfaceDisponible, 45);
  assert.equal(d.consommationAnnuelle, 7200);
  assert.equal(d.montantAnnuel, 2040);
  assert.equal(d.fiabilite, 'facture');
});

test('sans type de bâtiment, on retient le profil le plus prudent', () => {
  remplir({ batiment: undefined });
  assert.equal(donneesEtude().batiment, TYPE_DEFAUT);
});

test('les douze mois saisis voyagent jusqu’au calcul', () => {
  const mois = [600, 580, 520, 480, 450, 500, 700, 750, 720, 540, 500, 560];
  remplir({ consommation: { methode: 'mensuel', saisie: { mois } } });
  assert.deepEqual(donneesEtude().mois, mois,
    'sans eux, la comparaison mensuelle retomberait sur un profil type');
});

test('une consommation inexploitable ne produit aucune donnée de calcul', () => {
  // Mieux vaut ne rien calculer qu'un résultat que le client croira vrai.
  remplir({ consommation: { methode: 'facture', saisie: {} } });
  assert.equal(donneesEtude(), null);
  assert.equal(etudeCourante(), null);
  assert.deepEqual(scenariosCourants(), []);
  oublierReponses();
  assert.equal(donneesEtude(), null);
});

test('l’étude affichée et les scénarios reposent sur les mêmes données', () => {
  // S'ils divergeaient, comparer trois scénarios ne voudrait plus rien dire.
  remplir();
  const d = donneesEtude();
  const attendue = etudier({ ...d, puissance: simulation.puissance });
  const obtenue = etudeCourante();
  assert.equal(obtenue.production, attendue.production);
  assert.equal(obtenue.prixKwh, attendue.prixKwh);
  assert.equal(obtenue.tauxAutoconsommation, attendue.tauxAutoconsommation);
  for (const s of scenariosCourants()) {
    assert.equal(s.etude.prixKwh, obtenue.prixKwh);
    assert.equal(s.etude.productible, obtenue.productible);
    assert.equal(s.etude.consommation, obtenue.consommation);
  }
});

test('la puissance choisie au curseur remplace la recommandation', () => {
  remplir();
  const recommandee = etudeCourante().puissance;
  simulation.puissance = recommandee + 2;
  simulation.sienne = true;
  assert.equal(etudeCourante().puissance, recommandee + 2);
  reinitialiserSimulation();
  assert.equal(simulation.puissance, null);
  assert.equal(simulation.sienne, false);
  assert.equal(etudeCourante().puissance, recommandee);
});

test('le type de bâtiment change réellement le résultat, jusqu’ici', () => {
  remplir({ batiment: 'maison' });
  const maison = etudeCourante();
  remplir({ batiment: 'industrie' });
  const usine = etudeCourante();
  assert.ok(usine.tauxAutoconsommation > maison.tauxAutoconsommation);
});

test('oublier les réponses ne laisse rien derrière', () => {
  remplir();
  oublierReponses();
  assert.deepEqual(Object.keys(reponses), []);
});

test('LE REPLI SUR LE CENTRE DU GOUVERNORAT FOURNIT ENFIN DES COORDONNÉES', async () => {
  // DÉFAUT CORRIGÉ : `CENTRES` range ses points en tableaux `[lat, lon]` et ce
  // code lisait `centre.lat`. Il rendait `undefined` à chaque fois. Le service
  // de rayonnement était donc interrogé sans coordonnées, c'est-à-dire jamais,
  // et personne ne s'en apercevait.
  const { reponses, position, oublierPosition } = await import('../js/etat.js');
  oublierPosition();
  reponses.gouvernorat = 'sfax';
  const p = position();
  assert.equal(p.originePosition, 'centre-gouvernorat');
  assert.ok(Number.isFinite(p.latitude), 'latitude absente');
  assert.ok(Number.isFinite(p.longitude), 'longitude absente');
  assert.ok(Math.abs(p.latitude - 34.74) < 0.01);
  assert.ok(Math.abs(p.longitude - 10.76) < 0.01);
  // Et la précision annoncée est celle d'un centre administratif, pas d'un toit.
  assert.equal(p.precisionPosition, 30000);
});

test('une position ne se retient qu’avec son origine', async () => {
  const { definirPosition, position, oublierPosition } = await import('../js/etat.js');
  const r = definirPosition({ latitude: 36.8065, longitude: 10.1815, precision: 8,
    altitude: 23, horodatage: 1700000000000, origine: 'capteur-fin' });
  assert.equal(r.origine, 'capteur-fin');
  const p = position();
  assert.equal(p.latitude, 36.8065);
  assert.equal(p.altitude, 23);
  assert.equal(p.horodatagePosition, 1700000000000);
  assert.equal(p.precisionPosition, 8);
  oublierPosition();
});

test('UNE POSITION INEXPLOITABLE NE REMPLACE PAS LA BONNE', async () => {
  const { definirPosition, position, oublierPosition } = await import('../js/etat.js');
  oublierPosition();
  definirPosition({ latitude: 36.8065, longitude: 10.1815, origine: 'carte' });
  for (const mauvaise of [null, {}, { latitude: 'x', longitude: 2 },
    { latitude: 95, longitude: 10 }, { latitude: 36, longitude: 400 }]) {
    assert.equal(definirPosition(mauvaise), null);
  }
  assert.equal(position().latitude, 36.8065, 'la bonne position a été écrasée');
  oublierPosition();
});

test('une altitude absente reste absente, elle ne devient pas zéro', async () => {
  const { definirPosition, position, oublierPosition } = await import('../js/etat.js');
  definirPosition({ latitude: 36.8, longitude: 10.1, origine: 'saisie' });
  assert.equal(position().altitude, null);
  assert.equal(position().precisionPosition, null);
  oublierPosition();
});
