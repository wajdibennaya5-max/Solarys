/**
 * Estimer la consommation d'un logement qui n'a pas encore de facture.
 *
 * POUR QUI : la maison en construction, l'appartement qu'on vient d'acheter,
 * le client qui appelle depuis son travail sans rien sous la main. Sans cette
 * porte d'entrée, ils repartent — et ce sont souvent les meilleurs projets,
 * parce qu'on peut encore penser la toiture avant qu'elle soit posée.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ COEFFICIENTS À CALIBRER. Ils reproduisent des ordres de grandeur de   │
 * │ foyer tunisien, non des relevés. Une étude qui en dépend s'annonce    │
 * │ comme une estimation, et invite à revenir avec une facture réelle.    │
 * │ Le jour où des factures de clients existent, ce tableau se recale     │
 * │ dessus — c'est le seul endroit à changer.                             │
 * └──────────────────────────────────────────────────────────────────────┘
 */

/** Consommations annuelles, en kWh. */
export const POSTES = {
  /** Ce que consomme un logement occupé, avant tout équipement : éclairage,
   *  froid, veilles, télévision. */
  base: 900,
  /** Par personne au foyer : cuisson, lavage, eau chaude d'appoint. */
  parPersonne: 450,
  /** Par mètre carré habitable : ventilation, éclairage, inertie. */
  parMetreCarre: 8,
  /** Par climatiseur, usage tunisien — quelques mois pleins par an. */
  parClimatiseur: 900,
  /** Chauffe-eau électrique, quand il n'y a pas de solaire thermique. */
  chauffeEau: 1100,
  /** Piscine : pompe de filtration, l'été. */
  piscine: 1800,
};

/** Bornes de vraisemblance du questionnaire. */
export const BORNES = {
  personnes: { min: 1, max: 20 },
  surface: { min: 20, max: 1000 },
  climatiseurs: { min: 0, max: 12 },
};

/** Les questions posées, dans l'ordre où on les pose. */
export const QUESTIONS = [
  { cle: 'personnes', libelle: 'Personnes au foyer', type: 'nombre', defaut: 4 },
  { cle: 'surface', libelle: 'Surface habitable (m²)', type: 'nombre', defaut: 120 },
  { cle: 'climatiseurs', libelle: 'Climatiseurs', type: 'nombre', defaut: 1 },
  { cle: 'chauffeEau', libelle: 'Chauffe-eau électrique', type: 'oui-non', defaut: true },
  { cle: 'piscine', libelle: 'Piscine', type: 'oui-non', defaut: false },
];

/**
 * La consommation annuelle estimée d'un logement.
 *
 * @returns {{consommationAnnuelle:number, postes:Array<[string,number]>}|null}
 *   `null` si le questionnaire n'est pas exploitable. Le détail par poste est
 *   rendu avec le total : une estimation qu'on ne peut pas discuter n'inspire
 *   aucune confiance, et le client sait mieux que nous s'il a deux clims.
 */
export function estimer({
  personnes = 0, surface = 0, climatiseurs = 0, chauffeEau = false, piscine = false,
} = {}) {
  const n = Math.round(Number(personnes) || 0);
  const s = Number(surface) || 0;
  const c = Math.round(Number(climatiseurs) || 0);
  if (n < BORNES.personnes.min || n > BORNES.personnes.max) return null;
  if (s < BORNES.surface.min || s > BORNES.surface.max) return null;
  if (c < BORNES.climatiseurs.min || c > BORNES.climatiseurs.max) return null;

  const postes = [
    ['Logement occupé', POSTES.base],
    [`${n} personne${n > 1 ? 's' : ''}`, n * POSTES.parPersonne],
    [`${s} m² habitables`, Math.round(s * POSTES.parMetreCarre)],
  ];
  if (c > 0) postes.push([`${c} climatiseur${c > 1 ? 's' : ''}`, c * POSTES.parClimatiseur]);
  if (chauffeEau) postes.push(['Chauffe-eau électrique', POSTES.chauffeEau]);
  if (piscine) postes.push(['Piscine', POSTES.piscine]);

  const total = postes.reduce((somme, [, kwh]) => somme + kwh, 0);
  return { consommationAnnuelle: Math.round(total), postes };
}

/** Ce qu'on vérifie avant de calculer, dit en clair. */
export function verifier({ personnes, surface, climatiseurs }) {
  const n = Number(personnes);
  const s = Number(surface);
  const c = Number(climatiseurs);
  if (!(n >= BORNES.personnes.min && n <= BORNES.personnes.max)) {
    return `Indiquez le nombre de personnes au foyer, entre ${
      BORNES.personnes.min} et ${BORNES.personnes.max}.`;
  }
  if (!(s >= BORNES.surface.min && s <= BORNES.surface.max)) {
    return `Indiquez la surface habitable, entre ${BORNES.surface.min} et ${
      BORNES.surface.max} m².`;
  }
  if (!(c >= BORNES.climatiseurs.min && c <= BORNES.climatiseurs.max)) {
    return `Indiquez le nombre de climatiseurs, entre ${BORNES.climatiseurs.min} et ${
      BORNES.climatiseurs.max}.`;
  }
  return null;
}
