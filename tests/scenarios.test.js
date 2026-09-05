import test from 'node:test';
import assert from 'node:assert/strict';
import { comparer, puissancePourVisee, VISEES, PROFILS, scenarioParDefaut, ecart }
  from '../js/scenarios.js';
import { tauxAutoconsommation, COURBE_AUTOCONSOMMATION, HYPOTHESES, PUISSANCE }
  from '../js/etude.js';

const FOYER = {
  consommationAnnuelle: 4800,
  montantAnnuel: 1200,
  gouvernorat: 'sfax',
  orientation: 'sud',
  pente: 'moyenne',
};

/* ---- la courbe d'autoconsommation ---- */

test('la courbe passe par l’hypothèse de référence à ratio 1', () => {
  assert.equal(tauxAutoconsommation(1), HYPOTHESES.autoconsommation);
});

test('plus l’installation est grosse, moins elle autoconsomme', () => {
  let precedent = Infinity;
  for (let r = 0.1; r <= 4; r += 0.1) {
    const t = tauxAutoconsommation(r);
    assert.ok(t <= precedent + 1e-9, `la courbe remonte en ratio ${r.toFixed(1)}`);
    precedent = t;
  }
});

test('le taux reste toujours une part, jamais nul', () => {
  for (const r of [0, -3, 0.01, 1, 10, 500, NaN]) {
    const t = tauxAutoconsommation(r);
    assert.ok(t > 0 && t <= 1, `taux hors bornes pour ratio ${r} : ${t}`);
  }
});

test('mais l’énergie autoconsommée, elle, ne décroît jamais', () => {
  // Un kilowatt de plus ne peut pas faire consommer moins sur place : si la
  // courbe le permettait, un scénario plus gros pourrait rapporter moins.
  let precedent = -1;
  for (let r = 0.1; r <= 4; r += 0.1) {
    const sur_place = r * tauxAutoconsommation(r);
    assert.ok(sur_place >= precedent - 1e-9, `recul en ratio ${r.toFixed(1)}`);
    precedent = sur_place;
  }
});

test('changer l’hypothèse de référence déplace bien toute la courbe', () => {
  assert.equal(tauxAutoconsommation(1, 0.5), 0.5);
  assert.ok(tauxAutoconsommation(1.5, 0.5) < tauxAutoconsommation(1.5, 0.65));
});

test('la courbe est écrite dans l’ordre des ratios croissants', () => {
  for (let i = 1; i < COURBE_AUTOCONSOMMATION.length; i++) {
    assert.ok(COURBE_AUTOCONSOMMATION[i][0] > COURBE_AUTOCONSOMMATION[i - 1][0]);
    assert.ok(COURBE_AUTOCONSOMMATION[i][1] < COURBE_AUTOCONSOMMATION[i - 1][1]);
  }
});

/* ---- les trois scénarios ---- */

test('trois scénarios, du plus léger au plus ambitieux', () => {
  const s = comparer(FOYER);
  assert.equal(s.length, 3);
  assert.deepEqual(s.map((x) => x.cle), ['economique', 'recommande', 'performance']);
  assert.ok(s[0].puissance < s[1].puissance);
  assert.ok(s[1].puissance < s[2].puissance);
});

test('le plus léger se rembourse le plus vite, le plus gros rapporte le plus', () => {
  const [eco, , perf] = comparer(FOYER);
  assert.ok(eco.etude.retour < perf.etude.retour,
    'sans quoi le scénario Économique ne mériterait pas son nom');
  assert.ok(perf.etude.gainNet > eco.etude.gainNet,
    'sans quoi le scénario Performance ne se justifierait pas');
  assert.ok(eco.etude.cout < perf.etude.cout);
});

test('chaque scénario porte une étude complète et cohérente', () => {
  for (const s of comparer(FOYER)) {
    assert.equal(s.etude.puissance, s.puissance);
    assert.ok(s.etude.production > 0);
    assert.ok(s.etude.retour > 0);
    assert.ok(s.nom && s.promesse && s.detail);
  }
});

test('le recommandé couvre bien l’année, à l’arrondi près', () => {
  const s = comparer(FOYER).find((x) => x.cle === 'recommande');
  assert.ok(Math.abs(s.etude.ratio - 1) < 0.2, `ratio ${s.etude.ratio}`);
});

test('une toiture trop petite ne propose jamais ce qui n’y tient pas', () => {
  const surface = 20;
  for (const s of comparer({ ...FOYER, surfaceDisponible: surface })) {
    assert.ok(s.puissance * HYPOTHESES.surfaceParKwc <= surface,
      `${s.nom} : ${s.puissance} kWc demande ${s.puissance * 6} m² sur ${surface}`);
  }
});

test('deux scénarios ramenés à la même puissance n’en font qu’un', () => {
  // Un toit minuscule bride tout au minimum : trois noms pour une seule
  // installation feraient douter de tout le reste de la page.
  const s = comparer({ ...FOYER, surfaceDisponible: 7 });
  const puissances = s.map((x) => x.puissance);
  assert.equal(new Set(puissances).size, puissances.length);
  assert.ok(s.length >= 1);
});

test('des données insuffisantes ne rendent aucun scénario', () => {
  assert.deepEqual(comparer({ ...FOYER, consommationAnnuelle: 0 }), []);
  assert.deepEqual(comparer({ ...FOYER, montantAnnuel: 0 }), []);
  assert.deepEqual(comparer({ ...FOYER, gouvernorat: 'inexistant' }), []);
});

test('la visée économique s’aligne sur la part autoconsommée', () => {
  assert.equal(VISEES.economique, HYPOTHESES.autoconsommation);
  assert.equal(VISEES.recommande, 1);
  assert.ok(VISEES.performance > 1);
});

test('chaque profil annoncé a bien une visée', () => {
  for (const p of PROFILS) assert.ok(VISEES[p.cle] > 0, `visée absente pour ${p.cle}`);
  assert.equal(PROFILS.length, Object.keys(VISEES).length);
});

test('la puissance tombe toujours sur un demi-kilowatt', () => {
  for (const visee of Object.values(VISEES)) {
    for (const conso of [900, 2400, 4800, 9700, 26000]) {
      const p = puissancePourVisee({ ...FOYER, consommationAnnuelle: conso, visee });
      assert.equal(p % PUISSANCE.pas, 0, `${p} kWc n’est pas un demi-kilowatt`);
      assert.ok(p >= PUISSANCE.min && p <= PUISSANCE.max);
    }
  }
});

test('un toit mal orienté demande plus de puissance pour la même visée', () => {
  const sud = puissancePourVisee({ ...FOYER, visee: 1 });
  const nord = puissancePourVisee({ ...FOYER, orientation: 'nord', visee: 1 });
  assert.ok(nord > sud, `${nord} kWc au nord contre ${sud} au sud`);
});

test('le scénario par défaut est le recommandé quand il existe', () => {
  assert.equal(scenarioParDefaut(comparer(FOYER)).cle, 'recommande');
  assert.equal(scenarioParDefaut([]), null);
  assert.equal(scenarioParDefaut(null), null);
});

test('le scénario par défaut existe même sur un toit contraint', () => {
  const s = comparer({ ...FOYER, surfaceDisponible: 7 });
  assert.ok(scenarioParDefaut(s), 'un toit bridé laisse la page sans choix');
});

test('l’écart entre deux scénarios se dit en clair', () => {
  const [eco, reco] = comparer(FOYER);
  const texte = ecart(eco, reco);
  assert.match(texte, /\+.*kWc/);
  assert.match(texte, /DT.à l’achat/);
  assert.match(texte, /DT.d’économie par an/);
  assert.equal(ecart(eco, eco), null, 'aucun écart ne se raconte pas');
  assert.equal(ecart(null, reco), null);
});
