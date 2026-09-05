/**
 * Livraison en Tunisie — les vingt-quatre gouvernorats et ce qu'il en coûte.
 *
 * Le frais de port n'est pas un détail de mise en page : c'est la dernière
 * chose que l'acheteur lit avant de renoncer. Il doit donc être annoncé avant
 * la commande, jamais découvert après.
 *
 * Les montants sont en dinars. Ils se corrigent ici, en un seul endroit, le
 * jour où le transporteur change ses tarifs.
 */

/** Zones de livraison, du plus proche au plus lointain. */
export const ZONES = {
  tunis: { nom: 'Grand Tunis', nomAr: 'تونس الكبرى', frais: 7, delai: '24 h' },
  nord: { nom: 'Nord', nomAr: 'الشمال', frais: 8, delai: '48 h' },
  centre: { nom: 'Centre et Sahel', nomAr: 'الوسط والساحل', frais: 8, delai: '48 h' },
  sud: { nom: 'Sud', nomAr: 'الجنوب', frais: 9, delai: '72 h' },
};

/**
 * Les gouvernorats, chacun rattaché à sa zone.
 * L'ordre est celui d'une liste déroulante : le plus peuplé d'abord, parce
 * que c'est là que se trouvent la plupart des acheteurs.
 */
export const GOUVERNORATS = [
  { id: 'tunis', nom: 'Tunis', nomAr: 'تونس', zone: 'tunis' },
  { id: 'ariana', nom: 'Ariana', nomAr: 'أريانة', zone: 'tunis' },
  { id: 'ben-arous', nom: 'Ben Arous', nomAr: 'بن عروس', zone: 'tunis' },
  { id: 'manouba', nom: 'Manouba', nomAr: 'منوبة', zone: 'tunis' },
  { id: 'sfax', nom: 'Sfax', nomAr: 'صفاقس', zone: 'centre' },
  { id: 'sousse', nom: 'Sousse', nomAr: 'سوسة', zone: 'centre' },
  { id: 'nabeul', nom: 'Nabeul', nomAr: 'نابل', zone: 'nord' },
  { id: 'monastir', nom: 'Monastir', nomAr: 'المنستير', zone: 'centre' },
  { id: 'bizerte', nom: 'Bizerte', nomAr: 'بنزرت', zone: 'nord' },
  { id: 'kairouan', nom: 'Kairouan', nomAr: 'القيروان', zone: 'centre' },
  { id: 'gabes', nom: 'Gabès', nomAr: 'قابس', zone: 'sud' },
  { id: 'mahdia', nom: 'Mahdia', nomAr: 'المهدية', zone: 'centre' },
  { id: 'medenine', nom: 'Médenine', nomAr: 'مدنين', zone: 'sud' },
  { id: 'zaghouan', nom: 'Zaghouan', nomAr: 'زغوان', zone: 'nord' },
  { id: 'beja', nom: 'Béja', nomAr: 'باجة', zone: 'nord' },
  { id: 'jendouba', nom: 'Jendouba', nomAr: 'جندوبة', zone: 'nord' },
  { id: 'kef', nom: 'Le Kef', nomAr: 'الكاف', zone: 'nord' },
  { id: 'siliana', nom: 'Siliana', nomAr: 'سليانة', zone: 'nord' },
  { id: 'kasserine', nom: 'Kasserine', nomAr: 'القصرين', zone: 'centre' },
  { id: 'sidi-bouzid', nom: 'Sidi Bouzid', nomAr: 'سيدي بوزيد', zone: 'centre' },
  { id: 'gafsa', nom: 'Gafsa', nomAr: 'قفصة', zone: 'sud' },
  { id: 'tozeur', nom: 'Tozeur', nomAr: 'توزر', zone: 'sud' },
  { id: 'kebili', nom: 'Kébili', nomAr: 'قبلي', zone: 'sud' },
  { id: 'tataouine', nom: 'Tataouine', nomAr: 'تطاوين', zone: 'sud' },
];

/**
 * Montant d'achat à partir duquel la livraison est offerte.
 * C'est le levier le plus simple pour faire monter un panier : l'acheteur
 * à 180 dinars ajoute volontiers un article plutôt que de payer le port.
 * Mettre `null` pour ne jamais l'offrir.
 */
export const FRANCO = 200;

/** Le gouvernorat portant cet identifiant, ou `null`. */
export const gouvernorat = (id) =>
  GOUVERNORATS.find((g) => g.id === id) ?? null;

/**
 * Frais de port pour un panier livré dans ce gouvernorat.
 *
 * @param {string} id identifiant du gouvernorat
 * @param {number} sousTotal montant des articles, en dinars
 * @returns {{frais:number, offerte:boolean, delai:string, zone:string}|null}
 *   `null` si le gouvernorat est inconnu — mieux vaut ne rien annoncer qu'un
 *   prix faux que le livreur démentira.
 */
export function fraisDePort(id, sousTotal = 0) {
  const g = gouvernorat(id);
  if (!g) return null;
  const zone = ZONES[g.zone];
  const offerte = FRANCO !== null && sousTotal >= FRANCO;
  return {
    frais: offerte ? 0 : zone.frais,
    offerte,
    delai: zone.delai,
    zone: zone.nom,
  };
}

/**
 * Ce qu'il reste à ajouter pour que la livraison soit offerte.
 * Zéro quand elle l'est déjà, ou quand l'offre n'existe pas.
 */
export function resteAvantFranco(sousTotal = 0) {
  if (FRANCO === null || sousTotal >= FRANCO) return 0;
  return Math.round((FRANCO - sousTotal) * 1000) / 1000;
}
