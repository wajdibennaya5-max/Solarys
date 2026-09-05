/**
 * Le catalogue.
 *
 * C'est le seul fichier à modifier pour changer ce que vend la boutique.
 * Chaque produit y tient en quelques lignes, et le site se met à jour :
 * la vitrine, la recherche, le panier et la commande lisent tous ceci.
 *
 * Un produit :
 *   ref         identifiant stable, jamais réutilisé — il vit dans les paniers
 *   nom, nomAr  libellé affiché, français et arabe
 *   prix        en dinars, décimales autorisées (12.500 = 12 DT 500)
 *   prixBarre   ancien prix, pour afficher une remise. Facultatif.
 *   categorie   identifiant d'une entrée de CATEGORIES
 *   image       chemin relatif dans /images/, ou vide
 *   description phrase courte, celle qui décide l'achat
 *   variantes   tailles, couleurs, capacités… Facultatif.
 *   stock       true/false. Un produit épuisé reste visible mais non commandable.
 */

/** Les rayons, dans l'ordre où ils s'affichent. */
export const CATEGORIES = [
  { id: 'nouveautes', nom: 'Nouveautés', nomAr: 'جديدنا' },
  { id: 'populaires', nom: 'Les plus vendus', nomAr: 'الأكثر مبيعا' },
];

/**
 * PRODUITS D'EXEMPLE — à remplacer entièrement par les vôtres.
 * Ils sont là pour que la boutique s'affiche et se teste avant que le vrai
 * catalogue n'existe, non pour être vendus.
 */
export const PRODUITS = [
  {
    ref: 'EX-001',
    nom: 'Article d’exemple',
    nomAr: 'منتج للتجربة',
    prix: 49.900,
    prixBarre: 69.900,
    categorie: 'nouveautes',
    image: '',
    description: 'Remplacez ce produit par le vôtre dans js/catalogue.js.',
    variantes: [],
    stock: true,
  },
  {
    ref: 'EX-002',
    nom: 'Article d’exemple avec variantes',
    nomAr: 'منتج بخيارات',
    prix: 129.000,
    categorie: 'populaires',
    image: '',
    description: 'Les variantes deviennent un choix au moment d’ajouter au panier.',
    variantes: ['Taille S', 'Taille M', 'Taille L'],
    stock: true,
  },
  {
    ref: 'EX-003',
    nom: 'Article épuisé',
    nomAr: 'نفد المخزون',
    prix: 89.500,
    categorie: 'populaires',
    image: '',
    description: 'Un produit sans stock reste visible, mais ne s’ajoute pas au panier.',
    variantes: [],
    stock: false,
  },
];

/** Le produit portant cette référence, ou `null`. */
export const trouver = (ref) => PRODUITS.find((p) => p.ref === ref) ?? null;

/** Les produits d'un rayon. */
export const parCategorie = (id) => PRODUITS.filter((p) => p.categorie === id);

/**
 * Recherche libre sur le nom et la description, sans accent ni casse.
 * Une recherche « cable » doit trouver « Câble » : un client qui ne trouve
 * pas ce qu'il cherche s'en va.
 */
const sansAccent = (s) => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function chercher(question) {
  const q = sansAccent(question).trim();
  if (!q) return PRODUITS;
  const mots = q.split(/\s+/);
  return PRODUITS.filter((p) => {
    const foin = sansAccent(`${p.nom} ${p.nomAr ?? ''} ${p.description ?? ''} ${p.ref}`);
    return mots.every((m) => foin.includes(m));
  });
}
