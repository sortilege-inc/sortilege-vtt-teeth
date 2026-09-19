// system/teeth/table.js — what the TEETH system tells the table (engine/vtt.js):
// which scenes are in play, which maps a scene ships with (and their legends), what can be a token and
// what a token's state reads as. The engine never asks the corpus directly.
window.VttSystem = (function () {
  const D = window.TeethData;
  const State = window.VttState;
  const S = () => State.state;

  // Maps the owner has put in the repo (assets/maps/…), by module. A map belongs to
  // a scene (by the scene's name in the ARC); a scene may have several — the
  // floors of a building — and the first listed is the one the table opens on. A
  // scene with no map here starts as a bare grid the GM can set any image on.
  // `legend` names the corpus entity (and the property on it) whose verbatim lines
  // are the map's key; the GM pulls it up from the toolbar, it is never drawn on
  // the map and never reaches players.
  const FLOORPLAN = '#tq0SUlmYKEpVhob71TNsDu2';   // "A Floorplan of Buckleridge Manor" (Blood Cotillion)
  const GRID = { size: 80, ox: 0, oy: 0 };
  const MODULE_MAPS = {
    cotillion: [
      // the middle floor first: guests arrive there (the entrance hall, the ballroom)
      { id: 'manor-middle', name: 'Middle Floor', scene: 'The Manor Itself', image: 'assets/maps/cotillion/manor-middle.webp', w: 2160, h: 1760, grid: GRID, legend: { entity: FLOORPLAN, prop: 'Middle Floor' } },
      { id: 'manor-lower', name: 'Lower Floor', scene: 'The Manor Itself', image: 'assets/maps/cotillion/manor-lower.webp', w: 2160, h: 1760, grid: GRID, legend: { entity: FLOORPLAN, prop: 'Lower Floor' } },
      { id: 'manor-upper', name: 'Upper Floor', scene: 'The Manor Itself', image: 'assets/maps/cotillion/manor-upper.webp', w: 2160, h: 1440, grid: GRID, legend: { entity: FLOORPLAN, prop: 'Upper Floor' } },
      { id: 'manor-roof', name: 'Roof & Attic', scene: 'The Manor Itself', image: 'assets/maps/cotillion/manor-roof.webp', w: 2160, h: 1440, grid: GRID, legend: { entity: FLOORPLAN, prop: 'Roof & Attic' } },
      { id: 'grounds', name: 'The grounds', scene: 'The Grounds and Gardens', image: 'assets/maps/cotillion/grounds-colour.webp', w: 2400, h: 3055, grid: GRID },
    ],
  };
  // Other images in the repo the GM may put on any map ("maps in the repo…").
  const EXTRA_ASSETS = [
    { label: 'Blood Cotillion — the grounds (line)', image: 'assets/maps/cotillion/grounds.webp' },
  ];

  const modules = () => (S().campaign.modules || []).filter((id) => D.arc(id));

  function scenes() {
    const out = [];
    modules().forEach((moduleId) => D.pages(moduleId).forEach((p) => out.push({ id: p.scene.id, name: p.scene.name, moduleId })));
    return out;
  }

  function currentSceneId() {
    const m = modules()[0];
    if (!m) return null;
    const cur = (S().current || {})[m];
    const pages = D.pages(m);
    return (pages.find((p) => p.scene.id === cur) || pages[0] || { scene: {} }).scene.id || null;
  }

  // The shipped maps in play, in scene order: [{ id, name, sceneId, moduleId, image, w, h, grid, legend }]
  function maps() {
    const out = [];
    modules().forEach((moduleId) => {
      const pages = D.pages(moduleId);
      (MODULE_MAPS[moduleId] || []).forEach((d) => {
        const page = pages.find((p) => p.scene.name === d.scene);
        if (page) out.push(Object.assign({}, d, { sceneId: page.scene.id, moduleId }));
      });
    });
    return out;
  }

  function mapDef(mapId) {
    return maps().find((m) => m.id === mapId) || null;
  }

  // The map a scene opens on: its first shipped map, else the scene itself as a blank map.
  function defaultMapId(sceneId) {
    const first = maps().find((m) => m.sceneId === sceneId);
    return first ? first.id : sceneId;
  }

  // The map's key, verbatim from the corpus: { title, heading, lines } or null.
  function legend(mapId) {
    const d = mapDef(mapId);
    if (!d || !d.legend) return null;
    const e = D.entity(d.legend.entity);
    const prop = e && (e.props || []).find((p) => p.name === d.legend.prop);
    if (!prop) return null;
    const lines = (prop.items || []).map((it) => it.value).filter((v) => typeof v === 'string');
    return lines.length ? { title: e.name, heading: prop.name, lines } : null;
  }

  function mapAssets() {
    return maps().map((m) => ({ label: `${(D.arc(m.moduleId) || {}).name || m.moduleId} — ${m.scene} · ${m.name}`, image: m.image })).concat(EXTRA_ASSETS);
  }

  // Tokens: the party (owned by the member, so a player may move their own) and the
  // module's cast (Notables and the like); anything else is a marker.
  function tokenSources() {
    const groups = [];
    const party = (S().party || []).map((m) => ({ id: 'tk-' + m.id, label: m.name, kind: 'party', owner: m.id, ref: m.id }));
    if (party.length) groups.push({ label: 'Party', items: party });
    modules().forEach((moduleId) => {
      const cast = D.cast(moduleId).map((e) => ({ label: e.name, kind: 'cast', ref: e.id }));
      if (cast.length) groups.push({ label: (D.arc(moduleId) || {}).name || moduleId, items: cast });
    });
    return groups;
  }

  const COLORS = { party: '#4f6b3a', cast: '#8f1d22', marker: '#6b6154' };
  function tokenColor(t) {
    return COLORS[t.kind] || COLORS.marker;
  }

  // A party token's word: its tracks, as the sheet keeps them ("Stress 3/8 · Suspicion 2/6").
  function tokenStatus(t) {
    if (t.kind !== 'party') return null;
    const m = (S().party || []).find((x) => x.id === t.owner);
    if (!m) return null;
    const tracks = m.live.tracks || {};
    const text = Object.keys(tracks).map((k) => `${k} ${tracks[k]}`).join(' · ');
    return { text, pips: [] };
  }

  function selectToken(t) {
    if (t.kind === 'party') window.VttBus.emit('select', { kind: 'party', id: t.owner });
    else if (t.kind === 'cast' && t.ref) window.VttBus.emit('select', { kind: 'entity', id: t.ref });
  }

  function tokenMenu(t, done) {
    return null;
  }

  // the player's page
  function liveSheet(m, opts) {
    return window.TeethSheet.live(m, opts);
  }
  function readCharacter(obj, fileName) {
    return window.TeethSheet.readCharacter(obj, fileName);
  }
  function downloadCharacter(m) {
    return window.TeethSheet.downloadCharacter(m);
  }
  function memberSubtitle(m) {
    const t = D.entity(m.templateId);
    return t ? t.name + (t.type ? ' · ' + t.type : '') : '';
  }

  return { scenes, currentSceneId, maps, mapDef, defaultMapId, legend, mapAssets, tokenSources, tokenColor, tokenStatus, selectToken, tokenMenu, liveSheet, readCharacter, downloadCharacter, memberSubtitle, MODULE_MAPS };
})();
