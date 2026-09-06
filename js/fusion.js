/**
 * SOLAR DATA FUSION ENGINE — réunir sans confondre.
 *
 * Une étude assemble aujourd'hui des données de cinq natures : ce que le
 * client a saisi, ce qu'un service scientifique a renvoyé, ce que le
 * catalogue matériel contient, ce que nos moteurs ont calculé, et ce que nous
 * avons supposé faute de mieux.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ LE DANGER N'EST PAS DE LES MÉLANGER — il faut bien les réunir pour    │
 * │ produire une étude. Le danger est de PERDRE LEUR ORIGINE en route.    │
 * │ Une production annuelle affichée sans son origine peut venir d'un     │
 * │ modèle satellitaire validé sur vingt ans ou d'une moyenne régionale   │
 * │ que nous avons écrite à la main. Les deux se ressemblent à l'écran ;  │
 * │ elles n'ont pas la même valeur devant un installateur.                │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Ce fichier ne calcule rien. Il étiquette, et il refuse d'étiqueter mieux
 * que ce qu'il sait.
 */
import { tracer, absente, disponible, confianceGlobale, composition, estTracee }
  from './provenance.js';
import { productible as productibleInterne, zoneSolaire, nomGouvernorat } from './gisement.js';
import { ATTRIBUTION, disponible as serviceDisponible, RAISON_INDISPONIBLE }
  from './pvgis/config.js';

/**
 * LA FICHE DU SITE — ce que la plateforme sait du lieu, et d'où elle le sait.
 *
 * @param {object} entrees les données assemblées par `etat.js`
 * @param {object|null} mesureService un résultat normalisé du service, ou `null`
 */
export function profilSite(entrees = {}, mesureService = null) {
  const lat = Number(entrees.latitude);
  const lon = Number(entrees.longitude);
  const auPoint = entrees.originePosition === 'capteur';
  const parService = Boolean(mesureService?.ok);

  const coordonnee = (v, nom) => (Number.isFinite(v)
    ? tracer(Math.round(v * 1e5) / 1e5, {
      source: auPoint ? 'mesure' : 'calcul',
      unite: '°',
      methode: auPoint
        ? 'Position renvoyée par le capteur de l’appareil'
        : 'Centre du gouvernorat choisi — position approchée',
      confiance: auPoint ? 'elevee' : 'preliminaire',
    })
    : absente(`${nom} inconnue`));

  const productible = parService && disponible(mesureService.productible)
    ? mesureService.productible
    : tracer(productibleInterne(entrees.gouvernorat), {
      source: 'interne',
      unite: 'kWh/kWc/an',
      methode: `Référentiel interne par gouvernorat (${
        zoneSolaire(entrees.gouvernorat) ?? 'zone inconnue'})`,
      confiance: 'moyenne',
      details: { gouvernorat: entrees.gouvernorat },
    });

  return {
    lieu: nomGouvernorat(entrees.gouvernorat),
    latitude: coordonnee(lat, 'Latitude'),
    longitude: coordonnee(lon, 'Longitude'),
    // Une précision de zéro n'existe pas : c'est ce que renvoient les
    // émulateurs et certains navigateurs qui ne la connaissent pas.
    // L'afficher ferait croire à une position au centimètre.
    precision: Number.isFinite(entrees.precisionPosition) && entrees.precisionPosition > 0
      ? tracer(Math.round(entrees.precisionPosition), {
        source: 'mesure', unite: 'm',
        methode: 'Précision annoncée par le capteur' })
      : absente('précision non communiquée par l’appareil'),
    altitude: parService && mesureService.site
      ? mesureService.site.altitude
      : absente('altitude disponible seulement via le service de données'),
    productible,
    baseDonnees: parService && mesureService.origine?.baseDonnees
      ? tracer(mesureService.origine.baseDonnees, {
        source: 'externe', methode: 'Base de rayonnement retenue par le service' })
      : absente('aucune base externe interrogée'),
    periode: parService && mesureService.origine?.anneeDebut
      ? tracer(`${mesureService.origine.anneeDebut}–${mesureService.origine.anneeFin}`, {
        source: 'externe', methode: 'Période couverte par la base de données' })
      : absente('période non applicable au référentiel interne'),
    /** L'analyse d'ombrage n'a jamais lieu, et cela se dit ici aussi. */
    horizon: absente('profil d’horizon non demandé'),
    obstacles: absente('aucun obstacle de toiture relevé'),
    origineDonnees: parService ? 'externe' : 'interne',
    attribution: parService ? ATTRIBUTION : null,
  };
}

/**
 * SITE DATA CONFIDENCE — la qualité des données du LIEU, et rien d'autre.
 *
 * Elle ne dit rien de la qualité du projet ni de celle de l'étude : un très
 * bon projet sur un point mal localisé doit afficher une confiance de site
 * basse, et le dire. Elle n'est jamais inventée : chaque cran est justifié
 * par un fait vérifiable.
 */
export function confianceSite(profil) {
  const raisons = [];
  let niveau = 'preliminaire';

  const auPoint = profil.latitude?.source === 'mesure';
  const parService = profil.origineDonnees === 'externe';

  if (parService && auPoint) {
    niveau = 'elevee';
    raisons.push('Position relevée par l’appareil et rayonnement issu d’une base '
      + 'de données scientifique.');
  } else if (parService) {
    niveau = 'moyenne';
    raisons.push('Rayonnement issu d’une base de données scientifique, mais la '
      + 'position est le centre du gouvernorat : elle peut être éloignée de '
      + 'plusieurs dizaines de kilomètres du bâtiment.');
  } else if (auPoint) {
    niveau = 'moyenne';
    raisons.push('Position relevée par l’appareil, mais le rayonnement vient de '
      + 'notre référentiel interne par gouvernorat.');
  } else {
    raisons.push('Position approchée au centre du gouvernorat et rayonnement issu '
      + 'de notre référentiel interne.');
  }

  if (!disponible(profil.altitude)) {
    raisons.push('Altitude inconnue : aucune correction d’altitude n’est appliquée.');
  }
  if (!disponible(profil.horizon)) {
    raisons.push('Relief environnant non analysé.');
  }
  raisons.push('Obstacles proches — arbres, cheminées, bâtiments mitoyens — non '
    + 'relevés : ils se constatent sur place.');

  return { niveau, raisons, service: serviceDisponible() ? null : RAISON_INDISPONIBLE };
}

/**
 * L'ÉTUDE ÉTIQUETÉE — chaque chiffre du tableau de bord avec son origine.
 *
 * C'est ce que lit la page quand le visiteur demande « comment ce chiffre
 * est-il calculé ? », et ce que lit l'assistant pour distinguer une donnée
 * mesurée d'une hypothèse.
 */
export function fusionner(simulation, { site = null, mesureService = null } = {}) {
  if (!simulation || simulation.statut !== 'ok') {
    return { ok: false, valeurs: {}, profil: site, composition: {},
      confiance: 'preliminaire' };
  }
  const e = simulation.resultats;
  const entrees = simulation.entrees ?? {};
  const profil = site ?? profilSite(entrees, mesureService);

  const consommation = tracer(e.consommation, {
    source: entrees.fiabilite === 'facture' ? 'saisie' : 'calcul',
    unite: 'kWh/an',
    methode: entrees.detailConso ?? 'Consommation annuelle retenue',
    confiance: entrees.fiabilite === 'facture' ? 'elevee' : 'moyenne',
  });

  const prixKwh = tracer(e.prixKwh, {
    source: entrees.fiabilite === 'facture' ? 'saisie' : 'calcul',
    unite: 'DT/kWh',
    methode: entrees.fiabilite === 'facture'
      ? 'Montant ÷ quantité, tous deux lus sur la facture'
      : 'Déduit de la grille tarifaire',
    confiance: entrees.fiabilite === 'facture' ? 'elevee' : 'preliminaire',
  });

  const puissance = tracer(e.puissance, {
    source: 'calcul', unite: 'kWc',
    methode: 'Dimensionnement sur la consommation, borné par la toiture',
    depuis: [consommation, profil.productible],
  });

  const production = tracer(e.production, {
    source: 'calcul', unite: 'kWh/an',
    methode: 'Puissance × productible × facteur d’orientation',
    depuis: [puissance, profil.productible],
    details: { productible: profil.productible.valeur,
      facteurOrientation: e.facteurOrientation },
  });

  const tauxAuto = tracer(e.tauxAutoconsommation, {
    source: 'hypothese', unite: 'part',
    methode: 'Courbe d’autoconsommation, calée sur le type de bâtiment',
    confiance: 'preliminaire',
  });

  const autoconsomme = tracer(e.autoconsomme, {
    source: 'calcul', unite: 'kWh/an',
    methode: 'Production × taux d’autoconsommation',
    depuis: [production, tauxAuto],
  });

  const economie = tracer(e.economieAnnuelle, {
    source: 'calcul', unite: 'DT/an',
    methode: 'Énergie consommée sur place et surplus, valorisés au prix du kWh, '
      + 'entretien déduit',
    depuis: [autoconsomme, prixKwh],
  });

  const retour = e.retour === null
    ? absente('l’économie cumulée ne rattrape pas le coût dans la durée d’analyse')
    : tracer(e.retour, {
      source: 'calcul', unite: 'ans',
      methode: 'Année où l’économie cumulée rattrape le coût',
      depuis: [economie],
    });

  const co2 = tracer(e.co2Annuel, {
    source: 'calcul', unite: 'kg/an',
    methode: 'Production × contenu carbone du réseau',
    depuis: [production, tracer(0.47, { source: 'hypothese' })],
  });

  const valeurs = {
    consommation, prixKwh, puissance, production, tauxAutoconsommation: tauxAuto,
    autoconsomme, economieAnnuelle: economie, retour, co2Annuel: co2,
    productible: profil.productible,
  };

  return {
    ok: true,
    profil,
    valeurs,
    composition: composition(Object.values(valeurs)),
    confiance: confianceGlobale(Object.values(valeurs)),
    confianceSite: confianceSite(profil),
  };
}

/**
 * Le compte rendu de composition, en clair.
 *
 * « Cette étude repose sur 2 données que vous avez saisies, 1 donnée externe,
 * 6 calculs et 2 hypothèses. » Un client qui lit cela sait quoi contester.
 */
export function raconterComposition(comptes) {
  const mots = {
    saisie: ['donnée que vous avez saisie', 'données que vous avez saisies'],
    mesure: ['donnée mesurée', 'données mesurées'],
    externe: ['donnée scientifique externe', 'données scientifiques externes'],
    catalogue: ['fiche matériel', 'fiches matériel'],
    calcul: ['calcul', 'calculs'],
    interne: ['valeur de notre référentiel', 'valeurs de notre référentiel'],
    hypothese: ['hypothèse', 'hypothèses'],
    absente: ['donnée absente', 'données absentes'],
  };
  const bouts = Object.entries(comptes ?? {})
    .filter(([, n]) => n > 0)
    .map(([cle, n]) => `${n} ${mots[cle]?.[n > 1 ? 1 : 0] ?? cle}`);
  if (!bouts.length) return null;
  return `Cette étude repose sur ${bouts.slice(0, -1).join(', ')}${
    bouts.length > 1 ? ' et ' : ''}${bouts.at(-1)}.`;
}

/** Toutes les valeurs étiquetées d'une fusion, pour les parcourir. */
export const valeursTracees = (f) => Object.entries(f?.valeurs ?? {})
  .filter(([, v]) => estTracee(v));
