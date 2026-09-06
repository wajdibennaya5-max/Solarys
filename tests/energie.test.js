import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROFILS, MOIS_ETE, JOURS_PAR_MOIS, JOURS_PAR_AN, HEURES_PAR_JOUR, profil,
  consommationHoraire, consommationImportee, productionHoraire,
  batterie, BATTERIE_DEFAUT, bilan, apportBatterie,
} from '../js/energie.js';
import { productionMensuelle, MOIS } from '../js/gisement.js';
import { position } from '../js/soleil.js';
import { TYPES } from '../js/batiment.js';

const TUNIS = { latitude: 36.8065, longitude: 10.1815 };
/** La hauteur du soleil au 15 du mois — le jour le plus représentatif. */
const hauteur = (mois, h) => {
  const p = position({ ...TUNIS, date: new Date(Date.UTC(2025, mois, 15, 12)), heure: h });
  return p ? p.hauteur : 0;
};
const prod = (annuelle = 9000) => productionHoraire(productionMensuelle(annuelle, 'tunis'), hauteur);
const somme = (t) => t.reduce((a, b) => a + b, 0);

test('l’année compte 8 760 heures, et pas une de plus', () => {
  assert.equal(JOURS_PAR_AN, 365);
  assert.equal(JOURS_PAR_AN * HEURES_PAR_JOUR, 8760);
  assert.equal(JOURS_PAR_MOIS.length, 12);
  assert.equal(consommationHoraire(5000).heures.length, 8760);
  assert.equal(prod().heures.length, 8760);
});

test('LA CONSOMMATION HORAIRE RETOMBE EXACTEMENT SUR L’ANNUELLE', () => {
  // Sans cette normalisation, les poids des profils seraient pris pour des
  // kilowattheures et tout le bilan serait faux d'un facteur arbitraire.
  for (const usage of Object.keys(PROFILS)) {
    for (const annuelle of [1200, 5000, 48000]) {
      const c = consommationHoraire(annuelle, usage);
      assert.ok(Math.abs(somme(c.heures) - annuelle) < 0.01,
        `${usage} ${annuelle} : ${somme(c.heures)}`);
    }
  }
});

test('LA PRODUCTION RETOMBE SUR LE RÉFÉRENTIEL, MOIS PAR MOIS', () => {
  // Une géométrie solaire seule surestimait mai et sous-estimait décembre :
  // le total annuel tombait juste et chaque mois était faux, ce qui est la
  // pire des situations — l'erreur ne se voit nulle part.
  const ref = productionMensuelle(9000, 'tunis');
  const p = productionHoraire(ref, hauteur);
  let debut = 0;
  for (let mois = 0; mois < 12; mois++) {
    const fin = debut + JOURS_PAR_MOIS[mois] * HEURES_PAR_JOUR;
    const total = somme(p.heures.slice(debut, fin));
    assert.ok(Math.abs(total - ref[mois]) < 0.5,
      `${MOIS[mois]} : ${total.toFixed(1)} au lieu de ${ref[mois]}`);
    debut = fin;
  }
});

test('LE SOLEIL NE PRODUIT PAS LA NUIT', () => {
  const p = prod();
  // Minuit, en janvier comme en juillet.
  for (const jour of [0, 180]) {
    assert.equal(p.heures[jour * 24 + 0], 0, 'production à minuit');
    assert.equal(p.heures[jour * 24 + 2], 0, 'production à 2 h');
    assert.equal(p.heures[jour * 24 + 23], 0, 'production à 23 h');
  }
});

test('la journée de production culmine à midi et dure plus longtemps en été', () => {
  const p = prod();
  const journee = (jourDeLAn) => p.heures.slice(jourDeLAn * 24, jourDeLAn * 24 + 24);
  const juin = journee(166);
  const decembre = journee(350);
  assert.equal(juin.indexOf(Math.max(...juin)), 12, 'le pic de juin n’est pas à midi');
  assert.ok(juin.filter((v) => v > 0).length > decembre.filter((v) => v > 0).length,
    'la journée de juin doit être plus longue que celle de décembre');
  assert.ok(Math.max(...juin) > Math.max(...decembre));
});

test('UN COMMERCE AUTOCONSOMME PLUS QU’UNE MAISON, À TOUT ÉGAL PAR AILLEURS', () => {
  // C'est la raison d'être de ce moteur. Deux bâtiments de même consommation
  // annuelle et de même installation n'ont pas la même rentabilité, et aucune
  // abaque ne sait les distinguer.
  const p = prod(6000);
  const maison = bilan({ production: p, consommation: consommationHoraire(6000, 'maison') });
  const commerce = bilan({ production: p, consommation: consommationHoraire(6000, 'commerce') });
  assert.ok(commerce.tauxAutoconsommation > maison.tauxAutoconsommation + 0.08,
    `commerce ${commerce.tauxAutoconsommation} contre maison ${maison.tauxAutoconsommation}`);
  assert.ok(commerce.achetee < maison.achetee, 'le commerce achète moins au réseau');
});

test('L’ÉNERGIE SE CONSERVE : RIEN NE SE PERD, RIEN NE S’INVENTE', () => {
  const p = prod(9000);
  const c = consommationHoraire(5000, 'maison');
  for (const bat of [null, batterie({ capaciteKwh: 10 })]) {
    const b = bilan({ production: p, consommation: c, batterie: bat });
    // Tout ce qui est produit est soit consommé sur place, soit stocké, soit injecté.
    const sorties = b.directe + b.versBatterie + b.injectee;
    assert.ok(Math.abs(sorties - b.productionTotale) < 0.5,
      `production ${b.productionTotale} ≠ ${sorties}`);
    // Tout ce qui est consommé vient du solaire, de la batterie ou du réseau.
    const entrees = b.directe + b.depuisBatterie + b.achetee;
    assert.ok(Math.abs(entrees - b.consommationTotale) < 0.5,
      `consommation ${b.consommationTotale} ≠ ${entrees}`);
    for (const v of [b.directe, b.injectee, b.achetee, b.versBatterie, b.depuisBatterie]) {
      assert.ok(v >= 0, 'aucun flux ne peut être négatif');
    }
  }
});

test('UNE BATTERIE NE REND JAMAIS PLUS QU’ELLE N’A REÇU', () => {
  // Le rendement se paie. Un bilan qui l'oublierait créerait de l'énergie.
  const b = bilan({
    production: prod(9000),
    consommation: consommationHoraire(5000, 'maison'),
    batterie: batterie({ capaciteKwh: 10, rendement: 0.9 }),
  });
  assert.ok(b.depuisBatterie < b.versBatterie, 'la batterie rend plus qu’elle ne reçoit');
  const pertes = b.versBatterie - b.depuisBatterie;
  assert.ok(pertes > 0 && pertes < b.versBatterie * 0.25, `pertes invraisemblables : ${pertes}`);
});

test('la batterie ne dépasse ni sa capacité utile ni sa puissance', () => {
  const bat = batterie({ capaciteKwh: 10, puissanceKw: 3, profondeur: 0.9 });
  assert.equal(bat.utileKwh, 9, 'la profondeur de décharge doit s’appliquer');
  const b = bilan({ production: prod(20000), consommation: consommationHoraire(5000, 'maison'),
    batterie: bat });
  // En une année, on ne peut pas stocker plus que la puissance × heures de jour.
  assert.ok(b.versBatterie <= bat.puissanceKw * 8760);
  // Une capacité utile de 9 kWh ne peut pas rendre plus de 9 kWh par cycle.
  assert.ok(b.depuisBatterie / Math.max(1, b.cyclesParAn) <= bat.utileKwh * 1.01);
});

test('SANS CAPACITÉ, IL N’Y A PAS DE BATTERIE — PAS UNE BATTERIE VIDE', () => {
  // `Number(null)` vaut zéro : une batterie « de zéro kWh » passerait pour
  // configurée et fausserait les compteurs sans rien changer aux flux.
  for (const rien of [{}, { capaciteKwh: 0 }, { capaciteKwh: null }, { capaciteKwh: -5 },
    { capaciteKwh: 'dix' }]) {
    assert.equal(batterie(rien), null, `${JSON.stringify(rien)} accepté à tort`);
  }
  const sans = bilan({ production: prod(), consommation: consommationHoraire(5000) });
  assert.equal(sans.avecBatterie, false);
  assert.equal(sans.versBatterie, 0);
  assert.equal(sans.cyclesParAn, 0);
});

test('sans puissance déclarée, la batterie se charge en deux heures au mieux', () => {
  // Supposer une charge en une heure flatterait le résultat.
  assert.equal(batterie({ capaciteKwh: 10 }).puissanceKw, 5);
  assert.equal(batterie({ capaciteKwh: 10, puissanceKw: 3 }).puissanceKw, 3);
  // Les bornes protègent d'une saisie absurde.
  assert.ok(batterie({ capaciteKwh: 10, rendement: 5 }).rendement <= 1);
  assert.ok(batterie({ capaciteKwh: 10, rendement: 0.1 }).rendement >= 0.5);
  assert.ok(batterie({ capaciteKwh: 10, profondeur: 0 }).profondeur >= 0.2);
  assert.equal(BATTERIE_DEFAUT.capaciteKwh, 0, 'aucune batterie par défaut');
});

test('UNE BATTERIE AIDE UNE MAISON PLUS QU’UN COMMERCE', () => {
  // La maison a du surplus l'après-midi et un pic le soir : c'est exactement
  // ce qu'une batterie sait déplacer. Le commerce consomme déjà au bon moment.
  const p = prod(6000);
  const gain = (usage) => {
    const c = consommationHoraire(6000, usage);
    return apportBatterie(
      bilan({ production: p, consommation: c }),
      bilan({ production: p, consommation: c, batterie: batterie({ capaciteKwh: 10 }) }),
    ).pointsGagnes;
  };
  assert.ok(gain('maison') > gain('commerce'),
    `maison ${gain('maison')} devrait dépasser commerce ${gain('commerce')}`);
  assert.ok(gain('maison') > 5, 'un gain inférieur à cinq points serait suspect');
});

test('AUTOCONSOMMATION ET AUTOPRODUCTION NE SONT PAS LE MÊME CHIFFRE', () => {
  // Les brochures les confondent. Sur une petite installation, ils diffèrent
  // du simple au triple, et c'est le second qui intéresse le client.
  const b = bilan({ production: prod(2000), consommation: consommationHoraire(8000, 'maison') });
  assert.ok(b.tauxAutoconsommation > b.tauxAutoproduction * 2,
    `${b.tauxAutoconsommation} contre ${b.tauxAutoproduction}`);
  for (const t of [b.tauxAutoconsommation, b.tauxAutoproduction]) {
    assert.ok(t >= 0 && t <= 1, `taux hors bornes : ${t}`);
  }
});

test('CAS EXTRÊMES : ZÉRO, UN SEUL MODULE, MILLE MODULES', () => {
  // Une installation minuscule est presque entièrement autoconsommée ; une
  // installation démesurée injecte presque tout. Entre les deux, le modèle
  // doit rester monotone.
  const c = consommationHoraire(5000, 'maison');
  const minuscule = bilan({ production: prod(300), consommation: c });
  const enorme = bilan({ production: prod(200000), consommation: c });
  assert.ok(minuscule.tauxAutoconsommation > 0.9, 'une installation minuscule s’autoconsomme');
  assert.ok(enorme.tauxAutoconsommation < 0.05, 'une installation démesurée injecte');
  assert.ok(enorme.injectee > enorme.autoconsommee * 10);

  let precedent = 1;
  for (const kwh of [500, 2000, 5000, 10000, 30000]) {
    const t = bilan({ production: prod(kwh), consommation: c }).tauxAutoconsommation;
    assert.ok(t <= precedent + 1e-9, `le taux remonte à ${kwh} kWh`);
    precedent = t;
  }
});

test('un bilan impossible dit pourquoi, il ne rend pas des zéros', () => {
  for (const cas of [{}, { production: null, consommation: null },
    { production: { heures: [1, 2] }, consommation: { heures: [1] } },
    { production: { heures: [] }, consommation: { heures: [] } }]) {
    const b = bilan(cas);
    assert.equal(b.exploitable, false);
    assert.ok(b.raison.length > 20, 'un refus sans explication ne sert à rien');
  }
  assert.equal(consommationHoraire(0), null);
  assert.equal(consommationHoraire(null), null);
  assert.equal(productionHoraire([1, 2, 3], hauteur), null, 'il faut douze mois');
  assert.equal(productionHoraire(productionMensuelle(9000, 'tunis'), null), null);
});

test('UN RÉSULTAT SUR PROFIL TYPE NE SE FAIT PAS PASSER POUR UNE MESURE', () => {
  const b = bilan({ production: prod(), consommation: consommationHoraire(5000, 'maison') });
  assert.equal(b.mesure, false);
  assert.match(b.reserve, /TYPE/);
  assert.match(b.reserve, /Importez votre courbe/);
  // Et la production, elle, n'est jamais une mesure : c'est une année type.
  assert.equal(prod().mesure, false);
  assert.equal(consommationHoraire(5000).mesure, false);
});

test('UNE COURBE DE CHARGE IMPORTÉE FAIT BASCULER LA RÉSERVE', () => {
  // Le moteur ne change pas d'une ligne : seule la source des données change.
  const jour = Array.from({ length: 24 }, (_, h) => (h >= 8 && h < 18 ? 2 : 0.5));
  const importee = consommationImportee(jour);
  assert.equal(importee.mesure, true);
  assert.equal(importee.heures.length, 8760);
  assert.match(importee.source, /fournie/);

  const b = bilan({ production: prod(), consommation: importee });
  assert.match(b.reserve, /votre courbe de charge réelle/);
  assert.doesNotMatch(b.reserve, /Importez/);
});

test('un import accepte une journée, une semaine ou une année — et rien d’autre', () => {
  for (const n of [24, 168, 8760]) {
    const r = consommationImportee(Array.from({ length: n }, () => 1));
    assert.ok(r.heures, `${n} valeurs refusées à tort`);
    assert.equal(somme(r.heures), 8760, 'le motif doit couvrir l’année');
  }
  for (const n of [0, 1, 23, 100, 365, 8759]) {
    const r = consommationImportee(Array.from({ length: n }, () => 1));
    assert.ok(r.erreur, `${n} valeurs acceptées à tort`);
  }
});

test('UN IMPORT MAL FORMÉ EST REFUSÉ AVEC SA CAUSE PROBABLE', () => {
  // Le séparateur décimal est la première cause d'échec d'un import en
  // Tunisie : les tableurs francophones écrivent « 1,5 ».
  const avecVirgule = consommationImportee(Array.from({ length: 24 }, () => '1,5'));
  assert.ok(avecVirgule.erreur);
  assert.match(avecVirgule.erreur, /séparateur décimal/);

  const negatif = consommationImportee(Array.from({ length: 24 }, (_, i) => (i ? 1 : -3)));
  assert.match(negatif.erreur, /négative/);
  assert.ok(consommationImportee(null).erreur);
  assert.ok(consommationImportee([]).erreur);
});

test('l’unité de l’import est respectée', () => {
  const enWatts = consommationImportee(Array.from({ length: 24 }, () => 1000), { unite: 'W' });
  assert.ok(Math.abs(somme(enWatts.heures) - 8760) < 0.01, 'mille watts font un kilowatt');
});

test('chaque profil couvre les vingt-quatre heures et porte une explication', () => {
  for (const [id, p] of Object.entries(PROFILS)) {
    assert.equal(p.id, id);
    assert.ok(p.aide.length > 25, `${id} sans explication`);
    for (const saison of ['hiver', 'ete']) {
      assert.equal(p[saison].length, 24, `${id}/${saison}`);
      assert.ok(p[saison].every((v) => v > 0), `${id}/${saison} : une heure à zéro`);
      assert.ok(p[saison].every((v) => v <= 100), `${id}/${saison} : un poids dépasse 100`);
    }
    // Le maximum vaut 100 sur AU MOINS une saison : c'est la référence
    // commune. Exiger 100 sur les deux effacerait l'amplitude saisonnière —
    // une exploitation agricole irrigue l'été et pas l'hiver, et ce creux
    // porte une vraie information.
    assert.equal(Math.max(...p.hiver, ...p.ete), 100, `${id} : aucune saison à 100`);
    // L'été déplace le pic : sans cette différence, la climatisation
    // tunisienne serait ignorée, et c'est elle qui décide de la rentabilité.
    assert.notDeepEqual(p.hiver, p.ete, `${id} : été et hiver identiques`);
    // Et en Tunisie, l'été consomme davantage — climatisation, irrigation,
    // pompage. Un profil dont l'hiver dépasserait l'été serait à revoir.
    const cumul = (t) => t.reduce((a, b) => a + b, 0);
    assert.ok(cumul(p.ete) >= cumul(p.hiver), `${id} : l’hiver consomme plus que l’été`);
  }
  assert.equal(profil('inconnu').id, 'maison', 'un usage inconnu retombe sur le cas courant');
  assert.equal(MOIS_ETE.length, 6);
});

test('les profils couvrent les types de bâtiment du projet', () => {
  // Un type déclaré ailleurs et absent ici retomberait silencieusement sur
  // « maison », et l'atelier serait étudié comme un logement.
  for (const t of TYPES) {
    assert.ok(PROFILS[t.id] || t.id === 'villa', `aucun profil horaire pour « ${t.id} »`);
  }
});

test('la répartition mensuelle du bilan se recoupe avec les totaux', () => {
  const b = bilan({ production: prod(9000), consommation: consommationHoraire(5000, 'maison'),
    batterie: batterie({ capaciteKwh: 8 }) });
  assert.equal(b.parMois.length, 12);
  const cumul = (cle) => b.parMois.reduce((t, m) => t + m[cle], 0);
  assert.ok(Math.abs(cumul('production') - b.productionTotale) < 0.5);
  assert.ok(Math.abs(cumul('consommation') - b.consommationTotale) < 0.5);
  assert.ok(Math.abs(cumul('injectee') - b.injectee) < 0.5);
  assert.ok(Math.abs(cumul('achetee') - b.achetee) < 0.5);
  // L'été produit plus que l'hiver, et l'écart se voit.
  assert.ok(b.parMois[6].production > b.parMois[0].production * 1.5);
});

test('apportBatterie refuse de comparer ce qui n’est pas comparable', () => {
  assert.equal(apportBatterie(null, null), null);
  assert.equal(apportBatterie({ exploitable: false }, { exploitable: true }), null);
});
