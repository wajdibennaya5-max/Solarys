/**
 * Enregistrement d'un fichier produit par l'application.
 *
 * Deux endroits en avaient besoin — l'export des planches et celui des projets
 * — avec le même code recopié. Il est ici, en un seul exemplaire.
 */

/**
 * @param {string|Blob} content contenu du fichier
 * @param {string} filename nom proposé, extension comprise
 * @param {string} [mime] type MIME ; ignoré si `content` est déjà un Blob
 */
export function saveFile(content, filename, mime = 'application/octet-stream') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // On laisse au navigateur le temps de lire le contenu avant de le libérer.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
