// system/teeth/entity.js — renders any corpus entity from its generic record:
// name, type, description, properties, choices, entries, thresholds, outcomes,
// tables, hooks, guidance, children and cross-references. Every string shown is
// the book's own; this file only decides layout. Type-specific sheets (a
// Playbook as a live sheet, a Track as boxes) live in system/teeth/sheet.js and
// take over from here when they know the type.
window.TeethEntity = (function () {
  const { el, paragraphs, chip } = window.VttRender;
  const D = window.TeethData;

  function selectEntity(id) {
    window.VttPanels.select({ kind: 'entity', id });
  }

  function link(ref, label) {
    const id = ref && ref.hash;
    const name = label || (ref && ref.name) || id;
    if (!id || !D.entity(id)) return el('span', { class: 'ref dead', title: id || '' }, [name]);
    return el('button', { class: 'ref', type: 'button', onclick: () => selectEntity(id) }, [name]);
  }

  function value(v) {
    if (v == null) return null;
    switch (v.vk) {
      case 'scalar':
        return typeof v.value === 'string' && v.value.length > 80 ? paragraphs(v.value, 'prose small') : el('span', { class: 'val' }, [String(v.value)]);
      case 'ref':
        return link(v.ref || v);
      case 'enum':
        return el('span', { class: 'val' }, [v.options.join(' · ')]);
      case 'list': {
        if (!v.items.length) return el('span', { class: 'val muted' }, ['—']);
        const defs = v.items.filter((it) => it.vk === 'def');
        if (defs.length) return defTable(defs);
        if (v.items.every((it) => it.vk === 'ref')) return el('div', { class: 'chips' }, v.items.map((it) => link(it)));
        return el('ul', { class: 'items' }, v.items.map((it) => el('li', {}, [it.vk === 'scalar' ? String(it.value) : link(it)])));
      }
      case 'def':
        return defTable([v]);
      case 'entity':
        return link({ hash: v.id, name: v.name });
      default:
        return null;
    }
  }

  // A list of inline DEFs (`DEF { ^"Action" ^"Fight" ^"Rating" INTEGER 2 }`, ENTRIES rows) as a table.
  function defTable(defs) {
    const cols = [];
    defs.forEach((d) => (d.fields || []).forEach((f) => cols.indexOf(f.name) === -1 && cols.push(f.name)));
    const head = el('tr', {}, cols.map((c) => el('th', {}, [c])));
    const rows = defs.map((d) =>
      el('tr', {}, cols.map((c) => {
        const f = (d.fields || []).find((x) => x.name === c);
        return el('td', {}, [f ? value(f) : '']);
      }))
    );
    return el('table', { class: 'grid' }, [el('thead', {}, [head]), el('tbody', {}, rows)]);
  }

  function propRows(e, skip) {
    const rows = [];
    (e.props || []).forEach((p) => {
      if (skip.indexOf(p.name) !== -1) return;
      const isDecl = p.vk === 'scalar' && p.value === undefined;   // a type's property declaration
      const v = isDecl ? el('span', { class: 'val muted' }, [[p.type, p.required ? 'required' : null, p.min != null ? 'min ' + p.min : null, p.max != null ? 'max ' + p.max : null].filter(Boolean).join(' · ')]) : value(p);
      if (!v) return;
      rows.push(el('div', { class: 'prop' }, [el('div', { class: 'prop-k' }, [p.name]), el('div', { class: 'prop-v' }, [v])]));
    });
    return rows;
  }

  function section(title, node) {
    if (!node || (Array.isArray(node) && !node.length)) return null;
    return el('section', { class: 'ent-sec' }, [el('h4', {}, [title]), node]);
  }

  function render(e, opts) {
    opts = opts || {};
    const crumbs = D.ancestors(e.id);
    const head = el('header', { class: 'ent-head' }, [
      crumbs.length ? el('div', { class: 'crumbs' }, crumbs.map((a, i) => [i ? ' › ' : null, link({ hash: a.id, name: a.name })])) : null,
      el('h2', {}, [e.name]),
      el('div', { class: 'meta' }, [
        e.form !== 'DEF' ? chip(e.form) : null,
        e.type ? link({ hash: e.typeHash, name: e.type }) : null,
        el('span', { class: 'muted' }, [(D.book(e.book) || {}).title || e.book]),
      ]),
    ]);
    const body = el('div', { class: 'ent-body' }, [
      paragraphs(e.desc),
      el('div', { class: 'props' }, propRows(e, ['Name'])),
      section('Choices', e.choices.length ? el('div', {}, e.choices.map((c) => c.rubric ? el('div', { class: 'rubric' }, [c.rubric]) : el('div', { class: 'prop' }, [el('div', { class: 'prop-k' }, [c.name + (c.pick ? ' · pick ' + c.pick : '')]), el('div', { class: 'prop-v chips' }, c.items.map((it) => link(it)))]))) : null),
      section('Entries', e.entries.length ? (e.entries.every((x) => x.vk === 'entity') ? el('ul', { class: 'items' }, e.entries.map((x) => el('li', {}, [link({ hash: x.id, name: x.name })]))) : defTable(e.entries.filter((x) => x.vk === 'def'))) : null),
      section('Thresholds', e.thresholds.length ? defTable(e.thresholds) : null),
      section('Outcomes', e.outcomes.length ? el('table', { class: 'grid' }, [el('tbody', {}, e.outcomes.map((o) => el('tr', {}, [el('th', {}, [o[0]]), el('td', {}, [o[1]])])))]) : null),
      e.table ? section('Table', el('table', { class: 'grid' }, [
        e.table.columns.length ? el('thead', {}, [el('tr', {}, e.table.columns.map((c) => el('th', {}, [c])))]) : null,
        el('tbody', {}, e.table.rows.map((r) => el('tr', {}, r.map((c) => el('td', {}, [String(c)]))))),
      ])) : null,
      section('Hooks', e.hooks.length ? el('ul', { class: 'items hooks' }, e.hooks.map((h) => el('li', {}, h.fields.map((f) => f.name === 'Text' ? paragraphs(f.value, 'prose small') : el('span', { class: 'muted' }, [f.name + ': ' + (f.value === true ? 'yes' : f.value)]))))) : null),
      section('Guidance', e.guidance.length ? el('div', {}, e.guidance.map(guidance)) : null),
      opts.noChildren ? null : section('Contents', (() => {
        const listed = new Set(e.entries.filter((x) => x.vk === 'entity').map((x) => x.id));   // rows already shown under Entries
        const rest = D.children(e.id).filter((c) => !listed.has(c.id));
        return rest.length ? el('ul', { class: 'items toc' }, rest.map((c) => el('li', {}, [link({ hash: c.id, name: c.name }), c.type ? el('span', { class: 'muted' }, [' · ' + c.type]) : null]))) : null;
      })()),
      section('See also', e.refs.length ? el('div', { class: 'chips' }, dedupe(e.refs).map((r) => link({ hash: r.hash, name: r.name }, r.label))) : null),
    ]);
    return el('article', { class: 'entity' }, [head, body]);
  }

  function guidance(g) {
    return el('div', { class: 'guidance' }, [
      el('div', { class: 'guidance-head' }, [g.name, g.topics && g.topics.length ? el('span', { class: 'muted' }, [' — ' + g.topics.join(' · ')]) : null]),
      paragraphs(g.text, 'prose small'),
      g.concerns && g.concerns.length ? el('div', { class: 'chips' }, g.concerns.map((c) => link(c))) : null,
    ]);
  }

  function dedupe(refs) {
    const seen = new Set();
    return refs.filter((r) => {
      if (seen.has(r.hash)) return false;
      seen.add(r.hash);
      return true;
    });
  }

  // A compact one-line card for lists (cast, search results).
  function blurb(e) {
    if (e.desc) return e.desc;
    const d = D.propValue(e, 'Description');     // a typed entity carries its text as a property
    return typeof d === 'string' ? d : null;
  }

  function card(e, onclick) {
    const sub = e.type ? e.type : (D.book(e.book) || {}).title;
    const text = blurb(e);
    return el('button', { class: 'card', type: 'button', onclick: onclick || (() => selectEntity(e.id)) }, [
      el('div', { class: 'card-name' }, [e.name]),
      el('div', { class: 'card-sub' }, [sub || '']),
      text ? el('div', { class: 'card-desc' }, [text.length > 160 ? text.slice(0, 157).replace(/\s+\S*$/, '') + '…' : text]) : null,
    ]);
  }

  return { render, card, link, value, guidance, selectEntity };
})();
