import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LES RÈGLES D'ARCHITECTURE, VÉRIFIÉES PLUTÔT QU'ÉCRITES.
 *
 * Une architecture décrite dans un document se dégrade au premier ajout
 * pressé. Celles-ci sont tenues par des tests : la couche de calcul ne peut
 * plus toucher à la page, et la couche de présentation ne peut plus calculer.
 *
 * Les quatre couches sont ici des ensembles de fichiers plutôt que des
 * dossiers. Le découpage physique en répertoires viendrait ensuite, et ne
 * changerait rien à ces règles — ce sont elles qui portent la valeur.
 */

const RACINE = new URL('../js/', import.meta.url).pathname;
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');

/** Tous les modules, y compris ceux des sous-dossiers d'intégration. */
function modules(prefixe = '') {
  return readdirSync(join(RACINE, prefixe), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? modules(join(prefixe, e.name))
      : (e.name.endsWith('.js') ? [join(prefixe, e.name)] : [])));
}
const tous = modules();

/** DOMAINE : le calcul. Ne connaît ni la page, ni le stockage, ni le réseau. */
export const DOMAINE = [
  'etude.js', 'scenarios.js', 'tarif.js', 'profil.js', 'consommation.js',
  'batiment.js', 'co2.js', 'score.js', 'technique.js', 'validation.js',
  'calepinage.js', 'gisement.js', 'orientation.js', 'facture.js', 'materiel.js',
  'finances.js', 'prix.js', 'provenance.js',
  // La composition des requêtes et la lecture des réponses sont du calcul
  // pur : elles ne parlent à personne, elles transforment des données.
  'pvgis/parametres.js', 'pvgis/reponse.js', 'pvgis/erreurs.js', 'pvgis/config.js',
];

/** APPLICATION : orchestre le domaine. Ne dessine rien. */
const APPLICATION = ['moteur.js', 'diagnostics.js', 'optimiseur.js', 'copilote.js',
  'laboratoire.js', 'heros.js', 'etat.js', 'fusion.js'];

/** PRÉSENTATION : met en forme. Ne décide de rien. */
const PRESENTATION = ['tableau.js', 'graphe.js', 'rapport.js', 'marque.js', 'anime.js'];

/** INFRASTRUCTURE : stockage, réseau, position, journal. */
const INFRASTRUCTURE = ['session.js', 'prospect.js', 'geo.js', 'journal.js',
  // Le client parle au réseau, le cache au stockage : ils sont ici, et pas
  // dans le domaine, précisément pour cette raison.
  'pvgis/client.js', 'pvgis/cache.js'];

/** CONTRÔLEUR : le seul à toucher au document. */
const CONTROLEUR = ['site.js'];

const CLASSES = { DOMAINE, APPLICATION, PRESENTATION, INFRASTRUCTURE, CONTROLEUR };

test('chaque fichier appartient à exactement une couche', () => {
  // Un fichier non classé est un fichier dont personne ne sait ce qu'il a le
  // droit de faire.
  const classes = Object.values(CLASSES).flat();
  for (const f of tous) {
    const n = classes.filter((c) => c === f).length;
    assert.equal(n, 1, `${f} : classé ${n} fois au lieu d’une`);
  }
  for (const f of classes) {
    assert.ok(tous.includes(f), `${f} est classé mais n’existe pas`);
  }
});

test('LE DOMAINE NE TOUCHE JAMAIS À LA PAGE', () => {
  // C'est la règle qui rend les calculs testables sans navigateur, et qui a
  // permis d'écrire les 350 tests de ce projet.
  const interdits = [/\bdocument\./, /\bwindow\./, /\.innerHTML\b/, /localStorage/,
    /getElementById/, /addEventListener/, /requestAnimationFrame/, /\bfetch\(/];
  for (const f of [...DOMAINE, ...APPLICATION]) {
    const code = lire(f);
    for (const motif of interdits) {
      const ligne = code.split('\n').findIndex((l) => motif.test(l) && !l.trim().startsWith('*')
        && !l.trim().startsWith('//'));
      assert.equal(ligne, -1,
        `${f}:${ligne + 1} — le calcul touche à la page : ${motif}`);
    }
  }
});

test('le domaine n’importe jamais la présentation ni l’infrastructure', () => {
  // Un calcul qui dépend d'un graphique ne peut plus servir au rapport, ni au
  // serveur, ni à un test.
  for (const f of DOMAINE) {
    const code = lire(f);
    for (const interdit of [...PRESENTATION, ...INFRASTRUCTURE, ...APPLICATION, ...CONTROLEUR]) {
      // `prix.js` est du formatage pur, `provenance.js` de l'étiquetage :
      // le domaine peut s'en servir.
      if (interdit === 'prix.js' || interdit === 'provenance.js') continue;
      const nom = interdit.split('/').pop();
      assert.ok(!new RegExp(`from\\s+['"][./]*(?:pvgis/)?${nom.replace('.', '\\.')}['"]`)
        .test(code),
      `${f} importe ${interdit} : le calcul dépend d’une couche supérieure`);
    }
  }
});

test('la présentation ne calcule pas : elle reçoit des résultats', () => {
  // `tableau.js` reçoit une étude déjà faite. S'il pouvait appeler `etudier`,
  // deux chemins produiraient deux chiffres, et ils divergeraient.
  const moteurs = ['etude.js', 'finances.js', 'optimiseur.js', 'moteur.js',
    'scenarios.js', 'laboratoire.js', 'diagnostics.js'];
  for (const f of PRESENTATION) {
    const code = lire(f);
    for (const m of moteurs) {
      assert.ok(!code.includes(`from './${m}'`),
        `${f} importe ${m} : la présentation se met à calculer`);
    }
  }
});

test('personne n’importe le contrôleur', () => {
  // `site.js` est le point d'entrée. Un module qui l'importerait créerait un
  // cycle et rendrait l'ordre de chargement imprévisible.
  for (const f of tous.filter((x) => x !== 'site.js')) {
    assert.ok(!lire(f).includes("'./site.js'"), `${f} importe le contrôleur`);
  }
});

test('le contrôleur est le seul à interroger le document', () => {
  for (const f of tous) {
    const code = lire(f);
    const touche = /getElementById|querySelector/.test(code);
    if (CONTROLEUR.includes(f)) continue;
    // `anime.js` observe l'entrée d'un bloc dans l'écran : c'est de la
    // présentation, et il reçoit le nœud plutôt que d'aller le chercher.
    if (f === 'anime.js') {
      assert.ok(!code.includes('getElementById'),
        'anime.js doit recevoir ses nœuds, pas les chercher');
      continue;
    }
    assert.ok(!touche, `${f} interroge le document : cela revient au contrôleur`);
  }
});

test('aucun import ne pointe hors du projet', () => {
  // Pas de dépendance externe : le site doit fonctionner sans réseau une fois
  // chargé, et sans chaîne d'approvisionnement à surveiller.
  for (const f of tous) {
    for (const m of lire(f).matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      assert.ok(m[1].startsWith('./') || m[1].startsWith('../'),
        `${f} importe ${m[1]} depuis l’extérieur`);
    }
  }
});

test('chaque module exporte quelque chose et porte un en-tête', () => {
  for (const f of tous) {
    const code = lire(f);
    // Le contrôleur n'exporte rien : il est le point d'entrée, et rien ne
    // doit pouvoir l'importer. C'est la règle vérifiée juste au-dessus.
    if (!CONTROLEUR.includes(f)) {
      assert.ok(/^export /m.test(code), `${f} n’exporte rien`);
    }
    assert.ok(code.trimStart().startsWith('/**'),
      `${f} ne commence pas par un en-tête expliquant ce qu’il fait`);
  }
});

test('les hypothèses de calcul restent groupées, jamais dispersées', () => {
  // Une constante économique qui apparaît dans deux fichiers finit par
  // diverger. Elles vivent dans `etude.js` et `finances.js`, et le moteur les
  // republie ; personne d'autre ne les redéfinit.
  const chiffres = ['coutParKwc', 'hausseElectricite', 'valeurSurplus', 'degradation'];
  const proprietaires = ['etude.js', 'finances.js'];
  for (const f of tous.filter((x) => !proprietaires.includes(x))) {
    const code = lire(f);
    for (const c of chiffres) {
      assert.ok(!new RegExp(`^\\s*${c}\\s*:\\s*[0-9]`, 'm').test(code),
        `${f} redéfinit l’hypothèse ${c}`);
    }
  }
});
