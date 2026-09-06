/**
 * CONFRONTE NOS CONVERTISSEURS À UNE VRAIE RÉPONSE DU SERVICE.
 *
 * À lancer depuis une machine qui a accès au réseau :
 *
 *     node scripts/verifier-pvgis.mjs
 *     node scripts/verifier-pvgis.mjs 36.80 10.18     (autre point)
 *
 * Il appelle le service en direct — ce qu'un navigateur ne peut pas faire,
 * faute d'en-têtes CORS, mais que Node fait très bien — puis passe la réponse
 * dans nos convertisseurs et dit CHAMP PAR CHAMP ce qui a été lu et ce qui
 * manque. C'est le seul moyen de vérifier que le contrat documenté
 * correspond au contrat réel.
 */
import { BASE, VERSION_API } from '../js/pvgis/config.js';
import * as parametres from '../js/pvgis/parametres.js';
import * as reponse from '../js/pvgis/reponse.js';
import { nu, disponible } from '../js/provenance.js';

const [, , latArg, lonArg] = process.argv;
const site = {
  latitude: Number(latArg ?? 34.74),
  longitude: Number(lonArg ?? 10.76),
  puissanceKwc: 4,
  orientation: 'sud',
  pente: 'moyenne',
};

const compo = parametres.pourProduction(site);
if (!compo.ok) {
  console.error('Paramètres refusés :', compo.erreurs.join(' '));
  process.exit(1);
}

const url = `${BASE}/PVcalc?${new URLSearchParams(compo.parametres)}`;
console.log(`API ${VERSION_API}`);
console.log(url, '\n');

const r = await fetch(url, { headers: { accept: 'application/json' } });
if (!r.ok) {
  console.error(`Le service a répondu ${r.status}. Corps :`, (await r.text()).slice(0, 400));
  process.exit(1);
}
const brut = await r.json();
const p = reponse.production(brut, { parametres: compo.parametres, puissanceKwc: 4 });

if (!p.ok) {
  console.error('Normalisation impossible :', p.raison);
  console.error('Clés reçues :', Object.keys(brut));
  process.exit(1);
}

const ligne = (nom, v, unite = '') => {
  const ok = disponible(v);
  console.log(`  ${ok ? '✓' : '✕'} ${nom.padEnd(28)} ${
    ok ? `${nu(v)} ${unite}` : 'ABSENT — le convertisseur ne trouve pas ce champ'}`);
};

console.log('Champs lus :');
ligne('production annuelle', p.production, 'kWh/an');
ligne('productible (déduit)', p.productible, 'kWh/kWc/an');
ligne('irradiation annuelle', p.irradiation, 'kWh/m²/an');
ligne('altitude', p.site.altitude, 'm');
ligne('latitude', p.site.latitude, '°');
console.log(`  ${disponible(p.mensuel) ? '✓' : '✕'} ${'production mensuelle'.padEnd(28)} ${
  disponible(p.mensuel) ? `${nu(p.mensuel).length} mois` : 'ABSENTE'}`);
console.log(`\n  base de données : ${p.origine.baseDonnees ?? 'NON LUE'}`);
console.log(`  période          : ${p.origine.anneeDebut ?? '?'} – ${p.origine.anneeFin ?? '?'}`);
console.log(`  pertes totales   : ${p.pertes.totales ?? 'NON LUES'} %`);

const trous = ['production', 'irradiation', 'mensuel']
  .filter((c) => !disponible(p[c] ?? p.site[c]));
console.log(trous.length
  ? `\n${trous.length} champ(s) non lu(s) : ${trous.join(', ')} — `
    + 'le contrat a changé, corrigez js/pvgis/reponse.js.'
  : '\nTous les champs attendus ont été lus. Les convertisseurs sont à jour.');
