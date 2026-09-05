/**
 * La demande est le dernier maillon : ce que le vendeur lit sur son
 * téléphone. Un renseignement manquant, c'est un rappel — et un rappel, une
 * affaire sur deux qui s'évapore.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redigerDemande, lienDemande, champsManquants, ouverte, CONTACT, OFFRE }
  from '../js/prospect.js';
import { etudier } from '../js/etude.js';

const ETUDE = etudier({ consommationAnnuelle: 4800, montantAnnuel: 1200, gouvernorat: 'sfax' });
const CLIENT = { nom: 'Amine Ben Salah', telephone: '20123456' };

test('la demande porte l\'étude entière, pour chiffrer sans rappeler', () => {
  const t = redigerDemande({ etude: ETUDE, client: CLIENT, gouvernorat: 'Sfax' });
  for (const attendu of ['Amine Ben Salah', '20123456', 'Sfax',
    '3 kWc', '6 modules', '18 m²', '0,250 DT/kWh']) {
    assert.ok(t.includes(attendu), `manquant dans la demande : ${attendu}`);
  }
  // Milliers séparés par une espace fine insécable (U+202F).
  assert.match(t, /4\u202f800 kWh\/an/);
  assert.match(t, /4\u202f920 kWh\/an/);
});

test('la demande payante annonce son prix, sans millimes trompeurs', () => {
  // « 90,000 DT » se lit quatre-vingt-dix mille : un prix rond s'écrit rond.
  const t = redigerDemande({ etude: ETUDE, client: CLIENT, gouvernorat: 'Sfax' });
  assert.match(t, /étude détaillée/);
  assert.ok(t.includes(String(OFFRE.prix)), 'le prix doit figurer');
  assert.doesNotMatch(t, new RegExp(`${OFFRE.prix},000`), 'pas de décimales sur un prix rond');
});

test('un simple rappel ne réclame pas de paiement', () => {
  const t = redigerDemande({ etude: ETUDE, client: CLIENT, gouvernorat: 'Sfax', payante: false });
  assert.match(t, /être rappelé/);
  assert.doesNotMatch(t, /étude détaillée/);
});

test('la demande invite à joindre la facture', () => {
  // Sans serveur, le fichier ne peut être téléversé : il se joint ici.
  assert.match(redigerDemande({ etude: ETUDE, client: CLIENT, gouvernorat: 'Sfax' }),
    /photo de ma facture/);
});

test('un projet sans retour ne promet pas de retour', () => {
  const sansRetour = { ...ETUDE, retour: null };
  const t = redigerDemande({ etude: sansRetour, client: CLIENT, gouvernorat: 'Sfax' });
  assert.match(t, /au-delà de 25 ans/);
  assert.doesNotMatch(t, /Retour sur investissement : \d/);
});

test('les renseignements manquants sont nommés un par un', () => {
  assert.deepEqual(champsManquants({}), ['votre nom', 'votre téléphone']);
  assert.deepEqual(champsManquants(CLIENT), []);
  assert.deepEqual(champsManquants({ ...CLIENT, telephone: '  ' }), ['votre téléphone']);
});

test('la demande part sur WhatsApp quand un numéro est renseigné', () => {
  const initial = { ...CONTACT };
  try {
    CONTACT.whatsapp = '+216 20 123 456';
    const lien = lienDemande('Bonjour');
    assert.match(lien, /^https:\/\/wa\.me\/21620123456\?text=/);
    assert.equal(ouverte(), true);
  } finally { Object.assign(CONTACT, initial); }
});

test('sans coordonnées, le site ne prétend pas prendre de demande', () => {
  const initial = { ...CONTACT };
  try {
    CONTACT.whatsapp = ''; CONTACT.courriel = '';
    assert.equal(lienDemande('Bonjour'), null);
    assert.equal(ouverte(), false);
  } finally { Object.assign(CONTACT, initial); }
});

test('la demande survit aux caractères à échapper', () => {
  const initial = { ...CONTACT };
  try {
    CONTACT.whatsapp = '21620123456';
    const t = redigerDemande({ etude: ETUDE,
      client: { nom: 'Ben « Ali » & Fils #2', telephone: '20123456' }, gouvernorat: 'Sfax' });
    const lien = lienDemande(t);
    assert.doesNotThrow(() => new URL(lien));
    assert.match(decodeURIComponent(new URL(lien).searchParams.get('text')),
      /Ben « Ali » & Fils #2/);
  } finally { Object.assign(CONTACT, initial); }
});

test('la demande s\'écrit en français, sans point décimal ni fausse précision', () => {
  // « 0.250 » et « 7.4 » trahissent le copier-coller ; « 9 000,000 DT » se lit
  // neuf millions. Un professionnel tunisien le remarque avant le reste.
  const t = redigerDemande({ etude: ETUDE, client: CLIENT, gouvernorat: 'Sfax' });
  const chiffres = t.split('\n').filter((l) => l.startsWith('•'));
  for (const ligne of chiffres) {
    assert.doesNotMatch(ligne, /\d\.\d/, `point décimal anglais dans : ${ligne}`);
  }
  assert.match(t, /0,250 DT\/kWh/);
  assert.match(t, /7,4 ans/);
  assert.doesNotMatch(t, /,000 DT/, 'aucun montant estimé au millime près');
});

/* ------------------------------------------------------------------ */
/* L'envoi au serveur                                                  */
/* ------------------------------------------------------------------ */

test('les chiffres transmis sont ceux que le visiteur a vus', async () => {
  const { chiffresEtude } = await import('../js/prospect.js');
  const c = chiffresEtude(ETUDE, { L: 8, P: 6 });
  assert.equal(c.puissance, ETUDE.puissance);
  assert.equal(c.consommation, ETUDE.consommation);
  assert.deepEqual(c.toiture, { largeur: 8, profondeur: 6 });
  // Les montants partent arrondis : « 1014,7499 DT » dans un courriel ferait
  // douter de tout le reste.
  assert.equal(c.economieAnnuelle, Math.round(ETUDE.economieAnnuelle));
  assert.equal(c.cout, Math.round(ETUDE.cout));
});

test('sans cotes de toiture, aucune toiture n\'est inventée', async () => {
  const { chiffresEtude } = await import('../js/prospect.js');
  assert.equal(chiffresEtude(ETUDE, {}).toiture, undefined);
  assert.equal(chiffresEtude(ETUDE, { L: 8 }).toiture, undefined, 'une cote seule ne suffit pas');
});

test('un projet sans retour transmet null, jamais un nombre inventé', async () => {
  const { chiffresEtude } = await import('../js/prospect.js');
  assert.equal(chiffresEtude({ ...ETUDE, retour: null }, {}).retour, null);
});

test('un serveur injoignable est signalé, sans planter', async () => {
  const m = await import(`../js/prospect.js?reseau=${Math.random()}`);
  const initial = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error('hors ligne'); };
    const r = await m.envoyerAuServeur({
      client: { nom: 'X', telephone: '20123456' }, etude: ETUDE, toiture: {} });
    assert.deepEqual(r, { ok: false, message: 'Serveur injoignable.' });
  } finally { globalThis.fetch = initial; }
});

test('un refus du serveur nomme le champ fautif', async () => {
  const m = await import(`../js/prospect.js?refus=${Math.random()}`);
  const initial = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: false,
      json: async () => ({ error: 'Données invalides', fields: { 'etude.puissance': 'Trop grande' } }),
    });
    const r = await m.envoyerAuServeur({
      client: { nom: 'X', telephone: '20123456' }, etude: ETUDE, toiture: {} });
    assert.equal(r.ok, false);
    assert.equal(r.message, 'Trop grande');
  } finally { globalThis.fetch = initial; }
});

test('une demande acceptée rend sa référence', async () => {
  const m = await import(`../js/prospect.js?ok=${Math.random()}`);
  const initial = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ reference: 'WT-0509-1976' }) });
    const r = await m.envoyerAuServeur({
      client: { nom: 'X', telephone: '20123456' }, etude: ETUDE, toiture: {} });
    assert.deepEqual(r, { ok: true, reference: 'WT-0509-1976' });
  } finally { globalThis.fetch = initial; }
});
