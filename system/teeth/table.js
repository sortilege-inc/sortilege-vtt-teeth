// system/teeth/table.js — what the TEETH system tells the table (engine/vtt.js):
// which scenes are in play, which map a scene ships with, what can be a token and
// what a token's state reads as. The engine never asks the corpus directly.
window.VttSystem = (function () {
  const D = window.TeethData;
  const State = window.VttState;
  const S = () => State.state;

  // Maps the owner has put in the repo, by module and scene name (assets/maps/…).
  // A scene not listed here starts as a bare grid; the GM can set any image.
  const MODULE_MAPS = {
    cotillion: {
      'The Manor Itself': { image: 'assets/maps/cotillion/buckleridge-manor.webp', w: 2400, h: 3055, grid: { size: 80, ox: 0, oy: 0 } },
      'The Grounds and Gardens': { image: 'assets/maps/cotillion/grounds-colour.webp', w: 2400, h: 3055, grid: { size: 80, ox: 0, oy: 0 } },
    },
  };
  const MAP_ASSETS = [
    { label: 'Blood Cotillion — Buckleridge Manor (floor plans)', image: 'assets/maps/cotillion/buckleridge-manor.webp' },
    { label: 'Blood Cotillion — the grounds (colour)', image: 'assets/maps/cotillion/grounds-colour.webp' },
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

  function defaultMap(sceneId) {
    for (const moduleId of modules()) {
      const sc = D.scene(moduleId, sceneId);
      const d = sc && MODULE_MAPS[moduleId] && MODULE_MAPS[moduleId][sc.name];
      if (d) return d;
    }
    return null;
  }

  function mapAssets() {
    return MAP_ASSETS;
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

  return { scenes, currentSceneId, defaultMap, mapAssets, tokenSources, tokenColor, tokenStatus, selectToken, tokenMenu, MODULE_MAPS };
})();
