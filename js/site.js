/**
 * Le tunnel d'étude et l'affichage du résultat.
 *
 * Tout se passe dans le navigateur : les réponses ne partent nulle part tant
 * que le visiteur n'écrit pas lui-même. C'est ce que la page promet, donc
 * c'est ce qu'elle doit faire — aucune requête, aucun mouchard.
 */
import { GOUVERNORATS, nomGouvernorat, zoneSolaire } from './gisement.js';
import { HYPOTHESES, PUISSANCE } from './etude.js';
import { formater, formaterRond } from './prix.js';
import { localiser, REFUS } from './geo.js';
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
  panneauTechnique } from './tableau.js';
import { dimensionner, verdictGlobal } from './technique.js';
import { construireRapport } from './rapport.js';
import { reponses, simulation, reinitialiserSimulation, cotesToit, reglagePose,
  donneesEtude, etudeCourante, scenariosCourants } from './etat.js';
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
        <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        Me localiser
      </button>
    </div>
    <p class="indice" id="geoEtat" role="status" aria-live="polite"></p>
    <div class="champ">
      <label for="gouvernorat">Gouvernorat</label>
      <select id="gouvernorat" name="gouvernorat">
        <option value="">Choisissez…</option>
        ${GOUVERNORATS.map((g) => `<option value="${g.id}">${g.nom}</option>`).join('')}
      </select>
    </div>`,
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
      <svg viewBox="0 0 24 24"><path d="M13 2 3 14h8l-1 8 10-12h-8l1-8z"/></svg>
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

/** Les clés qu'une simulation peut légitimement contenir. */
const CLES = ETAPES.map((e) => e.cle);

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
  for (const cle of CLES) {
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
  const combien = Object.keys(gardees).length;
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
const COCHE = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" '
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
 * La localisation automatique — proposée, jamais imposée.
 *
 * Elle fait gagner un geste, mais elle approxime : à la frontière de deux
 * gouvernorats elle peut se tromper d'une case. Le résultat est donc
 * pré-sélectionné dans la liste, où il reste modifiable d'un geste.
 */
function brancherLocalisation() {
  const bouton = $('localiser');
  if (!bouton) return;
  bouton.addEventListener('click', async () => {
    const etat = $('geoEtat');
    bouton.disabled = true;
    etat.textContent = 'Recherche de votre position…';
    const r = await localiser();
    bouton.disabled = false;
    if (!r.ok) { etat.textContent = REFUS[r.raison]; return; }
    const liste = $('gouvernorat');
    liste.value = r.id;
    reponses.gouvernorat = r.id;
    etat.textContent = `Vous semblez être à ${nomGouvernorat(r.id)}.`
      + ' Corrigez ci-dessous si ce n’est pas le bon gouvernorat.';
  });
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

    <div class="bloc">
      <h4>Le détail</h4>
      <dl id="detail"></dl>
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
        <svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>${c}</li>`).join('')}</ul>
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
          <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 15h6M9 11h3"/></svg>
          Obtenir mon rapport</button>
        <button class="btn" type="button" id="versEtude">
          Demander une étude technique</button>
      </div>
      <div class="rapport-boite" id="rapportBoite" hidden></div>
    </div>

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
    rafraichir();
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
    rafraichir();
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
          <b style="color:var(--or)">${r.reference}</b>. Nous vous rappelons
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

brancherVitre();

$('annee').textContent = new Date().getFullYear();
dessinerEtape();
proposerReprise();
