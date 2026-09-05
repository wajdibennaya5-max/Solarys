/**
 * LE RAPPORT — ce que le client garde, montre et oppose à un devis.
 *
 * CE QU'IL EST : la mise au propre de la simulation qu'il vient de faire, sur
 * une mise en page qu'on peut imprimer, enregistrer en PDF et faire lire à un
 * installateur. Il porte tout ce qui a servi au calcul, hypothèses comprises.
 *
 * CE QU'IL N'EST PAS : l'étude technique détaillée. Celle-là demande une
 * visite — les ombres portées, l'état du tableau, le point de raccordement —
 * et elle reste le produit payant. Le rapport le dit noir sur blanc à sa
 * dernière page, plutôt que de laisser croire qu'une simulation remplace un
 * relevé sur site.
 *
 * IL S'IMPRIME SANS JAVASCRIPT. Tout est écrit dans le document au moment où
 * on le demande : graphiques en SVG inline, chiffres en texte. Une page qui
 * dépend d'un script pour s'imprimer sort blanche une fois sur trois.
 */
import { formater, formaterRond, echapper } from './prix.js';
import { formater as formaterCo2, enArbres } from './co2.js';
import { typeBatiment } from './batiment.js';
import { nomGouvernorat, zoneSolaire, MOIS } from './gisement.js';
import { FIABILITES } from './consommation.js';
import { construireGraphe, grapheMensuel, grapheComparaison } from './graphe.js';
import { planCalepinage } from './calepinage.js';
import { logo } from './marque.js';
import { VERDICTS } from './technique.js';

/** Les neuf sections, dans l'ordre où elles se lisent. */
export const SECTIONS = [
  'Votre projet', 'Votre consommation', 'Votre installation recommandée',
  'Production solaire estimée', 'Vos économies estimées', 'Analyse financière',
  'Visualisation de l’installation', 'Hypothèses de calcul', 'Prochaines étapes',
];

const numero = (i) => String(i + 1).padStart(2, '0');

/** Un couple libellé / valeur, la brique de tout le rapport. */
const ligne = (k, v) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`;
const tableau = (lignes) => `<table class="rp-table"><tbody>${lignes.join('')}</tbody></table>`;

/** La date, écrite en toutes lettres : un rapport se date. */
export function dateDuJour(quand = new Date()) {
  return quand.toLocaleDateString('fr-FR',
    { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * La conclusion, adaptée à ce que le calcul a réellement donné.
 *
 * Trois cas, trois phrases différentes. Une conclusion identique pour un toit
 * plein sud à Tozeur et pour un pan nord à Bizerte ne serait pas une
 * conclusion : ce serait un pied de page.
 */
export function conclusion(etude, score) {
  const bat = typeBatiment(etude.batiment);
  const bien = score && score.note >= 65;
  const moyen = score && score.note >= 45;

  // « votre maison », « votre commerce », « votre exploitation » : le
  // possessif s'accorde tout seul là où un démonstratif obligerait à porter
  // le genre de chaque type de bâtiment — et « ce maison » se voit.
  const sujet = bat ? `votre ${bat.nom.toLowerCase()}` : 'votre bâtiment';
  const debut = bien
    ? `D’après les informations fournies, ${sujet} présente un potentiel `
      + 'favorable pour une installation photovoltaïque.'
    : moyen
      ? `D’après les informations fournies, ${sujet} présente un potentiel réel, `
        + 'que quelques contraintes viennent limiter.'
      : `D’après les informations fournies, plusieurs paramètres pèsent sur le `
        + `potentiel photovoltaïque de ${sujet}.`;

  const milieu = etude.retour
    ? ` L’installation étudiée se rembourserait en ${
      etude.retour.toFixed(1).replace('.', ',')} ans dans les hypothèses retenues, `
      + `pour une économie de l’ordre de ${formaterRond(etude.economieAnnuelle)} la `
      + 'première année.'
    : ' Dans les hypothèses retenues, le retour sur investissement dépasse la durée '
      + 'd’étude de vingt-cinq ans : le dimensionnement mérite d’être revu.';

  const fin = ' Une visite technique permettra de confirmer les surfaces réellement '
    + 'exploitables, les masques et ombres portées, l’état du tableau électrique et '
    + 'les conditions de raccordement au réseau — autant d’éléments qu’une simulation '
    + 'ne peut pas voir, et qui décident du projet final.';

  return debut + milieu + fin;
}

/**
 * Le rapport complet, en HTML.
 *
 * @param {object} arg
 * @param {object} arg.etude résultat de `etudier()`
 * @param {object} arg.source résultat de `resoudre()` — d'où vient la consommation
 * @param {object} arg.score Solar Score, ou `null`
 * @param {object} arg.dimensionnement résultat de `dimensionner()`, ou `null`
 * @param {object} arg.client `{nom, telephone, courriel}` — facultatif
 * @param {object} arg.toit `{orientation, pente, L, P}`
 * @param {Array} arg.consoMensuelle douze valeurs, ou `null`
 * @param {object} arg.offre `{prix}`
 * @returns {string}
 */
export function construireRapport({
  etude, source = null, score = null, dimensionnement = null, client = null,
  toit = {}, consoMensuelle = null, gouvernorat = null, hypotheses,
  reglagePose = null, offre = null, quand = new Date(),
}) {
  if (!etude) return '';
  const lieu = nomGouvernorat(gouvernorat) ?? '—';
  const bat = typeBatiment(etude.batiment);
  const nomProjet = `Étude photovoltaïque — ${lieu}`;
  const fiab = source && FIABILITES[source.fiabilite];

  const sections = [];
  let i = 0;

  /* 01 — Votre projet */
  sections.push(section(i++, tableau([
    ligne('Localisation', `${lieu} — zone solaire ${zoneSolaire(gouvernorat) ?? '—'}`),
    ligne('Type de bâtiment', bat ? bat.nom : '—'),
    ligne('Gisement solaire retenu', `${etude.productible} kWh par kWc et par an`),
    ligne('Toiture', toit.L && toit.P
      ? `pan de ${String(toit.L).replace('.', ',')} × ${String(toit.P).replace('.', ',')} m, `
        + `soit ${Math.round(toit.L * toit.P)} m²`
      : 'cotes non communiquées'),
    ligne('Orientation', orientationEnClair(toit)),
  ]) + (score ? `<p class="rp-p"><b>Solar Score : ${score.note} / 100</b> —
    ${score.palier.phrase}${score.preliminaire
      ? ` (score préliminaire : ${Math.round(score.confiance * 100)} % des critères
        renseignés)` : ''}</p>` : '')));

  /* 02 — Votre consommation */
  sections.push(section(i++, tableau([
    ligne('Consommation annuelle', `${etude.consommation.toLocaleString('fr-FR')} kWh`),
    ligne('Prix du kilowattheure retenu',
      `${etude.prixKwh.toFixed(3).replace('.', ',')} DT`),
    ligne('Dépense annuelle d’électricité',
      formaterRond(etude.consommation * etude.prixKwh)),
    ligne('Origine du chiffre', source?.detail ?? '—'),
  ]) + (fiab ? `<p class="rp-p rp-fiab"><b>${fiab.nom}.</b> ${fiab.phrase}</p>` : '')));

  /* 03 — Votre installation recommandée */
  const pose = reglagePose?.module;
  sections.push(section(i++, tableau([
    ligne('Puissance visée', `<b>${String(etude.puissance).replace('.', ',')} kWc</b>`),
    ligne('Nombre de modules', `${etude.modules} modules${
      pose ? ` de ${pose.puissance} Wc` : ''}`),
    // Un nombre entier de modules ne tombe presque jamais juste sur la
    // puissance visée : l'écrire évite qu'un installateur découvre la
    // différence en chiffrant.
    ligne('Puissance réellement posée',
      `${String(etude.puissanceInstallee).replace('.', ',')} kWc`),
    ligne('Surface nécessaire', `environ ${etude.surface} m²`),
    ...(dimensionnement ? [
      ligne('Onduleur', dimensionnement.onduleur.nom),
      ligne('Configuration', `${dimensionnement.chaines} chaîne${
        dimensionnement.chaines > 1 ? 's' : ''} de ${dimensionnement.longueur} modules`),
      ligne('Rapport DC/AC', dimensionnement.ratio.toFixed(2).replace('.', ',')),
    ] : []),
    ligne('Coût estimé', `<b>${formaterRond(etude.cout)}</b>`),
  ])));

  /* 04 — Production solaire estimée */
  sections.push(section(i++, tableau([
    ligne('Production annuelle', `${etude.production.toLocaleString('fr-FR')} kWh`),
    ligne('Couverture de votre consommation', `${Math.round(etude.ratio * 100)} %`),
    ligne('Consommé sur place', `${etude.autoconsomme.toLocaleString('fr-FR')} kWh `
      + `(${Math.round(etude.tauxAutoconsommation * 100)} % du produit)`),
    ligne('Injecté sur le réseau', `${etude.surplus.toLocaleString('fr-FR')} kWh`),
    ligne('CO₂ évité', `${formaterCo2(etude.co2Annuel)} par an, soit l’équivalent de `
      + `${enArbres(etude.co2Annuel)} arbres`),
  ]) + graphe(etude.mensuel && grapheMensuel(etude.mensuel, MOIS, { largeur: 620, hauteur: 200 }),
    'Production mois par mois, en kWh')
  + graphe(etude.mensuel && consoMensuelle
    && grapheComparaison(etude.mensuel, consoMensuelle, MOIS, { largeur: 620, hauteur: 230 }),
  'Production comparée à votre consommation')));

  /* 05 — Vos économies estimées */
  sections.push(section(i++, tableau([
    ligne('Économie la première année', `<b>${formater(etude.economieAnnuelle)}</b>`),
    ligne('Soit par mois', formaterRond(etude.economieMensuelle)),
    ligne('Économie cumulée sur 25 ans', formaterRond(etude.economieTotale)),
    ligne('Gain net après investissement', `<b>${formaterRond(etude.gainNet)}</b>`),
  ])));

  /* 06 — Analyse financière */
  sections.push(section(i++, tableau([
    ligne('Investissement', formaterRond(etude.cout)),
    ligne('Temps de retour', etude.retour
      ? `${etude.retour.toFixed(1).replace('.', ',')} ans`
      : 'au-delà de la durée d’étude'),
    ligne('Durée retenue pour l’étude', `${hypotheses.duree} ans`),
    ligne('Hausse annuelle du prix de l’électricité retenue',
      `${Math.round(hypotheses.hausseElectricite * 100)} %`),
    ligne('Valeur du surplus injecté',
      `${Math.round(hypotheses.valeurSurplus * 100)} % du prix d’achat`),
  ]) + graphe(construireGraphe(etude, { largeur: 620, hauteur: 240 })?.svg,
    'Économie cumulée et seuil de rentabilité')));

  /* 07 — Visualisation de l'installation */
  const plan = (toit.L && toit.P)
    ? planCalepinage(toit.L, toit.P, { largeurPx: 520, ...(reglagePose ?? {}) }) : null;
  sections.push(section(i++, plan
    ? tableau([
      ligne('Modules posés', `${plan.plan.nombre} en ${plan.plan.rangees} rangée${
        plan.plan.rangees > 1 ? 's' : ''} de ${plan.plan.colonnes}`),
      ligne('Pose', plan.plan.orientation),
      ligne('Puissance tenant sur le pan',
        `${String(plan.plan.puissance).replace('.', ',')} kWc`),
    ]) + graphe(plan.svg, 'Implantation sur le pan de toiture, marges de rive comprises')
    : `<p class="rp-p">Les cotes de la toiture n’ont pas été communiquées :
       l’implantation ne peut pas être dessinée. Elle sera relevée lors de la
       visite technique.</p>`));

  /* 08 — Hypothèses de calcul */
  sections.push(section(i++, tableau([
    ligne('Coût installé retenu', `${formaterRond(hypotheses.coutParKwc)} par kWc`),
    ligne('Surface par kWc', `${hypotheses.surfaceParKwc} m²`),
    ligne('Part autoconsommée de référence',
      `${Math.round(etude.autoconsommationReference * 100)} % (profil ${
        bat ? bat.nom.toLowerCase() : 'logement'})`),
    ligne('Perte annuelle de rendement des modules',
      `${(hypotheses.degradation * 100).toFixed(1).replace('.', ',')} %`),
    ligne('Effet de l’orientation retenue', etude.facteurOrientation < 1
      ? `−${Math.round((1 - etude.facteurOrientation) * 100)} % par rapport au plein sud`
      : 'aucune perte (exposition optimale)'),
  ]) + `<p class="rp-p rp-avert">Ces hypothèses sont des ordres de grandeur du
    marché tunisien, relevés à la date du rapport. Elles ne constituent pas un
    devis, et aucun des résultats présentés n’est garanti.</p>`
  + (dimensionnement ? controlesTechniques(dimensionnement) : '')));

  /* 09 — Prochaines étapes */
  sections.push(section(i++, `<ol class="rp-etapes">
    <li><b>Vérifier vos chiffres.</b> Reprenez une facture STEG et comparez le
      prix du kilowattheure retenu ici avec le vôtre. C’est le nombre dont tout
      le reste dépend.</li>
    <li><b>Mesurer votre toiture.</b> Un mètre ruban et deux minutes suffisent à
      remplacer une estimation par une cote.</li>
    <li><b>Demander l’étude technique détaillée${
  offre ? ` (${formaterRond(offre.prix)})` : ''}.</b> Elle comprend le relevé
      sur site, les masques et ombres portées, le schéma électrique, le
      dimensionnement définitif et le dossier de raccordement — le dossier qu’un
      installateur accepte comme base de devis.</li>
    <li><b>Faire chiffrer.</b> Avec ce dossier en main, trois devis deviennent
      comparables.</li>
  </ol>
  <p class="rp-p rp-conclusion">${conclusion(etude, score)}</p>`));

  return `<article class="rapport" id="rapportImprime">
    <header class="rp-couverture">
      <div class="rp-logo">${logo()}</div>
      <p class="rp-sur">Étude photovoltaïque</p>
      <h1 class="rp-titre">${nomProjet}</h1>
      <table class="rp-table rp-identite"><tbody>
        ${ligne('Client', client?.nom ? echapper(client.nom) : '—')}
        ${ligne('Bâtiment', bat ? bat.nom : '—')}
        ${ligne('Date du rapport', dateDuJour(quand))}
        ${ligne('Établi par', 'Solarys — étude photovoltaïque, Tunisie')}
      </tbody></table>
      <p class="rp-resume"><b>${String(etude.puissance).replace('.', ',')} kWc</b>
        · ${etude.production.toLocaleString('fr-FR')} kWh par an
        · ${formaterRond(etude.economieAnnuelle)} d’économie estimée la première année
        ${etude.retour ? `· retour en ${etude.retour.toFixed(1).replace('.', ',')} ans` : ''}</p>
    </header>
    ${sections.join('')}
    <footer class="rp-pied">
      <p>Solarys — étude photovoltaïque, Tunisie. Rapport établi le
        ${dateDuJour(quand)} à partir des informations communiquées par le
        client. Document d’aide à la décision : il ne constitue ni un devis, ni
        une garantie de performance.</p>
    </footer>
  </article>`;
}

function section(i, contenu) {
  return `<section class="rp-section">
    <h2><span class="rp-num">${numero(i)}</span>${SECTIONS[i]}</h2>
    ${contenu}
  </section>`;
}

function graphe(svg, legende) {
  if (!svg) return '';
  return `<figure class="rp-figure">${svg}<figcaption>${legende}</figcaption></figure>`;
}

function controlesTechniques(dim) {
  return `<h3 class="rp-h3">Contrôles électriques</h3>
    <table class="rp-table rp-controles"><tbody>${dim.controles.map((c) => `<tr>
      <th scope="row">${VERDICTS[c.verdict].signe} ${c.nom}</th>
      <td>${c.mesure}<span class="rp-lim">${c.limite}</span></td></tr>`).join('')}
    </tbody></table>`;
}

/** L'orientation, dite comme un humain la dirait. */
function orientationEnClair({ pente, orientation } = {}) {
  if (!pente) return '—';
  if (pente === 'plat') return 'toiture-terrasse — modules sur châssis inclinés au sud';
  return `${orientation ?? 'sud'}, pente ${pente}`;
}
