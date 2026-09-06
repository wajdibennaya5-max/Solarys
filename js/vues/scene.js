/**
 * LA VUE 3D : peindre la scène, écouter les gestes, rien de plus.
 *
 * POURQUOI UN CANVAS ET PAS DU SVG. Une orbite redessine tout à chaque
 * mouvement du doigt. En SVG, cela veut dire recréer des dizaines de nœuds
 * soixante fois par seconde ; en canvas, c'est un simple tracé. Le tracé du
 * toit reste en SVG parce qu'on y sélectionne des sommets ; ici on ne
 * sélectionne rien, on regarde.
 *
 * CE COMPOSANT NE CALCULE AUCUNE GÉOMÉTRIE. La caméra, la projection, l'ordre
 * des faces et l'éclairement viennent tous de `scene3d.js`. S'il se mettait à
 * projeter un point lui-même, deux géométries coexisteraient et l'une serait
 * fausse — c'est la règle que le test d'architecture fait respecter.
 *
 * L'ÉCLAIRAGE N'EST PAS UNE ÉTUDE D'OMBRAGE. C'est un dégradé fixe qui rend
 * les volumes lisibles. L'interface le dit, et ce fichier ne prétend pas le
 * contraire.
 */
import {
  camera, rendre, VUES, ELEVATION_MIN, ELEVATION_MAX, distancePourCadrer,
  ajusterDistance,
} from '../scene3d.js';

/** Les couleurs des rôles. Le toit se distingue au premier regard. */
const TEINTES = {
  terrain: [193, 200, 190],
  mur: [236, 228, 214],
  toit: [232, 163, 61],
  // Un bleu très sombre : c'est la couleur d'un module réel, et surtout elle
  // ne se confond avec aucune autre face de la scène.
  module: [30, 42, 66],
};

const el = (nom, classe, dedans) => {
  const n = document.createElement(nom);
  if (classe) n.className = classe;
  if (dedans !== undefined) n.textContent = dedans;
  return n;
};

const borner = (v, min, max) => Math.min(max, Math.max(min, v));

/**
 * Installe une vue 3D dans un élément.
 *
 * @param {HTMLElement} racine
 * @param {object} opts
 * @param {object} opts.scene telle que `construireScene` la rend
 * @param {(etat:object) => void} [opts.surVue] prévenu à chaque changement de
 *   point de vue, pour que le contrôleur puisse l'écrire quelque part
 * @returns {{definirScene:Function, definirVue:Function, basculer:Function,
 *   rafraichir:Function, detruire:Function, etat:Function}}
 */
export function creerScene3d(racine, { scene = null, surVue = null } = {}) {
  if (!racine) return null;

  let modele = scene;
  let azimut = VUES.isometrique.azimut;
  let elevation = VUES.isometrique.elevation;
  let distance = modele ? distancePourCadrer(modele.rayon) : 40;
  /** Le cadrage doit être refait dès que la taille ou le point de vue change. */
  let aCadrer = true;
  let largeur = 0;
  let hauteur = 0;

  /** Ce que l'on montre. Chaque couche s'éteint séparément. */
  const couches = { terrain: true, mur: true, toit: true, module: true, cotes: true };

  racine.classList.add('scene3d');
  racine.setAttribute('role', 'application');
  racine.setAttribute('tabindex', '0');
  racine.setAttribute('aria-label',
    'Vue en trois dimensions du bâtiment. Flèches pour tourner autour, '
    + 'plus et moins pour approcher.');
  racine.innerHTML = '';

  const toile = el('canvas', 'scene3d-toile');
  const contexte = toile.getContext('2d');
  const legende = el('p', 'scene3d-legende');
  legende.setAttribute('role', 'status');
  legende.setAttribute('aria-live', 'polite');
  const reserve = el('p', 'scene3d-reserve',
    'Éclairage d’aide à la lecture des volumes — ce n’est pas une étude d’ombrage.');

  const barre = el('div', 'scene3d-vues');
  const boutonsVue = {};
  for (const [id, v] of Object.entries(VUES)) {
    const b = el('button', 'scene3d-vue', v.nom);
    b.type = 'button';
    b.title = v.aide;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', (e) => { e.preventDefault(); definirVue(id); });
    boutonsVue[id] = b;
    barre.append(b);
  }

  const bascules = el('div', 'scene3d-couches');
  const NOMS = { terrain: 'Terrain', mur: 'Murs', toit: 'Toiture',
    module: 'Modules', cotes: 'Cotes' };
  const boutonsCouche = {};
  for (const [cle, nom] of Object.entries(NOMS)) {
    const b = el('button', 'scene3d-couche actif', nom);
    b.type = 'button';
    b.setAttribute('aria-pressed', 'true');
    b.addEventListener('click', (e) => { e.preventDefault(); basculer(cle); });
    boutonsCouche[cle] = b;
    bascules.append(b);
  }

  racine.append(barre, toile, bascules, legende, reserve);

  /* ------------------------------------------------------------- rendu */

  function dessiner() {
    largeur = racine.clientWidth || 320;
    // La toile occupe la place laissée par les barres. On mesure la hauteur
    // DISPONIBLE plutôt que de la réclamer : une toile qui pousse son
    // conteneur relance l'observateur de taille, qui relance le rendu, qui
    // repousse le conteneur. La boucle ne s'arrête jamais et plus rien n'est
    // cliquable.
    hauteur = Math.max(180, (racine.clientHeight || 320)
      - barre.offsetHeight - bascules.offsetHeight
      - legende.offsetHeight - reserve.offsetHeight - 16);

    // Sans le rapport de pixels, tout est flou sur un écran dense — et un
    // toit flou fait douter du calcul qui va avec.
    const ratio = Math.min(3, globalThis.devicePixelRatio || 1);
    toile.width = Math.round(largeur * ratio);
    toile.height = Math.round(hauteur * ratio);
    toile.style.width = `${largeur}px`;
    toile.style.height = `${hauteur}px`;
    contexte.setTransform(ratio, 0, 0, ratio, 0, 0);
    contexte.clearRect(0, 0, largeur, hauteur);

    if (!modele || !modele.faces.length) {
      legende.textContent = 'Aucun contour de toiture : dessinez le toit sur la carte '
        + 'pour le voir en volume.';
      return;
    }

    if (aCadrer) {
      distance = ajusterDistance(modele, { azimut, elevation, largeur, hauteur });
      aCadrer = false;
    }
    const cam = camera({ azimut, elevation, distance, cible: modele.centre });
    const faces = rendre(modele, cam, { largeur, hauteur })
      .filter((f) => couches[f.role] !== false);

    for (const f of faces) {
      const base = TEINTES[f.role] ?? [200, 200, 200];
      const k = f.eclairement;
      contexte.beginPath();
      f.points.forEach((p, i) => (i ? contexte.lineTo(p.x, p.y) : contexte.moveTo(p.x, p.y)));
      contexte.closePath();
      contexte.fillStyle = `rgb(${base.map((c) => Math.round(c * k)).join(',')})`;
      contexte.fill();
      // Les arêtes : sans elles, deux faces de teinte voisine se confondent et
      // le volume disparaît.
      // Les modules se dessinent au trait clair : sur un fond presque noir,
      // une arête sombre disparaît et le champ devient une tache.
      contexte.strokeStyle = f.role === 'module'
        ? 'rgba(255,255,255,.45)' : 'rgba(28,32,38,.45)';
      contexte.lineWidth = f.role === 'toit' ? 1.6 : 1;
      contexte.stroke();
    }

    if (couches.cotes) dessinerCotes(cam);

    const v = Object.entries(VUES).find(([, x]) =>
      Math.abs(x.azimut - azimut) < 0.5 && Math.abs(x.elevation - elevation) < 0.5);
    for (const [id, b] of Object.entries(boutonsVue)) {
      const actif = Boolean(v) && v[0] === id;
      b.classList.toggle('actif', actif);
      b.setAttribute('aria-pressed', String(actif));
    }
    legende.textContent = `${v ? v[1].nom : 'Vue libre'} — azimut `
      + `${Math.round(azimut)}° (0 = depuis le sud), hauteur ${Math.round(elevation)}°, `
      + `recul ${Math.round(distance)} m`;
    surVue?.({ azimut, elevation, distance, vue: v ? v[0] : null });
  }

  /** Les hauteurs du bâtiment, écrites sur la scène. */
  function dessinerCotes(cam) {
    const t = modele.toit;
    if (!t?.sommets?.length) return;
    const cotes = [
      { p: t.sommets.reduce((a, b) => (a.z >= b.z ? a : b)),
        texte: `faîtage ${t.hauteurMax.toFixed(2)} m` },
      { p: t.sommets.reduce((a, b) => (a.z <= b.z ? a : b)),
        texte: `égout ${t.hauteurMin.toFixed(2)} m` },
    ];
    if (t.pente > 0) {
      const c = modele.centre;
      cotes.push({ p: { x: c.x, y: c.y, z: t.hauteurMax + 0.6 },
        texte: `pente ${Math.round(t.pente)}°` });
    }
    contexte.font = '600 11.5px system-ui, sans-serif';
    contexte.textAlign = 'center';
    // Deux cotes superposées ne se lisent ni l'une ni l'autre. On garde les
    // rectangles déjà posés et on remonte tant que ça se chevauche.
    const poses = [];
    const chevauche = (a) => poses.some((b) =>
      a.x < b.x + b.l && a.x + a.l > b.x && a.y < b.y + b.h && a.y + a.h > b.y);
    for (const c of cotes) {
      const q = rendre({ faces: [{ role: 'toit', sommets: [c.p], normale: null }] },
        cam, { largeur, hauteur, masquerDos: false })[0]?.points?.[0];
      if (!q?.visible) continue;
      const l = contexte.measureText(c.texte).width + 10;
      const boite = { x: q.x - l / 2, y: q.y - 15, l, h: 16 };
      let essais = 0;
      while (chevauche(boite) && essais < 8) { boite.y -= 18; essais++; }
      if (boite.y < 0) boite.y = q.y + 4;
      poses.push(boite);
      contexte.fillStyle = 'rgba(255,255,255,.9)';
      contexte.fillRect(boite.x, boite.y, boite.l, boite.h);
      contexte.strokeStyle = 'rgba(28,32,38,.18)';
      contexte.lineWidth = 1;
      contexte.strokeRect(boite.x, boite.y, boite.l, boite.h);
      contexte.fillStyle = '#1c2026';
      contexte.fillText(c.texte, boite.x + boite.l / 2, boite.y + 12);
    }
  }

  /* --------------------------------------------------------- commandes */

  function definirVue(id) {
    const v = VUES[id];
    if (!v) return;
    azimut = v.azimut;
    elevation = v.elevation;
    // Chaque point de vue se recadre : vu de dessus, un bâtiment allongé
    // occupe l'écran autrement que vu de face.
    aCadrer = true;
    dessiner();
  }

  function basculer(cle) {
    if (!(cle in couches)) return;
    couches[cle] = !couches[cle];
    const b = boutonsCouche[cle];
    b.classList.toggle('actif', couches[cle]);
    b.setAttribute('aria-pressed', String(couches[cle]));
    dessiner();
  }

  const approcher = (facteur) => {
    const mini = modele ? Math.max(3, modele.rayon * 0.6) : 3;
    const maxi = modele ? distancePourCadrer(modele.rayon) * 4 : 400;
    distance = borner(distance * facteur, mini, maxi);
    dessiner();
  };

  /* ------------------------------------------------------------ gestes */

  const pointeurs = new Map();
  let ecart = 0;

  const local = (e) => {
    const r = toile.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  toile.addEventListener('pointerdown', (e) => {
    toile.setPointerCapture?.(e.pointerId);
    pointeurs.set(e.pointerId, local(e));
    if (pointeurs.size === 2) {
      const [a, b] = [...pointeurs.values()];
      ecart = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });

  toile.addEventListener('pointermove', (e) => {
    if (!pointeurs.has(e.pointerId)) return;
    const p = local(e);
    const avant = pointeurs.get(e.pointerId);
    pointeurs.set(e.pointerId, p);

    if (pointeurs.size === 2) {
      const [a, b] = [...pointeurs.values()];
      const neuf = Math.hypot(a.x - b.x, a.y - b.y);
      if (ecart > 0 && Math.abs(neuf - ecart) > 6) {
        approcher(ecart / neuf);
        ecart = neuf;
      }
      return;
    }
    // Glisser vers la droite fait tourner la scène dans le même sens que le
    // doigt : l'inverse donne le mal de mer.
    azimut = ((azimut - (p.x - avant.x) * 0.4 + 180) % 360 + 360) % 360 - 180;
    elevation = borner(elevation + (p.y - avant.y) * 0.3, ELEVATION_MIN, ELEVATION_MAX);
    dessiner();
  });

  const relacher = (e) => { pointeurs.delete(e.pointerId); if (pointeurs.size < 2) ecart = 0; };
  toile.addEventListener('pointerup', relacher);
  toile.addEventListener('pointercancel', relacher);

  toile.addEventListener('wheel', (e) => {
    e.preventDefault();
    approcher(e.deltaY > 0 ? 1.12 : 1 / 1.12);
  }, { passive: false });

  racine.addEventListener('keydown', (e) => {
    const pas = e.shiftKey ? 15 : 5;
    const touches = {
      ArrowLeft: () => { azimut = ((azimut - pas + 180) % 360 + 360) % 360 - 180; },
      ArrowRight: () => { azimut = ((azimut + pas + 180) % 360 + 360) % 360 - 180; },
      ArrowUp: () => { elevation = borner(elevation + pas, ELEVATION_MIN, ELEVATION_MAX); },
      ArrowDown: () => { elevation = borner(elevation - pas, ELEVATION_MIN, ELEVATION_MAX); },
    };
    if (touches[e.key]) { e.preventDefault(); touches[e.key](); dessiner(); return; }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); approcher(1 / 1.15); }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); approcher(1.15); }
  });

  // Deux garde-fous contre la boucle : on ignore un redimensionnement qui ne
  // change rien, et on ne redessine qu'une fois par image.
  let derniereTaille = '';
  let enAttente = false;
  const surTaille = () => {
    const t = `${racine.clientWidth}x${racine.clientHeight}`;
    if (t === derniereTaille) return;
    derniereTaille = t;
    aCadrer = true;
    if (enAttente) return;
    enAttente = true;
    const suite = () => { enAttente = false; dessiner(); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(suite);
    else suite();
  };
  const observateur = typeof ResizeObserver === 'function'
    ? new ResizeObserver(surTaille) : null;
  observateur?.observe(racine);
  if (!observateur) globalThis.addEventListener?.('resize', surTaille);

  dessiner();

  return {
    definirScene: (s) => {
      modele = s;
      aCadrer = true;
      dessiner();
    },
    definirVue,
    basculer,
    couches: () => ({ ...couches }),
    etat: () => ({ azimut, elevation, distance }),
    rafraichir: dessiner,
    detruire: () => {
      observateur?.disconnect();
      if (!observateur) globalThis.removeEventListener?.('resize', surTaille);
      racine.innerHTML = '';
      racine.classList.remove('scene3d');
    },
  };
}
