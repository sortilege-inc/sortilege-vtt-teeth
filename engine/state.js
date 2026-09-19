// engine/state.js — one campaign's state in this browser: one localStorage key per
// campaign, every shared change committed as an op (engine/ops.js), and the
// campaign pack (export / import) that makes the campaign an instance outside the
// repo (PLAN.md, goal 3).
//
// State shape (everything under SHARED_KEYS travels to players in a session):
//   campaign  { id, name, system, modules:[bookIds], books:[bookIds] }   what is in play
//   current   { [moduleId]: sceneId }                                   the GM's scene
//   progress  { [moduleId]: { [sceneId]: { done, notes } } }             notes are GM-only
//   clues     { [moduleId]: { "sceneId::clueName": revealed } }
//   party     [ { id, templateId, name, live:{…}, notes, playerNotes } ]
//   maps      { [mapId]: { image, w, h, grid, fog, tokens, effects } }   a shipped map's id, or a scene id
//   table     { map: mapId }                                             what the table is showing
//   clocks    [ { id, name, segments, filled, sceneId, visible } ]
//   log       [ { at, kind, text, memberId } ]
//   ui        { … }   per-browser only, never shared, never exported
window.VttState = (function () {
  const Ops = window.VttOps;
  const Bus = window.VttBus;
  const CFG = window.VttConfig || {};
  const PREFIX = (CFG.storagePrefix || 'sortilege-vtt') + ':';
  const LIST_KEY = PREFIX + 'campaigns';
  const PACK_KIND = 'sortilege-vtt-campaign';
  const PACK_VERSION = 1;

  function defaults(id, name) {
    const d = (id === 'default' && CFG.defaultCampaign) || {};
    return {
      campaign: { id, name: name || d.name || id, system: CFG.system || 'teeth', modules: (d.modules || []).slice(), books: (d.books || []).slice() },
      current: {},
      progress: {},
      clues: {},
      party: [],
      maps: {},
      table: {},
      clocks: [],
      log: [],
      ui: {},
    };
  }

  // ── which campaign this browser is on ──────────────────────────────
  function listCampaigns() {
    try {
      return JSON.parse(localStorage.getItem(LIST_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function saveList(list) {
    try {
      localStorage.setItem(LIST_KEY, JSON.stringify(list));
    } catch (e) {
      /* no storage */
    }
  }

  function activeId() {
    const q = new URLSearchParams(location.search).get('campaign');
    if (q) return q;
    const list = listCampaigns();
    const active = list.find((c) => c.active);
    return active ? active.id : list.length ? list[0].id : 'default';
  }

  function genId(prefix) {
    return (prefix || 'id') + '-' + Math.random().toString(36).slice(2, 10);
  }

  let id = activeId();
  let state = load(id);

  function key(cid) {
    return PREFIX + 'campaign:' + cid;
  }

  function load(cid) {
    try {
      const raw = localStorage.getItem(key(cid));
      if (raw) {
        const parsed = JSON.parse(raw);
        return Object.assign(defaults(cid), parsed);
      }
    } catch (e) {
      /* fall through */
    }
    return defaults(cid);
  }

  // Every save tells the other windows what changed — the op itself, or the whole
  // document — never just "re-read storage": a BroadcastChannel message can reach a
  // sibling window before the localStorage write is visible there, and a stale
  // re-read would be written back over the change on that window's next save.
  function save(change) {
    try {
      localStorage.setItem(key(id), JSON.stringify(state));
    } catch (e) {
      /* private window */
    }
    register(state.campaign);
    if (Bus) Bus.emit('state:changed', Object.assign({ at: Date.now(), campaign: id }, change || { doc: snapshot() }));
  }

  function snapshot() {
    const out = {};
    Object.keys(state).forEach((k) => {
      if (k !== 'ui') out[k] = state[k];
    });
    return out;
  }

  function register(campaign) {
    const list = listCampaigns();
    let row = list.find((c) => c.id === campaign.id);
    if (!row) {
      row = { id: campaign.id };
      list.push(row);
    }
    row.name = campaign.name;
    row.modules = campaign.modules;
    list.forEach((c) => (c.active = c.id === id));
    saveList(list);
  }

  function reload() {
    const fresh = load(id);
    Object.keys(state).forEach((k) => delete state[k]);
    Object.assign(state, fresh);
  }

  if (Bus) {
    Bus.on('state:changed', (payload, meta) => {
      if (!(meta && meta.remote) || !payload || payload.campaign !== id) return;
      if (payload.op) {
        try {
          Ops.apply(state, payload.op.name, payload.op.args);   // deterministic: same op, same result
        } catch (e) {
          reload();
        }
      } else if (payload.doc) {
        Object.keys(state).forEach((k) => {
          if (k !== 'ui') delete state[k];
        });
        Object.assign(state, payload.doc);
      } else reload();
    });
  }

  // ── ops ────────────────────────────────────────────────────────────
  function commit(name, args) {
    Ops.apply(state, name, args);
    save({ op: { name, args } });
    if (Bus) Bus.emit('op', { name, args, at: Date.now() });
  }

  function applyRemote(name, args) {
    Ops.apply(state, name, args);
    save({ op: { name, args } });
    if (Bus) Bus.emit('state:remote', { name, args }, { local: true });
  }

  function replaceShared(doc) {
    Ops.SHARED_KEYS.forEach((k) => {
      if (doc[k] != null) state[k] = doc[k];
    });
    save();
  }

  // ── per-browser ui prefs (never shared) ────────────────────────────
  function ui(k, v) {
    if (v === undefined) return (state.ui || {})[k];
    if (!state.ui) state.ui = {};
    state.ui[k] = v;
    save();
    return v;
  }

  // ── campaigns ──────────────────────────────────────────────────────
  function switchTo(cid) {
    id = cid;
    reload();
    register(state.campaign);
    save();
  }

  function create(name, patch) {
    const cid = genId('c');
    id = cid;
    state = Object.assign(defaults(cid, name), patch || {});
    state.campaign.id = cid;
    state.campaign.name = name;
    save();
    return cid;
  }

  function remove(cid) {
    try {
      localStorage.removeItem(key(cid));
    } catch (e) {
      /* ignore */
    }
    saveList(listCampaigns().filter((c) => c.id !== cid));
    if (cid === id) {
      const list = listCampaigns();
      switchTo(list.length ? list[0].id : 'default');
    }
  }

  // ── the campaign pack ──────────────────────────────────────────────
  function exportPack() {
    const out = { kind: PACK_KIND, version: PACK_VERSION, exportedAt: new Date().toISOString() };
    Object.keys(state).forEach((k) => {
      if (k !== 'ui') out[k] = state[k];
    });
    return out;
  }

  function importPack(pack, opts) {
    if (!pack || pack.kind !== PACK_KIND) throw new Error('Not a campaign pack (kind ' + (pack && pack.kind) + ').');
    if (pack.version > PACK_VERSION) throw new Error('This pack was saved by a newer build (version ' + pack.version + ').');
    const cid = (opts && opts.asNew) ? genId('c') : pack.campaign && pack.campaign.id ? pack.campaign.id : genId('c');
    id = cid;
    state = defaults(cid, pack.campaign && pack.campaign.name);
    Object.keys(pack).forEach((k) => {
      if (['kind', 'version', 'exportedAt', 'ui'].indexOf(k) === -1) state[k] = pack[k];
    });
    state.campaign = Object.assign(state.campaign, pack.campaign || {}, { id: cid });
    save();
    return cid;
  }

  function downloadPack(filename) {
    const pack = exportPack();
    const blob = new Blob([JSON.stringify(pack, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const stamp = pack.exportedAt.slice(0, 19).replace(/[:T]/g, '-');
    a.download = filename || `${(state.campaign.name || 'campaign').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 0);
  }

  return {
    get state() { return state; },
    get id() { return id; },
    commit, applyRemote, replaceShared, save, reload, ui, genId,
    listCampaigns, switchTo, create, remove,
    exportPack, importPack, downloadPack, PACK_KIND, PACK_VERSION,
  };
})();
