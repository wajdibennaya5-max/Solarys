/**
 * SOLAR COPILOT — un assistant qui lit le projet ouvert, et rien d'autre.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ CE QU'IL EST : un moteur de réponses DÉTERMINISTE. Chaque phrase qu'il│
 * │ produit est construite à partir des valeurs réellement présentes dans │
 * │ la simulation en cours. Il ne dispose d'aucune connaissance propre et │
 * │ n'invente aucun chiffre : quand une donnée manque, il le dit et       │
 * │ indique où la saisir.                                                 │
 * │                                                                       │
 * │ CE QU'IL N'EST PAS : un modèle de langage. Ce site est statique et    │
 * │ n'a pas de serveur : y placer une clé d'API la rendrait lisible par   │
 * │ n'importe quel visiteur en trois secondes. Une version adossée à un   │
 * │ modèle devra passer par le serveur, qui seul peut garder la clé. Le   │
 * │ contrat de ce fichier — répondre sur les données du projet, et sur    │
 * │ elles seules — resterait le même.                                     │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Deux modes, parce que ce ne sont pas les mêmes lecteurs : le client veut
 * comprendre sa facture, l'installateur veut vérifier un dimensionnement.
 */
import { formaterRond } from './prix.js';
import { formater as formaterCo2, enArbres } from './co2.js';
import { typeBatiment } from './batiment.js';
import { HYPOTHESES } from './etude.js';

export const MODES = [
  { id: 'client', nom: 'Simple', resume: 'Expliqué sans jargon' },
  { id: 'expert', nom: 'Technique', resume: 'Chiffres et méthodes' },
];

const nb = (v, d = 0) => Number(v).toLocaleString('fr-FR',
  { minimumFractionDigits: d, maximumFractionDigits: d });
const kwc = (v) => `${String(v).replace('.', ',')} kWc`;

/** Sans accents ni ponctuation : « Pourquoi 12 kWc ? » et « pourquoi 12kwc » se rejoignent. */
function normaliser(texte) {
  return String(texte ?? '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Une réponse qui manque de données le dit, et dit où les saisir. */
const sansDonnee = (quoi, ou) => ({
  texte: `Je n’ai pas cette information dans le projet ouvert : ${quoi}. `
    + `Elle se saisit ${ou}. Je ne peux pas y répondre en l’inventant.`,
  sources: [],
  manque: [quoi],
});

/**
 * LES INTENTIONS RECONNUES.
 *
 * Chacune porte ses mots-clés, un exemple de question, et une fonction qui
 * construit la réponse À PARTIR DE LA SIMULATION. Aucune n'a de texte tout
 * fait : si la simulation change, la réponse change.
 */
export const INTENTIONS = [
  {
    id: 'puissance',
    exemple: 'Pourquoi recommandez-vous cette puissance ?',
    motsCles: ['pourquoi', 'puissance', 'kwc', 'recommand', 'dimensionn', 'taille',
      'combien de kilowatt'],
    repondre(sim, mode) {
      const e = sim.resultats;
      const t = sim.tracabilite.find((x) => x.cle === 'puissance');
      if (mode === 'expert') {
        return {
          texte: `${kwc(e.puissance)}, soit ${e.modules} modules de ${e.moduleWc} Wc `
            + `(${kwc(e.puissanceInstallee)} réellement posés).\n\n`
            + `Méthode : ${t.methode}.\n\n`
            + t.parametres.map(([k, v]) => `· ${k} : ${v}`).join('\n'),
          sources: ['tracabilite.puissance'],
          manque: [],
        };
      }
      const bride = Number(sim.entrees.surfaceDisponible) > 0
        && e.puissance * HYPOTHESES.surfaceParKwc >= Number(sim.entrees.surfaceDisponible) * 0.98;
      return {
        texte: `${kwc(e.puissance)}, c’est ce qu’il faut pour produire à peu près `
          + `ce que vous consommez : ${nb(e.consommation)} kWh par an. À `
          + `${sim.lieu}, un kilowatt installé produit environ ${e.productible} kWh `
          + `par an${e.facteurOrientation < 1
            ? `, moins ${Math.round((1 - e.facteurOrientation) * 100)} % à cause de `
              + 'l’orientation de votre toit' : ''}.`
          + (bride ? '\n\nC’est aussi le maximum que votre toiture peut porter : '
            + 'la puissance a été ramenée à ce qui tient dessus.' : ''),
        sources: ['tracabilite.puissance'],
        manque: [],
      };
    },
  },
  {
    id: 'limite',
    exemple: 'Qu’est-ce qui limite le nombre de panneaux ?',
    motsCles: ['limite', 'limitant', 'contrainte', 'pourquoi pas plus', 'plus de panneau',
      'plus de module', 'empeche', 'bloque', 'maximum'],
    repondre(sim) {
      const e = sim.resultats;
      const surface = Number(sim.entrees.surfaceDisponible) || 0;
      const raisons = [];
      if (surface > 0) {
        const max = surface / HYPOTHESES.surfaceParKwc;
        const bride = e.puissance >= max - 0.5;
        raisons.push(`La toiture : ${nb(surface)} m² à ${HYPOTHESES.surfaceParKwc} m² `
          + `par kWc, soit ${max.toFixed(1).replace('.', ',')} kWc au plus. `
          + (bride ? 'C’est la contrainte qui joue aujourd’hui.'
            : 'Elle ne bride pas le projet actuel.'));
      } else {
        raisons.push('Aucune contrainte de toiture n’est appliquée : les cotes du '
          + 'pan n’ont pas été communiquées. C’est la première chose à ajouter.');
      }
      raisons.push(`Votre consommation : ${nb(e.consommation)} kWh par an. Au-delà de `
        + 'ce que vous consommez dans la journée, chaque kilowatt supplémentaire ne '
        + `rapporte plus que le prix de rachat, soit ${
          Math.round(HYPOTHESES.valeurSurplus * 100)} % du prix d’achat.`);
      const dim = sim.dimensionnement;
      if (dim && !dim.incomplet) {
        raisons.push(`L’onduleur : ${dim.onduleur.nom}, ${dim.onduleur.mppt} MPPT, `
          + `chaînes de ${dim.bornes.min} à ${dim.bornes.max} modules pour rester `
          + 'dans ses limites de tension.');
      }
      const refus = (dim?.controles ?? []).filter((c) => c.verdict === 'hors');
      if (refus.length) {
        raisons.push(`Un contrôle électrique refuse la configuration actuelle : `
          + `${refus[0].nom.toLowerCase()} — ${refus[0].mesure} pour ${refus[0].limite}.`);
      }
      return { texte: `Trois choses limitent le nombre de modules, dans cet ordre :\n\n`
        + raisons.map((r, i) => `${i + 1}. ${r}`).join('\n\n'),
      sources: ['entrees.surfaceDisponible', 'resultats', 'dimensionnement'], manque: [] };
    },
  },
  {
    id: 'scenarios',
    exemple: 'Compare les scénarios.',
    motsCles: ['scenario', 'compare', 'comparer', 'difference', 'essentiel', 'maximum',
      'lequel choisir', 'meilleur'],
    repondre(sim, mode) {
      if (!sim.scenarios?.length) {
        return sansDonnee('les scénarios n’ont pas pu être calculés',
          'en complétant la consommation et la localisation');
      }
      const lignes = sim.scenarios.map((s) => {
        const e = s.etude;
        return mode === 'expert'
          ? `${s.nom} — ${kwc(s.puissance)} : ${nb(e.production)} kWh/an, `
            + `couverture ${Math.round(e.ratio * 100)} %, autoconsommation `
            + `${Math.round(e.tauxAutoconsommation * 100)} %, coût ${formaterRond(e.cout)}, `
            + `retour ${e.retour ? e.retour.toFixed(1).replace('.', ',') + ' ans' : '> 25 ans'}, `
            + `gain net ${formaterRond(e.gainNet)}`
          : `${s.nom} — ${kwc(s.puissance)} : ${formaterRond(e.cout)} à l’achat, `
            + `${formaterRond(e.economieMensuelle)} d’économie par mois, remboursé en `
            + `${e.retour ? e.retour.toFixed(1).replace('.', ',') + ' ans' : 'plus de 25 ans'}`;
      });
      return {
        texte: `Trois tailles sur le même toit, mêmes hypothèses :\n\n`
          + lignes.map((l) => `· ${l}`).join('\n\n')
          + '\n\nLe plus petit se rembourse le plus vite ; le plus grand rapporte le '
          + 'plus sur vingt-cinq ans. Aucun n’est meilleur dans l’absolu : cela dépend '
          + 'de ce que vous cherchez.',
        sources: ['scenarios'], manque: [],
      };
    },
  },
  {
    id: 'manque',
    exemple: 'Quelle donnée manque ?',
    motsCles: ['manque', 'manquant', 'incomplet', 'ajouter', 'ameliorer la precision',
      'plus precis', 'que dois je'],
    repondre(sim) {
      const monter = sim.niveau?.pourMonter ?? [];
      const alertes = (sim.avertissements ?? [])
        .filter((a) => a.gravite !== 'information');
      if (!monter.length && !alertes.length) {
        return {
          texte: `Rien de bloquant. L’étude est au niveau « ${
            sim.niveau?.niveau?.nom ?? '—'} », avec une confiance des données de `
            + `${sim.confiance?.note ?? '—'} sur 100. Ce qui reste incertain, ce sont `
            + 'les hypothèses de calcul — coût au kWc, hausse du tarif — et non vos '
            + 'données.',
          sources: ['niveau', 'confiance'], manque: [],
        };
      }
      const bouts = [];
      if (monter.length) {
        bouts.push(`Pour passer au niveau « ${sim.niveau.suivant.nom} », il manque : `
          + `${monter.map((m) => m.nom.toLowerCase()).join(', ')}.`);
      }
      for (const a of alertes.slice(0, 3)) {
        bouts.push(`${a.probleme}. ${a.action}`);
      }
      return { texte: bouts.join('\n\n'), sources: ['niveau', 'avertissements'],
        manque: monter.map((m) => m.cle) };
    },
  },
  {
    id: 'simple',
    exemple: 'Explique-moi ce résultat simplement.',
    motsCles: ['explique', 'simplement', 'resume', 'comprendre', 'en bref', 'c est quoi'],
    repondre(sim, mode) {
      const e = sim.resultats;
      const bat = typeBatiment(e.batiment);
      if (mode === 'expert') {
        return {
          texte: `${kwc(e.puissance)} · ${e.modules} modules · ${e.surface} m²\n`
            + `Production ${nb(e.production)} kWh/an (${e.productible} kWh/kWc × `
            + `${e.facteurOrientation.toFixed(2).replace('.', ',')})\n`
            + `Autoconsommation ${Math.round(e.tauxAutoconsommation * 100)} % — `
            + `${nb(e.autoconsomme)} kWh sur place, ${nb(e.surplus)} kWh injectés\n`
            + `Prix du kWh ${e.prixKwh.toFixed(3).replace('.', ',')} DT · `
            + `coût ${formaterRond(e.cout)} · économie an 1 ${formaterRond(e.economieAnnuelle)}\n`
            + `Retour ${e.retour ? e.retour.toFixed(1).replace('.', ',') + ' ans' : '> 25 ans'} · `
            + `gain net 25 ans ${formaterRond(e.gainNet)}\n`
            + `Niveau ${sim.niveau?.niveau?.rang ?? '?'}/3 · confiance ${
              sim.confiance?.note ?? '?'}/100 · moteur v${sim.version}`,
          sources: ['resultats'], manque: [],
        };
      }
      return {
        texte: `Sur votre ${bat ? bat.nom.toLowerCase() : 'bâtiment'} à ${sim.lieu}, `
          + `${e.modules} panneaux sur environ ${e.surface} m² produiraient `
          + `${nb(e.production)} kWh par an — soit ${Math.round(e.ratio * 100)} % de `
          + `ce que vous consommez.\n\n`
          + `Cela vous ferait économiser environ ${formaterRond(e.economieMensuelle)} `
          + `par mois. L’installation coûterait ${formaterRond(e.cout)} et serait `
          + `remboursée en ${e.retour ? e.retour.toFixed(1).replace('.', ',') + ' ans'
            : 'plus de vingt-cinq ans'}.\n\n`
          + `Tout cela repose sur ce que vous avez saisi et sur des hypothèses de `
          + `marché : ce n’est pas un devis.`,
        sources: ['resultats'], manque: [],
      };
    },
  },
  {
    id: 'economie',
    exemple: 'Combien vais-je économiser, et en combien de temps ?',
    motsCles: ['economie', 'economiser', 'rentab', 'retour', 'amorti', 'rembours',
      'gagne', 'gain', 'facture'],
    repondre(sim, mode) {
      const e = sim.resultats;
      const t = sim.tracabilite.find((x) => x.cle === 'economieAnnuelle');
      const base = `${formaterRond(e.economieAnnuelle)} la première année, soit `
        + `${formaterRond(e.economieMensuelle)} par mois. Sur vingt-cinq ans, `
        + `${formaterRond(e.economieTotale)} d’économies cumulées pour `
        + `${formaterRond(e.cout)} investis, soit ${formaterRond(e.gainNet)} de gain net.`;
      if (mode === 'expert') {
        return { texte: `${base}\n\nMéthode : ${t.methode}.\n\n`
          + t.parametres.map(([k, v]) => `· ${k} : ${v}`).join('\n')
          + `\n\nEntretien déduit : ${formaterRond(e.entretienAnnuel)} par an, indexé.`,
        sources: ['tracabilite.economieAnnuelle'], manque: [] };
      }
      return { texte: `${base}\n\nCe chiffre monte avec le temps : l’électricité `
        + `renchérit d’environ ${Math.round(HYPOTHESES.hausseElectricite * 100)} % par `
        + `an dans l’hypothèse retenue, donc ce que vous ne payez plus vaut de plus en `
        + `plus cher.`,
      sources: ['resultats'], manque: [] };
    },
  },
  {
    id: 'production',
    exemple: 'Combien vais-je produire ?',
    motsCles: ['produ', 'kwh', 'genere', 'hiver', 'ete', 'mois', 'saison', 'couvre',
      'couverture'],
    repondre(sim) {
      const e = sim.resultats;
      const m = e.mensuel;
      if (!m) return sansDonnee('la production mensuelle', 'en complétant la localisation');
      const maxi = Math.max(...m); const mini = Math.min(...m);
      const conso = sim.mensuelConsommation;
      const couverts = conso ? m.filter((p, i) => p >= conso[i]).length : null;
      return {
        texte: `${nb(e.production)} kWh par an, soit ${Math.round(e.ratio * 100)} % de `
          + `votre consommation.\n\nLe mois le plus plein produit ${nb(maxi)} kWh, le `
          + `plus creux ${nb(mini)} kWh — l’hiver tunisien reste largement utile.`
          + (couverts !== null
            ? `\n\nVotre production dépasse votre consommation ${couverts} mois sur 12. `
              + (couverts === 12 ? 'Le surplus part sur le réseau toute l’année.'
                : 'Les autres mois, la STEG complète.') : ''),
        sources: ['resultats.mensuel', 'mensuelConsommation'], manque: [],
      };
    },
  },
  {
    id: 'hypotheses',
    exemple: 'Sur quelles hypothèses reposent ces chiffres ?',
    motsCles: ['hypothese', 'suppose', 'base', 'fiable', 'confiance', 'sur quoi',
      'd ou vient', 'source', 'certain', 'garanti'],
    repondre(sim) {
      const aVerifier = sim.hypotheses.filter((h) => !h.verifiee);
      return {
        texte: `${sim.hypotheses.length} hypothèses entrent dans ce calcul, dont `
          + `${aVerifier.length} qui n’ont pas été relues sur un document officiel :\n\n`
          + aVerifier.map((h) => `· ${h.nom} : ${
            typeof h.valeur === 'number' ? nb(h.valeur, 3) : h.valeur}`
            + `${h.unite ? ' ' + h.unite : ''} — ${h.source}`).join('\n')
          + `\n\nConfiance des données : ${sim.confiance.note}/100. ${sim.confiance.phrase}`
          + `\n\nMoteur de calcul v${sim.version}. Le détail complet est dans le `
          + 'panneau « D’où vient chaque chiffre » de l’étude.',
        sources: ['hypotheses', 'confiance'], manque: [],
      };
    },
  },
  {
    id: 'electrique',
    exemple: 'Comment sont câblées les chaînes ?',
    motsCles: ['onduleur', 'string', 'chaine', 'mppt', 'tension', 'courant', 'volt',
      'ampere', 'electrique', 'cablage', 'dc', 'ac'],
    repondre(sim) {
      const d = sim.dimensionnement;
      if (!d) return sansDonnee('le dimensionnement électrique',
        'en choisissant un module à l’étape Installation');
      if (d.incomplet) {
        return { texte: `Aucun contrôle électrique n’a pu être fait : `
          + `${d.manquants.join(', ')} ${d.manquants.length > 1 ? 'manquent' : 'manque'} `
          + 'aux fiches du catalogue. Je ne déclare pas conforme ce que je n’ai pas pu '
          + 'vérifier.',
        sources: ['dimensionnement'], manque: d.manquants };
      }
      const ennuis = d.controles.filter((c) => c.verdict !== 'conforme');
      return {
        texte: `${d.chaines} chaîne${d.chaines > 1 ? 's' : ''} de ${d.longueur} modules `
          + `sur un ${d.onduleur.nom} (${d.onduleur.mppt} MPPT).\n\n`
          + `· Puissance DC ${nb(d.puissanceDc, 2)} kWc pour ${nb(d.puissanceAc)} kW AC, `
          + `rapport ${nb(d.ratio, 2)}\n`
          + `· Tension à vide à 0 °C : ${nb(d.vocChaine)} V pour ${nb(d.onduleur.vMax)} V max\n`
          + `· Tension MPP à 70 °C : ${nb(d.vmpChaineChaud)} V, plage MPPT à partir de `
          + `${nb(d.onduleur.vMpptMin)} V\n`
          + `· Courant ${nb(d.courantFonctionnement, 1)} A pour `
          + `${nb(d.onduleur.iMpptMax, 1)} A max\n\n`
          + (ennuis.length
            ? `${ennuis.length} point${ennuis.length > 1 ? 's' : ''} à regarder : `
              + ennuis.map((c) => `${c.nom.toLowerCase()} (${c.mesure} / ${c.limite})`).join(' ; ')
            : 'Tous les contrôles passent.'),
        sources: ['dimensionnement'], manque: [],
      };
    },
  },
  {
    id: 'ombrage',
    exemple: 'Et les ombres sur mon toit ?',
    motsCles: ['ombre', 'ombrage', 'arbre', 'masque', 'voisin', 'cheminee'],
    repondre() {
      return {
        texte: 'Aucune analyse d’ombrage n’est faite : le projet ne contient aucune '
          + 'donnée d’obstacle, de hauteur ni d’horizon. Tous les chiffres de cette '
          + 'étude supposent donc un toit entièrement dégagé toute la journée.\n\n'
          + 'Un arbre, un mur mitoyen ou une cheminée peuvent coûter plusieurs pour '
          + 'cent de production, et bien davantage s’ils touchent une chaîne entière. '
          + 'C’est l’un des points que la visite technique relève.',
        sources: [], manque: ['obstacles', 'masque d’horizon'],
      };
    },
  },
  {
    id: 'co2',
    exemple: 'Quel est l’impact environnemental ?',
    motsCles: ['co2', 'carbone', 'environnement', 'ecolo', 'planete', 'arbre', 'pollution'],
    repondre(sim) {
      const e = sim.resultats;
      return {
        texte: `${formaterCo2(e.co2Annuel)} de CO₂ évités par an, `
          + `${formaterCo2(e.co2SurDuree)} sur vingt-cinq ans — l’équivalent de ce `
          + `qu’absorbent environ ${enArbres(e.co2Annuel)} arbres chaque année.\n\n`
          + 'Le réseau tunisien fonctionne à plus de 90 % au gaz naturel : chaque '
          + 'kilowattheure solaire évite le gaz correspondant. Le facteur retenu est '
          + 'un ordre de grandeur, pas une mesure certifiée.',
        sources: ['resultats.co2Annuel'], manque: [],
      };
    },
  },
];

/**
 * Répond à une question sur le projet ouvert.
 *
 * @param {string} question
 * @param {object} sim résultat de `simuler()`
 * @param {string} [mode] 'client' ou 'expert'
 * @returns {{intention, texte, sources, manque, comprise}}
 */
export function repondre(question, sim, mode = 'client') {
  const q = normaliser(question);
  if (!q) {
    return { intention: null, comprise: false, sources: [], manque: [],
      texte: 'Posez-moi une question sur cette étude. Quelques exemples ci-dessous.' };
  }

  if (!sim || sim.statut !== 'ok' || !sim.resultats) {
    return {
      intention: null, comprise: false, sources: [], manque: ['simulation'],
      texte: 'Aucune étude n’est calculée pour l’instant. Terminez la simulation, et '
        + 'je pourrai répondre sur vos chiffres — je ne réponds que sur eux.',
    };
  }

  // On note chaque intention sur le nombre et la longueur des mots-clés
  // trouvés : un mot long est plus discriminant qu'un mot court.
  let meilleure = null;
  let meilleurScore = 0;
  for (const intention of INTENTIONS) {
    let score = 0;
    for (const cle of intention.motsCles) {
      if (q.includes(normaliser(cle))) score += cle.length;
    }
    if (score > meilleurScore) { meilleurScore = score; meilleure = intention; }
  }

  if (!meilleure) {
    return {
      intention: null, comprise: false, sources: [], manque: [],
      texte: 'Je n’ai pas compris la question. Je réponds sur ce que contient cette '
        + 'étude — puissance, production, économies, scénarios, données manquantes, '
        + 'dimensionnement électrique, ombrage, CO₂ — et sur rien d’autre.',
      propositions: INTENTIONS.map((i) => i.exemple),
    };
  }

  const r = meilleure.repondre(sim, mode);
  return { intention: meilleure.id, comprise: true, ...r };
}

/**
 * Les questions qui valent la peine d'être posées MAINTENANT.
 *
 * Elles suivent l'état du projet : proposer « quelle donnée manque ? » à un
 * projet complet ferait perdre du temps ; ne pas la proposer à un projet
 * incomplet ferait manquer l'essentiel.
 */
export function suggestions(sim) {
  if (!sim || sim.statut !== 'ok') {
    return ['Explique-moi ce résultat simplement.'];
  }
  const out = [];
  if ((sim.niveau?.pourMonter ?? []).length
    || (sim.avertissements ?? []).some((a) => a.gravite !== 'information')) {
    out.push('Quelle donnée manque ?');
  }
  out.push('Pourquoi recommandez-vous cette puissance ?');
  if (Number(sim.entrees.surfaceDisponible) > 0) {
    out.push('Qu’est-ce qui limite le nombre de panneaux ?');
  }
  if (sim.scenarios?.length > 1) out.push('Compare les scénarios.');
  out.push('Combien vais-je économiser, et en combien de temps ?');
  out.push('Sur quelles hypothèses reposent ces chiffres ?');
  if (sim.dimensionnement && !sim.dimensionnement.incomplet) {
    out.push('Comment sont câblées les chaînes ?');
  }
  return out.slice(0, 6);
}
