/**
 * La boutique et la licence doivent parler de la même chose.
 *
 * Une offre vendue pour une formule que `licence.js` ne sait pas émettre,
 * c'est un client qui paie et qu'on ne peut pas servir. Ce fichier verrouille
 * cette correspondance.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { OFFRES, ORDRE, CONTACT, PAIEMENT, estOuverte, estVendable, boutiqueOuverte } from '../js/boutique.js';
import { PLANS, makeKey, readKey } from '../js/licence.js';

const formulesConnues = Object.values(PLANS).map((p) => p.id);

test('toute offre correspond à une formule que la licence sait émettre', () => {
  for (const plan of Object.keys(OFFRES)) {
    assert.ok(formulesConnues.includes(plan),
      `l'offre « ${plan} » n'existe pas dans licence.js`);
  }
});

test('une clé émise pour chaque offre est relue avec la bonne formule', () => {
  for (const plan of Object.keys(OFFRES)) {
    const cle = makeKey(`commande-test-${plan}`, { plan, credits: 3 });
    const lue = readKey(cle);
    assert.equal(lue.valid, true, `clé invalide pour ${plan}`);
    assert.equal(lue.plan, plan);
  }
});

test("l'ordre d'affichage couvre exactement les offres", () => {
  assert.deepEqual([...ORDRE].sort(), Object.keys(OFFRES).sort());
});

test('chaque offre porte un prix et une unité affichables', () => {
  for (const [plan, o] of Object.entries(OFFRES)) {
    assert.match(o.prix, /\d/, `prix illisible pour ${plan}`);
    assert.ok(typeof o.unite === 'string' && o.unite.length > 0,
      `unité manquante pour ${plan}`);
    assert.equal(typeof o.lien, 'string', `lien absent pour ${plan}`);
  }
});

test('un lien vide ferme le paiement en ligne, un lien renseigné l\'ouvre', () => {
  const vide = { ...OFFRES.perpetual, lien: '' };
  assert.equal(Boolean(vide.lien), false);
  // `estOuverte` lit la configuration réelle : elle doit rester cohérente
  // avec elle, quel que soit son état au moment du test.
  for (const plan of ORDRE) {
    assert.equal(estOuverte(plan), Boolean(OFFRES[plan].lien));
  }
});

test('la boutique est ouverte dès qu\'une formule s\'obtient, par quelque moyen', () => {
  // Un lien de paiement n'est plus la seule porte : une commande directe en
  // ouvre une aussi. La boutique suit ce que `estVendable` sait réellement
  // servir, et non le seul paiement en ligne.
  assert.equal(boutiqueOuverte(), ORDRE.some(estVendable));
});

test('une formule inconnue n\'est jamais achetable', () => {
  assert.equal(estOuverte('formule-qui-nexiste-pas'), false);
  assert.equal(estOuverte(undefined), false);
});

test('le contact publié est une adresse joignable', () => {
  // Une adresse personnelle ne se publie que par décision explicite ; une
  // fois publiée, elle doit au moins être valide — un acheteur bloqué qui
  // écrit dans le vide est un client perdu.
  assert.equal(typeof CONTACT, 'string');
  if (CONTACT) assert.match(CONTACT, /^[^@\s]+@[^@\s]+\.[^@\s]+$/);
});

test('tout lien renseigné est une adresse https', () => {
  for (const [plan, o] of Object.entries(OFFRES)) {
    if (!o.lien) continue;
    assert.match(o.lien, /^https:\/\//,
      `le lien de « ${plan} » doit être en https, sinon le navigateur bloquera le paiement`);
  }
});

/* ------------------------------------------------------------------ */
/* Commande directe — vendre sans plateforme de paiement               */
/* ------------------------------------------------------------------ */

// `lienAchat` lit la configuration du module. Pour éprouver ses trois états
// sans toucher au fichier livré, on recharge le module avec une configuration
// modifiée en mémoire.
async function avecConfig({ lien = '', whatsapp = '', courriel = '' }) {
  const m = await import(`../js/boutique.js?essai=${Math.random()}`);
  m.OFFRES.perpetual.lien = lien;
  m.COMMANDE.whatsapp = whatsapp;
  m.COMMANDE.courriel = courriel;
  return m;
}

test('sans rien de branché, aucune formule ne mène nulle part', async () => {
  const m = await avecConfig({});
  assert.equal(m.lienAchat('perpetual'), null);
  assert.equal(m.estVendable('perpetual'), false);
  assert.equal(m.boutiqueOuverte(), false);
});

test('un numéro WhatsApp suffit à ouvrir la vente', async () => {
  const m = await avecConfig({ whatsapp: '+216 12 345 678' });
  const lien = m.lienAchat('perpetual', 'Licence perpétuelle');
  assert.match(lien, /^https:\/\/wa\.me\/21612345678\?text=/);
  // Le message doit nommer la formule et son prix : l'acheteur n'a rien à écrire.
  const texte = decodeURIComponent(new URL(lien).searchParams.get('text'));
  assert.match(texte, /Licence perpétuelle/);
  assert.match(texte, /20 €/);
  assert.equal(m.estVendable('perpetual'), true);
  // Une commande directe n'est pas un paiement en ligne : le libellé diffère.
  assert.equal(m.estOuverte('perpetual'), false);
});

test('le numéro est nettoyé de tout ce qui n\'est pas un chiffre', async () => {
  const m = await avecConfig({ whatsapp: '+216-12.345 678' });
  assert.match(m.lienAchat('perpetual'), /wa\.me\/21612345678\?/);
});

test('à défaut de WhatsApp, le courriel prend le relais', async () => {
  const m = await avecConfig({ courriel: 'ventes@exemple.test' });
  const lien = m.lienAchat('perpetual', 'Licence perpétuelle');
  assert.match(lien, /^mailto:ventes@exemple\.test\?/);
  assert.match(lien, /subject=/);
  assert.match(decodeURIComponent(lien), /Licence perpétuelle/);
});

test('le paiement en ligne prime sur la commande directe', async () => {
  // Sinon un acheteur prêt à payer serait renvoyé vers une attente humaine.
  const m = await avecConfig({
    lien: 'https://paiement.test/x', whatsapp: '21612345678',
  });
  assert.equal(m.lienAchat('perpetual'), 'https://paiement.test/x');
  assert.equal(m.estOuverte('perpetual'), true);
});

test('une formule inconnue ne produit jamais de lien', async () => {
  const m = await avecConfig({ whatsapp: '21612345678' });
  assert.equal(m.lienAchat('formule-inexistante'), null);
  assert.equal(m.estVendable('formule-inexistante'), false);
});

test('le message de commande survit aux caractères à échapper', async () => {
  const m = await avecConfig({ whatsapp: '21612345678' });
  const lien = m.lienAchat('perpetual', 'Licence « perpétuelle » & co');
  assert.doesNotThrow(() => new URL(lien));
  assert.match(decodeURIComponent(new URL(lien).searchParams.get('text')),
    /Licence « perpétuelle » & co/);
});

/* ------------------------------------------------------------------ */
/* Moyens de règlement — payer sans attendre une réponse               */
/* ------------------------------------------------------------------ */

async function avecPaiement({ usdt = { adresse: '', reseau: '' }, virement = '', autre = '' }) {
  const m = await import(`../js/boutique.js?paiement=${Math.random()}`);
  m.PAIEMENT.usdt = usdt;
  m.PAIEMENT.virement = virement;
  m.PAIEMENT.autre = autre;
  return m;
}

test('sans coordonnées de règlement, aucun moyen n\'est annoncé', async () => {
  const m = await avecPaiement({});
  assert.deepEqual(m.moyensDePaiement(), []);
});

test('une adresse USDT est annoncée avec son réseau', async () => {
  // Le réseau compte autant que l'adresse : un envoi sur le mauvais réseau
  // est perdu, et l'acheteur doit le lire avant d'envoyer.
  const m = await avecPaiement({ usdt: { adresse: 'TXyz000', reseau: 'TRON (TRC20)' } });
  const [ligne] = m.moyensDePaiement();
  assert.match(ligne, /TXyz000/);
  assert.match(ligne, /TRON \(TRC20\)/);
  // Le libellé doit rester lisible, sans parenthèses imbriquées.
  assert.doesNotMatch(ligne, /\([^)]*\([^)]*\)/);
});

test('une adresse sans réseau reste annoncée, sans mention trompeuse', async () => {
  const m = await avecPaiement({ usdt: { adresse: 'TXyz000', reseau: '' } });
  assert.deepEqual(m.moyensDePaiement(), ['USDT : TXyz000']);
});

test('virement et arrangement direct s\'ajoutent aux moyens', async () => {
  const m = await avecPaiement({ virement: 'IBAN TN59...', autre: 'Espèces sur place' });
  assert.deepEqual(m.moyensDePaiement(), ['Virement : IBAN TN59...', 'Espèces sur place']);
});

test('les moyens connus figurent dans le message de commande', async () => {
  // C'est tout l'intérêt : l'acheteur paie sans attendre une réponse humaine.
  const m = await import(`../js/boutique.js?commande=${Math.random()}`);
  m.COMMANDE.whatsapp = '21612345678';
  m.PAIEMENT.usdt = { adresse: 'TXyz000', reseau: 'TRC20' };
  const texte = decodeURIComponent(
    new URL(m.lienAchat('perpetual', 'Licence perpétuelle')).searchParams.get('text'));
  assert.match(texte, /TXyz000/);
  assert.match(texte, /TRC20/);
  assert.doesNotMatch(texte, /indiquer comment régler/);
});

test('sans moyen connu, la commande demande encore comment régler', async () => {
  // Cet état existe toujours — un vendeur qui n'a pas encore de moyen à
  // annoncer —, même si le fichier livré en publie un désormais. On le
  // reconstitue explicitement plutôt que de dépendre de la configuration.
  const m = await import(`../js/boutique.js?commande=${Math.random()}`);
  m.COMMANDE.whatsapp = '21612345678';
  m.PAIEMENT.usdt = { adresse: '', reseau: '' };
  m.PAIEMENT.virement = '';
  m.PAIEMENT.autre = '';
  const texte = decodeURIComponent(
    new URL(m.lienAchat('perpetual', 'Licence perpétuelle')).searchParams.get('text'));
  assert.match(texte, /indiquer comment régler/);
});

test('les coordonnées de règlement gardent une forme exploitable', async () => {
  const { PAIEMENT } = await import('../js/boutique.js');
  assert.equal(typeof PAIEMENT.usdt.adresse, 'string');
  assert.equal(typeof PAIEMENT.usdt.reseau, 'string');
  assert.equal(typeof PAIEMENT.virement, 'string');
});

/* ------------------------------------------------------------------ */
/* L'adresse publiée — une faute de frappe coûte l'argent d'un client  */
/* ------------------------------------------------------------------ */

// Une adresse TRON porte sa propre somme de contrôle. La vérifier ici coûte
// vingt lignes ; ne pas la vérifier coûte un virement perdu sans recours, et
// un client qui a payé dans le vide.
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Décode une adresse base58 en ses 25 octets, ou `null` si elle n'en est pas une. */
function base58Decode(texte) {
  let n = 0n;
  for (const c of texte) {
    const i = BASE58.indexOf(c);
    if (i < 0) return null; // caractère hors alphabet — 0, O, I et l en sont exclus
    n = n * 58n + BigInt(i);
  }
  const out = new Uint8Array(25);
  for (let i = 24; i >= 0; i--) { out[i] = Number(n & 0xffn); n >>= 8n; }
  return n === 0n ? out : null; // ce qui déborde de 25 octets n'est pas une adresse
}

const sha256 = (o) => createHash('sha256').update(o).digest();

test('l\'adresse USDT publiée est une adresse TRON valide', () => {
  const { adresse } = PAIEMENT.usdt;
  if (!adresse) return; // rien de publié : rien à vérifier

  assert.equal(adresse.length, 34, 'une adresse TRON compte 34 caractères');
  const brut = base58Decode(adresse);
  assert.ok(brut, 'adresse illisible en base58 — un caractère est erroné');
  assert.equal(brut[0], 0x41, 'préfixe 0x41 attendu : réseau principal TRON');

  const somme = Buffer.from(brut.subarray(21));
  const attendue = sha256(sha256(brut.subarray(0, 21))).subarray(0, 4);
  assert.ok(somme.equals(attendue),
    'somme de contrôle fausse — l\'adresse est mal recopiée, ne pas l\'encaisser');
});

test('une adresse dont un caractère change est rejetée', () => {
  // Contre-épreuve : sans elle, le test précédent pourrait ne rien vérifier.
  const faussee = 'TBp9gdAeYdsiFvg7vKGoq2cM5TohLgbADC'; // dernier caractère modifié
  const brut = base58Decode(faussee);
  const rejetee = !brut
    || !Buffer.from(brut.subarray(21)).equals(sha256(sha256(brut.subarray(0, 21))).subarray(0, 4));
  assert.ok(rejetee, 'une adresse corrompue doit être détectée');
});

test('un réseau est toujours annoncé avec une adresse', () => {
  // Un USDT envoyé sur un réseau que l'adresse ne dessert pas est perdu.
  if (PAIEMENT.usdt.adresse) {
    assert.ok(PAIEMENT.usdt.reseau, 'adresse publiée sans réseau : envoi à l\'aveugle');
  }
});
