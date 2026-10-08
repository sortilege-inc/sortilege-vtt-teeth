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
  const ISO = { size: 120, ox: 0, oy: 0, iso: true, ratio: 0.577 };   // a 2:1.73 diamond lattice for the isometric engravings (30°)
  const MODULE_MAPS = {
    cotillion: [
      // the middle floor first: guests arrive there (the entrance hall, the ballroom)
      { id: 'manor-middle', name: 'Middle Floor', scene: 'The Manor Itself', image: 'assets/maps/cotillion/manor-middle.webp', w: 2160, h: 1760, grid: GRID, legend: { entity: FLOORPLAN, prop: 'Middle Floor' } },
      { id: 'manor-lower', name: 'Lower Floor', scene: 'The Manor Itself', image: 'assets/maps/cotillion/manor-lower.webp', w: 2160, h: 1760, grid: GRID, legend: { entity: FLOORPLAN, prop: 'Lower Floor' } },
      { id: 'manor-upper', name: 'Upper Floor', scene: 'The Manor Itself', image: 'assets/maps/cotillion/manor-upper.webp', w: 2160, h: 1440, grid: GRID, legend: { entity: FLOORPLAN, prop: 'Upper Floor' } },
      { id: 'manor-roof', name: 'Roof & Attic', scene: 'The Manor Itself', image: 'assets/maps/cotillion/manor-roof.webp', w: 2160, h: 1440, grid: GRID, legend: { entity: FLOORPLAN, prop: 'Roof & Attic' } },
      { id: 'grounds', name: 'The grounds', scene: 'The Grounds and Gardens', image: 'assets/maps/cotillion/grounds-colour.webp', w: 2400, h: 3055, grid: GRID },
    ],
    // Night of the Hogmen: isometric engravings made for the VTT (owner, 2026-10-07), one per place;
    // `scene` may list several scenes that happen in one place (the bridge), which then share a map.
    hogmen: [
      { id: 'hog-setup', name: 'The road to Gatlock', scene: ['The Set-Up & The Scenario', 'Who Are The Passengers?'], image: 'assets/maps/hogmen/setup.webp', w: 1072, h: 769, grid: GRID },
      { id: 'hog-bridge', name: 'The bridge', scene: ['Calamity Strikes', 'What Do They Take?', 'The True Peril Is Revealed'], image: 'assets/maps/hogmen/bridge.webp', w: 2752, h: 1536, grid: ISO },
      { id: 'hog-valley', name: 'The valley', scene: ['A Distant Hope Is Spied', 'Journey To The Lone Church'], image: 'assets/maps/hogmen/valley.webp', w: 1696, h: 2528, grid: ISO },
      { id: 'hog-mill', name: 'The Old Mill', scene: 'The Old Mill', image: 'assets/maps/hogmen/old-mill.webp', w: 1792, h: 2400, grid: ISO },
      { id: 'hog-choke', name: 'The Choke Point', scene: 'The Choke Point', image: 'assets/maps/hogmen/choke-point.webp', w: 1792, h: 2400, grid: ISO },
      { id: 'hog-tree', name: 'The lone tree', scene: 'The Traveller In A Tree', image: 'assets/maps/hogmen/lone-tree.webp', w: 2048, h: 2048, grid: ISO },
      { id: 'hog-wagon', name: 'The wagon', scene: 'The Imperiled Wagon', image: 'assets/maps/hogmen/imperilled-wagon.webp', w: 1792, h: 2400, grid: ISO },
      { id: 'hog-farm', name: 'The Farmhouse', scene: 'The Farmhouse', image: 'assets/maps/hogmen/farmhouse.webp', w: 1792, h: 2400, grid: ISO },
      { id: 'hog-bog', name: 'The Bog', scene: 'The Bog', image: 'assets/maps/hogmen/bog.webp', w: 1696, h: 2528, grid: ISO },
      { id: 'hog-copse', name: 'The Tangled Copse', scene: 'The Tangled Copse', image: 'assets/maps/hogmen/tangled-copse.webp', w: 1792, h: 2400, grid: ISO },
      { id: 'hog-church', name: 'The Lone Church', scene: 'Brace For The Hogstorm!', image: 'assets/maps/hogmen/lone-church.webp', w: 2048, h: 2048, grid: ISO },
    ],
  };

  // Art for the people: a TEMPLATE's portrait (by its name) is its token and its sheet's face.
  // Anyone without a portrait wears the generic token; the Hogman is the horde's.
  const PORTRAITS = {
    'Dr Nabeel Uddin': 'assets/art/hogmen/nabeel-uddin.webp',
    'Lady Catherina de Grope': 'assets/art/hogmen/catherina-de-grope.webp',
    'Madam Blanche Wosenbury': 'assets/art/hogmen/blanche-wosenbury.webp',
    'Mr Laconicus Strong': 'assets/art/hogmen/laconicus-strong.webp',
    'Mr Theodore Orlingstet': 'assets/art/hogmen/theodore-orlingstet.webp',
    'Mr Trode Wickle': 'assets/art/hogmen/trode-wickle.webp',
    'Ms Dandridge Sloopville-Jones': 'assets/art/hogmen/dandridge-sloopville-jones.webp',
    'Reverend Matthew Eel': 'assets/art/hogmen/matthew-eel.webp',
    'Sir Shartle Pudget': 'assets/art/hogmen/shartle-pudget.webp',
  };
  const NPC_TOKEN = 'assets/tokens/npc.svg';
  const CREATURE_TOKENS = [
    { label: 'Hogman', kind: 'foe', image: 'assets/tokens/hogman.webp' },
  ];

  // The figures a scene puts on the table, as the scene's own text names them. The corpus
  // links no people to the one-shots' scenes (their refs are rules terms), so this is the
  // system's list, by module and scene name; a Hogman wears the horde's token, a person the
  // generic one, an animal its initials. The table offers them first, under "In this scene".
  const SCENE_FIGURES = {
    hogmen: {
      'The Set-Up & The Scenario': ['The coachman at the reins', 'The second coachman', 'The horses'],
      'Who Are The Passengers?': ['The coachman at the reins', 'The second coachman', 'The horses'],
      'Calamity Strikes': ['The standing coachman', 'The stricken coachman', 'The panicked horse', 'Hogman'],
      'What Do They Take?': ['The standing coachman', 'The stricken coachman', 'The panicked horse', 'Hogman'],
      'The True Peril Is Revealed': ['The standing coachman', 'The stricken coachman', 'The surviving horse', 'Hogman', 'Pigs'],
      'The Old Mill': ['The lone hogman', 'The dead marksman', 'Pigs'],
      'The Choke Point': ['Soldier at the barricade', 'Second soldier at the barricade'],
      'The Traveller In A Tree': ['The traveller in the tree', 'Raging pigs'],
      'The Imperiled Wagon': ['The husband', 'The wife', 'The ox', 'The caged man'],
      'The Farmhouse': ['The farmer', 'The farmer’s wife'],
      'The Bog': ['The giant worm', 'The donkey'],
      'The Tangled Copse': ['Pigs gnawing the tree', 'Pigs in the undergrowth'],
      'Brace For The Hogstorm!': ['Hogman', 'Pigs', 'The farmer', 'The traveller', 'The soldiers'],
    },
    cotillion: {
      'The Manor Itself': ['The Staff', 'Gorland “Red” Dummond'],
      'The Grounds and Gardens': ['The hermit', 'Ghosts of the maze', 'Toxic toads'],
      'Let the Festivities Commence': ['The Chaperone', 'Lord Kirklan Kelmorton', 'Wilfrum Kelmorton', 'Captain Branforth Kelmorton', 'Trothamere Kelmorton', 'Darren Kelmorton', 'The Other Guests'],
      'The Pleasures of the Ball': ['The Other Guests', 'The Staff'],
      'The Secrets Revealed': ['Wilfrum Kelmorton', 'Captain Branforth Kelmorton', 'Trothamere Kelmorton', 'Darren Kelmorton', 'The Staff', 'Gorland “Red” Dummond'],
      'How to Portion out the Secrets': ['Wilfrum Kelmorton', 'Captain Branforth Kelmorton', 'Trothamere Kelmorton', 'Darren Kelmorton'],
      'The Arrival of the Bailiff': ['The Bailiff', 'The Other Guests'],
      'The Final Mirror': ['A mirror-self'],
      'The Potential for Truly Hideous Chaos': ['The Regiment', 'Gorland “Red” Dummond', 'Wilfrum Kelmorton', 'Captain Branforth Kelmorton', 'Trothamere Kelmorton', 'Darren Kelmorton', 'The Staff', 'The Other Guests'],
      'The Blood Shrine': ['Lord Kirklan Kelmorton', 'Lady Kelmorton', 'A dead servant'],
      'Lady Kelmorton': ['Lady Kelmorton'],
      'Lord Kelmorton': ['Lord Kirklan Kelmorton', 'Lady Kelmorton'],
    },
    stranger: {
      'The First Encounter': ['The Abomination'],
      'The First Preparation Phase': ['Villagers'],
      'The Abomination is in the Village!': ['The Abomination', 'Villagers', 'The village pigs'],
      'The First Aftermath Phase': ['Villagers'],
      'A Stranger Comes to the Village': ['The Stranger', 'Villagers'],
      'The Stranger': ['The Stranger'],
      'The Stranger’s Request': ['The Stranger', 'The village elders'],
      'An Extra Incentive': ['The Stranger', 'Villagers'],
      'Information Gathering': ['The Stranger', 'The Hermit of Hogfoot', 'Mrs Urguin', 'Sable, the bog witch'],
      'Vengeance!': ['The Abomination'],
      'Betrayal!': ['The Stranger', 'The Abomination'],
      'Rescue!': ['Ivo Mehmed', 'Agents of the Crown', 'Mr Bagbury', 'Bagbury’s armed men'],
      'Death! & Other Friends': ['The Stranger', 'The Stranger’s friends'],
    },
  };
  const BEASTS = /\b(horse|horses|pigs?|worm|ox|donkey|toads?|abomination|ghosts?|mirror-self)\b/i;
  function figureToken(label, moduleId) {
    const member = moduleId ? cast(moduleId).find((e) => e.name === label) : null;   // a cast member: link it, wear its portrait
    if (member) return { label, kind: 'cast', ref: member.id, image: portrait(member.id) || NPC_TOKEN };
    if (/hogman/i.test(label)) return { label, kind: 'foe', image: 'assets/tokens/hogman.webp' };
    if (BEASTS.test(label)) return { label, kind: 'foe' };
    return { label, kind: 'cast', image: NPC_TOKEN };
  }
  function sceneFigures(sceneId) {
    for (const moduleId of modules()) {
      const sc = D.scene(moduleId, sceneId);
      const list = sc && SCENE_FIGURES[moduleId] && SCENE_FIGURES[moduleId][sc.name];
      if (list) return list.map((l) => figureToken(l, moduleId));
    }
    return [];
  }

  // Put figures on a scene's map from the GM's page (the Scene panel): the map state is made
  // the way the table makes it, tokens staged across the top-centre a cell apart. A party
  // member already on the map is not added twice.
  function blankMapFor(mapId) {
    const d = mapDef(mapId);
    const m = { image: null, w: 2400, h: 1600, grid: { size: 80, ox: 0, oy: 0, show: true, snap: true }, tokens: [], effects: [], fog: { enabled: false, revealed: [] } };
    if (d) {
      m.image = d.image;
      m.w = d.w;
      m.h = d.h;
      Object.assign(m.grid, d.grid || {});
    }
    return m;
  }
  function placeTokens(sceneId, items) {
    const mapId = defaultMapId(sceneId);
    const m = S().maps && S().maps[mapId] ? JSON.parse(JSON.stringify(S().maps[mapId])) : blankMapFor(mapId);
    m.tokens = m.tokens || [];
    let added = 0;
    items.forEach((it) => {
      if (it.owner && m.tokens.some((t) => t.owner === it.owner)) return;
      const i = m.tokens.length;
      const g = m.grid;
      const c = g.size;
      const ratio = g.ratio || 0.5;
      const px = m.w / 2 + ((i % 10) - 4.5) * c;
      const py = c * (g.iso ? ratio : 1) * (1 + Math.floor(i / 10) * 1.2);
      let cx;
      let cy;
      if (g.iso) {
        const u = (px - g.ox) / (c / 2);
        const v = (py - g.oy) / (c * ratio / 2);
        cx = (u + v) / 2;
        cy = (v - u) / 2;
      } else {
        cx = (px - g.ox) / c;
        cy = (py - g.oy) / c;
      }
      m.tokens.push(Object.assign({ x: Math.round(cx - 0.5), y: Math.round(cy - 0.5), size: 1, hidden: false }, it, { id: State.genId('tk') }));
      added += 1;
    });
    if (added) State.commit('setMapState', [mapId, m]);
    return { mapId, added };
  }

  function portrait(entityId) {
    const e = D.entity(entityId);
    return (e && PORTRAITS[e.name]) || null;
  }
  // Other images in the repo the GM may put on any map ("maps in the repo…").
  const EXTRA_ASSETS = [
    { label: 'Blood Cotillion — the grounds (line)', image: 'assets/maps/cotillion/grounds.webp' },
  ];

  const modules = () => (S().campaign.modules || []).filter((id) => D.arc(id));

  // The books a module plays with: a one-shot rides on the core and the one-shots' shared types;
  // a standalone game is itself.
  function booksFor(moduleId) {
    const b = D.book(moduleId);
    return b && b.kind === 'one-shot' ? ['core', 'oneshot-shared', moduleId] : [moduleId];
  }

  // The books the campaign plays with: its "Books for reference" plus, always, the books of every
  // module in play — so a module's playbooks, clocks and injury levels are there the moment the
  // module is, whichever control put it in play.
  function playBooks() {
    const out = (S().campaign.books || []).slice();
    modules().forEach((m) => booksFor(m).forEach((id) => out.indexOf(id) === -1 && out.push(id)));
    return out.length ? out : D.books().map((b) => b.id);
  }

  // A module's scenes in the GM's arrangement (state.order.scenes, set by dragging in the
  // tracker), else the book's: [{ phase, scene }]. A scene the arrangement does not name keeps
  // the book's phase, after the arranged ones; a phase the arrangement does not name comes
  // where the book puts it.
  function pages(moduleId) {
    const src = D.pages(moduleId);
    const arranged = ((S().order || {}).scenes || {})[moduleId];
    if (!arranged || !arranged.length) return src;
    const byId = {};
    src.forEach((p) => (byId[p.scene.id] = p));
    const placed = new Set();
    const groups = arranged.map((g) => ({ name: g.name, pages: (g.scenes || []).filter((id) => byId[id] && !placed.has(id)).map((id) => (placed.add(id), { phase: g.name, scene: byId[id].scene })) }));
    src.forEach((p) => {
      if (placed.has(p.scene.id)) return;
      let g = groups.find((x) => x.name === p.phase);
      if (!g) {
        g = { name: p.phase, pages: [] };
        // where the book puts this phase: after the last group whose phase the book lists earlier
        const bookPhases = [];
        src.forEach((q) => bookPhases.indexOf(q.phase) === -1 && bookPhases.push(q.phase));
        const before = groups.filter((x) => bookPhases.indexOf(x.name) !== -1 && bookPhases.indexOf(x.name) < bookPhases.indexOf(p.phase));
        groups.splice(before.length ? groups.indexOf(before[before.length - 1]) + 1 : groups.length, 0, g);
      }
      g.pages.push(p);
    });
    return groups.flatMap((g) => g.pages);
  }

  // A module's cast in the GM's order (state.order.cast), unlisted ones after, as the book has them.
  function cast(moduleId) {
    const src = D.cast(moduleId);
    const ids = ((S().order || {}).cast || {})[moduleId];
    if (!ids || !ids.length) return src;
    const rank = {};
    ids.forEach((id, i) => (rank[id] = i));
    return src.map((e, i) => ({ e, k: rank[e.id] != null ? rank[e.id] : ids.length + i })).sort((a, b) => a.k - b.k).map((x) => x.e);
  }

  function scenes() {
    const out = [];
    modules().forEach((moduleId) => pages(moduleId).forEach((p) => out.push({ id: p.scene.id, name: p.scene.name, moduleId })));
    return out;
  }

  function currentSceneId() {
    const m = modules()[0];
    if (!m) return null;
    const cur = (S().current || {})[m];
    const pg = pages(m);
    return (pg.find((p) => p.scene.id === cur) || pg[0] || { scene: {} }).scene.id || null;
  }

  // The shipped maps in play, in scene order: [{ id, name, sceneId, moduleId, image, w, h, grid, legend }]
  function maps() {
    const out = [];
    modules().forEach((moduleId) => {
      const pg = D.pages(moduleId);
      (MODULE_MAPS[moduleId] || []).forEach((d) => {
        const names = Array.isArray(d.scene) ? d.scene : [d.scene];
        const pages = names.map((n) => pg.find((p) => p.scene.name === n)).filter(Boolean);
        if (pages.length) out.push(Object.assign({}, d, { scene: names[0], sceneId: pages[0].scene.id, sceneIds: pages.map((p) => p.scene.id), moduleId }));
      });
    });
    return out;
  }

  function mapDef(mapId) {
    return maps().find((m) => m.id === mapId) || null;
  }

  // The map a scene opens on: its first shipped map, else the scene itself as a blank map.
  function defaultMapId(sceneId) {
    const first = maps().find((m) => m.sceneIds.indexOf(sceneId) !== -1);
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
  function tokenSources(sceneId) {
    const groups = [];
    const figures = sceneId ? sceneFigures(sceneId) : [];
    if (figures.length) groups.push({ label: 'In this scene', items: figures });
    const party = (S().party || []).map((m) => ({ id: 'tk-' + m.id, label: m.name, kind: 'party', owner: m.id, ref: m.id, image: portrait(m.templateId) }));
    if (party.length) groups.push({ label: 'Party', items: party });
    modules().forEach((moduleId) => {
      const people = cast(moduleId).map((e) => ({ label: e.name, kind: 'cast', ref: e.id, image: portrait(e.id) || NPC_TOKEN }));
      if (people.length) groups.push({ label: (D.arc(moduleId) || {}).name || moduleId, items: people });
    });
    groups.push({ label: 'Creatures', items: CREATURE_TOKENS.map((c) => Object.assign({}, c)) });
    groups.push({ label: 'Anyone else', items: [{ label: 'Someone (name them)', kind: 'cast', image: NPC_TOKEN, named: true }] });
    return groups;
  }

  const COLORS = { party: '#4f6b3a', cast: '#8f1d22', foe: '#1a1613', marker: '#6b6154' };
  function tokenColor(t) {
    return COLORS[t.kind] || COLORS.marker;
  }

  // A party token's word: its tracks, as the sheet keeps them ("Stress 3/8 · Suspicion 2/6").
  function tokenStatus(t) {
    if (t.kind !== 'party') return null;
    const m = (S().party || []).find((x) => x.id === t.owner);
    if (!m) return null;
    const tracks = m.live.tracks || {};
    const conds = window.TeethSheet && window.TeethSheet.conditions ? window.TeethSheet.conditions(m) : [];
    const text = Object.keys(tracks).map((k) => `${k} ${tracks[k]}`).concat(conds).join(' · ');
    return { text, pips: [], cls: conds.length ? 'afflicted' : '' };
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
  function rollLine(entry) {          // the player's page draws the table's rolls with the system's line
    return window.TeethSheet.rollLine(entry);
  }
  function memberSubtitle(m) {
    const t = D.entity(m.templateId);
    return t ? t.name + (t.type ? ' · ' + t.type : '') : '';
  }

  return { scenes, pages, cast, booksFor, playBooks, portrait, sceneFigures, placeTokens, currentSceneId, maps, mapDef, defaultMapId, legend, mapAssets, tokenSources, tokenColor, tokenStatus, selectToken, tokenMenu, liveSheet, readCharacter, downloadCharacter, rollLine, memberSubtitle, MODULE_MAPS };
})();
