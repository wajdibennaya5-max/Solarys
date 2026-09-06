import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aireProjetee, surfaceRampant, perimetre, cotes, centre, seRecoupe, verifierTrace,
  capSegment, capEnClair, azimutSolaire, etalonner, mesurer, projeter, deprojeter,
  ETALONNAGE_MAX, ETALONNAGE_MIN,
} from '../js/toiture.js';
import { AZIMUTS } from '../js/pvgis/parametres.js';

const LAT = 36.8;
const LON = 10.1;
const dLat = (m) => m / 111320;
const dLon = (m) => m / (111320 * Math.cos(LAT * Math.PI / 180));

/** Un rectangle aligné nord-sud, de `L` mètres est-ouest sur `P` nord-sud. */
const rectangle = (L, P) => [
  { latitude: LAT, longitude: LON },
  { latitude: LAT, longitude: LON + dLon(L) },
  { latitude: LAT + dLat(P), longitude: LON + dLon(L) },
  { latitude: LAT + dLat(P), longitude: LON },
];

test('UN CARRÉ DE DIX MÈTRES FAIT CENT MÈTRES CARRÉS', () => {
  // Si cette assertion tombe, tout le reste du projet est faux : c'est de
  // cette surface que viennent les panneaux, la puissance et le devis.
  assert.ok(Math.abs(aireProjetee(rectangle(10, 10)) - 100) < 0.01);
  assert.ok(Math.abs(aireProjetee(rectangle(12.5, 8)) - 100) < 0.01);
  assert.ok(Math.abs(perimetre(rectangle(10, 10)) - 40) < 0.01);
});

test('le sens du tracé ne change pas la surface', () => {
  // Personne ne dessine dans un sens convenu.
  const horaire = rectangle(10, 6);
  const antihoraire = [...horaire].reverse();
  assert.ok(Math.abs(aireProjetee(horaire) - aireProjetee(antihoraire)) < 1e-9);
});

test('LA PENTE AJOUTE DE LA SURFACE, ET ON LA COMPTE', () => {
  // Un toit à 30° porte 15,5 % de surface de plus que son emprise vue du ciel.
  // La confusion se paie en modules qui ne rentrent pas sur le chantier.
  const plat = surfaceRampant(rectangle(10, 10), 0);
  assert.ok(Math.abs(plat - 100) < 0.01, 'une terrasse plate ne gagne rien');
  assert.ok(Math.abs(surfaceRampant(rectangle(10, 10), 30) - 115.47) < 0.02);
  assert.ok(Math.abs(surfaceRampant(rectangle(10, 10), 45) - 141.42) < 0.02);
  // Une pente absurde ne doit pas produire une surface absurde présentée
  // comme un résultat.
  assert.ok(surfaceRampant(rectangle(10, 10), 89) < 600);
  // Une pente absente ou négative laisse la surface intacte : elle ne devient
  // pas zéro, et ne se voit pas appliquer un cosinus de rien.
  assert.ok(Math.abs(surfaceRampant(rectangle(10, 10), null) - 100) < 0.01);
  assert.ok(Math.abs(surfaceRampant(rectangle(10, 10), -5) - 100) < 0.01);
});

test('moins de trois points n’ont pas de surface', () => {
  assert.equal(aireProjetee([]), 0);
  assert.equal(aireProjetee([{ latitude: LAT, longitude: LON }]), 0);
  assert.equal(aireProjetee(rectangle(10, 10).slice(0, 2)), 0);
});

test('un sommet invalide est écarté, il ne devient pas zéro-zéro', () => {
  // Un point à (0,0) est au large du Ghana : intégré au tracé, il ferait une
  // surface de plusieurs milliards de mètres carrés.
  const avec = [...rectangle(10, 10), { latitude: null, longitude: undefined }];
  assert.ok(Math.abs(aireProjetee(avec) - 100) < 0.01);
  assert.equal(mesurer(avec).points, 4);
});

test('chaque côté rend sa longueur et son cap', () => {
  const c = cotes(rectangle(10, 6));
  assert.equal(c.length, 4);
  assert.ok(Math.abs(c[0].longueur - 10) < 0.01);
  assert.ok(Math.abs(c[1].longueur - 6) < 0.01);
  assert.equal(c[0].capEnClair, 'est');
  assert.equal(c[1].capEnClair, 'nord');
  assert.equal(c[2].capEnClair, 'ouest');
  assert.equal(c[3].capEnClair, 'sud');
});

test('LE CAP SUIT LA CONVENTION DU PROJET : 0 = PLEIN SUD', () => {
  // Mélanger deux conventions d'azimut dans un même projet oriente des toits
  // au nord en leur donnant l'ensoleillement du sud. La table de référence est
  // celle de `pvgis/parametres.js` : on s'y confronte, on ne la recopie pas.
  assert.equal(azimutSolaire(180), AZIMUTS.sud);
  assert.equal(azimutSolaire(90), AZIMUTS.est);
  assert.equal(azimutSolaire(270), AZIMUTS.ouest);
  assert.equal(azimutSolaire(0), AZIMUTS.nord);
  assert.equal(azimutSolaire(135), AZIMUTS['sud-est']);
  assert.equal(azimutSolaire(null), null);
});

test('un cap se lit en français', () => {
  assert.equal(capEnClair(0), 'nord');
  assert.equal(capEnClair(90), 'est');
  assert.equal(capEnClair(180), 'sud');
  assert.equal(capEnClair(270), 'ouest');
  assert.equal(capEnClair(360), 'nord');
  assert.equal(capEnClair(-90), 'ouest');
  assert.equal(capEnClair(135), 'sud-est');
  assert.equal(capEnClair(null), null);
  // Deux points confondus n'ont pas de direction : on n'en invente pas une.
  const p = { latitude: LAT, longitude: LON };
  assert.equal(capSegment(p, { ...p }), null);
});

test('UN TRACÉ EN NŒUD PAPILLON EST REFUSÉ, PAS CALCULÉ', () => {
  // Un polygone croisé a une aire mathématiquement définie et physiquement
  // absurde : les deux boucles se soustraient. Sans ce contrôle, un tracé raté
  // rendrait une surface trop petite, sans rien dire.
  const noeud = [
    { latitude: LAT, longitude: LON },
    { latitude: LAT + dLat(10), longitude: LON + dLon(10) },
    { latitude: LAT + dLat(10), longitude: LON },
    { latitude: LAT, longitude: LON + dLon(10) },
  ];
  assert.equal(seRecoupe(noeud), true);
  assert.equal(verifierTrace(noeud).cle, 'croise');
  assert.equal(mesurer(noeud).exploitable, false);
  assert.match(mesurer(noeud).probleme.message, /recoupe/);
  // Un rectangle honnête ne déclenche pas l'alerte.
  assert.equal(seRecoupe(rectangle(10, 10)), false);
  assert.equal(verifierTrace(rectangle(10, 10)), null);
});

test('un tracé en L reste valable et se mesure juste', () => {
  // Un toit tunisien réel est rarement rectangulaire.
  const L = [
    { latitude: LAT, longitude: LON },
    { latitude: LAT, longitude: LON + dLon(10) },
    { latitude: LAT + dLat(4), longitude: LON + dLon(10) },
    { latitude: LAT + dLat(4), longitude: LON + dLon(4) },
    { latitude: LAT + dLat(10), longitude: LON + dLon(4) },
    { latitude: LAT + dLat(10), longitude: LON },
  ];
  assert.equal(seRecoupe(L), false);
  // 10×4 + 4×6 = 64
  assert.ok(Math.abs(aireProjetee(L) - 64) < 0.05, `${aireProjetee(L)}`);
  const c = centre(L);
  // Le centre de gravité de la surface tombe DANS le L, pas au creux.
  assert.ok(c.latitude > LAT && c.latitude < LAT + dLat(10));
});

test('les tracés impossibles disent pourquoi, ils ne se contentent pas de refuser', () => {
  assert.equal(verifierTrace([]).cle, 'incomplet');
  assert.equal(verifierTrace(rectangle(10, 10).slice(0, 2)).cle, 'incomplet');
  const minuscule = verifierTrace(rectangle(1, 1));
  assert.equal(minuscule.cle, 'minuscule');
  assert.match(minuscule.message, /zoom/);
  const immense = verifierTrace(rectangle(300, 300));
  assert.equal(immense.cle, 'immense');
  assert.match(immense.message, /quartier/);
  for (const p of [verifierTrace([]), minuscule, immense]) {
    assert.ok(p.message.length > 30, 'un refus sans explication ne sert à rien');
  }
});

test('la projection revient sur ses pas', () => {
  const { points, origine } = projeter(rectangle(10, 6));
  const retour = deprojeter(origine, points[0]);
  assert.ok(Math.abs(retour.latitude - LAT) < 1e-9);
  assert.ok(Math.abs(retour.longitude - LON) < 1e-9);
});

test('L’ÉTALONNAGE CORRIGE L’ÉCHELLE, ET IL SE VOIT', () => {
  // Une image aérienne n'est pas une carte au cordeau : prise de vue oblique,
  // relief, géoréférencement. Le remède des géomètres : une longueur connue.
  const r = etalonner(10, 10.5);
  assert.equal(r.ok, true);
  assert.ok(Math.abs(r.facteur - 1.05) < 1e-9);
  assert.equal(r.ecart, 5);
  assert.match(r.message, /\+5 %/);
  assert.match(r.message, /10\.5 m sur place/);
  // Aucun écart : on le dit, on n'invente pas une correction.
  assert.match(etalonner(10, 10).message, /déjà à l’échelle/);
});

test('un étalonnage invraisemblable est refusé plutôt qu’appliqué', () => {
  // Au-delà de ±40 %, ce n'est plus une image imprécise : c'est un tracé qui
  // ne porte pas sur la même chose que la mesure. Corriger masquerait pire.
  const trop = etalonner(10, 20);
  assert.equal(trop.ok, false);
  assert.equal(trop.cle, 'invraisemblable');
  assert.match(trop.message, /\+100 %/);
  assert.equal(etalonner(10, 2).ok, false);
  assert.equal(etalonner(0, 10).cle, 'sansTrace');
  assert.equal(etalonner(10, 0).cle, 'sansMesure');
  assert.equal(etalonner(null, null).ok, false);
  assert.equal(etalonner(10, 'deux mètres').cle, 'sansMesure');
});

test('L’ÉTALONNAGE PORTE SUR LES LONGUEURS : LES SURFACES VARIENT EN SON CARRÉ', () => {
  // Le piège : appliquer le facteur tel quel aux mètres carrés donnerait une
  // correction deux fois trop faible, donc un nombre de panneaux faux.
  const m = mesurer(rectangle(10, 10), { facteur: 1.1, etalonne: true });
  assert.ok(Math.abs(m.surfaceProjetee - 121) < 0.05, `${m.surfaceProjetee}`);
  assert.ok(Math.abs(m.perimetre - 44) < 0.02);
  assert.ok(Math.abs(m.cotes[0].longueur - 11) < 0.01);
  assert.equal(m.etalonne, true);
  assert.match(m.reserve, /corrigée par votre relevé/);
});

test('un facteur d’étalonnage hors bornes est ignoré, pas appliqué', () => {
  for (const f of [0, -1, 3, 0.2, null, NaN, 'beaucoup']) {
    const m = mesurer(rectangle(10, 10), { facteur: f });
    assert.equal(m.facteur, 1, `facteur ${f} appliqué à tort`);
    assert.ok(Math.abs(m.surfaceProjetee - 100) < 0.01);
  }
  assert.ok(ETALONNAGE_MAX > 1 && ETALONNAGE_MIN < 1);
});

test('UNE MESURE SUR IMAGE S’ANNONCE TOUJOURS COMME UNE ESTIMATION', () => {
  // Contrainte explicite du projet : ne jamais présenter une lecture de carte
  // comme une cote relevée.
  for (const opts of [{}, { pente: 25 }, { facteur: 1.05, etalonne: true }]) {
    const m = mesurer(rectangle(10, 8), opts);
    assert.match(m.reserve, /estimée à partir de la carte/);
    assert.match(m.reserve, /site/);
  }
});

test('mesurer rend toujours un objet, même sur un tracé impossible', () => {
  // L'interface doit pouvoir afficher POURQUOI elle refuse. Un `null` la
  // laisserait muette.
  for (const mauvais of [null, [], [{ latitude: LAT, longitude: LON }]]) {
    const m = mesurer(mauvais);
    assert.equal(typeof m, 'object');
    assert.equal(m.exploitable, false);
    assert.ok(m.probleme.message);
    assert.equal(m.surfaceProjetee, 0);
  }
});

test('le supplément de pente est isolé, pas noyé dans un total', () => {
  const m = mesurer(rectangle(10, 10), { pente: 30 });
  assert.ok(Math.abs(m.surfaceProjetee - 100) < 0.01);
  assert.ok(Math.abs(m.supplementPente - 15.47) < 0.02);
  assert.ok(Math.abs(m.surfaceRampant - m.surfaceProjetee - m.supplementPente) < 1e-9);
});

test('le côté le plus long est signalé comme faîtage probable, pas comme certitude', () => {
  const m = mesurer(rectangle(14, 6));
  assert.ok(Math.abs(m.faitageProbable.longueur - 14) < 0.01);
  // « probable » : le nom du champ porte la réserve, il n'affirme rien.
  assert.ok('faitageProbable' in m && !('faitage' in m));
});

test('L’ÉCART ANGULAIRE NE REND PAS SON COMPLÉMENT', async () => {
  // DÉFAUT CORRIGÉ : le reste d'un nombre négatif est négatif en JavaScript.
  // Sans correction, l'écart rendu était systématiquement le complémentaire,
  // et un pan plein sud était déclaré plein nord dans le formulaire.
  const { ecartAngulaire } = await import('../js/toiture.js');
  assert.equal(ecartAngulaire(0, 0), 0);
  assert.equal(ecartAngulaire(0, 180), 180);
  assert.equal(ecartAngulaire(0, -180), 180);
  assert.equal(ecartAngulaire(-45, -45), 0);
  assert.equal(ecartAngulaire(-135, 90), 135);
  assert.equal(ecartAngulaire(170, -170), 20, 'le passage par 180° doit être court');
  assert.equal(ecartAngulaire(-90, 90), 180);
  assert.equal(ecartAngulaire(null, 0), null);
});

test('UN PAN PLEIN SUD RESSORT PLEIN SUD', async () => {
  const { orientationLaPlusProche } = await import('../js/toiture.js');
  const table = { sud: 0, 'sud-est': -45, 'sud-ouest': 45, est: -90, ouest: 90,
    'nord-est': -135, 'nord-ouest': 135, nord: 180 };
  assert.equal(orientationLaPlusProche(0, table).id, 'sud');
  assert.equal(orientationLaPlusProche(180, table).id, 'nord');
  assert.equal(orientationLaPlusProche(-90, table).id, 'est');
  assert.equal(orientationLaPlusProche(90, table).id, 'ouest');
  assert.equal(orientationLaPlusProche(-40, table).id, 'sud-est');
  assert.equal(orientationLaPlusProche(-170, table).id, 'nord');
  assert.equal(orientationLaPlusProche(10, table).id, 'sud');
  assert.equal(orientationLaPlusProche(null, table), null);
  assert.equal(orientationLaPlusProche(0, null), null);
});

test('l’azimut du pan se déduit du côté le plus long, et reste une déduction', async () => {
  const { azimutProbableDuPan } = await import('../js/toiture.js');
  // Rectangle large est-ouest : le grand côté file vers l'est, le pan regarde
  // donc au sud.
  const m = mesurer(rectangle(20, 6));
  assert.ok(Math.abs(m.faitageProbable.longueur - 20) < 0.01);
  assert.equal(azimutProbableDuPan(m), 0);
  // Rectangle profond nord-sud : le grand côté file vers le nord, le pan
  // regarde à l'est.
  const n = mesurer(rectangle(6, 20));
  assert.equal(azimutProbableDuPan(n), -90);
  assert.equal(azimutProbableDuPan(mesurer([])), null);
  assert.equal(azimutProbableDuPan(null), null);
});
