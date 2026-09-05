/**
 * PROJECT INTELLIGENCE ENGINE — ce que le projet a d'anormal, et pourquoi.
 *
 * Il ne devine pas les causes, il constate des faits sur les données
 * présentes. C'est la différence entre un diagnostic et une supposition :
 * « plusieurs mois manquent » est un fait ; « le client a mal saisi » n'en
 * est pas un, et ne sera jamais écrit ici.
 *
 * CHAQUE ALERTE PORTE QUATRE CHOSES, sans exception :
 *
 *   PROBLÈME   — ce qui a été constaté
 *   POURQUOI   — l'effet sur l'étude, pas une morale
 *   DONNÉES    — les valeurs exactes qui ont déclenché l'alerte
 *   ACTION     — ce que la personne peut faire, tout de suite
 *
 * Une alerte sans action est un reproche. Une alerte sans les données qui
 * l'ont produite est invérifiable. Ni l'une ni l'autre n'a sa place ici.
 */
import { productible } from './gisement.js';
import { facteurOrientation, expliquerOrientation } from './orientation.js';
import { typeBatiment } from './batiment.js';
import { HYPOTHESES, puissanceRecommandee } from './etude.js';
import { BORNES } from './facture.js';
import { GRILLE } from './tarif.js';
import { manquePourConclure } from './technique.js';
import { FIABILITES } from './consommation.js';

/** Les niveaux de gravité, du plus urgent au plus anodin. */
export const GRAVITES = {
  bloquant: { rang: 3, nom: 'Bloquant', signe: '✕' },
  important: { rang: 2, nom: 'Important', signe: '⚠' },
  information: { rang: 1, nom: 'À savoir', signe: 'i' },
};

/**
 * Bornes de vraisemblance de la consommation annuelle, par type de bâtiment.
 *
 * Hors de ces fourchettes, ce n'est pas forcément une erreur — un hôtel
 * consomme beaucoup — mais cela mérite d'être vérifié avant de dimensionner
 * dessus. On le signale sans jamais affirmer que c'est faux.
 */
export const PLAUSIBLE = {
  maison: { min: 800, max: 30000 },
  commerce: { min: 2000, max: 200000 },
  industrie: { min: 5000, max: 2000000 },
  agricole: { min: 2000, max: 500000 },
};

const alerte = (cle, gravite, probleme, pourquoi, donnees, action) => ({
  cle, gravite, probleme, pourquoi, donnees, action,
});

/**
 * Analyse le projet.
 *
 * @param {object} entrees les données assemblées
 * @param {object} [contexte] `{ etude, dimensionnement }`
 * @returns {Array<object>} les alertes, de la plus grave à la plus anodine
 */
export function analyser(entrees = {}, contexte = {}) {
  const out = [];
  const { etude = null, dimensionnement = null } = contexte;
  const bat = typeBatiment(entrees.batiment);
  const nb = (v, d = 0) => Number(v).toLocaleString('fr-FR',
    { minimumFractionDigits: d, maximumFractionDigits: d });

  /* ---- Données absolument nécessaires ---- */

  if (!productible(entrees.gouvernorat)) {
    out.push(alerte('gouvernorat', 'bloquant',
      'Localisation manquante',
      'Le gisement solaire varie de 1 520 à 1 760 kWh par kWc et par an selon le '
      + 'gouvernorat, soit 16 % d’écart. Sans lui, aucune production ne peut être '
      + 'estimée.',
      [['gouvernorat', entrees.gouvernorat ? String(entrees.gouvernorat) : 'non renseigné']],
      'Choisissez votre gouvernorat à l’étape Localisation, ou laissez-vous localiser.'));
  }

  if (!(Number(entrees.consommationAnnuelle) > 0)) {
    out.push(alerte('consommation', 'bloquant',
      'Consommation manquante',
      'Toute l’étude part de ce que vous consommez : la puissance à installer, '
      + 'la part autoconsommée et l’économie en découlent.',
      [['consommation annuelle', 'non renseignée']],
      'Renseignez votre consommation à l’étape 03 — une facture suffit.'));
  }

  /* ---- Qualité de la consommation ---- */

  const fiab = FIABILITES[entrees.fiabilite];
  if (fiab && fiab.rang < 3) {
    out.push(alerte('origine-consommation', 'important',
      fiab.rang === 2 ? 'Prix du kilowattheure déduit du tarif'
        : 'Consommation et prix estimés',
      fiab.rang === 2
        ? 'Vos relevés donnent l’énergie, mais pas ce que vous la payez. Le prix '
          + 'du kWh vient donc de la grille tarifaire, et l’économie annoncée '
          + 'en dépend directement.'
        : 'Faute de facture, la consommation ET son prix sont déduits d’une '
          + 'grille tarifaire. L’ordre de grandeur tient ; le dimensionnement '
          + 'précis, non.',
      [['méthode', fiab.nom],
        ['grille tarifaire', GRILLE.verifiee ? 'vérifiée' : 'non vérifiée']],
      'Reprenez une facture STEG et saisissez la quantité et le Total Électricité : '
      + 'l’étude passera sur vos chiffres réels.'));
  }

  if (Array.isArray(entrees.mois) && entrees.mois.length > 0 && entrees.mois.length < 12) {
    out.push(alerte('mois-incomplets', 'important',
      'Consommation mensuelle incomplète',
      'La comparaison entre production et consommation mois par mois perd en '
      + 'précision : les mois absents prennent la moyenne des mois connus, ce qui '
      + 'lisse la saison.',
      [['mois saisis', `${entrees.mois.length} sur 12`]],
      'Ajoutez les mois manquants, ou continuez : l’estimation annuelle reste valable.'));
  }

  /* ---- Vraisemblance de la consommation ---- */

  const conso = Number(entrees.consommationAnnuelle);
  const bornes = PLAUSIBLE[bat?.id] ?? PLAUSIBLE.maison;
  if (conso > 0 && (conso < bornes.min || conso > bornes.max)) {
    out.push(alerte('consommation-inhabituelle', 'important',
      'Consommation inhabituelle pour ce type de bâtiment',
      'Elle n’est pas forcément fausse — mais tout le dimensionnement en découle, '
      + 'et une erreur de saisie ici se retrouve multipliée dans chaque chiffre '
      + 'de l’étude.',
      [['consommation annuelle', `${nb(conso)} kWh`],
        ['bâtiment', bat ? bat.nom : 'non précisé'],
        ['fourchette habituelle', `${nb(bornes.min)} à ${nb(bornes.max)} kWh`]],
      'Vérifiez la quantité saisie, et qu’il s’agit bien d’une consommation et non '
      + 'd’un index de compteur.'));
  }

  if (etude && (etude.prixKwh < BORNES.prixKwh.min || etude.prixKwh > BORNES.prixKwh.max)) {
    out.push(alerte('prix-aberrant', 'bloquant',
      'Prix du kilowattheure hors du tarif tunisien',
      'C’est le nombre dont dépend toute l’économie annoncée. Hors de cette '
      + 'fourchette, c’est presque toujours une confusion entre deux cases de la '
      + 'facture.',
      [['prix obtenu', `${etude.prixKwh.toFixed(3).replace('.', ',')} DT/kWh`],
        ['fourchette admise', `${BORNES.prixKwh.min} à ${BORNES.prixKwh.max} DT/kWh`]],
      'Reprenez la case « Total Electricité » et la colonne « Quantité » — pas le '
      + '« Montant à payer », qui peut contenir des arriérés.'));
  }

  /* ---- Toiture et orientation ---- */

  if (!facteurOrientation(entrees.orientation, entrees.pente)) {
    out.push(alerte('orientation', 'important',
      'Orientation du toit non renseignée',
      'Un pan plein est produit 17 % de moins qu’un plein sud, un pan nord près '
      + 'de la moitié. Sans cette donnée, aucune perte n’est appliquée : le '
      + 'résultat est donc le meilleur cas possible.',
      [['orientation', entrees.orientation ?? 'non renseignée'],
        ['inclinaison', entrees.pente ?? 'non renseignée']],
      'Répondez à l’étape Toiture — deux listes déroulantes suffisent.'));
  } else if (etude && etude.facteurOrientation < 0.8) {
    out.push(alerte('orientation-defavorable', 'information',
      'Orientation défavorable',
      expliquerOrientation(entrees.orientation, entrees.pente)
      ?? 'Cette exposition réduit sensiblement la production par kilowatt installé.',
      [['perte par rapport au plein sud',
        `${Math.round((1 - etude.facteurOrientation) * 100)} %`]],
      'Si un autre pan est mieux exposé, refaites l’étude avec ses cotes : à '
      + 'consommation égale, il faudra moins de modules.'));
  }

  if (!(Number(entrees.surfaceDisponible) > 0)) {
    out.push(alerte('toiture', 'information',
      'Cotes de la toiture non communiquées',
      'La puissance est dimensionnée sur votre consommation seule, sans vérifier '
      + 'qu’elle tient sur le toit. Le plan d’implantation ne peut pas être dessiné.',
      [['surface disponible', 'non renseignée']],
      'Mesurez la largeur et la profondeur du pan principal : un mètre ruban et '
      + 'deux minutes.'));
  } else if (etude) {
    // ON COMPARE À CE QU'IL FAUDRAIT SANS CONTRAINTE, pas à la puissance
    // retenue : celle-ci a DÉJÀ été rabotée par la toiture, si bien qu'un
    // toit trop petit paraissait toujours suffisant. Le contrôle ne se
    // déclenchait jamais.
    const sansContrainte = puissanceRecommandee({
      consommationAnnuelle: etude.consommation,
      gouvernorat: entrees.gouvernorat,
      surfaceDisponible: 0,
      orientation: entrees.orientation,
      pente: entrees.pente,
    });
    const besoin = (sansContrainte ?? etude.puissance) * HYPOTHESES.surfaceParKwc;
    const dispo = Number(entrees.surfaceDisponible);
    if (sansContrainte && dispo < besoin * 0.98) {
      out.push(alerte('surface-insuffisante', 'important',
        'Toiture plus petite que le besoin',
        'La puissance a été ramenée à ce que le toit porte. L’installation '
        + 'couvrira donc moins que votre consommation.',
        [['surface disponible', `${nb(dispo)} m²`],
          ['surface nécessaire pour couvrir l’année', `${nb(Math.ceil(besoin))} m²`],
          ['puissance possible', `${String(etude.puissance).replace('.', ',')} kWc`],
          ['puissance qu’il faudrait', `${String(sansContrainte).replace('.', ',')} kWc`],
          ['couverture atteinte', `${Math.round(etude.ratio * 100)} %`]],
        'Un second pan, une annexe ou un abri peuvent compléter : ajoutez-les à '
        + 'l’étude technique.'));
    }
  }

  /* ---- Cohérence du dimensionnement ---- */

  if (etude && etude.ratio > 1.6) {
    out.push(alerte('surdimensionnement', 'important',
      'Installation nettement plus grande que le besoin',
      'Au-delà de ce que vous consommez, chaque kilowattheure part sur le réseau '
      + 'au prix de rachat, moitié moindre. La rentabilité par kilowatt installé '
      + 'baisse.',
      [['production estimée', `${nb(etude.production)} kWh/an`],
        ['consommation', `${nb(etude.consommation)} kWh/an`],
        ['rapport', `${Math.round(etude.ratio * 100)} %`],
        ['part revendue', `${Math.round((1 - etude.tauxAutoconsommation) * 100)} %`]],
      'Réduisez la puissance au curseur, ou assumez ce choix si vous prévoyez une '
      + 'consommation en hausse.'));
  }

  if (etude && !etude.retour) {
    out.push(alerte('retour-hors-duree', 'important',
      'Retour sur investissement au-delà de la durée d’étude',
      `L’économie cumulée ne rattrape pas le coût en ${HYPOTHESES.duree} ans dans `
      + 'les hypothèses retenues.',
      [['coût estimé', `${nb(etude.cout)} DT`],
        ['économie année 1', `${nb(etude.economieAnnuelle)} DT`],
        ['durée d’analyse', `${HYPOTHESES.duree} ans`]],
      'Vérifiez la consommation saisie et le prix du kWh : c’est presque toujours '
      + 'de là que vient un retour aussi long.'));
  }

  /* ---- Matériel et électricité ---- */

  if (dimensionnement) {
    const manque = manquePourConclure(dimensionnement);
    if (manque.length) {
      out.push(alerte('fiches-incompletes', 'important',
        'Contrôles électriques incomplets',
        'Certaines caractéristiques du matériel manquent. Les contrôles concernés '
        + 'sont marqués « non vérifiable » — ils ne sont pas déclarés conformes.',
        manque.map((m) => [m, 'absent']),
        'Complétez les fiches dans le catalogue de matériel, ou faites vérifier le '
        + 'dimensionnement par l’installateur.'));
    }
    const graves = (dimensionnement.controles ?? [])
      .filter((c) => c.verdict === 'hors' || c.etat === 'fail');
    for (const c of graves) {
      out.push(alerte(`electrique-${c.cle}`, 'bloquant',
        `Configuration électrique refusée : ${c.nom.toLowerCase()}`,
        c.pourquoi,
        [['mesuré', c.mesure], ['limite', c.limite]],
        'Changez de matériel, de puissance ou de répartition — cette configuration '
        + 'ne doit pas être posée en l’état.'));
    }
  }

  /* ---- Ombrage : ce qu'on ne sait pas ---- */

  out.push(alerte('ombrage', 'information',
    'Analyse d’ombrage non disponible avec les données actuelles',
    'Aucune donnée d’obstacle, de hauteur ni d’horizon n’a été fournie. Aucune '
    + 'perte d’ombrage n’est donc appliquée : le résultat suppose un toit '
    + 'entièrement dégagé toute la journée.',
    [['obstacles renseignés', 'aucun'],
      ['masque d’horizon', 'non disponible']],
    'Un arbre, un mur mitoyen ou une cheminée peuvent coûter plusieurs pour cent '
    + 'de production. La visite technique les relève.'));

  return out.sort((a, b) => GRAVITES[b.gravite].rang - GRAVITES[a.gravite].rang);
}

/** Combien d'alertes par gravité, pour l'afficher d'un coup d'œil. */
export function compter(alertes) {
  const c = { bloquant: 0, important: 0, information: 0 };
  for (const a of alertes ?? []) c[a.gravite] = (c[a.gravite] ?? 0) + 1;
  return c;
}

/** Le projet est-il calculable en l'état ? */
export const estBloque = (alertes) =>
  (alertes ?? []).some((a) => a.gravite === 'bloquant');
