/**
 * Quatre portes d'entrée vers un seul chiffre.
 *
 * LE DÉFAUT QUE CE FICHIER CORRIGE : il n'y avait qu'une porte — « prenez
 * votre dernière facture ». C'est la meilleure, et elle reste la première
 * proposée. Mais celui qui n'a pas sa facture sous la main repartait, et
 * celui dont la maison n'est pas encore branchée n'avait rien à saisir du
 * tout. Or ce sont souvent les meilleurs projets : on peut encore penser la
 * toiture avant qu'elle soit posée.
 *
 * Les quatre portes ne se valent pas, et la page ne fait pas semblant du
 * contraire : chaque résultat porte sa fiabilité, et l'étude le dit à
 * l'écran. Une estimation présentée comme une certitude se retourne contre
 * nous à la première facture.
 */
import { versAnnuel, verifier as verifierFacture, BORNES as BORNES_FACTURE } from './facture.js';
import { montantDepuisConsommation, consommationDepuisMontant, prixMoyen, GRILLE }
  from './tarif.js';
import { estimer, verifier as verifierProfil } from './profil.js';

export const MOIS_PAR_AN = 12;

/**
 * Les degrés de confiance, du plus solide au plus fragile.
 * Ils servent à écrire, pas à décorer : chaque étude affiche le sien.
 */
export const FIABILITES = {
  facture: {
    rang: 3,
    nom: 'D’après votre facture',
    phrase: 'Le prix du kilowattheure vient de votre facture : cette étude '
      + 'repose sur vos chiffres, pas sur une moyenne.',
  },
  releve: {
    rang: 2,
    nom: 'D’après vos relevés',
    phrase: 'Votre consommation vient de vos relevés ; le prix du kilowattheure '
      + 'est déduit du tarif STEG. Une facture affinerait l’économie annoncée.',
  },
  estimation: {
    rang: 1,
    nom: 'Estimation',
    phrase: 'Faute de facture, consommation et prix sont estimés à partir du '
      + 'tarif STEG. Les ordres de grandeur sont justes ; revenez avec une '
      + 'facture pour une étude exacte.',
  },
};

/** Les quatre méthodes, dans l'ordre où on les propose. */
export const METHODES = [
  {
    id: 'facture',
    nom: 'Ma dernière facture',
    resume: 'Deux nombres à recopier',
    fiabilite: 'facture',
    conseil: true,
  },
  {
    id: 'mensuel',
    nom: 'Mois par mois',
    resume: 'Vos douze mois, si vous les avez',
    fiabilite: 'releve',
    conseil: false,
  },
  {
    id: 'montant',
    nom: 'Ce que je paie',
    resume: 'Sans la facture sous les yeux',
    fiabilite: 'estimation',
    conseil: false,
  },
  {
    id: 'profil',
    nom: 'Je n’ai pas de facture',
    resume: 'Logement neuf, ou pas encore branché',
    fiabilite: 'estimation',
    conseil: false,
  },
];

export const methode = (id) => METHODES.find((m) => m.id === id) ?? null;

/** Un mois saisi compte ; un mois laissé vide ne vaut pas zéro. */
const saisis = (mois) => (Array.isArray(mois) ? mois : [])
  .map(Number)
  .filter((v) => Number.isFinite(v) && v >= 0);

/** Combien de mois il faut au minimum pour extrapoler une année. */
export const MOIS_MINIMUM = 8;

/**
 * Le chiffre annuel, quelle que soit la porte empruntée.
 *
 * @returns {{consommationAnnuelle:number, montantAnnuel:number, prixKwh:number,
 *   fiabilite:string, detail:string, postes?:Array}|null}
 */
export function resoudre(idMethode, saisie = {}) {
  const m = methode(idMethode);
  if (!m) return null;

  if (idMethode === 'facture') {
    const a = versAnnuel(saisie);
    if (!a) return null;
    return {
      consommationAnnuelle: a.consommationAnnuelle,
      montantAnnuel: a.montantAnnuel,
      prixKwh: a.prixKwh,
      fiabilite: 'facture',
      detail: `${a.parAn} factures par an, ${
        a.consommationAnnuelle.toLocaleString('fr-FR')} kWh au total.`,
    };
  }

  if (idMethode === 'mensuel') {
    const valeurs = saisis(saisie.mois);
    if (valeurs.length < MOIS_MINIMUM) return null;
    const moyenne = valeurs.reduce((s, v) => s + v, 0) / valeurs.length;
    // Les mois manquants prennent la moyenne des mois connus : c'est la seule
    // hypothèse qui n'invente rien, et on dit combien il en manquait.
    const annuel = Math.round(moyenne * MOIS_PAR_AN);
    if (!(annuel > 0)) return null;
    const montant = montantDepuisConsommation(annuel / MOIS_PAR_AN) * MOIS_PAR_AN;
    return {
      consommationAnnuelle: annuel,
      montantAnnuel: Math.round(montant * 1000) / 1000,
      prixKwh: montant / annuel,
      fiabilite: 'releve',
      detail: valeurs.length === MOIS_PAR_AN
        ? 'Vos douze mois, additionnés.'
        : `${valeurs.length} mois saisis ; les ${
            MOIS_PAR_AN - valeurs.length} autres prennent votre moyenne.`,
      mois: valeurs,
    };
  }

  if (idMethode === 'montant') {
    const parAn = Number(saisie.parAn) || 6;
    const montant = Number(saisie.montant);
    if (!(montant > 0) || !(parAn > 0)) return null;
    const parMois = (montant * parAn) / MOIS_PAR_AN;
    const kwhParMois = consommationDepuisMontant(parMois);
    if (!kwhParMois) return null;
    const annuel = Math.round(kwhParMois * MOIS_PAR_AN);
    const montantAnnuel = Math.round(montant * parAn * 1000) / 1000;
    return {
      consommationAnnuelle: annuel,
      montantAnnuel,
      prixKwh: montantAnnuel / annuel,
      fiabilite: 'estimation',
      detail: `${montantAnnuel.toLocaleString('fr-FR')} DT par an correspondent à `
        + `environ ${annuel.toLocaleString('fr-FR')} kWh au tarif ${GRILLE.intitule}.`,
    };
  }

  if (idMethode === 'profil') {
    const e = estimer(saisie);
    if (!e) return null;
    const montant = montantDepuisConsommation(e.consommationAnnuelle / MOIS_PAR_AN)
      * MOIS_PAR_AN;
    return {
      consommationAnnuelle: e.consommationAnnuelle,
      montantAnnuel: Math.round(montant * 1000) / 1000,
      prixKwh: montant / e.consommationAnnuelle,
      fiabilite: 'estimation',
      detail: `Environ ${e.consommationAnnuelle.toLocaleString('fr-FR')} kWh par an, `
        + `soit à peu près ${Math.round(montant / MOIS_PAR_AN)} DT par mois.`,
      postes: e.postes,
    };
  }
  return null;
}

/**
 * Ce qui cloche dans une saisie, dit en clair — méthode par méthode.
 * @returns {string|null} `null` si la saisie tient debout
 */
export function verifier(idMethode, saisie = {}) {
  if (!methode(idMethode)) return 'Choisissez comment renseigner votre consommation.';

  if (idMethode === 'facture') return verifierFacture(saisie);

  if (idMethode === 'mensuel') {
    const valeurs = saisis(saisie.mois);
    if (valeurs.length < MOIS_MINIMUM) {
      return `Renseignez au moins ${MOIS_MINIMUM} mois : en dessous, la moyenne `
        + 'ne représente plus l’année.';
    }
    const total = valeurs.reduce((s, v) => s + v, 0);
    if (!(total > 0)) return 'Ces douze mois totalisent zéro kilowattheure.';
    const parMois = total / valeurs.length;
    if (parMois > BORNES_FACTURE.quantite.max) {
      return 'Ces relevés paraissent être des index de compteur, non des '
        + 'consommations mensuelles.';
    }
    return null;
  }

  if (idMethode === 'montant') {
    const montant = Number(saisie.montant);
    if (!(montant > 0)) return 'Indiquez ce que vous payez habituellement.';
    if (montant < BORNES_FACTURE.montant.min) {
      return 'Ce montant paraît trop faible pour une facture.';
    }
    if (montant > BORNES_FACTURE.montant.max) {
      return 'Ce montant dépasse ce qu’une facture domestique atteint.';
    }
    if (!resoudre('montant', saisie)) {
      return 'Ce montant ne couvre que les redevances : il n’en découle aucune '
        + 'consommation.';
    }
    return null;
  }

  if (idMethode === 'profil') return verifierProfil(saisie);
  return null;
}

/**
 * Le prix moyen impliqué, pour le montrer au client et le lui faire confirmer.
 *
 * Une hypothèse affichée est une hypothèse qu'il peut contredire ; une
 * hypothèse cachée se découvre à la première facture, quand il est trop tard.
 */
export function prixImplique(resultat) {
  if (!resultat?.consommationAnnuelle) return null;
  return resultat.montantAnnuel / resultat.consommationAnnuelle;
}

/** La grille est-elle assez sûre pour qu'on s'appuie dessus sans le dire ? */
export const grilleVerifiee = () => GRILLE.verifiee === true;

/** Le prix moyen du tarif à ce niveau de consommation annuelle. */
export const prixMoyenAnnuel = (kwhParAn) => prixMoyen(Number(kwhParAn) / MOIS_PAR_AN);
