/**
 * LE TABLEAU DE BORD — ce que le client emporte de toute la visite.
 *
 * Tout ce qui précède sert cette page. Elle doit répondre en trois secondes à
 * « quelle installation, combien, en combien de temps », et ensuite seulement
 * laisser fouiller.
 *
 * CE FICHIER NE FAIT QUE DESSINER. Aucun calcul ne s'y trouve : il reçoit une
 * étude déjà faite et la met en forme. C'est la règle qui permet de tester
 * les chiffres sans navigateur, et de refaire l'apparence sans toucher aux
 * chiffres.
 */
import { formater, formaterRond } from './prix.js';
import { formater as formaterCo2, enArbres, VERIFIE as CO2_VERIFIE } from './co2.js';
import { typeBatiment } from './batiment.js';

/**
 * Une valeur qui monte à l'écran.
 * Le texte final est écrit tout de suite : si le script d'animation ne part
 * pas, le chiffre est là quand même.
 */
function compteur(valeur, { decimales = 0, suffixe = '' } = {}) {
  const n = Number(valeur) || 0;
  const ecrit = n.toLocaleString('fr-FR', {
    minimumFractionDigits: decimales, maximumFractionDigits: decimales });
  return `<span data-compte="${n}" data-decimales="${decimales}"
    data-suffixe="${suffixe}">${ecrit}${suffixe}</span>`;
}

/**
 * LA CARTE CENTRALE : la puissance, et rien d'autre autour.
 *
 * C'est la réponse à la question posée en arrivant. Elle se lit sans lunettes
 * et sans contexte.
 */
export function carteCentrale(etude, { titre = 'Puissance recommandée' } = {}) {
  const bat = typeBatiment(etude.batiment);
  return `<div class="socle">
    <p class="socle-sur">${titre}</p>
    <p class="socle-val">${compteur(etude.puissance, { decimales: etude.puissance % 1 ? 2 : 0 })}
      <span class="socle-unite">kWc</span></p>
    <p class="socle-sous">${etude.modules} modules sur environ ${etude.surface} m²${
      bat ? ` — ${bat.nom.toLowerCase()}` : ''}</p>
  </div>`;
}

/** Les cinq chiffres qui font la décision. */
export function grilleKpi(etude) {
  const cellules = [
    {
      icone: 'soleil', libelle: 'Production annuelle',
      valeur: compteur(etude.production), unite: 'kWh',
      note: `${etude.productible} kWh par kWc à votre latitude`,
    },
    {
      icone: 'eclair', libelle: 'Couverture estimée',
      valeur: compteur(Math.round(etude.ratio * 100)), unite: '%',
      note: `de votre consommation annuelle`,
    },
    {
      icone: 'monnaie', libelle: 'Économies estimées', fort: true,
      valeur: compteur(Math.round(etude.economieAnnuelle)), unite: 'DT / an',
      note: `soit ${formaterRond(etude.economieMensuelle)} par mois`,
    },
    {
      icone: 'courbe', libelle: 'Retour estimé',
      valeur: etude.retour ? compteur(etude.retour, { decimales: 1 }) : '> 25',
      unite: 'ans',
      note: etude.retour ? `puis ${formaterRond(etude.gainNet)} de gain net sur 25 ans`
        : 'au-delà de la durée retenue pour l’étude',
    },
    {
      icone: 'feuille', libelle: 'CO₂ évité',
      valeur: compteur(etude.co2Annuel / 1000, { decimales: 1 }), unite: 't / an',
      note: `l’équivalent de ${enArbres(etude.co2Annuel)} arbres${
        CO2_VERIFIE ? '' : ', ordre de grandeur'}`,
    },
  ];

  return `<div class="kpis">${cellules.map((c) => `<div class="kpi${c.fort ? ' fort' : ''}">
    ${ICONES[c.icone] ?? ''}
    <span class="kpi-lib">${c.libelle}</span>
    <span class="kpi-val">${c.valeur} <i>${c.unite}</i></span>
    <span class="kpi-note">${c.note}</span>
  </div>`).join('')}</div>`;
}

/**
 * LE SOLAR SCORE, avec sa confiance et son détail.
 *
 * L'anneau ne sert pas à décorer : il rend la note comparable d'un coup
 * d'œil. Le détail est replié, mais il est là — un score qu'on ne peut pas
 * ouvrir n'est qu'un argument de vente déguisé en mesure.
 */
export function carteScore(score) {
  if (!score) return '';
  const R = 52;
  const circonference = 2 * Math.PI * R;
  const rempli = (score.note / 100) * circonference;

  return `<div class="score ${score.preliminaire ? 'score-preliminaire' : ''}">
    <div class="score-anneau">
      <svg viewBox="0 0 128 128" role="img"
        aria-label="Solar Score : ${score.note} sur 100">
        <circle cx="64" cy="64" r="${R}" fill="none" stroke="var(--grille)" stroke-width="11"/>
        <circle cx="64" cy="64" r="${R}" fill="none" stroke="var(--or)" stroke-width="11"
          stroke-linecap="round" stroke-dasharray="${rempli.toFixed(1)} ${circonference.toFixed(1)}"
          transform="rotate(-90 64 64)"/>
      </svg>
      <div class="score-note"><b>${score.note}</b><span>/ 100</span></div>
    </div>
    <div class="score-texte">
      <p class="score-titre">Solar Score</p>
      <p class="score-phrase">${score.palier.phrase}</p>
      ${score.preliminaire ? `<p class="score-avert">Score préliminaire :
        ${Math.round(score.confiance * 100)} % des critères sont renseignés.</p>` : ''}
      <details class="score-detail">
        <summary>Comment il est calculé</summary>
        <dl>${score.facteurs.map((f) => `<div>
          <dt>${f.nom} <i>(${f.poids} %)</i></dt><dd>${f.note}/100</dd>
          <p>${f.detail}</p></div>`).join('')}
        ${score.manquants.map((m) => `<div class="manque">
          <dt>${m.nom} <i>(${m.poids} %)</i></dt><dd>non renseigné</dd>
          <p>Ce critère est sorti du calcul plutôt que deviné.</p></div>`).join('')}
        </dl>
      </details>
    </div>
  </div>`;
}

/** Le bandeau d'hypothèses, dit une fois pour toutes, en bas et non caché. */
export function avertissement(etude, hypotheses) {
  return `<p class="avert"><b>Cette estimation ne remplace pas une visite.</b>
    Elle ne voit ni l’ombre du bâtiment voisin, ni l’état de votre tableau
    électrique, ni les contraintes de raccordement. Elle retient
    ${formaterRond(hypotheses.coutParKwc)} par kWc installé,
    ${Math.round(hypotheses.hausseElectricite * 100)} % de hausse annuelle de
    l’électricité, ${Math.round(hypotheses.valeurSurplus * 100)} % du prix
    d’achat pour le surplus injecté, sur ${hypotheses.duree} ans. Ce sont des
    ordres de grandeur du marché tunisien, non un devis, et aucun de ces
    résultats n’est garanti.</p>`;
}

/** Le CO₂ dit autrement, pour qui ne lit pas les tonnes. */
export function phraseCo2(etude) {
  const arbres = enArbres(etude.co2Annuel);
  return `${formaterCo2(etude.co2Annuel)} de CO₂ évités chaque année — `
    + `l’équivalent de ce qu’absorbent environ ${arbres} arbres, `
    + `${formaterCo2(etude.co2SurDuree)} sur vingt-cinq ans.`;
}

/** Les icônes du tableau de bord, au trait, sans dépendance. */
export const ICONES = {
  soleil: '<svg class="kpi-ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.6M12 19.4V22M2 12h2.6M19.4 12H22M4.9 4.9l1.9 1.9M17.2 17.2l1.9 1.9M19.1 4.9l-1.9 1.9M6.8 17.2l-1.9 1.9"/></svg>',
  eclair: '<svg class="kpi-ic" viewBox="0 0 24 24"><path d="M13 2 3 14h8l-1 8 10-12h-8l1-8z"/></svg>',
  monnaie: '<svg class="kpi-ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M15 9.2a3 3 0 0 0-3-1.6c-1.7 0-3 .9-3 2.2 0 2.9 6 1.5 6 4.4 0 1.3-1.3 2.2-3 2.2a3 3 0 0 1-3-1.6M12 6v12"/></svg>',
  courbe: '<svg class="kpi-ic" viewBox="0 0 24 24"><path d="M3 17l5.5-6 4 3.5L21 6"/><path d="M15 6h6v6"/></svg>',
  feuille: '<svg class="kpi-ic" viewBox="0 0 24 24"><path d="M20 4C10 4 4 9 4 16c0 2 .6 3.4.6 3.4S9 12 20 10c0 0-3 8-10 9"/><path d="M4 20c0-4 3-7 7-8"/></svg>',
};

/**
 * LE PANNEAU TECHNICIEN — replié par défaut, complet une fois ouvert.
 *
 * Le client veut savoir combien il économise ; l'installateur veut savoir si
 * la chaîne tient la tension un matin de janvier. Deux métiers, deux
 * lectures. Cacher le second derrière un dépli sert les deux : le client
 * n'est pas noyé, le professionnel trouve tout au même endroit.
 */
export function panneauTechnique(dim, verdict) {
  if (!dim) return '';
  const v = { conforme: '✓', verifier: '⚠', hors: '✕', inconnu: '?' };
  const nom = { conforme: 'Conforme', verifier: 'À vérifier',
    hors: 'Hors limites', inconnu: 'Non vérifiable' };
  const nb = (n, d = 0) => n.toLocaleString('fr-FR',
    { minimumFractionDigits: d, maximumFractionDigits: d });

  // Une valeur qu'on n'a pas pu calculer s'écrit « non calculable », jamais
  // « 0 » ni « NaN » : un zéro se lit comme une mesure.
  const ou = (valeur, ecrire) => (valeur === null || valeur === undefined
    || !Number.isFinite(Number(valeur)) ? 'non calculable' : ecrire(Number(valeur)));

  const lignes = [
    ['Module', `${dim.module.nom} — ${dim.module.puissance} Wc`],
    ['Onduleur', `${dim.onduleur.nom} — ${dim.onduleur.mppt} MPPT`],
    ['Champ', dim.chaines
      ? `${dim.chaines} chaîne${dim.chaines > 1 ? 's' : ''} de ${
        dim.longueur} modules, soit ${dim.modules} modules`
      : `${dim.modules} modules — répartition non calculable`],
    ['Puissance DC', ou(dim.puissanceDc, (x) => `${nb(x, 2)} kWc`)],
    ['Puissance AC', ou(dim.puissanceAc, (x) => `${nb(x)} kW`)],
    ['Rapport DC/AC', ou(dim.ratio, (x) => nb(x, 2))],
    ['Tension à vide, modules froids', ou(dim.vocChaine, (x) => `${nb(x)} V`)],
    ['Tension MPP, conditions standard', ou(dim.vmpChaineStc, (x) => `${nb(x)} V`)],
    ['Tension MPP, cellule à 70 °C', ou(dim.vmpChaineChaud, (x) => `${nb(x)} V`)],
    ['Courant de fonctionnement par MPPT',
      ou(dim.courantFonctionnement, (x) => `${nb(x, 1)} A`)],
    ['Courant de court-circuit majoré',
      ou(dim.courantCourtCircuit, (x) => `${nb(x, 1)} A`)],
    ['Longueurs de chaîne admissibles', dim.bornes?.min
      ? `${dim.bornes.min} à ${dim.bornes.max} modules` : 'non calculables'],
  ];

  return `<details class="technique" id="technique">
    <summary>
      <span class="tq-titre">Mode technicien — dimensionnement électrique</span>
      <span class="tq-verdict tq-${verdict}">${v[verdict] ?? '?'} ${
        nom[verdict] ?? 'Non vérifiable'}</span>
    </summary>

    <div class="tq-controles">
      ${dim.controles.map((c) => `<div class="tq-c tq-${c.verdict}">
        <div class="tq-c-tete">
          <span class="tq-c-signe">${v[c.verdict]}</span>
          <span class="tq-c-nom">${c.nom}</span>
          <span class="tq-c-val">${c.mesure}</span>
        </div>
        <p class="tq-c-lim">${c.limite}</p>
        <p class="tq-c-txt">${c.pourquoi}</p>
        ${c.donneesManquantes?.length
          ? `<p class="tq-manque">Données absentes : ${
            c.donneesManquantes.join(', ')}</p>` : ''}
      </div>`).join('')}
    </div>

    <table class="tq-table">
      <caption>Paramètres retenus</caption>
      <tbody>${lignes.map(([k, val]) => `<tr><th scope="row">${k}</th>
        <td>${val}</td></tr>`).join('')}</tbody>
    </table>

    ${dim.incomplet ? `<p class="tq-manque">Aucun contrôle électrique n’a pu
      être fait : ${dim.manquants.join(', ')} ${dim.manquants.length > 1
        ? 'manquent' : 'manque'} au catalogue.</p>` : ''}

    <p class="tq-note">Les limites viennent du catalogue de matériel du site,
      non d’une fiche constructeur signée, et les températures de
      dimensionnement sont celles retenues pour le climat tunisien
      (${dim.module.coeffVoc ?? '?'} %/°C sur la tension à vide). Un site d’altitude
      descend plus bas : vérifiez la température minimale avant de commander.</p>
  </details>`;
}

/* ------------------------------------------------------------------ */
/* Le moteur, rendu visible                                            */
/* ------------------------------------------------------------------ */

/**
 * LE BANDEAU DE NIVEAU — ce que cette étude vaut, dit avant elle.
 *
 * Un visiteur qui n'a donné que sa ville et sa facture reçoit un chiffre
 * exact à l'écran. Rien ne lui dit que ce chiffre repose sur un toit supposé
 * plein sud et dégagé. Le bandeau le dit, et propose l'action qui ferait
 * monter l'étude d'un cran — pas un reproche, une marche à gravir.
 */
export function bandeauNiveau(sim) {
  if (!sim?.niveau?.niveau) return '';
  const n = sim.niveau;
  const c = sim.confiance;
  return `<div class="niveau niveau-${n.niveau.id}">
    <div class="niveau-tete">
      <span class="niveau-rang">Niveau ${n.niveau.rang} sur 3</span>
      <span class="niveau-nom">${n.niveau.nom}</span>
      ${c ? `<span class="niveau-conf niveau-conf-${c.niveau}">Confiance des
        données : ${c.note} / 100</span>` : ''}
    </div>
    <p class="niveau-phrase">${n.niveau.phrase}</p>
    ${c ? `<p class="niveau-conf-txt">${c.phrase}</p>` : ''}
    ${n.pourMonter.length ? `<p class="niveau-monter"><b>Pour passer au niveau
      ${n.suivant.rang} — ${n.suivant.nom.toLowerCase()} :</b>
      ${n.pourMonter.map((m) => m.nom.toLowerCase()).join(', ')}.</p>` : ''}
    ${c ? `<details class="niveau-detail"><summary>Ce qui compose la confiance</summary>
      <dl>${c.facteurs.map((f) => `<div>
        <dt>${f.nom}</dt><dd>${f.obtenu} / ${f.poids}</dd>
        <p>${f.note}</p></div>`).join('')}</dl></details>` : ''}
  </div>`;
}

/**
 * LES ALERTES DU PROJET, chacune avec ses quatre parties.
 *
 * Repliées quand tout va bien, ouvertes dès qu'il y a un bloquant : une
 * alerte qui décide du projet ne doit pas attendre qu'on la cherche.
 */
export function panneauAlertes(sim) {
  const alertes = sim?.avertissements ?? [];
  if (!alertes.length) return '';
  const c = { bloquant: 0, important: 0, information: 0 };
  for (const a of alertes) c[a.gravite] += 1;
  const signes = { bloquant: '✕', important: '⚠', information: 'i' };
  const resume = [
    c.bloquant ? `${c.bloquant} bloquant${c.bloquant > 1 ? 's' : ''}` : null,
    c.important ? `${c.important} à corriger` : null,
    c.information ? `${c.information} à savoir` : null,
  ].filter(Boolean).join(' · ');

  return `<details class="alertes" id="panneauAlertes" ${c.bloquant ? 'open' : ''}>
    <summary>
      <span class="al-titre">Analyse du projet</span>
      <span class="al-resume ${c.bloquant ? 'al-rouge' : c.important ? 'al-or' : ''}"
        >${resume}</span>
    </summary>
    <div class="al-liste">
      ${alertes.map((a) => `<div class="al al-${a.gravite}">
        <p class="al-probleme"><span class="al-signe">${signes[a.gravite]}</span>
          ${a.probleme}</p>
        <p class="al-pourquoi">${a.pourquoi}</p>
        <dl class="al-donnees">${a.donnees.map(([k, v]) => `<div>
          <dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
        <p class="al-action"><b>Ce que vous pouvez faire :</b> ${a.action}</p>
      </div>`).join('')}
    </div>
  </details>`;
}

/**
 * « D'OÙ VIENT CE CHIFFRE ? » — la traçabilité, ouvrable ligne par ligne.
 *
 * C'est la question qui décide de tout dans ce métier. Une étude qu'on peut
 * ouvrir se défend devant un installateur ; une étude qu'on doit croire se
 * conteste.
 */
export function panneauTracabilite(sim) {
  if (!sim?.tracabilite?.length) return '';
  const parCle = Object.fromEntries((sim.hypotheses ?? []).map((h) => [h.cle, h]));
  return `<details class="tracabilite" id="panneauTrace">
    <summary><span class="tr-titre">D’où vient chaque chiffre</span>
      <span class="tr-note">moteur de calcul v${sim.version}</span></summary>
    <div class="tr-liste">
      ${sim.tracabilite.map((t) => `<div class="tr">
        <p class="tr-tete"><span class="tr-nom">${t.nom}</span>
          <span class="tr-val">${t.valeur}</span></p>
        <p class="tr-methode">${t.methode}</p>
        <dl class="tr-params">${t.parametres.map(([k, v]) => `<div>
          <dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
        ${t.hypotheses.length ? `<p class="tr-hyp">Repose sur : ${
          t.hypotheses.map((h) => parCle[h]
            ? `${parCle[h].nom.toLowerCase()}${parCle[h].verifiee ? '' : ' (non vérifiée)'}`
            : h).join(', ')}.</p>` : ''}
      </div>`).join('')}
    </div>
  </details>`;
}

/** Les hypothèses, toutes, avec leur source et leur état de vérification. */
export function panneauHypotheses(sim) {
  if (!sim?.hypotheses?.length) return '';
  const aVerifier = sim.hypotheses.filter((h) => !h.verifiee).length;
  return `<details class="hypotheses" id="panneauHypotheses">
    <summary><span class="hy-titre">Hypothèses de calcul</span>
      <span class="hy-note">${sim.hypotheses.length} paramètres, ${
        aVerifier} non vérifiés</span></summary>
    <table class="hy-table"><tbody>
      ${sim.hypotheses.map((h) => `<tr class="${h.verifiee ? '' : 'hy-doute'}">
        <th scope="row">${h.nom}<span class="hy-src">${h.source}</span></th>
        <td>${typeof h.valeur === 'number'
          ? h.valeur.toLocaleString('fr-FR', { maximumFractionDigits: 3 })
          : (h.valeur ?? '—')}${h.unite ? ` ${h.unite}` : ''}
          <span class="hy-etat">${h.verifiee ? 'vérifiée' : 'à vérifier'}</span></td>
      </tr>`).join('')}
    </tbody></table>
    <p class="hy-pied">« À vérifier » ne veut pas dire faux : cela veut dire que
      la valeur n’a pas été relue sur un document officiel en vigueur. C’est
      là qu’un installateur doit porter son attention.</p>
  </details>`;
}
