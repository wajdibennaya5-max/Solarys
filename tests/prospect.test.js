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
