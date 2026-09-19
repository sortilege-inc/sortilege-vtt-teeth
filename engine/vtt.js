// engine/vtt.js — the table: a map with a grid, tokens, effects, fog and pings, in
// its own window (vtt.html). System-agnostic: a token is { id, label, kind, owner,
// x, y, size, hidden, color }; what a token stands for (a party member, a cast
// member, a marker) is the system's business and arrives through the token itself.
// Map state lives per map in the shared state (State.state.maps): a map is one the
// system ships for a scene (a floor of a building, the grounds — a scene may have
// several) or, for a scene with none, the scene itself as a blank grid. Which map
// the table is showing is shared too (State.state.table.map), so the player view
// follows the GM's floor. Every change goes through ops, so the GM page, the table
// and the player view all agree.
//
// Two views of the same page:
//   vtt.html               GM view: toolbar, drag, right-click menu, fog at half
//                          opacity, hidden tokens dimmed
//   vtt.html?view=player   player view: no controls, fog opaque, hidden and fogged
//                          tokens not drawn; a player may drag their own tokens
// ?map=<id> pins a map (?scene=<id> its first map); without it the window follows
// the GM's table — the map they last showed, else their current scene's first map.
//
// Units: map state is in grid cells (floats allowed); the SVG user space is image
// pixels; grid.size is the cell in pixels, grid.ox/oy the offset of the first line —
// the calibration the GM dials in for a map not drawn on a known grid.
(function () {
  const { el } = window.VttRender;
  const State = window.VttState;
  const Bus = window.VttBus;
  const Sys = window.VttSystem;       // the system's table adapter (system/teeth/table.js)
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const params = new URLSearchParams(location.search);
  const PLAYER = params.get('view') === 'player';
  if (PLAYER) document.body.classList.add('player');

  const svg = document.getElementById('map');
  const stage = document.getElementById('vtt-stage');
  const toolbar = document.getElementById('vtt-toolbar');
  const hint = document.getElementById('vtt-hint');

  let follow = !(params.get('map') || params.get('scene'));
  let mapId = null;
  let sceneId = null;            // the scene the current map belongs to
  let map = null;
  let legendOpen = false;        // this window's, never shared
  let tool = 'select';           // select | ping | circle | line | square | reveal
  let selectedId = null;
  let selectedEffect = null;
  let view = { x: 0, y: 0, w: 2400, h: 1600 };

  function myMemberId() {
    return window.VttSession ? window.VttSession.memberId() : null;
  }

  function canDrag(t) {
    if (!PLAYER) return true;
    const me = myMemberId();
    return !!me && t.owner === me;
  }

  // ── scenes ─────────────────────────────────────────────────────────
  const scenes = () => Sys.scenes();                    // [{ id, name, moduleId }] in play order

  function gmScene() {
    return Sys.currentSceneId();
  }

  function mapScene(id) {
    const d = Sys.mapDef(id);
    return d ? d.sceneId : id;             // a scene with no shipped map is its own blank map
  }

  function hasMap(id) {                    // does this scene have anything to show?
    if (Sys.defaultMapId(id) !== id) return true;
    const m = (State.state.maps || {})[id];
    return !!(m && m.image);
  }

  let followNote = '';
  function defaultFor(h) {
    if (!h) {
      followNote = '';
      const first = scenes()[0];
      return first ? Sys.defaultMapId(first.id) : null;
    }
    if (hasMap(h)) {
      followNote = '';
      return Sys.defaultMapId(h);
    }
    const mapped = scenes().find((s) => hasMap(s.id));
    if (!mapped) {
      followNote = '';
      return h;
    }
    const cur = scenes().find((s) => s.id === h);
    followNote = `${cur ? cur.name : 'The current scene'} has no map yet — showing ${mapped.name}.`;
    return Sys.defaultMapId(mapped.id);
  }

  // What a following window shows: the map the GM's table last showed, if it belongs
  // to the GM's current scene (players take it as it is); else that scene's first map.
  function followedMap() {
    const t = State.state.table || {};
    const h = gmScene();
    if (t.map && (PLAYER || !h || mapScene(t.map) === h)) {
      followNote = '';
      return t.map;
    }
    return defaultFor(h);
  }

  function scene() {
    return scenes().find((s) => s.id === sceneId) || null;
  }

  function mapName() {
    const sc = scene();
    const d = Sys.mapDef(mapId);
    return [sc && sc.name, d && d.name].filter(Boolean).join(' · ') || 'Table';
  }

  function blankMap() {
    return { image: null, w: 2400, h: 1600, grid: { size: 80, ox: 0, oy: 0, show: true, snap: true }, tokens: [], effects: [], fog: { enabled: false, revealed: [] } };
  }

  function loadMap() {
    let m = (State.state.maps || {})[mapId];
    if (!m) {
      m = blankMap();
      const d = Sys.mapDef(mapId);
      if (d) {
        m.image = d.image;
        m.w = d.w;
        m.h = d.h;
        Object.assign(m.grid, d.grid || {});
      }
      if (!PLAYER && mapId) State.commit('setMapState', [mapId, m]);
    }
    m.tokens = m.tokens || [];
    m.effects = m.effects || [];
    m.fog = m.fog || { enabled: false, revealed: [] };
    map = m;
  }

  function persist() {
    if (!PLAYER && mapId) State.commit('setMapState', [mapId, map]);
  }

  // ── geometry ───────────────────────────────────────────────────────
  const cell = () => map.grid.size;
  const toPx = (cx, cy) => ({ x: map.grid.ox + cx * cell(), y: map.grid.oy + cy * cell() });
  const toCell = (px, py) => ({ x: (px - map.grid.ox) / cell(), y: (py - map.grid.oy) / cell() });

  function svgPoint(clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  function applyView() {
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
  }

  function fit() {
    view = { x: 0, y: 0, w: map.w, h: map.h };
    applyView();
  }

  function zoomAt(clientX, clientY, factor) {
    const p = svgPoint(clientX, clientY);
    view.w *= factor;
    view.h *= factor;
    view.x = p.x - (p.x - view.x) * factor;
    view.y = p.y - (p.y - view.y) * factor;
    applyView();
  }

  function isRevealed(t) {
    if (!map.fog.enabled) return true;
    const cx = t.x + t.size / 2;
    const cy = t.y + t.size / 2;
    return map.fog.revealed.some((r) => cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h);
  }

  // ── SVG ────────────────────────────────────────────────────────────
  function s(tag, attrs, children) {
    const n = document.createElementNS(SVG_NS, tag);
    for (const k in attrs || {}) n.setAttribute(k, attrs[k]);
    (children || []).forEach((c) => c && n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return n;
  }

  const layers = {};
  function buildLayers() {
    svg.innerHTML = '';
    const defs = s('defs');
    const pattern = s('pattern', { id: 'gridpat', patternUnits: 'userSpaceOnUse' });
    pattern.appendChild(s('path', { class: 'grid-line', fill: 'none' }));
    const mask = s('mask', { id: 'fogmask' });
    mask.appendChild(s('rect', { x: -1e5, y: -1e5, width: 2e5, height: 2e5, fill: 'white' }));
    layers.fogHoles = s('g');
    mask.appendChild(layers.fogHoles);
    defs.appendChild(pattern);
    defs.appendChild(mask);
    svg.appendChild(defs);
    layers.pattern = pattern;
    layers.image = s('image', { x: 0, y: 0 });
    layers.grid = s('rect', { x: 0, y: 0, fill: 'url(#gridpat)', class: 'grid-fill' });
    layers.effects = s('g', { class: 'effects' });
    layers.fog = s('rect', { x: 0, y: 0, class: 'fog', mask: 'url(#fogmask)' });
    layers.tokens = s('g', { class: 'tokens' });
    layers.pings = s('g', { class: 'pings' });
    layers.preview = s('g', { class: 'preview' });
    ['image', 'grid', 'effects', 'fog', 'tokens', 'preview', 'pings'].forEach((k) => svg.appendChild(layers[k]));
  }

  function renderBase() {
    if (map.image) layers.image.setAttribute('href', map.image);
    else layers.image.removeAttribute('href');
    layers.image.setAttribute('width', map.w);
    layers.image.setAttribute('height', map.h);
    ['grid', 'fog'].forEach((k) => {
      layers[k].setAttribute('width', map.w);
      layers[k].setAttribute('height', map.h);
    });
    const c = cell();
    layers.pattern.setAttribute('width', c);
    layers.pattern.setAttribute('height', c);
    layers.pattern.setAttribute('x', map.grid.ox);
    layers.pattern.setAttribute('y', map.grid.oy);
    layers.pattern.firstChild.setAttribute('d', `M ${c} 0 L 0 0 0 ${c}`);
    layers.grid.style.display = map.grid.show === false ? 'none' : '';
    layers.fog.style.display = map.fog.enabled ? '' : 'none';
    layers.fogHoles.innerHTML = '';
    map.fog.revealed.forEach((r) => {
      const p = toPx(r.x, r.y);
      layers.fogHoles.appendChild(s('rect', { x: p.x, y: p.y, width: r.w * c, height: r.h * c, fill: 'black' }));
    });
  }

  function initials(name) {
    const parts = String(name || '?').replace(/\(.*?\)/g, '').trim().split(/\s+/);
    const core = parts.filter((p) => !/^\d+$/.test(p) && !/^(the|of|de|le|la|von|van|miss|mr|mrs|sir|lady|lord|dr)$/i.test(p));
    const num = parts.find((p) => /^\d+$/.test(p));
    const ini = (core.length ? core : parts).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
    return num ? ini + num : ini;
  }

  function renderTokens() {
    layers.tokens.innerHTML = '';
    const c = cell();
    map.tokens.forEach((t) => {
      if (PLAYER && (t.hidden || !isRevealed(t))) return;
      const d = t.size * c;
      const p = toPx(t.x, t.y);
      const cx = p.x + d / 2;
      const cy = p.y + d / 2;
      const r = d / 2 - Math.max(2, c * 0.06);
      const color = t.color || Sys.tokenColor(t);
      const status = Sys.tokenStatus(t);           // { text, cls } or null — the system's word for the token's state
      const g = s('g', {
        class: 'token kind-' + (t.kind || 'marker') + (t.id === selectedId ? ' selected' : '') + (t.hidden ? ' hidden-token' : '') + (status && status.cls ? ' ' + status.cls : ''),
        'data-id': t.id,
        transform: `translate(${cx},${cy})`,
      });
      g.appendChild(s('circle', { class: 'ring-outline', r: r + 3, fill: 'none', stroke: color, 'stroke-width': Math.max(2, c * 0.05) }));
      g.appendChild(s('circle', { class: 'body', r, stroke: color, 'stroke-width': 1.5 }));
      if (t.image) g.appendChild(s('image', { href: t.image, x: -r, y: -r, width: 2 * r, height: 2 * r, 'clip-path': 'circle(50%)' }));
      else g.appendChild(s('text', { class: 'ini', 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': r * 0.9 }, [initials(t.label)]));
      (status && status.pips ? status.pips : []).slice(0, 6).forEach((pip, i) => {
        const a = -Math.PI / 2 + (i - 2.5) * 0.42;
        g.appendChild(s('circle', { class: 'pip', cx: Math.cos(a) * (r + 3), cy: Math.sin(a) * (r + 3), r: Math.max(3, c * 0.09) }, [s('title', {}, [pip])]));
      });
      const label = status && status.text && (!PLAYER || t.kind === 'party') ? `${t.label} · ${status.text}` : t.label;
      g.appendChild(s('text', { class: 'label', 'text-anchor': 'middle', y: r + Math.max(12, c * 0.3), 'font-size': Math.max(11, c * 0.24) }, [label]));
      layers.tokens.appendChild(g);
    });
  }

  function effectShape(e, cls) {
    const c = cell();
    if (e.kind === 'circle') {
      const p = toPx(e.x, e.y);
      return s('circle', { class: cls, cx: p.x, cy: p.y, r: e.r * c });
    }
    if (e.kind === 'square') {
      const p = toPx(e.x, e.y);
      return s('rect', { class: cls, x: p.x, y: p.y, width: e.w * c, height: e.h * c });
    }
    if (e.kind === 'line') {
      const a = toPx(e.x1, e.y1);
      const b = toPx(e.x2, e.y2);
      return s('line', { class: cls + ' line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, 'stroke-width': (e.w || 1) * c * 0.4 });
    }
    return null;
  }

  function renderEffects() {
    layers.effects.innerHTML = '';
    map.effects.forEach((e) => {
      const node = effectShape(e, 'effect' + (e.id === selectedEffect ? ' selected' : ''));
      if (!node) return;
      node.dataset.id = e.id;
      if (e.label) node.appendChild(s('title', {}, [e.label]));
      layers.effects.appendChild(node);
    });
  }

  function renderAll() {
    renderBase();
    renderEffects();
    renderTokens();
    syncHint();
  }

  function refresh() {
    const next = follow ? followedMap() : mapId;
    if (next && next !== mapId) {
      switchMap(next, true);
      return;
    }
    loadMap();
    renderAll();
  }

  function switchMap(id, refit) {
    mapId = id;
    sceneId = mapScene(id);
    selectedId = null;
    selectedEffect = null;
    loadMap();
    renderAll();
    if (refit) fit();
    document.title = (window.VttConfig.title || 'Table') + ' — ' + mapName();
    // the table's map is shared: whatever the GM shows, the player view follows
    if (!PLAYER && mapId && (State.state.table || {}).map !== mapId) State.commit('setTableMap', [mapId]);
    buildToolbar();
    renderLegend();
  }

  // ── the legend (GM only; the map's key, verbatim from the corpus) ──
  let legendEl = null;
  function renderLegend() {
    if (legendEl) legendEl.remove();
    legendEl = null;
    if (PLAYER || !legendOpen) return;
    const lg = Sys.legend(mapId);
    if (!lg) return;
    legendEl = el('div', { class: 'vtt-legend' }, [
      el('h4', {}, [lg.heading]),
      el('div', { class: 'muted' }, [lg.title]),
      el('div', { class: 'lines' }, lg.lines.map((line) => el('div', {}, [line]))),
    ]);
    stage.appendChild(legendEl);
  }

  // ── pings ──────────────────────────────────────────────────────────
  function showPing(cx, cy) {
    const p = toPx(cx, cy);
    const c = cell();
    const ring = s('circle', { cx: p.x, cy: p.y, r: c * 0.2, class: 'ping' });
    ring.appendChild(s('animate', { attributeName: 'r', from: c * 0.2, to: c * 2.2, dur: '1.2s', repeatCount: 1, fill: 'freeze' }));
    ring.appendChild(s('animate', { attributeName: 'opacity', from: 1, to: 0, dur: '1.2s', repeatCount: 1, fill: 'freeze' }));
    layers.pings.appendChild(ring);
    setTimeout(() => ring.remove(), 1300);
  }

  // ── interaction ────────────────────────────────────────────────────
  let drag = null;

  function tokenAt(target) {
    const g = target.closest && target.closest('.token');
    return g ? map.tokens.find((t) => t.id === g.dataset.id) : null;
  }

  function snap(v) {
    return map.grid.snap === false ? v : Math.round(v);
  }

  svg.addEventListener('pointerdown', (e) => {
    if (e.button === 2) return;
    closeMenu();
    const p = svgPoint(e.clientX, e.clientY);
    const t = tokenAt(e.target);
    if (t && tool === 'select' && canDrag(t)) {
      selectedId = t.id;
      selectedEffect = null;
      drag = { kind: 'token', token: t, offX: p.x - toPx(t.x, t.y).x, offY: p.y - toPx(t.x, t.y).y, moved: false };
      svg.setPointerCapture(e.pointerId);
      renderTokens();
      return;
    }
    if (t && !PLAYER) {
      selectedId = t.id;
      renderTokens();
    }
    if (!PLAYER && tool !== 'select') {
      drag = { kind: 'tool', start: toCell(p.x, p.y), cur: toCell(p.x, p.y) };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    if (PLAYER && tool === 'ping') {
      const c0 = toCell(p.x, p.y);
      Bus.emit('ping', { mapId, x: c0.x, y: c0.y });
      return;
    }
    const fx = e.target.closest && e.target.closest('.effect');
    if (fx && !PLAYER) {
      selectedEffect = fx.dataset.id;
      selectedId = null;
      renderEffects();
      renderTokens();
    }
    drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
    svg.setPointerCapture(e.pointerId);
    svg.classList.add('panning');
  });

  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (drag.kind === 'pan') {
      const scale = view.w / svg.clientWidth;
      view.x = drag.vx - (e.clientX - drag.sx) * scale;
      view.y = drag.vy - (e.clientY - drag.sy) * scale;
      applyView();
      return;
    }
    const p = svgPoint(e.clientX, e.clientY);
    if (drag.kind === 'token') {
      const cpos = toCell(p.x - drag.offX, p.y - drag.offY);
      drag.token.x = cpos.x;
      drag.token.y = cpos.y;
      drag.moved = true;
      const g = layers.tokens.querySelector(`[data-id="${drag.token.id}"]`);
      if (g) {
        const d = drag.token.size * cell();
        const px = toPx(drag.token.x, drag.token.y);
        g.setAttribute('transform', `translate(${px.x + d / 2},${px.y + d / 2})`);
      }
      return;
    }
    if (drag.kind === 'tool') {
      drag.cur = toCell(p.x, p.y);
      layers.preview.innerHTML = '';
      const e2 = toolEffect(drag);
      if (e2) {
        const node = effectShape(e2, 'effect preview');
        if (node) layers.preview.appendChild(node);
      }
    }
  });

  svg.addEventListener('pointerup', () => {
    if (!drag) return;
    svg.classList.remove('panning');
    if (drag.kind === 'token') {
      if (drag.moved) {
        drag.token.x = snap(drag.token.x);
        drag.token.y = snap(drag.token.y);
        State.commit('setTokenPosition', [mapId, drag.token.id, drag.token.x, drag.token.y]);   // the op a player may send
      } else {
        Sys.selectToken(drag.token);
      }
      renderTokens();
    } else if (drag.kind === 'tool') {
      layers.preview.innerHTML = '';
      const moved = Math.hypot(drag.cur.x - drag.start.x, drag.cur.y - drag.start.y) > 0.15;
      if (tool === 'ping') {
        Bus.emit('ping', { mapId, x: drag.start.x, y: drag.start.y });
      } else if (tool === 'reveal') {
        if (moved) {
          map.fog.revealed.push(normRect(drag.start, drag.cur));
          persist();
          renderBase();
        }
      } else if (moved) {
        const fx = toolEffect(drag);
        if (fx) {
          fx.id = State.genId('fx');
          map.effects.push(fx);
          persist();
          renderEffects();
        }
      }
    }
    drag = null;
  });

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 1.1 : 1 / 1.1);
  }, { passive: false });

  function normRect(a, b) {
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
  }

  function toolEffect(d) {
    const a = d.start;
    const b = d.cur;
    if (tool === 'circle') return { kind: 'circle', x: a.x, y: a.y, r: Math.hypot(b.x - a.x, b.y - a.y) };
    if (tool === 'square') return Object.assign({ kind: 'square' }, normRect(a, b));
    if (tool === 'line') return { kind: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, w: 1 };
    return null;
  }

  window.addEventListener('keydown', (e) => {
    if (PLAYER) return;
    if (e.key === 'Escape') {
      tool = 'select';
      closeMenu();
      selectedEffect = null;
      svg.classList.remove('tool-active');
      renderEffects();
      buildToolbar();
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && !(e.target instanceof HTMLInputElement)) {
      if (selectedEffect) {
        map.effects = map.effects.filter((x) => x.id !== selectedEffect);
        selectedEffect = null;
        persist();
        renderEffects();
      } else if (selectedId) {
        removeToken(selectedId);
      }
    }
  });

  function removeToken(id) {
    map.tokens = map.tokens.filter((t) => t.id !== id);
    if (selectedId === id) selectedId = null;
    persist();
    renderTokens();
  }

  // ── right-click menu (GM) ──────────────────────────────────────────
  let menu = null;
  function closeMenu() {
    if (menu) menu.remove();
    menu = null;
  }

  svg.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (PLAYER) return;
    closeMenu();
    const t = tokenAt(e.target);
    const fx = e.target.closest && e.target.closest('.effect');
    if (fx) {
      map.effects = map.effects.filter((x) => x.id !== fx.dataset.id);
      persist();
      renderEffects();
      return;
    }
    if (!t) return;
    selectedId = t.id;
    renderTokens();
    menu = buildMenu(t);
    const rect = stage.getBoundingClientRect();
    menu.style.left = Math.min(e.clientX - rect.left, rect.width - 260) + 'px';
    menu.style.top = Math.min(e.clientY - rect.top, rect.height - 260) + 'px';
    stage.appendChild(menu);
  });

  document.addEventListener('pointerdown', (e) => {
    if (menu && !menu.contains(e.target)) closeMenu();
  });

  function buildMenu(t) {
    const hide = el('button', { class: 'btn ghost', onclick: () => { t.hidden = !t.hidden; persist(); renderTokens(); closeMenu(); } }, [t.hidden ? 'Reveal to players' : 'Hide from players']);
    const sizeSel = el('select', { class: 'vtt-num' });
    [0.5, 1, 2, 3].forEach((n) => sizeSel.appendChild(el('option', { value: String(n), selected: n === t.size || null }, [n === 0.5 ? 'Small (½)' : n === 1 ? 'Normal (1)' : n === 2 ? 'Large (2)' : 'Huge (3)'])));
    sizeSel.addEventListener('change', () => { t.size = parseFloat(sizeSel.value); persist(); renderTokens(); });
    const rename = el('button', { class: 'btn ghost', onclick: () => { const n = prompt('Label', t.label); if (n) { t.label = n; persist(); renderTokens(); } closeMenu(); } }, ['Rename']);
    const remove = el('button', { class: 'btn danger', onclick: () => { removeToken(t.id); closeMenu(); } }, ['Remove token']);
    const body = el('div', { class: 'vtt-menu' }, [el('h4', {}, [t.label]), el('div', { class: 'row' }, [hide, sizeSel]), el('div', { class: 'row' }, [rename, remove])]);
    const extra = Sys.tokenMenu(t, () => { persist(); renderTokens(); closeMenu(); });
    if (extra) body.appendChild(extra);
    return body;
  }

  // ── toolbar (GM) ───────────────────────────────────────────────────
  function toolButton(id, label, title) {
    const b = el('button', { class: 'btn ghost' + (tool === id ? ' active' : ''), title: title || '' }, [label]);
    b.addEventListener('click', () => {
      tool = tool === id ? 'select' : id;
      selectedEffect = null;
      svg.classList.toggle('tool-active', tool !== 'select');
      buildToolbar();
      renderEffects();
    });
    return b;
  }

  function numField(label, get, set, step) {
    const inp = el('input', { type: 'number', class: 'vtt-num', step: step || 1, value: String(get()) });
    inp.addEventListener('change', () => {
      const v = parseFloat(inp.value);
      if (!isNaN(v)) set(v);
      persist();
      renderAll();
    });
    return el('label', {}, [label, inp]);
  }

  function check(label, get, set) {
    const inp = el('input', { type: 'checkbox', checked: get() || null });
    inp.addEventListener('change', () => {
      set(inp.checked);
      persist();
      renderAll();
    });
    return el('label', {}, [inp, label]);
  }

  function addTokenAt(t) {
    // stage new tokens along the top-left in a row so the GM can drag them out
    const taken = map.tokens.length;
    map.tokens.push(Object.assign({ x: 1 + (taken % 10) * 1.2, y: 1 + Math.floor(taken / 10) * 1.2, size: 1, hidden: false }, t, { id: t.id || State.genId('tk') }));
    persist();
    renderTokens();
  }

  function buildToolbar() {
    toolbar.innerHTML = '';
    if (PLAYER) {
      toolbar.appendChild(el('div', { class: 'group' }, [el('b', {}, [mapName()]), el('button', { class: 'btn ghost', onclick: fit }, ['Fit']), toolButton('ping', 'Ping')]));
      return;
    }
    // one entry per map, in scene order: a scene's floors, or the scene itself when it has no map
    const mapSel = el('select', { class: 'vtt-select' });
    const shipped = Sys.maps();
    scenes().forEach((sc, i) => {
      const ms = shipped.filter((m) => m.sceneId === sc.id);
      if (!ms.length) mapSel.appendChild(el('option', { value: sc.id, selected: sc.id === mapId || null }, [`${i + 1}. ${sc.name}`]));
      ms.forEach((m) => mapSel.appendChild(el('option', { value: m.id, selected: m.id === mapId || null }, [`${i + 1}. ${sc.name} · ${m.name}`])));
    });
    const followBox = el('input', { type: 'checkbox', checked: follow || null });
    mapSel.addEventListener('change', () => {
      if (follow && mapScene(mapSel.value) !== mapScene(followedMap())) {   // another scene's map: pinned from here
        follow = false;
        followBox.checked = false;
      }
      switchMap(mapSel.value, true);
    });
    followBox.addEventListener('change', () => {
      follow = followBox.checked;
      if (follow) switchMap(followedMap(), true);
    });
    toolbar.appendChild(el('div', { class: 'group' }, [mapSel, el('label', {}, [followBox, 'follow GM'])]));

    const img = el('input', { type: 'text', class: 'vtt-url', placeholder: 'map image (assets/maps/…)', value: map.image || '' });
    const setImg = el('button', { class: 'btn ghost' }, ['Set map']);
    setImg.addEventListener('click', () => {
      const url = img.value.trim();
      if (!url) {
        map.image = null;
        persist();
        renderAll();
        return;
      }
      const probe = new Image();
      probe.onload = () => {
        map.image = url;
        map.w = probe.naturalWidth;
        map.h = probe.naturalHeight;
        persist();
        renderAll();
        fit();
      };
      probe.onerror = () => alert('Could not load that image.');
      probe.src = url;
    });
    const pickMap = el('select', { class: 'vtt-select' }, [el('option', { value: '' }, ['maps in the repo…'])]);
    Sys.mapAssets().forEach((a) => pickMap.appendChild(el('option', { value: a.image }, [a.label])));
    pickMap.addEventListener('change', () => {
      if (!pickMap.value) return;
      img.value = pickMap.value;
      setImg.click();
      pickMap.value = '';
    });
    toolbar.appendChild(el('div', { class: 'group' }, [pickMap, img, setImg]));

    toolbar.appendChild(el('div', { class: 'group' }, [
      el('span', { class: 'muted' }, ['Grid']),
      check('show', () => map.grid.show !== false, (v) => { map.grid.show = v; }),
      check('snap', () => map.grid.snap !== false, (v) => { map.grid.snap = v; }),
      numField('cell px', () => map.grid.size, (v) => { map.grid.size = Math.max(8, v); }),
      numField('x', () => map.grid.ox, (v) => { map.grid.ox = v; }),
      numField('y', () => map.grid.oy, (v) => { map.grid.oy = v; }),
    ]));

    // tokens: the system lists what can stand on the table
    const addSel = el('select', { class: 'vtt-select' }, [el('option', { value: '' }, ['add token…'])]);
    Sys.tokenSources().forEach((group) => {
      addSel.appendChild(el('option', { disabled: true }, ['— ' + group.label]));
      group.items.forEach((it) => addSel.appendChild(el('option', { value: JSON.stringify(it) }, [it.label])));
    });
    addSel.appendChild(el('option', { disabled: true }, ['— other']));
    addSel.appendChild(el('option', { value: '__marker' }, ['a marker (name it)']));
    addSel.addEventListener('change', () => {
      if (!addSel.value) return;
      if (addSel.value === '__marker') {
        const n = prompt('Marker label');
        if (n) addTokenAt({ label: n, kind: 'marker' });
      } else addTokenAt(JSON.parse(addSel.value));
      addSel.value = '';
    });
    toolbar.appendChild(el('div', { class: 'group' }, [addSel]));

    toolbar.appendChild(el('div', { class: 'group' }, [
      toolButton('ping', 'Ping', 'Click the map to ping it in every window'),
      toolButton('circle', 'Circle', 'Drag from centre'),
      toolButton('line', 'Line', 'Drag start to end'),
      toolButton('square', 'Square', 'Drag corner to corner'),
    ]));

    const resetFog = el('button', { class: 'btn ghost', onclick: () => { map.fog.revealed = []; persist(); renderBase(); } }, ['Reset']);
    toolbar.appendChild(el('div', { class: 'group' }, [
      el('span', { class: 'muted' }, ['Fog']),
      check('on', () => map.fog.enabled, (v) => { map.fog.enabled = v; }),
      toolButton('reveal', 'Reveal', 'Drag a rectangle to reveal'),
      resetFog,
    ]));

    const playerBtn = el('button', { class: 'btn', onclick: () => window.open(location.pathname + '?view=player' + (follow ? '' : '&map=' + encodeURIComponent(mapId)), (window.VttConfig.channel || 'vtt') + '-player') }, ['Open player view']);
    const legendBtn = el('button', { class: 'btn ghost' + (legendOpen ? ' active' : ''), title: 'The map’s key, from the book — for you, not the players' }, ['Legend']);
    legendBtn.disabled = !Sys.legend(mapId);
    legendBtn.addEventListener('click', () => {
      legendOpen = !legendOpen;
      buildToolbar();
      renderLegend();
    });
    toolbar.appendChild(el('div', { class: 'group last' }, [legendBtn, el('button', { class: 'btn ghost', onclick: fit }, ['Fit']), playerBtn]));
  }

  function syncHint() {
    const n = map.tokens.length;
    const note = follow && followNote ? followNote + ' ' : '';
    if (PLAYER) {
      hint.textContent = myMemberId() ? 'Drag your own token · wheel zooms · drag the map to pan' : 'Wheel zooms · drag the map to pan';
      return;
    }
    hint.textContent = note + (n ? `${n} token${n === 1 ? '' : 's'} · drag to move · right-click for hide, size, rename · Delete removes · wheel zooms · Esc clears the tool` : 'No tokens yet — add the party and the cast from the toolbar.');
  }

  // ── bus ────────────────────────────────────────────────────────────
  Bus.on('state:changed', (p, meta) => {
    if (!(meta && meta.remote)) return;
    refresh();
  });
  Bus.on('state:remote', () => refresh());
  Bus.on('scene:changed', (p, meta) => {
    if (!(meta && meta.remote)) return;
    refresh();
    syncHint();
  });
  Bus.on('ping', (p) => {
    if (p && p.mapId === mapId) showPing(p.x, p.y);
  });

  // ── boot ───────────────────────────────────────────────────────────
  buildLayers();
  const pinned = params.get('map') || (params.get('scene') ? Sys.defaultMapId(params.get('scene')) : null);
  switchMap(pinned || followedMap(), true);
  window.addEventListener('resize', applyView);

  window.VttTable = { refresh, fit, map: () => map, mapId: () => mapId, scene: () => sceneId, tool: () => tool, addToken: addTokenAt, legend: () => legendOpen };
})();
