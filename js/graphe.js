/**
 * La courbe qui montre le temps de retour.
 *
 * Une seule série — l'économie cumulée année après année — et une ligne de
 * référence : ce que l'installation a coûté. Leur croisement EST le temps de
 * retour. Le graphique ne décore donc pas l'argument, il le montre : le
 * visiteur voit à quel moment il cesse de payer et commence à gagner.
 *
 * Pas de légende : une seule série, que le titre nomme. Pas de nombre sur
 * chaque point : seuls le croisement et la valeur finale sont écrits.
 */

/** Graduations rondes, lisibles, jamais plus de `max` d'entre elles. */
export function graduations(valeurMax, max = 5) {
  if (!(valeurMax > 0)) return [0];
  const brut = valeurMax / max;
  const ordre = 10 ** Math.floor(Math.log10(brut));
  // On arrondit le pas à 1, 2, 5 ou 10 fois une puissance de dix : ce sont
  // les seuls pas qu'un lecteur additionne de tête.
  const pas = [1, 2, 2.5, 5, 10].map((m) => m * ordre).find((p) => p >= brut) ?? 10 * ordre;
  // On multiplie plutôt qu'on n'accumule, et on n'arrondit pas : un arrondi
  // par graduation rendrait les écarts inégaux — 0 / 3 / 5 / 8 —, et des
  // lignes de grille irrégulières mentent sur les proportions.
  const out = [];
  for (let i = 0; i * pas <= valeurMax + pas * 0.001; i++) out.push(i * pas);
  return out;
}

/** Abrège un montant pour un axe : 42 691 → « 42,7 k ». */
export function abreger(dinars) {
  const n = Math.abs(dinars);
  if (n >= 1000) {
    const k = dinars / 1000;
    const texte = (Math.abs(k) < 10 ? k.toFixed(1) : Math.round(k).toString());
    return texte.replace('.', ',').replace(',0', '') + ' k';
  }
  // Une étiquette doit nommer la valeur que la ligne atteint : écrire « 3 »
  // sur une graduation posée à 2,5 fait mentir la grille.
  const arrondi = Math.round(dinars * 10) / 10;
  return String(Number.isInteger(arrondi) ? arrondi : arrondi).replace('.', ',');
}

/** Le cadre de dessin : la zone utile, une fois les étiquettes défalquées. */
export const MARGES = { haut: 22, droite: 16, bas: 30, gauche: 52 };

/**
 * Construit le graphique.
 *
 * @param {object} etude résultat d'`etudier`
 * @param {object} [opts]
 * @returns {{svg:string, points:Array}} le SVG et les points, pour le survol
 */
export function construireGraphe(etude, { largeur = 620, hauteur = 260 } = {}) {
  const m = MARGES;
  const zoneL = largeur - m.gauche - m.droite;
  const zoneH = hauteur - m.haut - m.bas;

  const annees = etude.annees;
  const anMax = annees.length;
  const valeurMax = Math.max(annees.at(-1).cumul, etude.cout) * 1.08;

  const x = (an) => m.gauche + (an / anMax) * zoneL;
  const y = (v) => m.haut + zoneH - (v / valeurMax) * zoneH;

  const points = annees.map((a) => ({ an: a.an, cumul: a.cumul, x: x(a.an), y: y(a.cumul) }));

  // Grille et graduations : récessives, elles situent sans attirer l'œil.
  const gradY = graduations(valeurMax, 4);
  const grille = gradY.map((v) => `
    <line x1="${m.gauche}" y1="${y(v).toFixed(1)}" x2="${largeur - m.droite}" y2="${y(v).toFixed(1)}"
      stroke="var(--grille)" stroke-width="1" fill="none"/>
    <text x="${m.gauche - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end"
      class="g-etiq">${abreger(v)}</text>`).join('');

  const gradX = [5, 10, 15, 20, 25].filter((a) => a <= anMax);
  const axeX = gradX.map((a) => `
    <text x="${x(a).toFixed(1)}" y="${hauteur - 10}" text-anchor="middle"
      class="g-etiq">${a} ans</text>`).join('');

  const chemin = points.map((p, i) =>
    `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const aire = `M${x(0).toFixed(1)} ${y(0).toFixed(1)} `
    + points.map((p) => `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
    + ` L${points.at(-1).x.toFixed(1)} ${y(0).toFixed(1)} Z`;

  // La ligne de l'investissement, et le croisement s'il a lieu.
  const yCout = y(etude.cout);
  const croisement = etude.retour
    ? `<circle cx="${x(etude.retour).toFixed(1)}" cy="${yCout.toFixed(1)}" r="6"
         fill="var(--accent)" stroke="var(--surface)" stroke-width="2.5"/>
       <text x="${x(etude.retour).toFixed(1)}" y="${(yCout - 14).toFixed(1)}"
         text-anchor="middle" class="g-fort">remboursé en ${
           etude.retour.toFixed(1).replace('.', ',')} ans</text>`
    : '';

  const svg = `<svg viewBox="0 0 ${largeur} ${hauteur}" role="img"
    aria-label="Économie cumulée sur ${anMax} ans, comparée au coût de l'installation"
    preserveAspectRatio="xMidYMid meet">
    ${grille}${axeX}
    <path d="${aire}" fill="var(--aire)" stroke="none"/>
    <path d="${chemin}" fill="none" stroke="var(--accent)" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="${m.gauche}" y1="${yCout.toFixed(1)}" x2="${largeur - m.droite}" y2="${yCout.toFixed(1)}"
      stroke="var(--repere)" stroke-width="1.5" stroke-dasharray="5 4" fill="none"/>
    <text x="${largeur - m.droite}" y="${(yCout - 8).toFixed(1)}" text-anchor="end"
      class="g-etiq">investissement</text>
    ${croisement}
    <circle cx="${points.at(-1).x.toFixed(1)}" cy="${points.at(-1).y.toFixed(1)}" r="4.5"
      fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>
  </svg>`;

  return { svg, points };
}


/**
 * La production mois par mois, en barres.
 *
 * Un client qui ne voit qu'un total annuel se demande ce que donne décembre —
 * et croit souvent que l'hiver ne produit rien. La courbe répond, et elle
 * rassure : le mois le plus creux produit encore près de la moitié du plus
 * plein. Seuls les deux extrêmes sont chiffrés : un nombre sur chaque barre
 * ferait un mur de chiffres que personne ne lit.
 */
export function grapheMensuel(mensuel, mois, { largeur = 620, hauteur = 190 } = {}) {
  if (!Array.isArray(mensuel) || mensuel.length !== 12) return null;

  const m = { haut: 26, droite: 10, bas: 26, gauche: 10 };
  const zoneL = largeur - m.gauche - m.droite;
  const zoneH = hauteur - m.haut - m.bas;
  const maxi = Math.max(...mensuel);
  const mini = Math.min(...mensuel);
  if (!(maxi > 0)) return null;

  // Un intervalle entre barres, pour qu'elles se lisent comme douze objets
  // et non comme une masse.
  const pas = zoneL / 12;
  const largeurBarre = pas * 0.62;

  const barres = mensuel.map((v, i) => {
    const h = (v / maxi) * zoneH;
    const x = m.gauche + i * pas + (pas - largeurBarre) / 2;
    const y = m.haut + zoneH - h;
    const fort = v === maxi || v === mini;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}"
      width="${largeurBarre.toFixed(1)}" height="${Math.max(2, h).toFixed(1)}"
      rx="3" fill="${fort ? 'var(--accent)' : 'var(--aire-pleine)'}"/>
      ${fort ? `<text x="${(x + largeurBarre / 2).toFixed(1)}" y="${(y - 7).toFixed(1)}"
        text-anchor="middle" class="g-fort">${v.toLocaleString('fr-FR')}</text>` : ''}
      <text x="${(x + largeurBarre / 2).toFixed(1)}" y="${(hauteur - 8).toFixed(1)}"
        text-anchor="middle" class="g-etiq">${mois[i]}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${largeur} ${hauteur}" role="img"
    aria-label="Production mensuelle, de ${mini} kWh au plus bas à ${maxi} kWh au plus haut"
    preserveAspectRatio="xMidYMid meet">${barres}</svg>`;
}
