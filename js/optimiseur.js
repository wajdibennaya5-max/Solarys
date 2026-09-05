/**
 * SOLAR OPTIMIZER — la meilleure configuration SELON UN OBJECTIF ANNONCÉ.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ LE MOT « OPTIMAL » N'APPARAÎT NULLE PART SANS SON OBJECTIF ET SES     │
 * │ CONTRAINTES. Il n'existe pas de configuration optimale dans l'absolu :│
 * │ la plus rentable est petite, la plus productive est grande, et elles  │
 * │ ne peuvent pas être la même. Chaque recommandation dit donc selon     │
 * │ quel critère elle a été retenue, et sous quelles contraintes.         │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Le moteur explore les puissances possibles et, quand la toiture est
 * connue, les modules du catalogue dans les deux poses. Il ÉCARTE toute
 * configuration refusée par la validation électrique : proposer une
 * installation qui ne peut pas être posée n'est pas une optimisation.
 */
import { etudier, HYPOTHESES, PUISSANCE } from './etude.js';
import { flux, STANDARD } from './finances.js';
import { dimensionner } from './technique.js';
import { MODULES, moduleParId } from './materiel.js';
import { calepiner } from './calepinage.js';

/**
 * Les trois objectifs, et le critère EXACT de chacun.
 *
 * Le critère n'est pas une intention : c'est la grandeur maximisée ou
 * minimisée, écrite pour que le client puisse la contester.
 */
export const OBJECTIFS = [
  {
    id: 'economie',
    nom: 'Économie',
    resume: 'Rembourser le plus vite',
    critere: 'temps de retour actualisé le plus court',
    detail: 'Retient la configuration qui rembourse l’investissement le plus '
      + 'tôt, actualisation comprise. C’est en général la plus petite : au-delà '
      + 'de ce que vous consommez dans la journée, chaque kilowatt rapporte '
      + 'moins vite.',
    // Plus c'est petit, mieux c'est.
    note: (c) => (c.finances.retourActualise === null
      ? -Infinity : -c.finances.retourActualise),
  },
  {
    id: 'equilibre',
    nom: 'Équilibre',
    resume: 'Couvrir l’année, sans excès',
    critere: 'couverture annuelle la plus proche de 100 %, projet remboursé '
      + 'dans la durée d’analyse',
    detail: 'Retient la configuration dont la production annuelle colle au plus '
      + 'près à votre consommation. En dessous, vous continuez d’acheter ; '
      + 'au-dessus, vous revendez au prix de rachat, moitié moindre. Un projet '
      + 'qui ne se rembourse pas dans la durée d’analyse est écarté.',
    // La note pénalise l'écart à la couverture parfaite ; un projet non
    // remboursé est disqualifié plutôt que classé.
    note: (c) => (c.finances.retour === null
      ? -Infinity : -Math.abs(c.etude.ratio - 1)),
  },
  {
    id: 'production',
    nom: 'Production maximale',
    resume: 'Produire le plus possible',
    critere: 'production annuelle la plus élevée, à contraintes respectées',
    detail: 'Retient la configuration qui produit le plus de kilowattheures, '
      + 'sans regarder la rentabilité — mais toujours dans les limites de la '
      + 'toiture et des contrôles électriques.',
    note: (c) => c.etude.production,
  },
];

export const objectif = (id) => OBJECTIFS.find((o) => o.id === id) ?? OBJECTIFS[1];

/**
 * Les contraintes réellement appliquées, nommées.
 *
 * Une recommandation sans ses contraintes ne veut rien dire : « la meilleure »
 * sur quel espace ?
 */
export function contraintesAppliquees(donnees) {
  const surface = Number(donnees.surfaceDisponible) || 0;
  const out = [
    { cle: 'puissance',
      texte: `Puissance comprise entre ${String(PUISSANCE.min).replace('.', ',')} et `
        + `${PUISSANCE.max} kWc, par pas de ${String(PUISSANCE.pas).replace('.', ',')}.` },
    { cle: 'electrique',
      texte: 'Toute configuration refusée par les contrôles électriques est écartée.' },
  ];
  if (surface > 0) {
    out.push({ cle: 'surface',
      texte: `Toiture de ${Math.round(surface)} m², soit au plus `
        + `${(surface / HYPOTHESES.surfaceParKwc).toFixed(1).replace('.', ',')} kWc `
        + `à ${HYPOTHESES.surfaceParKwc} m² par kWc.` });
    out.push({ cle: 'calepinage',
      texte: 'Le nombre de modules est celui qui tient réellement sur le pan, '
        + 'marges de rive et jeux compris.' });
  } else {
    out.push({ cle: 'sans-surface',
      texte: 'Aucune contrainte de toiture : les cotes du pan n’ont pas été '
        + 'communiquées. Les puissances proposées peuvent ne pas tenir sur le toit.' });
  }
  return out;
}

/** Une configuration candidate, entièrement évaluée. */
function evaluer(donnees, puissance, mod, parametresFinanciers) {
  const etude = etudier({ ...donnees, puissance, moduleWc: mod.puissance });
  if (!etude) return null;
  const dim = dimensionner({ puissance, module: mod });
  // Une configuration que l'électricité refuse n'est pas une optimisation.
  if (!dim || (dim.controles ?? []).some((c) => c.verdict === 'hors')) return null;
  const f = flux({
    puissance: etude.puissance, autoconsomme: etude.autoconsomme,
    surplus: etude.surplus, prixKwh: etude.prixKwh,
  }, parametresFinanciers);
  if (!f) return null;
  return { puissance, module: mod, etude, dimensionnement: dim, finances: f };
}

/**
 * Explore les configurations possibles et retient la meilleure pour l'objectif.
 *
 * @param {object} donnees les entrées du calcul
 * @param {object} [options]
 * @param {string} [options.objectif] 'economie' | 'equilibre' | 'production'
 * @param {object} [options.parametresFinanciers]
 * @param {number} [options.combien] configurations à rendre
 * @returns {{objectif, contraintes, configurations, recommandation, phrase}|null}
 */
export function optimiser(donnees, {
  objectif: idObjectif = 'equilibre', parametresFinanciers = STANDARD, combien = 3,
} = {}) {
  if (!donnees) return null;
  const obj = objectif(idObjectif);
  const surface = Number(donnees.surfaceDisponible) || 0;

  // Le plafond vient de la toiture quand elle est connue, sinon de la borne
  // du calcul. On ne propose jamais au-delà.
  const plafond = surface > 0
    ? Math.min(PUISSANCE.max, surface / HYPOTHESES.surfaceParKwc)
    : PUISSANCE.max;

  const candidats = [];
  const vus = new Set();

  for (const mod of MODULES) {
    // TOUTES les puissances jusqu'au plafond, et non les seules qui
    // remplissent le toit : personne n'est obligé de couvrir son pan
    // entièrement, et se limiter aux toitures pleines ramenait les trois
    // objectifs à deux réponses identiques.
    const puissances = [];
    for (let k = PUISSANCE.min; k <= plafond + 1e-9; k += PUISSANCE.pas) {
      puissances.push(Math.round(k * 100) / 100);
    }
    // Et, quand les cotes sont connues, les puissances exactes que le
    // calepinage permet : ce sont celles qu'on peut réellement poser.
    if (donnees.toitL > 0 && donnees.toitP > 0) {
      for (const pose of ['portrait', 'paysage']) {
        const plan = calepiner(donnees.toitL, donnees.toitP, { module: mod, pose });
        if (plan && plan.puissance <= plafond + 1e-9) puissances.push(plan.puissance);
      }
    }
    for (const k of puissances) {
      if (!(k >= PUISSANCE.min) || k > plafond + 1e-9) continue;
      const cle = `${mod.id}:${k}`;
      if (vus.has(cle)) continue;
      vus.add(cle);
      const c = evaluer(donnees, k, mod, parametresFinanciers);
      if (c) candidats.push(c);
    }
  }

  if (!candidats.length) return null;

  const notes = candidats.map((c) => ({ ...c, note: obj.note(c) }))
    .sort((a, b) => b.note - a.note);

  // On propose des configurations DISTINCTES : deux fois la même puissance
  // sous deux noms ne serait pas un choix.
  const retenues = [];
  for (const c of notes) {
    if (retenues.some((r) => Math.abs(r.puissance - c.puissance) < 0.01
      && r.module.id === c.module.id)) continue;
    retenues.push(c);
    if (retenues.length >= combien) break;
  }

  const meilleure = retenues[0];
  return {
    objectif: obj,
    contraintes: contraintesAppliquees(donnees),
    configurations: retenues.map((c, i) => ({
      rang: i + 1,
      lettre: String.fromCharCode(65 + i),
      puissance: c.puissance,
      module: c.module,
      modules: c.etude.modules,
      production: c.etude.production,
      surface: c.etude.surface,
      couverture: c.etude.ratio,
      cout: c.etude.cout,
      economieAnnuelle: c.etude.economieAnnuelle,
      retour: c.finances.retour,
      retourActualise: c.finances.retourActualise,
      van: c.finances.van,
      tri: c.finances.tri,
      lcoe: c.finances.lcoe,
      verdictElectrique: (c.dimensionnement.controles ?? [])
        .some((x) => x.verdict === 'verifier') ? 'verifier' : 'conforme',
    })),
    recommandation: {
      lettre: 'A',
      puissance: meilleure.puissance,
      module: meilleure.module,
      // La phrase dit TOUJOURS selon quoi. « Configuration A recommandée »
      // sans son critère serait une opinion déguisée en résultat.
      phrase: `Configuration A retenue selon l’objectif « ${obj.nom} » — critère : `
        + `${obj.critere} — sous les contraintes listées ci-dessous et avec les `
        + 'hypothèses financières en vigueur. Un autre objectif donnerait une '
        + 'autre réponse.',
    },
    exploré: candidats.length,
  };
}

/**
 * Ce que changerait un autre objectif — pour le dire avant qu'on le demande.
 * @returns {Array<{objectif, puissance, module}>}
 */
export function selonChaqueObjectif(donnees, options = {}) {
  return OBJECTIFS.map((o) => {
    const r = optimiser(donnees, { ...options, objectif: o.id, combien: 1 });
    if (!r) return null;
    return {
      objectif: o,
      puissance: r.recommandation.puissance,
      module: r.recommandation.module,
      configuration: r.configurations[0],
    };
  }).filter(Boolean);
}
