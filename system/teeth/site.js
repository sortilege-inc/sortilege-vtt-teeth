// system/teeth/site.js — what TEETH puts on the site (engine/site.js): the rules of
// each book as a reader, and the published adventures' characters as sheets. Every
// word shown is the book's own (system/teeth/entity.js, sheet.js); this file only
// decides what is listed where.
window.VttSiteTabs = (function () {
  const { el, paragraphs, button, debounce } = window.VttRender;
  const D = window.TeethData;
  const E = window.TeethEntity;
  const Sheet = window.TeethSheet;
  const Site = () => window.VttSite;

  // ── the books ──────────────────────────────────────────────────────
  const ruleBooks = () => D.books().filter((b) => b.kind !== 'shared');   // the one-shots' shared types are plumbing

  // A book's chapters: its untyped top-level sections with contents, in the book's order.
  function chapters(bid) {
    const b = D.book(bid);
    return b ? b.entities.map((h) => D.entity(h)).filter((e) => e && !e.parent && e.children.length && !e.type) : [];
  }

  // The published adventures: the one-shots (they carry an ARC) and the standalone games —
  // any book that ships characters to pick up. The core's and the supplement's Playbooks
  // are for building a character, which is the creator's business, not the selector's.
  const adventures = () => D.books().filter((b) => (b.kind === 'one-shot' || b.kind === 'standalone game') && templates(b.id).length);

  function templates(bid) {
    return D.all([bid]).filter((e) => e.form === 'TEMPLATE').sort((a, b) => a.name.localeCompare(b.name));
  }

  // The books a sheet from this adventure draws on: a one-shot rides on the core and the
  // shared cut-down types (as the GM's default campaign does); a standalone game is itself.
  function sheetBooks(bid) {
    const b = D.book(bid);
    return b && b.kind === 'one-shot' ? ['core', 'oneshot-shared', bid] : [bid];
  }

  function adventureBlurb(bid) {
    const a = D.arc(bid);
    if (a && a.desc) return a.desc;
    const first = chapters(bid)[0];
    return first && first.desc ? first.desc : '';
  }

  function short(text, n) {
    if (!text) return '';
    return text.length > n ? text.slice(0, n - 3).replace(/\s+\S*$/, '') + '…' : text;
  }

  function crumbs(parts) {
    return el('div', { class: 'site-crumbs' }, parts.map((p, i) => [i ? ' › ' : null, p.href ? el('a', { href: p.href }, [p.label]) : el('span', {}, [p.label])]));
  }

  // links inside any rendered entity or sheet open the reader on that entity's book
  window.VttEntitySelect = (id) => {
    const e = D.entity(id);
    if (e) Site().go('rules', [e.book, id]);
  };

  // ── Rules ──────────────────────────────────────────────────────────
  function renderRules(container, path, ctx) {
    const bid = D.book(path[0]) ? path[0] : 'core';
    const book = D.book(bid);
    const chs = chapters(bid);
    const eid = path[1] && D.entity(path[1]) ? path[1] : null;

    const pick = el('select', { class: 'scope' });
    ruleBooks().forEach((b) => pick.appendChild(el('option', { value: b.id, selected: b.id === bid || null }, [b.title])));
    pick.addEventListener('change', () => ctx.go('rules', [pick.value]));

    const search = el('input', { type: 'search', class: 'search', placeholder: 'Search this book…', autocomplete: 'off' });
    const results = el('div', { class: 'results' });
    const toc = el('div', { class: 'site-toc' });
    const reader = el('div', { class: 'site-reader' });

    const open = eid ? D.entity(eid) : null;
    const openChapter = open ? (D.ancestors(open.id)[0] || open) : null;
    chs.forEach((ch) => {
      const kids = D.children(ch.id);
      toc.appendChild(el('details', { open: (!open && ch === chs[0]) || (openChapter && openChapter.id === ch.id) || null }, [
        el('summary', {}, [el('a', { class: 'ref' + (open && open.id === ch.id ? ' active' : ''), href: ctx.href('rules', [bid, ch.id]) }, [ch.name])]),
        el('ul', { class: 'items toc' }, kids.map((k) => el('li', {}, [el('a', { class: 'ref' + (open && open.id === k.id ? ' active' : ''), href: ctx.href('rules', [bid, k.id]) }, [k.name])]))),
      ]));
    });

    function drawReader() {
      reader.innerHTML = '';
      if (open) {
        reader.appendChild(E.render(open));
        return;
      }
      reader.appendChild(el('article', { class: 'entity' }, [
        el('header', { class: 'ent-head' }, [el('h2', {}, [book.title]), el('div', { class: 'meta' }, [el('span', { class: 'muted' }, [book.kind])])]),
        el('div', { class: 'ent-body' }, [
          el('p', { class: 'muted' }, [`${chs.length} chapter${chs.length === 1 ? '' : 's'} · ${book.entities.length} entries. Pick a chapter on the left, or search the book.`]),
          el('div', { class: 'cards' }, chs.map((ch) => el('a', { class: 'card', href: ctx.href('rules', [bid, ch.id]) }, [
            el('div', { class: 'card-name' }, [ch.name]),
            el('div', { class: 'card-sub' }, [`${ch.children.length} sections`]),
            ch.desc ? el('div', { class: 'card-desc' }, [short(ch.desc, 160)]) : null,
          ]))),
        ]),
      ]));
    }

    const run = debounce(() => {
      results.innerHTML = '';
      const q = search.value.trim();
      toc.hidden = !!q;
      if (!q) return;
      const hits = D.search(q, [bid], 80);
      if (!hits.length) return results.appendChild(el('div', { class: 'empty' }, ['Nothing matches.']));
      results.appendChild(el('div', { class: 'muted' }, [`${hits.length} result${hits.length === 1 ? '' : 's'}`]));
      hits.forEach((e) => results.appendChild(E.card(e, () => ctx.go('rules', [bid, e.id]))));
    }, 150);
    search.addEventListener('input', run);

    container.appendChild(el('div', { class: 'site-cols' }, [
      el('aside', { class: 'site-aside' }, [pick, search, results, toc]),
      reader,
    ]));
    drawReader();
  }

  // ── Characters ─────────────────────────────────────────────────────
  const previews = {};   // templateId -> the member being tried; never saved

  function renderCharacters(container, path, ctx) {
    const bid = path[0] && adventures().some((b) => b.id === path[0]) ? path[0] : null;
    const tid = bid && path[1] && D.entity(path[1]) && D.entity(path[1]).book === bid ? path[1] : null;
    const view = path[2] === 'printed' ? 'printed' : 'sheet';

    if (!bid) {
      container.appendChild(el('h2', { class: 'site-h' }, ['Pick an adventure']));
      container.appendChild(el('p', { class: 'muted' }, ['Each published adventure comes with its characters ready to play. Choose one to look through them.']));
      container.appendChild(el('div', { class: 'cards adventures' }, adventures().map((b) => el('a', { class: 'card', href: ctx.href('characters', [b.id]) }, [
        el('div', { class: 'card-name' }, [b.title]),
        el('div', { class: 'card-sub' }, [`${b.kind} · ${templates(b.id).length} characters`]),
        el('div', { class: 'card-desc' }, [short(adventureBlurb(b.id), 220)]),
      ]))));
      return;
    }

    const book = D.book(bid);
    if (!tid) {
      container.appendChild(crumbs([{ label: 'Adventures', href: ctx.href('characters') }, { label: book.title }]));
      container.appendChild(el('h2', { class: 'site-h' }, [book.title]));
      container.appendChild(paragraphs(adventureBlurb(bid), 'prose'));
      const ts = templates(bid);
      container.appendChild(el('h3', {}, [`The characters (${ts.length})`]));
      container.appendChild(el('div', { class: 'cards' }, ts.map((t) => {
        const tag = ['Tagline', 'Epithet', 'Quote'].map((k) => D.propValue(t, k)).find((v) => typeof v === 'string');
        return el('a', { class: 'card', href: ctx.href('characters', [bid, t.id]) }, [
          el('div', { class: 'card-name' }, [t.name]),
          el('div', { class: 'card-sub' }, [t.type || '']),
          tag ? el('div', { class: 'card-desc' }, [tag]) : null,
        ]);
      })));
      return;
    }

    const t = D.entity(tid);
    container.appendChild(crumbs([{ label: 'Adventures', href: ctx.href('characters') }, { label: book.title, href: ctx.href('characters', [bid]) }, { label: t.name }]));
    const views = el('div', { class: 'sheet-views chiprow' }, [
      el('a', { class: 'btn' + (view === 'sheet' ? '' : ' ghost'), href: ctx.href('characters', [bid, tid]) }, ['The sheet']),
      el('a', { class: 'btn' + (view === 'printed' ? '' : ' ghost'), href: ctx.href('characters', [bid, tid, 'printed']) }, ['As printed']),
      el('span', { class: 'muted' }, [view === 'sheet' ? 'Try it — boxes, dice and picks work here and are not saved anywhere.' : 'The character as the book prints it.']),
    ]);
    container.appendChild(views);
    const body = el('div', { class: 'site-sheet' });
    container.appendChild(body);
    if (view === 'printed') {
      body.appendChild(E.render(t));
      return;
    }
    Sheet.scope(sheetBooks(bid));
    let m = previews[tid];
    if (!m) {
      m = Sheet.newMember(tid, t.name);
      previews[tid] = m;
    }
    const draw = () => {
      body.innerHTML = '';
      body.appendChild(Sheet.live(m, { player: true, preview: true }));
    };
    m.preview = { onChange: draw };
    draw();
  }

  // ── Character creator ──────────────────────────────────────────────
  // The steps are the core's own chapter — "How to Begin › Creating the Hunters" and its
  // "Finalise the Playbook" — each step's text verbatim from the entity of that name; the
  // controls are the sheet's spec of the chosen Playbook (system/teeth/sheet.js), so a
  // Hogman from More TEETH walks the same steps as a core Hunter. The draft lives in this
  // browser only (a site key, never a campaign); the result is a character file the GM
  // adds to the party (Party › Add from file…).
  const DRAFT_KEY = ((window.VttConfig || {}).storagePrefix || 'sortilege-vtt') + ':site:draft';
  const ADDED_ACTION_POINTS = 4;   // "Players add four more, wherever they like." — Add Points to Actions (core)
  const STEPS = [
    { id: 'playbook', label: 'Playbook', text: 'Pick a Playbook' },
    { id: 'background', label: 'Name & Background', text: 'Define a Background' },
    { id: 'wants', label: 'What they want', text: 'Decide What Hunters Want' },
    { id: 'actions', label: 'Actions', text: 'Add Points to Actions' },
    { id: 'ability', label: 'Special Ability', text: 'Select a Special Ability' },
    { id: 'magic', label: 'Magic', text: 'Select Magic Discipline and Method' },
    { id: 'acquaintances', label: 'Acquaintances', text: 'Pick Dangerous Acquaintances' },
    { id: 'vice', label: 'Vice', text: 'Pick a Vice' },
    { id: 'items', label: 'Items', text: 'Examine Items' },
    { id: 'done', label: 'The Hunter', text: null },
  ];

  const coreText = (name) => D.all(['core']).find((e) => e.name === name && !e.type && e.form === 'DEF') || null;

  function guide(name) {
    const e = coreText(name);
    if (!e) return null;
    return el('div', { class: 'guide' }, [
      el('h3', {}, [e.name, ' ', el('a', { class: 'muted small', href: Site().href('rules', ['core', e.id]) }, ['in the book'])]),
      e.desc ? paragraphs(e.desc, 'prose') : null,
      ...e.props.filter((p) => p.vk === 'list' && p.of === 'STRING').map((p) => el('ul', { class: 'items' }, p.items.map((it) => el('li', {}, [String(it.value)])))),
    ]);
  }

  // Playbooks a Hunter is built from: every TEMPLATE whose actor chain reaches Hunter.
  function isHunter(t) {
    let cur = t;
    for (let i = 0; cur && i < 8; i++) {
      if (cur.name === 'Hunter' && cur.form === 'ACTOR') return true;
      cur = cur.typeHash ? D.entity(cur.typeHash) : null;
    }
    return false;
  }
  const playbooks = () => D.all().filter((e) => e.form === 'TEMPLATE' && isHunter(e));
  const creatorBooks = (t) => (t.book === 'core' ? ['core'] : ['core', t.book]);

  function loadDraft() {
    try {
      return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    } catch (e) {
      return null;
    }
  }
  function saveDraft(d) {
    try {
      if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
      else localStorage.removeItem(DRAFT_KEY);
    } catch (e) {
      /* no storage */
    }
  }

  // The book's word on an option: its description, text or descriptor, verbatim.
  function optionText(hash) {
    const e = hash && D.entity(hash);
    if (!e) return null;
    const t = e.desc || ['Description', 'Text', 'Descriptor'].map((k) => D.propValue(e, k)).find((v) => typeof v === 'string');
    return typeof t === 'string' ? t : null;
  }

  // A list's items with unhashed names (More TEETH's Discipline list names the core's) resolved
  // to the entity of that type in the creator's books.
  function resolved(items, type, books) {
    return items.map((it) => {
      if (it.hash) return it;
      const e = type ? D.byType(type, books).find((x) => x.name === it.name) : null;
      return e ? { hash: e.id, name: e.name } : it;
    });
  }

  function chooser(options, chosen, limit, onPick) {
    return el('div', { class: 'choose' }, options.map((o) => {
      const key = o.hash || o.name;
      const on = chosen.indexOf(key) !== -1;
      const text = optionText(o.hash);
      return el('button', { class: 'choice' + (on ? ' on' : ''), type: 'button', onclick: () => {
        let next;
        if (limit === 1) next = on ? [] : [key];
        else next = on ? chosen.filter((h) => h !== key) : chosen.length < limit ? chosen.concat([key]) : chosen;
        onPick(next);
      } }, [el('div', { class: 'card-name' }, [o.name]), text ? el('div', { class: 'card-desc' }, [text]) : null]);
    }));
  }

  function renderCreator(container, path, ctx) {
    let draft = loadDraft();
    const t = draft && D.entity(draft.templateId);
    if (draft && !t) {
      draft = null;
      saveDraft(null);
    }
    const stepId = t && STEPS.some((s) => s.id === path[0]) ? path[0] : 'playbook';
    const step = STEPS.find((s) => s.id === stepId);
    const m = draft ? draft.member : null;
    if (t) Sheet.scope(creatorBooks(t));
    const sp = t ? Sheet.spec(t) : null;
    const books = t ? creatorBooks(t) : ['core'];

    const persist = () => {
      if (!draft) return;
      draft.member.playerNotes = Object.keys(draft.answers || {}).filter((q) => draft.answers[q]).map((q) => q + '\n' + draft.answers[q]).join('\n\n');
      saveDraft(draft);
    };
    const redraw = () => {
      container.innerHTML = '';
      renderCreator(container, path, ctx);
    };
    const set = (key, patch) => {
      m.live[key] = Object.assign({}, m.live[key] || {}, patch);
      persist();
      redraw();
    };
    const list = (name) => (sp.lists || []).find((l) => l.name === name);
    const pick = (name) => (sp.picks || []).find((p) => p.name === name);
    const chosenList = (name) => (m.live.lists || {})[name] || [];
    const chosenPick = (name) => (m.live.picks || {})[name] || [];
    const headerValue = (name) => {
      const h = (sp.header || []).find((x) => x.name === name);
      return h ? h.value : null;
    };
    const magicPicks = () => {
      const h = headerValue('Magic Picks');
      if (typeof h === 'number') return h;
      const tr = (sp.tracks || []).find((x) => x.name === 'Magic Picks');
      return tr ? tr.start || 1 : 1;
    };
    const rating = () => (sp.ratings || [])[0] || null;
    const addedPoints = () => {
      const r = rating();
      if (!r) return 0;
      const cur = (m.live.ratings || {})[r.name] || {};
      return r.axes.reduce((a, k) => a + Math.max(0, (cur[k] || 0) - (r.start[k] || 0)), 0);
    };

    // is a step finished? (what the chapter asks for; magic and items are optional)
    const done = {
      playbook: !!t,
      background: !!t && !!(m.name || '').trim() && chosenPick('Background').length === 1,
      wants: !!t && Object.keys((draft && draft.answers) || {}).some((q) => draft.answers[q]),
      actions: !!t && addedPoints() === ADDED_ACTION_POINTS,
      ability: !!t && (!list('Special Abilities') || chosenList('Special Abilities').length === (list('Special Abilities').pick || 1)),
      magic: true,
      acquaintances: !!t && (!pick('Friend') || chosenPick('Friend').length === 1) && (!pick('Enemy') || chosenPick('Enemy').length === 1),
      vice: !!t && (!pick('Vice') || chosenPick('Vice').length === 1),
      items: true,
    };

    // the step strip
    const strip = el('ol', { class: 'creator-steps' }, STEPS.map((s) => {
      const reachable = !!t || s.id === 'playbook';
      return el('li', { class: (s.id === stepId ? 'current' : '') + (done[s.id] ? ' done' : '') + (reachable ? '' : ' off') }, [
        reachable ? el('a', { href: ctx.href('creator', [s.id]) }, [s.label]) : el('span', {}, [s.label]),
      ]);
    }));
    container.appendChild(el('div', { class: 'creator-head' }, [
      el('h2', { class: 'site-h' }, ['Create a Hunter']),
      t ? el('div', { class: 'muted' }, [m.name ? m.name + ' · ' : '', t.name, el('button', { class: 'btn ghost tiny', type: 'button', onclick: () => { if (confirm('Start over? The draft is discarded.')) { saveDraft(null); ctx.go('creator', ['playbook']); } } }, ['start over'])]) : null,
    ]));
    container.appendChild(strip);
    const body = el('div', { class: 'creator-body' });
    container.appendChild(body);
    const nav = (prev, next) => el('div', { class: 'chiprow creator-nav' }, [
      prev ? el('a', { class: 'btn ghost', href: ctx.href('creator', [prev]) }, ['‹ ' + STEPS.find((s) => s.id === prev).label]) : null,
      next ? el('a', { class: 'btn', href: ctx.href('creator', [next]) }, [STEPS.find((s) => s.id === next).label + ' ›']) : null,
    ]);
    const idx = STEPS.findIndex((s) => s.id === stepId);
    const prevId = idx > 0 ? STEPS[idx - 1].id : null;
    const nextId = idx < STEPS.length - 1 ? STEPS[idx + 1].id : null;
    if (step.text) body.appendChild(guide(step.text));

    switch (stepId) {
      case 'playbook': {
        const groups = {};
        playbooks().forEach((pb) => (groups[pb.book] = groups[pb.book] || []).push(pb));
        Object.keys(groups).forEach((bid) => {
          body.appendChild(el('h3', {}, [(D.book(bid) || {}).title || bid]));
          body.appendChild(el('div', { class: 'choose playbooks' }, groups[bid].map((pb) => {
            const on = t && t.id === pb.id;
            const tag = D.propValue(pb, 'Tagline');
            const desc = D.propValue(pb, 'Description');
            return el('button', { class: 'choice' + (on ? ' on' : ''), type: 'button', onclick: () => {
              if (t && t.id !== pb.id && !confirm(`Switch to ${pb.name}? The choices made for ${t.name} are discarded.`)) return;
              if (!t || t.id !== pb.id) {
                Sheet.scope(creatorBooks(pb));
                const member = Sheet.newMember(pb.id, '');
                member.name = '';
                saveDraft({ templateId: pb.id, member, answers: {} });
              }
              ctx.go('creator', ['background']);
            } }, [
              el('div', { class: 'card-name' }, [pb.name]),
              typeof tag === 'string' ? el('div', { class: 'card-sub' }, [tag]) : null,
              typeof desc === 'string' ? el('div', { class: 'card-desc' }, [desc]) : null,
            ]);
          })));
        });
        break;
      }
      case 'background': {
        const name = el('input', { type: 'text', class: 'text', placeholder: 'Their name', value: m.name || '' });
        name.addEventListener('change', () => { m.name = name.value.trim(); persist(); });
        body.appendChild(el('div', { class: 'prop' }, [el('div', { class: 'prop-k' }, ['Name']), el('div', { class: 'prop-v' }, [name])]));
        // scalars the actor chain declares that the Playbook leaves to the player (a Hogman's Clan)
        const headerNames = (sp.header || []).map((h) => h.name);
        Sheet.declared(t).filter((d) => d.vk === 'scalar' && d.type !== 'INTEGER' && ['Name', 'Playbook'].indexOf(d.name) === -1 && headerNames.indexOf(d.name) === -1).forEach((d) => {
          const inp = el('input', { type: 'text', class: 'text', value: ((m.live.fields || {})[d.name]) || '' });
          inp.addEventListener('change', () => set('fields', { [d.name]: inp.value.trim() }));
          body.appendChild(el('div', { class: 'prop' }, [el('div', { class: 'prop-k' }, [d.name]), el('div', { class: 'prop-v' }, [inp])]));
        });
        const bg = pick('Background');
        if (bg) {
          body.appendChild(el('h4', {}, ['Background', el('span', { class: 'muted' }, [' · pick 1'])]));
          body.appendChild(chooser(resolved(bg.options, 'Background', books), chosenPick('Background'), 1, (next) => set('picks', { Background: next })));
        }
        body.appendChild(nav(prevId, nextId));
        break;
      }
      case 'wants': {
        const qs = coreText('Decide What Hunters Want');
        const questions = qs ? qs.props.filter((p) => p.vk === 'list' && p.of === 'STRING').flatMap((p) => p.items.map((it) => String(it.value))) : [];
        body.appendChild(el('div', { class: 'answers' }, questions.map((q) => {
          const ta = el('textarea', { rows: 2 }, [(draft.answers || {})[q] || '']);
          ta.addEventListener('change', () => { draft.answers = draft.answers || {}; draft.answers[q] = ta.value.trim(); persist(); });
          return el('label', { class: 'answer' }, [el('div', { class: 'q' }, [q]), ta]);
        })));
        body.appendChild(el('p', { class: 'muted' }, ['These go on the sheet as the player’s notes.']));
        body.appendChild(nav(prevId, nextId));
        break;
      }
      case 'actions': {
        const r = rating();
        if (!r) {
          body.appendChild(el('div', { class: 'empty' }, ['This playbook has no action ratings.']));
        } else {
          const cur = (m.live.ratings || {})[r.name] || {};
          const added = addedPoints();
          body.appendChild(el('h4', {}, [r.name, el('span', { class: 'muted' }, [` · ${added} of ${ADDED_ACTION_POINTS} added · the Playbook’s own points stay`])]));
          // by Attribute, as the sheet groups them
          const byAttr = {};
          r.axes.forEach((axis) => {
            const ent = r.axisEntities.find((a) => a.name === axis);
            const attr = ent ? (D.propValue(ent, 'Attribute') || {}) : {};
            const key = (attr && attr.name) || 'Actions';
            (byAttr[key] = byAttr[key] || []).push({ axis, ent });
          });
          Object.keys(byAttr).forEach((attr) => {
            body.appendChild(el('h5', { class: 'attr' }, [attr]));
            byAttr[attr].forEach(({ axis, ent }) => {
              const floor = r.start[axis] || 0;
              const v = cur[axis] || 0;
              const text = ent ? optionText(ent.id) : null;
              const row = el('div', { class: 'boxes diamonds' });
              for (let i = 1; i <= r.max; i++) {
                row.appendChild(el('button', { class: 'box' + (i <= v ? ' on' : '') + (i <= floor ? ' fixed' : ''), type: 'button', title: i <= floor ? 'the Playbook’s own point' : String(i), onclick: () => {
                  const n = i <= v && i === v ? Math.max(floor, i - 1) : Math.max(floor, i);
                  const nextAdded = added - Math.max(0, v - floor) + Math.max(0, n - floor);
                  if (nextAdded > ADDED_ACTION_POINTS) return;
                  set('ratings', { [r.name]: Object.assign({}, cur, { [axis]: n }) });
                } }));
              }
              body.appendChild(el('div', { class: 'rating creator-rating' }, [row, el('div', { class: 'rating-body' }, [ent ? E.link({ hash: ent.id, name: ent.name }) : el('b', {}, [axis]), text ? el('div', { class: 'check-text' }, [text]) : null])]));
            });
          });
        }
        body.appendChild(nav(prevId, nextId));
        break;
      }
      case 'ability': {
        const l = list('Special Abilities');
        if (l) {
          body.appendChild(el('h4', {}, [l.name, el('span', { class: 'muted' }, [` · pick ${l.pick || 1}`])]));
          body.appendChild(chooser(l.items, chosenList(l.name), l.pick || 1, (next) => set('lists', { [l.name]: next })));
        }
        body.appendChild(nav(prevId, nextId));
        break;
      }
      case 'magic': {
        const n = magicPicks();
        ['Disciplines', 'Methods'].forEach((name) => {
          const l = list(name);
          if (!l) return;
          body.appendChild(el('h4', {}, [name, el('span', { class: 'muted' }, [` · pick ${n} (optional)`])]));
          body.appendChild(chooser(resolved(l.items, l.type, books), chosenList(name), n, (next) => set('lists', { [name]: next })));
        });
        body.appendChild(nav(prevId, nextId));
        break;
      }
      case 'acquaintances': {
        ['Friend', 'Enemy'].forEach((name) => {
          const pk = pick(name);
          if (!pk) return;
          body.appendChild(el('h4', {}, [name, el('span', { class: 'muted' }, [' · pick 1'])]));
          body.appendChild(chooser(pk.options, chosenPick(name), 1, (next) => set('picks', { [name]: next })));
        });
        body.appendChild(nav(prevId, nextId));
        break;
      }
      case 'vice': {
        const pk = pick('Vice');
        if (pk) {
          body.appendChild(el('h4', {}, ['Vice', el('span', { class: 'muted' }, [' · pick 1'])]));
          body.appendChild(chooser(pk.options, chosenPick('Vice'), 1, (next) => set('picks', { Vice: next })));
        }
        body.appendChild(nav(prevId, nextId));
        break;
      }
      case 'items': {
        const l = list('Items');
        if (l) {
          body.appendChild(el('h4', {}, [l.name, el('span', { class: 'muted' }, [' · ' + (sp.rubrics || []).join(' · ')])]));
          body.appendChild(el('ul', { class: 'items' }, l.items.map((it) => {
            const text = optionText(it.hash);
            return el('li', {}, [it.hash ? E.link({ hash: it.hash, name: it.name }) : it.name, text && text !== it.name ? el('span', { class: 'muted' }, [' — ' + text]) : null]);
          })));
        }
        body.appendChild(nav(prevId, nextId));
        break;
      }
      case 'done': {
        const missing = STEPS.filter((s) => s.id !== 'done' && !done[s.id]).map((s) => s.label);
        body.appendChild(el('h3', {}, [m.name || t.name]));
        body.appendChild(missing.length ? el('p', { class: 'muted' }, ['Still to do: ' + missing.join(', ') + '.']) : el('p', { class: 'muted' }, ['Every step the book asks for is done.']));
        body.appendChild(el('div', { class: 'chiprow' }, [
          button('Download the character', () => Sheet.downloadCharacter(m)),
          button('Print', () => window.print(), 'ghost'),
          el('span', { class: 'muted' }, ['Give the file to your GM: on the table, Party › Add from file…']),
        ]));
        const sheetBox = el('div', { class: 'site-sheet' });
        const drawSheet = () => {
          sheetBox.innerHTML = '';
          sheetBox.appendChild(Sheet.live(m, { player: true, preview: true }));
        };
        m.preview = { onChange: () => { persist(); drawSheet(); } };
        drawSheet();
        body.appendChild(sheetBox);
        body.appendChild(nav(prevId, null));
        break;
      }
      default:
        break;
    }
  }

  return [
    { id: 'rules', label: 'Rules', render: renderRules },
    { id: 'characters', label: 'Characters', render: renderCharacters },
    { id: 'creator', label: 'Character creator', render: renderCreator },
  ];
})();
