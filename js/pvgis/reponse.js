/**
 * LA NORMALISATION DES RÉPONSES — du brut du service à nos propres formes.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ AVERTISSEMENT HONNÊTE, ET IL COMPTE. Ces convertisseurs sont écrits   │
 * │ d'après le contrat documenté de l'API v5.3. Ils N'ONT PAS ÉTÉ         │
 * │ CONFRONTÉS À UNE RÉPONSE RÉELLE depuis cet environnement, dont la     │
 * │ sortie réseau est fermée. Chaque champ lu est donc lu défensivement : │
 * │ absent, il donne une donnée « absente », jamais un zéro. Une clé qui  │
 * │ aurait changé de nom se verra comme un trou dans le résultat, et non  │
 * │ comme une production nulle.                                           │
 * │                                                                       │
 * │ `scripts/verifier-pvgis.mjs` confronte ces convertisseurs à une vraie │
 * │ réponse en une commande, depuis une machine qui a accès au réseau.    │
 * └──────────────────────────────────────────────────────────────────────┘
 */
import { tracer, absente } from '../provenance.js';
import { ATTRIBUTION, VERSION_API } from './config.js';

const nombre = (v) => {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Le chemin `a.b.c` d'un objet, ou `null` — jamais d'exception. */
function au(objet, chemin) {
  let courant = objet;
  for (const part of chemin.split('.')) {
    if (courant === null || courant === undefined) return null;
    courant = courant[part];
  }
  return courant ?? null;
}

/** Ce qu'on cite avec chaque valeur venue du service. */
function origine(brut, parametres, calcul) {
  return {
    service: ATTRIBUTION.nom,
    editeur: ATTRIBUTION.editeur,
    versionApi: VERSION_API,
    calcul,
    baseDonnees: au(brut, 'inputs.meteo_data.radiation_db'),
    baseTemperature: au(brut, 'inputs.meteo_data.meteo_db'),
    anneeDebut: nombre(au(brut, 'inputs.meteo_data.year_min')),
    anneeFin: nombre(au(brut, 'inputs.meteo_data.year_max')),
    parametres,
    interrogeLe: new Date().toISOString(),
  };
}

/** Une valeur du service, enveloppée avec sa provenance. */
const duService = (valeur, { unite, methode, details }) => (valeur === null
  ? absente(methode)
  : tracer(valeur, { source: 'externe', unite, methode, details, confiance: 'elevee' }));

/**
 * Normalise une réponse de calcul de production.
 *
 * @returns {{ok:true, production, productible, irradiation, mensuel, variabilite,
 *   pertes, site, origine}|{ok:false, raison}}
 */
export function production(brut, { parametres = {}, puissanceKwc = null } = {}) {
  if (!brut || typeof brut !== 'object') {
    return { ok: false, raison: 'réponse vide ou illisible' };
  }
  const o = origine(brut, parametres, 'PVcalc');
  const fixe = au(brut, 'outputs.totals.fixed');
  const mois = au(brut, 'outputs.monthly.fixed');

  // Sans production annuelle, il n'y a rien à exploiter : mieux vaut le dire
  // que rendre un objet à moitié rempli que l'appelant croira complet.
  const annuel = nombre(au(fixe, 'E_y'));
  if (annuel === null) {
    return { ok: false, raison: 'production annuelle absente de la réponse' };
  }

  const kwc = nombre(puissanceKwc) ?? nombre(au(brut, 'inputs.pv_module.peak_power'));
  const irradiationAn = nombre(au(fixe, 'H(i)_y'));

  const mensuel = Array.isArray(mois) && mois.length === 12
    ? mois.map((m) => ({
      mois: nombre(m?.month),
      production: nombre(m?.E_m),
      irradiation: nombre(m?.['H(i)_m']),
      ecartType: nombre(m?.SD_m),
    }))
    : null;

  return {
    ok: true,
    origine: o,
    production: duService(annuel, {
      unite: 'kWh/an',
      methode: `Calcul de production PVGIS ${VERSION_API} (PVcalc), base `
        + `${o.baseDonnees ?? 'non précisée'}`,
      details: o,
    }),
    // Le productible — kWh par kWc et par an — est ce que notre moteur
    // consomme. Il se déduit de la production et de la puissance demandée :
    // c'est donc un CALCUL de notre part, pas une donnée du service.
    productible: (kwc > 0 && annuel !== null)
      ? tracer(Math.round(annuel / kwc), {
        source: 'calcul', unite: 'kWh/kWc/an',
        methode: 'production annuelle du service ÷ puissance demandée',
        confiance: 'elevee', details: { annuel, puissanceKwc: kwc },
      })
      : absente('puissance manquante pour déduire le productible'),
    irradiation: duService(irradiationAn, {
      unite: 'kWh/m²/an',
      methode: 'Irradiation dans le plan des modules, PVGIS',
      details: o,
    }),
    mensuel: mensuel
      ? tracer(mensuel, {
        source: 'externe', unite: 'kWh/mois',
        methode: 'Production mensuelle PVGIS (PVcalc)', details: o, confiance: 'elevee' })
      : absente('production mensuelle absente de la réponse'),
    pertes: {
      angulaires: nombre(au(fixe, 'l_aoi')),
      spectrales: nombre(au(fixe, 'l_spec')),
      temperature: nombre(au(fixe, 'l_tg')),
      totales: nombre(au(fixe, 'l_total')),
    },
    site: siteDepuis(brut),
  };
}

/** La fiche du site, telle que le service la renvoie. */
export function siteDepuis(brut) {
  const lat = nombre(au(brut, 'inputs.location.latitude'));
  const lon = nombre(au(brut, 'inputs.location.longitude'));
  const alt = nombre(au(brut, 'inputs.location.elevation'));
  return {
    latitude: lat === null ? absente() : tracer(lat, { source: 'externe', unite: '°' }),
    longitude: lon === null ? absente() : tracer(lon, { source: 'externe', unite: '°' }),
    altitude: alt === null
      ? absente('altitude absente de la réponse')
      : tracer(alt, { source: 'externe', unite: 'm',
        methode: 'Modèle numérique de terrain du service' }),
    baseDonnees: au(brut, 'inputs.meteo_data.radiation_db'),
    periode: {
      debut: nombre(au(brut, 'inputs.meteo_data.year_min')),
      fin: nombre(au(brut, 'inputs.meteo_data.year_max')),
    },
    horizonUtilise: au(brut, 'inputs.meteo_data.use_horizon'),
  };
}

/**
 * L'heure d'un profil de journée, en heures décimales.
 *
 * Le service la donne tantôt en nombre (6, 6.5), tantôt en texte
 * (« 06:00 », « 06:30 »). Un parseur numérique naïf rejetait la seconde forme
 * et vidait le profil de toutes ses lignes — un graphique parfaitement vide,
 * sans la moindre erreur pour le signaler.
 */
export function heureDecimale(v) {
  const direct = nombre(v);
  if (direct !== null) return direct;
  const m = /^(\d{1,2})[:h](\d{2})?$/.exec(String(v ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (!Number.isFinite(h) || h < 0 || h > 24 || min < 0 || min >= 60) return null;
  return h + min / 60;
}

/** Normalise un profil de journée moyenne. */
export function journee(brut, { parametres = {}, mois = null } = {}) {
  const lignes = au(brut, 'outputs.daily_profile');
  if (!Array.isArray(lignes) || !lignes.length) {
    return { ok: false, raison: 'profil de journée absent de la réponse' };
  }
  const o = origine(brut, parametres, 'DRcalc');
  return {
    ok: true,
    origine: o,
    mois,
    heures: lignes.map((l) => ({
      heure: heureDecimale(l?.time ?? l?.T ?? l?.hour),
      global: nombre(l?.G_i ?? l?.['G(i)']),
      direct: nombre(l?.Gb_i ?? l?.['Gb(i)']),
      diffus: nombre(l?.Gd_i ?? l?.['Gd(i)']),
      temperature: nombre(l?.T2m),
      production: nombre(l?.P),
    })).filter((h) => h.heure !== null),
  };
}

/** Normalise un profil d'horizon. */
export function horizon(brut, { parametres = {} } = {}) {
  const lignes = au(brut, 'outputs.horizon_profile');
  if (!Array.isArray(lignes) || !lignes.length) {
    return { ok: false, raison: 'profil d’horizon absent de la réponse' };
  }
  const points = lignes.map((l) => ({
    azimut: nombre(l?.A),
    hauteur: nombre(l?.H_hor ?? l?.['H_hor']),
  })).filter((p) => p.azimut !== null && p.hauteur !== null);
  if (!points.length) return { ok: false, raison: 'profil d’horizon illisible' };

  return {
    ok: true,
    origine: origine(brut, parametres, 'printhorizon'),
    points,
    hauteurMax: Math.max(...points.map((p) => p.hauteur)),
    hauteurMoyenne: points.reduce((s, p) => s + p.hauteur, 0) / points.length,
    /**
     * CE QUE CE PROFIL EST, ET CE QU'IL N'EST PAS.
     * Il décrit le RELIEF — collines, montagnes — autour du point. Il ne voit
     * ni l'arbre du voisin, ni la cheminée, ni le bâtiment mitoyen. Confondre
     * les deux ferait croire à une analyse d'ombrage qui n'a pas eu lieu.
     */
    portee: 'terrain',
    avertissement: 'Ce profil décrit le relief autour du site. Il ne comprend '
      + 'ni les arbres, ni les cheminées, ni les bâtiments voisins : ces obstacles '
      + 'se relèvent sur place.',
  };
}

/** Normalise une simulation d'installation autonome. */
export function autonome(brut, { parametres = {} } = {}) {
  const t = au(brut, 'outputs.totals') ?? au(brut, 'outputs');
  if (!t || typeof t !== 'object') {
    return { ok: false, raison: 'résultats hors réseau absents de la réponse' };
  }
  const o = origine(brut, parametres, 'SHScalc');
  const lire = (chemin, unite, methode) => {
    const v = nombre(au(t, chemin));
    return v === null ? absente(methode) : duService(v, { unite, methode, details: o });
  };
  return {
    ok: true,
    origine: o,
    energieUtile: lire('E_lost.d_total', 'Wh/jour', 'Énergie non utilisée, PVGIS'),
    chargeManquee: lire('f_f', '%', 'Part des jours où la charge n’est pas couverte'),
    batterieVide: lire('f_e', '%', 'Part du temps où la batterie est vide'),
    brut: t,
  };
}
