/**
 * La marque, en un seul endroit.
 *
 * Le logo n'est pas un histogramme qui monte — c'est le dessin que fait
 * n'importe quel site d'énergie, et celui du concurrent. Le nôtre dit ce que
 * le produit fait : un toit, et le soleil qui le traverse.
 *
 * Il est construit en SVG, à toutes les tailles, plutôt qu'exporté en image :
 * il reste net sur un écran de téléphone comme sur un dossier imprimé, et il
 * se recolore avec la page.
 */

export const MARQUE = { nom: 'SOLARYS', baseline: 'Énergie solaire' };

/**
 * Le symbole seul, carré.
 * @param {number} taille en pixels
 * @param {{monochrome?:string}} [opts] une seule couleur, pour l'impression
 */
export function symbole(taille = 40, { monochrome = null } = {}) {
  const or = monochrome ?? '#e8a33d';
  const argile = monochrome ?? '#c84a21';
  const petrole = monochrome ?? '#0a3a42';
  const fonce = monochrome ?? '#06282e';
  return `<svg viewBox="0 0 48 48" width="${taille}" height="${taille}"
    role="img" aria-label="${MARQUE.nom}" fill="none">
    <!-- Le soleil, derrière le toit : la source, avant l'ouvrage. -->
    <circle cx="24" cy="17" r="9.5" fill="${or}"/>
    <!-- Le toit : deux pans, dont un porte les modules. -->
    <path d="M4 30 24 15l20 15" stroke="${petrole}" stroke-width="3.4"
      stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <!-- Le champ photovoltaïque, sur le rampant sud. -->
    <path d="M25.6 17.6 42 30H25.6z" fill="${fonce}"/>
    <g stroke="${or}" stroke-width="1.1" opacity=".55" fill="none">
      <path d="M30.6 21.4 27.4 30M35.6 25.2 33 30M28 24h9M31 27h8" fill="none"/>
    </g>
    <!-- La ligne d'assise, en argile : le sol, et l'accent de la marque. -->
    <path d="M6 36h36" stroke="${argile}" stroke-width="3.4" stroke-linecap="round" fill="none"/>
  </svg>`;
}

/** Le logo complet, symbole et nom. */
export function logo({ taille = 38, sombre = false } = {}) {
  const encre = sombre ? '#fff' : 'currentColor';
  const doux = sombre ? 'rgba(255,255,255,.5)' : 'var(--encre-3)';
  return `<span style="display:flex;align-items:center;gap:11px;color:${encre}">
    ${symbole(taille)}
    <span>
      <b style="font-family:var(--titre);font-size:19px;font-weight:800;
        letter-spacing:-.02em;line-height:1;display:block">${MARQUE.nom}</b>
      <span style="display:block;font-size:10px;font-weight:600;letter-spacing:.18em;
        color:${doux};text-transform:uppercase;margin-top:3px">${MARQUE.baseline}</span>
    </span>
  </span>`;
}
