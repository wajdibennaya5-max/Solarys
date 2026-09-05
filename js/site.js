/**
 * Le tunnel d'étude et l'affichage du résultat.
 *
 * Tout se passe dans le navigateur : les réponses ne partent nulle part tant
 * que le visiteur n'écrit pas lui-même. C'est ce que la page promet, donc
 * c'est ce qu'elle doit faire — aucune requête, aucun mouchard.
 */
import { GOUVERNORATS, nomGouvernorat, zoneSolaire } from './gisement.js';
import { etudier, HYPOTHESES, PUISSANCE } from './etude.js';
import { formater, formaterRond } from './prix.js';
import { localiser, REFUS } from './geo.js';
import { planCalepinage } from './calepinage.js';
import { ORIENTATIONS, PENTES, expliquerOrientation } from './orientation.js';
import { MOIS } from './gisement.js';
import { PERIODES, REPERES, versAnnuel, verifier as verifierFacture } from './facture.js';
import { construireGraphe, grapheMensuel } from './graphe.js';
import { OFFRE, CONTACT, ouverte, redigerDemande, lienDemande, champsManquants,
  envoyerAuServeur, API } from './prospect.js';
import { enregistrer, relire, effacer, ageEnClair } from './session.js';
import { comparer, scenarioParDefaut, ecart } from './scenarios.js';

const $ = (id) => document.getElementById(id);
const reponses = {};

/**
 * Les étapes, dans l'ordre.
 *
 * Chacune ne pose qu'une question : sur un téléphone, un formulaire de quatre
 * champs fait abandonner là où quatre écrans d'un champ font avancer.
 */
const ETAPES = [
  {
    cle: 'gouvernorat',
    titre: 'Où se trouve votre logement ?',
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
    cle: 'facture',
    titre: 'Prenez votre dernière facture STEG',
    aide: 'Deux nombres à recopier — rien à calculer, rien à connaître par cœur.',
    champ: () => `
    <svg viewBox="0 0 320 150" class="facture-schema" role="img"
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
    </svg>
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
        ${PERIODES.map((p) => `<option value="${p.id}"${
          p.defaut ? ' selected' : ''}>${p.nom}</option>`).join('')}
      </select>
    </div>
    <details class="repli"><summary>Je n’ai pas ma facture sous la main</summary>
      <p>Vous la retrouvez dans l’espace client STEG, ou sur le papier reçu par
      la poste. Toutes les factures portent ces deux nombres au même endroit ;
      n’importe laquelle des six de l’année convient.</p></details>`,
    lire: () => ({
      quantite: $('quantite')?.value ?? '',
      montant: $('montant')?.value ?? '',
      periode: $('periode')?.value ?? 'bimestrielle',
    }),
    valide: (v) => verifierFacture(v),
    restaure: (v) => {
      if ($('quantite')) $('quantite').value = v.quantite ?? '';
      if ($('montant')) $('montant').value = v.montant ?? '';
      if ($('periode')) $('periode').value = v.periode ?? 'bimestrielle';
    },
  },
  {
    cle: 'toit',
    titre: 'Comment est orienté votre toit ?',
    aide: 'C’est ce qui pèse le plus : un pan plein est produit 17 % de moins qu’un plein sud.',
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
    <details class="repli"><summary>Je ne sais pas l’orientation</summary>
      <p>Placez-vous devant votre maison, face à la façade principale. Au milieu
      de la journée, le soleil est au sud : le pan qui reçoit le plus de soleil
      à midi est le bon. Dans le doute, laissez « Plein sud » — l’étude détaillée
      le vérifiera sur place.</p></details>`,
    lire: () => ({
      pente: $('pente')?.value ?? 'moyenne',
      orientation: $('orientation')?.value ?? 'sud',
    }),
    valide: () => null,
    restaure: (v) => {
      if ($('pente')) $('pente').value = v.pente ?? 'moyenne';
      if ($('orientation')) $('orientation').value = v.orientation ?? 'sud';
      majOrientation();
    },
  },
  {
    cle: 'toiture',
    titre: 'Quelles sont les cotes de votre toiture ?',
    aide: 'Facultatif — mais c’est ce qui permet de placer les panneaux sur VOTRE toit.',
    champ: () => `<div class="champ">
      <label for="toitL">Largeur du pan (m)</label>
      <input id="toitL" name="toitL" type="number" inputmode="decimal"
        min="0" max="200" step="0.1" placeholder="8">
    </div>
    <div class="champ">
      <label for="toitP">Profondeur du pan (m)</label>
      <input id="toitP" name="toitP" type="number" inputmode="decimal"
        min="0" max="200" step="0.1" placeholder="6">
      <p class="indice">Le pan orienté au sud, ou celui qui reçoit le plus de
        soleil. Laissez vide si vous ne les connaissez pas.</p>
    </div>`,
    // Les deux cotes vont ensemble : une seule ne dessine aucun toit.
    lire: () => ({ L: Number($('toitL')?.value) || 0, P: Number($('toitP')?.value) || 0 }),
    valide: (v) => {
      if (!v.L && !v.P) return null; // facultatif, et assumé comme tel
      if (!v.L || !v.P) return 'Indiquez les deux cotes, ou laissez-les vides toutes les deux.';
      if (v.L * v.P < 4) return 'Ce pan paraît trop petit pour porter des panneaux.';
      return null;
    },
    restaure: (v) => { if ($('toitL')) { $('toitL').value = v.L || ''; $('toitP').value = v.P || ''; } },
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
  enregistrer({ etape, fini, reponses });
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

function dessinerJauge() {
  $('jauge').innerHTML = ETAPES.map((_, i) => {
    const etat = i < etape ? 'faite' : i === etape ? 'active' : '';
    const trait = i < ETAPES.length - 1 ? '<span class="trait"></span>' : '';
    const contenu = i < etape
      ? '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
      : String(i + 1);
    return `<span class="pas ${etat}"><b>${contenu}</b>${trait}</span>`;
  }).join('');
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

/** L'état de la simulation : ce que le visiteur a déplacé lui-même. */
let simulation = { puissance: null, surface: 0 };

/**
 * Les données du foyer, telles que le calcul les attend.
 *
 * Un seul endroit où elles se composent : l'étude affichée et les trois
 * scénarios comparés doivent reposer exactement sur les mêmes chiffres, sans
 * quoi la comparaison ne voudrait rien dire.
 */
function donneesEtude() {
  const toit = reponses.toit ?? {};
  const annuel = versAnnuel(reponses.facture ?? {});
  if (!annuel) return null;
  return {
    consommationAnnuelle: annuel.consommationAnnuelle,
    montantAnnuel: annuel.montantAnnuel,
    gouvernorat: reponses.gouvernorat,
    surfaceDisponible: simulation.surface,
    orientation: toit.orientation ?? null,
    pente: toit.pente ?? null,
  };
}

/** Recalcule l'étude avec les réglages courants. */
function etudeCourante() {
  const d = donneesEtude();
  if (!d) return null;
  return etudier({ ...d, puissance: simulation.puissance });
}

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
  const d = donneesEtude();
  const trio = d ? comparer(d) : [];

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
  const toit = reponses.toiture ?? {};
  simulation = { puissance: null, surface: (toit.L || 0) * (toit.P || 0) };
  const e = etudeCourante();

  // Une étude incomplète ne s'affiche pas à moitié.
  if (!e) {
    $('erreur').textContent = 'Ces chiffres ne permettent pas de conclure. Vérifiez votre saisie.';
    return;
  }
  simulation.puissance = e.puissance;

  $('resultat').innerHTML = `
    <h3 style="text-align:center;font-size:27px;margin-bottom:9px" id="titreRes"></h3>
    <p class="sous-titre" style="margin-bottom:0" id="sousRes"></p>

    <div class="chiffres" id="chiffres"></div>

    <div class="bloc" id="blocScenarios">
      <h4>Trois façons de dimensionner votre toiture</h4>
      <p class="note">Le même toit, le même soleil, la même facture : seule la
        taille change. Le plus petit se rembourse le plus vite, le plus grand
        rapporte le plus sur vingt-cinq ans. Touchez celui qui vous ressemble —
        tout le reste de la page suit.</p>
      <div class="scenarios" id="scenarios"></div>
      <p class="indice" id="noteScenarios" role="status" style="margin-top:14px"></p>
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
        Les chiffres et la courbe suivent.</p>
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
      <p class="avert"><b>Cette estimation ne remplace pas une visite.</b> Elle ne
        voit ni l’orientation exacte de votre toit, ni l’ombre du bâtiment voisin,
        ni l’état de votre tableau électrique. Les coûts retenus sont des ordres
        de grandeur du marché tunisien, non un devis.</p>
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

    <p style="text-align:center;margin-top:26px">
      <button class="btn" type="button" id="recommencer">Refaire une estimation</button></p>`;

  // Bornes des curseurs, autour de la recommandation.
  const cP = $('cPuissance');
  cP.min = PUISSANCE.min; cP.max = Math.max(PUISSANCE.min + 5, e.puissance * 2.5);
  cP.step = PUISSANCE.pas; cP.value = e.puissance;
  $('cSurface').value = simulation.surface;

  cP.addEventListener('input', () => {
    simulation.puissance = Number(cP.value);
    rafraichir();
  });

  // Une seule écoute sur le conteneur : les cartes sont redessinées à chaque
  // rafraîchissement, des écoutes posées sur chacune fuiraient à chaque fois.
  $('scenarios').addEventListener('click', (ev) => {
    const carte = ev.target.closest('[data-kwc]');
    if (!carte) return;
    simulation.puissance = Number(carte.dataset.kwc);
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
  dessinerDemande(e);
  $('form').hidden = true;
  $('jauge').hidden = true;
  $('resultat').hidden = false;
  $('resultat').scrollIntoView({ behavior: 'smooth', block: 'start' });

  $('recommencer').addEventListener('click', () => {
    etape = 0;
    $('resultat').hidden = true;
    $('form').hidden = false;
    $('jauge').hidden = false;
    dessinerEtape();
    $('tunnel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

/** Redessine tout ce qui dépend des curseurs. */
function rafraichir() {
  const e = etudeCourante();
  if (!e) return;
  const lieu = nomGouvernorat(reponses.gouvernorat);
  const couverture = Math.round(e.couverture * 100);

  $('titreRes').textContent = `Votre installation : ${
    String(e.puissance).replace('.', ',')} kWc`;
  $('sousRes').textContent = `À ${lieu}, ${e.modules} modules sur environ `
    + `${e.surface} m² couvriraient ${couverture} % de votre consommation.`;

  $('chiffres').innerHTML = [
    [formaterRond(e.economieMensuelle), 'économie / mois', true],
    [e.retour ? String(e.retour.toFixed(1)).replace('.', ',') + ' ans' : 'au-delà de 25 ans',
      'retour sur investissement', false],
    [formaterRond(e.cout), 'coût estimé', false],
    [formaterRond(e.gainNet), 'gain net sur 25 ans', false],
  ].map(([v, l, fort]) => `<div class="chiffre${fort ? ' fort' : ''}">
    <span class="v">${v}</span><span class="l">${l}</span></div>`).join('');

  $('graphe').innerHTML = construireGraphe(e, { largeur: 620, hauteur: 250 }).svg;

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
  const toit = reponses.toiture ?? {};
  const trace = (toit.L && toit.P) ? planCalepinage(toit.L, toit.P, { largeurPx: 560 }) : null;
  $('blocToit').hidden = !trace;
  if (trace) {
    const c = trace.plan;
    $('planToit').innerHTML = trace.svg;
    $('noteToit').textContent = `Sur un pan de ${String(toit.L).replace('.', ',')} × `
      + `${String(toit.P).replace('.', ',')} m, ${c.nombre} modules tiennent en `
      + `${c.rangees} rangée${c.rangees > 1 ? 's' : ''} de ${c.colonnes}, posés en `
      + `${c.orientation} — soit ${String(c.puissance).replace('.', ',')} kWc au maximum. `
      + `Marges de rive et jeux entre modules compris.`;
  }

  $('detail').innerHTML = [
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
      client, etude, toiture: reponses.toiture, toit: reponses.toit, gouvernorat: lieu });

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

$('annee').textContent = new Date().getFullYear();
dessinerEtape();
proposerReprise();
