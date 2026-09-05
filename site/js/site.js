/**
 * Le tunnel d'étude et l'affichage du résultat.
 *
 * Tout se passe dans le navigateur : les réponses ne partent nulle part tant
 * que le visiteur n'écrit pas lui-même. C'est ce que la page promet, donc
 * c'est ce qu'elle doit faire — aucune requête, aucun mouchard.
 */
import { GOUVERNORATS, nomGouvernorat, zoneSolaire } from './gisement.js';
import { etudier, HYPOTHESES } from './etude.js';
import { formater, formaterRond } from './prix.js';
import { OFFRE, CONTACT, ouverte, redigerDemande, lienDemande, champsManquants }
  from './prospect.js';

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
    champ: () => `<div class="champ">
      <label for="gouvernorat">Gouvernorat</label>
      <select id="gouvernorat" name="gouvernorat">
        <option value="">Choisissez…</option>
        ${GOUVERNORATS.map((g) => `<option value="${g.id}">${g.nom}</option>`).join('')}
      </select>
    </div>`,
    valide: (v) => (v ? null : 'Choisissez votre gouvernorat pour continuer.'),
  },
  {
    cle: 'consommation',
    titre: 'Combien consommez-vous par an ?',
    aide: 'En kilowattheures, tels qu’ils figurent sur vos factures STEG.',
    champ: () => `<div class="champ">
      <label for="consommation">Consommation annuelle (kWh)</label>
      <input id="consommation" name="consommation" type="number" inputmode="numeric"
        min="200" max="200000" step="1" placeholder="4800">
      <p class="indice">Un foyer tunisien moyen consomme entre 2 000 et 6 000 kWh par an.</p>
    </div>
    <details class="repli"><summary>Où trouver ce chiffre ?</summary>
      <p>Sur votre facture STEG, dans le relevé de consommation, en kWh. Les
      factures étant bimestrielles, additionnez les six de l’année — ou
      multipliez par six une facture représentative. Une approximation
      raisonnable suffit à l’estimation.</p></details>`,
    valide: (v) => {
      const n = Number(v);
      if (!(n > 0)) return 'Indiquez votre consommation annuelle en kWh.';
      if (n < 200) return 'Ce chiffre paraît trop bas pour une année entière.';
      if (n > 200000) return 'Au-delà de 200 000 kWh, il s’agit d’un projet industriel : écrivez-nous.';
      return null;
    },
  },
  {
    cle: 'montant',
    titre: 'Combien payez-vous par an ?',
    aide: 'C’est ce qui permet de connaître VOTRE prix du kilowattheure, et non une moyenne.',
    champ: () => `<div class="champ">
      <label for="montant">Montant annuel payé à la STEG (DT)</label>
      <input id="montant" name="montant" type="number" inputmode="decimal"
        min="50" max="500000" step="0.001" placeholder="1200">
      <p class="indice">Total des six factures de l’année, électricité seule.</p>
    </div>
    <details class="repli"><summary>Pourquoi cette question ?</summary>
      <p>Le tarif STEG est progressif et dépend de votre contrat : deux foyers
      consommant autant ne paient pas le même prix. En divisant votre montant
      par votre consommation, on obtient ce que <em>vous</em> payez réellement,
      donc l’économie que <em>vous</em> feriez.</p></details>`,
    valide: (v) => {
      const n = Number(v);
      if (!(n > 0)) return 'Indiquez le montant annuel payé à la STEG.';
      if (n < 50) return 'Ce montant paraît trop bas pour une année entière.';
      return null;
    },
  },
  {
    cle: 'surface',
    titre: 'Quelle surface de toiture est disponible ?',
    aide: 'Facultatif. Sans réponse, on suppose que la place ne manque pas.',
    champ: () => `<div class="champ">
      <label for="surface">Surface exploitable (m²) — facultatif</label>
      <input id="surface" name="surface" type="number" inputmode="numeric"
        min="0" max="2000" step="1" placeholder="Laissez vide si vous ne savez pas">
      <p class="indice">Comptez environ ${HYPOTHESES.surfaceParKwc} m² par kilowatt-crête,
        hors zones ombragées.</p>
    </div>`,
    valide: () => null,
  },
];

let etape = 0;

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

  const saisi = document.getElementById(e.cle);
  if (saisi) {
    if (reponses[e.cle] !== undefined) saisi.value = reponses[e.cle];
    saisi.focus({ preventScroll: true });
  }
}

/* ------------------------------------------------------------------ */
/* Résultat                                                            */
/* ------------------------------------------------------------------ */

function chiffre(valeur, libelle, fort = false) {
  return `<div class="chiffre${fort ? ' fort' : ''}">
    <span class="v">${valeur}</span><span class="l">${libelle}</span></div>`;
}

function dessinerResultat() {
  const e = etudier({
    consommationAnnuelle: Number(reponses.consommation),
    montantAnnuel: Number(reponses.montant),
    gouvernorat: reponses.gouvernorat,
    surfaceDisponible: Number(reponses.surface) || 0,
  });

  // Une étude incomplète ne s'affiche pas à moitié.
  if (!e) {
    $('erreur').textContent = 'Ces chiffres ne permettent pas de conclure. Vérifiez votre saisie.';
    return;
  }

  const lieu = nomGouvernorat(reponses.gouvernorat);
  const couverture = Math.round(e.couverture * 100);

  $('resultat').innerHTML = `
    <h3 style="text-align:center;font-size:26px;margin-bottom:8px">
      Votre installation : ${e.puissance} kWc</h3>
    <p class="sous-titre" style="margin-bottom:0">À ${lieu}, ${e.modules} modules
      sur environ ${e.surface} m² couvriraient ${couverture} % de votre consommation.</p>

    <div class="chiffres">
      ${chiffre(formaterRond(e.economieMensuelle), 'économie / mois', true)}
      ${chiffre(e.retour ? e.retour.toFixed(1).replace('.', ',') + ' ans' : '—', 'retour sur investissement')}
      ${chiffre(formaterRond(e.cout), 'coût estimé')}
      ${chiffre(formaterRond(e.gainNet), 'gain net sur 25 ans')}
    </div>

    <div class="detail">
      <dl>
        <dt>Ce que vous payez le kilowattheure</dt><dd>${e.prixKwh.toFixed(3).replace('.', ',')} DT</dd>
        <dt>Production estimée</dt><dd>${e.production.toLocaleString('fr')} kWh / an</dd>
        <dt>Zone solaire (${lieu})</dt><dd>${zoneSolaire(reponses.gouvernorat)} — ${e.productible} kWh/kWc</dd>
        <dt>Consommé sur place / injecté</dt><dd>${e.autoconsomme.toLocaleString('fr')} / ${e.surplus.toLocaleString('fr')} kWh</dd>
        <dt>Économie la première année</dt><dd>${formater(e.economieAnnuelle)}</dd>
      </dl>
      <p class="avert"><b>Cette estimation ne remplace pas une visite.</b> Elle ne
        voit ni l’orientation exacte de votre toit, ni l’ombre du bâtiment voisin,
        ni l’état de votre tableau électrique. Les coûts retenus sont des ordres
        de grandeur du marché tunisien, non un devis.</p>
    </div>

    <div class="offre">
      <h3>L’étude détaillée</h3>
      <div class="prix">${formaterRond(OFFRE.prix)}</div>
      <p style="color:rgba(255,255,255,.72);font-size:15px">Le dossier qu’un
        installateur accepte comme base de devis — et que vous pouvez opposer à
        trois devis contradictoires.</p>
      <ul>${OFFRE.contenu.map((c) => `<li>
        <svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>${c}</li>`).join('')}</ul>
      <div id="demande"></div>
    </div>

    <p style="text-align:center;margin-top:26px">
      <button class="btn" type="button" id="recommencer">Refaire une estimation</button></p>`;

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
    <p class="erreur" id="erreurDemande" role="alert" aria-live="polite"
      style="color:#ffd0c6"></p>
    <button class="btn primaire large" type="button" id="commander">
      Demander l’étude détaillée</button>
    <p style="margin-top:14px;font-size:13.5px;color:rgba(255,255,255,.6)">
      Vous serez dirigé vers WhatsApp, avec votre estimation déjà écrite.
      Joignez-y la photo de votre facture STEG.</p>`;

  $('commander').addEventListener('click', () => {
    const client = { nom: $('nom').value, telephone: $('telephone').value };
    const manque = champsManquants(client);
    if (manque.length) {
      $('erreurDemande').textContent = `Indiquez ${manque.join(' et ')}.`;
      return;
    }
    const texte = redigerDemande({
      etude, client, gouvernorat: nomGouvernorat(reponses.gouvernorat) });
    const lien = lienDemande(texte);
    if (lien) window.open(lien, '_blank', 'noopener');
  });
}

/* ------------------------------------------------------------------ */
/* Enchaînement                                                        */
/* ------------------------------------------------------------------ */

$('form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const e = ETAPES[etape];
  const valeur = document.getElementById(e.cle)?.value ?? '';
  const souci = e.valide(valeur);
  if (souci) { $('erreur').textContent = souci; return; }

  reponses[e.cle] = valeur;
  if (etape < ETAPES.length - 1) { etape++; dessinerEtape(); }
  else dessinerResultat();
});

$('retour').addEventListener('click', () => {
  if (etape > 0) { etape--; dessinerEtape(); }
});

$('annee').textContent = new Date().getFullYear();
dessinerEtape();
