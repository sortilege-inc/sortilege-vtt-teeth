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

  // ── Creator (next) ─────────────────────────────────────────────────
  function renderCreator(container) {
    container.appendChild(el('div', { class: 'empty' }, ['The character creator is next: a Hunter built from the core Playbooks, step by step. Not here yet.']));
  }

  return [
    { id: 'rules', label: 'Rules', render: renderRules },
    { id: 'characters', label: 'Characters', render: renderCharacters },
    { id: 'creator', label: 'Character creator', disabled: true, note: 'next', render: renderCreator },
  ];
})();
