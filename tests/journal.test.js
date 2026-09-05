import test from 'node:test';
import assert from 'node:assert/strict';
import { noter, journal, vider, resume, enTexte, expurger, proteger, CORRELATION,
  CAPACITE, INTERDITS, MESSAGE_VISITEUR } from '../js/journal.js';

test('AUCUNE DONNÉE PERSONNELLE N’ENTRE AU JOURNAL', () => {
  // Un journal de diagnostic qui contient l'annuaire des clients est un
  // incident de sécurité, pas un outil. Les champs testés sont exactement
  // ceux du formulaire de contact du site.
  const client = {
    nom: 'Ahmed Ben Ali', telephone: '54062596', courriel: 'ahmed@exemple.tn',
    adresse: '12 rue de Sfax', consommation: 7200,
  };
  const propre = expurger(client);
  assert.equal(propre.nom, '[expurgé]');
  assert.equal(propre.telephone, '[expurgé]');
  assert.equal(propre.courriel, '[expurgé]');
  assert.equal(propre.adresse, '[expurgé]');
  assert.equal(propre.consommation, 7200, 'les données techniques doivent rester');
  const texte = JSON.stringify(propre);
  for (const fuite of ['Ahmed', '54062596', 'exemple.tn', 'rue de Sfax']) {
    assert.ok(!texte.includes(fuite), `fuite dans le journal : ${fuite}`);
  }
});

test('un courriel ou un numéro glissé dans un texte libre est masqué', () => {
  const t = expurger({ note: 'rappeler ahmed@exemple.tn au 54062596 avant lundi' });
  assert.ok(!t.note.includes('ahmed@exemple.tn'));
  assert.ok(!t.note.includes('54062596'), `numéro tunisien non masqué : ${t.note}`);
  assert.match(t.note, /\[courriel\]/);
  assert.match(t.note, /\[numéro\]/);
  // Huit chiffres, c'est la longueur d'un numéro tunisien.
  assert.match(expurger('appelle 20122011'), /\[numéro\]/);
});

test('les champs interdits couvrent aussi les secrets', () => {
  for (const mot of ['token', 'password', 'apikey', 'cle']) {
    assert.ok(INTERDITS.includes(mot), `${mot} devrait être interdit`);
  }
  const s = expurger({ apiKey: 'sk-123', Token: 'abc', motDePasse: 'x' });
  assert.equal(s.apiKey, '[expurgé]');
  assert.equal(s.Token, '[expurgé]');
  assert.equal(s.motDePasse, '[expurgé]');
});

test('l’expurgation ne tombe pas sur une structure profonde ou circulaire', () => {
  const profond = { a: { b: { c: { d: { e: { f: 'trop loin' } } } } } };
  assert.doesNotThrow(() => expurger(profond));
  const circulaire = { nom: 'x' };
  circulaire.moi = circulaire;
  assert.doesNotThrow(() => expurger(circulaire));
});

test('l’identifiant de corrélation ne dit rien de la personne', () => {
  assert.match(CORRELATION, /^[0-9a-f]{12}$/);
  // Il relie les lignes entre elles, et rien d'autre.
  vider();
  noter('info', 'a'); noter('erreur', 'b');
  assert.ok(journal().every((e) => e.correlation === CORRELATION));
});

test('le journal se plafonne pour ne pas peser sur la page qu’il surveille', () => {
  vider();
  for (let i = 0; i < CAPACITE + 30; i++) noter('debug', `ligne ${i}`);
  assert.equal(journal().length, CAPACITE);
  // Ce sont les plus anciennes qui tombent.
  assert.equal(journal()[0].evenement, `ligne ${30}`);
});

test('le résumé compte par niveau', () => {
  vider();
  noter('info', 'a'); noter('erreur', 'b'); noter('erreur', 'c'); noter('avertissement', 'd');
  const r = resume();
  assert.equal(r.erreur, 2);
  assert.equal(r.avertissement, 1);
  assert.equal(r.total, 4);
  assert.equal(r.correlation, CORRELATION);
});

test('un niveau inconnu retombe sur « info » plutôt que de passer', () => {
  vider();
  assert.equal(noter('catastrophe', 'x').niveau, 'info');
});

test('une panne dans un bloc secondaire n’emporte pas le reste', () => {
  // C'est le point : une exception dans un panneau vidait tout le tableau de
  // bord, et le visiteur voyait une page blanche.
  vider();
  const r = proteger('bloc qui casse', () => { throw new Error('boum'); }, 'secours');
  assert.equal(r, 'secours');
  const derniere = journal().at(-1);
  assert.equal(derniere.niveau, 'erreur');
  assert.match(derniere.evenement, /bloc qui casse/);
  assert.match(derniere.details.message, /boum/);
  // Et le cas normal passe sans rien journaliser.
  const avant = journal().length;
  assert.equal(proteger('bloc sain', () => 42), 42);
  assert.equal(journal().length, avant);
});

test('le message montré au visiteur ne contient aucun détail technique', () => {
  assert.ok(!/Error|undefined|stack|null/.test(MESSAGE_VISITEUR));
  assert.ok(MESSAGE_VISITEUR.length > 40);
  assert.match(MESSAGE_VISITEUR, /chiffres principaux restent valables/);
});

test('le journal en texte reste copiable et lisible', () => {
  vider();
  noter('erreur', 'échec: rendu', { message: 'x n’est pas une fonction' });
  const t = enTexte();
  assert.match(t, /Solarys/);
  assert.match(t, new RegExp(CORRELATION));
  assert.match(t, /échec: rendu/);
  assert.ok(t.split('\n').length >= 4);
});
