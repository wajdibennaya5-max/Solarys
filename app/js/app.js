/**
 * Contrôleur de l'application : navigation, liaison des champs au modèle,
 * recalcul et rendu.
 *
 * Stratégie de rendu : les saisies au clavier ne redessinent que les résultats
 * dérivés (pour ne pas perdre le focus), tandis que les changements de
 * structure (listes déroulantes, cases à cocher, changement de section)
 * déclenchent un rendu complet.
 */

import { t, setLanguage } from './i18n.js';
import {
  blankProject, loadProjects, upsertProject, deleteProject,
  loadPrefs, savePrefs, computeAll,
} from './state.js';
import { findSite, GRID_CARBON } from './data/sites.js';
import { blankSurface, blankObstacle, OBSTACLE_KINDS, resolveSurface } from './model/surface.js';
import { planView } from './ui/plan2d.js';
import * as views from './ui/views.js';
import { bindTooltips } from './ui/charts.js';
import { buildDossier, downloadSheet } from './ui/dossier.js';
import { isValidKey, normalise, isProjectUnlocked, unlockProject,
  readKey } from './licence.js';
import { saveFile } from './download.js';

const SECTIONS = [
  { group: 'study', items: ['dashboard', 'project', 'site', 'load'] },
  { group: 'design', items: ['layout', 'array', 'storage', 'cabling'] },
  { group: 'results', items: ['production', 'economics', 'sld', 'report'] },
  { group: 'tools', items: ['library', 'settings'] },
];

const ICONS = {
  dashboard: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  project: 'M4 4h9l3 3h4v13H4z',
  site: 'M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z',
  load: 'M13 2 4 14h6l-1 8 9-12h-6z',
  layout: 'M3 4h18v16H3zM3 10h18M3 16h18M9 4v16M15 4v16',
  array: 'M3 5h18l-2 9H5zM9 14l-1 5h8l-1-5M2 21h20',
  storage: 'M6 4h12v16H6zM9 2h6v2H9zM8 9h8M8 13h8',
  cabling: 'M4 6h6a4 4 0 0 1 4 4v4a4 4 0 0 0 4 4h2M4 6v12',
  production: 'M3 20h18M6 20V9m5 11V4m5 16v-7',
  economics: 'M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  sld: 'M4 8h4v8H4zM10 12h4M16 8h4v8h-4zM8 12h2',
  report: 'M6 2h9l3 3v17H6zM9 9h6M9 13h6M9 17h4',
  library: 'M4 4h5v16H4zM10 4h5v16h-5zM17 5l3 15',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM3 12h3m12 0h3M12 3v3m0 12v3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1M7.7 16.3l-2.1 2.1',
};

const state = {
  prefs: loadPrefs(),
  projects: [],
  project: null,
  results: null,
  view: 'dashboard',
};

/* ------------------------------------------------------------------ */
/* Accès par chemin dans le modèle                                     */
/* ------------------------------------------------------------------ */

function setPath(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (cur[k] == null) cur[k] = Number.isNaN(Number(keys[i + 1])) ? {} : [];
    cur = cur[k];
  }
  cur[keys.at(-1)] = value;
}

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/* ------------------------------------------------------------------ */
/* Rendu                                                               */
/* ------------------------------------------------------------------ */

function renderNav() {
  return SECTIONS.map((g) => `<div class="nav-group">
    <span class="nav-group-title">${t(`nav.group.${g.group}`)}</span>
    ${g.items.map((id) => `<button class="nav-item${state.view === id ? ' active' : ''}" data-view="${id}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[id]}"/></svg>
      <span>${t(`nav.${id}`)}</span></button>`).join('')}
  </div>`).join('');
}

function renderView() {
  const p = state.project, r = state.results;
  switch (state.view) {
    case 'layout': return views.layout(p, r);
    case 'project': return views.project(p, r);
    case 'site': return views.site(p, r);
    case 'load': return views.load(p, r);
    case 'array': return views.array(p, r);
    case 'storage': return views.storage(p, r);
    case 'cabling': return views.cabling(p, r);
    case 'production': return views.production(p, r);
    case 'economics': return views.economics(p, r);
    case 'sld': return views.sld(p, r, state.prefs);
    case 'report': return views.report(p, r, state.prefs);
    case 'library': return views.library();
    case 'settings': return views.settings(state.prefs);
    default: return views.dashboard(p, r);
  }
}

function render() {
  if (!state.project) return;
  try {
    state.results = computeAll(state.project);
  } catch (err) {
    console.error(err);
    document.getElementById('view').innerHTML =
      `<p class="notice error">Erreur de calcul : ${err.message}</p>`;
    return;
  }

  document.getElementById('nav').innerHTML = renderNav();
  document.getElementById('project-select').innerHTML = state.projects.map((p) =>
    `<option value="${p.id}"${p.id === state.project.id ? ' selected' : ''}>${p.meta.name}</option>`).join('');
  document.getElementById('view-title').textContent = t(`nav.${state.view}`);
  document.getElementById('view').innerHTML = renderView();
  bindTooltips(document.getElementById('view'));
  document.getElementById('print-area').innerHTML =
    views.reportBody(state.project, state.results, state.prefs);
}

/** Recalcul silencieux : met à jour les résultats sans reconstruire les champs. */
function refreshOutputs() {
  try {
    state.results = computeAll(state.project);
  } catch { return; }
  // Les sections purement calculées sont redessinées ; les champs de saisie
  // restent en place pour préserver le focus et le curseur.
  const view = document.getElementById('view');
  const scroll = view.scrollTop;
  const active = document.activeElement;
  const bind = active?.dataset?.bind;
  const caret = active?.selectionStart;
  view.innerHTML = renderView();
  bindTooltips(view);
  view.scrollTop = scroll;
  if (bind) {
    const next = view.querySelector(`[data-bind="${bind}"]`);
    if (next) {
      next.focus();
      if (caret != null && next.setSelectionRange && next.type !== 'number') {
        try { next.setSelectionRange(caret, caret); } catch { /* champ non textuel */ }
      }
    }
  }
  document.getElementById('print-area').innerHTML =
    views.reportBody(state.project, state.results, state.prefs);
}

/* ------------------------------------------------------------------ */
/* Projets                                                             */
/* ------------------------------------------------------------------ */

function openProject(id) {
  const p = state.projects.find((x) => x.id === id);
  if (!p) return;
  state.project = structuredClone(p);
  state.prefs.lastProjectId = id;
  savePrefs(state.prefs);
  render();
}

function saveCurrent() {
  state.projects = upsertProject(structuredClone(state.project));
  flash(t('action.save'));
  render();
}

function newProject() {
  const p = blankProject();
  state.projects = upsertProject(p);
  openProject(p.id);
}

function flash(message) {
  const el = document.getElementById('flash');
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1600);
}

function exportJson(data, filename) {
  saveFile(JSON.stringify(data, null, 2), filename, 'application/json');
}

function importJson(onLoad) {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'application/json';
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { onLoad(JSON.parse(reader.result)); }
      catch { flash('Fichier illisible'); }
    };
    reader.readAsText(file);
  };
  input.click();
}

/* ------------------------------------------------------------------ */
/* Événements                                                          */
/* ------------------------------------------------------------------ */

function applyBinding(el) {
  const path = el.dataset.bind;
  if (!path) return false;
  let value;
  if (el.type === 'checkbox') value = el.checked;
  else if (el.type === 'number') value = el.value === '' ? null : Number(el.value);
  else value = el.value;

  // Le choix d'une ville recharge le gisement et les températures du site.
  if (path === 'site.siteId') {
    setPath(state.project, path, value);
    const s = findSite(value);
    if (s) {
      // Changer de ville recharge le gisement, les températures de
      // dimensionnement et le facteur d'émission du réseau.
      Object.assign(state.project.site, {
        lat: s.lat, lon: s.lon, tMin: s.tMin, tMaxAmb: s.tMaxAmb, ghi: null, ta: null,
      });
      state.project.economics.gridCarbon = GRID_CARBON[s.country] ?? state.project.economics.gridCarbon;
    }
    return false;
  }
  setPath(state.project, path, value);
  return false;
}

function wireEvents() {
  const root = document.body;

  root.addEventListener('input', (e) => {
    const el = e.target;
    if (!el.dataset?.bind) return;
    if (el.dataset.structural != null) return; // traité par « change »
    applyBinding(el);
    refreshOutputs();
  });

  root.addEventListener('change', (e) => {
    const el = e.target;
    if (el.id === 'project-select') { openProject(el.value); return; }
    if (el.dataset.action === 'lang') {
      state.prefs.lang = setLanguage(el.value);
      savePrefs(state.prefs); render(); return;
    }
    if (el.dataset.action === 'theme') {
      state.prefs.theme = el.value;
      document.documentElement.dataset.theme = el.value;
      savePrefs(state.prefs); render(); return;
    }
    if (el.dataset.action === 'logo') {
      const file = el.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => { state.project.branding.logoDataUrl = reader.result; render(); };
      reader.readAsDataURL(file);
      return;
    }
    if (!el.dataset?.bind) return;
    if (applyBinding(el)) return;
    render();
  });

  root.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-view]');
    if (nav) {
      state.view = nav.dataset.view;
      document.body.classList.remove('nav-open');
      render();
      return;
    }

    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'new') newProject();
    else if (action === 'save') saveCurrent();
    else if (action === 'print') window.print();
    else if (action === 'export') exportJson(state.project, `${state.project.meta.name || 'projet'}.solarys.json`);
    else if (action === 'exportAll') exportJson(loadProjects(), 'solarys-projets.json');
    else if (action === 'importAll') importJson((data) => {
      const list = Array.isArray(data) ? data : [data];
      list.forEach((p) => { p.id = crypto.randomUUID(); upsertProject(p); });
      state.projects = loadProjects();
      flash(`${list.length} projet(s)`);
      render();
    });
    else if (action === 'import') importJson((data) => {
      const p = Array.isArray(data) ? data[0] : data;
      p.id = crypto.randomUUID();
      state.projects = upsertProject(p);
      openProject(p.id);
    });
    else if (action === 'duplicate') {
      const copy = structuredClone(state.project);
      copy.id = crypto.randomUUID();
      copy.meta.name = `${copy.meta.name} (copie)`;
      state.projects = upsertProject(copy);
      openProject(copy.id);
    }
    else if (action === 'delete') {
      if (!confirm(`${t('action.delete')} « ${state.project.meta.name} » ?`)) return;
      state.projects = deleteProject(state.project.id);
      if (state.projects.length) openProject(state.projects[0].id);
      else newProject();
    }
    else if (action === 'downloadSheet' || action === 'downloadAllSheets') {
      const sheets = buildDossier(state.results, state.project,
        { pro: isProjectUnlocked(state.prefs, state.project.id) });
      const base = (state.project.meta.name || 'dossier').replace(/[^\w\-]+/g, '-');
      const wanted = action === 'downloadSheet' ? [sheets[Number(btn.dataset.index)]] : sheets;
      wanted.forEach((sh, i) => setTimeout(
        () => downloadSheet(sh.svg, `${base}-${sh.folio}-${sh.title.replace(/[^\w]+/g, '-')}.svg`),
        i * 250));
    }
    else if (action === 'unlockProject') {
      // Un crédit se dépense pour le projet courant, une seule fois.
      const suivant = unlockProject(state.prefs, state.project.id);
      if (!suivant) { flash(t('licence.noCredits')); return; }
      state.prefs = suivant;
      savePrefs(state.prefs);
      flash(t('licence.unlocked'));
      render();
    }
    else if (action === 'activateLicence') {
      const input = document.getElementById('licence-key');
      const key = normalise(input?.value);
      if (!isValidKey(key)) { flash(t('licence.invalid')); input?.focus(); return; }
      state.prefs.licence = key;
      // Une nouvelle clé repart d'un compteur vierge : les dossiers débloqués
      // avec la clé précédente ne consomment pas les crédits de celle-ci.
      state.prefs.unlockedProjects = [];
      savePrefs(state.prefs);
      flash(t(`licence.plan.${readKey(key).plan}`));
      render();
    }
    else if (action === 'removeLicence') {
      state.prefs.licence = null;
      state.prefs.unlockedProjects = [];
      savePrefs(state.prefs);
      render();
    }
    else if (action === 'addSurface') {
      const n = (state.project.surfaces ?? []).length + 1;
      state.project.surfaces = [...(state.project.surfaces ?? []),
        blankSurface({ name: `Surface ${n}` })];
      render();
    }
    else if (action === 'removeSurface') {
      state.project.surfaces.splice(Number(btn.dataset.index), 1);
      if (!state.project.surfaces.length) state.project.surfaces.push(blankSurface());
      render();
    }
    else if (action === 'addObstacle') {
      const sf = state.project.surfaces[Number(btn.dataset.surface)];
      if (!sf) return;
      // Le nouvel obstacle est posé au centre de la surface, où il se voit.
      const kind = OBSTACLE_KINDS[0];
      sf.obstacles = [...(sf.obstacles ?? []), blankObstacle({
        name: t(`obstacle.kind.${kind.id}`), kind: kind.id,
        x: Math.max(0.5, (Number(sf.width) || 12) / 2 - 0.5),
        y: Math.max(0.5, (Number(sf.depth) || 8) / 2 - 0.5),
        clearance: kind.clearance, elevation: kind.elevation,
      })];
      render();
    }
    else if (action === 'removeObstacle') {
      const sf = state.project.surfaces[Number(btn.dataset.surface)];
      sf?.obstacles?.splice(Number(btn.dataset.index), 1);
      render();
    }
    else if (action === 'downloadPlan') {
      const i = Number(btn.dataset.index);
      const lay = state.results?.field?.layouts?.[i];
      if (!lay?.resolved) return;
      const nom = (state.project.surfaces[i]?.name || 'plan').replace(/[^\w]+/g, '-');
      downloadSheet(planView({ surface: lay.resolved, layout: lay }), `${nom}-calepinage.svg`);
    }
    else if (action === 'addRevision') {
      const revs = state.project.dossier.revisions;
      revs.push({
        rev: String(revs.length + 1).padStart(2, '0'),
        date: new Date().toISOString().slice(0, 10),
        designation: '',
      });
      render();
    }
    else if (action === 'removeRevision') {
      state.project.dossier.revisions.splice(Number(btn.dataset.index), 1);
      render();
    }
    else if (action === 'addAppliance') {
      state.project.load.appliances.push({ name: '', power: 100, hours: 4, qty: 1 });
      render();
    }
    else if (action === 'removeAppliance') {
      state.project.load.appliances.splice(Number(btn.dataset.index), 1);
      render();
    }
    else if (action === 'toggleNav') {
      document.body.classList.toggle('nav-open');
    }
    else if (action === 'menu') {
      btn.parentElement.classList.toggle('open');
    }
  });

  root.addEventListener('click', (e) => {
    if (!e.target.closest('.menu')) {
      document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open'));
    }
  }, true);

  // Enregistrement au clavier.
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveCurrent(); }
  });

  // Sauvegarde automatique à la fermeture de l'onglet.
  window.addEventListener('beforeunload', () => {
    if (state.project) upsertProject(structuredClone(state.project));
  });
}

/* ------------------------------------------------------------------ */

function start() {
  setLanguage(state.prefs.lang ?? 'fr');
  document.documentElement.dataset.theme = state.prefs.theme ?? 'dark';
  state.projects = loadProjects();
  if (!state.projects.length) {
    const p = blankProject();
    state.projects = upsertProject(p);
  }
  const wanted = state.projects.find((p) => p.id === state.prefs.lastProjectId);
  state.project = structuredClone(wanted ?? state.projects[0]);
  wireEvents();
  render();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* hors ligne indisponible */ });
  }
}

document.addEventListener('DOMContentLoaded', start);
