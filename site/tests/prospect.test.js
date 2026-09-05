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
    '4800 kWh/an', '3 kWc', '4920 kWh/an', '0.250 DT/kWh']) {
    assert.ok(t.includes(attendu), `manquant dans la demande : ${attendu}`);
  }
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
