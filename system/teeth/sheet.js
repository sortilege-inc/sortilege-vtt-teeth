// system/teeth/sheet.js — a character as played, derived from the corpus.
//
// Nothing about a sheet is hand-listed here. A party member is made from a TEMPLATE
// (a Playbook, an Ingenue, a Courtier…); the sheet's shape comes from the ACTOR type
// the template EXTENDS, walking the EXTENDS chain (Hogman → Hunter):
//   INTEGER … MIN a MAX b          a track of b boxes (Stress, Coin, Corruption, Suspicion…)
//   INTEGER … MIN a  (no MAX)      a counter (Dede Dice, Pigfluence)
//   LIST OF <… Rating>             ratings: the rating type's ref field names the axis type
//                                  (Action, Simplified Attribute, Action Category), its
//                                  INTEGER field the maximum; the template fixes the start
//   LIST OF <Type>                 a checklist of the template's own list (abilities, items,
//                                  contacts…), with the template's CHOICES as pick limits
//   LIST OF STRING                 free text lines (Injuries, Titles)
//   ^"X" ^"Type"                   one pick: from the template's CHOICES, else every entity
//                                  of that type in the campaign's books
// The template's scalar values (Tagline, Quote, Epithet, Description…) are the header.
// Rolls use the book's own Roll entity (its OUTCOMES ladder) and log to the shared log.
window.TeethSheet = (function () {
  const { el, paragraphs, chip, button, debounce } = window.VttRender;
  const D = window.TeethData;
  const E = window.TeethEntity;
  const State = window.VttState;
  const Bus = window.VttBus;

  const S = () => State.state;
  // the campaign's books, whichever page this sheet is on (the player's page has no panels)
  const books = () => {
    const b = (S().campaign && S().campaign.books) || [];
    return b.length ? b : null;
  };

  // ── the spec of a sheet, from the template's actor chain ──────────
  function actorChain(template) {
    const out = [];
    // a TEMPLATE's chain starts at the actor it EXTENDS; an ACTOR used directly (the Outfit) is its own head
    let t = template.form === 'ACTOR' ? template : D.entity(template.typeHash);
    while (t) {
      out.unshift(t);
      t = t.typeHash ? D.entity(t.typeHash) : null;
    }
    return out;
  }

  function declared(template) {
    // child types override the parent's declarations of the same name
    const map = new Map();
    actorChain(template).forEach((a) => (a.props || []).forEach((p) => map.set(p.name, p)));
    return Array.from(map.values());
  }

  function templateProp(template, name) {
    return (template.props || []).find((p) => p.name === name) || null;
  }

  function ratingSpec(decl) {
    const rt = decl.ofHash ? D.entity(decl.ofHash) : null;
    if (!rt) return null;
    const axis = (rt.props || []).find((p) => p.vk === 'ref');
    const num = (rt.props || []).find((p) => p.vk === 'scalar' && p.type === 'INTEGER');
    return { axisField: axis ? axis.name : 'Name', axisType: axis && axis.ref ? axis.ref.name : null, field: num ? num.name : 'Rating', max: num && num.max != null ? num.max : 3 };
  }

  function singular(name) {
    return /ies$/.test(name) ? name.replace(/ies$/, 'y') : name.replace(/s$/, '');
  }

  // the template's CHOICES row for a list or pick, by name or its singular / " List"-less form
  // ("Special Ability" PICK 1 governs the actor's "Special Abilities" and the Playbook's
  // "Special Ability List")
  function choiceFor(choices, name) {
    const stem = name.replace(/ List$/, '');
    return choices[name] || choices[stem] || choices[singular(name)] || choices[singular(stem)] || null;
  }

  function spec(template) {
    const out = { header: [], tracks: [], counters: [], ratings: [], lists: [], texts: [], picks: [] };
    const choices = {};
    (template.choices || []).forEach((c) => {
      if (c.name) choices[c.name] = c;
    });
    // the actor chain's declarations first, then whatever the template carries that no actor
    // declared (a Playbook's Special Ability List, Item List, Experience…)
    const decls = declared(template);
    const names = decls.map((d) => d.name);
    (template.props || []).forEach((tp) => names.indexOf(tp.name) === -1 && names.push(tp.name));
    // an actor's "Special Abilities" / "Items" and a Playbook's "Special Ability List" / "Item
    // List" are one list: the declaration's name, the template's items
    const stem = (n) => singular(n.replace(/ List$/, ''));
    const alias = {};
    names.forEach((n) => {
      const d = decls.find((x) => x.name === n);
      if (!d) return;
      const twin = (template.props || []).find((tp) => tp.name !== n && stem(tp.name) === stem(n) && !decls.some((x) => x.name === tp.name));
      if (twin) alias[n] = twin.name;
    });
    const taken = new Set(Object.values(alias));
    names.forEach((name) => {
      if (name === 'Name' || taken.has(name)) return;
      const p = decls.find((d) => d.name === name) || null;
      const tv = templateProp(template, alias[name] || name);
      const shape = p || tv;           // the declaration when there is one, else the template value's own shape
      if (!shape) return;
      if (shape.vk === 'scalar' && (shape.type === 'INTEGER' || (p == null && typeof (tv && tv.value) === 'number'))) {
        if (p && p.max != null) out.tracks.push({ name, min: p.min || 0, max: p.max, start: tv && tv.value != null ? tv.value : 0 });
        else if (p && !(tv && tv.value != null && p.fixed)) out.counters.push({ name, min: p.min || 0, start: tv && tv.value != null ? tv.value : 0 });
        else if (tv && tv.value != null) out.header.push({ name, value: tv.value });   // a template constant (Starting Action Points, Magic Picks)
        return;
      }
      if (shape.vk === 'scalar') {
        if (tv && tv.value != null) out.header.push({ name, value: tv.value });
        return;
      }
      if (shape.vk === 'list' && /Rating$/.test(shape.of || '')) {
        const rs = ratingSpec(shape);
        if (!rs) return;
        const start = {};
        ((tv && tv.items) || []).forEach((it) => {
          if (it.vk !== 'def') return;
          const ax = (it.fields || []).find((f) => f.name === rs.axisField);
          const n = (it.fields || []).find((f) => f.name === rs.field);
          if (ax && n) start[(ax.ref && ax.ref.name) || ax.value] = n.value;
        });
        const axisEntities = rs.axisType ? D.byType(rs.axisType, books()) : [];
        const axes = axisEntities.map((a) => a.name);
        Object.keys(start).forEach((k) => axes.indexOf(k) === -1 && axes.push(k));
        out.ratings.push({ name, axes, axisEntities, start, max: rs.max });
        return;
      }
      if (shape.vk === 'list' && shape.of === 'STRING') {
        out.texts.push({ name, start: ((tv && tv.items) || []).map((it) => it.value) });
        return;
      }
      if (shape.vk === 'list') {
        let items = ((tv && tv.items) || []).filter((it) => it.vk === 'ref').map((it) => ({ hash: it.hash, name: it.name }));
        const c = choiceFor(choices, name);
        // a shared sheet made straight from an ACTOR (the Outfit) lists nothing of its own: offer
        // every entity of the list's type in the campaign's books (Boons, Purchases, Affiliations…)
        if (!items.length && !c && template.form === 'ACTOR' && shape.of) items = D.byType(shape.of, books()).map((e) => ({ hash: e.id, name: e.name }));
        if (!items.length && !c) return;                       // an actor list the template leaves empty (Mutations)
        if (c) c.used = true;
        out.lists.push({ name, type: shape.of, items: items.length ? items : c.items, pick: c ? c.pick : null, fixed: !c });
        return;
      }
      if (shape.vk === 'ref') {
        const c = choiceFor(choices, name);
        const typeName = shape.ref && shape.ref.name;
        const options = c && c.items.length ? c.items : (typeName ? D.byType(typeName, books()).map((e) => ({ hash: e.id, name: e.name })) : []);
        if (c) c.used = true;
        if (tv && tv.ref && tv.ref.hash) out.header.push({ name, ref: tv.ref });
        else out.picks.push({ name, type: typeName, options, pick: c ? c.pick || 1 : 1 });
      }
    });
    // choices nothing above consumed (a Playbook's Discipline / Method) are picks of their own
    Object.keys(choices).forEach((name) => {
      const c = choices[name];
      if (!c.used && !out.lists.some((l) => l.name === name) && !out.picks.some((pk) => pk.name === name)) out.picks.push({ name, type: null, options: c.items, pick: c.pick || 1 });
      delete c.used;
    });
    out.rubrics = (template.choices || []).filter((c) => c.rubric).map((c) => c.rubric);
    return out;
  }

  // ── members ────────────────────────────────────────────────────────
  function newMember(templateId, name) {
    const t = D.entity(templateId);
    const sp = spec(t);
    const live = { tracks: {}, counters: {}, ratings: {}, lists: {}, picks: {}, texts: {} };
    sp.tracks.forEach((tr) => (live.tracks[tr.name] = tr.start));
    sp.counters.forEach((c) => (live.counters[c.name] = c.start));
    sp.ratings.forEach((r) => (live.ratings[r.name] = Object.assign({}, r.start)));
    sp.texts.forEach((tx) => (live.texts[tx.name] = tx.start.slice()));
    // a "Starting Coin" style value seeds the track of the same stem
    sp.header.forEach((h) => {
      const m = /^Starting (.+)$/.exec(h.name);
      if (m && live.tracks[m[1]] != null && typeof h.value === 'number') live.tracks[m[1]] = h.value;
    });
    return { id: State.genId('pc'), templateId, name: name || t.name, live, notes: '', playerNotes: '' };
  }

  function member(id) {
    return (S().party || []).find((m) => m.id === id) || null;
  }

  function patch(m, key, value) {
    const next = Object.assign({}, m.live[key] || {}, value);
    State.commit('setPartyLive', [m.id, { [key]: next }]);
  }

  // ── dice ───────────────────────────────────────────────────────────
  function rollEntity() {
    // the module's own roll first, then the core's
    const bs = books() || [];
    const rolls = D.byType('Roll', bs).filter((r) => r.outcomes && r.outcomes.some((o) => o[0] === 'Multiple 6'));
    return rolls.find((r) => D.book(r.book) && D.book(r.book).kind !== 'core') || rolls[0] || null;
  }

  function ladder(dice, roll) {
    const sixes = dice.filter((d) => d === 6).length;
    const best = Math.max.apply(null, dice);
    const band = sixes > 1 ? 'Multiple 6' : best === 6 ? '6' : best >= 4 ? '4-5' : '1-3';
    const text = roll ? (roll.outcomes.find((o) => o[0] === band) || [])[1] : null;
    return { band, best, text };
  }

  function rollPool(n) {
    // 0 dice: roll two and take the lowest (the book's rule for an unrated action)
    const count = n > 0 ? n : 2;
    const dice = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * 6));
    if (n > 0) return { dice, kept: dice, zero: false };
    return { dice, kept: [Math.min.apply(null, dice)], zero: true };
  }

  function doRoll(m, axis, rating, extra) {
    const r = rollEntity();
    const pool = rollPool(rating + (extra || 0));
    const res = ladder(pool.kept, r);
    const entry = {
      at: new Date().toISOString(), kind: 'roll', memberId: m.id, who: m.name, axis, rating: rating + (extra || 0),
      dice: pool.dice, zero: pool.zero, band: res.band, text: res.text,
    };
    State.commit('appendLog', [entry]);
    Bus.emit('roll', entry);
    return entry;
  }

  // ── rendering ──────────────────────────────────────────────────────
  function boxes(count, value, onSet, cls) {
    const row = el('div', { class: 'boxes ' + (cls || '') });
    for (let i = 1; i <= count; i++) {
      row.appendChild(el('button', { class: 'box' + (i <= value ? ' on' : ''), type: 'button', title: String(i), onclick: () => onSet(i <= value && i === value ? i - 1 : i) }));
    }
    return row;
  }

  function diamonds(max, value, onSet) {
    return boxes(max, value, onSet, 'diamonds');
  }

  function trackRow(m, tr) {
    const v = (m.live.tracks || {})[tr.name] || 0;
    const trackEntity = D.byType('Track', books()).concat(D.byType('Clock', books())).find((t) => t.name === tr.name || t.name === tr.name + ' Track');
    const thresholds = trackEntity ? trackEntity.thresholds.map((th) => {
      const seg = (th.fields || []).find((f) => f.name === 'Segment');
      const eff = (th.fields || []).find((f) => f.name === 'Effect');
      return seg && eff ? { at: seg.value, text: eff.value } : null;
    }).filter(Boolean) : [];
    const hit = thresholds.filter((th) => v >= th.at).pop();
    return el('div', { class: 'track' }, [
      el('div', { class: 'track-head' }, [el('span', { class: 'track-name' }, [tr.name]), el('span', { class: 'muted' }, [`${v} / ${tr.max}`])]),
      boxes(tr.max, v, (n) => patch(m, 'tracks', { [tr.name]: Math.max(tr.min, n) })),
      hit ? el('div', { class: 'threshold' }, [hit.text]) : null,
    ]);
  }

  function counterRow(m, c) {
    const v = (m.live.counters || {})[c.name] || 0;
    return el('div', { class: 'counter' }, [
      el('span', { class: 'track-name' }, [c.name]),
      button('−', () => patch(m, 'counters', { [c.name]: Math.max(c.min, v - 1) }), 'ghost tiny'),
      el('b', {}, [String(v)]),
      button('+', () => patch(m, 'counters', { [c.name]: v + 1 }), 'ghost tiny'),
    ]);
  }

  function ratingRows(m, r, log) {
    const cur = (m.live.ratings || {})[r.name] || {};
    const total = r.axes.reduce((a, k) => a + (cur[k] || 0), 0);
    return el('section', { class: 'ratings' }, [
      el('h4', {}, [r.name, el('span', { class: 'muted' }, [` · ${total} points`])]),
      ...r.axes.map((axis) => {
        const ent = r.axisEntities.find((a) => a.name === axis);
        const v = cur[axis] || 0;
        return el('div', { class: 'rating' }, [
          diamonds(r.max, v, (n) => patch(m, 'ratings', { [r.name]: Object.assign({}, cur, { [axis]: n }) })),
          ent ? E.link({ hash: ent.id, name: ent.name }) : el('span', {}, [axis]),
          button('Roll', () => {
            const entry = doRoll(m, axis, v);
            if (log) log(entry);
          }, 'ghost tiny roll'),
        ]);
      }),
    ]);
  }

  function listRows(m, l) {
    const chosen = (m.live.lists || {})[l.name] || [];
    const limit = l.pick;
    return el('section', {}, [
      el('h4', {}, [l.name, limit ? el('span', { class: 'muted' }, [` · pick ${limit} (${chosen.length} chosen)`]) : null]),
      el('div', { class: 'checklist' }, l.items.map((it) => {
        const on = chosen.indexOf(it.hash) !== -1;
        const e = D.entity(it.hash);
        const text = e ? (e.desc || D.propValue(e, 'Text') || D.propValue(e, 'Description')) : null;
        return el('label', { class: 'check' + (on ? ' on' : '') }, [
          el('input', { type: 'checkbox', checked: on || null, onchange: (ev) => {
            let next = chosen.filter((h) => h !== it.hash);
            if (ev.target.checked) next = next.concat([it.hash]);
            patch(m, 'lists', { [l.name]: next });
          } }),
          el('span', { class: 'check-body' }, [
            e ? E.link({ hash: e.id, name: e.name }) : el('b', {}, [it.name]),
            typeof text === 'string' && text !== e.name ? el('div', { class: 'check-text' }, [text]) : null,
          ]),
        ]);
      })),
    ]);
  }

  function pickRow(m, pk) {
    const chosen = (m.live.picks || {})[pk.name] || [];
    const multi = pk.pick > 1;
    return el('div', { class: 'prop' }, [
      el('div', { class: 'prop-k' }, [pk.name + (multi ? ` · pick ${pk.pick}` : '')]),
      el('div', { class: 'prop-v chips picks' }, pk.options.length ? pk.options.map((o) => {
        const on = chosen.indexOf(o.hash) !== -1;
        return el('button', { class: 'pick' + (on ? ' on' : ''), type: 'button', onclick: () => {
          let next;
          if (multi) next = on ? chosen.filter((h) => h !== o.hash) : chosen.concat([o.hash]);
          else next = on ? [] : [o.hash];
          patch(m, 'picks', { [pk.name]: next });
        }, oncontextmenu: (ev) => { ev.preventDefault(); E.selectEntity(o.hash); } }, [o.name]);
      }) : [el('input', { type: 'text', class: 'text', placeholder: pk.type || '', value: chosen[0] || '', onchange: (ev) => patch(m, 'picks', { [pk.name]: ev.target.value ? [ev.target.value] : [] }) })]),
    ]);
  }

  function textRows(m, tx) {
    const lines = (m.live.texts || {})[tx.name] || [];
    // Injury Levels give the boxes ("Level one: 2 boxes") — the character's own book's first
    // (an Ingenue's are Blood Cotillion's, not the core's), else the campaign's
    const t = D.entity(m.templateId);
    const own = tx.name === 'Injuries' && t ? D.byType('Injury Level', [t.book]) : [];
    const levels = tx.name === 'Injuries' ? (own.length ? own : D.byType('Injury Level', books())) : [];
    const rows = levels.length
      ? levels.map((lv) => {
          const n = D.propValue(lv, 'Boxes') || 0;
          const pen = D.propValue(lv, 'Penalty');
          return el('div', { class: 'injury-level' }, [
            el('div', { class: 'track-name' }, [E.link({ hash: lv.id, name: lv.name }), pen ? el('span', { class: 'muted' }, [' · ' + pen]) : null]),
            ...Array.from({ length: n }, (_, i) => {
              const key = lv.name + ' ' + (i + 1);
              const cur = lines.find((x) => typeof x === 'object' && x.slot === key);
              return el('input', { type: 'text', class: 'text injury', placeholder: '—', value: cur ? cur.text : '', onchange: (ev) => {
                const rest = lines.filter((x) => !(typeof x === 'object' && x.slot === key));
                patch(m, 'texts', { [tx.name]: ev.target.value ? rest.concat([{ slot: key, text: ev.target.value }]) : rest });
              } });
            }),
          ]);
        })
      : [el('textarea', { rows: 2, placeholder: tx.name, oninput: debounce((ev) => patch(m, 'texts', { [tx.name]: ev.target.value.split('\n').filter(Boolean) }), 400) }, [lines.filter((x) => typeof x === 'string').join('\n')])];
    return el('section', {}, [el('h4', {}, [tx.name]), ...rows]);
  }

  function rollLine(entry) {
    return el('div', { class: 'roll-line band-' + entry.band.replace(/[^a-z0-9]/gi, '').toLowerCase() }, [
      el('span', { class: 'roll-who' }, [entry.who + ' · ' + entry.axis + ' ' + entry.rating]),
      el('span', { class: 'roll-dice' }, entry.dice.map((d) => el('span', { class: 'die' + (entry.zero && d !== Math.min.apply(null, entry.dice) ? ' dropped' : '') }, [String(d)]))),
      el('b', {}, [entry.band]),
      entry.text ? el('span', { class: 'roll-text' }, [entry.text]) : null,
    ]);
  }

  // The live sheet of a party member.
  function live(m, opts) {
    opts = opts || {};
    const t = D.entity(m.templateId);
    if (!t) return el('div', { class: 'empty' }, ['This character\'s playbook is not in the loaded books (' + m.templateId + ').']);
    const sp = spec(t);
    const rollLog = el('div', { class: 'roll-log' });
    const log = (entry) => rollLog.prepend(rollLine(entry));
    (S().log || []).filter((x) => x.kind === 'roll' && x.memberId === m.id).slice(-5).reverse().forEach((x) => rollLog.appendChild(rollLine(x)));
    const header = el('header', { class: 'sheet-head' }, [
      el('h2', {}, [m.name]),
      el('div', { class: 'meta' }, [E.link({ hash: t.id, name: t.name }), el('span', { class: 'muted' }, [t.form === 'ACTOR' ? 'a shared sheet' : (t.type || '')])]),
      ...sp.header.map((h) => h.ref ? el('div', { class: 'prop' }, [el('div', { class: 'prop-k' }, [h.name]), el('div', { class: 'prop-v' }, [E.link(h.ref)])])
        : typeof h.value === 'string' && h.value.length > 60 ? el('details', { class: 'sheet-text' }, [el('summary', {}, [h.name]), paragraphs(h.value, 'prose small')])
        : el('div', { class: 'tagline' }, [el('span', { class: 'muted' }, [h.name + ': ']), String(h.value)])),
    ]);
    const body = el('div', { class: 'sheet-body' }, [
      sp.tracks.length ? el('section', { class: 'tracks' }, [el('h4', {}, ['Tracks']), ...sp.tracks.map((tr) => trackRow(m, tr))]) : null,
      sp.counters.length ? el('section', { class: 'counters' }, sp.counters.map((c) => counterRow(m, c))) : null,
      ...sp.ratings.map((r) => ratingRows(m, r, log)),
      el('section', { class: 'rolls' }, [el('h4', {}, ['Rolls']), rollLog]),
      sp.picks.length ? el('section', {}, [el('h4', {}, ['Choices']), ...sp.picks.map((pk) => pickRow(m, pk))]) : null,
      ...sp.lists.map((l) => listRows(m, l)),
      ...sp.texts.map((tx) => textRows(m, tx)),
      sp.rubrics.length ? el('div', { class: 'rubric' }, [sp.rubrics.join(' · ')]) : null,
      opts.player ? null : el('section', { class: 'gm-notes' }, [
        el('h4', {}, ['GM notes ', el('span', { class: 'muted' }, ['(never sent to players)'])]),
        el('textarea', { rows: 3, oninput: debounce((ev) => State.commit('setPartyNotes', [m.id, ev.target.value]), 400) }, [m.notes || '']),
      ]),
      el('section', { class: 'player-notes' }, [
        el('h4', {}, ['Player notes']),
        el('textarea', { rows: 3, oninput: debounce((ev) => State.commit('setPartyPlayerNotes', [m.id, ev.target.value]), 400) }, [m.playerNotes || '']),
      ]),
    ]);
    return el('article', { class: 'sheet' }, [header, body]);
  }

  // The Inspector's view of a TEMPLATE: the entity as printed plus "Add to party".
  function standalone(e) {
    return e.form === 'ACTOR' && !D.all().some((x) => x.form === 'TEMPLATE' && x.typeHash === e.id);
  }

  function render(e) {
    if (e.form !== 'TEMPLATE' && !standalone(e)) return null;
    const add = button(e.form === 'ACTOR' ? 'Add to party as a shared sheet…' : 'Add to party as…', () => {
      const name = prompt('Character name', e.name);
      if (name == null) return;
      const m = newMember(e.id, name);
      State.commit('addPartyMember', [m]);
      window.VttPanels.select({ kind: 'party', id: m.id });
    });
    const wrap = E.render(e);
    wrap.querySelector('.ent-head').appendChild(el('div', { class: 'chiprow' }, [add]));
    return wrap;
  }

  return { spec, newMember, member, live, render, doRoll, rollLine, rollEntity, standalone };
})();
