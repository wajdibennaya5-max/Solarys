import test from 'node:test';
import assert from 'node:assert/strict';
import * as config from '../js/pvgis/config.js';
import * as parametres from '../js/pvgis/parametres.js';
import * as reponse from '../js/pvgis/reponse.js';
import * as cache from '../js/pvgis/cache.js';
import { echec, depuisStatut, GENRES } from '../js/pvgis/erreurs.js';
import { interroger, production, statistiques } from '../js/pvgis/client.js';
import { nu, disponible, estTracee, confianceGlobale, tracer, absente, SOURCES,
  composition, expliquer } from '../js/provenance.js';
import { ORIENTATIONS, PENTES, facteurOrientation } from '../js/orientation.js';
import { etudier, productibleRetenu } from '../js/etude.js';
import { productible as productibleInterne } from '../js/gisement.js';
import { simuler } from '../js/moteur.js';
import { fusionner } from '../js/fusion.js';

/* ------------------------------------------------------------------ */
/* Provenance                                                          */
/* ------------------------------------------------------------------ */

test('une valeur dérivée n’est jamais plus sûre que sa source la plus faible', () => {
  // Sans cette règle, une hypothèse traversée par deux calculs ressortirait
  // « élevée » — c'est ainsi qu'une plateforme devient invérifiable.
  const solide = tracer(1650, { source: 'externe' });
  const fragile = tracer(0.65, { source: 'hypothese' });
  const derive = tracer(1072, { source: 'calcul', depuis: [solide, fragile] });
  assert.equal(solide.confiance, 'elevee');
  assert.equal(derive.confiance, 'preliminaire');
});

test('la confiance globale est celle du maillon le plus faible, pas une moyenne', () => {
  const v = [tracer(1, { source: 'externe' }), tracer(2, { source: 'saisie' }),
    tracer(3, { source: 'hypothese' })];
  assert.equal(confianceGlobale(v), 'preliminaire');
  assert.equal(confianceGlobale(v.slice(0, 2)), 'elevee');
  assert.equal(confianceGlobale([]), 'preliminaire');
});

test('une donnée absente reste absente : jamais zéro, jamais devinée', () => {
  const a = absente('pas de couverture ici');
  assert.equal(nu(a), null);
  assert.equal(disponible(a), false);
  assert.equal(a.source, 'absente');
  assert.match(SOURCES.absente.phrase, /n’a pas été remplacée par une valeur inventée/);
});

test('chaque source a un rang, un nom et une phrase explicable au client', () => {
  for (const [id, s] of Object.entries(SOURCES)) {
    assert.equal(s.id, id);
    assert.ok(Number.isInteger(s.rang), id);
    assert.ok(s.nom && s.court && s.phrase.length > 30, id);
  }
  // Les cinq origines exigées existent bien, sous nos noms.
  for (const attendue of ['saisie', 'externe', 'catalogue', 'calcul', 'hypothese']) {
    assert.ok(SOURCES[attendue], `origine manquante : ${attendue}`);
  }
});

test('une valeur s’explique entièrement au clic', () => {
  const v = tracer(6820, { source: 'externe', unite: 'kWh/an',
    methode: 'PVcalc', details: { versionApi: 'v5_3' } });
  const e = expliquer(v, 'Production annuelle');
  assert.equal(e.nom, 'Production annuelle');
  assert.equal(e.valeur, 6820);
  assert.equal(e.court, 'SOURCE');
  assert.ok(e.methode && e.phrase && e.horodatage && e.confianceNom);
  // Même une valeur nue s'explique, en disant qu'elle n'est pas tracée.
  assert.equal(expliquer(42).source, 'absente');
});

test('la composition d’une étude se compte par source', () => {
  const c = composition([tracer(1, { source: 'externe' }), tracer(2, { source: 'externe' }),
    tracer(3, { source: 'saisie' })]);
  assert.deepEqual(c, { externe: 2, saisie: 1 });
});

/* ------------------------------------------------------------------ */
/* Unités et conventions — là où se perdent les intégrations           */
/* ------------------------------------------------------------------ */

test('L’AZIMUT SUIT LA CONVENTION DU SERVICE : 0 = SUD, PAS 0 = NORD', () => {
  // La confusion la plus coûteuse de toute l'intégration : avec la convention
  // géographique, plein sud deviendrait 180 et l'installation serait
  // retournée — sans qu'aucune erreur ne s'affiche.
  assert.equal(parametres.azimutDe('sud'), 0);
  assert.equal(parametres.azimutDe('est'), -90);
  assert.equal(parametres.azimutDe('ouest'), 90);
  assert.equal(Math.abs(parametres.azimutDe('nord')), 180);
  // Est et ouest sont symétriques, de signes opposés.
  assert.equal(parametres.azimutDe('est'), -parametres.azimutDe('ouest'));
  assert.equal(parametres.azimutDe('sud-est'), -parametres.azimutDe('sud-ouest'));
});

test('les deux référentiels d’orientation décrivent les mêmes directions', () => {
  const c = parametres.orientationsCouvertes();
  assert.deepEqual([...c.interne].sort(), [...c.pvgis].sort());
  assert.deepEqual([...c.pentesInternes].sort(), [...c.pentesPvgis].sort());
  for (const o of ORIENTATIONS) {
    assert.notEqual(parametres.azimutDe(o.id), null, `azimut manquant pour ${o.id}`);
  }
  for (const p of PENTES) {
    assert.notEqual(parametres.inclinaisonDe(p.id), null, `inclinaison manquante pour ${p.id}`);
  }
});

test('l’ordre des azimuts suit l’ordre des facteurs internes', () => {
  // Un azimut plus proche de zéro doit correspondre à une orientation qui
  // produit davantage. Si les deux tables divergeaient, le service et notre
  // moteur classeraient les toits différemment.
  const paires = ORIENTATIONS
    .map((o) => ({ id: o.id, azimut: Math.abs(parametres.azimutDe(o.id)),
      facteur: facteurOrientation(o.id, 'moyenne').facteur }))
    .sort((a, b) => a.azimut - b.azimut);
  for (let i = 1; i < paires.length; i++) {
    assert.ok(paires[i].facteur <= paires[i - 1].facteur + 1e-9,
      `${paires[i].id} (azimut ${paires[i].azimut}) produit plus que `
      + `${paires[i - 1].id} (azimut ${paires[i - 1].azimut})`);
  }
});

test('une terrasse ignore l’orientation du bâtiment, des deux côtés', () => {
  const p = parametres.pourProduction({ latitude: 34.74, longitude: 10.76,
    puissanceKwc: 4, orientation: 'nord', pente: 'plat' });
  assert.equal(p.parametres.aspect, 0, 'sur châssis, les modules regardent le sud');
  assert.ok(p.parametres.angle > 0, 'une terrasse n’est pas 0° : les modules sont inclinés');
});

test('LA PUISSANCE EST EN kWc POUR LA PRODUCTION, EN Wc POUR L’AUTONOME', () => {
  // Un facteur mille entre deux points d'entrée du même service. Il ne
  // produit aucune erreur : juste un résultat mille fois faux.
  const grid = parametres.pourProduction({ latitude: 34, longitude: 10,
    puissanceKwc: 4, orientation: 'sud', pente: 'moyenne' });
  assert.equal(grid.parametres.peakpower, 4);
  const off = parametres.pourAutonome({ latitude: 34, longitude: 10, puissanceKwc: 4,
    batterieWh: 10000, consommationJourWh: 8000, orientation: 'sud', pente: 'moyenne' });
  assert.equal(off.parametres.peakpower, 4000);
});

test('les paramètres hors bornes sont refusés avant tout appel', () => {
  const cas = [
    [{ latitude: 200, longitude: 10, puissanceKwc: 4, orientation: 'sud', pente: 'moyenne' }, /Latitude/],
    [{ latitude: 34, longitude: 400, puissanceKwc: 4, orientation: 'sud', pente: 'moyenne' }, /Longitude/],
    [{ latitude: 34, longitude: 10, puissanceKwc: 0, orientation: 'sud', pente: 'moyenne' }, /Puissance/],
    [{ latitude: 34, longitude: 10, puissanceKwc: 4, orientation: 'sud', pente: 'moyenne', pertes: 300 }, /Pertes/],
  ];
  for (const [entree, motif] of cas) {
    const r = parametres.pourProduction(entree);
    assert.equal(r.ok, false);
    assert.ok(r.erreurs.some((e) => motif.test(e)), `attendu ${motif}, obtenu ${r.erreurs}`);
  }
});

test('une orientation inconnue ne devient jamais « plein sud » par défaut', () => {
  assert.equal(parametres.azimutDe('quelque-part'), null);
  assert.equal(parametres.azimutDe(null), null);
  const r = parametres.pourProduction({ latitude: 34, longitude: 10, puissanceKwc: 4,
    orientation: 'quelque-part', pente: 'moyenne' });
  assert.equal(r.ok, false, 'plutôt refuser que supposer le meilleur cas');
});

test('le mois d’un profil de journée est validé', () => {
  const bon = parametres.pourJournee({ latitude: 34, longitude: 10, mois: 7,
    puissanceKwc: 4, pente: 'moyenne', orientation: 'sud' });
  assert.equal(bon.parametres.month, 7);
  for (const mois of [0, 13, null, 'juillet']) {
    assert.equal(parametres.pourJournee({ latitude: 34, longitude: 10, mois,
      puissanceKwc: 4 }).ok, false, `mois accepté à tort : ${mois}`);
  }
});

/* ------------------------------------------------------------------ */
/* Normalisation des réponses                                          */
/* ------------------------------------------------------------------ */

const REPONSE = {
  inputs: {
    location: { latitude: 34.74, longitude: 10.76, elevation: 23 },
    meteo_data: { radiation_db: 'PVGIS-SARAH3', meteo_db: 'ERA5',
      year_min: 2005, year_max: 2023, use_horizon: true },
    pv_module: { peak_power: 4 },
  },
  outputs: {
    totals: { fixed: { E_y: 6820, 'H(i)_y': 2010, l_total: -21.4, l_tg: -9.2 } },
    monthly: { fixed: Array.from({ length: 12 },
      (_, i) => ({ month: i + 1, E_m: 400 + i * 30, 'H(i)_m': 120 + i * 10, SD_m: 22 })) },
  },
};

test('une réponse complète est lue jusqu’au bout', () => {
  const p = reponse.production(REPONSE, { puissanceKwc: 4 });
  assert.equal(p.ok, true);
  assert.equal(nu(p.production), 6820);
  assert.equal(nu(p.irradiation), 2010);
  assert.equal(nu(p.site.altitude), 23);
  assert.equal(nu(p.mensuel).length, 12);
  assert.equal(p.origine.baseDonnees, 'PVGIS-SARAH3');
  assert.equal(p.origine.anneeDebut, 2005);
});

test('LA PRODUCTION VIENT DU SERVICE, LE PRODUCTIBLE EST NOTRE CALCUL', () => {
  // Les confondre reviendrait à attribuer au service un chiffre qu'il n'a
  // jamais donné. C'est exactement le genre de glissement que la provenance
  // existe pour empêcher.
  const p = reponse.production(REPONSE, { puissanceKwc: 4 });
  assert.equal(p.production.source, 'externe');
  assert.equal(p.productible.source, 'calcul');
  assert.equal(nu(p.productible), Math.round(6820 / 4));
  assert.match(p.productible.methode, /÷ puissance demandée/);
});

test('un champ absent devient une donnée absente, jamais un zéro', () => {
  const ampute = { outputs: { totals: { fixed: { E_y: 6820 } } } };
  const p = reponse.production(ampute, { puissanceKwc: 4 });
  assert.equal(p.ok, true, 'la production suffit à exploiter la réponse');
  assert.equal(disponible(p.irradiation), false);
  assert.equal(nu(p.irradiation), null, 'zéro serait lu comme une mesure');
  assert.equal(disponible(p.mensuel), false);
  assert.equal(disponible(p.site.altitude), false);
});

test('sans production annuelle, la réponse est déclarée inexploitable', () => {
  for (const brut of [{}, null, 'texte', { outputs: {} }, { outputs: { totals: {} } }]) {
    const p = reponse.production(brut, { puissanceKwc: 4 });
    assert.equal(p.ok, false, `réponse acceptée à tort : ${JSON.stringify(brut)}`);
    assert.ok(p.raison.length > 5);
  }
});

test('le profil d’horizon dit qu’il décrit le relief, pas le toit', () => {
  // Confondre les deux ferait croire à une analyse d'ombrage qui n'a pas eu lieu.
  const h = reponse.horizon({ outputs: { horizon_profile:
    Array.from({ length: 48 }, (_, i) => ({ A: i * 7.5, H_hor: i % 12 })) } });
  assert.equal(h.ok, true);
  assert.equal(h.portee, 'terrain');
  assert.match(h.avertissement, /ni les arbres, ni les cheminées/);
  assert.equal(h.points.length, 48);
  assert.equal(h.hauteurMax, 11);
});

test('un profil de journée illisible est refusé plutôt que rempli', () => {
  assert.equal(reponse.journee({}).ok, false);
  assert.equal(reponse.journee({ outputs: { daily_profile: [] } }).ok, false);
  const j = reponse.journee({ outputs: { daily_profile:
    [{ time: '06:00', 'G(i)': 120, T2m: 18, P: 300 }] } }, { mois: 7 });
  assert.equal(j.ok, true);
  assert.equal(j.heures.length, 1);
});

/* ------------------------------------------------------------------ */
/* Cache                                                               */
/* ------------------------------------------------------------------ */

test('LA CLÉ DE CACHE CHANGE AVEC CE QUI COMPTE, ET AVEC RIEN D’AUTRE', () => {
  const base = { lat: 34.74, lon: 10.76, peakpower: 4, angle: 30, aspect: 0 };
  const k = cache.cle('production', base);
  // Ce qui doit invalider :
  for (const [champ, valeur] of [['angle', 45], ['aspect', -90], ['peakpower', 6],
    ['lat', 36.8]]) {
    assert.notEqual(cache.cle('production', { ...base, [champ]: valeur }), k,
      `changer ${champ} devrait invalider le cache`);
  }
  // Ce qui ne doit pas : l'ordre des clés, et tout ce qui n'est pas envoyé.
  assert.equal(cache.cle('production',
    { aspect: 0, angle: 30, peakpower: 4, lon: 10.76, lat: 34.74 }), k);
  // Un autre calcul sur les mêmes paramètres est une autre entrée.
  assert.notEqual(cache.cle('horizon', base), k);
});

test('un déplacement de quelques mètres ne relance pas le calcul', () => {
  // Le rayonnement est identique à cent mètres près : garder tous les
  // chiffres ferait manquer le cache à chaque frémissement du marqueur.
  const a = cache.cle('production', { lat: 34.7400, lon: 10.7600 });
  const b = cache.cle('production', { lat: 34.7401, lon: 10.7599 });
  assert.equal(a, b);
  const loin = cache.cle('production', { lat: 34.79, lon: 10.76 });
  assert.notEqual(a, loin);
});

test('le cache écrit, relit, et n’explose pas sans stockage', () => {
  cache.vider();
  const k = cache.cle('production', { lat: 1, lon: 2 });
  assert.equal(cache.lire(k), null);
  assert.doesNotThrow(() => cache.ecrire(k, { E_y: 100 }));
  assert.deepEqual(cache.lire(k), { E_y: 100 });
  cache.vider();
  assert.equal(cache.lire(k), null);
});

test('les paramètres sensibles annoncés couvrent ceux réellement envoyés', () => {
  const p = parametres.pourProduction({ latitude: 34, longitude: 10, puissanceKwc: 4,
    orientation: 'sud', pente: 'moyenne' }).parametres;
  for (const cle of Object.keys(p)) {
    if (cle === 'outputformat') continue;
    assert.ok(cache.PARAMETRES_SENSIBLES.includes(cle),
      `${cle} est envoyé au service mais absent de la liste des paramètres sensibles`);
  }
});

/* ------------------------------------------------------------------ */
/* Erreurs et client                                                   */
/* ------------------------------------------------------------------ */

test('chaque genre d’erreur a un message client sans jargon', () => {
  for (const [id, g] of Object.entries(GENRES)) {
    assert.equal(g.id, id);
    assert.ok(g.client.length > 40, `${id} : message client trop court`);
    assert.ok(!/Error|fetch|null|undefined|HTTP|CORS/.test(g.client),
      `${id} : jargon technique dans le message client — « ${g.client} »`);
    assert.ok(g.technique.length > 10);
  }
});

test('les codes du service se traduisent en genres compréhensibles', () => {
  assert.equal(depuisStatut(400), 'parametres');
  assert.equal(depuisStatut(404), 'horsZone');
  assert.equal(depuisStatut(429), 'trafic');
  assert.equal(depuisStatut(504), 'delai');
  assert.equal(depuisStatut(500), 'indisponible');
});

test('LE CLIENT NE LÈVE JAMAIS, QUOI QU’IL ARRIVE', () => {
  // Un service extérieur qui casse la page qui l'appelle est un service qu'il
  // vaut mieux ne pas intégrer.
  assert.doesNotThrow(() => echec('indisponible'));
  assert.equal(echec('delai').ok, false);
  assert.ok(echec('delai').messageClient.length > 40);
});

test('sans relais configuré, l’appel échoue proprement et le dit', async () => {
  // C'est l'état actuel du projet : le relais n'est pas déployé, et la
  // plateforme doit fonctionner exactement comme avant.
  const r = await production({ latitude: 34.74, longitude: 10.76, puissanceKwc: 4,
    orientation: 'sud', pente: 'moyenne' });
  assert.equal(r.ok, false);
  assert.equal(r.genre, 'indisponible');
  assert.equal(r.recuperable, true);
  assert.match(r.messageClient, /temporairement indisponible/);
});

test('des paramètres invalides n’atteignent jamais le réseau', async () => {
  let appele = false;
  const r = await production({ latitude: 999, longitude: 10, puissanceKwc: 4 },
    { chercher: () => { appele = true; throw new Error('ne doit pas arriver'); } });
  assert.equal(r.ok, false);
  assert.equal(r.genre, 'parametres');
  assert.equal(appele, false, 'un appel a été fait malgré des paramètres refusés');
});

test('un calcul inconnu est refusé sans appel', async () => {
  const r = await interroger('astrologie', { ok: true, parametres: {} }, () => ({ ok: true }));
  assert.equal(r.ok, false);
  assert.equal(r.genre, 'parametres');
});

test('les compteurs de diagnostic existent et restent lisibles', () => {
  const s = statistiques();
  for (const cle of ['appels', 'cache', 'echecs', 'reprises', 'enCache']) {
    assert.equal(typeof s[cle], 'number', `compteur manquant : ${cle}`);
  }
});

test('la configuration ne laisse traîner ni URL ni version ailleurs', () => {
  assert.match(config.VERSION_API, /^v\d+_\d+$/);
  assert.ok(config.BASE.includes(config.VERSION_API));
  assert.equal(config.disponible(), typeof config.RELAIS() === 'string');
  // Chaque calcul déclaré porte un chemin et un poids.
  for (const [id, c] of Object.entries(config.CALCULS)) {
    assert.equal(c.id, id);
    assert.ok(c.chemin && c.nom && c.resume, id);
    assert.ok(['leger', 'lourd'].includes(c.poids), `${id} : poids inconnu`);
  }
  assert.ok(config.ATTRIBUTION.mention.includes('PVGIS'));
});

test('l’heure d’un profil se lit en nombre COMME en texte', () => {
  // Le service la donne tantôt en nombre, tantôt en « 06:30 ». Un parseur
  // numérique naïf vidait le profil de toutes ses lignes — un graphique
  // parfaitement vide, sans la moindre erreur pour le signaler.
  assert.equal(reponse.heureDecimale(6), 6);
  assert.equal(reponse.heureDecimale('06:00'), 6);
  assert.equal(reponse.heureDecimale('06:30'), 6.5);
  assert.equal(reponse.heureDecimale('6h'), 6);
  assert.equal(reponse.heureDecimale('18:15'), 18.25);
  for (const mauvais of ['midi', '', null, '25:00', '06:99']) {
    assert.equal(reponse.heureDecimale(mauvais), null, `accepté à tort : ${mauvais}`);
  }
  const j = reponse.journee({ outputs: { daily_profile: [
    { time: '06:00', 'G(i)': 120, T2m: 18, P: 300 },
    { time: '12:00', 'G(i)': 900, T2m: 31, P: 2800 },
  ] } }, { mois: 7 });
  assert.equal(j.heures.length, 2);
  assert.equal(j.heures[1].heure, 12);
  assert.equal(j.heures[1].production, 2800);
});

test('le relais se règle en HTTPS seulement', () => {
  // Un relais en clair exposerait les coordonnées du visiteur sur le réseau.
  assert.equal(config.definirRelais('http://exemple.tn/api/pvgis'), null);
  assert.equal(config.definirRelais('pas-une-adresse'), null);
  assert.equal(config.definirRelais(42), null);
  assert.equal(config.disponible(), false);
  assert.equal(config.definirRelais('https://exemple.tn/api/pvgis'),
    'https://exemple.tn/api/pvgis');
  assert.equal(config.disponible(), true);
  config.definirRelais(null);
  assert.equal(config.disponible(), false);
});

test('avec un relais et une réponse valide, la chaîne complète fonctionne', async () => {
  // Le relais n'est pas encore déployé : ce test prouve que le jour où il le
  // sera, tout le chemin — composition, appel, normalisation, cache — tient.
  config.definirRelais('https://exemple.tn/api/pvgis');
  cache.vider();
  let urlAppelee = null;
  const faux = async (url) => {
    urlAppelee = url;
    return { ok: true, status: 200, json: async () => REPONSE };
  };
  const r = await production({ latitude: 34.74, longitude: 10.76, puissanceKwc: 4,
    orientation: 'sud', pente: 'moyenne' }, { chercher: faux });
  assert.equal(r.ok, true);
  assert.equal(nu(r.production), 6820);
  assert.equal(r.depuisCache, false);
  assert.match(urlAppelee, /calcul=PVcalc/);
  assert.match(urlAppelee, /aspect=0/);
  assert.match(urlAppelee, /peakpower=4/);

  // Deuxième appel identique : servi par le cache, sans toucher au réseau.
  let rappele = false;
  const r2 = await production({ latitude: 34.74, longitude: 10.76, puissanceKwc: 4,
    orientation: 'sud', pente: 'moyenne' },
  { chercher: async () => { rappele = true; throw new Error('ne doit pas arriver'); } });
  assert.equal(r2.ok, true);
  assert.equal(r2.depuisCache, true);
  assert.equal(rappele, false);

  // Un paramètre qui change relance vraiment l'appel.
  let relance = false;
  await production({ latitude: 34.74, longitude: 10.76, puissanceKwc: 6,
    orientation: 'sud', pente: 'moyenne' },
  { chercher: async (u) => { relance = true; return faux(u); } });
  assert.equal(relance, true, 'changer la puissance doit relancer le calcul');

  config.definirRelais(null);
  cache.vider();
});

test('un service en panne ne casse rien et le dit sans jargon', async () => {
  config.definirRelais('https://exemple.tn/api/pvgis');
  cache.vider();
  const cas = [
    [async () => ({ ok: false, status: 503 }), 'indisponible'],
    [async () => ({ ok: false, status: 400 }), 'parametres'],
    [async () => ({ ok: false, status: 429 }), 'trafic'],
    [async () => { const e = new Error('coupé'); e.name = 'AbortError'; throw e; }, 'delai'],
    [async () => ({ ok: true, status: 200, json: async () => ({}) }), 'reponse'],
  ];
  for (const [chercher, attendu] of cas) {
    const r = await production({ latitude: 34.74, longitude: 10.76, puissanceKwc: 4,
      orientation: 'sud', pente: 'moyenne' }, { chercher });
    assert.equal(r.ok, false, `${attendu} : la réponse aurait dû échouer`);
    assert.equal(r.genre, attendu);
    assert.ok(r.messageClient.length > 40);
    assert.ok(!/Error|fetch|HTTP|CORS|undefined/.test(r.messageClient), r.messageClient);
  }
  config.definirRelais(null);
  cache.vider();
});

/* ------------------------------------------------------------------ */
/* L'intégration est réelle, pas décorative                            */
/* ------------------------------------------------------------------ */

test('UNE MESURE AU POINT ENTRE DANS LE CALCUL, ELLE NE FAIT PAS QUE S’AFFICHER', () => {
  // Afficher « productible mesuré : 1753 » tout en calculant la production
  // sur 1650 serait le faux-semblant qu'un installateur découvre en refaisant
  // l'addition. Ce test l'interdit.
  const base = { consommationAnnuelle: 7200, montantAnnuel: 2040, gouvernorat: 'sfax',
    orientation: 'sud', pente: 'moyenne', puissance: 4 };
  const interne = etudier(base);
  const mesure = etudier({ ...base, productibleMesure: 1753 });
  assert.equal(interne.productible, productibleInterne('sfax'));
  assert.equal(mesure.productible, 1753);
  assert.notEqual(mesure.production, interne.production);
  assert.equal(mesure.production, Math.round(4 * 1753));
  assert.equal(interne.productibleMesure, false);
  assert.equal(mesure.productibleMesure, true);
});

test('la mesure influence aussi la puissance recommandée', () => {
  const base = { consommationAnnuelle: 20000, montantAnnuel: 5600, gouvernorat: 'sfax',
    orientation: 'sud', pente: 'moyenne' };
  const interne = etudier(base);
  const plusEnsoleille = etudier({ ...base, productibleMesure: 2000 });
  assert.ok(plusEnsoleille.puissance < interne.puissance,
    'un site plus ensoleillé demande moins de kilowatts pour le même besoin');
});

test('une mesure absente ou aberrante retombe sur le référentiel, sans bruit', () => {
  for (const mauvaise of [null, undefined, 0, -100, NaN, 'beaucoup']) {
    assert.equal(productibleRetenu('sfax', mauvaise), productibleInterne('sfax'),
      `valeur acceptée à tort : ${mauvaise}`);
  }
  assert.equal(productibleRetenu('sfax', 1753), 1753);
});

test('la fiche du site n’annonce une mesure que si le calcul l’a utilisée', () => {
  // Les deux doivent bouger ensemble : la fiche lit ce qui a servi.
  const sim = simuler({ consommationAnnuelle: 7200, montantAnnuel: 2040,
    gouvernorat: 'sfax', orientation: 'sud', pente: 'moyenne', batiment: 'maison',
    fiabilite: 'facture', moduleWc: 550, latitude: 34.74, longitude: 10.76,
    originePosition: 'capteur' });
  const mesureNonUtilisee = { ok: true, productible: tracer(1753, { source: 'calcul' }),
    site: { altitude: tracer(23, { source: 'externe' }) }, origine: {} };
  const f = fusionner(sim, { mesureService: mesureNonUtilisee });
  // `entrees.productibleMesure` est absent : le calcul n'a pas utilisé la
  // mesure, la fiche doit donc annoncer le référentiel interne.
  assert.equal(f.profil.productible.source, 'interne');
});
