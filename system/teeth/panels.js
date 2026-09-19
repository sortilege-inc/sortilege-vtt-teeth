// system/teeth/panels.js — the TEETH panels: Module tracker, Scene, Inspector,
// Cast, Rules (glossary + book browser), Lore, Campaign. Registered into the
// engine's registry; the shell decides where they show.
(function () {
  const { el, paragraphs, chip, button, debounce } = window.VttRender;
  const D = window.TeethData;
  const E = window.TeethEntity;
  const State = window.VttState;
  const Bus = window.VttBus;
  const Panels = window.VttPanels;

  const S = () => State.state;
  const campaignModules = () => (S().campaign.modules || []).filter((id) => D.arc(id));
  const campaignBooks = () => {
    const b = S().campaign.books || [];
    return b.length ? b : D.books().map((x) => x.id);
  };

  // ── current scene ──────────────────────────────────────────────────
  function currentScene(moduleId) {
    const pages = D.pages(moduleId);
    if (!pages.length) return null;
    const cur = (S().current || {})[moduleId];
    return pages.find((p) => p.scene.id === cur) || pages[0];
  }

  function goTo(moduleId, sceneId) {
    State.commit('setCurrentScene', [moduleId, sceneId]);
    Bus.emit('scene:changed', { moduleId, sceneId });
  }

  function progress(moduleId, sceneId) {
    return ((S().progress || {})[moduleId] || {})[sceneId] || { done: false, notes: '' };
  }

  // ── Module tracker ─────────────────────────────────────────────────
  function renderTracker(container, ctx) {
    const draw = () => {
      container.innerHTML = '';
      const mods = campaignModules();
      if (!mods.length) {
        container.appendChild(el('div', { class: 'empty' }, ['No module in play. Open the Campaign panel and enable one.']));
        return;
      }
      mods.forEach((moduleId) => {
        const arc = D.arc(moduleId);
        const pages = D.pages(moduleId);
        const done = pages.filter((p) => progress(moduleId, p.scene.id).done).length;
        const cur = currentScene(moduleId);
        const wrap = el('div', { class: 'tracker' }, [
          el('h3', {}, [arc.name]),
          el('div', { class: 'progress' }, [el('div', { class: 'bar', style: `width:${pages.length ? Math.round((100 * done) / pages.length) : 0}%` }), el('span', {}, [`${done} / ${pages.length} scenes`])]),
        ]);
        let phase = null;
        pages.forEach((p, i) => {
          if (p.phase !== phase) {
            phase = p.phase;
            wrap.appendChild(el('div', { class: 'phase' }, [phase]));
          }
          const st = progress(moduleId, p.scene.id);
          const row = el('div', { class: 'scene-row' + (cur && cur.scene.id === p.scene.id ? ' current' : '') + (st.done ? ' done' : '') }, [
            el('input', { type: 'checkbox', checked: st.done || null, title: 'Done', onchange: (ev) => State.commit('setSceneDone', [moduleId, p.scene.id, ev.target.checked]) }),
            el('button', { class: 'scene-link', type: 'button', onclick: () => goTo(moduleId, p.scene.id) }, [`${i + 1}. ${p.scene.name}`]),
            p.scene.type ? chip(p.scene.type, { class: 'chip type-' + p.scene.type.toLowerCase() }) : null,
          ]);
          wrap.appendChild(row);
        });
        container.appendChild(wrap);
      });
    };
    ctx.on('state:changed', draw);
    ctx.on('state:remote', draw);
    draw();
  }

  // ── Scene ──────────────────────────────────────────────────────────
  function clueKey(sceneId, name) {
    return sceneId + '::' + name;
  }

  function renderScene(container, ctx) {
    const draw = () => {
      container.innerHTML = '';
      const mods = campaignModules();
      const moduleId = mods[0];
      const page = moduleId && currentScene(moduleId);
      if (!page) {
        container.appendChild(el('div', { class: 'empty' }, ['No scene — enable a module in the Campaign panel.']));
        return;
      }
      const pages = D.pages(moduleId);
      const idx = pages.indexOf(page);
      const s = page.scene;
      const st = progress(moduleId, s.id);
      const nav = el('div', { class: 'scene-nav' }, [
        button('‹ Previous', () => idx > 0 && goTo(moduleId, pages[idx - 1].scene.id), 'ghost'),
        el('span', { class: 'muted' }, [`${page.phase} · ${idx + 1} of ${pages.length}`]),
        button('Next ›', () => idx < pages.length - 1 && goTo(moduleId, pages[idx + 1].scene.id), 'ghost'),
      ]);
      const body = el('article', { class: 'scene' }, [
        nav,
        el('h2', {}, [s.name, s.type ? chip(s.type, { class: 'chip type-' + s.type.toLowerCase() }) : null]),
        paragraphs(s.desc),
        s.readAloud.length ? el('div', { class: 'read-aloud' }, s.readAloud.map((t) => paragraphs(t, 'prose'))) : null,
        s.clues.length ? el('section', { class: 'clues' }, [
          el('h4', {}, ['Clues']),
          ...s.clues.map((c) => {
            const revealed = !!((S().clues || {})[moduleId] || {})[clueKey(s.id, c.name)];
            const row = el('div', { class: 'clue' + (revealed ? ' revealed' : '') });
            row.append(
              el('label', {}, [
                el('input', { type: 'checkbox', checked: revealed || null, title: 'Revealed to the players', onchange: (ev) => {
                  State.commit('setClueRevealed', [moduleId, s.id, c.name, ev.target.checked]);
                  row.classList.toggle('revealed', ev.target.checked);
                } }),
                el('b', {}, [c.name]),
              ]),
              paragraphs(c.desc, 'prose small'),
            );
            return row;
          }),
        ]) : null,
        s.resolutions.length ? el('section', {}, [el('h4', {}, ['Resolutions']), el('table', { class: 'grid' }, [el('tbody', {}, s.resolutions.map((r) => el('tr', {}, [el('th', {}, [r.condition || r.name]), el('td', {}, [r.outcome])])))])]) : null,
        s.guidance.length ? el('section', {}, [el('h4', {}, ['GM guidance']), ...s.guidance.map(E.guidance)]) : null,
        s.refs && s.refs.length ? el('section', {}, [el('h4', {}, ['See also']), el('div', { class: 'chips' }, dedupeRefs(s.refs).map((r) => E.link({ hash: r.hash, name: r.name }, r.label)))]) : null,
        el('section', { class: 'gm-notes' }, [
          el('h4', {}, ['GM notes ', el('span', { class: 'muted' }, ['(never sent to players)'])]),
          el('textarea', { rows: 4, placeholder: 'Notes for this scene…', oninput: debounce((ev) => State.commit('setSceneNotes', [moduleId, s.id, ev.target.value]), 400) }, [st.notes || '']),
        ]),
        el('label', { class: 'done-toggle' }, [el('input', { type: 'checkbox', checked: st.done || null, onchange: (ev) => State.commit('setSceneDone', [moduleId, s.id, ev.target.checked]) }), ' Scene done']),
      ]);
      container.appendChild(body);
    };
    ctx.on('scene:changed', draw);
    ctx.on('state:remote', draw);
    ctx.on('state:changed', (p, meta) => {
      if (meta && meta.remote) draw();
    });
    draw();
  }

  function dedupeRefs(refs) {
    const seen = new Set();
    return refs.filter((r) => !seen.has(r.hash) && seen.add(r.hash));
  }

  // ── Inspector ──────────────────────────────────────────────────────
  function renderInspector(container, ctx) {
    const draw = () => {
      container.innerHTML = '';
      const sel = Panels.selection();
      if (!sel) {
        container.appendChild(el('div', { class: 'empty' }, ['Nothing selected. Click a name anywhere — a cast member, a rule, a reference.']));
        return;
      }
      if (sel.kind === 'entity') {
        const e = D.entity(sel.id);
        if (!e) return container.appendChild(el('div', { class: 'empty' }, ['Entity not found: ' + sel.id]));
        const sheet = window.TeethSheet && window.TeethSheet.render(e);
        container.appendChild(sheet || E.render(e));
      } else if (sel.kind === 'scene') {
        const s = D.scene(sel.moduleId, sel.sceneId);
        container.appendChild(s ? el('div', {}, [el('h2', {}, [s.name]), paragraphs(s.desc)]) : el('div', { class: 'empty' }, ['Scene not found.']));
      } else {
        container.appendChild(el('div', { class: 'empty' }, ['Nothing to show for ' + sel.kind + ' yet.']));
      }
    };
    ctx.on('select', draw);
    draw();
  }

  // ── Cast ───────────────────────────────────────────────────────────
  function renderCast(container, ctx) {
    container.innerHTML = '';
    const mods = campaignModules();
    if (!mods.length) return container.appendChild(el('div', { class: 'empty' }, ['No module in play.']));
    mods.forEach((moduleId) => {
      const people = D.cast(moduleId);
      container.appendChild(el('h3', {}, [D.arc(moduleId).name, el('span', { class: 'muted' }, [` · ${people.length}`])]));
      container.appendChild(el('div', { class: 'cards' }, people.map((p) => E.card(p))));
    });
  }

  // ── Rules: search + book browser ───────────────────────────────────
  function renderRules(container, ctx) {
    container.innerHTML = '';
    const input = el('input', { type: 'search', class: 'search', placeholder: 'Search every rule, person, place, table… ( / )', autocomplete: 'off' });
    const results = el('div', { class: 'results' });
    const browser = el('div', { class: 'browser' });
    const scope = el('select', { class: 'scope' });
    scope.appendChild(el('option', { value: '' }, ['Books in this campaign']));
    D.books().forEach((b) => scope.appendChild(el('option', { value: b.id }, [b.title])));

    function bookIds() {
      return scope.value ? [scope.value] : campaignBooks();
    }
    function drawBrowser() {
      browser.innerHTML = '';
      bookIds().forEach((bid) => {
        const b = D.book(bid);
        if (!b) return;
        const roots = D.roots(bid).filter((e) => e.form === 'DEF' || e.form === 'ACTOR' || e.form === 'TEMPLATE');
        const sec = el('details', { class: 'book', open: bookIds().length === 1 || null }, [
          el('summary', {}, [b.title, el('span', { class: 'muted' }, [` · ${roots.length} sections`])]),
          el('ul', { class: 'items toc' }, roots.map((r) => el('li', {}, [E.link({ hash: r.id, name: r.name }), r.type ? el('span', { class: 'muted' }, [' · ' + r.type]) : null]))),
        ]);
        browser.appendChild(sec);
      });
    }
    const run = debounce(() => {
      results.innerHTML = '';
      const q = input.value.trim();
      browser.hidden = !!q;
      if (!q) return;
      const hits = D.search(q, bookIds(), 120);
      if (!hits.length) return results.appendChild(el('div', { class: 'empty' }, ['Nothing matches.']));
      results.appendChild(el('div', { class: 'muted' }, [`${hits.length} result${hits.length === 1 ? '' : 's'}`]));
      results.appendChild(el('div', { class: 'cards' }, hits.map((e) => E.card(e))));
    }, 150);
    input.addEventListener('input', run);
    scope.addEventListener('change', () => {
      drawBrowser();
      run();
    });
    container.appendChild(el('div', { class: 'search-row' }, [input, scope]));
    container.appendChild(results);
    container.appendChild(browser);
    drawBrowser();
    container.focusSearch = () => input.focus();
  }

  // ── Lore ───────────────────────────────────────────────────────────
  function renderLore(container, ctx) {
    container.innerHTML = '';
    campaignBooks().forEach((bid) => {
      const b = D.book(bid);
      if (!b || !b.lore.length) return;
      b.lore.forEach((l) => {
        const det = el('details', { class: 'lore' }, [el('summary', {}, [b.title, el('span', { class: 'muted' }, [' · ' + l.file])])]);
        l.sections.forEach((s) => {
          if (s.title) det.appendChild(el('h' + Math.min(6, Math.max(2, s.level + 1)), {}, [s.title]));
          s.paragraphs.forEach((p) => det.appendChild(paragraphs(p, 'prose')));
        });
        container.appendChild(det);
      });
    });
    if (!container.children.length) container.appendChild(el('div', { class: 'empty' }, ['No lore in the books of this campaign.']));
  }

  // ── Campaign ───────────────────────────────────────────────────────
  function renderCampaign(container, ctx) {
    const draw = () => {
      container.innerHTML = '';
      const c = S().campaign;
      const name = el('input', { type: 'text', value: c.name || '', class: 'text', onchange: (ev) => State.commit('setCampaign', [{ name: ev.target.value }]) });
      container.appendChild(el('div', { class: 'prop' }, [el('div', { class: 'prop-k' }, ['Campaign']), el('div', { class: 'prop-v' }, [name])]));
      const modBox = el('div', { class: 'checks' }, D.modules().map((m) => el('label', {}, [
        el('input', { type: 'checkbox', checked: (c.modules || []).indexOf(m.id) !== -1 || null, onchange: (ev) => {
          const mods = (c.modules || []).filter((x) => x !== m.id);
          if (ev.target.checked) mods.push(m.id);
          State.commit('setCampaign', [{ modules: mods }]);
        } }),
        ' ' + m.arcs[0].name,
      ])));
      container.appendChild(el('div', { class: 'prop' }, [el('div', { class: 'prop-k' }, ['Modules in play']), el('div', { class: 'prop-v' }, [modBox])]));
      const bookBox = el('div', { class: 'checks' }, D.books().map((b) => el('label', {}, [
        el('input', { type: 'checkbox', checked: campaignBooks().indexOf(b.id) !== -1 || null, onchange: (ev) => {
          const books = campaignBooks().filter((x) => x !== b.id);
          if (ev.target.checked) books.push(b.id);
          State.commit('setCampaign', [{ books }]);
        } }),
        ' ' + b.title,
      ])));
      container.appendChild(el('div', { class: 'prop' }, [el('div', { class: 'prop-k' }, ['Books for reference']), el('div', { class: 'prop-v' }, [bookBox])]));

      // instances in this browser
      const list = State.listCampaigns();
      container.appendChild(el('h4', {}, ['Campaigns in this browser']));
      container.appendChild(el('ul', { class: 'items' }, list.map((row) => el('li', {}, [
        row.id === State.id ? el('b', {}, [row.name || row.id]) : el('button', { class: 'ref', type: 'button', onclick: () => { State.switchTo(row.id); location.reload(); } }, [row.name || row.id]),
        row.id !== State.id ? button('remove', () => { if (confirm(`Remove "${row.name}" from this browser? Export it first if you want it back.`)) { State.remove(row.id); draw(); } }, 'ghost tiny') : null,
      ]))));
      const file = el('input', { type: 'file', accept: 'application/json', hidden: true, onchange: (ev) => {
        const f = ev.target.files[0];
        if (!f) return;
        f.text().then((txt) => {
          try {
            State.importPack(JSON.parse(txt));
            location.reload();
          } catch (e) {
            alert(e.message);
          }
        });
      } });
      container.appendChild(el('div', { class: 'chiprow' }, [
        button('New campaign', () => { const n = prompt('Campaign name'); if (n) { State.create(n, { campaign: { modules: [], books: [] } }); location.reload(); } }),
        button('Save pack (download)', () => State.downloadPack()),
        button('Restore pack…', () => file.click(), 'ghost'),
        file,
      ]));
      container.appendChild(el('p', { class: 'muted small' }, ['A pack is the campaign as an instance: everything ticked, noted, revealed and tracked, as JSON. Keep packs in the campaign\'s own repo; this browser is a cache.']));
    };
    ctx.on('state:changed', draw);
    draw();
  }

  Panels.register('tracker', { label: 'Module', render: renderTracker });
  Panels.register('scene', { label: 'Scene', render: renderScene });
  Panels.register('inspector', { label: 'Inspector', render: renderInspector });
  Panels.register('cast', { label: 'Cast', render: renderCast });
  Panels.register('rules', { label: 'Rules & Books', render: renderRules });
  Panels.register('lore', { label: 'Lore', render: renderLore });
  Panels.register('campaign', { label: 'Campaign', render: renderCampaign });

  window.TeethPanels = { currentScene, goTo, campaignModules, campaignBooks };
})();
