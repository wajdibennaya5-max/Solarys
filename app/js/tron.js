/**
 * Vérifier un paiement USDT sur la chaîne TRON, depuis le navigateur.
 *
 * La chaîne est publique : n'importe qui peut demander à un nœud si une
 * transaction existe, ce qu'elle transporte et vers qui. C'est ce qui permet
 * de livrer une clé sans serveur et sans attendre une vérification humaine —
 * l'acheteur paie, colle l'empreinte de sa transaction, et la page conclut
 * elle-même.
 *
 * HONNÊTETÉ TECHNIQUE : cette vérification tourne chez l'acheteur, donc elle
 * est contournable, et l'empreinte d'une transaction est publique — un tiers
 * pourrait reprendre celle d'un vrai client. C'est pourquoi la clé est
 * dérivée de l'empreinte elle-même : une transaction rejouée redonne la même
 * clé, jamais une nouvelle. Le pire cas est donc une clé partagée, ce que
 * `licence.js` assume déjà explicitement — la licence est une commodité, pas
 * une protection. Ce qui protège ce produit reste la mise à jour et le
 * support, non le contrôle d'accès.
 */

/** Contrat USDT sur le réseau principal TRON. */
export const CONTRAT_USDT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

/** USDT compte six décimales : 20 USDT s'écrivent 20000000. */
export const DECIMALES = 6;

/** Nœud public interrogé. */
export const NOEUD = 'https://api.trongrid.io';

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * Traduit une adresse base58 (T…) en sa forme hexadécimale (41…).
 * Les nœuds renvoient tantôt l'une tantôt l'autre selon le point d'entrée :
 * comparer sans traduire, c'est refuser un paiement pourtant reçu.
 * @returns {string|null} hexadécimal minuscule, ou `null` si ce n'est pas une adresse
 */
export function versHex(base58) {
  if (typeof base58 !== 'string' || base58.length !== 34) return null;
  let n = 0n;
  for (const c of base58) {
    const i = BASE58.indexOf(c);
    if (i < 0) return null;
    n = n * 58n + BigInt(i);
  }
  const octets = [];
  for (let i = 0; i < 25; i++) { octets.unshift(Number(n & 0xffn)); n >>= 8n; }
  if (n !== 0n) return null; // déborde de 25 octets : pas une adresse
  // Les 21 premiers octets portent l'adresse ; les 4 derniers sont la somme
  // de contrôle, qui n'intervient pas dans la comparaison.
  return octets.slice(0, 21).map((o) => o.toString(16).padStart(2, '0')).join('');
}

/** Deux écritures d'une même adresse désignent-elles le même compte ? */
export function memeAdresse(a, b) {
  if (!a || !b) return false;
  const norm = (x) => (String(x).startsWith('T') ? versHex(x) : String(x).toLowerCase());
  const na = norm(a), nb = norm(b);
  return Boolean(na) && na === nb;
}

/** Une empreinte de transaction TRON : 64 caractères hexadécimaux. */
export const empreinteValide = (txid) => /^[0-9a-fA-F]{64}$/.test(String(txid ?? '').trim());

/** Ce que chaque refus signifie, en clair, pour l'acheteur. */
export const RAISONS = {
  'empreinte-invalide': 'Cette empreinte n’a pas la forme attendue : 64 caractères, chiffres et lettres de A à F.',
  'introuvable': 'Transaction introuvable sur la chaîne. Si vous venez de payer, attendez une minute puis réessayez.',
  'pas-un-transfert': 'Cette transaction ne transporte pas d’USDT.',
  'mauvais-destinataire': 'Cette transaction ne nous est pas destinée.',
  'montant-insuffisant': 'Le montant reçu est inférieur au prix de la formule.',
  'reseau': 'Impossible de joindre la chaîne TRON pour le moment. Réessayez dans un instant.',
};

/**
 * Vérifie qu'une transaction transporte bien le paiement attendu.
 *
 * @param {string} txid empreinte de la transaction, telle que le portefeuille l'affiche
 * @param {object} opts
 * @param {string} opts.adresse destinataire attendu (base58, T…)
 * @param {number} opts.montantMin prix de la formule, en USDT
 * @param {typeof fetch} [opts.fetchImpl] injecté par les tests
 * @param {string} [opts.noeud]
 * @returns {Promise<{ok:true, montant:number}|{ok:false, raison:keyof RAISONS}>}
 */
export async function verifierPaiement(txid, {
  adresse, montantMin, fetchImpl = globalThis.fetch, noeud = NOEUD,
} = {}) {
  const empreinte = String(txid ?? '').trim();
  if (!empreinteValide(empreinte)) return { ok: false, raison: 'empreinte-invalide' };

  let evenements;
  try {
    const r = await fetchImpl(`${noeud}/v1/transactions/${empreinte}/events`);
    if (!r.ok) return { ok: false, raison: 'reseau' };
    const json = await r.json();
    evenements = Array.isArray(json?.data) ? json.data : [];
  } catch {
    return { ok: false, raison: 'reseau' };
  }

  if (evenements.length === 0) return { ok: false, raison: 'introuvable' };

  // Une transaction peut porter plusieurs événements : on ne retient que les
  // transferts USDT, et seulement ceux qui nous sont adressés.
  const transferts = evenements.filter((e) =>
    e?.event_name === 'Transfer' && memeAdresse(e?.contract_address, CONTRAT_USDT));
  if (transferts.length === 0) return { ok: false, raison: 'pas-un-transfert' };

  const versNous = transferts.filter((e) => memeAdresse(e?.result?.to, adresse));
  if (versNous.length === 0) return { ok: false, raison: 'mauvais-destinataire' };

  // Plusieurs transferts vers la même adresse dans une transaction : ils
  // comptent ensemble, l'acheteur a bien tout envoyé.
  const brut = versNous.reduce((total, e) => total + BigInt(e?.result?.value ?? 0), 0n);
  const montant = Number(brut) / 10 ** DECIMALES;

  // Une marge d'un centième absorbe les arrondis de conversion des
  // portefeuilles, sans jamais laisser passer un paiement franchement court.
  if (montant + 0.01 < montantMin) return { ok: false, raison: 'montant-insuffisant' };

  return { ok: true, montant };
}
