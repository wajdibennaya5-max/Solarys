/**
 * Le calepinage : où les modules se posent réellement sur le toit.
 *
 * Sunrise promet une « analyse satellite de votre toiture ». Cela demande une
 * imagerie payante, et cela ne dit toujours pas où les panneaux tiennent — une
 * photo aérienne ne connaît ni les marges de rive, ni l'entraxe des rangées.
 *
 * On fait l'inverse, et c'est plus exact : on demande les dimensions du pan de
 * toiture, et on place les modules dessus, aux cotes réelles. Le client voit
 * son propre toit avec ses panneaux, et le nombre annoncé est celui qui tient.
 */

/** Un module courant en Tunisie : 550 Wc, 2,28 m sur 1,13 m. */
export const MODULE = { largeur: 1.134, hauteur: 2.278, puissance: 0.55 };

/** Marge de rive laissée libre sur tout le pourtour, en mètres. */
export const RIVE = 0.35;

/** Jeu entre modules, en mètres. */
export const JEU = 0.02;

/**
 * Combien de modules tiennent sur un pan rectangulaire, et où.
 *
 * Les deux orientations sont essayées : la plus dense gagne. Un module
 * couché tient parfois là où un module debout ne tient pas.
 *
 * @param {number} largeur du pan, en mètres
 * @param {number} profondeur du pan, en mètres
 * @returns {{modules:Array, nombre:number, puissance:number, orientation:string,
 *   taux:number}|null} `null` si le pan ne peut rien porter
 */
export function calepiner(largeur, profondeur) {
  const L = Number(largeur), P = Number(profondeur);
  if (!(L > 0) || !(P > 0)) return null;

  const utileL = L - 2 * RIVE;
  const utileP = P - 2 * RIVE;
  if (utileL <= 0 || utileP <= 0) return null;

  const essai = (l, h, nom) => {
    const colonnes = Math.floor((utileL + JEU) / (l + JEU));
    const rangees = Math.floor((utileP + JEU) / (h + JEU));
    return { colonnes, rangees, l, h, nom, nombre: Math.max(0, colonnes * rangees) };
  };

  const portrait = essai(MODULE.largeur, MODULE.hauteur, 'portrait');
  const paysage = essai(MODULE.hauteur, MODULE.largeur, 'paysage');
  const retenu = paysage.nombre > portrait.nombre ? paysage : portrait;
  if (retenu.nombre === 0) return null;

  // On centre le champ sur le pan : un champ collé dans un coin se voit,
  // et se pose mal.
  const champL = retenu.colonnes * retenu.l + (retenu.colonnes - 1) * JEU;
  const champP = retenu.rangees * retenu.h + (retenu.rangees - 1) * JEU;
  const x0 = (L - champL) / 2;
  const y0 = (P - champP) / 2;

  const modules = [];
  for (let r = 0; r < retenu.rangees; r++) {
    for (let c = 0; c < retenu.colonnes; c++) {
      modules.push({
        x: x0 + c * (retenu.l + JEU),
        y: y0 + r * (retenu.h + JEU),
        l: retenu.l, h: retenu.h,
      });
    }
  }

  return {
    modules,
    nombre: retenu.nombre,
    colonnes: retenu.colonnes,
    rangees: retenu.rangees,
    orientation: retenu.nom,
    puissance: Math.round(retenu.nombre * MODULE.puissance * 100) / 100,
    taux: (retenu.nombre * MODULE.largeur * MODULE.hauteur) / (L * P),
  };
}

/**
 * Le plan du pan et de ses modules, en SVG.
 * Les cotes sont écrites : un plan sans cote n'est pas un plan.
 */
export function planCalepinage(largeur, profondeur, { largeurPx = 560 } = {}) {
  const plan = calepiner(largeur, profondeur);
  if (!plan) return null;

  const marge = 34;
  const echelle = (largeurPx - 2 * marge) / largeur;
  const hauteurPx = profondeur * echelle + 2 * marge;
  const px = (m) => m * echelle;

  const modules = plan.modules.map((m) => `<rect
    x="${(marge + px(m.x)).toFixed(1)}" y="${(marge + px(m.y)).toFixed(1)}"
    width="${px(m.l).toFixed(1)}" height="${px(m.h).toFixed(1)}"
    rx="1.5" fill="#164e5a" stroke="#2b7d8c" stroke-width="1"/>`).join('');

  return {
    plan,
    svg: `<svg viewBox="0 0 ${largeurPx} ${hauteurPx.toFixed(0)}" role="img"
      aria-label="Plan du pan de toiture : ${plan.nombre} modules en ${plan.rangees} rangées de ${plan.colonnes}"
      preserveAspectRatio="xMidYMid meet">
      <rect x="${marge}" y="${marge}" width="${px(largeur).toFixed(1)}"
        height="${px(profondeur).toFixed(1)}" rx="3"
        fill="var(--douce)" stroke="var(--repere)" stroke-width="1.5"/>
      <rect x="${(marge + px(RIVE)).toFixed(1)}" y="${(marge + px(RIVE)).toFixed(1)}"
        width="${px(largeur - 2 * RIVE).toFixed(1)}" height="${px(profondeur - 2 * RIVE).toFixed(1)}"
        fill="none" stroke="var(--repere)" stroke-width="1" stroke-dasharray="4 3"/>
      ${modules}
      <text x="${(marge + px(largeur) / 2).toFixed(1)}" y="${(marge - 12).toFixed(1)}"
        text-anchor="middle" class="g-etiq">${String(largeur).replace('.', ',')} m</text>
      <text x="${(marge - 12).toFixed(1)}" y="${(marge + px(profondeur) / 2).toFixed(1)}"
        text-anchor="middle" class="g-etiq"
        transform="rotate(-90 ${(marge - 12).toFixed(1)} ${(marge + px(profondeur) / 2).toFixed(1)})"
        >${String(profondeur).replace('.', ',')} m</text>
    </svg>`,
  };
}
