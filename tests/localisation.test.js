import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classer, PRECISIONS, lireCoordonnees, formater, formaterDMS, deplacer,
  distanceMetres, decrire, heureDeMesure, metresParDegreLon, coordonneesValides,
  origine, ORIGINES,
} from '../js/localisation.js';

test('une précision annoncée décide de ce qu’on s’autorise', () => {
  assert.equal(classer(3).cle, 'fine');
  assert.equal(classer(45).cle, 'bonne');
  assert.equal(classer(300).cle, 'moyenne');
  assert.equal(classer(3000).cle, 'faible');
  assert.equal(classer(30000).cle, 'regionale');
  // Seules les deux premières autorisent de raisonner sur un bâtiment.
  assert.ok(classer(3).permetToiture && classer(45).permetToiture);
  assert.ok(!classer(300).permetToiture);
});

test('UNE PRÉCISION INCONNUE EST TRAITÉE COMME LA PIRE', () => {
  // Le défaut évité : `Number(null)` vaut 0, et un `0` mal filtré aurait
  // classé « précision fine » une position dont on ne sait rien.
  for (const rien of [null, undefined, '', NaN, -5, 'à peu près']) {
    assert.equal(classer(rien).cle, 'regionale', `${rien} devrait être régional`);
    assert.equal(classer(rien).permetToiture, false);
  }
  // Un vrai zéro mesuré reste fin : c'est une valeur, pas une absence.
  assert.equal(classer(0).cle, 'fine');
});

test('chaque classe de précision dit ce qu’elle vaut', () => {
  for (const p of PRECISIONS) {
    assert.ok(p.phrase.length > 20, `${p.cle} sans explication`);
    assert.equal(typeof p.permetToiture, 'boolean');
  }
});

test('on lit les coordonnées telles que les gens les collent', () => {
  assert.deepEqual(lireCoordonnees('36.8065, 10.1815'),
    { latitude: 36.8065, longitude: 10.1815, format: 'decimal' });
  assert.deepEqual(lireCoordonnees('36.8065 10.1815').format, 'decimal');
  assert.deepEqual(lireCoordonnees('36,8065; 10,1815').latitude, 36.8065);
  const dms = lireCoordonnees('36°48\'23"N 10°10\'53"E');
  assert.ok(Math.abs(dms.latitude - 36.8064) < 0.001);
  assert.ok(Math.abs(dms.longitude - 10.1814) < 0.001);
  // « O » pour Ouest en français, « W » en anglais.
  assert.ok(lireCoordonnees('36°48\'23"N 10°10\'53"O').longitude < 0);
  assert.ok(lireCoordonnees('36°48\'23"S 10°10\'53"E').latitude < 0);
});

test('on refuse ce qui n’est pas une coordonnée plutôt que d’en inventer une', () => {
  for (const mauvais of ['', '  ', 'Tunis', '36.8065', '200, 10', '36, 400',
    'abc, def', null, undefined]) {
    assert.equal(lireCoordonnees(mauvais), null, `${mauvais} accepté à tort`);
  }
});

test('coordonneesValides refuse les hors-monde', () => {
  assert.ok(coordonneesValides(36.8, 10.1));
  assert.ok(!coordonneesValides(91, 10));
  assert.ok(!coordonneesValides(36, 181));
  assert.ok(!coordonneesValides(null, 10));
  assert.ok(!coordonneesValides(NaN, NaN));
});

test('l’écriture et la relecture se retrouvent', () => {
  assert.equal(formater(36.8065, 10.1815), '36.806500, 10.181500');
  assert.equal(formater(null, 10), '—');
  const relu = lireCoordonnees(formater(36.806512, 10.181534));
  assert.ok(Math.abs(relu.latitude - 36.806512) < 1e-6);
  const dms = lireCoordonnees(formaterDMS(36.806512, 10.181534));
  assert.ok(Math.abs(dms.latitude - 36.806512) < 1e-4);
  assert.ok(Math.abs(dms.longitude - 10.181534) < 1e-4);
});

test('un déplacement en mètres tient compte de la latitude', () => {
  // Cent mètres vers l'est ne valent pas le même nombre de degrés à Tunis et
  // à l'équateur. L'oublier fausserait toute mesure de toiture.
  const a = deplacer(36.8, 10.1, 0, 100);
  const b = deplacer(0, 10.1, 0, 100);
  assert.ok(a.longitude - 10.1 > b.longitude - 10.1);
  assert.ok(metresParDegreLon(36.8) < metresParDegreLon(0));
  // Aller puis revenir doit retomber sur ses pieds.
  const aller = deplacer(36.8, 10.1, 50, 80);
  assert.ok(distanceMetres({ latitude: 36.8, longitude: 10.1 }, aller) - Math.hypot(50, 80) < 0.5);
});

test('une position inconnue le dit, et n’autorise rien', () => {
  const d = decrire({});
  assert.equal(d.connue, false);
  assert.equal(d.permetToiture, false);
  assert.equal(d.texte, '—');
  assert.match(d.phrase, /Aucune position/);
});

test('LE CENTRE D’UN GOUVERNORAT N’AUTORISE PAS DE MESURER UN TOIT', () => {
  const d = decrire({ latitude: 36.8, longitude: 10.18, precision: 30000,
    origine: 'centre-gouvernorat' });
  assert.equal(d.connue, true);
  assert.equal(d.permetToiture, false);
  assert.equal(d.precision.cle, 'regionale');
  assert.equal(d.origine.confiance, 'faible');
});

test('un point posé à la main est utilisable, et son origine reste visible', () => {
  const d = decrire({ latitude: 36.8, longitude: 10.18, origine: 'carte' });
  assert.equal(d.permetToiture, true);
  assert.equal(d.precisionAnnoncee, false, 'aucun capteur n’a annoncé de précision');
  assert.equal(d.precisionMetres, null);
  assert.equal(d.origine.libelle, 'Repère placé sur la carte');
});

test('un GPS fin autorise la suite du travail', () => {
  const d = decrire({ latitude: 36.8, longitude: 10.18, precision: 6,
    origine: 'capteur-fin', altitude: 23, horodatage: 1700000000000 });
  assert.equal(d.permetToiture, true);
  assert.equal(d.precisionMetres, 6);
  assert.equal(d.altitude, 23);
  assert.equal(d.horodatage, 1700000000000);
});

test('toute origine porte une méthode et une confiance', () => {
  for (const [cle, o] of Object.entries(ORIGINES)) {
    assert.ok(o.libelle && o.methode, `${cle} incomplet`);
    assert.ok(['elevee', 'moyenne', 'faible', 'nulle'].includes(o.confiance));
  }
  assert.equal(origine('n’existe pas'), ORIGINES.inconnue);
});

test('une heure de mesure absente n’est pas remplacée par maintenant', () => {
  // Écrire l'heure courante à la place d'une heure inconnue ferait passer une
  // position vieille de trois jours pour une mesure fraîche.
  assert.equal(heureDeMesure(null), null);
  assert.equal(heureDeMesure(0), null);
  assert.equal(heureDeMesure('hier'), null);
  assert.match(heureDeMesure(Date.now()), /^\d{2}\/\d{2}\/\d{4} à \d{2}:\d{2}$/);
});

test('UN POINT SAISI N’EST PAS UNE POSITION RÉGIONALE', async () => {
  // DÉFAUT CORRIGÉ : faute de précision annoncée, une coordonnée tapée à la
  // main tombait dans « précision inconnue », donc « Position régionale » —
  // affiché juste au-dessus d'un tracé de toiture autorisé. L'écran se
  // contredisait lui-même.
  const { decrire, DESIGNEE } = await import('../js/localisation.js');
  for (const o of ['saisie', 'carte']) {
    const d = decrire({ latitude: 36.8065, longitude: 10.1815, origine: o });
    assert.equal(d.precision.cle, 'designee', `${o} mal classé`);
    assert.equal(d.precision.libelle, DESIGNEE.libelle);
    assert.equal(d.permetToiture, true);
    assert.equal(d.precisionAnnoncee, false);
    assert.match(d.phrase, /aucune précision n’a été mesurée/);
  }
});

test('un point désigné qui porte une précision mesurée est classé dessus', async () => {
  // Si une précision existe, elle prime : c'est une mesure, pas un geste.
  const { decrire } = await import('../js/localisation.js');
  const d = decrire({ latitude: 36.8, longitude: 10.1, origine: 'saisie', precision: 900 });
  assert.equal(d.precision.cle, 'faible');
  assert.equal(d.permetToiture, false);
});

test('une position d’origine inconnue et sans précision reste régionale', async () => {
  // Le laisser-passer est réservé aux gestes délibérés, pas à l'ignorance.
  const { decrire } = await import('../js/localisation.js');
  const d = decrire({ latitude: 36.8, longitude: 10.1, origine: 'capteur' });
  assert.equal(d.precision.cle, 'regionale');
  assert.equal(d.permetToiture, false);
});
