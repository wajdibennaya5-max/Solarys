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

/**
 * PRODUCTION CONTRE CONSOMMATION, mois par mois.
 *
 * C'est le graphique qui répond à la seule question que tout le monde pose :
 * « est-ce que ça couvre ? » Un total annuel ne le dit pas — une installation
 * peut couvrir l'année et laisser janvier à découvert. Les deux séries
 * superposées le montrent d'un regard : la zone où la production dépasse est
 * le surplus vendu au réseau, celle où elle manque est ce qui reste acheté.
 *
 * Deux séries, donc une légende — c'est la seule chose qui la justifie.
 */
export function grapheComparaison(production, consommation, mois,
  { largeur = 620, hauteur = 230 } = {}) {
  if (!Array.isArray(production) || production.length !== 12) return null;
  if (!Array.isArray(consommation) || consommation.length !== 12) return null;

  const m = { haut: 34, droite: 12, bas: 42, gauche: 46 };
  const zoneL = largeur - m.gauche - m.droite;
  const zoneH = hauteur - m.haut - m.bas;
  const maxi = Math.max(...production, ...consommation);
  if (!(maxi > 0)) return null;

  const grille = graduations(maxi, 4);
  const plafond = grille.at(-1) || maxi;
  const y = (v) => m.haut + zoneH - (v / plafond) * zoneH;
  const pas = zoneL / 12;

  const lignes = grille.map((g) => `<line x1="${m.gauche}" x2="${largeur - m.droite}"
    y1="${y(g).toFixed(1)}" y2="${y(g).toFixed(1)}" stroke="var(--grille)" stroke-width="1"/>
    <text x="${m.gauche - 8}" y="${(y(g) + 4).toFixed(1)}" text-anchor="end"
      class="g-etiq">${abreger(g)}</text>`).join('');

  // La consommation en barres claires au fond, la production en barres
  // pleines devant : l'œil compare des hauteurs, pas des couleurs.
  const largeurBarre = pas * 0.66;
  const barres = consommation.map((c, i) => {
    const x = m.gauche + i * pas + (pas - largeurBarre) / 2;
    const p = production[i];
    const couvre = p >= c;
    return `<rect x="${x.toFixed(1)}" y="${y(c).toFixed(1)}"
        width="${largeurBarre.toFixed(1)}" height="${Math.max(1, m.haut + zoneH - y(c)).toFixed(1)}"
        rx="3" fill="var(--grille)"/>
      <rect x="${(x + largeurBarre * 0.16).toFixed(1)}" y="${y(p).toFixed(1)}"
        width="${(largeurBarre * 0.68).toFixed(1)}"
        height="${Math.max(1, m.haut + zoneH - y(p)).toFixed(1)}"
        rx="3" fill="${couvre ? 'var(--or)' : 'var(--accent)'}"/>
      <text x="${(x + largeurBarre / 2).toFixed(1)}" y="${(hauteur - 20).toFixed(1)}"
        text-anchor="middle" class="g-etiq">${mois[i]}</text>`;
  }).join('');

  const couverts = production.filter((p, i) => p >= consommation[i]).length;

  return `<svg viewBox="0 0 ${largeur} ${hauteur}" role="img"
    aria-label="Production comparée à la consommation, mois par mois : ${couverts} mois sur 12 entièrement couverts"
    preserveAspectRatio="xMidYMid meet">
    ${lignes}${barres}
    <g transform="translate(${m.gauche}, 16)">
      <rect x="0" y="-9" width="11" height="11" rx="2.5" fill="var(--grille)"/>
      <text x="17" y="0" class="g-etiq">Votre consommation</text>
      <rect x="152" y="-9" width="11" height="11" rx="2.5" fill="var(--or)"/>
      <text x="169" y="0" class="g-etiq">Votre production</text>
    </g>
    <text x="${largeur / 2}" y="${hauteur - 5}" text-anchor="middle" class="g-etiq"
      >kWh par mois</text>
  </svg>`;
}

/**
 * LE FLUX D'ÉNERGIE : soleil → panneaux → onduleur → bâtiment, et le réseau.
 *
 * Le client ne sait pas ce qu'est un onduleur, ni pourquoi son compteur
 * tourne à l'envers. Un schéma où l'épaisseur des flèches suit les
 * kilowattheures répond aux deux questions sans une phrase technique : la
 * grosse flèche va chez lui, la petite part au réseau.
 */
export function diagrammeFlux(etude, { largeur = 620, hauteur = 264 } = {}) {
  if (!etude?.production) return null;

  const { production, autoconsomme, surplus, consommation } = etude;
  const achete = Math.max(0, Math.round(consommation - autoconsomme));
  const part = (v) => (production > 0 ? v / production : 0);

  // L'épaisseur dit la proportion, entre deux bornes lisibles : une flèche
  // d'un pixel disparaît, une flèche trop épaisse déborde de sa boîte et ne
  // se compare plus à sa voisine.
  // Plafonnée à seize : au-delà, la pointe de flèche se noie dans le trait.
  const ep = (v) => Math.max(5, Math.min(16, 5 + part(v) * 11));

  const boite = (x, y, l, h, titre, valeur, classe, sombre = false) => `<g>
    <rect x="${x}" y="${y}" width="${l}" height="${h}" rx="12" class="fx-boite ${classe}"/>
    <text x="${x + l / 2}" y="${y + 26}" text-anchor="middle"
      class="fx-titre${sombre ? ' fx-clair' : ''}">${titre}</text>
    <text x="${x + l / 2}" y="${y + 46}" text-anchor="middle"
      class="fx-val${sombre ? ' fx-clair-doux' : ''}">${valeur}</text>
  </g>`;

  const kwh = (v) => `${Math.round(v).toLocaleString('fr-FR')} kWh`;

  return `<svg viewBox="0 0 ${largeur} ${hauteur}" role="img"
    aria-label="Flux d’énergie : ${kwh(production)} produits, dont ${kwh(autoconsomme)} consommés sur place et ${kwh(surplus)} injectés sur le réseau"
    preserveAspectRatio="xMidYMid meet">
    <defs>
      ${['or', 'gris', 'rouge'].map((teinte) => `<marker id="fx-fl-${teinte}"
        viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse"
        markerWidth="24" markerHeight="24" orient="auto">
        <path d="M0 .5 10 5 0 9.5z" class="fx-tete-${teinte}"/>
      </marker>`).join('')}
    </defs>

    ${boite(6, 100, 112, 64, 'Soleil', `${etude.productible} kWh/kWc`, 'fx-soleil')}
    ${boite(154, 100, 112, 64, 'Panneaux',
      `${String(etude.puissance).replace('.', ',')} kWc`, 'fx-panneaux')}
    ${boite(302, 100, 112, 64, 'Onduleur', kwh(production), 'fx-onduleur')}
    ${boite(452, 26, 162, 64, 'Votre bâtiment', kwh(autoconsomme + achete), 'fx-maison', true)}
    ${boite(452, 174, 162, 64, 'Réseau STEG',
      surplus > 0 ? `+ ${kwh(surplus)} injectés` : kwh(achete), 'fx-reseau')}

    <path d="M118 132 H150" class="fx-trait" stroke-width="${ep(production).toFixed(1)}"
      marker-end="url(#fx-fl-or)"/>
    <path d="M266 132 H298" class="fx-trait" stroke-width="${ep(production).toFixed(1)}"
      marker-end="url(#fx-fl-or)"/>
    <path d="M414 124 H430 Q440 124 440 112 V70 H448" class="fx-trait"
      fill="none" stroke-width="${ep(autoconsomme).toFixed(1)}" marker-end="url(#fx-fl-or)"/>
    ${surplus > 0 ? `<path d="M414 142 H430 Q440 142 440 154 V196 H448"
      class="fx-trait fx-vers-reseau" fill="none" stroke-width="${ep(surplus).toFixed(1)}"
      marker-end="url(#fx-fl-gris)"/>` : ''}
    ${achete > 0 ? `<path d="M533 170 V94" class="fx-trait fx-achat" fill="none"
      stroke-width="${ep(achete).toFixed(1)}" marker-end="url(#fx-fl-rouge)"/>` : ''}

    <text x="424" y="102" text-anchor="end" class="fx-note"
      >${Math.round(part(autoconsomme) * 100)} % consommés sur place</text>
    ${surplus > 0 ? `<text x="424" y="170" text-anchor="end" class="fx-note"
      >${Math.round(part(surplus) * 100)} % vendus au réseau</text>` : ''}
    ${achete > 0 ? `<text x="523" y="130" text-anchor="end" class="fx-note fx-note-achat"
      >${kwh(achete)}<tspan x="523" dy="14">encore achetés</tspan></text>` : ''}
  </svg>`;
}
