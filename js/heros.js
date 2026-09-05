/**
 * L'ACCUEIL — et le piège qu'il fallait éviter.
 *
 * Un accueil qui affiche « 1 565 DT économisés » sans rien savoir du visiteur
 * ment, et le visiteur le sent. Un accueil qui n'affiche aucun chiffre
 * n'impressionne personne et ne prouve rien.
 *
 * La sortie est simple : montrer de VRAIS calculs, sur des cas nommés. Les
 * chiffres qui défilent ici sortent du même moteur que l'étude — mêmes
 * hypothèses, mêmes gisements, mêmes tarifs — et chaque carte dit de quel
 * bâtiment elle parle. Ce n'est pas une promesse faite au visiteur : c'est la
 * démonstration que la machine tourne, avant qu'il ait tapé quoi que ce soit.
 */
import { etudier } from './etude.js';
import { nomGouvernorat } from './gisement.js';
import { typeBatiment } from './batiment.js';

/**
 * Trois cas réalistes, choisis pour couvrir ce que le site sait faire : une
 * maison du littoral, un commerce de la capitale, une exploitation du centre.
 *
 * Les consommations et les montants sont des ordres de grandeur tunisiens
 * courants — pas des clients réels, et la page ne le prétend nulle part.
 */
export const CAS = [
  {
    id: 'maison-sfax',
    intitule: 'Une maison à Sfax',
    detail: 'Quatre personnes, une climatisation, 1 200 kWh tous les deux mois',
    donnees: {
      consommationAnnuelle: 7200, montantAnnuel: 2040, gouvernorat: 'sfax',
      orientation: 'sud', pente: 'moyenne', batiment: 'maison', puissance: 4,
    },
  },
  {
    id: 'commerce-tunis',
    intitule: 'Un commerce à Tunis',
    detail: 'Ouvert six jours sur sept, froid et éclairage toute la journée',
    donnees: {
      consommationAnnuelle: 24000, montantAnnuel: 7200, gouvernorat: 'tunis',
      orientation: 'sud', pente: 'plat', batiment: 'commerce', puissance: 14,
    },
  },
  {
    id: 'ferme-kairouan',
    intitule: 'Une exploitation à Kairouan',
    detail: 'Pompage d’irrigation de mai à septembre',
    donnees: {
      consommationAnnuelle: 42000, montantAnnuel: 11760, gouvernorat: 'kairouan',
      orientation: 'sud', pente: 'plat', batiment: 'agricole', puissance: 25,
    },
  },
];

/** Le temps qu'une carte reste affichée, en millisecondes. */
export const DUREE = 6500;

/**
 * Les quatre chiffres d'un cas, calculés — jamais écrits à la main.
 * @returns {{intitule, detail, lieu, batiment, chiffres:Array}|null}
 */
export function calculerCas(cas) {
  if (!cas?.donnees) return null;
  const e = etudier(cas.donnees);
  if (!e) return null;
  const bat = typeBatiment(cas.donnees.batiment);
  return {
    id: cas.id,
    intitule: cas.intitule,
    detail: cas.detail,
    lieu: nomGouvernorat(cas.donnees.gouvernorat),
    batiment: bat?.nom ?? '',
    puissance: e.puissance,
    chiffres: [
      { cle: 'production', icone: 'soleil', libelle: 'Production',
        valeur: e.production, unite: 'kWh / an', decimales: 0 },
      { cle: 'couverture', icone: 'eclair', libelle: 'Couverture',
        valeur: Math.round(e.ratio * 100), unite: '%', decimales: 0 },
      { cle: 'economie', icone: 'monnaie', libelle: 'Économie', fort: true,
        valeur: Math.round(e.economieAnnuelle), unite: 'DT / an', decimales: 0 },
      { cle: 'co2', icone: 'feuille', libelle: 'CO₂ évité',
        valeur: e.co2Annuel / 1000, unite: 't / an', decimales: 1 },
    ],
  };
}

/** Les trois cas, calculés une fois. */
export function tousLesCas() {
  return CAS.map(calculerCas).filter(Boolean);
}
