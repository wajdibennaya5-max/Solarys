import test from 'node:test';
import assert from 'node:assert/strict';
import { repondre, suggestions, INTENTIONS, MODES } from '../js/copilote.js';
import { simuler } from '../js/moteur.js';
import { comparer, variantesProposees, evaluerVariante, DISTINCTIONS, COLONNES,
  MAX_VARIANTES, ecartsDeVariante } from '../js/laboratoire.js';

const BASE = {
  consommationAnnuelle: 7200, montantAnnuel: 2040, gouvernorat: 'sfax',
  orientation: 'sud', pente: 'moyenne', batiment: 'maison', surfaceDisponible: 45,
  fiabilite: 'facture', detailConso: 'six factures', moduleId: 'mono-550', moduleWc: 550,
};
const SIM = simuler(BASE);
const PARTIEL = simuler({ consommationAnnuelle: 7200, montantAnnuel: 2040,
  gouvernorat: 'sfax', fiabilite: 'estimation', moduleWc: 550 });

/* ---- copilote ---- */

test('chaque intention a des mots-clés, un exemple et une réponse', () => {
  assert.ok(INTENTIONS.length >= 8);
  for (const i of INTENTIONS) {
    assert.ok(i.id && i.exemple, 'intention incomplète');
    assert.ok(i.motsCles.length >= 3, `${i.id} : trop peu de mots-clés`);
    assert.equal(typeof i.repondre, 'function');
  }
  assert.equal(MODES.length, 2);
});

test('chaque exemple proposé est bien reconnu par le moteur', () => {
  // Proposer une question à laquelle on ne sait pas répondre est le pire
  // défaut possible pour un assistant.
  for (const i of INTENTIONS) {
    const r = repondre(i.exemple, SIM);
    assert.ok(r.comprise, `« ${i.exemple} » n’est pas comprise`);
    assert.ok(r.texte.length > 40, `${i.id} : réponse trop courte`);
  }
});

test('les suggestions affichées sont toutes comprises', () => {
  for (const q of suggestions(SIM)) {
    assert.ok(repondre(q, SIM).comprise, `suggestion incomprise : « ${q} »`);
  }
});

test('les réponses sortent des chiffres du projet, pas d’un texte figé', () => {
  const autre = simuler({ ...BASE, gouvernorat: 'tozeur', consommationAnnuelle: 24000,
    montantAnnuel: 7000 });
  for (const id of ['puissance', 'simple', 'economie', 'production']) {
    const q = INTENTIONS.find((i) => i.id === id).exemple;
    assert.notEqual(repondre(q, SIM).texte, repondre(q, autre).texte,
      `${id} rend le même texte pour deux projets différents`);
  }
  assert.ok(repondre('Explique-moi ce résultat simplement.', autre).texte.includes('Tozeur'));
});

test('les deux modes ne disent pas la même chose', () => {
  for (const id of ['puissance', 'simple', 'economie']) {
    const q = INTENTIONS.find((i) => i.id === id).exemple;
    assert.notEqual(repondre(q, SIM, 'client').texte, repondre(q, SIM, 'expert').texte,
      `${id} : mode client et mode expert identiques`);
  }
  // Le mode expert cite la méthode ; le mode client, non.
  assert.match(repondre('Pourquoi cette puissance ?', SIM, 'expert').texte, /Méthode/);
});

test('sans étude calculée, l’assistant le dit au lieu d’inventer', () => {
  const r = repondre('Pourquoi cette puissance ?', null);
  assert.equal(r.comprise, false);
  assert.match(r.texte, /Aucune étude n’est calculée/);
  assert.match(r.texte, /je ne réponds que sur eux/);
  assert.ok(r.manque.includes('simulation'));
  const echec = repondre('Combien j’économise ?', simuler({}));
  assert.equal(echec.comprise, false);
});

test('une question hors sujet reçoit un refus net, pas une invention', () => {
  const r = repondre('Quel temps fera-t-il demain à Tunis ?', SIM);
  assert.equal(r.comprise, false);
  assert.match(r.texte, /n’ai pas compris/);
  assert.match(r.texte, /et sur rien d’autre/);
  assert.ok(r.propositions.length > 0, 'un refus doit proposer ce qu’il sait faire');
});

test('une donnée absente est annoncée absente, jamais comblée', () => {
  const r = repondre('Comment sont câblées les chaînes ?', PARTIEL);
  // Sans module choisi, le dimensionnement est fait sur le module par défaut :
  // la réponse doit rester honnête sur ce qu'elle sait.
  assert.ok(r.texte.length > 40);
  const ombre = repondre('Et les ombres sur mon toit ?', SIM);
  assert.match(ombre.texte, /Aucune analyse d’ombrage n’est faite/);
  assert.ok(ombre.manque.length > 0, 'l’ombrage doit déclarer ce qui lui manque');
});

test('l’assistant nomme les données manquantes quand on les lui demande', () => {
  const r = repondre('Quelle donnée manque ?', PARTIEL);
  assert.ok(r.comprise);
  assert.ok(r.texte.includes('orientation') || r.texte.includes('Orientation')
    || r.texte.includes('toiture') || r.texte.includes('Toiture'),
  `réponse inattendue : ${r.texte.slice(0, 120)}`);
});

test('les suggestions suivent l’état du projet', () => {
  const complet = suggestions(SIM);
  const incomplet = suggestions(PARTIEL);
  assert.ok(incomplet.includes('Quelle donnée manque ?'),
    'un projet incomplet doit se voir proposer la question qui compte');
  assert.ok(!complet.includes('Quelle donnée manque ?')
    || SIM.avertissements.some((a) => a.gravite !== 'information'));
  assert.ok(complet.length <= 6 && complet.length >= 3);
  assert.deepEqual(suggestions(null), ['Explique-moi ce résultat simplement.']);
});

test('aucune réponse ne laisse traîner un morceau de gabarit', () => {
  // Un guillemet ou une apostrophe de code échappé dans une réponse trahit un
  // gabarit mal fermé, et se voit à l'écran.
  for (const i of INTENTIONS) {
    const t = repondre(i.exemple, SIM, 'expert').texte;
    assert.ok(!t.includes("' \n"), `${i.id} : gabarit mal fermé`);
    assert.ok(!t.includes("+ '"), `${i.id} : concaténation visible dans le texte`);
    assert.ok(!t.includes('${'), `${i.id} : interpolation non évaluée`);
    assert.ok(!t.includes('undefined') && !t.includes('NaN'), `${i.id} : valeur non résolue`);
  }
});

/* ---- laboratoire ---- */

test('le laboratoire compare des projets entiers, pas seulement des tailles', () => {
  const r = comparer(BASE, variantesProposees(BASE, { puissanceCourante: 4 }));
  assert.ok(r.variantes.length >= 3);
  assert.ok(r.variantes.every((v) => v.calculable));
  const puissances = r.variantes.map((v) => v.valeurs.puissance);
  assert.ok(new Set(puissances).size >= 2);
  // Une variante à hypothèses prudentes garde la même puissance mais change
  // le résultat financier : c'est bien un projet différent, pas une taille.
  const prudent = r.variantes.find((v) => v.jeuFinancier === 'conservateur');
  const ref = r.variantes.find((v) => v.id === 'reference');
  assert.equal(prudent.valeurs.puissance, ref.valeurs.puissance);
  assert.ok(prudent.valeurs.van < ref.valeurs.van);
});

test('une distinction n’est décernée que si son critère est calculable partout', () => {
  // Comparer un projet dont on connaît le retour avec un projet dont on ne le
  // connaît pas ne désigne pas un vainqueur : cela cache une donnée manquante.
  const r = comparer(BASE, [
    { id: 'a', nom: 'Normale', puissance: 4 },
    { id: 'b', nom: 'Ruineuse', puissance: 4,
      changements: { montantAnnuel: 60 } },
  ]);
  const ruineuse = r.variantes.find((v) => v.id === 'b');
  if (ruineuse.valeurs.retourActualise === null) {
    const eco = r.distinctions.find((d) => d.id === 'economie');
    assert.ok(!eco, 'une distinction a été décernée malgré un critère non calculable');
    const non = r.nonDecernees.find((d) => d.id === 'economie');
    assert.ok(non && non.raison.includes('Ruineuse'));
  }
});

test('avec une seule variante, aucune distinction n’est décernée', () => {
  const r = comparer(BASE, [{ id: 'seule', nom: 'Seule', puissance: 4 }]);
  assert.deepEqual(r.distinctions, []);
  assert.equal(r.nonDecernees.length, DISTINCTIONS.length);
  for (const d of r.nonDecernees) assert.match(d.raison, /au moins deux/);
});

test('chaque distinction nomme son critère', () => {
  for (const d of DISTINCTIONS) {
    assert.ok(d.titre && d.critere, d.id);
    assert.ok(d.critere.length > 20, `${d.id} : critère trop vague`);
    assert.ok(d.exige.length > 0, `${d.id} : n’exige aucune donnée`);
  }
});

test('les colonnes du comparatif existent toutes dans les valeurs', () => {
  const v = evaluerVariante(BASE, { id: 'x', nom: 'X', puissance: 4 });
  for (const c of COLONNES) {
    assert.ok(c.cle in v.valeurs, `colonne sans valeur : ${c.cle}`);
    assert.ok(c.nom, c.cle);
  }
});

test('une variante incalculable est marquée, pas silencieuse', () => {
  const v = evaluerVariante({ gouvernorat: 'sfax' }, { id: 'x', nom: 'X' });
  assert.equal(v.calculable, false);
  assert.ok(v.erreurs.length > 0);
  const r = comparer({ gouvernorat: 'sfax' }, [{ id: 'x', nom: 'X' }, { id: 'y', nom: 'Y' }]);
  assert.equal(r.variantes.filter((x) => x.calculable).length, 0);
  assert.equal(r.distinctions.length, 0);
});

test('le nombre de variantes reste lisible', () => {
  const trop = Array.from({ length: 10 }, (_, i) =>
    ({ id: `v${i}`, nom: `V${i}`, puissance: 2 + i }));
  assert.equal(comparer(BASE, trop).variantes.length, MAX_VARIANTES);
});

test('les écarts à la référence sont chiffrés', () => {
  const r = comparer(BASE, variantesProposees(BASE, { puissanceCourante: 4 }));
  const ref = r.variantes.find((v) => v.id === 'reference');
  const grand = r.variantes.find((v) => v.id === 'plus-grand');
  const ecarts = ecartsDeVariante(grand, ref);
  assert.ok(ecarts.length > 3);
  for (const e of ecarts) {
    assert.ok(e.nom && e.de !== e.a);
    assert.equal(typeof e.hausse, 'boolean');
  }
  assert.deepEqual(ecartsDeVariante(ref, ref), []);
});
