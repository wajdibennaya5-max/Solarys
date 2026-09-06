/**
 * Le tunnel d'étude et l'affichage du résultat.
 *
 * Tout se passe dans le navigateur : les réponses ne partent nulle part tant
 * que le visiteur n'écrit pas lui-même. C'est ce que la page promet, donc
 * c'est ce qu'elle doit faire — aucune requête, aucun mouchard.
 */
import { GOUVERNORATS, nomGouvernorat, zoneSolaire } from './gisement.js';
import { HYPOTHESES, PUISSANCE } from './etude.js';
import { formater, formaterRond, echapper } from './prix.js';
import { localiser, REFUS, gouvernoratLePlusProche, enTunisie } from './geo.js';
import { lireCoordonnees, decrire, formater as formaterPoint } from './localisation.js';
import { mesurer as mesurerToit, etalonner,
  azimutProbableDuPan, orientationLaPlusProche } from './toiture.js';
import { definirFond, fondActif, capacites as capacitesCarte,
  hotesAAutoriser } from './carte/fonds.js';
import { creerCarte } from './vues/carte.js';
import { creerScene3d } from './vues/scene.js';
import { construireScene } from './scene3d.js';
import { implanter, eleverModules } from './implantation.js';
import { TYPES_OBSTACLE, typeObstacle, ombrageInstantane, friseJournee,
  resumeJournee, reserve as reserveOmbrage } from './ombrage.js';
import { DATES as DATES_SOLEIL, dateRepere, position as positionSoleil,
  journee as journeeSoleil } from './soleil.js';
import { projeter as projeterSommets } from './toiture.js';
import { planCalepinage } from './calepinage.js';
import { ORIENTATIONS, PENTES, expliquerOrientation } from './orientation.js';
import { MOIS } from './gisement.js';
import { PERIODES, REPERES } from './facture.js';
import { METHODES, FIABILITES, resoudre, verifier as verifierConso, methode }
  from './consommation.js';
import { QUESTIONS } from './profil.js';
import { TYPES, typeBatiment, TYPE_DEFAUT, consommationMensuelle } from './batiment.js';
import { MODULES, MODULE_DEFAUT, moduleParId } from './materiel.js';
import { POSES, optimiser } from './calepinage.js';
import { carteCentrale, grilleKpi, carteScore, avertissement, phraseCo2,
  panneauTechnique, bandeauNiveau, panneauAlertes, panneauTracabilite,
  panneauHypotheses } from './tableau.js';
import { simuler, enrichirDepuisService } from './moteur.js';
import { comparerJeux, listerParametres, jeu as jeuFinancier, NON_PRIS_EN_COMPTE }
  from './finances.js';
import { optimiser as optimiserProjet, OBJECTIFS } from './optimiseur.js';
import { comparer as comparerVariantes, variantesProposees } from './laboratoire.js';
import { repondre as repondreCopilote, suggestions as suggestionsCopilote, MODES }
  from './copilote.js';
import { panneauFinancier, panneauOptimiseur, panneauLaboratoire, panneauCopilote,
  reponseCopilote, ficheSite, barreComposition, panneauProvenance,
  centreDonnees, fichePosition } from './tableau.js';
import { fusionner, raconterComposition } from './fusion.js';
import { definirRelais, disponible as serviceDisponible, ATTRIBUTION,
  RAISON_INDISPONIBLE } from './pvgis/config.js';
import { noter, proteger, surveiller, resume as resumeJournal, enTexte, CORRELATION }
  from './journal.js';
import { dimensionner, verdictGlobal } from './technique.js';
import { construireRapport } from './rapport.js';
import { reponses, simulation, reinitialiserSimulation, cotesToit, reglagePose,
  donneesEtude, etudeCourante, scenariosCourants, definirProductibleMesure,
  position, definirPosition } from './etat.js';
import { evaluer } from './score.js';
import { animerChiffres, compter, mouvementReduit } from './anime.js';
import { tousLesCas, DUREE as DUREE_VITRE } from './heros.js';
import { construireGraphe, grapheMensuel, grapheComparaison, diagrammeFlux }
  from './graphe.js';
import { OFFRE, CONTACT, ouverte, redigerDemande, lienDemande, champsManquants,
  envoyerAuServeur, API } from './prospect.js';
import { enregistrer, relire, effacer, ageEnClair } from './session.js';
import { scenarioParDefaut, ecart } from './scenarios.js';

const $ = (id) => document.getElementById(id);

/**
 * LE SCHÉMA DE LA FACTURE — dessiné, pas photographié.
 *
 * Deux cases se ressemblent sur une facture STEG : « Total Electricité » et
 * « Montant à payer ». La seconde peut contenir des arriérés d'anciennes
 * factures, et fausserait toute l'économie annoncée. Montrer où regarder
 * évite l'erreur mieux qu'une phrase qui la décrit.
 */
const SCHEMA_FACTURE = `    <svg viewBox="0 0 320 150" class="facture-schema" role="img"
      aria-label="Extrait d’une facture STEG : la colonne Quantité et la case Total Electricité">
      <rect x="1" y="1" width="318" height="148" rx="6" fill="var(--surface)"
        stroke="var(--bord)" stroke-width="1.5"/>
      <text x="12" y="20" class="fs-titre">CONSOMMATION &amp; SERVICES</text>
      <line x1="12" y1="27" x2="308" y2="27" stroke="var(--bord)" stroke-width="1"/>
      <text x="16" y="42" class="fs-tete">Libellés</text>
      <text x="118" y="42" class="fs-tete">Index</text>
      <text x="192" y="42" class="fs-tete">Quantité</text>
      <text x="262" y="42" class="fs-tete">Montant</text>
      <rect x="186" y="30" width="52" height="40" rx="4" fill="none"
        stroke="var(--accent)" stroke-width="2"/>
      <text x="16" y="60" class="fs-val">Électricité</text>
      <text x="118" y="60" class="fs-pale">16338</text>
      <text x="196" y="60" class="fs-fort">590</text>
      <text x="262" y="60" class="fs-val">128,620</text>
      <text x="212" y="84" text-anchor="middle" class="fs-note">1 — kWh consommés</text>
      <rect x="12" y="96" width="166" height="26" rx="5" fill="none"
        stroke="var(--accent)" stroke-width="2"/>
      <text x="20" y="113" class="fs-fort">Total Electricité</text>
      <text x="172" y="113" text-anchor="end" class="fs-fort">132,820</text>
      <text x="95" y="136" text-anchor="middle" class="fs-note">2 — le montant à saisir</text>
      <text x="196" y="113" class="fs-pale">Montant à payer</text>
      <text x="308" y="113" text-anchor="end" class="fs-pale">554,000</text>
      <text x="250" y="136" text-anchor="middle" class="fs-barre">pas celui-ci</text>
    </svg>`;

/** La méthode de saisie retenue, et ce qui a été tapé dans chacune. */
let methodeConso = 'facture';
const saisieConso = { facture: {}, mensuel: {}, montant: {}, profil: {} };

/** Les douze cases du relevé mensuel. */
const casesMois = () => MOIS.map((m, i) => `<label class="mois">
  <span>${m}</span>
  <input id="mois${i}" type="number" inputmode="numeric" min="0" max="20000"
    step="1" aria-label="Consommation de ${m} en kilowattheures">
</label>`).join('');

/** Le formulaire propre à chaque méthode. */
function formulaireConso(id) {
  if (id === 'facture') {
    return `${SCHEMA_FACTURE}
    <div class="champ">
      <label for="quantite">1 — Quantité (kWh)</label>
      <input id="quantite" name="quantite" type="number" inputmode="numeric"
        min="1" step="1" placeholder="${REPERES.quantite.exemple}">
      <p class="indice">${REPERES.quantite.aide}</p>
    </div>
    <div class="champ">
      <label for="montant">2 — Total Électricité (DT)</label>
      <input id="montant" name="montant" type="number" inputmode="decimal"
        min="0" step="0.001" placeholder="${REPERES.montant.exemple}">
      <p class="indice">${REPERES.montant.aide}</p>
    </div>
    <div class="champ">
      <label for="periode">Vous recevez une facture</label>
      <select id="periode" name="periode">
        ${PERIODES.map((pp) => `<option value="${pp.id}"${
          pp.defaut ? ' selected' : ''}>${pp.nom}</option>`).join('')}
      </select>
    </div>`;
  }

  if (id === 'mensuel') {
    return `<p class="indice">Vos consommations mensuelles, en kWh. L’espace
      client STEG les conserve ; laissez vides les mois que vous ignorez.</p>
    <div class="mois-grille">${casesMois()}</div>`;
  }

  if (id === 'montant') {
    return `<div class="champ">
      <label for="mMontant">Ce que vous payez habituellement (DT)</label>
      <input id="mMontant" type="number" inputmode="decimal" min="0" step="0.5"
        placeholder="340">
      <p class="indice">Le montant d’une facture ordinaire, arriérés exclus.</p>
    </div>
    <div class="champ">
      <label for="mPeriode">Vous recevez une facture</label>
      <select id="mPeriode">
        ${PERIODES.map((pp) => `<option value="${pp.parAn}"${
          pp.defaut ? ' selected' : ''}>${pp.nom}</option>`).join('')}
      </select>
    </div>`;
  }

  if (id === 'profil') {
    return `<p class="indice">Sans facture, on estime à partir du logement.
      Les ordres de grandeur sont justes ; une facture les rendrait exacts.</p>
    ${QUESTIONS.map((q) => (q.type === 'oui-non'
      ? `<label class="bascule"><input type="checkbox" id="p_${q.cle}"${
          q.defaut ? ' checked' : ''}><span>${q.libelle}</span></label>`
      : `<div class="champ">
          <label for="p_${q.cle}">${q.libelle}</label>
          <input id="p_${q.cle}" type="number" inputmode="numeric" min="0"
            step="1" value="${q.defaut}">
        </div>`)).join('')}`;
  }
  return '';
}

/** Ce que le formulaire courant contient, dans la forme attendue du calcul. */
function lireSaisieConso(id) {
  if (id === 'facture') {
    return {
      quantite: $('quantite')?.value ?? '',
      montant: $('montant')?.value ?? '',
      periode: $('periode')?.value ?? 'bimestrielle',
    };
  }
  if (id === 'mensuel') {
    // Une case vide n'est pas un zéro : elle ne compte pas, là où un zéro
    // saisi est une information — un mois d'absence, par exemple.
    return { mois: MOIS.map((_, i) => {
      const v = $(`mois${i}`)?.value;
      return v === '' || v === undefined || v === null ? null : Number(v);
    }) };
  }
  if (id === 'montant') {
    return { montant: $('mMontant')?.value ?? '', parAn: Number($('mPeriode')?.value) || 6 };
  }
  if (id === 'profil') {
    const lu = {};
    for (const q of QUESTIONS) {
      const champ = $(`p_${q.cle}`);
      lu[q.cle] = q.type === 'oui-non' ? !!champ?.checked : Number(champ?.value);
    }
    return lu;
  }
  return {};
}

/** Remet dans le formulaire ce qui y avait été tapé. */
function remplirSaisieConso(id, v = {}) {
  if (id === 'facture') {
    if ($('quantite')) $('quantite').value = v.quantite ?? '';
    if ($('montant')) $('montant').value = v.montant ?? '';
    if ($('periode')) $('periode').value = v.periode ?? 'bimestrielle';
    return;
  }
  if (id === 'mensuel') {
    MOIS.forEach((_, i) => {
      const champ = $(`mois${i}`);
      if (champ) champ.value = v.mois?.[i] ?? '';
    });
    return;
  }
  if (id === 'montant') {
    if ($('mMontant')) $('mMontant').value = v.montant ?? '';
    if ($('mPeriode') && v.parAn) $('mPeriode').value = String(v.parAn);
    return;
  }
  if (id === 'profil') {
    for (const q of QUESTIONS) {
      const champ = $(`p_${q.cle}`);
      if (!champ) continue;
      const valeur = v[q.cle];
      if (q.type === 'oui-non') champ.checked = valeur === undefined ? q.defaut : !!valeur;
      else champ.value = valeur === undefined ? q.defaut : valeur;
    }
  }
}

/**
 * L'APERÇU VIVANT — l'hypothèse affichée plutôt que cachée.
 *
 * Trois des quatre méthodes déduisent le prix du kilowattheure d'une grille
 * tarifaire au lieu de le lire sur une facture. Une hypothèse affichée, le
 * client la reconnaît ou la corrige ; une hypothèse cachée se découvre à sa
 * première facture, quand il est trop tard pour nous croire.
 */
function apercuConso() {
  const zone = $('apercuConso');
  if (!zone) return;
  const saisie = lireSaisieConso(methodeConso);
  saisieConso[methodeConso] = saisie;
  const r = resoudre(methodeConso, saisie);
  if (!r) { zone.innerHTML = ''; zone.hidden = true; return; }
  zone.hidden = false;
  const f = FIABILITES[r.fiabilite];
  zone.innerHTML = `<b>${r.consommationAnnuelle.toLocaleString('fr-FR')} kWh par an</b>,
    soit ${r.prixKwh.toFixed(3).replace('.', ',')} DT le kilowattheure.
    <span class="ap-source">${r.detail}</span>
    ${r.fiabilite === 'facture' ? '' : `<span class="ap-avert">${f.phrase}</span>`}`;
}

/** Redessine le formulaire de la méthode retenue et rebranche ses écoutes. */
function dessinerFormConso() {
  const hote = $('formConso');
  if (!hote) return;
  hote.innerHTML = formulaireConso(methodeConso);
  remplirSaisieConso(methodeConso, saisieConso[methodeConso]);
  for (const chip of document.querySelectorAll('#methodes [data-methode]')) {
    const actif = chip.dataset.methode === methodeConso;
    chip.classList.toggle('choisi', actif);
    chip.setAttribute('aria-checked', String(actif));
  }
  apercuConso();
}

function brancherConsommation() {
  const choix = $('methodes');
  if (!choix) return;
  choix.addEventListener('click', (ev) => {
    const chip = ev.target.closest('[data-methode]');
    if (!chip || chip.dataset.methode === methodeConso) return;
    // Ce qui a été tapé dans l'ancienne méthode est gardé : revenir en
    // arrière ne doit pas coûter une deuxième saisie.
    saisieConso[methodeConso] = lireSaisieConso(methodeConso);
    methodeConso = chip.dataset.methode;
    $('erreur').textContent = '';
    dessinerFormConso();
  });
  // Une seule écoute sur le conteneur : le formulaire est redessiné à chaque
  // changement de méthode, des écoutes posées sur les champs fuiraient.
  $('formConso')?.addEventListener('input', apercuConso);
  $('formConso')?.addEventListener('change', apercuConso);
  dessinerFormConso();
}

/** Le type de bâtiment retenu, et la pose des modules. */
let typeBat = TYPE_DEFAUT;
let poseChoisie = 'auto';

/**
 * Les étapes, dans l'ordre.
 *
 * Chacune ne pose qu'une question : sur un téléphone, un formulaire de quatre
 * champs fait abandonner là où quatre écrans d'un champ font avancer.
 */
const ETAPES = [
  {
    cle: 'gouvernorat',
    numero: '01',
    court: 'Localisation',
    titre: 'Où se trouve votre bâtiment ?',
    aide: 'Le soleil de Tozeur n’est pas celui de Bizerte : le calcul en tient compte.',
    champ: () => `<div class="geo">
      <button class="btn" type="button" id="localiser">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        Me localiser
      </button>
      <button class="btn fantome" type="button" id="localiserFin"
        title="Sollicite le GPS : plus lent, plus précis">
        Position précise (GPS)
      </button>
    </div>
    <p class="indice" id="geoEtat" role="status" aria-live="polite"></p>

    <div class="champ">
      <label for="gouvernorat">Gouvernorat</label>
      <select id="gouvernorat" name="gouvernorat">
        <option value="">Choisissez…</option>
        ${GOUVERNORATS.map((g) => `<option value="${g.id}">${g.nom}</option>`).join('')}
      </select>
    </div>

    <details class="repli" id="precisionSite">
      <summary>Situer précisément le bâtiment
        <span class="repli-etat" id="precisionEtat"></span></summary>

      <p class="indice">Le gouvernorat suffit à estimer l’ensoleillement. Situer le
        bâtiment au point permet d’aller plus loin : données solaires locales,
        altitude, et plus tard le tracé de la toiture.</p>

      <div id="carteSite" class="carte-boite"></div>
      <p class="indice" id="carteMot"></p>

      <div class="champ">
        <label for="coordonnees">Coordonnées (latitude, longitude)</label>
        <input type="text" id="coordonnees" name="coordonnees" inputmode="decimal"
          autocomplete="off" spellcheck="false"
          placeholder="36.806500, 10.181500">
        <p class="indice">Formats acceptés : <code>36.8065, 10.1815</code> ou
          <code>36°48'23"N 10°10'53"E</code>.</p>
        <p class="erreur-champ" id="coordonneesErreur" role="alert"></p>
      </div>

      <div id="fichePos"></div>
    </details>`,
    valide: (v) => (v ? null : 'Choisissez votre gouvernorat pour continuer.'),
  },
  {
    cle: 'batiment',
    numero: '02',
    court: 'Bâtiment',
    titre: 'Quel bâtiment voulez-vous équiper ?',
    aide: 'Ce n’est pas une formalité : à midi, une maison est vide et un '
      + 'atelier tourne. Le même toit n’a donc pas la même rentabilité.',
    champ: () => `<div class="cartes-choix" id="batiments" role="radiogroup"
      aria-label="Type de bâtiment">
      ${TYPES.map((t) => `<button type="button" class="carte-choix" role="radio"
        aria-checked="false" data-batiment="${t.id}">
        <b>${t.nom}</b><span>${t.resume}</span>
      </button>`).join('')}
    </div>
    <p class="indice" id="noteBatiment" role="status"></p>`,
    lire: () => typeBat,
    valide: (v) => (typeBatiment(v) ? null : 'Choisissez le type de bâtiment.'),
    restaure: (v) => { if (typeBatiment(v)) typeBat = v; },
  },
  {
    cle: 'consommation',
    numero: '03',
    court: 'Consommation',
    titre: 'Que consommez-vous ?',
    aide: 'Le mieux, c’est votre dernière facture : deux nombres à recopier. '
      + 'Si vous ne l’avez pas, trois autres chemins mènent au même endroit.',
    champ: () => `<div class="methodes" id="methodes" role="radiogroup"
      aria-label="Comment renseigner votre consommation">
      ${METHODES.map((m) => `<button type="button" class="chip" role="radio"
        aria-checked="false" data-methode="${m.id}">
        <b>${m.nom}</b><span>${m.resume}</span>
        ${m.conseil ? '<i class="chip-conseil">le plus précis</i>' : ''}
      </button>`).join('')}
    </div>
    <div id="formConso"></div>
    <p class="apercu" id="apercuConso" role="status" aria-live="polite" hidden></p>
    <details class="repli"><summary>Je n’ai pas ma facture sous la main</summary>
      <p>Vous la retrouvez dans l’espace client STEG, ou sur le papier reçu par
      la poste. N’importe laquelle des six factures de l’année convient. Sinon,
      choisissez « Ce que je paie » ou « Je n’ai pas de facture » ci-dessus :
      l’étude sera une estimation, et elle le dira.</p></details>`,
    lire: () => ({ methode: methodeConso, saisie: lireSaisieConso(methodeConso) }),
    valide: (v) => verifierConso(v.methode, v.saisie),
    restaure: (v) => {
      if (v.methode && methode(v.methode)) methodeConso = v.methode;
      if (v.saisie) saisieConso[methodeConso] = v.saisie;
    },
  },
  {
    cle: 'toit',
    numero: '04',
    court: 'Toiture',
    titre: 'Parlez-nous de votre toiture',
    aide: 'L’orientation pèse plus que tout le reste : un pan plein est produit '
      + '17 % de moins qu’un plein sud.',
    champ: () => `<div class="champ">
      <label for="pente">Forme du toit</label>
      <select id="pente" name="pente">
        ${PENTES.map((p) => `<option value="${p.id}"${
          p.id === 'moyenne' ? ' selected' : ''}>${p.nom}</option>`).join('')}
      </select>
    </div>
    <div class="champ" id="champOrientation">
      <label for="orientation">Vers où regarde le pan principal ?</label>
      <select id="orientation" name="orientation">
        ${ORIENTATIONS.map((o) => `<option value="${o.id}"${
          o.id === 'sud' ? ' selected' : ''}>${o.nom}</option>`).join('')}
      </select>
      <p class="indice" id="noteOrientation"></p>
    </div>
    <div class="duo">
      <div class="champ">
        <label for="toitL">Largeur du pan (m)</label>
        <input id="toitL" name="toitL" type="number" inputmode="decimal"
          min="0" max="200" step="0.1" placeholder="8">
      </div>
      <div class="champ">
        <label for="toitP">Profondeur du pan (m)</label>
        <input id="toitP" name="toitP" type="number" inputmode="decimal"
          min="0" max="200" step="0.1" placeholder="6">
      </div>
    </div>
    <p class="indice">Les cotes sont facultatives — mais ce sont elles qui
      permettent de placer les panneaux sur VOTRE toit plutôt que sur un toit
      moyen. Un mètre ruban et deux minutes suffisent.</p>

    <details class="repli" id="tracageToit">
      <summary>Dessiner le toit sur la carte
        <span class="repli-etat" id="traceEtat">non tracé</span></summary>

      <p class="indice">Suivez le bord du toit point par point. La surface, le
        périmètre et l’orientation de chaque côté se calculent au fur et à
        mesure. Tirez un point pour le corriger sans tout recommencer.</p>

      <div id="carteToit" class="carte-boite"></div>

      <div class="outils" role="group" aria-label="Outils de tracé">
        <button type="button" class="btn fantome" id="traceDefaire">Annuler le point</button>
        <button type="button" class="btn fantome" id="traceVider">Effacer le tracé</button>
        <button type="button" class="btn fantome" id="traceCadrer">Cadrer</button>
        <button type="button" class="btn or" id="traceAppliquer" disabled>
          Reprendre ces cotes</button>
      </div>

      <div id="traceMesures"></div>

      <details class="repli" id="vue3dToit">
        <summary>Voir le bâtiment en volume
          <span class="repli-etat" id="vue3dEtat">sans contour</span></summary>
        <p class="indice">Le volume est reconstitué à partir du contour tracé, de la
          pente et de l’orientation déclarées. Un seul pan, comme le reste du
          calcul : montrer quatre pans que l’étude ignore donnerait une belle image
          et des chiffres faux.</p>
        <div class="champ">
          <label for="hauteurMur">Hauteur du mur sous l’égout (m)</label>
          <input id="hauteurMur" name="hauteurMur" type="number" inputmode="decimal"
            min="0" max="40" step="0.1" value="3">
        </div>
        <div id="scene3d" class="scene-boite"></div>

        <div class="duo">
          <div class="champ">
            <label for="modulePose">Pose des modules</label>
            <select id="modulePose" name="modulePose">
              ${POSES.map((p) => `<option value="${p.id}">${p.nom} — ${p.resume}</option>`)
    .join('')}
            </select>
          </div>
          <div class="champ">
            <label for="riveToit">Retrait de rive (m)</label>
            <input id="riveToit" type="number" inputmode="decimal" min="0" max="3"
              step="0.05" value="0.35">
          </div>
        </div>
        <div class="outils">
          <button type="button" class="btn fantome" id="poserModules">Poser les modules</button>
          <button type="button" class="btn fantome" id="retirerModules">Retirer</button>
        </div>
        <div id="compteursModules"></div>

        <details class="repli" id="ombragePan">
          <summary>Obstacles et ombrage
            <span class="repli-etat" id="ombrageEtat">non relevés</span></summary>

          <p class="indice">Relevez ce qui dépasse du toit et ce qui l’entoure.
            L’ombre est ensuite projetée depuis la position réelle du soleil, à la
            date et à l’heure choisies. C’est une simulation géométrique sur VOS
            cotes, pas une mesure.</p>

          <div class="duo">
            <div class="champ">
              <label for="obsType">Type d’obstacle</label>
              <select id="obsType" name="obsType">
                ${TYPES_OBSTACLE.map((t) => `<option value="${t.id}">${t.nom}</option>`)
    .join('')}
              </select>
            </div>
            <div class="champ">
              <label for="obsHauteur">Hauteur au-dessus du toit (m)</label>
              <input id="obsHauteur" type="number" inputmode="decimal" min="0.1"
                max="30" step="0.1" value="1.2">
            </div>
          </div>
          <p class="indice" id="obsAide"></p>
          <div class="duo">
            <div class="champ">
              <label for="obsLargeur">Largeur (m)</label>
              <input id="obsLargeur" type="number" inputmode="decimal" min="0.1"
                max="40" step="0.1" value="0.6">
            </div>
            <div class="champ">
              <label for="obsLongueur">Profondeur (m)</label>
              <input id="obsLongueur" type="number" inputmode="decimal" min="0.1"
                max="40" step="0.1" value="0.6">
            </div>
          </div>
          <p class="indice">Placez-le ensuite en appuyant sur la carte du toit,
            ou saisissez sa position par rapport au centre du bâtiment.</p>
          <div class="duo">
            <div class="champ">
              <label for="obsX">Décalage vers l’est (m)</label>
              <input id="obsX" type="number" inputmode="decimal" min="-100" max="100"
                step="0.5" value="0">
            </div>
            <div class="champ">
              <label for="obsY">Décalage vers le nord (m)</label>
              <input id="obsY" type="number" inputmode="decimal" min="-100" max="100"
                step="0.5" value="0">
            </div>
          </div>
          <div class="outils">
            <button type="button" class="btn or" id="obsAjouter">Ajouter l’obstacle</button>
            <button type="button" class="btn fantome" id="obsVider">Tout retirer</button>
          </div>
          <div id="obsListe"></div>

          <div class="frise-tete">
            <div class="champ">
              <label for="obsDate">Date de l’étude</label>
              <select id="obsDate" name="obsDate">
                ${DATES_SOLEIL.map((d) => `<option value="${d.id}"${
    d.id === 'hiver' ? ' selected' : ''}>${d.nom}</option>`).join('')}
              </select>
            </div>
            <div class="champ">
              <label for="obsHeure">Heure — <span id="obsHeureTxt">12 h 00</span></label>
              <input id="obsHeure" type="range" min="5" max="20" step="0.25" value="12">
            </div>
          </div>
          <p class="indice" id="obsSoleil" role="status" aria-live="polite"></p>
          <div id="obsFrise"></div>
          <div id="obsBilan"></div>
        </details>

        <div id="arbreScene"></div>
      </details>

      <details class="repli" id="etalonnageToit">
        <summary>L’échelle ne tombe pas juste ?
          <span class="repli-etat" id="etalonEtat">non étalonné</span></summary>
        <p class="indice">Une image aérienne n’est pas une carte au cordeau : prise
          de vue oblique, relief, géoréférencement. Mesurez une longueur connue sur
          place — une façade, un mur —, tracez-la ici, et l’échelle se corrige.
          La correction reste visible.</p>
        <div class="duo">
          <div class="champ">
            <label for="etalonTrace">Longueur lue sur le tracé (m)</label>
            <input id="etalonTrace" type="number" inputmode="decimal" min="0"
              step="0.01" readonly aria-readonly="true">
          </div>
          <div class="champ">
            <label for="etalonReel">Longueur mesurée sur place (m)</label>
            <input id="etalonReel" type="number" inputmode="decimal" min="0"
              max="500" step="0.01" placeholder="8.40">
          </div>
        </div>
        <p class="indice">La longueur lue est celle du dernier côté tracé.
          Tracez d’abord la référence, puis saisissez sa mesure réelle.</p>
        <div class="outils">
          <button type="button" class="btn fantome" id="etalonAppliquer">Corriger l’échelle</button>
          <button type="button" class="btn fantome" id="etalonAnnuler">Revenir à l’échelle d’origine</button>
        </div>
        <p class="indice" id="etalonMot" role="status" aria-live="polite"></p>
      </details>
    </details>
    <details class="repli"><summary>Je ne sais pas l’orientation</summary>
      <p>Placez-vous devant votre bâtiment, face à la façade principale. Au
      milieu de la journée, le soleil est au sud : le pan qui reçoit le plus de
      soleil à midi est le bon. Dans le doute, laissez « Plein sud » — l’étude
      détaillée le vérifiera sur place.</p></details>`,
    lire: () => ({
      pente: $('pente')?.value ?? 'moyenne',
      orientation: $('orientation')?.value ?? 'sud',
      L: Number($('toitL')?.value) || 0,
      P: Number($('toitP')?.value) || 0,
      // LE TRACÉ NE VIT PAS DANS LE FORMULAIRE. Sans cette ligne, la première
      // sauvegarde venue reconstruisait `reponses.toit` à partir des quatre
      // champs visibles et emportait le contour avec elle : un quart d'heure
      // de tracé disparaissait au rechargement, sans message ni trace.
      trace: reponses.toit?.trace ?? null,
    }),
    valide: (v) => {
      // Les deux cotes vont ensemble : une seule ne dessine aucun toit.
      if (!v.L && !v.P) return null; // facultatif, et assumé comme tel
      if (!v.L || !v.P) return 'Indiquez les deux cotes, ou laissez-les vides toutes les deux.';
      if (v.L * v.P < 4) return 'Ce pan paraît trop petit pour porter des panneaux.';
      return null;
    },
    restaure: (v) => {
      if ($('pente')) $('pente').value = v.pente ?? 'moyenne';
      if ($('orientation')) $('orientation').value = v.orientation ?? 'sud';
      if ($('toitL')) $('toitL').value = v.L || '';
      if ($('toitP')) $('toitP').value = v.P || '';
      majOrientation();
    },
  },
  {
    cle: 'installation',
    numero: '05',
    court: 'Installation',
    titre: 'Comment poser les panneaux ?',
    aide: 'Le calcul propose la disposition la plus dense. Vous pouvez la '
      + 'forcer dans un sens — le plan dit aussitôt ce que cela coûte.',
    champ: () => `<div class="champ">
      <label for="modulePv">Module</label>
      <select id="modulePv" name="modulePv">
        ${MODULES.map((m) => `<option value="${m.id}"${
          m.defaut ? ' selected' : ''}>${m.nom} — ${m.resume}</option>`).join('')}
      </select>
    </div>
    <div class="cartes-choix serre" id="poses" role="radiogroup" aria-label="Pose des modules">
      ${POSES.map((p) => `<button type="button" class="carte-choix" role="radio"
        aria-checked="false" data-pose="${p.id}">
        <b>${p.nom}</b><span>${p.resume}</span>
      </button>`).join('')}
    </div>
    <p style="margin-top:16px"><button type="button" class="btn or" id="optimiser">
      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M13 2 3 14h8l-1 8 10-12h-8l1-8z"/></svg>
      Optimiser automatiquement</button></p>
    <div class="apercu-pose" id="apercuPose" role="status" aria-live="polite"></div>`,
    lire: () => ({ module: $('modulePv')?.value ?? MODULE_DEFAUT.id, pose: poseChoisie }),
    valide: () => null,
    restaure: (v) => {
      if (v.pose && POSES.some((p) => p.id === v.pose)) poseChoisie = v.pose;
      if ($('modulePv') && v.module) $('modulePv').value = v.module;
    },
  },
];

let etape = 0;

/* ------------------------------------------------------------------ */
/* Reprise                                                             */
/* ------------------------------------------------------------------ */

/**
 * Range où en est le visiteur, après chaque étape validée.
 *
 * Un appel, un SMS, un onglet tué par Android : le parcours s'interrompt pour
 * mille raisons qui n'ont rien à voir avec l'envie de continuer. Sans cela, il
 * faudrait tout ressaisir — et personne ne ressaisit.
 */
function memoriser(fini = false) {
  return enregistrer({ etape, fini, reponses });
}

/**
 * Les étapes du parcours, dans l'ordre. Ce sont elles qu'on compte devant le
 * visiteur, et elles qui disent jusqu'où une reprise peut aller.
 */
const CLES = ETAPES.map((e) => e.cle);

/**
 * Ce qu'une simulation enregistrée a le droit de contenir.
 *
 * Distinct des étapes, et pour une raison précise. `position` n'est l'étape de
 * personne : elle se remplit par le capteur, la carte ou la saisie, à côté du
 * gouvernorat. Tant qu'elle manquait à cette liste, elle était **enregistrée
 * puis jetée à la reprise** — le visiteur retrouvait son gouvernorat mais
 * perdait le point exact, donc l'altitude, donc les données solaires locales,
 * sans que rien ne le signale.
 *
 * L'ajouter aux étapes aurait été pire : le bandeau aurait annoncé « 4
 * réponses sur 6 » pour un parcours qui en compte cinq, et la reprise se
 * serait arrêtée à une étape qui n'existe pas.
 */
const CLES_STOCKEES = [...CLES, 'position'];

/**
 * Ne garde d'un état relu que ce que la version actuelle sait afficher.
 *
 * Le stockage survit aux mises en ligne : une simulation d'hier peut porter
 * une clé qui n'existe plus, ou manquer d'une clé nouvelle. Filtrer ici évite
 * qu'un ancien format ne casse la page à l'ouverture.
 */
function reponsesRetenues(brutes) {
  const propres = {};
  if (!brutes || typeof brutes !== 'object') return propres;
  for (const cle of CLES_STOCKEES) {
    if (brutes[cle] !== undefined && brutes[cle] !== null) propres[cle] = brutes[cle];
  }
  return propres;
}

/**
 * Propose de reprendre — sans jamais l'imposer.
 *
 * Restaurer d'office serait déroutant : le visiteur qui revient exprès pour
 * refaire un calcul avec d'autres chiffres verrait les anciens revenir seuls.
 * On montre ce qui est en mémoire, il choisit.
 */
function proposerReprise() {
  const banniere = $('reprise');
  if (!banniere) return;
  const memoire = relire();
  if (!memoire) return;

  const gardees = reponsesRetenues(memoire.etat?.reponses);
  if (!Object.keys(gardees).length) { effacer(); return; }
  // On compte les ÉTAPES franchies, pas les clés rangées : la position n'en
  // est pas une, et l'annoncer comme telle donnerait « 4 réponses sur 6 »
  // devant un parcours qui en compte cinq.
  const combien = CLES.filter((c) => gardees[c] !== undefined).length;
  if (!combien) { effacer(); return; }

  const fini = memoire.etat?.fini === true && combien === CLES.length;
  banniere.hidden = false;
  banniere.innerHTML = `<p class="reprise-txt"><b>Vous avez commencé une étude</b>
    ${ageEnClair(memoire.age)}${fini ? ' — elle est terminée.'
      : ` : ${combien} réponse${combien > 1 ? 's' : ''} sur ${CLES.length}.`}</p>
    <div class="reprise-actes">
      <button class="btn primaire" type="button" id="reprendre">${
        fini ? 'Revoir mon étude' : 'Reprendre'}</button>
      <button class="btn" type="button" id="oublier">Recommencer</button>
    </div>`;

  $('reprendre').addEventListener('click', () => {
    Object.assign(reponses, gardees);
    banniere.hidden = true;
    if (fini) { dessinerResultat(); return; }
    // Jamais plus loin que ce qui est réellement rempli : une étape reprise
    // sur des réponses manquantes afficherait un écran vide.
    const rempli = CLES.findIndex((c) => gardees[c] === undefined);
    const vise = Number.isInteger(memoire.etat?.etape) ? memoire.etat.etape : 0;
    etape = Math.max(0, Math.min(vise, rempli === -1 ? CLES.length - 1 : rempli));
    dessinerEtape();
    $('tunnel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $('oublier').addEventListener('click', () => {
    effacer();
    banniere.hidden = true;
  });
}

/* ------------------------------------------------------------------ */
/* Affichage                                                           */
/* ------------------------------------------------------------------ */

/**
 * LA BARRE DE PROGRESSION — nommée, et non numérotée.
 *
 * « 3 sur 5 » ne dit rien de ce qui reste à faire, et un visiteur qui ignore
 * ce qui l'attend abandonne. « 04 Toiture » se lit d'un coup d'œil : il sait
 * où il en est, ce qu'il a déjà donné, et ce qu'on lui demandera encore.
 *
 * Les étapes franchies sont cliquables : revenir corriger un chiffre ne doit
 * pas coûter quatre clics sur « Retour ».
 */
const COCHE = '<svg aria-hidden="true" viewBox="0 0 24 24" width="13" height="13" fill="none" '
  + 'stroke="currentColor" stroke-width="3.4" stroke-linecap="round" '
  + 'stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

function dessinerJauge() {
  const pas = ETAPES.map((e, i) => {
    const etat = i < etape ? 'faite' : i === etape ? 'active' : 'avenir';
    // Une étape à venir n'est pas cliquable : elle s'appuie sur des réponses
    // qui n'existent pas encore.
    const cliquable = i < etape;
    return `<button type="button" class="pas ${etat}" data-pas="${i}"
      ${cliquable ? '' : 'disabled'} ${i === etape ? 'aria-current="step"' : ''}>
      <span class="pas-num">${i < etape ? COCHE : e.numero}</span>
      <span class="pas-nom">${e.court}</span>
    </button>`;
  }).join('');
  const fini = etape >= ETAPES.length;
  $('jauge').innerHTML = pas + `<button type="button" class="pas ${
    fini ? 'active' : 'avenir'}" disabled>
      <span class="pas-num">06</span><span class="pas-nom">Résultats</span>
    </button>`;
  $('jauge').setAttribute('aria-label',
    `Étape ${Math.min(etape + 1, ETAPES.length)} sur ${ETAPES.length + 1}`);

  // Sur un téléphone, six étapes ne tiennent pas dans la largeur : la barre
  // défile, et sans ce recentrage le visiteur ne verrait jamais où il en est.
  //
  // On déplace la barre elle-même plutôt que d'appeler scrollIntoView : ce
  // dernier fait aussi défiler la page, et glissait la barre sous le bandeau
  // collant — exactement l'inverse de ce qu'on cherche.
  const barre = $('jauge');
  const actif = barre.querySelector('.pas.active');
  if (actif) {
    barre.scrollTo({
      left: actif.offsetLeft - (barre.clientWidth - actif.offsetWidth) / 2,
      behavior: 'smooth',
    });
  }
}

/* ------------------------------------------------------------------ */
/* Sauvegarde continue                                                 */
/* ------------------------------------------------------------------ */

/** Le dernier enregistrement annoncé, pour ne pas clignoter à chaque touche. */
let annonceSauvegarde = 0;

/**
 * ENREGISTRER PENDANT LA FRAPPE, PAS SEULEMENT À LA VALIDATION.
 *
 * Une étape validée était conservée ; une étape en cours de saisie ne l'était
 * pas. Le visiteur qui tape la moitié de ses chiffres, bascule sur son
 * application STEG pour lire la seconde moitié, et revient — c'est le
 * parcours le plus fréquent, pas un cas limite — retrouvait sa saisie effacée
 * par le navigateur Android qui avait tué l'onglet entre-temps.
 *
 * Ce qui est écrit ici n'a pas été validé : c'est assumé. Rien ne peut
 * atteindre le résultat sans passer la validation à la soumission.
 */
function sauvegardeContinue() {
  const e = ETAPES[etape];
  if (!e?.lire) return;
  try { reponses[e.cle] = e.lire(); } catch { return; }
  if (memoriser()) marquerSauvegarde();
}

/**
 * Le témoin « Simulation sauvegardée ».
 *
 * Espacé d'au moins une seconde et demie : un témoin qui clignote à chaque
 * touche inquiète au lieu de rassurer.
 */
function marquerSauvegarde() {
  const marque = $('sauvegarde');
  if (!marque) return;
  const maintenant = Date.now();
  if (maintenant - annonceSauvegarde < 1500) return;
  annonceSauvegarde = maintenant;
  marque.hidden = false;
  marque.classList.remove('vif');
  // Redémarrer l'animation : sans ce reflow forcé, la classe remise
  // aussitôt ne relance rien.
  void marque.offsetWidth;
  marque.classList.add('vif');
}

function dessinerEtape() {
  const e = ETAPES[etape];
  $('etapes').innerHTML = `<h3>${e.titre}</h3><p class="aide">${e.aide}</p>${e.champ()}`;
  $('erreur').textContent = '';
  $('retour').hidden = etape === 0;
  $('suivant').textContent = etape === ETAPES.length - 1 ? 'Voir mon étude' : 'Suivant';
  dessinerJauge();

  // Une étape peut porter plusieurs champs : elle dit alors comment se
  // restaurer, plutôt que de supposer un champ unique du nom de la clé.
  if (e.restaure) e.restaure(reponses[e.cle] ?? {});
  const saisi = document.getElementById(e.cle);
  if (saisi) {
    if (reponses[e.cle] !== undefined) saisi.value = reponses[e.cle];
    saisi.focus({ preventScroll: true });
  }
  brancherLocalisation();
  brancherTracage();
  brancherOrientation();
  brancherConsommation();
  brancherBatiment();
  brancherInstallation();
  brancherSauvegarde();
  brancherJauge();
}

/** Toute frappe dans le formulaire est conservée, sans attendre « Suivant ». */
function brancherSauvegarde() {
  const f = $('form');
  if (!f || f.dataset.sauvegarde === 'oui') return;
  f.dataset.sauvegarde = 'oui';
  f.addEventListener('input', sauvegardeContinue);
  f.addEventListener('change', sauvegardeContinue);
}

/** Revenir à une étape déjà franchie, d'un seul geste. */
function brancherJauge() {
  const j = $('jauge');
  if (!j || j.dataset.branche === 'oui') return;
  j.dataset.branche = 'oui';
  j.addEventListener('click', (ev) => {
    const pas = ev.target.closest('[data-pas]');
    if (!pas || pas.disabled) return;
    const vise = Number(pas.dataset.pas);
    if (!Number.isInteger(vise) || vise >= etape) return;
    etape = vise;
    $('resultat').hidden = true;
    $('form').hidden = false;
    dessinerEtape();
    $('tunnel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

/** Le type de bâtiment : quatre cartes, et ce que chacune change. */
function brancherBatiment() {
  const hote = $('batiments');
  if (!hote) return;
  const peindre = () => {
    for (const carte of hote.querySelectorAll('[data-batiment]')) {
      const actif = carte.dataset.batiment === typeBat;
      carte.classList.toggle('choisi', actif);
      carte.setAttribute('aria-checked', String(actif));
    }
    const t = typeBatiment(typeBat);
    if ($('noteBatiment')) $('noteBatiment').textContent = t ? t.note : '';
  };
  hote.addEventListener('click', (ev) => {
    const carte = ev.target.closest('[data-batiment]');
    if (!carte) return;
    typeBat = carte.dataset.batiment;
    reponses.batiment = typeBat;
    peindre();
    if (memoriser()) marquerSauvegarde();
  });
  peindre();
}

/**
 * L'étape Installation : la pose se voit au lieu de se lire.
 *
 * Un champ « orientation des modules : portrait/paysage » ne dit rien à
 * personne. Le plan redessiné à chaque clic, avec le nombre de modules et la
 * puissance qui bougent, dit tout sans une phrase.
 */
function brancherInstallation() {
  const hote = $('poses');
  if (!hote) return;

  const peindre = () => {
    for (const carte of hote.querySelectorAll('[data-pose]')) {
      const actif = carte.dataset.pose === poseChoisie;
      carte.classList.toggle('choisi', actif);
      carte.setAttribute('aria-checked', String(actif));
    }
    dessinerApercuPose();
  };

  hote.addEventListener('click', (ev) => {
    const carte = ev.target.closest('[data-pose]');
    if (!carte) return;
    poseChoisie = carte.dataset.pose;
    reponses.installation = { module: $('modulePv')?.value, pose: poseChoisie };
    peindre();
    if (memoriser()) marquerSauvegarde();
  });

  $('modulePv')?.addEventListener('change', () => {
    reponses.installation = { module: $('modulePv').value, pose: poseChoisie };
    dessinerApercuPose();
  });

  $('optimiser')?.addEventListener('click', () => {
    const { L, P } = cotesToit();
    const zone = $('apercuPose');
    if (!L || !P) {
      zone.innerHTML = '<p class="indice">Revenez à l’étape Toiture pour donner '
        + 'les cotes du pan : sans elles, il n’y a rien à optimiser.</p>';
      return;
    }
    const meilleur = optimiser(L, P, { modules: MODULES });
    if (!meilleur) return;
    poseChoisie = meilleur.pose;
    if ($('modulePv')) $('modulePv').value = meilleur.module.id;
    reponses.installation = { module: meilleur.module.id, pose: poseChoisie };
    peindre();
    if (memoriser()) marquerSauvegarde();
  });

  peindre();
}

/** Le plan du pan tel que les réglages courants le donnent. */
function dessinerApercuPose() {
  const zone = $('apercuPose');
  if (!zone) return;
  const { L, P } = cotesToit();
  const mod = moduleParId($('modulePv')?.value);
  if (!L || !P) {
    zone.innerHTML = `<p class="indice">Sans les cotes de votre toiture, la
      disposition ne peut pas être dessinée. L’étude reste possible : elle
      dimensionnera sur votre consommation, sans contrainte de surface.</p>`;
    return;
  }
  const trace = planCalepinage(L, P, { largeurPx: 520, module: mod, pose: poseChoisie });
  if (!trace) {
    zone.innerHTML = `<p class="indice">Aucun module de ce format ne tient sur un
      pan de ${String(L).replace('.', ',')} × ${String(P).replace('.', ',')} m
      dans cette pose. Essayez l’autre pose, ou un module plus court.</p>`;
    return;
  }
  const c = trace.plan;
  const perte = c.alternative && c.alternative > c.nombre ? c.alternative - c.nombre : 0;
  zone.innerHTML = `<div class="pose-chiffres">
      <div><b>${c.nombre}</b><span>modules</span></div>
      <div><b>${mod.puissance}</b><span>Wc chacun</span></div>
      <div class="fort"><b>${String(c.puissance).replace('.', ',')}</b><span>kWc</span></div>
    </div>
    <div class="graphe">${trace.svg}</div>
    <p class="indice">${c.rangees} rangée${c.rangees > 1 ? 's' : ''} de ${c.colonnes},
      posés en ${c.orientation}, marges de rive et jeux compris.${
      perte ? ` Cette pose coûte ${perte} module${perte > 1 ? 's' : ''} par rapport
      à l’autre sens.` : ''}</p>`;
}

/** Dit à l'écran ce que l'orientation choisie coûte, avant même le résultat. */
function majOrientation() {
  const note = $('noteOrientation');
  if (!note) return;
  const pente = $('pente')?.value;
  const orientation = $('orientation')?.value;
  note.textContent = expliquerOrientation(orientation, pente) ?? '';
  // Sur une terrasse, l'orientation du bâtiment ne joue plus : la demander
  // ferait croire qu'elle compte.
  const champ = $('champOrientation');
  if (champ) champ.hidden = pente === 'plat';
}

function brancherOrientation() {
  for (const id of ['pente', 'orientation']) {
    $(id)?.addEventListener('change', majOrientation);
  }
  majOrientation();
}

/**
 * MODULE 1 — LA LOCALISATION PROFESSIONNELLE.
 *
 * Trois chemins vers le même point : le capteur du terminal, un repère posé
 * sur la carte, des coordonnées écrites à la main. Aucun n'est meilleur dans
 * l'absolu — le GPS est inutilisable à l'intérieur d'un bâtiment, la carte
 * demande un fond, la saisie demande de connaître ses coordonnées. Les trois
 * existent donc, et chacun étiquette ce qu'il produit.
 *
 * Ce qui n'est jamais fait ici : présenter une position comme meilleure
 * qu'elle n'est. Une position vaut ce que vaut sa source, et la fiche
 * l'affiche à chaque fois.
 */
let carte = null;

/** Le point courant, ou celui du gouvernorat, ou Tunis à défaut de tout. */
function pointDeDepart() {
  const p = position();
  if (Number.isFinite(p.latitude) && Number.isFinite(p.longitude)) {
    return { latitude: p.latitude, longitude: p.longitude };
  }
  return { latitude: 36.8065, longitude: 10.1815 };
}

/** Redessine la fiche de position et le résumé du volet. */
function majFichePosition() {
  const p = position();
  const portrait = decrire({
    latitude: p.latitude,
    longitude: p.longitude,
    precision: p.precisionPosition,
    altitude: p.altitude,
    horodatage: p.horodatagePosition,
    origine: p.originePosition,
  });
  const fiche = $('fichePos');
  if (fiche) {
    fiche.innerHTML = fichePosition(portrait, {
      gouvernorat: reponses.gouvernorat ? nomGouvernorat(reponses.gouvernorat) : null,
    });
  }
  const etat = $('precisionEtat');
  if (etat) {
    etat.textContent = portrait.connue && p.originePosition !== 'centre-gouvernorat'
      ? portrait.precision.libelle
      : 'non situé';
    etat.className = `repli-etat repli-${portrait.connue
      && p.originePosition !== 'centre-gouvernorat' ? portrait.precision.cle : 'vide'}`;
  }
  const champ = $('coordonnees');
  if (champ && document.activeElement !== champ
    && Number.isFinite(p.latitude) && p.originePosition !== 'centre-gouvernorat') {
    champ.value = formaterPoint(p.latitude, p.longitude);
  }
}

/** Retient une position venue de n'importe quel chemin, puis rafraîchit tout. */
function retenirPosition(brute, { recentrer = true } = {}) {
  const retenue = definirPosition(brute);
  if (!retenue) return false;
  // LE GOUVERNORAT SUIT LE POINT, ET ON LE DIT.
  //
  // Défaut observé : un point saisi à Sousse laissait « Ariana » dans la
  // liste. L'étude calculait alors l'ensoleillement d'Ariana pour un toit de
  // Sousse, et la carte montrait Sousse — trois écrans d'accord entre eux
  // sauf sur le lieu. Le point est plus précis que la case : il l'emporte.
  // Mais un changement silencieux serait aussi trompeur : il est annoncé.
  const proche = gouvernoratLePlusProche(retenue.latitude, retenue.longitude);
  if (proche && proche.id !== reponses.gouvernorat) {
    const avant = reponses.gouvernorat;
    reponses.gouvernorat = proche.id;
    const liste = $('gouvernorat');
    if (liste) liste.value = proche.id;
    const etat = $('geoEtat');
    if (etat && avant) {
      etat.textContent = `Ce point se trouve à ${nomGouvernorat(proche.id)} : le `
        + `gouvernorat a été mis à jour (il indiquait ${nomGouvernorat(avant)}). `
        + 'Corrigez la liste si ce n’est pas le bon.';
    }
  }
  if (recentrer) carte?.deplacer(retenue);
  majFichePosition();
  memoriser();
  return true;
}

/** Le capteur du terminal. `haute` sollicite le GPS. */
async function demanderPosition(haute) {
  const etat = $('geoEtat');
  const boutons = [$('localiser'), $('localiserFin')].filter(Boolean);
  for (const b of boutons) b.disabled = true;
  if (etat) {
    etat.textContent = haute
      ? 'Recherche GPS en cours… cela peut prendre une dizaine de secondes.'
      : 'Recherche de votre position…';
  }
  const r = await localiser({ haute, delai: haute ? 20000 : 8000 });
  for (const b of boutons) b.disabled = false;
  if (!r.ok) { if (etat) etat.textContent = REFUS[r.raison]; return; }

  const liste = $('gouvernorat');
  if (liste) liste.value = r.id;
  reponses.gouvernorat = r.id;
  retenirPosition(r);

  const precision = Number.isFinite(r.precision)
    ? ` Précision annoncée : ± ${Math.round(r.precision)} m.` : '';
  if (etat) {
    etat.textContent = `Vous semblez être à ${nomGouvernorat(r.id)}.${precision}`
      + ' Corrigez ci-dessous si ce n’est pas le bon gouvernorat.';
  }
  $('precisionSite')?.setAttribute('open', '');
}

/** La saisie manuelle : le dernier recours, et parfois le plus précis. */
function brancherSaisieCoordonnees() {
  const champ = $('coordonnees');
  const erreur = $('coordonneesErreur');
  if (!champ) return;
  const appliquer = () => {
    const texte = champ.value.trim();
    if (!texte) { if (erreur) erreur.textContent = ''; return; }
    const lu = lireCoordonnees(texte);
    if (!lu) {
      // On ne devine pas : un « 36.8 10.1 » mal recopié deviendrait une
      // position fausse, affichée avec le même aplomb qu'une bonne.
      if (erreur) {
        erreur.textContent = 'Coordonnées non reconnues. Exemple : 36.806500, 10.181500';
      }
      return;
    }
    if (!enTunisie(lu.latitude, lu.longitude)) {
      if (erreur) {
        erreur.textContent = 'Ce point est hors de Tunisie. Vérifiez l’ordre : '
          + 'la latitude vient en premier.';
      }
      return;
    }
    if (erreur) erreur.textContent = '';
    retenirPosition({ ...lu, origine: 'saisie', precision: null });
  };
  champ.addEventListener('change', appliquer);
  champ.addEventListener('blur', appliquer);
  champ.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); appliquer(); }
  });
}

/** La carte, quand la page en déclare une — et l'explication quand non. */
function brancherCarte() {
  const boite = $('carteSite');
  // Quitter l'étape détruit la carte : sans cela, son observateur de taille
  // continuerait de surveiller un élément que la page a déjà remplacé.
  carte?.detruire();
  carte = null;
  if (!boite) return;
  carte = creerCarte(boite, {
    point: pointDeDepart(),
    zoom: 17,
    surDeplacement: (p) => retenirPosition(p, { recentrer: false }),
  });
  const mot = $('carteMot');
  if (mot) {
    const cap = capacitesCarte();
    const fond = fondActif();
    mot.textContent = cap.phrase + (fond?.avertissement ? ` ${fond.avertissement}` : '');
    mot.className = `indice${cap.image ? '' : ' indice-absent'}`;
  }
}

/* ------------------------------------------------------------------ */
/* MODULE 2 — DESSINER ET MESURER LE TOIT                              */
/* ------------------------------------------------------------------ */

/**
 * POURQUOI CE MODULE EXISTE.
 *
 * Le formulaire demandait deux cotes et en déduisait un rectangle. Un toit
 * tunisien réel a un décroché, une terrasse, un pan coupé — et surtout,
 * personne ne connaît ses cotes par cœur, alors qu'on sait très bien suivre
 * le bord de sa maison du doigt sur une image.
 *
 * CE QUE CE MODULE NE FAIT PAS : il ne calcule aucune longueur. Tout vient de
 * `toiture.js`. Le contrôleur pose des points, le domaine les mesure, la vue
 * les dessine. Trois responsabilités, trois fichiers, un seul chemin de calcul.
 *
 * CE QU'IL N'AFFIRME JAMAIS : qu'une mesure lue sur une image est une cote
 * relevée. La réserve accompagne chaque chiffre, et l'application des cotes au
 * formulaire ne les transforme pas en certitudes.
 */
let carteToit = null;
let sommetsToit = [];
let facteurEchelle = 1;
let echelleEtalonnee = false;

/** La pente déclarée, en degrés — c'est elle qui donne le rampant. */
function penteDegres() {
  const id = $('pente')?.value ?? reponses.toit?.pente ?? 'moyenne';
  return { plat: 0, faible: 15, moyenne: 30, forte: 45 }[id] ?? 30;
}

/** Les mesures courantes du tracé, telles que le domaine les rend. */
const mesuresToit = () => mesurerToit(sommetsToit, {
  pente: penteDegres(), facteur: facteurEchelle, etalonne: echelleEtalonnee,
});

/** Redessine le tracé, ses cotes et le tableau de mesures. */
function majTrace() {
  const m = mesuresToit();
  carteToit?.definirTrace({ sommets: sommetsToit, cotes: m.cotes });

  const etat = $('traceEtat');
  if (etat) {
    etat.textContent = m.exploitable
      ? `${m.surfaceRampant.toFixed(1)} m²`
      : (sommetsToit.length ? `${sommetsToit.length} point${
        sommetsToit.length > 1 ? 's' : ''}` : 'non tracé');
    etat.className = `repli-etat repli-${m.exploitable ? 'bonne' : 'vide'}`;
  }

  const appliquer = $('traceAppliquer');
  if (appliquer) appliquer.disabled = !m.exploitable;

  // La dernière cote sert de référence d'étalonnage : c'est celle que
  // l'utilisateur vient de tracer, donc celle qu'il a en tête.
  const ref = m.cotes.length ? m.cotes[m.cotes.length - 1] : null;
  const champRef = $('etalonTrace');
  if (champRef) champRef.value = ref ? ref.longueur.toFixed(2) : '';

  // Le volume suit le tracé : le laisser en arrière montrerait un bâtiment
  // qui ne correspond plus aux mètres carrés affichés au-dessus.
  majVue3d();
  retenirEtatToit();

  const zone = $('traceMesures');
  if (!zone) return;
  if (!sommetsToit.length) {
    zone.innerHTML = `<p class="indice">Appuyez sur la carte pour poser le premier
      point du contour.</p>`;
    return;
  }
  if (!m.exploitable) {
    zone.innerHTML = `<p class="alerte-trace">${echapper(m.probleme.message)}</p>`;
    return;
  }
  zone.innerHTML = ficheMesures(m);
}

/** Le tableau de mesures — présentation pure, aucun calcul. */
function ficheMesures(m) {
  const ligne = (nom, valeur) => `<div class="pos-l"><dt>${nom}</dt>
    <dd>${valeur}</dd></div>`;
  const pan = m.faitageProbable;
  const azPan = azimutProbableDuPan(m);
  return `<dl class="pos-faits mesures">
    ${ligne('Surface au sol (vue du ciel)', `${m.surfaceProjetee.toFixed(1)} m²`)}
    ${ligne(`Surface du rampant (pente ${m.pente}°)`,
    `<b>${m.surfaceRampant.toFixed(1)} m²</b>`)}
    ${ligne('Supplément dû à la pente', `+ ${m.supplementPente.toFixed(1)} m²`)}
    ${ligne('Périmètre', `${m.perimetre.toFixed(1)} m`)}
    ${ligne('Points du contour', String(m.points))}
    ${ligne('Côté le plus long', pan
    ? `${pan.longueur.toFixed(1)} m, orienté ${pan.capEnClair}` : '—')}
    ${azPan !== null ? ligne('Orientation probable du pan',
    `azimut ${Math.round(azPan)}° (0 = plein sud)`) : ''}
    ${m.etalonne ? ligne('Échelle corrigée',
    `× ${m.facteur.toFixed(3)}`) : ''}
  </dl>
  <p class="pos-phrase reserve">${echapper(m.reserve)}</p>`;
}

/** Reporte les mesures du tracé dans les cotes du formulaire. */
function appliquerTrace() {
  const m = mesuresToit();
  if (!m.exploitable) return;
  // On ne remplace pas un toit réel par un rectangle en douce : le formulaire
  // attend deux cotes, on lui donne le rectangle de MÊME SURFACE que le
  // rampant, dans les proportions du tracé — et on le dit.
  const cotesTriees = [...m.cotes].sort((a, b) => b.longueur - a.longueur);
  const L = cotesTriees[0]?.longueur ?? 0;
  const P = L > 0 ? m.surfaceRampant / L : 0;
  if ($('toitL')) $('toitL').value = L.toFixed(1);
  if ($('toitP')) $('toitP').value = P.toFixed(1);

  // La liste du formulaire ne connaît que huit directions ; le tracé donne un
  // angle exact. On retient la plus proche — le choix est fait par le domaine,
  // sous test, parce que c'est exactement là qu'une erreur de signe avait
  // déclaré plein nord un pan plein sud.
  const azPan = azimutProbableDuPan(m);
  const proche = azPan === null ? null
    : orientationLaPlusProche(azPan, AZIMUTS_FORMULAIRE);
  if (proche && $('orientation')) $('orientation').value = proche.id;

  reponses.toit = { ...(reponses.toit ?? {}), L: Number(L.toFixed(1)),
    P: Number(P.toFixed(1)), pente: $('pente')?.value ?? 'moyenne',
    orientation: $('orientation')?.value ?? 'sud',
    trace: { sommets: sommetsToit, facteur: facteurEchelle,
      etalonne: echelleEtalonnee, surface: m.surfaceRampant,
      // Ce que le toit peut porter, retenu tel quel — sans jamais l'imposer
      // au dimensionnement, qui part de la consommation.
      capacite: planImplantation?.nombre
        ? { modules: planImplantation.nombre, kwc: planImplantation.puissance,
          pose: planImplantation.orientation, rive: planImplantation.rive }
        : null,
      obstacles,
      modulesPoses } };
  majOrientation();
  memoriser();

  const zone = $('traceMesures');
  if (zone) {
    zone.insertAdjacentHTML('afterbegin',
      `<p class="pos-phrase applique">Cotes reprises : ${L.toFixed(1)} m ×
        ${P.toFixed(1)} m, soit la surface du rampant tracé
        (${m.surfaceRampant.toFixed(1)} m²) ramenée à un rectangle équivalent.
        Le contour exact reste enregistré.</p>`);
  }
}

/** Les azimuts de la liste du formulaire, dans la convention du projet. */
const AZIMUTS_FORMULAIRE = { sud: 0, 'sud-est': -45, 'sud-ouest': 45,
  est: -90, ouest: 90, 'nord-est': -135, 'nord-ouest': 135, nord: 180 };

/* ------------------------------------------------------------------ */
/* MODULE 3 — LE BÂTIMENT EN VOLUME                                    */
/* ------------------------------------------------------------------ */

/**
 * POURQUOI LA 3D SERT À AUTRE CHOSE QU'À FAIRE JOLI.
 *
 * Une surface se mesure à plat. Une implantation, non : une pente, un débord,
 * un mur mitoyen plus haut ne se lisent pas sur un plan. C'est en volume qu'on
 * voit qu'un pan descend du mauvais côté — et c'est exactement le défaut qui
 * s'est glissé dans le premier jet de la géométrie, invisible sur le papier.
 *
 * LE MODÈLE EST DÉLIBÉRÉMENT PAUVRE : un seul pan, d'une seule pente, d'une
 * seule orientation. C'est le toit que le reste du projet calcule. Dessiner
 * ici une toiture à quatre pans que le gisement, le calepinage et l'étude
 * ignorent donnerait une belle image et une étude fausse — c'est la sorte de
 * mensonge tranquille que ce projet refuse.
 */
let vue3d = null;

/** La hauteur de mur déclarée, en mètres. */
function hauteurMurSaisie() {
  const v = Number($('hauteurMur')?.value);
  return Number.isFinite(v) && v >= 0 && v <= 40 ? v : 3;
}

/** Les modules sont-ils posés ? Un état, pas une supposition. */
let modulesPoses = false;
/** Le dernier plan d'implantation calculé, pour les compteurs et le report. */
let planImplantation = null;

/** Le contour du toit en mètres, échelle d'étalonnage comprise. */
function contourMetrique() {
  if (sommetsToit.length < 3) return null;
  const m = mesuresToit();
  if (!m.exploitable) return null;
  const { points } = projeterSommets(sommetsToit);
  // L'étalonnage porte sur les longueurs : le volume doit en tenir compte,
  // sinon il ne serait pas celui qu'on a mesuré juste au-dessus.
  const k = m.facteur;
  return { points: points.map((p) => ({ x: p.x * k, y: p.y * k })), mesures: m };
}

/**
 * La scène, construite depuis le contour tracé.
 *
 * Le contour est géographique ; la scène est métrique. C'est la MÊME
 * projection que celle des mesures : deux projections différentes donneraient
 * un volume qui ne correspondrait pas aux mètres carrés affichés au-dessus.
 */
function sceneCourante() {
  const c = contourMetrique();
  if (!c) return null;
  const azPan = azimutProbableDuPan(c.mesures) ?? 0;
  const scene = construireScene(c.points, {
    pente: penteDegres(),
    azimut: azPan,
    hauteurMur: hauteurMurSaisie(),
  });

  planImplantation = modulesPoses
    ? implanter(c.points, {
      module: reglagePose().module,
      pose: $('modulePose')?.value ?? 'auto',
      pente: penteDegres(),
      azimut: azPan,
      rive: riveSaisie(),
    })
    : null;

  const facesModules = planImplantation?.modules?.length
    ? eleverModules(planImplantation, scene.toit) : [];

  // Les obstacles et leurs ombres entrent dans la scène après les modules :
  // c'est en les calculant qu'on apprend quels modules sont touchés.
  const facesObstacles = facesOmbrage(scene);
  const touches = new Set(dernierOmbrage?.indices ?? []);
  for (const f of facesModules) f.ombre = touches.has(f.index);

  // Les modules entrent comme des faces à part entière : ils se trient avec le
  // reste, s'éclairent comme le reste, et s'éteignent avec leur propre bouton.
  scene.faces.push(...facesModules, ...facesObstacles);
  return scene;
}

/* ------------------------------------------------------------------ */
/* MODULE 4 — OBSTACLES ET OMBRAGE                                     */
/* ------------------------------------------------------------------ */

/**
 * Les obstacles relevés par l'utilisateur. Rien n'est jamais supposé : un toit
 * sans obstacle relevé est un toit dont on ne sait rien, pas un toit dégagé.
 */
let obstacles = [];
let dernierOmbrage = null;

/** La date et l'heure de l'étude d'ombrage. */
const instantOmbrage = () => ({
  date: dateRepere($('obsDate')?.value ?? 'hiver'),
  heure: Number($('obsHeure')?.value) || 12,
});

/**
 * La cote du rampant en tout point — l'équation du plan du toit.
 *
 * C'est la même surface que celle que la scène dessine : la recalculer
 * autrement ferait tomber les ombres à côté des modules qu'elles touchent.
 */
function coteDuRampant(scene) {
  const t = scene?.toit;
  if (!t?.sommets || t.sommets.length < 3) return () => 0;
  const [a, b, c] = t.sommets;
  const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const v = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
  const n = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
  if (Math.abs(n.z) < 1e-9) return () => a.z;
  return (p) => a.z - (n.x * (p.x - a.x) + n.y * (p.y - a.y)) / n.z;
}

/**
 * Range l'état de travail de la toiture dans les réponses, puis l'enregistre.
 *
 * Le tracé, les obstacles et l'implantation ne vivent pas dans le formulaire :
 * ce sont des variables du module. Appeler `memoriser()` sans passer par ici
 * enregistrerait donc les quatre champs visibles et rien d'autre — et un
 * relevé d'obstacles fait sur le toit, échelle à la main, disparaîtrait au
 * rechargement sans le moindre message.
 */
function retenirEtatToit() {
  reponses.toit = {
    ...(reponses.toit ?? {}),
    pente: $('pente')?.value ?? reponses.toit?.pente ?? 'moyenne',
    orientation: $('orientation')?.value ?? reponses.toit?.orientation ?? 'sud',
    trace: {
      ...(reponses.toit?.trace ?? {}),
      sommets: sommetsToit,
      facteur: facteurEchelle,
      etalonne: echelleEtalonnee,
      obstacles,
      modulesPoses,
      hauteurMur: hauteurMurSaisie(),
      dateOmbrage: $('obsDate')?.value ?? 'hiver',
    },
  };
  memoriser();
}

/** Les obstacles dessinés en volume, et les ombres qu'ils portent. */
function facesOmbrage(scene) {
  if (!scene || !obstacles.length) { dernierOmbrage = null; return []; }
  const cote = coteDuRampant(scene);
  const p = position();
  const { date, heure } = instantOmbrage();
  const soleil = positionSoleil({
    latitude: p.latitude ?? 36.8065, longitude: p.longitude ?? 10.1815, date, heure,
  });

  dernierOmbrage = ombrageInstantane({
    plan: planImplantation, obstacles, soleil, hauteurDuToit: cote,
    // Le contour du pan découpe les ombres : sans lui, celle d'une cheminée
    // proche du bord se prolonge dans le vide à côté du bâtiment.
    contourToit: scene.toit?.sommets ?? null,
  });

  const faces = [];
  // L'obstacle lui-même : une boîte posée sur le rampant.
  for (const o of dernierOmbrage.obstacles ?? []) {
    const dl = o.largeur / 2;
    const dp = o.longueur / 2;
    const coins = [
      { x: o.x - dl, y: o.y - dp }, { x: o.x + dl, y: o.y - dp },
      { x: o.x + dl, y: o.y + dp }, { x: o.x - dl, y: o.y + dp },
    ];
    faces.push({
      role: 'mur',
      nom: o.nom,
      sommets: coins.map((q) => ({ ...q, z: cote(q) + o.hauteur })),
      normale: { x: 0, y: 0, z: 1 },
    });
    for (let i = 0; i < 4; i++) {
      const q = coins[i];
      const r = coins[(i + 1) % 4];
      faces.push({
        role: 'mur',
        nom: `${o.nom} — face ${i + 1}`,
        sommets: [
          { ...q, z: cote(q) }, { ...r, z: cote(r) },
          { ...r, z: cote(r) + o.hauteur }, { ...q, z: cote(q) + o.hauteur },
        ],
        normale: { x: r.y - q.y, y: q.x - r.x, z: 0 },
      });
    }
  }

  // Les ombres, posées un centimètre au-dessus du rampant.
  for (const contour of dernierOmbrage.ombres ?? []) {
    faces.push({
      role: 'ombre',
      nom: 'Ombre portée',
      sommets: contour.map((q) => ({ ...q, z: cote(q) + 0.01 })),
      normale: { x: 0, y: 0, z: 1 },
    });
  }
  return faces;
}

/** La liste des obstacles relevés, avec de quoi les retirer un à un. */
function listeObstacles() {
  if (!obstacles.length) {
    return `<p class="indice indice-absent">Aucun obstacle relevé. Ce n’est pas la
      preuve qu’il n’y en a pas : c’est l’absence de relevé.</p>`;
  }
  return `<ul class="obstacles">${obstacles.map((o, i) => `<li>
    <b>${echapper(o.nom ?? typeObstacle(o.type).nom)}</b>
    <span>${Number(o.hauteur).toFixed(2)} m de haut ·
      ${Number(o.largeur).toFixed(2)} × ${Number(o.longueur).toFixed(2)} m ·
      ${Number(o.x).toFixed(1)} m E / ${Number(o.y).toFixed(1)} m N</span>
    <button type="button" class="btn fantome menu" data-retirer="${i}"
      aria-label="Retirer ${echapper(o.nom ?? '')}">Retirer</button>
  </li>`).join('')}</ul>`;
}

/** La frise de la journée : une barre par demi-heure. */
function friseOmbrage(scene) {
  if (!scene || !obstacles.length || !planImplantation?.nombre) return '';
  const p = position();
  const { date } = instantOmbrage();
  const frise = friseJournee({
    plan: planImplantation, obstacles,
    latitude: p.latitude ?? 36.8065, longitude: p.longitude ?? 10.1815,
    date, hauteurDuToit: coteDuRampant(scene),
    contourToit: scene.toit?.sommets ?? null,
  });
  const bilan = resumeJournee(frise);
  const heureCourante = instantOmbrage().heure;
  const total = planImplantation.nombre;

  const barres = frise.map((h) => {
    const part = total ? h.touches / total : 0;
    const actuelle = Math.abs(h.heure - heureCourante) < 0.26;
    return `<div class="frise-barre${actuelle ? ' ici' : ''}"
      style="--part:${(part * 100).toFixed(1)}%"
      title="${h.heure.toFixed(2).replace('.', 'h')} — ${h.touches} module${
  h.touches > 1 ? 's' : ''} touché${h.touches > 1 ? 's' : ''}, soleil à ${
  Math.round(h.hauteur)}°"></div>`;
  }).join('');

  const heures = frise.length ? [frise[0].heure, frise[frise.length - 1].heure] : [0, 0];
  return `<div class="frise" role="img"
    aria-label="Modules touchés par l’ombre au fil de la journée">
    ${barres}
  </div>
  <div class="frise-axe"><span>${heures[0].toFixed(0)} h</span>
    <span>midi</span><span>${heures[1].toFixed(0)} h</span></div>
  ${bilanOmbrage(bilan, total)}`;
}

/** Le bilan de la journée — jamais un chiffre nu. */
function bilanOmbrage(bilan, total) {
  if (bilan.jamaisTouche) {
    return `<p class="pos-phrase applique">Aux heures qui produisent vraiment,
      aucun module n’est touché par les obstacles relevés.</p>`;
  }
  const compteur = (v, l) => `<div class="compteur"><b>${v}</b><span>${l}</span></div>`;
  return `<div class="compteurs">
    ${compteur(`${bilan.pire.touches} / ${total}`, `au pire moment (${
  bilan.pire.heure.toFixed(2).replace('.', ' h ')})`)}
    ${compteur(`${Math.round(bilan.moyenne * 100)} %`, 'des modules touchés en moyenne')}
    ${compteur(`${Math.round(bilan.pire.hauteur)}°`, 'hauteur du soleil au pire moment')}
  </div>
  <p class="indice">La moyenne ne porte que sur les heures où le soleil dépasse
    10° : plus bas, la production est marginale et l’y compter gonflerait le
    chiffre. Un module touché n’est pas un module éteint — il produit encore,
    moins. Convertir cela en kilowattheures perdus demanderait un modèle
    électrique que cette étude n’a pas.</p>`;
}

/** Met à jour tout le volet ombrage. */
function majOmbrage(scene) {
  const liste = $('obsListe');
  if (liste) liste.innerHTML = listeObstacles();

  const etat = $('ombrageEtat');
  if (etat) {
    etat.textContent = obstacles.length
      ? `${obstacles.length} relevé${obstacles.length > 1 ? 's' : ''}` : 'non relevés';
    etat.className = `repli-etat repli-${obstacles.length ? 'bonne' : 'vide'}`;
  }

  const { date, heure } = instantOmbrage();
  const txt = $('obsHeureTxt');
  if (txt) {
    const h = Math.floor(heure);
    txt.textContent = `${h} h ${String(Math.round((heure - h) * 60)).padStart(2, '0')}`;
  }

  const p = position();
  const soleil = positionSoleil({
    latitude: p.latitude ?? 36.8065, longitude: p.longitude ?? 10.1815, date, heure,
  });
  const j = journeeSoleil({
    latitude: p.latitude ?? 36.8065, longitude: p.longitude ?? 10.1815, date,
  });
  const mot = $('obsSoleil');
  if (mot && soleil) {
    const cap = soleil.azimut < -10 ? 'à l’est' : soleil.azimut > 10 ? 'à l’ouest' : 'au sud';
    mot.textContent = soleil.hauteur <= 0
      ? `À cette heure le soleil est couché (lever ${(j.lever ?? 0).toFixed(2)
        .replace('.', ' h ')}, coucher ${(j.coucher ?? 0).toFixed(2).replace('.', ' h ')}).`
      : `Soleil à ${soleil.hauteur.toFixed(1)}° de hauteur, ${cap} `
        + `(azimut ${Math.round(soleil.azimut)}°, 0 = plein sud).`;
    mot.className = `indice${soleil.leve ? '' : ' indice-absent'}`;
  }

  const zoneFrise = $('obsFrise');
  if (zoneFrise) zoneFrise.innerHTML = friseOmbrage(scene);

  const zoneBilan = $('obsBilan');
  if (zoneBilan) {
    zoneBilan.innerHTML = dernierOmbrage && !dernierOmbrage.raison
      ? `<p class="pos-phrase reserve">${echapper(reserveOmbrage({ obstacles,
        etalonne: echelleEtalonnee }))}</p>`
      : `<p class="indice">${echapper(dernierOmbrage?.raison
        ?? reserveOmbrage({ obstacles }))}</p>`;
  }
}

/** Branche le volet des obstacles. */
function brancherOmbrage() {
  const majAide = () => {
    const t = typeObstacle($('obsType')?.value);
    const aide = $('obsAide');
    if (aide) aide.textContent = t.aide;
    // Les cotes du type servent de point de départ, pas de vérité : elles
    // restent modifiables, et le relevé sur place prime toujours.
    for (const [id, v] of [['obsHauteur', t.hauteur], ['obsLargeur', t.largeur],
      ['obsLongueur', t.longueur]]) {
      const champ = $(id);
      if (champ) champ.value = v;
    }
  };
  $('obsType')?.addEventListener('change', majAide);
  majAide();

  $('obsAjouter')?.addEventListener('click', () => {
    obstacles = [...obstacles, {
      type: $('obsType')?.value ?? 'autre',
      hauteur: Number($('obsHauteur')?.value),
      largeur: Number($('obsLargeur')?.value),
      longueur: Number($('obsLongueur')?.value),
      x: Number($('obsX')?.value) || 0,
      y: Number($('obsY')?.value) || 0,
    }];
    majVue3d();
    retenirEtatToit();
  });
  $('obsVider')?.addEventListener('click', () => {
    obstacles = [];
    majVue3d();
    retenirEtatToit();
  });
  $('obsListe')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-retirer]');
    if (!b) return;
    obstacles = obstacles.filter((_, i) => i !== Number(b.dataset.retirer));
    majVue3d();
    retenirEtatToit();
  });
  $('obsDate')?.addEventListener('change', () => { majVue3d(); retenirEtatToit(); });
  for (const evenement of ['input', 'change']) {
    $('obsHeure')?.addEventListener(evenement, majVue3d);
  }
}

/** Le retrait de rive saisi, borné à ce qu'un couvreur accepterait. */
function riveSaisie() {
  const v = Number($('riveToit')?.value);
  return Number.isFinite(v) && v >= 0 && v <= 3 ? v : RIVE_DEFAUT;
}
const RIVE_DEFAUT = 0.35;

/** Les compteurs d'implantation — présentation, aucun calcul. */
function compteursImplantation(plan) {
  if (!plan) {
    return `<p class="indice">Les modules ne sont pas posés. Le bouton ci-dessus
      remplit le pan tracé, retrait de rive compris.</p>`;
  }
  if (!plan.nombre) {
    return `<p class="alerte-trace">${echapper(plan.raison)}</p>`;
  }
  const compteur = (v, l) => `<div class="compteur"><b>${v}</b><span>${l}</span></div>`;
  return `<div class="compteurs">
    ${compteur(plan.nombre, 'modules')}
    ${compteur(`${plan.puissance.toFixed(2)} kWc`, 'puissance continue')}
    ${compteur(`${plan.surfaceUtilisee.toFixed(1)} m²`, 'surface occupée')}
    ${compteur(`${plan.surfaceRestante.toFixed(1)} m²`, 'rampant restant')}
    ${compteur(`${Math.round(plan.tauxOccupation * 100)} %`, 'taux d’occupation')}
    ${compteur(plan.orientation === 'paysage' ? 'Paysage' : 'Portrait',
    `${plan.colonnes} × ${plan.rangees}`)}
  </div>
  ${plan.alternative !== null && plan.alternative !== plan.nombre
    ? `<p class="indice">Pose imposée en ${plan.orientation}. En
        ${plan.orientation === 'portrait' ? 'paysage' : 'portrait'}, le pan porterait
        ${plan.alternative} module${plan.alternative > 1 ? 's' : ''}
        (${plan.alternative > plan.nombre ? '+' : ''}${plan.alternative - plan.nombre}).</p>`
    : ''}
  <p class="pos-phrase reserve">Implantation calculée sur le contour tracé, avec
    ${plan.rive} m de rive et ${plan.jeu} m entre modules. Elle ne tient compte
    d’aucun obstacle de toiture : ceux-ci ne sont pas encore relevés.</p>
  <p class="indice">Ces ${plan.puissance.toFixed(2)} kWc sont ce que le toit peut
    PORTER. L’étude, elle, dimensionne d’après votre consommation : les deux
    chiffres n’ont pas à coïncider, et le plus petit des deux commande.</p>`;
}

/** L'arborescence de la scène : ce qui est représenté, et d'où ça vient. */
function arbreScene(scene, m) {
  if (!scene) return '';
  const murs = scene.faces.filter((f) => f.role === 'mur').length;
  const branche = (nom, detail, source) => `<li><b>${nom}</b>
    <span>${detail}</span><i>${source}</i></li>`;
  return `<ul class="arbre">
    ${branche('Terrain', 'plan horizontal', 'repère de lecture, non mesuré')}
    ${branche('Bâtiment', `${murs} murs, ${hauteurMurSaisie().toFixed(1)} m sous égout`,
    'hauteur saisie')}
    ${branche('Toiture', `1 pan, ${Math.round(scene.toit.pente)}° de pente, `
      + `${m.surfaceRampant.toFixed(1)} m² de rampant`, 'contour tracé sur la carte')}
    ${branche('Obstacles', obstacles.length
    ? `${obstacles.length} relevé${obstacles.length > 1 ? 's' : ''}${
      dernierOmbrage?.touches ? `, ${dernierOmbrage.touches} module(s) touché(s)` : ''}`
    : 'aucun', obstacles.length ? 'cotes saisies sur place' : 'pas encore relevés')}
    ${branche('Générateur', planImplantation?.nombre
    ? `${planImplantation.nombre} modules, ${planImplantation.puissance.toFixed(2)} kWc`
    : 'aucun module posé', planImplantation?.nombre
    ? 'implantation sur le contour tracé' : 'à poser')}
  </ul>
  <p class="indice">Faîtage à ${scene.toit.hauteurMax.toFixed(2)} m, égout à
    ${scene.toit.hauteurMin.toFixed(2)} m — déduits du contour et de la pente,
    non mesurés sur place.</p>`;
}

/** Met la scène à jour depuis le tracé courant. */
function majVue3d() {
  const scene = sceneCourante();
  vue3d?.definirScene(scene);
  const etat = $('vue3dEtat');
  if (etat) {
    etat.textContent = scene
      ? `${scene.toit.hauteurMax.toFixed(1)} m au faîtage` : 'sans contour';
    etat.className = `repli-etat repli-${scene ? 'bonne' : 'vide'}`;
  }
  const arbre = $('arbreScene');
  if (arbre) arbre.innerHTML = scene ? arbreScene(scene, mesuresToit()) : '';
  const compteurs = $('compteursModules');
  if (compteurs) compteurs.innerHTML = scene ? compteursImplantation(planImplantation) : '';
  majOmbrage(scene);
  const poser = $('poserModules');
  if (poser) {
    poser.disabled = !scene;
    poser.textContent = modulesPoses ? 'Recalculer l’implantation' : 'Poser les modules';
  }
  const retirer = $('retirerModules');
  if (retirer) retirer.disabled = !modulesPoses;
}

/** Branche la vue en volume. */
function brancherVue3d() {
  const boite = $('scene3d');
  vue3d?.detruire();
  vue3d = null;
  if (!boite) return;
  vue3d = creerScene3d(boite, { scene: sceneCourante() });
  $('hauteurMur')?.addEventListener('input', majVue3d);
  $('hauteurMur')?.addEventListener('change', majVue3d);
  $('modulePose')?.addEventListener('change', majVue3d);
  // « change » seul ne suffit pas sur un champ numérique : les flèches et la
  // saisie au clavier n'émettent que « input » tant qu'on n'a pas quitté le
  // champ, et le retrait de rive paraissait alors sans effet.
  for (const evenement of ['input', 'change']) {
    $('riveToit')?.addEventListener(evenement, majVue3d);
  }
  $('poserModules')?.addEventListener('click', () => {
    modulesPoses = true; majVue3d(); retenirEtatToit();
  });
  $('retirerModules')?.addEventListener('click', () => {
    modulesPoses = false;
    planImplantation = null;
    majVue3d();
    retenirEtatToit();
  });
  majVue3d();
}

/** L'étalonnage manuel de l'échelle. */
function brancherEtalonnage() {
  const mot = $('etalonMot');
  $('etalonAppliquer')?.addEventListener('click', () => {
    const r = etalonner(Number($('etalonTrace')?.value), Number($('etalonReel')?.value));
    if (mot) mot.textContent = r.message;
    if (mot) mot.className = `indice${r.ok ? '' : ' indice-absent'}`;
    if (!r.ok) return;
    facteurEchelle = r.facteur;
    echelleEtalonnee = true;
    const etat = $('etalonEtat');
    if (etat) {
      etat.textContent = `${r.ecart > 0 ? '+' : ''}${r.ecart} %`;
      etat.className = 'repli-etat repli-bonne';
    }
    majTrace();
  });
  $('etalonAnnuler')?.addEventListener('click', () => {
    facteurEchelle = 1;
    echelleEtalonnee = false;
    if (mot) { mot.textContent = 'Échelle d’origine rétablie.'; mot.className = 'indice'; }
    const etat = $('etalonEtat');
    if (etat) { etat.textContent = 'non étalonné'; etat.className = 'repli-etat repli-vide'; }
    majTrace();
  });
}

/** Branche l'étape de tracé du toit. */
function brancherTracage() {
  const boite = $('carteToit');
  carteToit?.detruire();
  carteToit = null;
  if (!boite) return;

  // On repart du tracé mémorisé : revenir en arrière ne doit pas effacer un
  // quart d'heure de travail.
  const memoire = reponses.toit?.trace;
  if (memoire && Array.isArray(memoire.sommets) && !sommetsToit.length) {
    sommetsToit = memoire.sommets;
    facteurEchelle = Number(memoire.facteur) || 1;
    echelleEtalonnee = Boolean(memoire.etalonne);
    // Un relevé d'obstacles se fait sur le toit, échelle à la main : le perdre
    // au changement d'étape ferait remonter le client sur son toit.
    if (Array.isArray(memoire.obstacles)) obstacles = memoire.obstacles;
    if (memoire.modulesPoses) modulesPoses = true;
  }

  const hm = $('hauteurMur');
  if (hm && Number.isFinite(Number(memoire?.hauteurMur))) hm.value = memoire.hauteurMur;
  const jour = $('obsDate');
  if (jour && memoire?.dateOmbrage) jour.value = memoire.dateOmbrage;

  const p = position();
  carteToit = creerCarte(boite, {
    point: { latitude: p.latitude ?? 36.8065, longitude: p.longitude ?? 10.1815 },
    // Un toit se trace au plus près : à un zoom plus large, un pixel vaut
    // plus d'un mètre et le tracé ne veut plus rien dire.
    zoom: 19,
    surSommet: (q) => { sommetsToit = [...sommetsToit, q]; majTrace(); },
    surSommetDeplace: (i, q) => {
      sommetsToit = sommetsToit.map((s, j) => (j === i ? q : s));
      majTrace();
    },
  });
  carteToit?.definirMode('trace');
  if (sommetsToit.length) carteToit?.cadrerSur(sommetsToit);

  $('traceDefaire')?.addEventListener('click', () => {
    sommetsToit = sommetsToit.slice(0, -1);
    majTrace();
  });
  $('traceVider')?.addEventListener('click', () => {
    sommetsToit = [];
    majTrace();
  });
  $('traceCadrer')?.addEventListener('click', () => carteToit?.cadrerSur(sommetsToit));
  $('traceAppliquer')?.addEventListener('click', appliquerTrace);
  $('pente')?.addEventListener('change', majTrace);
  $('orientation')?.addEventListener('change', majVue3d);
  brancherEtalonnage();
  brancherVue3d();
  brancherOmbrage();
  majTrace();
}

/** Branche l'ensemble de l'étape de localisation. */
function brancherLocalisation() {
  $('localiser')?.addEventListener('click', () => demanderPosition(false));
  $('localiserFin')?.addEventListener('click', () => demanderPosition(true));
  // Changer de gouvernorat sans avoir situé le bâtiment doit recentrer la
  // carte : la laisser sur Tunis pendant qu'on a choisi Tozeur enverrait
  // l'utilisateur dessiner un toit à six cents kilomètres de chez lui.
  $('gouvernorat')?.addEventListener('change', () => {
    const p = position();
    if (p.originePosition === 'centre-gouvernorat' || !Number.isFinite(p.latitude)) {
      carte?.deplacer({ latitude: p.latitude, longitude: p.longitude });
    }
    majFichePosition();
  });
  brancherSaisieCoordonnees();
  brancherCarte();
  majFichePosition();
  // Ouvrir le volet dès qu'une position existe : la refermer ferait croire
  // qu'elle a été perdue.
  const p = position();
  if (Number.isFinite(p.latitude) && p.originePosition !== 'centre-gouvernorat') {
    $('precisionSite')?.setAttribute('open', '');
  }
}

/* ------------------------------------------------------------------ */
/* Résultat                                                            */
/* ------------------------------------------------------------------ */

function chiffre(valeur, libelle, fort = false) {
  return `<div class="chiffre${fort ? ' fort' : ''}">
    <span class="v">${valeur}</span><span class="l">${libelle}</span></div>`;
}

/** Le dernier contact saisi, pour le porter en couverture du rapport. */
let dernierClient = null;

/**
 * Les trois scénarios, et celui qui est retenu à l'écran.
 *
 * POURQUOI TROIS : une seule puissance proposée est un chiffre à croire ;
 * trois est un choix à faire. Le client voit ce que coûte le kilowatt de plus
 * et ce qu'il rapporte — et il achète en connaissance de cause.
 */
function dessinerScenarios() {
  const hote = $('scenarios');
  const bloc = $('blocScenarios');
  if (!hote || !bloc) return;
  const trio = scenariosCourants();

  // Un seul scénario possible — toit trop petit — n'est pas un choix : le
  // bloc disparaît plutôt que d'afficher une comparaison à un terme.
  bloc.hidden = trio.length < 2;
  if (bloc.hidden) { hote.innerHTML = ''; return; }

  hote.innerHTML = trio.map((s, i) => {
    const choisi = s.puissance === simulation.puissance;
    const e = s.etude;
    const dessus = i > 0 ? ecart(trio[i - 1], s) : null;
    return `<button type="button" class="scenario${choisi ? ' choisi' : ''}"
      data-kwc="${s.puissance}" aria-pressed="${choisi}">
      <span class="sc-nom">${s.nom}</span>
      <span class="sc-kwc">${String(s.puissance).replace('.', ',')} kWc</span>
      <span class="sc-promesse">${s.promesse}</span>
      <dl class="sc-faits">
        <div><dt>Coût</dt><dd>${formaterRond(e.cout)}</dd></div>
        <div><dt>Économie / mois</dt><dd>${formaterRond(e.economieMensuelle)}</dd></div>
        <div><dt>Retour</dt><dd>${e.retour
          ? String(e.retour.toFixed(1)).replace('.', ',') + ' ans' : '> 25 ans'}</dd></div>
        <div><dt>Gain sur 25 ans</dt><dd>${formaterRond(e.gainNet)}</dd></div>
        <div><dt>Couvre vos besoins à</dt><dd>${Math.round(e.ratio * 100)} %</dd></div>
        <div><dt>Consommé sur place</dt><dd>${
          Math.round(e.tauxAutoconsommation * 100)} %</dd></div>
      </dl>
      <span class="sc-detail">${s.detail}</span>
      ${dessus ? `<span class="sc-ecart">${dessus}</span>` : ''}
    </button>`;
  }).join('');

  const retenu = trio.find((s) => s.puissance === simulation.puissance);
  $('noteScenarios').textContent = retenu
    ? `Vous regardez le scénario ${retenu.nom}.`
    : `Vous avez réglé une puissance sur mesure : ${
        String(simulation.puissance).replace('.', ',')} kWc. `
      + `Le scénario ${scenarioParDefaut(trio).nom} reste notre conseil.`;
}

function dessinerResultat() {
  const toit = cotesToit();
  reinitialiserSimulation();
  const e = etudeCourante();

  // Une étude incomplète ne s'affiche pas à moitié.
  if (!e) {
    $('erreur').textContent = 'Ces chiffres ne permettent pas de conclure. Vérifiez votre saisie.';
    return;
  }
  simulation.puissance = e.puissance;

  $('resultat').innerHTML = `
    <div class="dash-tete">
      <p class="dash-sur" id="dashLieu"></p>
      <h3 class="dash-titre" id="titreRes"></h3>
      <p class="fiabilite" id="fiabilite" hidden></p>
    </div>

    <div class="dash-haut">
      <div id="socle"></div>
      <div id="scoreSolaire"></div>
    </div>

    <div id="kpis"></div>
    <p class="dash-co2" id="phraseCo2"></p>

    <div id="bandeauNiveau"></div>
    <div id="centreDonnees"></div>
    <div id="ficheSite"></div>
    <div id="blocAlertes"></div>

    <div class="bloc" id="blocScenarios">
      <h4>Trois façons de dimensionner votre toiture</h4>
      <p class="note">Le même toit, le même soleil, la même facture : seule la
        taille change. Touchez celle qui vous ressemble — tout le reste de la
        page suit. Les hypothèses sont les mêmes pour les trois, et sont
        rappelées en bas de page.</p>
      <div class="scenarios" id="scenarios"></div>
      <p class="indice" id="noteScenarios" role="status" style="margin-top:14px"></p>
    </div>

    <div class="bloc">
      <h4>Où va votre énergie</h4>
      <p class="note">Le soleil frappe les panneaux, l’onduleur transforme, et
        ce que vous ne consommez pas au moment où il est produit part sur le
        réseau. L’épaisseur des flèches suit les kilowattheures.</p>
      <div class="graphe graphe-flux" id="flux"></div>
    </div>

    <div class="bloc" id="blocComparaison">
      <h4>Est-ce que ça couvre ?</h4>
      <p class="note" id="noteComparaison"></p>
      <div class="graphe" id="grapheComparaison"></div>
    </div>

    <div class="bloc">
      <h4>Quand l’installation se rembourse</h4>
      <p class="note">L’économie s’accumule année après année ; l’électricité
        renchérit, les modules s’usent un peu. La ligne pointillée est ce que
        l’installation a coûté.</p>
      <div class="graphe" id="graphe"></div>
    </div>

    <div class="bloc">
      <h4>Ajustez, et regardez ce que ça change</h4>
      <p class="note">Rien n’est figé : votre toiture, votre budget, vos envies.
        Les chiffres et les courbes suivent.</p>
      <div class="curseurs">
        <div class="curseur">
          <div class="tete"><span>Puissance installée</span><b id="vPuissance"></b></div>
          <input type="range" id="cPuissance" aria-label="Puissance installée en kilowatts-crête">
        </div>
        <div class="curseur">
          <div class="tete"><span>Toiture disponible</span><b id="vSurface"></b></div>
          <input type="range" id="cSurface" min="0" max="200" step="5"
            aria-label="Surface de toiture disponible en mètres carrés">
        </div>
      </div>
      <p class="indice" id="noteSurface" style="margin-top:14px"></p>
    </div>

    <div class="bloc" id="blocMensuel">
      <h4>Ce que vous produirez, mois par mois</h4>
      <p class="note" id="noteMensuel"></p>
      <div class="graphe" id="grapheMensuel"></div>
    </div>

    <div class="bloc" id="blocToit" hidden>
      <h4>Vos panneaux, sur votre toit</h4>
      <p class="note" id="noteToit"></p>
      <div class="graphe" id="planToit"></div>
    </div>

    <div class="bloc" id="blocFinancier">
      <h4>Analyse financière</h4>
      <p class="note">Les mêmes panneaux, sous trois jeux d’hypothèses. Ce ne sont
        pas trois humeurs : ce sont trois valeurs des mêmes paramètres, écrites
        sous le tableau.</p>
      <div id="zoneFinancier"></div>
    </div>

    <div class="bloc" id="blocOptimiseur">
      <h4>Optimisation selon votre objectif</h4>
      <p class="note">Il n’existe pas de configuration optimale dans l’absolu : la
        plus rentable est petite, la plus productive est grande, et elles ne
        peuvent pas être la même. Choisissez ce que vous cherchez.</p>
      <div id="zoneOptimiseur"></div>
    </div>

    <div class="bloc" id="blocLaboratoire">
      <h4>Comparer plusieurs projets</h4>
      <p class="note">Le projet actuel, un plus petit, un plus grand, et le même
        sous des hypothèses prudentes — côte à côte.</p>
      <div id="zoneLaboratoire"></div>
    </div>

    <div class="bloc bloc-copilote" id="blocCopilote">
      <h4>Assistant</h4>
      <p class="note">Il lit cette étude et répond sur ses chiffres. Il n’a aucune
        connaissance propre : quand une donnée manque, il le dit au lieu de
        l’inventer.</p>
      <div id="zoneCopilote"></div>
    </div>

    <div class="bloc">
      <h4>Le détail</h4>
      <dl id="detail"></dl>
      <div id="zoneComposition"></div>
      <div id="zoneProvenance"></div>
      <div id="zoneTrace"></div>
      <div id="zoneHypotheses"></div>
      <div id="panneauTechnique"></div>
      <div id="avertissement"></div>
    </div>

    <div class="offre">
      <h3>L’étude détaillée</h3>
      <div class="prix">${formaterRond(OFFRE.prix)}</div>
      <p style="color:rgba(255,255,255,.75);font-size:15.5px">Le dossier qu’un
        installateur accepte comme base de devis — et que vous pouvez opposer à
        trois devis contradictoires.</p>
      <ul>${OFFRE.contenu.map((c) => `<li>
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>${c}</li>`).join('')}</ul>
      <div id="demande"></div>
    </div>

    <div class="bloc bloc-rapport">
      <h4>Emportez votre étude</h4>
      <p class="note">Le récapitulatif complet de cette simulation, mis en page :
        vos chiffres, les graphiques, le plan de toiture et toutes les
        hypothèses de calcul. À enregistrer en PDF, à imprimer, à faire lire à
        un installateur.</p>
      <div class="rapport-actes">
        <button class="btn primaire" type="button" id="obtenirRapport">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 15h6M9 11h3"/></svg>
          Obtenir mon rapport</button>
        <button class="btn" type="button" id="versEtude">
          Demander une étude technique</button>
      </div>
      <div class="rapport-boite" id="rapportBoite" hidden></div>
    </div>

    <details class="diagnostic" id="blocDiagnostic">
      <summary>Diagnostic technique</summary>
      <p class="diag-txt">Si une partie de cette page ne s’affiche pas correctement,
        copiez ces informations et joignez-les à votre message. Elles ne contiennent
        ni votre nom, ni votre téléphone, ni votre courriel : les champs de contact
        sont expurgés avant d’être écrits.</p>
      <p class="diag-id">Session <b id="diagId"></b></p>
      <pre class="diag-journal" id="diagJournal"></pre>
      <button class="btn" type="button" id="copierJournal">Copier le diagnostic</button>
    </details>

    <p style="text-align:center;margin-top:26px">
      <button class="btn" type="button" id="recommencer">Refaire une estimation</button></p>`;

  // Bornes des curseurs, autour de la recommandation.
  const cP = $('cPuissance');
  cP.min = PUISSANCE.min; cP.max = Math.max(PUISSANCE.min + 5, e.puissance * 2.5);
  cP.step = PUISSANCE.pas; cP.value = e.puissance;
  $('cSurface').value = simulation.surface;

  cP.addEventListener('input', () => {
    simulation.puissance = Number(cP.value);
    // Dès que le visiteur déplace le curseur, ce n'est plus notre
    // recommandation : la carte centrale le dit plutôt que de s'attribuer
    // un chiffre qu'elle n'a pas proposé.
    simulation.sienne = true;
    demanderRafraichissement();
  });

  // Une seule écoute sur le conteneur : les cartes sont redessinées à chaque
  // rafraîchissement, des écoutes posées sur chacune fuiraient à chaque fois.
  $('scenarios').addEventListener('click', (ev) => {
    const carte = ev.target.closest('[data-kwc]');
    if (!carte) return;
    simulation.puissance = Number(carte.dataset.kwc);
    simulation.sienne = false;
    // Le curseur peut ne pas atteindre le scénario Performance sur une petite
    // installation : on élargit plutôt que d'ignorer le clic.
    if (simulation.puissance > Number(cP.max)) cP.max = simulation.puissance;
    cP.value = simulation.puissance;
    rafraichir();
  });
  $('cSurface').addEventListener('input', () => {
    simulation.surface = Number($('cSurface').value);
    // Une toiture qui rétrécit peut rendre la puissance impossible : on
    // ramène le curseur à ce que le toit porte, plutôt que de mentir.
    const max = simulation.surface > 0
      ? simulation.surface / HYPOTHESES.surfaceParKwc : Infinity;
    if (simulation.puissance > max) {
      // Vers le BAS, jamais vers le plus proche : arrondir 3,33 à 3,5
      // proposerait une installation qui ne tient pas sur le toit.
      simulation.puissance = Math.max(PUISSANCE.min,
        Math.floor(max / PUISSANCE.pas) * PUISSANCE.pas);
      cP.value = simulation.puissance;
    }
    demanderRafraichissement();
  });

  rafraichir();
  // Les compteurs ne montent qu'une fois, à la première ouverture du tableau
  // de bord : les relancer à chaque déplacement de curseur rendrait les
  // chiffres illisibles pendant qu'on les compare.
  animerChiffres($('resultat'));
  dessinerDemande(e);
  $('form').hidden = true;
  // La barre reste : « 06 Résultats » s'allume, et les étapes franchies
  // restent cliquables pour corriger un chiffre sans tout recommencer.
  etape = ETAPES.length;
  dessinerJauge();
  $('resultat').hidden = false;
  $('resultat').scrollIntoView({ behavior: 'smooth', block: 'start' });

  brancherRapport();
  interrogerService();
  proteger('optimiseur', () => brancherOptimiseur());
  proteger('assistant', () => brancherCopilote());
  brancherDiagnostic();

  $('recommencer').addEventListener('click', () => {
    etape = 0;
    $('resultat').hidden = true;
    $('form').hidden = false;
    dessinerEtape();
    $('tunnel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

/**
 * LE RAPPORT — construit à la demande, jamais en avance.
 *
 * Le fabriquer au chargement du tableau de bord coûterait deux graphiques et
 * un plan de toiture à chaque déplacement de curseur, pour un document que la
 * plupart des visiteurs n'ouvriront pas. Il est donc bâti au clic, sur l'état
 * exact du moment.
 */
function brancherRapport() {
  const bouton = $('obtenirRapport');
  if (!bouton) return;

  bouton.addEventListener('click', () => {
    const e = etudeCourante();
    if (!e) return;
    const boite = $('rapportBoite');
    const pan = reponses.toit ?? {};
    const source = donneesEtude();

    boite.hidden = false;
    boite.innerHTML = construireRapport({
      etude: e,
      source,
      score: evaluer({
        gouvernorat: reponses.gouvernorat,
        orientation: pan.orientation ?? null,
        pente: pan.pente ?? null,
        surfaceDisponible: simulation.surface,
        puissanceVisee: e.puissance,
        tauxAutoconsommation: e.tauxAutoconsommation,
        retour: e.retour,
      }),
      dimensionnement: dimensionner({
        puissance: e.puissance, module: reglagePose().module }),
      client: dernierClient,
      toit: pan,
      consoMensuelle: consommationMensuelle(e.consommation, e.batiment, source?.mois ?? null),
      gouvernorat: reponses.gouvernorat,
      hypotheses: HYPOTHESES,
      reglagePose: reglagePose(),
      offre: OFFRE,
    }) + `<div class="rapport-actes rapport-actes-bas">
      <button class="btn primaire" type="button" id="imprimerRapport">
        Enregistrer en PDF ou imprimer</button>
      <button class="btn" type="button" id="fermerRapport">Fermer</button>
    </div>`;

    $('imprimerRapport').addEventListener('click', () => window.print());
    $('fermerRapport').addEventListener('click', () => {
      boite.hidden = true;
      boite.innerHTML = '';
      bouton.focus();
    });
    boite.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $('versEtude')?.addEventListener('click', () => {
    $('demande')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('nom')?.focus({ preventScroll: true });
  });
}

/**
 * LE RAFRAÎCHISSEMENT EST ÉTALÉ SUR L'IMAGE SUIVANTE.
 *
 * Un doigt qui glisse sur le curseur émet jusqu'à soixante événements par
 * seconde, et chacun reconstruisait cinq graphiques SVG et trois panneaux.
 * Sur un Android d'entrée de gamme, le curseur décrochait. On ne garde que
 * le dernier état demandé, et on le dessine une fois par image.
 */
let imageEnAttente = null;

function demanderRafraichissement() {
  if (imageEnAttente !== null) return;
  imageEnAttente = requestAnimationFrame(() => {
    imageEnAttente = null;
    rafraichir();
  });
}

/** La dernière simulation complète, pour l'assistant et le rapport. */
let simulationCourante = null;

/** La dernière étude étiquetée, pour l'assistant et le rapport. */
let fusionCourante = null;

/** Ce que le service de données solaires a rendu, et dans quel état il est. */
let mesureService = null;
let etatService = serviceDisponible() ? 'attente' : 'absent';
let avertissementService = RAISON_INDISPONIBLE;

/** Les noms lisibles des valeurs suivies. */
const NOMS_VALEURS = {
  consommation: 'Consommation annuelle',
  prixKwh: 'Prix du kilowattheure',
  puissance: 'Puissance retenue',
  production: 'Production annuelle',
  tauxAutoconsommation: 'Part autoconsommée',
  autoconsomme: 'Énergie consommée sur place',
  economieAnnuelle: 'Économie la première année',
  retour: 'Temps de retour',
  co2Annuel: 'CO₂ évité',
  productible: 'Productible du site',
};

/** L'objectif d'optimisation et le mode de l'assistant, choisis par le visiteur. */
let objectifCourant = 'equilibre';
let modeCopilote = 'client';

/** L'analyse financière : trois jeux d'hypothèses sur la même installation. */
function dessinerFinancier(e) {
  const hote = $('zoneFinancier');
  if (!hote) return;
  const jeux = comparerJeux({ puissance: e.puissance, autoconsomme: e.autoconsomme,
    surplus: e.surplus, prixKwh: e.prixKwh });
  const central = jeux.find((j) => j.defaut);
  if (central) central.listeParametres = listerParametres(central.parametres);
  hote.innerHTML = panneauFinancier(jeux, NON_PRIS_EN_COMPTE);
}

/** L'optimiseur, avec l'objectif retenu par le visiteur. */
function dessinerOptimiseur() {
  const hote = $('zoneOptimiseur');
  if (!hote) return;
  const d = donneesEtude();
  const toit = cotesToit();
  const r = d ? optimiserProjet({ ...d, toitL: toit.L, toitP: toit.P },
    { objectif: objectifCourant }) : null;
  hote.innerHTML = panneauOptimiseur(r, OBJECTIFS, objectifCourant);
}

/** Le laboratoire : plusieurs projets comparés côte à côte. */
function dessinerLaboratoire(e) {
  const hote = $('zoneLaboratoire');
  if (!hote) return;
  const d = donneesEtude();
  if (!d) { hote.innerHTML = ''; return; }
  hote.innerHTML = panneauLaboratoire(
    comparerVariantes(d, variantesProposees(d, { puissanceCourante: e.puissance })));
}

/**
 * INTERROGE LE SERVICE DE DONNÉES SOLAIRES, sans jamais faire attendre.
 *
 * L'étude est déjà affichée quand cet appel part : le visiteur a ses chiffres,
 * et le service ne fait que les affiner. S'il répond, la page se redessine
 * avec le productible mesuré au point ; s'il ne répond pas, rien ne bouge et
 * le panneau le dit. C'est l'ordre qui compte : afficher d'abord, enrichir
 * ensuite. L'inverse ferait attendre tout le monde pour le bénéfice de
 * quelques-uns.
 */
async function interrogerService() {
  if (!serviceDisponible()) { etatService = 'absent'; return; }
  const d = donneesEtude();
  const e = etudeCourante();
  if (!d || !e) return;

  etatService = 'encours';
  $('centreDonnees').innerHTML = centreDonnees({
    configure: true, etat: 'encours', mesure: null, avertissement: null });

  const r = await enrichirDepuisService(d, { puissance: e.puissance });
  if (r.ok) {
    mesureService = r.mesure;
    etatService = 'ok';
    // LE CHIFFRE MESURÉ ENTRE DANS LE CALCUL, il ne se contente pas de
    // s'afficher : sans cette ligne, la fiche du site annoncerait un
    // productible que la production ne refléterait pas.
    definirProductibleMesure(r.productibleApres);
    noter('info', 'données solaires obtenues', {
      depuisCache: r.depuisCache,
      productibleAvant: r.productibleAvant,
      productibleApres: r.productibleApres,
    });
  } else {
    mesureService = null;
    etatService = 'echec';
    definirProductibleMesure(null);
    avertissementService = r.messageClient;
    noter('avertissement', 'données solaires indisponibles', { genre: r.genre });
  }
  rafraichir();
  $('reessayerService')?.addEventListener('click', () => {
    avertissementService = RAISON_INDISPONIBLE;
    interrogerService();
  });
}

/** Le journal, consultable et copiable par le visiteur qui signale une panne. */
function brancherDiagnostic() {
  const bloc = $('blocDiagnostic');
  if (!bloc) return;
  $('diagId').textContent = CORRELATION;
  const remplir = () => {
    const r = resumeJournal();
    $('diagJournal').textContent = `${r.total} entrées — ${r.erreur} erreur(s), `
      + `${r.avertissement} avertissement(s)\n\n${enTexte()}`;
  };
  bloc.addEventListener('toggle', () => { if (bloc.open) remplir(); });
  $('copierJournal')?.addEventListener('click', async () => {
    remplir();
    const bouton = $('copierJournal');
    try {
      await navigator.clipboard.writeText($('diagJournal').textContent);
      bouton.textContent = 'Copié';
    } catch {
      // Le presse-papiers peut être refusé : on sélectionne le texte pour
      // que le visiteur le copie lui-même, plutôt que de ne rien faire.
      const plage = document.createRange();
      plage.selectNodeContents($('diagJournal'));
      const sel = getSelection();
      sel.removeAllRanges(); sel.addRange(plage);
      bouton.textContent = 'Sélectionné — copiez avec votre clavier';
    }
    setTimeout(() => { bouton.textContent = 'Copier le diagnostic'; }, 3000);
  });
}

/** Le choix d'objectif redessine l'optimiseur, et lui seul. */
function brancherOptimiseur() {
  const hote = $('zoneOptimiseur');
  if (!hote || hote.dataset.branche === 'oui') return;
  hote.dataset.branche = 'oui';
  hote.addEventListener('click', (ev) => {
    const carte = ev.target.closest('[data-objectif]');
    if (!carte || carte.dataset.objectif === objectifCourant) return;
    objectifCourant = carte.dataset.objectif;
    dessinerOptimiseur();
  });
}

/**
 * L'ASSISTANT. Il ne parle qu'à partir de `simulationCourante` : c'est ce qui
 * garantit qu'il ne peut rien dire que l'étude ne contienne pas.
 */
function brancherCopilote() {
  const hote = $('zoneCopilote');
  if (!hote) return;
  hote.innerHTML = panneauCopilote(suggestionsCopilote(simulationCourante),
    MODES, modeCopilote);

  const poser = (question) => {
    if (!question) return;
    const r = repondreCopilote(question, simulationCourante, modeCopilote);
    // La question vient d'un champ libre : elle est échappée entièrement,
    // pas seulement sur le chevron ouvrant.
    $('copiReponse').innerHTML = `<p class="copi-question">« ${
      echapper(question)} »</p>` + reponseCopilote(r);
  };

  hote.addEventListener('click', (ev) => {
    const q = ev.target.closest('[data-question]');
    if (q) { poser(q.dataset.question); return; }
    const m = ev.target.closest('[data-mode]');
    if (!m || m.dataset.mode === modeCopilote) return;
    modeCopilote = m.dataset.mode;
    for (const b of hote.querySelectorAll('[data-mode]')) {
      const actif = b.dataset.mode === modeCopilote;
      b.classList.toggle('choisi', actif);
      b.setAttribute('aria-checked', String(actif));
    }
  });

  $('copiForm')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    poser($('copiQuestion').value.trim());
  });
}

/** Redessine tout ce qui dépend des curseurs. */
function rafraichir() {
  const e = etudeCourante();
  if (!e) return;
  const lieu = nomGouvernorat(reponses.gouvernorat);
  const bat = typeBatiment(e.batiment);
  const source = donneesEtude();

  $('dashLieu').textContent = `${bat ? bat.nom : 'Bâtiment'} à ${lieu}`;
  $('titreRes').textContent = 'Votre étude photovoltaïque';

  // La carte centrale, puis les cinq chiffres qui font la décision. Le titre
  // dit « recommandée » tant que le visiteur n'a pas déplacé le curseur :
  // au-delà, ce n'est plus notre recommandation, c'est son choix.
  const surMesure = simulation.sienne === true;
  $('socle').innerHTML = carteCentrale(e, {
    titre: surMesure ? 'Puissance choisie' : 'Puissance recommandée' });
  $('kpis').innerHTML = grilleKpi(e);
  $('phraseCo2').textContent = phraseCo2(e);

  // D'où vient le chiffre de départ, dit avant tous les autres chiffres.
  // Une estimation présentée comme une certitude se retourne contre nous à
  // la première facture du client.
  const f = source && FIABILITES[source.fiabilite];
  $('fiabilite').hidden = !f;
  if (f) {
    $('fiabilite').className = `fiabilite f-${source.fiabilite}`;
    $('fiabilite').innerHTML = `<b>${f.nom}</b> — ${f.phrase}`;
  }

  // Le Solar Score, sur les seules données réellement disponibles.
  const pan = reponses.toit ?? {};
  $('scoreSolaire').innerHTML = carteScore(evaluer({
    gouvernorat: reponses.gouvernorat,
    orientation: pan.orientation ?? null,
    pente: pan.pente ?? null,
    surfaceDisponible: simulation.surface,
    puissanceVisee: e.puissance,
    tauxAutoconsommation: e.tauxAutoconsommation,
    retour: e.retour,
  }));

  $('flux').innerHTML = diagrammeFlux(e, { largeur: 620, hauteur: 260 }) ?? '';
  $('graphe').innerHTML = construireGraphe(e, { largeur: 620, hauteur: 250 }).svg;

  // Production contre consommation : la seule question que tout le monde
  // pose, et à laquelle un total annuel ne répond pas.
  const relevesMois = source?.mois ?? null;
  const conso = consommationMensuelle(e.consommation, e.batiment, relevesMois);
  const comparaison = (e.mensuel && conso)
    ? grapheComparaison(e.mensuel, conso, MOIS, { largeur: 620, hauteur: 230 }) : null;
  $('blocComparaison').hidden = !comparaison;
  if (comparaison) {
    $('grapheComparaison').innerHTML = comparaison;
    const couverts = e.mensuel.filter((p, i) => p >= conso[i]).length;
    $('noteComparaison').textContent = couverts === 12
      ? 'Votre production dépasse votre consommation tous les mois de l’année : '
        + 'le surplus part sur le réseau, au prix de rachat.'
      : couverts === 0
        ? 'Votre production reste sous votre consommation toute l’année : tout ce '
          + 'qui est produit est consommé sur place, rien n’est revendu.'
        : `Votre production couvre entièrement ${couverts} mois sur 12. Les autres `
          + 'mois, la STEG complète — et votre facture baisse sans disparaître.'
      + (relevesMois ? ' Comparaison faite sur vos douze mois réels.'
        : ' La répartition de votre consommation dans l’année est un profil type, '
          + 'pas un relevé.');
  }

  dessinerScenarios();

  $('vPuissance').textContent = String(e.puissance).replace('.', ',') + ' kWc';
  $('vSurface').textContent = simulation.surface > 0
    ? simulation.surface + ' m²' : 'non précisée';
  $('noteSurface').textContent = simulation.surface > 0
    ? `Cette toiture porte au plus ${
        (simulation.surface / HYPOTHESES.surfaceParKwc).toFixed(1).replace('.', ',')} kWc.`
    : `Sans contrainte de toiture, comptez ${HYPOTHESES.surfaceParKwc} m² par kWc.`;

  // La production mensuelle : elle rassure sur l'hiver, que tout le monde
  // croit nul.
  const mensuel = e.mensuel && grapheMensuel(e.mensuel, MOIS, { largeur: 620, hauteur: 190 });
  $('blocMensuel').hidden = !mensuel;
  if (mensuel) {
    $('grapheMensuel').innerHTML = mensuel;
    const maxi = Math.max(...e.mensuel), mini = Math.min(...e.mensuel);
    const part = Math.round((mini / maxi) * 100);
    $('noteMensuel').textContent = `Le mois le plus creux produit encore ${part} % `
      + `du mois le plus plein : l’hiver tunisien reste largement utile.`;
  }

  // Le plan du toit, quand le visiteur a donné ses cotes.
  const toit = cotesToit();
  const reglage = reglagePose();
  const trace = (toit.L && toit.P)
    ? planCalepinage(toit.L, toit.P, { largeurPx: 560, ...reglage }) : null;
  $('blocToit').hidden = !trace;
  if (trace) {
    const c = trace.plan;
    $('planToit').innerHTML = trace.svg;
    $('noteToit').textContent = `Sur un pan de ${String(toit.L).replace('.', ',')} × `
      + `${String(toit.P).replace('.', ',')} m, ${c.nombre} modules tiennent en `
      + `${c.rangees} rangée${c.rangees > 1 ? 's' : ''} de ${c.colonnes}, posés en `
      + `${c.orientation} — soit ${String(c.puissance).replace('.', ',')} kWc au maximum, `
      + `en ${reglage.module.nom}. Marges de rive et jeux entre modules compris.`;
  }

  // Le dimensionnement électrique, replié : le client n'en a pas besoin,
  // l'installateur ne doit pas avoir à le redemander.
  const dim = dimensionner({ puissance: e.puissance, module: reglagePose().module });
  const ouvertAvant = $('technique')?.open === true;
  $('panneauTechnique').innerHTML = dim
    ? panneauTechnique(dim, verdictGlobal(dim.controles)) : '';
  // Un curseur déplacé ne doit pas refermer le panneau qu'on était en train
  // de lire.
  if (ouvertAvant && $('technique')) $('technique').open = true;

  // LE MOTEUR passe une fois par rafraîchissement, et alimente tout ce qui
  // explique l'étude : niveau, confiance, alertes, traçabilité, hypothèses.
  simulationCourante = proteger('moteur de simulation', () => simuler({
    ...(source ?? {}), moduleId: reglagePose().module.id },
  { puissance: simulation.puissance }), null);
  const ouverts = new Set([...document.querySelectorAll('#resultat details[open]')]
    .map((d) => d.id).filter(Boolean));
  // LA FUSION étiquette chaque valeur avec son origine. Elle ne calcule
  // rien : elle dit d'où vient ce qui a déjà été calculé.
  fusionCourante = proteger('provenance des données',
    () => fusionner(simulationCourante, { mesureService }), null);
  $('centreDonnees').innerHTML = centreDonnees({
    configure: serviceDisponible(),
    etat: etatService,
    mesure: mesureService,
    avertissement: avertissementService,
    attribution: mesureService?.ok ? ATTRIBUTION : null,
  });
  $('ficheSite').innerHTML = fusionCourante ? ficheSite(fusionCourante) : '';
  $('zoneComposition').innerHTML = fusionCourante
    ? barreComposition(fusionCourante, raconterComposition(fusionCourante.composition)) : '';
  $('zoneProvenance').innerHTML = fusionCourante
    ? panneauProvenance(fusionCourante, NOMS_VALEURS) : '';

  $('bandeauNiveau').innerHTML = bandeauNiveau(simulationCourante);
  $('blocAlertes').innerHTML = panneauAlertes(simulationCourante);
  $('zoneTrace').innerHTML = panneauTracabilite(simulationCourante);
  $('zoneHypotheses').innerHTML = panneauHypotheses(simulationCourante);
  // Un panneau qu'on lisait ne doit pas se refermer parce qu'un curseur a bougé.
  for (const id of ouverts) { const d = $(id); if (d) d.open = true; }

  // CHAQUE PANNEAU SECONDAIRE EST PROTÉGÉ SÉPARÉMENT. Une exception dans
  // l'analyse financière ne doit pas emporter la puissance recommandée et
  // les économies, qui sont ce que le visiteur est venu chercher.
  proteger('analyse financière', () => dessinerFinancier(e));
  proteger('optimiseur', () => dessinerOptimiseur());
  proteger('laboratoire', () => dessinerLaboratoire(e));

  $('avertissement').innerHTML = avertissement(e, HYPOTHESES);

  $('detail').innerHTML = [
    ...(source?.detailConso ? [['D’où vient votre consommation', source.detailConso]] : []),
    ['Ce que vous payez le kilowattheure', e.prixKwh.toFixed(3).replace('.', ',') + ' DT'],
    ['Production estimée', e.production.toLocaleString('fr-FR') + ' kWh / an'],
    [`Zone solaire (${lieu})`, `${zoneSolaire(reponses.gouvernorat)} — ${e.productible} kWh/kWc`],
    ['Consommé sur place / injecté',
      `${e.autoconsomme.toLocaleString('fr-FR')} / ${e.surplus.toLocaleString('fr-FR')} kWh`],
    ['Économie la première année', formater(e.economieAnnuelle)],
    ...(e.facteurOrientation < 1
      ? [['Effet de l’orientation',
          `−${Math.round((1 - e.facteurOrientation) * 100)} % par rapport au plein sud`]]
      : []),
  ].map(([t, d]) => `<dt>${t}</dt><dd>${d}</dd>`).join('');

  // La demande doit transporter l'étude que le visiteur a sous les yeux,
  // non celle calculée avant qu'il ne touche aux curseurs.
  dessinerDemande(e);
}

/** Le formulaire de demande, ou l'aveu que la boutique n'est pas ouverte. */
function dessinerDemande(etude) {
  if (!ouverte()) {
    $('demande').innerHTML = `<p style="margin-top:24px;color:rgba(255,255,255,.62);
      font-size:14.5px">La commande n’est pas encore ouverte. Renseignez
      <code>CONTACT</code> dans <code>js/prospect.js</code> pour la lancer.</p>`;
    return;
  }

  $('demande').innerHTML = `
    <div class="champ" style="margin-top:24px">
      <label for="nom" style="color:#fff">Votre nom</label>
      <input id="nom" name="nom" autocomplete="name" placeholder="Nom et prénom">
    </div>
    <div class="champ">
      <label for="telephone" style="color:#fff">Votre téléphone</label>
      <input id="telephone" name="telephone" type="tel" inputmode="tel"
        autocomplete="tel" placeholder="20 123 456">
    </div>
    <div class="champ">
      <label for="courriel" style="color:#fff">Votre courriel — facultatif</label>
      <input id="courriel" name="courriel" type="email" inputmode="email"
        autocomplete="email" placeholder="pour recevoir votre étude par écrit">
    </div>
    <p class="erreur" id="erreurDemande" role="alert" aria-live="polite"
      style="color:#ffd0c6"></p>
    <button class="btn primaire large" type="button" id="commander">
      Demander l’étude détaillée</button>
    <p style="margin-top:14px;font-size:13.5px;color:rgba(255,255,255,.6)">
      Votre demande nous parvient directement. Laissez votre courriel pour
      recevoir l’étude par écrit.</p>`;

  $('commander').addEventListener('click', async () => {
    const bouton = $('commander');
    const client = {
      nom: $('nom').value,
      telephone: $('telephone').value,
      courriel: $('courriel')?.value ?? '',
    };
    dernierClient = client;
    const manque = champsManquants(client);
    if (manque.length) {
      $('erreurDemande').textContent = `Indiquez ${manque.join(' et ')}.`;
      return;
    }

    const lieu = nomGouvernorat(reponses.gouvernorat);
    const versWhatsApp = () => {
      const lien = lienDemande(redigerDemande({ etude, client, gouvernorat: lieu }));
      if (lien) window.open(lien, '_blank', 'noopener');
    };

    // Sans serveur configuré, on garde le chemin d'avant, sans détour.
    if (!API) { versWhatsApp(); return; }

    bouton.disabled = true;
    bouton.textContent = 'Envoi…';
    $('erreurDemande').textContent = '';

    const r = await envoyerAuServeur({
      client, etude, toiture: cotesToit(),
      toit: { orientation: reponses.toit?.orientation, pente: reponses.toit?.pente },
      gouvernorat: lieu });

    if (r.ok) {
      $('demande').innerHTML = `<div style="margin-top:24px;background:rgba(255,255,255,.08);
        border-radius:14px;padding:22px">
        <div style="font-size:19px;font-weight:800;color:#fff">Demande enregistrée</div>
        <p style="color:rgba(255,255,255,.8);margin-top:8px">Votre référence :
          <b style="color:var(--or)">${echapper(r.reference)}</b>. Nous vous rappelons
          rapidement${client.courriel ? ', et votre étude part par courriel' : ''}.</p>
        <p style="margin-top:16px"><a class="btn" href="${lienDemande(
          redigerDemande({ etude, client, gouvernorat: lieu, payante: false }))}"
          target="_blank" rel="noopener">Nous écrire sur WhatsApp</a></p>
      </div>`;
      // La demande est partie : garder la simulation n'apporterait plus rien,
      // et proposer de « reprendre » après coup serait confus.
      effacer();
      return;
    }

    // Le serveur n'a pas répondu, ou a refusé : on ne perd pas le prospect.
    bouton.disabled = false;
    bouton.textContent = 'Demander l’étude détaillée';
    $('erreurDemande').textContent = `${r.message} Votre demande part sur WhatsApp.`;
    versWhatsApp();
  });
}

/* ------------------------------------------------------------------ */
/* Enchaînement                                                        */
/* ------------------------------------------------------------------ */

$('form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const e = ETAPES[etape];
  const valeur = e.lire ? e.lire() : (document.getElementById(e.cle)?.value ?? '');
  const souci = e.valide(valeur);
  if (souci) { $('erreur').textContent = souci; return; }

  reponses[e.cle] = valeur;
  // On journalise la clé de l'étape, jamais sa valeur : celle-ci peut
  // contenir des chiffres de facture, et le journal n'a pas à les connaître.
  noter('info', 'étape validée', { etape, cle: e.cle });
  if (etape < ETAPES.length - 1) { etape++; memoriser(); dessinerEtape(); }
  else { memoriser(true); dessinerResultat(); }
});

$('retour').addEventListener('click', () => {
  if (etape > 0) { etape--; dessinerEtape(); }
});

/* ------------------------------------------------------------------ */
/* L'accueil                                                           */
/* ------------------------------------------------------------------ */

/**
 * LA VITRE DE L'ACCUEIL — trois cas réellement calculés, qui défilent.
 *
 * Aucun de ces chiffres n'est écrit à la main : ils sortent du même moteur
 * que l'étude du visiteur. C'est ce qui autorise à les afficher avant qu'il
 * ait rien saisi — on ne lui promet rien, on lui montre la machine qui
 * tourne.
 */
function brancherVitre() {
  const vitre = $('vitre');
  if (!vitre) return;
  const cas = tousLesCas();
  if (!cas.length) { vitre.hidden = true; return; }

  let index = 0;
  let minuterie = null;

  $('vitrePoints').innerHTML = cas.map((c, i) => `<button type="button"
    data-cas="${i}" aria-current="${i === 0}"
    aria-label="Voir l’exemple : ${c.intitule}"></button>`).join('');

  const peindre = (anime = true) => {
    const c = cas[index];
    $('vitreTitre').textContent = c.intitule;
    $('vitreDetail').textContent = `${c.detail} — installation de ${
      String(c.puissance).replace('.', ',')} kWc`;
    $('vitreChiffres').innerHTML = c.chiffres.map((x) => `<div class="vitre-c${
      x.fort ? ' fort' : ''}">
      <span class="l">${x.libelle}</span>
      <span class="v" data-vitre="${x.cle}">0</span><span class="u">${x.unite}</span>
    </div>`).join('');

    for (const x of c.chiffres) {
      const noeud = $('vitreChiffres').querySelector(`[data-vitre="${x.cle}"]`);
      compter(noeud, x.valeur, {
        duree: anime ? 800 : 0,
        format: (v) => v.toLocaleString('fr-FR', {
          minimumFractionDigits: x.decimales, maximumFractionDigits: x.decimales }),
      });
    }

    for (const point of $('vitrePoints').querySelectorAll('[data-cas]')) {
      point.setAttribute('aria-current', String(Number(point.dataset.cas) === index));
    }
    if (anime && !mouvementReduit()) {
      vitre.classList.remove('change');
      void vitre.offsetWidth;
      vitre.classList.add('change');
    }
  };

  const relancer = () => {
    clearInterval(minuterie);
    // Le mouvement réduit arrête le défilement, il ne le ralentit pas : une
    // carte qui change toute seule est exactement ce que ce réglage refuse.
    if (mouvementReduit()) return;
    minuterie = setInterval(() => {
      index = (index + 1) % cas.length;
      peindre();
    }, DUREE_VITRE);
  };

  $('vitrePoints').addEventListener('click', (ev) => {
    const point = ev.target.closest('[data-cas]');
    if (!point) return;
    index = Number(point.dataset.cas);
    peindre();
    relancer();
  });

  // Un visiteur qui lit une carte ne doit pas la voir partir sous ses yeux.
  vitre.addEventListener('mouseenter', () => clearInterval(minuterie));
  vitre.addEventListener('mouseleave', relancer);
  vitre.addEventListener('focusin', () => clearInterval(minuterie));

  // Rien ne tourne pendant que l'onglet est ailleurs : c'est du calcul et du
  // rendu pour personne, et sur mobile c'est de la batterie.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearInterval(minuterie);
    else relancer();
  });

  peindre(false);
  relancer();
}

// La surveillance des erreurs est branchée AVANT tout le reste : une panne
// au démarrage est celle qu'on a le plus besoin de voir.
/**
 * La feuille de polices est chargée en `media="print"` pour ne pas bloquer le
 * premier rendu ; c'est ici qu'on l'active. Le faire en JavaScript plutôt
 * qu'avec un attribut `onload` permet d'interdire tout script en ligne dans
 * la politique de sécurité de contenu.
 */
for (const lien of document.querySelectorAll('link[data-polices]')) {
  if (lien.media === 'print') lien.media = 'all';
}

/**
 * Le relais vers le service de données solaires se déclare dans la page :
 *
 *     <meta name="pvgis-relais" content="https://…/api/pvgis">
 *
 * Le contrôleur le lit et le transmet à la couche d'intégration, qui ne
 * connaît pas le document. Sans balise, la plateforme reste sur son
 * référentiel interne — état normal, et chaque valeur l'indique.
 */
const relaisDeclare = document.querySelector('meta[name="pvgis-relais"]')?.content?.trim();
definirRelais(relaisDeclare);
noter('info', 'service de données solaires',
  { relais: serviceDisponible() ? 'configuré' : 'non configuré' });

// LE RELAIS DOIT FIGURER DANS `connect-src` DE LA POLITIQUE DE SÉCURITÉ.
// Sinon le navigateur bloque l'appel sans que le code s'en aperçoive : le
// service paraît simplement indisponible, et on cherche des heures du côté
// du serveur. Ce contrôle nomme la cause dans le journal.
if (relaisDeclare && serviceDisponible()) {
  const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]')
    ?.content ?? '';
  const hote = (() => { try { return new URL(relaisDeclare).origin; } catch { return ''; } })();
  if (hote && !csp.includes(hote)) {
    noter('avertissement', 'relais absent de la politique de sécurité', { hote });
  }
}

/**
 * Le fond de carte se déclare dans la page, comme le relais solaire :
 *
 *     <meta name="carte-fond" content="esri-imagerie">
 *
 * Sans balise, la carte reste utilisable — repère, coordonnées et échelle,
 * sans image du terrain — et elle l'écrit. C'est un état normal, pas une
 * panne : le projet n'engage personne auprès d'un fournisseur de tuiles tant
 * que ce n'est pas décidé.
 */
const fondDeclare = document.querySelector('meta[name="carte-fond"]')?.content?.trim();
if (fondDeclare) {
  const retenu = definirFond(fondDeclare);
  noter(retenu ? 'info' : 'avertissement', 'fond cartographique',
    retenu ? { fond: retenu.id, nature: retenu.nature }
      : { declare: fondDeclare, effet: 'inconnu, carte sans image' });

  // LE FOURNISSEUR DOIT FIGURER DANS `img-src`. Sinon le navigateur refuse
  // chaque tuile en silence : la carte paraît simplement vide, et on cherche
  // la panne du côté du réseau pendant une heure.
  if (retenu) {
    const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]')
      ?.content ?? '';
    for (const hote of hotesAAutoriser(retenu)) {
      if (!csp.includes(hote)) {
        noter('avertissement', 'fond de carte absent de la politique de sécurité',
          { hote });
      }
    }
  }
} else {
  noter('info', 'fond cartographique', { etat: 'non configuré' });
}

surveiller((message) => {
  const zone = $('erreurGlobale');
  if (!zone) return;
  zone.hidden = false;
  zone.textContent = message;
});

proteger('accueil', () => brancherVitre());

$('annee').textContent = new Date().getFullYear();
dessinerEtape();
proposerReprise();
