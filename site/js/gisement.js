/**
 * Le gisement solaire tunisien, gouvernorat par gouvernorat.
 *
 * `productible` : énergie annuelle produite par kilowatt-crête installé,
 * en kWh/kWc/an, pour une installation correctement orientée et inclinée,
 * pertes usuelles comprises (onduleur, câblage, température, salissure).
 *
 * C'est le seul nombre dont dépend toute l'étude, et il varie du nord au sud
 * dans un rapport de un à un peu plus d'un dixième. Les valeurs retenues sont
 * prudentes : mieux vaut une étude que la réalité dépasse qu'une étude que la
 * réalité dément.
 *
 * ORDRE DE GRANDEUR ASSUMÉ : ces valeurs sont des références régionales, non
 * une mesure du toit du client. L'ombrage, l'orientation réelle et l'état des
 * modules font varier le résultat. L'étude le dit, plutôt que de promettre
 * une exactitude qu'aucun calcul ne peut tenir sans visite.
 */

/** Zones de gisement, du nord au sud. */
export const ZONES_SOLAIRES = {
  nord: { nom: 'Nord', productible: 1560 },
  centre: { nom: 'Centre et Sahel', productible: 1640 },
  sud: { nom: 'Sud', productible: 1730 },
};

/** À quelle zone de gisement appartient chaque gouvernorat. */
export const ZONE_PAR_GOUVERNORAT = {
  tunis: 'nord', ariana: 'nord', 'ben-arous': 'nord', manouba: 'nord',
  bizerte: 'nord', nabeul: 'nord', zaghouan: 'nord', beja: 'nord',
  jendouba: 'nord', kef: 'nord', siliana: 'nord',
  sousse: 'centre', monastir: 'centre', mahdia: 'centre', sfax: 'centre',
  kairouan: 'centre', kasserine: 'centre', 'sidi-bouzid': 'centre',
  gabes: 'sud', medenine: 'sud', tataouine: 'sud',
  gafsa: 'sud', tozeur: 'sud', kebili: 'sud',
};

/**
 * Productible d'un gouvernorat, en kWh/kWc/an.
 * @returns {number|null} `null` si le gouvernorat est inconnu — une étude
 *   sans lieu n'a pas de sens, et un chiffre inventé serait pire que rien.
 */
export function productible(gouvernorat) {
  const zone = ZONE_PAR_GOUVERNORAT[gouvernorat];
  return zone ? ZONES_SOLAIRES[zone].productible : null;
}

/** Le nom de la zone solaire d'un gouvernorat, pour l'afficher. */
export function zoneSolaire(gouvernorat) {
  const zone = ZONE_PAR_GOUVERNORAT[gouvernorat];
  return zone ? ZONES_SOLAIRES[zone].nom : null;
}

/**
 * Les vingt-quatre gouvernorats, tels qu'ils s'affichent dans le tunnel.
 * L'ordre est celui d'une liste déroulante sur téléphone : les plus peuplés
 * d'abord, parce que c'est là que se trouvent la plupart des visiteurs.
 */
export const GOUVERNORATS = [
  { id: 'tunis', nom: 'Tunis', nomAr: 'تونس' },
  { id: 'ariana', nom: 'Ariana', nomAr: 'أريانة' },
  { id: 'ben-arous', nom: 'Ben Arous', nomAr: 'بن عروس' },
  { id: 'manouba', nom: 'Manouba', nomAr: 'منوبة' },
  { id: 'sfax', nom: 'Sfax', nomAr: 'صفاقس' },
  { id: 'sousse', nom: 'Sousse', nomAr: 'سوسة' },
  { id: 'nabeul', nom: 'Nabeul', nomAr: 'نابل' },
  { id: 'monastir', nom: 'Monastir', nomAr: 'المنستير' },
  { id: 'bizerte', nom: 'Bizerte', nomAr: 'بنزرت' },
  { id: 'kairouan', nom: 'Kairouan', nomAr: 'القيروان' },
  { id: 'gabes', nom: 'Gabès', nomAr: 'قابس' },
  { id: 'mahdia', nom: 'Mahdia', nomAr: 'المهدية' },
  { id: 'medenine', nom: 'Médenine', nomAr: 'مدنين' },
  { id: 'zaghouan', nom: 'Zaghouan', nomAr: 'زغوان' },
  { id: 'beja', nom: 'Béja', nomAr: 'باجة' },
  { id: 'jendouba', nom: 'Jendouba', nomAr: 'جندوبة' },
  { id: 'kef', nom: 'Le Kef', nomAr: 'الكاف' },
  { id: 'siliana', nom: 'Siliana', nomAr: 'سليانة' },
  { id: 'kasserine', nom: 'Kasserine', nomAr: 'القصرين' },
  { id: 'sidi-bouzid', nom: 'Sidi Bouzid', nomAr: 'سيدي بوزيد' },
  { id: 'gafsa', nom: 'Gafsa', nomAr: 'قفصة' },
  { id: 'tozeur', nom: 'Tozeur', nomAr: 'توزر' },
  { id: 'kebili', nom: 'Kébili', nomAr: 'قبلي' },
  { id: 'tataouine', nom: 'Tataouine', nomAr: 'تطاوين' },
];

/** Le nom affichable d'un gouvernorat, ou `null`. */
export const nomGouvernorat = (id) =>
  GOUVERNORATS.find((g) => g.id === id)?.nom ?? null;
