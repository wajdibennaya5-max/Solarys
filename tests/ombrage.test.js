import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TYPES_OBSTACLE, typeObstacle, obstacle, empreinte, ombrePortee,
  enveloppeConvexe, moduleTouche, ombrageInstantane, friseJournee,
  resumeJournee, reserve, HAUTEUR_UTILE,
} from '../js/ombrage.js';
import { position, dateRepere } from '../js/soleil.js';
import { implanter, airePolygone } from '../js/implantation.js';
import { eleverToit } from '../js/scene3d.js';

const TUNIS = { latitude: 36.8065, longitude: 10.1815 };
const CONTOUR = [{ x: -6, y: -5 }, { x: 6, y: -5 }, { x: 6, y: 5 }, { x: -6, y: 5 }];

/** La cote du rampant en un point — la même fonction que la scène utilise. */
function coteDuToit(pente = 20, azimut = 0) {
  const toit = eleverToit(CONTOUR, { pente, azimut, hauteurMur: 3 });
  const [a, b, c] = toit.sommets;
  const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const v = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
  const n = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
  return (p) => a.z - (n.x * (p.x - a.x) + n.y * (p.y - a.y)) / n.z;
}

const PLAN = implanter(CONTOUR, { pente: 20, azimut: 0 });
const COTE = coteDuToit();
const soleil = (id, heure) =>
  position({ ...TUNIS, date: dateRepere(id, 2025), heure });

test('chaque type d’obstacle porte un ordre de grandeur et une explication', () => {
  for (const t of TYPES_OBSTACLE) {
    assert.ok(t.nom && t.aide.length > 15, `${t.id} sans explication`);
    assert.ok(t.hauteur > 0 && t.largeur > 0 && t.longueur > 0, `${t.id} sans cotes`);
  }
  assert.equal(typeObstacle('cheminee').id, 'cheminee');
  assert.equal(typeObstacle('inconnu').id, 'autre');
});

test('UN OBSTACLE SANS HAUTEUR N’EST PAS RETENU', () => {
  // `Number(null)` vaut zéro : un obstacle « de hauteur nulle » passerait pour
  // relevé, ne porterait aucune ombre, et rassurerait à tort.
  for (const mauvais of [null, {}, { x: 0, y: 0 }, { x: 0, y: 0, hauteur: 0 },
    { x: 0, y: 0, hauteur: -1 }, { x: 'ici', y: 0, hauteur: 2 },
    { x: 0, y: 0, hauteur: 2, largeur: 0 }]) {
    assert.equal(obstacle(mauvais), null, `${JSON.stringify(mauvais)} accepté à tort`);
  }
  const bon = obstacle({ type: 'cheminee', x: 1, y: 2, hauteur: 1.4 });
  assert.equal(bon.hauteur, 1.4);
  // Les cotes manquantes reprennent celles du type, jamais zéro.
  assert.equal(bon.largeur, typeObstacle('cheminee').largeur);
  assert.equal(bon.nom, 'Cheminée');
});

test('l’empreinte est centrée sur l’obstacle', () => {
  const o = obstacle({ type: 'autre', x: 2, y: -1, hauteur: 1, largeur: 2, longueur: 4 });
  const e = empreinte(o);
  assert.equal(e.length, 4);
  assert.ok(Math.abs(airePolygone(e) - 8) < 1e-9);
  assert.deepEqual(e[0], { x: 1, y: -3 });
  assert.deepEqual(empreinte(null), []);
});

test('L’OMBRE S’ALLONGE QUAND LE SOLEIL BAISSE', () => {
  // C'est le comportement qui rend l'outil utile : une cheminée sans
  // conséquence à midi peut couper une rangée à neuf heures en décembre.
  const o = obstacle({ type: 'cheminee', x: 0, y: 0, hauteur: 1.5 });
  const midiEte = airePolygone(ombrePortee(o, soleil('ete', 12), COTE));
  const midiHiver = airePolygone(ombrePortee(o, soleil('hiver', 12), COTE));
  const matinHiver = airePolygone(ombrePortee(o, soleil('hiver', 9), COTE));
  assert.ok(midiEte < midiHiver, 'l’ombre d’été est plus courte qu’en hiver');
  assert.ok(midiHiver < matinHiver, 'l’ombre du matin est plus longue qu’à midi');
  // Et elle contient toujours l'empreinte de l'obstacle lui-même.
  assert.ok(midiEte >= o.largeur * o.longueur - 1e-9);
});

test('L’OMBRE TOMBE DU CÔTÉ OPPOSÉ AU SOLEIL', () => {
  // Une erreur de signe donnerait une ombre du côté ensoleillé : le calcul
  // paraîtrait sérieux et désignerait les mauvais modules.
  const o = obstacle({ type: 'antenne', x: 0, y: 0, hauteur: 4 });
  const matin = ombrePortee(o, soleil('equinoxe', 8), COTE);
  const soir = ombrePortee(o, soleil('equinoxe', 16), COTE);
  const centreX = (c) => c.reduce((t, p) => t + p.x, 0) / c.length;
  // Le soleil du matin est à l'est (x positif) : l'ombre part vers l'ouest.
  assert.ok(centreX(matin) < -0.2, `ombre du matin en x=${centreX(matin)}`);
  assert.ok(centreX(soir) > 0.2, `ombre du soir en x=${centreX(soir)}`);
  // À midi le soleil est au sud : l'ombre part vers le nord.
  const midi = ombrePortee(o, soleil('equinoxe', 12.5), COTE);
  assert.ok(midi.reduce((t, p) => t + p.y, 0) / midi.length > 0.2);
});

test('un soleil couché ne porte aucune ombre', () => {
  const o = obstacle({ type: 'cheminee', x: 0, y: 0, hauteur: 1.5 });
  assert.deepEqual(ombrePortee(o, soleil('hiver', 2), COTE), []);
  assert.deepEqual(ombrePortee(o, null, COTE), []);
  assert.deepEqual(ombrePortee(null, soleil('ete', 12), COTE), []);
});

test('l’enveloppe convexe ne rend jamais un contour croisé', () => {
  const e = enveloppeConvexe([{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 2, y: 0 },
    { x: 0, y: 2 }, { x: 1, y: 1 }]);
  assert.equal(e.length, 4, 'le point intérieur doit disparaître');
  assert.ok(Math.abs(airePolygone(e) - 4) < 1e-9);
  assert.equal(enveloppeConvexe([]).length, 0);
  assert.equal(enveloppeConvexe([{ x: 0, y: 0 }, { x: 1, y: 1 }]).length, 2);
});

test('UNE OMBRE QUI TRAVERSE UN MODULE LE TOUCHE, MÊME SANS COIN DEDANS', () => {
  // Une antenne fine porte une ombre étroite : elle peut couper un module en
  // deux sans en couvrir un seul coin, et pénaliser toute la chaîne.
  const m = { coins: [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }],
    centre: { x: 0, y: 0 } };
  const bande = [{ x: -0.2, y: -3 }, { x: 0.2, y: -3 }, { x: 0.2, y: 3 }, { x: -0.2, y: 3 }];
  assert.equal(m.coins.some((c) => bande.some(() => false)), false);
  assert.equal(moduleTouche(m, [bande]), true, 'le centre est dans l’ombre');
  const ailleurs = [{ x: 8, y: 8 }, { x: 9, y: 8 }, { x: 9, y: 9 }, { x: 8, y: 9 }];
  assert.equal(moduleTouche(m, [ailleurs]), false);
  assert.equal(moduleTouche(null, [bande]), false);
  assert.equal(moduleTouche(m, []), false);
});

test('SANS OBSTACLE RELEVÉ, ON NE DIT PAS « AUCUN OMBRAGE »', () => {
  // La nuance est tout l'écart entre une mesure et une absence de mesure.
  const r = ombrageInstantane({ plan: PLAN, obstacles: [],
    soleil: soleil('hiver', 10), hauteurDuToit: COTE });
  assert.equal(r.calculable, true);
  assert.equal(r.touches, 0);
  assert.match(r.raison, /absence de relevé/);
  assert.doesNotMatch(r.raison, /aucun ombrage/i);
  assert.match(reserve({ obstacles: [] }), /n’est pas une absence d’ombre/);
});

test('un obstacle sans hauteur déclarée est écarté du calcul, pas compté à zéro', () => {
  const r = ombrageInstantane({ plan: PLAN,
    obstacles: [{ type: 'cheminee', x: 0, y: 0 }],
    soleil: soleil('hiver', 10), hauteurDuToit: COTE });
  assert.equal(r.touches, 0);
  assert.match(r.raison, /absence de relevé/);
});

test('LE MÊME OBSTACLE GÊNE LE MATIN ET PAS À MIDI EN ÉTÉ', () => {
  // Un chiffre unique laisserait croire à une perte permanente : c'est
  // précisément ce que la frise existe pour empêcher.
  const obstacles = [{ type: 'cheminee', x: 0, y: 2, hauteur: 1.5 }];
  const arg = { plan: PLAN, obstacles, hauteurDuToit: COTE };
  const matinHiver = ombrageInstantane({ ...arg, soleil: soleil('hiver', 9) });
  const midiEte = ombrageInstantane({ ...arg, soleil: soleil('ete', 12) });
  assert.ok(matinHiver.touches > 0, 'une cheminée doit gêner par soleil rasant');
  assert.equal(midiEte.touches, 0, 'et ne rien gêner sous un soleil à 76°');
  assert.ok(matinHiver.part > 0 && matinHiver.part <= 1);
  assert.equal(matinHiver.indices.length, matinHiver.touches);
});

test('la nuit, rien n’est calculé, et c’est dit', () => {
  const r = ombrageInstantane({ plan: PLAN,
    obstacles: [{ type: 'cheminee', x: 0, y: 0, hauteur: 1.5 }],
    soleil: soleil('hiver', 3), hauteurDuToit: COTE });
  assert.equal(r.touches, 0);
  assert.match(r.raison, /sous l’horizon|trop bas/);
  const sansSoleil = ombrageInstantane({ plan: PLAN, obstacles: [] });
  assert.equal(sansSoleil.calculable, false);
  assert.match(sansSoleil.raison, /inconnue/);
});

test('la frise couvre les heures de jour, dans l’ordre', () => {
  const f = friseJournee({ plan: PLAN,
    obstacles: [{ type: 'cheminee', x: 0, y: 2, hauteur: 1.5 }],
    ...TUNIS, date: dateRepere('hiver', 2025), hauteurDuToit: COTE });
  assert.ok(f.length > 15 && f.length < 30, `${f.length} points en décembre`);
  for (let i = 1; i < f.length; i++) assert.ok(f[i].heure > f[i - 1].heure);
  for (const p of f) {
    assert.ok(p.hauteur > 0, 'la frise ne garde que le jour');
    assert.ok(p.touches >= 0 && p.touches <= PLAN.nombre);
  }
  // Le jour est plus long en juin qu'en décembre.
  const ete = friseJournee({ plan: PLAN, obstacles: [], ...TUNIS,
    date: dateRepere('ete', 2025), hauteurDuToit: COTE });
  assert.ok(ete.length > f.length);
});

test('LE RÉSUMÉ IGNORE LES HEURES OÙ LE SOLEIL NE PRODUIT RIEN', () => {
  // Compter l'ombrage à 3° de hauteur gonflerait le chiffre avec des heures
  // qui ne produisent presque rien.
  const f = friseJournee({ plan: PLAN,
    obstacles: [{ type: 'voisin', x: 0, y: 9, hauteur: 8 }],
    ...TUNIS, date: dateRepere('hiver', 2025), hauteurDuToit: COTE });
  const r = resumeJournee(f);
  assert.ok(r.heuresUtiles > 0 && r.heuresUtiles < f.length,
    'les heures rasantes doivent être écartées');
  assert.ok(HAUTEUR_UTILE >= 5 && HAUTEUR_UTILE <= 15);
  assert.ok(r.moyenne >= 0 && r.moyenne <= 1);
  // Sans obstacle, rien n'est jamais touché, et le résumé le dit.
  const vide = resumeJournee(friseJournee({ plan: PLAN, obstacles: [], ...TUNIS,
    date: dateRepere('hiver', 2025), hauteurDuToit: COTE }));
  assert.equal(vide.jamaisTouche, true);
  assert.equal(vide.pire, null);
  assert.deepEqual(resumeJournee([]), { heuresUtiles: 0, pire: null, moyenne: 0,
    jamaisTouche: true });
});

test('LA RÉSERVE NE LAISSE JAMAIS PASSER UNE SIMULATION POUR UNE MESURE', () => {
  const r = reserve({ obstacles: [{ type: 'cheminee' }, { type: 'arbre' }] });
  assert.match(r, /simulation/i);
  assert.doesNotMatch(r, /mesur[ée]e? (?:sur|du) (?:site|toit)/i);
  assert.match(r, /2 obstacles/);
  assert.match(r, /vérification sur site/i);
  assert.match(reserve({ obstacles: [{ type: 'arbre' }], etalonne: true }), /échelle du tracé/);
});

test('UNE OMBRE NE DÉBORDE PAS DU TOIT', async () => {
  // Sans découpe, l'ombre d'une cheminée proche du bord se prolonge dans le
  // vide : la scène affiche une tache sombre suspendue à côté du bâtiment, à
  // la hauteur du plan du toit prolongé. Faux, et faux d'une manière qui se
  // voit — donc qui fait douter de tout le reste.
  const { decouperSurLeToit } = await import('../js/ombrage.js');
  const o = obstacle({ type: 'antenne', x: 5, y: 4, hauteur: 5 });
  const brute = ombrePortee(o, soleil('hiver', 9), COTE);
  assert.ok(airePolygone(brute) > 0);
  const decoupee = decouperSurLeToit(CONTOUR, brute);
  assert.ok(airePolygone(decoupee) < airePolygone(brute),
    'l’ombre débordante doit être rognée');
  // Chaque sommet de l'ombre découpée est sur le toit.
  const { pointDansPolygone: dedans } = await import('../js/implantation.js');
  for (const p of decoupee) {
    const surLeBord = Math.abs(Math.abs(p.x) - 6) < 1e-6 || Math.abs(Math.abs(p.y) - 5) < 1e-6;
    assert.ok(dedans(p, CONTOUR) || surLeBord, `sommet hors du toit : ${p.x},${p.y}`);
  }
});

test('une ombre entièrement sur le toit n’est pas rognée', async () => {
  const { decouperSurLeToit } = await import('../js/ombrage.js');
  const o = obstacle({ type: 'cheminee', x: 0, y: 0, hauteur: 1 });
  const brute = ombrePortee(o, soleil('ete', 12), COTE);
  const decoupee = decouperSurLeToit(CONTOUR, brute);
  assert.ok(Math.abs(airePolygone(decoupee) - airePolygone(brute)) < 1e-6);
});

test('une ombre entièrement hors du toit disparaît', async () => {
  const { decouperSurLeToit } = await import('../js/ombrage.js');
  const loin = [{ x: 40, y: 40 }, { x: 42, y: 40 }, { x: 42, y: 42 }, { x: 40, y: 42 }];
  assert.deepEqual(decouperSurLeToit(CONTOUR, loin), []);
  assert.deepEqual(decouperSurLeToit([], loin), []);
  assert.deepEqual(decouperSurLeToit(CONTOUR, []), []);
});

test('LA DÉCOUPE RESTE JUSTE SUR UN TOIT EN L', async () => {
  // Sutherland-Hodgman exige une fenêtre convexe. On découpe donc le toit PAR
  // l'ombre, et non l'inverse : un toit en L n'est pas convexe, et l'inverse
  // aurait rempli le creux.
  const { decouperSurLeToit } = await import('../js/ombrage.js');
  const L = [{ x: -6, y: -5 }, { x: 6, y: -5 }, { x: 6, y: 1 },
    { x: 0, y: 1 }, { x: 0, y: 5 }, { x: -6, y: 5 }];
  // Une ombre carrée à cheval sur le creux du L.
  const ombre = [{ x: -2, y: -1 }, { x: 4, y: -1 }, { x: 4, y: 4 }, { x: -2, y: 4 }];
  const d = decouperSurLeToit(L, ombre);
  assert.ok(d.length >= 3);
  // La partie qui tombe dans le creux (x>0, y>1) doit avoir disparu :
  // l'aire retenue est celle de l'intersection, pas celle de l'ombre.
  assert.ok(airePolygone(d) < airePolygone(ombre) - 5,
    `${airePolygone(d)} m² retenus sur ${airePolygone(ombre)} m² d’ombre`);
  const { pointDansPolygone: dedans } = await import('../js/implantation.js');
  assert.equal(dedans({ x: 2, y: 3 }, d), false, 'le creux du L est rempli');
});
