// engine/app.js — the GM page's shell: a sidebar of panels and three slots.
//
// Wide (≥ 1100px): three columns, each showing one panel picked from the registry
// (default Module · Scene · Inspector; the choice is a per-browser preference).
// Narrow: one panel at a time, the sidebar as tabs. Panels never know which.
(function () {
  const { el } = window.VttRender;
  const State = window.VttState;
  const Panels = window.VttPanels;
  const CFG = window.VttConfig;

  const WIDE = 1100;
  const DEFAULT_SLOTS = ['tracker', 'scene', 'inspector'];
  const main = document.getElementById('main');
  const nav = document.getElementById('nav');
  const brand = document.getElementById('brand');

  let mode = null;
  let single = 'tracker';
  let ctxs = [];

  function slots() {
    const s = State.ui('slots');
    return Array.isArray(s) && s.length === 3 ? s : DEFAULT_SLOTS.slice();
  }

  function teardown() {
    ctxs.splice(0).forEach((c) => c.teardown());
  }

  function mountSlot(id, slotIndex) {
    const ctx = Panels.makeCtx(open);
    ctxs.push(ctx);
    const head = el('div', { class: 'slot-head' }, [el('span', {}, [Panels.PANELS[id] ? Panels.PANELS[id].label : id])]);
    if (slotIndex != null) {
      const pick = el('select', { class: 'slot-pick', title: 'Show another panel here' });
      Panels.list().forEach((p) => pick.appendChild(el('option', { value: p.id, selected: p.id === id || null }, [p.label])));
      pick.addEventListener('change', () => {
        const s = slots();
        s[slotIndex] = pick.value;
        State.ui('slots', s);
        render();
      });
      head.appendChild(pick);
    }
    const body = el('div', { class: 'slot-body' });
    const slot = el('section', { class: 'slot slot-' + id }, [head, body]);
    Panels.mount(body, id, ctx);
    return slot;
  }

  function render() {
    teardown();
    main.innerHTML = '';
    mode = window.innerWidth >= WIDE ? 'wide' : 'single';
    main.className = 'main ' + mode;
    if (mode === 'wide') slots().forEach((id, i) => main.appendChild(mountSlot(id, i)));
    else main.appendChild(mountSlot(single, null));
    buildNav();
  }

  function open(id) {
    if (mode === 'wide') {
      const s = slots();
      if (s.indexOf(id) === -1) {
        s[2] = id;   // the third column is the browsing column
        State.ui('slots', s);
      }
      render();
      return;
    }
    single = id;
    render();
    window.scrollTo(0, 0);
  }

  function buildNav() {
    nav.innerHTML = '';
    const shown = mode === 'wide' ? slots() : [single];
    Panels.list().forEach((p) => {
      nav.appendChild(el('li', {}, [el('button', { class: 'navbtn' + (shown.indexOf(p.id) !== -1 ? ' active' : ''), type: 'button', onclick: () => open(p.id) }, [p.label])]));
    });
    const c = State.state.campaign;
    brand.innerHTML = '';
    brand.appendChild(el('div', { class: 'brand-title' }, [CFG.title]));
    brand.appendChild(el('div', { class: 'brand-sub' }, [c.name || 'no campaign']));
  }

  // `/` focuses the search wherever the Rules panel is mounted
  document.addEventListener('keydown', (ev) => {
    if (ev.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
      const slot = main.querySelector('.slot-rules .slot-body');
      if (!slot) open('rules');
      const body = main.querySelector('.slot-rules .slot-body');
      if (body && body.focusSearch) {
        ev.preventDefault();
        body.focusSearch();
      }
    }
  });

  let resizeT = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      const next = window.innerWidth >= WIDE ? 'wide' : 'single';
      if (next !== mode) render();
    }, 120);
  });
  window.VttBus.on('state:changed', buildNav);
  // a selection made while no Inspector is on screen brings one into the browsing column
  window.VttBus.on('select', (sel, meta) => {
    if (meta && meta.remote) return;
    if (mode === 'wide' && !main.querySelector('.slot-inspector')) open('inspector');
    else if (mode === 'single' && single !== 'inspector') open('inspector');
  });

  // ── session (players on their own devices) ─────────────────────────
  const Session = window.VttSession;
  const sc = document.getElementById('session-controls');
  function buildSession() {
    if (!sc || !Session) return;
    sc.innerHTML = '';
    const s = Session.current();
    if (!s.active) {
      const start = el('button', { class: 'btn ghost', type: 'button' }, ['Start session']);
      start.disabled = !s.configured;
      start.title = s.configured ? 'Players join by room code' : 'No Worker URL in engine/config.js';
      start.addEventListener('click', async () => {
        start.disabled = true;
        try {
          await Session.start();
        } catch (e) {
          alert(e.message);
          start.disabled = false;
        }
      });
      sc.appendChild(start);
      return;
    }
    const url = Session.joinUrl();
    const copy = el('button', { class: 'btn ghost tiny', type: 'button', onclick: () => navigator.clipboard && navigator.clipboard.writeText(url).then(() => { copy.textContent = 'copied'; setTimeout(() => (copy.textContent = 'copy link'), 1500); }) }, ['copy link']);
    const end = el('button', { class: 'btn ghost tiny', type: 'button', onclick: () => { if (confirm('End the session? Players are disconnected; your campaign stays here.')) Session.leave(); } }, ['end']);
    const reseed = el('button', { class: 'btn ghost tiny', type: 'button', title: 'Replace the room\'s document with this browser\'s campaign (after restoring a pack)', onclick: () => { if (confirm('Overwrite the room with this browser\'s campaign?')) Session.reseed(); } }, ['reseed']);
    sc.appendChild(el('div', { class: 'session-code' }, [el('span', { class: 'chip' + (s.connected ? ' on' : '') }, [s.connected ? 'live' : s.status]), el('b', {}, [s.info.code]), el('span', { class: 'muted' }, [` ${Object.keys(s.claims).length} claimed`])]));
    sc.appendChild(el('div', { class: 'session-url' }, [url]));
    sc.appendChild(el('div', { class: 'chiprow' }, [copy, reseed, end]));
  }
  if (Session) {
    Session.onChange(buildSession);
    buildSession();
  }

  // the table and the player view are separate windows on the same state
  const wc = document.getElementById('window-controls');
  if (wc) {
    wc.appendChild(el('button', { class: 'btn', type: 'button', onclick: () => window.open('vtt.html', CFG.channel + '-table') }, ['Open table']));
    wc.appendChild(el('button', { class: 'btn ghost', type: 'button', onclick: () => window.open('vtt.html?view=player', CFG.channel + '-player') }, ['Open player view']));
  }

  window.VttApp = { open, render, mode: () => mode };
  render();
})();
