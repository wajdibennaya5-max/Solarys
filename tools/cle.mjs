#!/usr/bin/env node
/**
 * Émettre une clé de licence — l'outil du vendeur.
 *
 * Une commande arrive, le règlement est reçu, il faut livrer. Ce script est
 * le maillon qui manquait entre les deux : il fabrique la clé, vérifie
 * qu'elle se relit bien, et rédige le message à renvoyer au client.
 *
 *   node tools/cle.mjs "jean@bureau-etudes.fr"
 *   node tools/cle.mjs "commande-2026-014" --formule credits --dossiers 5
 *   node tools/cle.mjs "atelier-sfax" --formule subscription
 *
 * L'identifiant client est libre — un courriel, un numéro de commande, un
 * nom d'entreprise. Il n'est ni transmis ni stocké : il sert uniquement à
 * dériver la clé.
 *
 * DÉTERMINISME — le même identifiant redonne toujours la même clé. Un client
 * qui a perdu la sienne la retrouve en relançant la commande avec le même
 * identifiant ; inutile de tenir un registre pour cela. Le corollaire compte
 * autant : deux clients distincts doivent recevoir deux identifiants
 * distincts, sans quoi ils partagent la même clé.
 */
import { pathToFileURL } from 'node:url';
import { makeKey, readKey, PLANS } from '../app/js/licence.js';
import { OFFRES } from '../app/js/boutique.js';

/** Les formules, telles que `licence.js` sait les émettre. */
const FORMULES = Object.values(PLANS).map((p) => p.id);

/** Libellés lisibles, pour le message au client. */
const NOMS = {
  credits: 'Dossiers à l’unité',
  perpetual: 'Licence perpétuelle',
  subscription: 'Abonnement Pro',
};

const AIDE = `Émettre une clé de licence Solarys.

  node tools/cle.mjs <client> [options]

  <client>              identifiant libre : courriel, numéro de commande, nom.
                        Le même identifiant redonne toujours la même clé.

  -f, --formule <nom>   ${FORMULES.join(' | ')}   (défaut : perpetual)
  -d, --dossiers <n>    nombre de dossiers, formule « credits » seulement
                        (1 à 99, défaut : 1)
  -h, --aide            afficher ce message

Exemples
  node tools/cle.mjs "jean@bureau-etudes.fr"
  node tools/cle.mjs "commande-2026-014" -f credits -d 5
`;

/**
 * Lit la ligne de commande.
 * @returns {{client:string, plan:string, credits:number, aide:boolean}}
 * @throws {Error} sur une option inconnue ou une valeur inutilisable — mieux
 *   vaut s'arrêter que livrer une clé qui n'ouvre pas ce qui a été payé.
 */
export function lireArguments(argv) {
  const out = { client: '', plan: 'perpetual', credits: 1, aide: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--aide' || a === '--help') { out.aide = true; continue; }
    if (a === '-f' || a === '--formule') {
      out.plan = argv[++i] ?? '';
      if (!FORMULES.includes(out.plan)) {
        throw new Error(`formule inconnue : « ${out.plan} » — attendu ${FORMULES.join(', ')}`);
      }
      continue;
    }
    if (a === '-d' || a === '--dossiers') {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1 || n > 99) {
        throw new Error('le nombre de dossiers doit être un entier de 1 à 99');
      }
      out.credits = n;
      continue;
    }
    if (a.startsWith('-')) throw new Error(`option inconnue : ${a}`);
    if (out.client) throw new Error(`argument en trop : « ${a} » — un seul identifiant client`);
    out.client = a;
  }
  if (!out.aide && !out.client) throw new Error('identifiant client manquant');
  return out;
}

/**
 * Fabrique la clé et le message de livraison.
 *
 * La clé est relue avant d'être renvoyée : une clé qui ne se relit pas est
 * un client bloqué, et cela doit échouer ici, pas chez lui.
 */
export function emettre({ client, plan, credits }) {
  const cle = makeKey(client, { plan, credits });
  const lue = readKey(cle);
  if (!lue.valid || lue.plan !== plan) {
    throw new Error(`clé illisible pour « ${plan} » — ne pas la livrer`);
  }

  const nom = NOMS[plan] ?? plan;
  const prix = OFFRES[plan]?.prix ?? '';
  const portee = plan === 'credits'
    ? `${credits} dossier${credits > 1 ? 's' : ''} sans filigrane`
    : 'tous les dossiers, sans filigrane';

  const message = [
    'Bonjour,',
    '',
    `Merci pour votre commande — ${nom}${prix ? ` (${prix})` : ''}.`,
    '',
    `Votre clé de licence : ${cle}`,
    '',
    'Pour l’activer : ouvrez l’application, onglet Réglages, champ',
    '« Clé de licence », collez-la. Elle ouvre ' + portee + '.',
    '',
    'L’application fonctionne hors ligne une fois chargée : la clé reste',
    'sur votre poste, rien n’est envoyé.',
    '',
    'Bonne étude,',
  ].join('\n');

  return { cle, plan, credits: lue.credits, message };
}

/** Point d'entrée. */
function principal(argv) {
  let opts;
  try {
    opts = lireArguments(argv);
  } catch (e) {
    process.stderr.write(`Erreur : ${e.message}\n\n${AIDE}`);
    process.exitCode = 1;
    return;
  }
  if (opts.aide) { process.stdout.write(AIDE); return; }

  const { cle, message } = emettre(opts);
  process.stdout.write(`\n  Clé : ${cle}\n\n${'-'.repeat(66)}\n${message}\n${'-'.repeat(66)}\n\n`);
}

// Exécuté directement, pas lorsqu'il est importé par les tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal(process.argv.slice(2));
}
