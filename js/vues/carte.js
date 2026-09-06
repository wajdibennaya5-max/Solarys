/**
 * LA CARTE INTERACTIVE, en un seul composant.
 *
 * POURQUOI CE FICHIER EXISTE, ET PAS DANS `site.js`. Le contrôleur dépassait
 * déjà dix-huit cents lignes. Y ajouter le glissement, le zoom, le pincement,
 * le chargement des tuiles et le clavier aurait produit un fichier que
 * personne ne relit — et c'est exactement ce qui était demandé d'éviter.
 *
 * Ce composant ne touche qu'à l'élément qu'on lui confie. Il ne connaît ni le
 * formulaire, ni l'étude, ni le rapport : il montre un point et prévient quand
 * l'utilisateur le déplace. Toute la géométrie vient de `carte/tuiles.js`,
 * toute la question du fournisseur vient de `carte/fonds.js` : il n'invente
 * aucun chiffre.
 *
 * SANS FOND DÉCLARÉ, il ne montre pas une image floue en prétendant que c'est
 * le terrain. Il montre un quadrillage à l'échelle, le repère et les
 * coordonnées — et il écrit qu'il n'y a pas d'image.
 */
import {
  TAILLE, ZOOM_MIN, ZOOM_MAX, fenetre, pointSousPixel, glisser, echelle,
  metresParPixel, bornerZoom,
} from '../carte/tuiles.js';
import { adresseTuile, fondActif, capacites } from '../carte/fonds.js';
import { formater } from '../localisation.js';

/** Au-delà, ce n'est plus une hésitation du doigt : c'est un glissement. */
const SEUIL_GLISSEMENT = 6;

const el = (nom, classe, dedans) => {
  const n = document.createElement(nom);
  if (classe) n.className = classe;
  if (dedans !== undefined) n.textContent = dedans;
  return n;
};

/**
 * Installe une carte dans un élément.
 *
 * @param {HTMLElement} racine
 * @param {object} opts
 * @param {{latitude:number, longitude:number}} opts.point le repère initial
 * @param {number} [opts.zoom]
 * @param {(p:{latitude:number, longitude:number}) => void} [opts.surDeplacement]
 *   appelé quand l'utilisateur pose le repère ailleurs — jamais pendant un
 *   simple panoramique, qui ne change pas le point choisi.
 * @param {(p:{latitude:number, longitude:number}) => void} [opts.surSommet]
 *   en mode `trace` : appelé quand l'utilisateur ajoute un point au contour
 * @param {(i:number, p:object) => void} [opts.surSommetDeplace]
 *   appelé pendant qu'un sommet existant est tiré
 * @returns {{deplacer:Function, zoomer:Function, rafraichir:Function,
 *   detruire:Function, point:Function}}
 */
export function creerCarte(racine, {
  point = { latitude: 36.8065, longitude: 10.1815 },
  zoom = 17,
  surDeplacement = null,
  surSommet = null,
  surSommetDeplace = null,
} = {}) {
  if (!racine) return null;

  let repere = { latitude: Number(point.latitude), longitude: Number(point.longitude) };
  let centre = { ...repere };
  let z = bornerZoom(zoom);
  let largeur = 0;
  let hauteur = 0;

  /**
   * Deux modes, parce que le même geste ne peut pas vouloir dire deux choses.
   * En `reperage`, un appui pose le repère du site. En `trace`, il ajoute un
   * sommet au contour. Confondre les deux ferait sauter le repère à chaque
   * point du toit.
   */
  let mode = 'reperage';
  /** Les sommets du contour, et leurs cotes déjà mesurées par le domaine. */
  let trace = { sommets: [], cotes: [] };
  /** Le sommet en cours de déplacement, s'il y en a un. */
  let sommetTire = null;

  // `carte` est DÉJÀ la classe des fiches du site : la réutiliser ici aurait
  // donné à la carte le fond, la bordure et le rembourrage d'une carte de
  // contenu, sans que rien ne signale la collision.
  racine.classList.add('carte-vue');
  racine.setAttribute('role', 'application');
  racine.setAttribute('tabindex', '0');
  racine.setAttribute('aria-label',
    'Carte du site. Flèches pour déplacer, plus et moins pour zoomer, '
    + 'Entrée pour poser le repère au centre.');
  racine.innerHTML = '';

  const plan = el('div', 'carte-plan');
  // Le calque de tracé : du SVG, parce qu'un polygone doit rester net à tous
  // les zooms et rester sélectionnable au doigt.
  const calque = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  calque.setAttribute('class', 'carte-calque');
  calque.setAttribute('aria-hidden', 'true');
  const marque = el('div', 'carte-repere');
  marque.setAttribute('aria-hidden', 'true');
  const croix = el('div', 'carte-croix');
  croix.setAttribute('aria-hidden', 'true');
  const barre = el('div', 'carte-echelle');
  const legende = el('p', 'carte-attribution');
  const lecture = el('p', 'carte-lecture');
  lecture.setAttribute('role', 'status');
  lecture.setAttribute('aria-live', 'polite');

  const boutons = el('div', 'carte-boutons');
  const bouton = (texte, titre, action) => {
    const b = el('button', 'carte-bouton', texte);
    b.type = 'button';
    b.title = titre;
    b.setAttribute('aria-label', titre);
    b.addEventListener('click', (e) => { e.preventDefault(); action(); });
    return b;
  };
  const plus = bouton('+', 'Zoomer', () => zoomer(1));
  const moins = bouton('−', 'Dézoomer', () => zoomer(-1));
  const recentrer = bouton('⌖', 'Revenir au repère', () => {
    centre = { ...repere }; dessiner();
  });
  boutons.append(plus, moins, recentrer);

  const poser = el('button', 'carte-poser', 'Poser le repère ici');
  poser.type = 'button';
  poser.addEventListener('click', (e) => { e.preventDefault(); placer(centre); });

  racine.append(plan, calque, croix, marque, barre, boutons, legende, lecture, poser);

  /* ---------------------------------------------------------------- rendu */

  /**
   * Une tuile qui ne se charge pas laisse sa case au quadrillage plutôt qu'un
   * carré blanc : on voit qu'il manque une image, pas que la carte est cassée.
   */
  function imageTuile(t, source) {
    const img = new Image();
    img.className = 'carte-tuile';
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.decoding = 'async';
    img.loading = 'eager';
    img.style.left = `${t.gauche}px`;
    img.style.top = `${t.haut}px`;
    img.addEventListener('error', () => { img.classList.add('absente'); });
    img.src = source;
    return img;
  }

  function dessiner() {
    largeur = racine.clientWidth || 320;
    hauteur = racine.clientHeight || 240;
    const vue = { latitude: centre.latitude, longitude: centre.longitude,
      zoom: z, largeur, hauteur };
    const { tuiles } = fenetre(vue);

    plan.innerHTML = '';
    const fond = fondActif();
    for (const t of tuiles) {
      const source = adresseTuile(t, fond);
      if (source) { plan.append(imageTuile(t, source)); continue; }
      // Sans image : une case de quadrillage, à la bonne place et à la bonne
      // taille. La carte reste mesurable même sans fournisseur.
      const case_ = el('div', 'carte-case');
      case_.style.left = `${t.gauche}px`;
      case_.style.top = `${t.haut}px`;
      case_.style.width = `${TAILLE}px`;
      case_.style.height = `${TAILLE}px`;
      plan.append(case_);
    }

    // Le repère, à sa vraie place — pas au centre, sauf s'il y est.
    const dx = (posX(repere.longitude) - posX(centre.longitude)) * TAILLE + largeur / 2;
    const dy = (posY(repere.latitude) - posY(centre.latitude)) * TAILLE + hauteur / 2;
    marque.style.left = `${dx}px`;
    marque.style.top = `${dy}px`;
    marque.classList.toggle('hors-champ',
      dx < 0 || dy < 0 || dx > largeur || dy > hauteur);

    const e = echelle(centre.latitude, z, Math.min(140, largeur * 0.35));
    barre.style.width = `${Math.round(e.pixels)}px`;
    barre.textContent = e.texte;
    barre.title = `${metresParPixel(centre.latitude, z).toFixed(2)} m par pixel`;

    const cap = capacites(fond);
    legende.textContent = fond
      ? `${fond.attribution} — zoom ${z}`
      : `Sans fond cartographique — quadrillage à l’échelle, zoom ${z}`;
    legende.classList.toggle('sans-fond', !cap.image);

    lecture.textContent = `Repère : ${formater(repere.latitude, repere.longitude)}`;
    plus.disabled = z >= Math.min(ZOOM_MAX, fond?.zoomMax ?? ZOOM_MAX);
    moins.disabled = z <= ZOOM_MIN;
    poser.hidden = mode !== 'reperage';
    marque.classList.toggle('efface', mode === 'trace');
    racine.classList.toggle('carte-trace', mode === 'trace');
    dessinerCalque();
  }

  const svg = (nom, attrs) => {
    const n = document.createElementNS('http://www.w3.org/2000/svg', nom);
    for (const [c, v] of Object.entries(attrs)) n.setAttribute(c, String(v));
    return n;
  };

  /** Le pixel de la fenêtre où tombe un sommet. */
  const auPixel = (p) => ({
    x: (posX(p.longitude) - posX(centre.longitude)) * TAILLE + largeur / 2,
    y: (posY(p.latitude) - posY(centre.latitude)) * TAILLE + hauteur / 2,
  });

  /**
   * Redessine le contour.
   *
   * Cette fonction ne mesure rien : les longueurs affichées viennent des cotes
   * que le contrôleur a fait calculer par le domaine. Deux chemins de calcul
   * finiraient par donner deux longueurs, et l'une serait fausse.
   */
  function dessinerCalque() {
    calque.setAttribute('viewBox', `0 0 ${largeur} ${hauteur}`);
    calque.setAttribute('width', largeur);
    calque.setAttribute('height', hauteur);
    while (calque.firstChild) calque.removeChild(calque.firstChild);
    const pts = trace.sommets.map(auPixel);
    if (!pts.length) return;

    if (pts.length >= 3) {
      calque.append(svg('polygon', {
        class: 'trace-surface',
        points: pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
      }));
    } else if (pts.length === 2) {
      calque.append(svg('line', { class: 'trace-cote',
        x1: pts[0].x, y1: pts[0].y, x2: pts[1].x, y2: pts[1].y }));
    }

    // Les cotes, au milieu de chaque côté. Elles sont la raison d'être de
    // l'outil : sans elles on dessine une forme, on ne mesure pas un toit.
    for (const c of trace.cotes) {
      const a = pts[c.index];
      const b = pts[(c.index + 1) % pts.length];
      if (!a || !b) continue;
      if (pts.length < 3 && c.index === pts.length - 1) continue;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const texte = svg('text', { class: 'trace-cote-txt', x: mx, y: my - 5,
        'text-anchor': 'middle' });
      texte.textContent = `${c.longueur.toFixed(1)} m`;
      const fond = svg('rect', { class: 'trace-cote-fond',
        x: mx - 22, y: my - 17, width: 44, height: 16, rx: 4 });
      calque.append(fond, texte);
    }

    pts.forEach((p, i) => {
      calque.append(svg('circle', {
        class: `trace-sommet${i === 0 ? ' premier' : ''}`,
        cx: p.x, cy: p.y, r: 7, 'data-sommet': i,
      }));
    });
  }

  const posX = (lon) => ((lon + 180) / 360) * (2 ** z);
  const posY = (lat) => {
    const l = Math.min(85.05112878, Math.max(-85.05112878, lat)) * Math.PI / 180;
    return (1 - Math.log(Math.tan(l) + 1 / Math.cos(l)) / Math.PI) / 2 * (2 ** z);
  };

  /* ----------------------------------------------------------- commandes */

  function placer(p) {
    repere = { latitude: p.latitude, longitude: p.longitude };
    centre = { ...repere };
    dessiner();
    // Le repère porte désormais son origine : il a été posé à la main.
    if (surDeplacement) surDeplacement({ ...repere, origine: 'carte', precision: null,
      horodatage: Date.now() });
  }

  function zoomer(pas, ancre = null) {
    const fond = fondActif();
    const max = Math.min(ZOOM_MAX, fond?.zoomMax ?? ZOOM_MAX);
    const nouveau = Math.min(max, Math.max(ZOOM_MIN, z + pas));
    if (nouveau === z) return;
    // Zoomer sous le doigt plutôt qu'au centre : sinon la maison visée
    // s'échappe de l'écran au deuxième appui.
    const sous = ancre
      ? pointSousPixel({ ...centre, zoom: z, largeur, hauteur }, ancre.x, ancre.y)
      : null;
    z = nouveau;
    if (sous) {
      const apres = pointSousPixel({ ...centre, zoom: z, largeur, hauteur }, ancre.x, ancre.y);
      centre = {
        latitude: centre.latitude + (sous.latitude - apres.latitude),
        longitude: centre.longitude + (sous.longitude - apres.longitude),
      };
    }
    dessiner();
  }

  /* ------------------------------------------------------------- gestes */

  const pointeurs = new Map();
  let depart = null;
  let bouge = false;
  let ecart = 0;

  const local = (e) => {
    const r = racine.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /** Le sommet sous le doigt, s'il y en a un à portée. */
  function sommetSous(p) {
    if (mode !== 'trace') return null;
    // Vingt pixels : un doigt fait sept millimètres, pas sept pixels. Une
    // cible plus petite rendrait l'outil inutilisable sur téléphone.
    const RAYON = 20;
    let meilleur = null;
    trace.sommets.forEach((s, i) => {
      const q = auPixel(s);
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d <= RAYON && (!meilleur || d < meilleur.d)) meilleur = { i, d };
    });
    return meilleur ? meilleur.i : null;
  }

  racine.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.carte-bouton, .carte-poser')) return;
    racine.setPointerCapture?.(e.pointerId);
    pointeurs.set(e.pointerId, local(e));
    depart = local(e);
    bouge = false;
    sommetTire = pointeurs.size === 1 ? sommetSous(depart) : null;
    if (pointeurs.size === 2) {
      const [a, b] = [...pointeurs.values()];
      ecart = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });

  racine.addEventListener('pointermove', (e) => {
    if (!pointeurs.has(e.pointerId)) return;
    const p = local(e);
    const avant = pointeurs.get(e.pointerId);
    pointeurs.set(e.pointerId, p);

    if (pointeurs.size === 2) {
      const [a, b] = [...pointeurs.values()];
      const neuf = Math.hypot(a.x - b.x, a.y - b.y);
      if (ecart > 0 && Math.abs(neuf - ecart) > 40) {
        zoomer(neuf > ecart ? 1 : -1,
          { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        ecart = neuf;
      }
      bouge = true;
      return;
    }

    const dx = p.x - avant.x;
    const dy = p.y - avant.y;
    if (Math.hypot(p.x - depart.x, p.y - depart.y) > SEUIL_GLISSEMENT) bouge = true;
    if (!bouge) return;

    // Tirer un sommet corrige un tracé sans tout recommencer. Sans cela, un
    // point posé de travers oblige à effacer le contour entier — et c'est ce
    // qui fait abandonner un outil de mesure.
    if (sommetTire !== null) {
      const q = pointSousPixel({ ...centre, zoom: z, largeur, hauteur }, p.x, p.y);
      surSommetDeplace?.(sommetTire, q);
      return;
    }

    centre = { ...glisser({ ...centre, zoom: z }, dx, dy) };
    dessiner();
  });

  const relacher = (e) => {
    if (!pointeurs.has(e.pointerId)) return;
    const p = pointeurs.get(e.pointerId);
    pointeurs.delete(e.pointerId);
    if (pointeurs.size === 0 && !bouge && depart) {
      const q = pointSousPixel({ ...centre, zoom: z, largeur, hauteur }, p.x, p.y);
      // Un appui franc, sans glissement, veut dire deux choses différentes
      // selon le mode — et jamais les deux à la fois.
      if (mode === 'trace') surSommet?.(q);
      else placer(q);
    }
    if (pointeurs.size === 0) sommetTire = null;
    if (pointeurs.size < 2) ecart = 0;
  };
  racine.addEventListener('pointerup', relacher);
  racine.addEventListener('pointercancel', (e) => { pointeurs.delete(e.pointerId); });

  racine.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomer(e.deltaY < 0 ? 1 : -1, local(e));
  }, { passive: false });

  racine.addEventListener('keydown', (e) => {
    const pas = e.shiftKey ? 120 : 40;
    const touches = {
      ArrowUp: () => { centre = glisser({ ...centre, zoom: z }, 0, -pas); },
      ArrowDown: () => { centre = glisser({ ...centre, zoom: z }, 0, pas); },
      ArrowLeft: () => { centre = glisser({ ...centre, zoom: z }, -pas, 0); },
      ArrowRight: () => { centre = glisser({ ...centre, zoom: z }, pas, 0); },
    };
    if (touches[e.key]) { e.preventDefault(); touches[e.key](); dessiner(); return; }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomer(1); return; }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomer(-1); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      // Au clavier, le centre de la carte tient lieu de curseur : c'est ce que
      // la croix montre, et c'est le seul point désignable sans souris.
      if (mode === 'trace') surSommet?.({ ...centre });
      else placer(centre);
    }
  });

  const surTaille = () => dessiner();
  const observateur = typeof ResizeObserver === 'function'
    ? new ResizeObserver(surTaille) : null;
  observateur?.observe(racine);
  if (!observateur) globalThis.addEventListener?.('resize', surTaille);

  dessiner();

  return {
    point: () => ({ ...repere }),
    zoom: () => z,
    mode: () => mode,
    /** Bascule entre repérage et tracé. */
    definirMode: (m) => { mode = m === 'trace' ? 'trace' : 'reperage'; dessiner(); },
    /**
     * Reçoit le contour et ses cotes DÉJÀ MESURÉES.
     * La vue n'a pas à recalculer une longueur : deux chemins de calcul
     * finiraient par diverger, et rien ne dirait lequel est faux.
     */
    definirTrace: ({ sommets = [], cotes = [] } = {}) => {
      trace = { sommets: sommets.filter((p) =>
        Number.isFinite(p?.latitude) && Number.isFinite(p?.longitude)), cotes };
      dessinerCalque();
    },
    /** Cadre la carte sur un contour, avec une marge respirable. */
    cadrerSur: (sommets) => {
      const bons = (sommets ?? []).filter((p) =>
        Number.isFinite(p?.latitude) && Number.isFinite(p?.longitude));
      if (!bons.length) return;
      const lats = bons.map((p) => p.latitude);
      const lons = bons.map((p) => p.longitude);
      centre = {
        latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
        longitude: (Math.min(...lons) + Math.max(...lons)) / 2,
      };
      dessiner();
    },
    deplacer: (p) => {
      if (!Number.isFinite(p?.latitude) || !Number.isFinite(p?.longitude)) return;
      repere = { latitude: p.latitude, longitude: p.longitude };
      centre = { ...repere };
      dessiner();
    },
    zoomer: (v) => { z = bornerZoom(v); dessiner(); },
    rafraichir: dessiner,
    detruire: () => {
      observateur?.disconnect();
      if (!observateur) globalThis.removeEventListener?.('resize', surTaille);
      racine.innerHTML = '';
      racine.classList.remove('carte-vue');
    },
  };
}
