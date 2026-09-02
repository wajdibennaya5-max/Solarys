/**
 * La persistance des préférences porte tout le parcours d'achat : une clé
 * déposée par la page de remerciement doit être relue par l'application.
 * Node n'a pas de `localStorage` — on en pose un, y compris dans sa version
 * qui refuse d'écrire (navigation privée).
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

function poserStockage({ refuse = false } = {}) {
  const boite = new Map();
  globalThis.localStorage = {
    getItem: (k) => (boite.has(k) ? boite.get(k) : null),
    setItem: (k, v) => {
      if (refuse) throw new Error('QuotaExceededError');
      boite.set(k, String(v));
    },
    removeItem: (k) => boite.delete(k),
  };
  return boite;
}

// Le module lit `localStorage` à l'appel, non à l'import : on peut donc le
// charger une fois et changer le stockage sous ses pieds.
poserStockage();
const { loadPrefs, savePrefs, storeLicence, defaultPrefs } = await import('../js/prefs.js');

let boite;
beforeEach(() => { boite = poserStockage(); });

test('sans rien en mémoire, on obtient les valeurs par défaut', () => {
  assert.deepEqual(loadPrefs(), defaultPrefs());
});

test('les valeurs par défaut sont neuves à chaque appel', () => {
  // Sinon deux projets partageraient le même tableau de dossiers débloqués.
  const a = defaultPrefs();
  a.unlockedProjects.push('x');
  assert.deepEqual(defaultPrefs().unlockedProjects, []);
});

test('ce qui est écrit est relu à l\'identique', () => {
  const p = { ...defaultPrefs(), lang: 'ar', licence: 'SLRS-P00A-BCDE-1234' };
  assert.equal(savePrefs(p), true);
  assert.deepEqual(loadPrefs(), p);
});

test('une préférence absente du stockage reprend sa valeur par défaut', () => {
  // Cas réel : un utilisateur de la version précédente, dont les préférences
  // enregistrées ne contiennent pas encore `unlockedProjects`.
  boite.set('solarys.prefs.v1', JSON.stringify({ lang: 'en' }));
  const lu = loadPrefs();
  assert.equal(lu.lang, 'en');
  assert.deepEqual(lu.unlockedProjects, []);
  assert.equal(lu.licence, null);
});

test('un contenu illisible ne fait pas tomber l\'application', () => {
  boite.set('solarys.prefs.v1', '{ceci n\'est pas du json');
  assert.deepEqual(loadPrefs(), defaultPrefs());
});

test('storeLicence dépose la clé là où l\'application la lit', () => {
  assert.equal(storeLicence('SLRS-P00A-BCDE-1234'), true);
  assert.equal(loadPrefs().licence, 'SLRS-P00A-BCDE-1234');
});

test('storeLicence conserve les préférences déjà en place', () => {
  savePrefs({ ...defaultPrefs(), lang: 'en', unlockedProjects: ['projet-7'] });
  storeLicence('SLRS-P00A-BCDE-1234');
  const lu = loadPrefs();
  assert.equal(lu.lang, 'en');
  assert.deepEqual(lu.unlockedProjects, ['projet-7']);
});

test('un stockage qui refuse est signalé, non masqué', () => {
  poserStockage({ refuse: true });
  assert.equal(savePrefs(defaultPrefs()), false);
  assert.equal(storeLicence('SLRS-P00A-BCDE-1234'), false);
});
