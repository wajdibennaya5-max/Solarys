import test from 'node:test';
import assert from 'node:assert/strict';
import { simuler, VERSION, NIVEAUX, CRITERES, niveauAtteint, hypothesesUtilisees,
  tracer, confiance } from '../js/moteur.js';
import { analyser, compter, estBloque, GRAVITES, PLAUSIBLE } from '../js/diagnostics.js';
import { HYPOTHESES } from '../js/etude.js';
import { FIABILITES } from '../js/consommation.js';

const COMPLET = {
  consommationAnnuelle: 7200, montantAnnuel: 2040, gouvernorat: 'sfax',
  surfaceDisponible: 45, orientation: 'sud', pente: 'moyenne', batiment: 'maison',
  fiabilite: 'facture', detailConso: 'six factures', mois: null,
  moduleWc: 550, moduleId: 'mono-550',
};
const MINIMAL = {
  consommationAnnuelle: 7200, montantAnnuel: 2040, gouvernorat: 'sfax',
  surfaceDisponible: 0, orientation: null, pente: null, batiment: 'maison',
  fiabilite: 'estimation', moduleWc: 550,
};

/* ---- version et structure ---- */

test('le moteur porte une version, et chaque simulation la garde', () => {
  // Deux études du même toit qui ne donnent pas le même chiffre doivent
  // pouvoir se comparer : sans version, on ne saurait pas si c'est la saisie
  // ou le calcul qui a changé.
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(simuler(COMPLET).version, VERSION);
});

test('une simulation rend toujours la structure complète, même en échec', () => {
  for (const entree of [COMPLET, {}, null, { gouvernorat: 'sfax' }]) {
    const s = simuler(entree);
    for (const cle of ['version', 'horodatage', 'entrees', 'resultats', 'hypotheses',
      'tracabilite', 'avertissements', 'erreurs', 'niveau', 'confiance', 'statut']) {
      assert.ok(cle in s, `${cle} absent d’une simulation`);
    }
    assert.ok(['ok', 'echec'].includes(s.statut));
  }
});

test('un échec le dit, avec ses erreurs — il ne rend pas null', () => {
  const s = simuler({ gouvernorat: 'sfax' });
  assert.equal(s.statut, 'echec');
  assert.equal(s.resultats, null);
  assert.ok(s.erreurs.length > 0);
  assert.ok(s.erreurs[0].message.length > 20);
  // Même en échec, le diagnostic tourne : c'est là qu'il est le plus utile.
  assert.ok(s.avertissements.length > 0);
});

test('les entrées sont conservées telles quelles dans le résultat', () => {
  const s = simuler(COMPLET, { puissance: 6 });
  assert.equal(s.entrees.consommationAnnuelle, 7200);
  assert.equal(s.entrees.puissanceImposee, 6);
  assert.equal(s.resultats.puissance, 6);
});

/* ---- niveaux de précision ---- */

test('les trois niveaux se constatent, ils ne se choisissent pas', () => {
  assert.equal(NIVEAUX.length, 3);
  assert.deepEqual(NIVEAUX.map((n) => n.rang), [1, 2, 3]);
  assert.equal(simuler(MINIMAL).niveau.niveau.id, 'rapide');
  assert.equal(simuler(COMPLET).niveau.niveau.id, 'pro');
  const avance = simuler({ ...COMPLET, moduleId: null });
  assert.equal(avance.niveau.niveau.id, 'avance');
});

test('chaque niveau exige des critères qui existent vraiment', () => {
  for (const n of NIVEAUX) {
    for (const cle of n.exige) {
      assert.ok(CRITERES[cle], `${n.id} exige un critère inconnu : ${cle}`);
    }
  }
});

test('le niveau dit ce qu’il manque pour monter d’un cran, comme une action', () => {
  const n = niveauAtteint(MINIMAL);
  assert.equal(n.suivant.id, 'avance');
  const manque = n.pourMonter.map((m) => m.cle);
  assert.ok(manque.includes('orientation'));
  assert.ok(manque.includes('toiture'));
  for (const m of n.pourMonter) assert.ok(m.nom && m.nom.length > 3);
  // Au sommet, plus rien à réclamer.
  assert.deepEqual(niveauAtteint(COMPLET, {
    dimensionnement: { incomplet: false, controles: [] } }).pourMonter, []);
});

test('le niveau professionnel exige des contrôles électriques complets', () => {
  const avecFiches = niveauAtteint(COMPLET, {
    dimensionnement: { incomplet: false, controles: [] } });
  assert.equal(avecFiches.niveau.id, 'pro');
  const sansFiches = niveauAtteint(COMPLET, {
    dimensionnement: { incomplet: true, controles: [
      { verdict: 'inconnu', donneesManquantes: ['module.coeffVoc'] }] } });
  assert.notEqual(sansFiches.niveau.id, 'pro',
    'une fiche incomplète ne doit pas donner un niveau professionnel');
});

/* ---- hypothèses ---- */

test('aucune hypothèse n’est cachée : toutes remontent avec leur source', () => {
  const h = hypothesesUtilisees(COMPLET);
  for (const cle of ['coutParKwc', 'hausseElectricite', 'valeurSurplus', 'degradation',
    'duree', 'surfaceParKwc', 'autoconsommation', 'productible', 'co2']) {
    const trouvee = h.find((x) => x.cle === cle);
    assert.ok(trouvee, `hypothèse absente de la liste : ${cle}`);
    assert.ok(trouvee.nom && trouvee.source, `${cle} sans nom ou sans source`);
    assert.equal(typeof trouvee.verifiee, 'boolean', `${cle} ne dit pas si elle est vérifiée`);
  }
});

test('les hypothèses annoncées valent celles réellement utilisées', () => {
  const h = hypothesesUtilisees(COMPLET);
  const par = (cle) => h.find((x) => x.cle === cle).valeur;
  assert.equal(par('coutParKwc'), HYPOTHESES.coutParKwc);
  assert.equal(par('duree'), HYPOTHESES.duree);
  assert.equal(par('surfaceParKwc'), HYPOTHESES.surfaceParKwc);
  assert.equal(par('hausseElectricite'), HYPOTHESES.hausseElectricite * 100);
});

test('le tarif n’est annoncé que s’il a servi', () => {
  // L'écrire alors que la consommation vient d'une facture laisserait croire
  // qu'on a supposé un prix qu'on a en réalité lu.
  const surFacture = hypothesesUtilisees({ ...COMPLET, fiabilite: 'facture' });
  assert.ok(!surFacture.some((h) => h.cle === 'grilleTarifaire'));
  const estime = hypothesesUtilisees({ ...COMPLET, fiabilite: 'estimation' });
  assert.ok(estime.some((h) => h.cle === 'grilleTarifaire'));
});

test('la part autoconsommée annoncée suit le type de bâtiment', () => {
  const maison = hypothesesUtilisees({ ...COMPLET, batiment: 'maison' })
    .find((h) => h.cle === 'autoconsommation').valeur;
  const usine = hypothesesUtilisees({ ...COMPLET, batiment: 'industrie' })
    .find((h) => h.cle === 'autoconsommation').valeur;
  assert.ok(usine > maison);
});

/* ---- traçabilité ---- */

test('chaque résultat important dit d’où il vient', () => {
  const s = simuler(COMPLET);
  const cles = s.tracabilite.map((t) => t.cle);
  for (const attendu of ['prixKwh', 'puissance', 'production', 'autoconsomme',
    'economieAnnuelle', 'retour', 'co2Annuel']) {
    assert.ok(cles.includes(attendu), `pas de traçabilité pour ${attendu}`);
  }
  for (const t of s.tracabilite) {
    assert.ok(t.nom && t.valeur, `${t.cle} incomplet`);
    assert.ok(t.methode.length > 20, `${t.cle} : méthode trop vague`);
    assert.ok(Array.isArray(t.parametres) && t.parametres.length > 0,
      `${t.cle} ne nomme aucun paramètre`);
    for (const [nom, valeur] of t.parametres) {
      assert.ok(nom && valeur !== undefined && valeur !== '', `${t.cle} : paramètre vide`);
    }
  }
});

test('les hypothèses citées par la traçabilité existent dans la liste', () => {
  const s = simuler(COMPLET);
  const connues = new Set(s.hypotheses.map((h) => h.cle));
  for (const t of s.tracabilite) {
    for (const h of t.hypotheses) {
      assert.ok(connues.has(h), `${t.cle} cite une hypothèse inconnue : ${h}`);
    }
  }
});

test('la méthode du prix change selon qu’on l’a lue ou déduite', () => {
  const lu = tracer(simuler(COMPLET).resultats, { ...COMPLET, fiabilite: 'facture' });
  const deduit = tracer(simuler(COMPLET).resultats, { ...COMPLET, fiabilite: 'estimation' });
  assert.match(lu.find((t) => t.cle === 'prixKwh').methode, /lus sur la facture/);
  assert.match(deduit.find((t) => t.cle === 'prixKwh').methode, /grille tarifaire/);
});

/* ---- confiance ---- */

test('la confiance mesure les données, pas la qualité du projet', () => {
  const bonne = confiance(COMPLET, { dimensionnement: { incomplet: false, controles: [] } });
  const faible = confiance(MINIMAL);
  assert.ok(bonne.note > faible.note);
  assert.ok(bonne.note <= 100 && faible.note >= 0);
  assert.equal(bonne.facteurs.reduce((s, f) => s + f.poids, 0), 100);
  for (const f of bonne.facteurs) {
    assert.ok(f.obtenu <= f.poids, `${f.nom} obtient plus que son poids`);
    assert.ok(f.note && f.note.length > 3, `${f.nom} n’explique pas sa note`);
  }
});

test('une facture réelle pèse plus qu’une estimation', () => {
  const surFacture = confiance({ ...COMPLET, fiabilite: 'facture' }).note;
  const surReleve = confiance({ ...COMPLET, fiabilite: 'releve' }).note;
  const estime = confiance({ ...COMPLET, fiabilite: 'estimation' }).note;
  assert.ok(surFacture > surReleve && surReleve > estime);
  assert.ok(FIABILITES.facture.rang > FIABILITES.estimation.rang);
});

/* ---- diagnostics ---- */

test('chaque alerte porte problème, pourquoi, données et action', () => {
  for (const entree of [COMPLET, MINIMAL, {}, { ...COMPLET, consommationAnnuelle: 900000 }]) {
    for (const a of analyser(entree, { etude: simuler(entree).resultats })) {
      assert.ok(GRAVITES[a.gravite], `gravité inconnue : ${a.gravite}`);
      assert.ok(a.probleme && a.probleme.length > 5, `${a.cle} : problème vide`);
      assert.ok(a.pourquoi && a.pourquoi.length > 30,
        `${a.cle} : le « pourquoi » n’explique pas l’effet sur l’étude`);
      assert.ok(Array.isArray(a.donnees) && a.donnees.length > 0,
        `${a.cle} : aucune donnée — l’alerte serait invérifiable`);
      assert.ok(a.action && a.action.length > 20,
        `${a.cle} : sans action, c’est un reproche`);
    }
  }
});

test('les alertes sont rendues de la plus grave à la plus anodine', () => {
  const a = analyser({}, {});
  for (let i = 1; i < a.length; i++) {
    assert.ok(GRAVITES[a[i - 1].gravite].rang >= GRAVITES[a[i].gravite].rang);
  }
});

test('une donnée manquante bloquante est nommée comme telle', () => {
  const a = analyser({}, {});
  assert.ok(estBloque(a));
  assert.ok(a.some((x) => x.cle === 'gouvernorat'));
  assert.ok(a.some((x) => x.cle === 'consommation'));
  assert.ok(!estBloque(analyser(COMPLET, { etude: simuler(COMPLET).resultats })));
});

test('l’ombrage est toujours annoncé comme non calculé', () => {
  // Ne jamais laisser croire qu'une perte d'ombrage a été prise en compte.
  const a = analyser(COMPLET, { etude: simuler(COMPLET).resultats });
  const ombrage = a.find((x) => x.cle === 'ombrage');
  assert.ok(ombrage, 'l’absence d’analyse d’ombrage doit être dite, toujours');
  assert.match(ombrage.probleme, /non disponible/);
  assert.match(ombrage.pourquoi, /Aucune perte d’ombrage n’est donc appliquée/);
});

test('une toiture trop petite est enfin détectée', () => {
  // Le contrôle comparait à la puissance DÉJÀ rabotée par la toiture : il ne
  // se déclenchait jamais.
  const petit = { ...COMPLET, surfaceDisponible: 8 };
  const s = simuler(petit);
  const a = s.avertissements.find((x) => x.cle === 'surface-insuffisante');
  assert.ok(a, 'une toiture de 8 m² pour 7 200 kWh doit être signalée');
  const dit = Object.fromEntries(a.donnees);
  assert.match(dit['couverture atteinte'], /\d+ %/);
  assert.ok(!analyser(COMPLET, { etude: simuler(COMPLET).resultats })
    .some((x) => x.cle === 'surface-insuffisante'),
  'une toiture suffisante ne doit pas être signalée');
});

test('une consommation hors du plausible est signalée sans être déclarée fausse', () => {
  const a = analyser({ ...COMPLET, consommationAnnuelle: 900000 }, {});
  const x = a.find((y) => y.cle === 'consommation-inhabituelle');
  assert.ok(x);
  assert.match(x.pourquoi, /pas forcément fausse/);
  for (const bat of Object.keys(PLAUSIBLE)) {
    assert.ok(PLAUSIBLE[bat].min < PLAUSIBLE[bat].max, bat);
  }
});

test('le compte par gravité tombe juste', () => {
  const a = analyser({}, {});
  const c = compter(a);
  assert.equal(c.bloquant + c.important + c.information, a.length);
  assert.deepEqual(compter([]), { bloquant: 0, important: 0, information: 0 });
});

test('une configuration électrique refusée interdit le niveau professionnel', () => {
  // Toutes les fiches peuvent être complètes et la configuration inposable :
  // ce n'est pas une « conception professionnelle ».
  const refuse = niveauAtteint(COMPLET, {
    dimensionnement: { incomplet: false, controles: [
      { cle: 'ratio', verdict: 'hors', donneesManquantes: [] }] } });
  assert.notEqual(refuse.niveau.id, 'pro');
  assert.ok(refuse.pourMonter.some((m) => m.cle === 'electrique'));
});
