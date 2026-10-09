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
  // the campaign's books, whichever page this sheet is on (the player's page has no panels);
  // a page showing sheets outside a campaign (the site's character selector) sets a scope
  let bookScope = null;
  const books = () => {
    if (bookScope) return bookScope;
    if (window.VttSystem && window.VttSystem.playBooks) return window.VttSystem.playBooks();   // reference books + the modules in play
    const b = (S().campaign && S().campaign.books) || [];
    return b.length ? b : null;
  };
  function scope(bookIds) {
    bookScope = bookIds && bookIds.length ? bookIds.slice() : null;
  }

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

  // A preview member (m.preview set) is never committed: the sheet changes in memory
  // and the page redraws — the site's "try the sheet", nothing saved anywhere.
  function patch(m, key, value) {
    const next = Object.assign({}, m.live[key] || {}, value);
    if (m.preview) {
      m.live[key] = next;
      if (m.preview.onChange) m.preview.onChange();
      return;
    }
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

  // What the next roll carries beyond the rating: dice from a push or the GM's bargain, effect
  // from a push or an assist. Per member, per window, cleared by the roll it goes on.
  const armed = {};
  const mounted = {};            // memberId -> redraw of the live sheet last drawn for them on this page
  function armedFor(m) {
    return armed[m.id] || (armed[m.id] = { dice: 0, effect: 0, why: [], level: 2 });
  }
  // The book's range of Effect: "Poor—Limited—Reasonable—Superb". The GM sets it before the roll;
  // the sheet carries the level set (Reasonable until changed), +1E / -1E move along it.
  const EFFECT_LEVELS = ['Poor', 'Limited', 'Reasonable', 'Superb'];
  // the book's Positions (the campaign's books' Position entities; the core's names failing that)
  const POSITIONS = ['Controlled', 'Risky', 'Desperate'];
  function positions() {
    return POSITIONS.slice();
  }
  function positionText(name, m) {
    const t = m ? D.entity(m.templateId) : null;
    const bs = (t ? [t.book] : []).concat(books() || []);
    const e = D.byType('Position', bs).find((x) => x.name === name);
    return e ? (D.propValue(e, 'Description') || e.desc || '') : '';
  }
  function callFor(m) {
    return ((S().calls || {})[m.id]) || null;
  }

  // ── injuries: the book's levels, the boxes filled, the penalty the worst one carries ──
  function injuryLevels(m) {
    const t = D.entity(m.templateId);
    const own = t ? D.byType('Injury Level', [t.book]) : [];
    return (own.length ? own : D.byType('Injury Level', books())).filter((lv) => (D.propValue(lv, 'Boxes') || 0) > 0).sort((a, b) => (D.propValue(a, 'Level') || 0) - (D.propValue(b, 'Level') || 0));
  }
  function injurySlots(m, lv) {
    const lines = (m.live.texts || {}).Injuries || [];
    const n = D.propValue(lv, 'Boxes') || 0;
    return Array.from({ length: n }, (_, i) => {
      const key = lv.name + ' ' + (i + 1);
      return { key, line: lines.find((x) => typeof x === 'object' && x.slot === key && x.text) || null };
    });
  }
  // the level's own words, and what they do to a roll: "-1E" / "Less Effect" steps the Effect down,
  // "-1D" / "less one dice" takes a die, the mortal level's rule is shown as it is
  function injuryPenalty(lv) {
    const pen = D.propValue(lv, 'Penalty') || '';
    const desc = D.propValue(lv, 'Description') || lv.desc || '';
    const both = pen + ' ' + desc;
    // the core prints no Penalty field: its sentence on the penalty stands in ("Less Effect for Actions relevant to the Injury.")
    const sentence = (desc.match(/[^.]*(?:-1[DE]|less (?:one|1) dice|less effect|cannot act)[^.]*\./i) || [''])[0].trim();
    const text = pen || sentence || desc;
    if (/-1D|less (?:one|1) dice/i.test(both)) return { text, dice: -1, effect: 0 };
    if (/-1E|less effect/i.test(both)) return { text, dice: 0, effect: -1 };
    return { text: pen && sentence ? sentence : (desc || pen), dice: 0, effect: 0 };
  }
  // "the injury applies to the next roll": set itself when an injury level fills, spent by the roll it
  // applies to, and otherwise the player's (or GM's) to tick by hand. Kept on the sheet, so every
  // window sees the same answer.
  function injuryArmed(m) {
    return !!((m.live.flags || {}).injuryArmed);
  }
  function armInjury(m, on) {
    patch(m, 'flags', { injuryArmed: !!on });
  }
  function worstInjury(m) {
    let worst = null;
    injuryLevels(m).forEach((lv) => {
      if (injurySlots(m, lv).some((s) => s.line)) worst = lv;
    });
    return worst;
  }
  // take an injury at a level (the next empty box; a full level goes up a tier, as the book says), or clear one
  function takeInjury(m, lv) {
    const levels = injuryLevels(m);
    let at = levels.indexOf(lv);
    while (at !== -1 && at < levels.length) {
      const slot = injurySlots(m, levels[at]).find((s) => !s.line);
      if (slot) {
        const lines = (m.live.texts || {}).Injuries || [];
        const next = lines.concat([{ slot: slot.key, text: 'injury' }]);
        patch(m, 'texts', { Injuries: next });
        logAction(m, `${m.name} takes a ${levels[at].name} injury — ${injuryPenalty(levels[at]).text}`);
        if (injurySlots(m, levels[at]).every((s) => next.some((x) => typeof x === 'object' && x.slot === s.key && x.text))) armInjury(m, true);   // the level filled: it applies to the next roll
        return;
      }
      at += 1;
    }
  }
  function healInjury(m, lv) {
    const filled = injurySlots(m, lv).filter((s) => s.line);
    if (!filled.length) return;
    const key = filled[filled.length - 1].key;
    const lines = (m.live.texts || {}).Injuries || [];
    patch(m, 'texts', { Injuries: lines.filter((x) => !(typeof x === 'object' && x.slot === key)) });
  }

  function doRoll(m, axis, rating, extra, call) {
    const r = rollEntity();
    const a = armedFor(m);
    const applies = injuryArmed(m);
    const worst = applies ? worstInjury(m) : null;
    const pen = worst ? injuryPenalty(worst) : null;
    const bonus = (extra || 0) + a.dice + (pen ? pen.dice : 0);
    const pool = rollPool(rating + bonus);
    const res = ladder(pool.kept, r);
    // the Effect: the GM's call when there is one, else the level the sheet carries
    const baseLevel = call && EFFECT_LEVELS.indexOf(call.effect) !== -1 ? EFFECT_LEVELS.indexOf(call.effect) : a.level;
    const level = Math.max(0, Math.min(EFFECT_LEVELS.length - 1, baseLevel + a.effect + (pen ? pen.effect : 0)));
    const entry = {
      at: new Date().toISOString(), kind: 'roll', memberId: m.id, who: m.name, axis, rating: rating + bonus,
      base: rating, extra: bonus, effect: a.effect, why: a.why.slice(),
      position: call ? call.position : null, called: !!call,
      effectBase: EFFECT_LEVELS[baseLevel], effectLevel: EFFECT_LEVELS[level],
      injury: worst ? { name: worst.name, penalty: pen.text, dice: pen.dice, effect: pen.effect } : null,
      dice: pool.dice, zero: pool.zero, band: res.band, text: res.text,
    };
    a.dice = 0;                    // in place: the sheet's actions bar holds this same object
    a.effect = 0;
    a.why = [];
    if (m.preview) return entry;
    State.commit('appendLog', [entry]);
    if (applies) armInjury(m, false);                 // it applied once; tick it again by hand if it still does
    if (call) State.commit('clearCall', [m.id]);     // the call is answered
    Bus.emit('roll', entry);
    return entry;
  }

  // ── special abilities: the chosen ones as buttons; a press spends what the text says, arms
  // what it grants (+1D, +1E, "Greater Effect") and logs the use for the table ──
  function abilityLists(sp) {
    return sp.lists.filter((l) => /Abilit/i.test(l.type || '') || /Abilit/i.test(l.name));
  }
  function abilityText(e) {
    return e ? (e.desc || D.propValue(e, 'Text') || D.propValue(e, 'Description') || '') : '';
  }
  function abilityTerms(text) {
    const cost = /(?:spend(?:ing)?|using|use|for|costs?|takes?|with)\s+(\d+)\s+(Guts|Stress)/i.exec(text);
    const free = /no (?:Guts|Stress) cost/i.test(text);
    const dice = /\+(\d)D/i.exec(text);
    const eff = /\+(\d)E/i.exec(text);
    const everyone = /(?:each|every|all) (?:other )?players?[’']?s?(?: next)? roll|each players’ next roll/i.test(text);
    return { cost: cost && !free ? { n: parseInt(cost[1], 10), res: cost[2] } : null, dice: dice ? parseInt(dice[1], 10) : 0, effect: eff ? parseInt(eff[1], 10) : (/Greater Effect/i.test(text) ? 1 : 0), everyone };
  }
  // arm a sheet's next roll from outside it (an ability for every player, from another device):
  // the room relays the event; every page applies it to the members named and redraws their sheets
  function armMembers(ids, dice, effect, why) {
    const party = S().party || [];
    const targets = ids === 'all' ? party : party.filter((m) => ids.indexOf(m.id) !== -1);
    targets.forEach((m) => {
      const a = armedFor(m);
      a.dice += dice || 0;
      a.effect += effect || 0;
      if (why) a.why.push(why);
      if (mounted[m.id]) mounted[m.id]();
    });
  }
  Bus.on('arm', (p) => {
    if (!p || !p.ids) return;
    armMembers(p.ids, p.dice, p.effect, p.why);
  });
  function chosenAbilities(m, sp) {
    const out = [];
    abilityLists(sp).forEach((l) => {
      const chosen = (m.live.lists || {})[l.name] || [];
      l.items.forEach((it) => {
        if (!l.fixed && !(l.pick && l.pick >= l.items.length) && chosen.indexOf(it.hash) === -1) return;
        const e = D.entity(it.hash);
        if (!e) return;
        const text = abilityText(e);
        const label = e.type === 'Sheet Ability' ? (text.length > 56 ? text.slice(0, 54).replace(/\s+\S*$/, '') + '…' : text) : e.name;
        out.push({ e, text, label: label || e.name });
      });
    });
    return out;
  }

  // ── named actions: Push, Assist (the book's costs: 2 and 1 of Guts or Stress) ──
  // The resource is the sheet's Guts track where it has one (the Hogmen), else its Stress;
  // both fill. At the limit the book's condition applies (Hysteria / Aberrant / Erratic) and
  // the sheet says so instead of spending.
  function resourceOf(sp) {
    return sp.tracks.find((t) => t.name === 'Guts') || sp.tracks.find((t) => t.name === 'Stress') || null;
  }
  const COSTS = { push: 2, assist: 1 };
  // the book's own words on these, for the link beside the buttons: the core's Stress Sources,
  // a one-shot's Guts / Stress and Team Actions sections (the character's book first)
  function ruleLink(m, names, opts) {
    if (opts && opts.player) return null;        // the player's page has no Inspector: the link would do nothing
    const t = D.entity(m.templateId);
    const bs = (t ? [t.book] : []).concat(books() || []);
    for (const bid of bs) {
      const e = D.all([bid]).find((x) => names.indexOf(x.name) !== -1 && x.form === 'DEF' && (x.desc || x.props.some((p) => p.name === 'Cost')));
      if (e) return E.link({ hash: e.id, name: e.name }, 'in the book');
    }
    return null;
  }
  function logAction(m, text) {
    const entry = { at: new Date().toISOString(), kind: 'action', memberId: m.id, who: m.name, text };
    if (m.preview) return entry;
    State.commit('appendLog', [entry]);
    return entry;
  }
  // a track set to a value; Guts or Stress reaching its limit is told to the table
  function setTrack(m, tr, n) {
    const cur = (m.live.tracks || {})[tr.name] || 0;
    const next = Math.max(tr.min || 0, Math.min(tr.max, n));
    patch(m, 'tracks', { [tr.name]: next });
    if (next >= tr.max && cur < tr.max && /^(Guts|Stress)$/.test(tr.name)) logAction(m, `${m.name} has used up their ${tr.name} (${next} / ${tr.max})`);
  }
  function spend(m, res, n) {
    const cur = (m.live.tracks || {})[res.name] || 0;
    setTrack(m, res, cur + n);
  }
  function actionsBar(m, sp, opts, redraw) {
    const res = resourceOf(sp);
    if (!res) return null;
    const cur = (m.live.tracks || {})[res.name] || 0;
    const left = res.max - cur;
    const a = armedFor(m);
    const spent = (n) => (left >= n ? null : `No ${res.name} left — ${left} of ${n} needed`);
    const pushBtn = (what) => {
      const b = button(`Push +1${what} (${COSTS.push} ${res.name})`, () => {
        spend(m, res, COSTS.push);
        if (what === 'D') a.dice += 1; else a.effect += 1;
        a.why.push('push');
        logAction(m, `${m.name} pushes themselves: ${COSTS.push} ${res.name} for +1${what}`);
        redraw();
      }, 'ghost tiny');
      const why = spent(COSTS.push);
      if (why) { b.disabled = true; b.title = why; }
      return b;
    };
    const others = (S().party || []).filter((x) => x.id !== m.id);
    const who = el('select', { class: 'vtt-num assist-who' }, others.map((o) => el('option', { value: o.id }, [o.name])));
    const assistBtn = button(`Assist (${COSTS.assist} ${res.name})`, () => {
      const o = others.find((x) => x.id === who.value);
      if (!o) return;
      spend(m, res, COSTS.assist);
      logAction(m, `${m.name} assists ${o.name}: ${COSTS.assist} ${res.name} for +1E`);
      redraw();
    }, 'ghost tiny');
    const whyA = !others.length ? 'No one else in the party to assist' : spent(COSTS.assist);
    if (whyA) { assistBtn.disabled = true; assistBtn.title = whyA; }
    const toggle = (what) => {
      const on = what === 'D' ? a.dice > 0 : a.effect > 0;
      return el('button', { class: 'btn ghost tiny' + (on ? ' active' : ''), type: 'button', title: `Carry +1${what} on the next roll without spending (an item, a bargain with the GM, an ally's assist)`, onclick: () => { if (what === 'D') a.dice = on ? 0 : 1; else a.effect = on ? 0 : 1; redraw(); } }, [`+1${what} next roll${on ? ' ✓' : ''}`]);
    };
    const armedNote = a.dice || a.effect ? el('span', { class: 'muted' }, [`next roll: ${a.dice ? '+' + a.dice + 'D ' : ''}${a.effect ? '+' + a.effect + 'E' : ''}`]) : null;
    // the Effect the GM set for the action (the book's range), carried until changed
    const levelSel = el('select', { class: 'vtt-num effect-level', title: 'The Effect the GM set before the roll — +1E and injuries move along it' }, EFFECT_LEVELS.map((lv, i) => el('option', { value: String(i), selected: i === a.level || null }, [lv])));
    levelSel.addEventListener('change', () => { a.level = parseInt(levelSel.value, 10); redraw(); });
    const effectRow = el('div', { class: 'chiprow' }, [el('span', { class: 'muted' }, ['Effect']), levelSel, ruleLink(m, ['Effect'], opts), toggle('D'), toggle('E'), armedNote]);
    // injuries: each level's boxes with take / heal, for the GM and the player alike
    const worst = worstInjury(m);
    const injuryRows = injuryLevels(m).map((lv) => {
      const slots = injurySlots(m, lv);
      const pen = injuryPenalty(lv);
      const whole = (D.propValue(lv, 'Description') || lv.desc || pen.text || '').trim();
      const tip = pen.text && whole && pen.text !== whole ? `${pen.text} — ${whole}` : (whole || pen.text);
      const marks = el('span', { class: 'injury-marks' }, slots.map((s) => el('span', { class: 'mark' + (s.line ? ' on' : ''), title: s.line ? s.line.text : 'empty' })));
      const minus = button('−', () => { healInjury(m, lv); redraw(); }, 'ghost tiny');
      const plus = button('+', () => { takeInjury(m, lv); redraw(); }, 'ghost tiny');
      minus.title = 'Heal one box';
      plus.title = 'Take an injury at this level (a full level goes up a tier)';
      if (!slots.some((s) => s.line)) minus.disabled = true;
      if (slots.every((s) => s.line) && lv === injuryLevels(m)[injuryLevels(m).length - 1]) plus.disabled = true;
      const short = pen.text && pen.text.length <= 24 ? pen.text : null;     // "Less Effect", "-1D" inline; a sentence stays in the tooltip
      return el('div', { class: 'injury-row' + (worst === lv ? ' worst' : ''), title: tip }, [opts.player ? el('b', { class: 'level-name' }, [lv.name]) : E.link({ hash: lv.id, name: lv.name }), marks, minus, plus, short ? el('span', { class: 'muted' }, [short]) : null]);
    });
    const applies = el('label', { class: 'muted injury-applies', title: 'Ticks itself when an injury level fills; one roll spends it; tick it by hand for another' }, [el('input', { type: 'checkbox', checked: injuryArmed(m) || null, onchange: (ev) => armInjury(m, ev.target.checked) }), ' the injury applies to the next roll']);
    const injurySection = injuryRows.length ? el('div', { class: 'injuries' }, [el('div', { class: 'chiprow' }, [el('span', { class: 'muted' }, ['Injuries']), worst ? applies : null]), ...injuryRows]) : null;
    // the abilities chosen, as buttons
    const abilities = chosenAbilities(m, sp);
    const abilityBtns = abilities.map((ab) => {
      const terms = abilityTerms(ab.text);
      const b = button(ab.label, () => {
        if (terms.cost && terms.cost.res === res.name) spend(m, res, terms.cost.n);
        if (terms.everyone && (terms.dice || terms.effect)) {
          // every player's next roll: the bus applies it to this page's sheets and the room carries it to the other devices
          Bus.emit('arm', { ids: 'all', dice: terms.dice, effect: terms.effect, why: ab.e.name, from: m.id });
        } else {
          if (terms.dice) a.dice += terms.dice;
          if (terms.effect) a.effect += terms.effect;
          if (terms.dice || terms.effect) a.why.push(ab.e.name);
        }
        logAction(m, `${m.name} uses ${ab.e.type === 'Sheet Ability' ? 'an ability' : ab.e.name}: ${ab.text}` + (terms.everyone && (terms.dice || terms.effect) ? ` — ${terms.dice ? '+' + terms.dice + 'D ' : ''}${terms.effect ? '+' + terms.effect + 'E' : ''} on everyone's next roll` : ''));
        redraw();
      }, 'ghost tiny ability');
      b.title = ab.text + (terms.cost ? ` — costs ${terms.cost.n} ${terms.cost.res}` : '') + (terms.dice || terms.effect ? ` — arms ${terms.dice ? '+' + terms.dice + 'D ' : ''}${terms.effect ? '+' + terms.effect + 'E' : ''} for ${terms.everyone ? 'every player\u2019s' : 'the'} next roll` : '');
      if (terms.cost && terms.cost.res === res.name && left < terms.cost.n) { b.disabled = true; b.title = `No ${res.name} left — ${left} of ${terms.cost.n} needed`; }
      return b;
    });
    const abilityRow = abilityBtns.length ? el('div', { class: 'chiprow abilities' }, [el('span', { class: 'muted' }, ['Abilities']), ...abilityBtns]) : null;
    // the GM's call, when one stands: Position · Effect · Action, and the roll that answers it
    const call = callFor(m);
    let callBlock = null;
    if (call) {
      const rating = (() => { for (const r of sp.ratings) { const cur = (m.live.ratings || {})[r.name] || {}; if (r.axes.indexOf(call.axis) !== -1) return cur[call.axis] || 0; } return 0; })();
      const rollBtn = button(`Roll ${call.axis} (${rating})`, () => { const entry = doRoll(m, call.axis, rating, 0, call); if (!m.preview) { const rl = document.querySelector('.rolls .roll-log'); if (rl) rl.prepend(rollLine(entry)); } redraw(); }, 'roll call-roll');
      callBlock = el('div', { class: 'gm-call' }, [
        el('div', { class: 'call-head' }, [el('b', {}, ['The GM calls']), el('span', { class: 'muted' }, [call.note ? ` · ${call.note}` : ''])]),
        el('div', { class: 'call-terms' }, [
          el('span', { class: 'term', title: positionText(call.position, m) }, [call.position]),
          el('span', { class: 'term', title: 'The Effect the GM set' }, [call.effect]),
          el('span', { class: 'term' }, [call.axis]),
          rollBtn,
        ]),
      ]);
    }
    return el('section', { class: 'actions-bar' }, [
      callBlock,
      el('h4', {}, ['Actions', el('span', { class: 'muted' }, [` · ${res.name} ${cur} / ${res.max}`]), ' ', ruleLink(m, ['Push themselves', 'Guts', 'Stress'], opts)]),
      el('div', { class: 'chiprow' }, [pushBtn('D'), pushBtn('E'), others.length ? who : null, assistBtn, ruleLink(m, ['Assist a teammate', 'Team Actions'], opts)]),
      effectRow,
      abilityRow,
      injurySection,
    ]);
  }

  // the behaviours at the limit (Hysteria, Aberrant, Erratic) and a mortal injury, in the book's words,
  // across the top of the sheet once set
  function alerts(m) {
    const out = [];
    const picks = m.live.picks || {};
    BEHAVIOUR_PICKS.forEach((name) => {
      (picks[name] || []).forEach((h) => {
        const e = D.entity(h);
        out.push({ head: `${name}: ${e ? e.name : h}`, text: e ? (e.desc || D.propValue(e, 'Text') || D.propValue(e, 'Description') || '') : '', ref: e });
      });
    });
    const worst = worstInjury(m);
    if (worst && !injuryPenalty(worst).dice && !injuryPenalty(worst).effect) out.push({ head: worst.name, text: injuryPenalty(worst).text, ref: worst });
    return out;
  }

  // the sheet as it was before play: tracks, counters and text lines (the injuries) at their start,
  // the behaviours at the limit unset; ratings, abilities, items and the other choices kept
  function resetLive(m) {
    const t = D.entity(m.templateId);
    const live = JSON.parse(JSON.stringify(m.live || {}));
    if (!t) return live;
    const sp = spec(t);
    live.tracks = {};
    sp.tracks.forEach((tr) => (live.tracks[tr.name] = tr.start));
    live.counters = {};
    sp.counters.forEach((c) => (live.counters[c.name] = c.start));
    live.texts = {};
    sp.texts.forEach((tx) => (live.texts[tx.name] = tx.start.slice()));
    sp.header.forEach((h) => {
      const mm = /^Starting (.+)$/.exec(h.name);
      if (mm && live.tracks[mm[1]] != null && typeof h.value === 'number') live.tracks[mm[1]] = h.value;
    });
    live.picks = Object.assign({}, live.picks || {});
    BEHAVIOUR_PICKS.forEach((name) => delete live.picks[name]);
    live.flags = {};
    return live;
  }

  // What the token and the sheet head remind the table of: the behaviour the book imposes at
  // the limit, the worst injury filled, the resource at its limit. Plain strings.
  const BEHAVIOUR_PICKS = ['Hysteria', 'Aberrant Behaviour', 'Erratic Behaviour'];
  function conditions(m) {
    const out = [];
    const picks = m.live.picks || {};
    BEHAVIOUR_PICKS.forEach((name) => {
      (picks[name] || []).forEach((h) => {
        const e = D.entity(h);
        out.push(`${name}: ${e ? e.name : h}`);
      });
    });
    const t = D.entity(m.templateId);
    const levels = t ? D.byType('Injury Level', [t.book]) : [];
    const lines = (m.live.texts || {}).Injuries || [];
    let worst = null;
    levels.forEach((lv) => {
      if (lines.some((x) => typeof x === 'object' && x.slot && x.slot.indexOf(lv.name + ' ') === 0 && x.text)) worst = lv;
    });
    if (worst) {
      const pen = D.propValue(worst, 'Penalty');
      out.push(`Injured: ${worst.name}${pen ? ' · ' + pen : ''}`);
    }
    const sp = t ? spec(t) : null;
    const res = sp ? resourceOf(sp) : null;
    if (res && ((m.live.tracks || {})[res.name] || 0) >= res.max) out.push(`${res.name} used up`);
    return out;
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
      boxes(tr.max, v, (n) => setTrack(m, tr, n)),
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

  function ratingRows(m, r, log, redraw) {
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
            if (redraw && !m.preview) redraw();
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
            // a Sheet Ability's name is the converter's label (the one-shots' sheets print no titles): show its text as the item
            e && e.type === 'Sheet Ability' && typeof text === 'string' ? E.link({ hash: e.id, name: e.name }, text)
              : e ? E.link({ hash: e.id, name: e.name }) : el('b', {}, [it.name]),
            typeof text === 'string' && text !== e.name && !(e && e.type === 'Sheet Ability') ? el('div', { class: 'check-text' }, [text]) : null,
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
                if (ev.target.value && !(cur && cur.text)) {
                  logAction(m, `${m.name} takes a ${lv.name} injury: ${ev.target.value} — ${injuryPenalty(lv).text}`);
                  const after = rest.concat([{ slot: key, text: ev.target.value }]);
                  if (injurySlots(m, lv).every((s) => after.some((x) => typeof x === 'object' && x.slot === s.key && x.text))) armInjury(m, true);
                }
              } });
            }),
          ]);
        })
      : [el('textarea', { rows: 2, placeholder: tx.name, oninput: debounce((ev) => patch(m, 'texts', { [tx.name]: ev.target.value.split('\n').filter(Boolean) }), 400) }, [lines.filter((x) => typeof x === 'string').join('\n')])];
    return el('section', {}, [el('h4', {}, [tx.name]), ...rows]);
  }

  function rollLine(entry) {
    return el('div', { class: 'roll-line band-' + entry.band.replace(/[^a-z0-9]/gi, '').toLowerCase() }, [
      el('span', { class: 'roll-who' }, [entry.who + ' · ' + entry.axis + ' ' + (entry.extra ? `${entry.base} ${entry.extra > 0 ? '+' : ''}${entry.extra}D` : entry.rating) + (entry.effect ? ` +${entry.effect}E` : '')]),
      el('span', { class: 'roll-dice' }, entry.dice.map((d) => el('span', { class: 'die' + (entry.zero && d !== Math.min.apply(null, entry.dice) ? ' dropped' : '') }, [String(d)]))),
      // what happened first — the band and the book's words for it — then what it was worth
      el('span', { class: 'roll-outcome' }, [el('b', {}, [entry.band]), entry.text ? el('span', { class: 'roll-text' }, [' ' + entry.text]) : null]),
      entry.effectLevel || entry.position ? el('span', { class: 'roll-terms muted' }, [
        entry.position ? `${entry.position} · ` : '',
        entry.band === '1-3' ? `Effect ${entry.effectLevel} · not reached` : `Effect ${entry.effectLevel}`,
        entry.effectLevel !== entry.effectBase ? ` (${entry.effectBase}${entry.effect ? ' +' + entry.effect + 'E' : ''}${entry.injury && entry.injury.effect ? ' ' + entry.injury.effect + 'E injured' : ''})` : '',
      ]) : null,
      entry.injury ? el('span', { class: 'roll-injury' }, [`${entry.injury.name}: ${entry.injury.penalty}`]) : null,
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
    const face = window.VttSystem && window.VttSystem.portrait ? window.VttSystem.portrait(t.id) : null;
    const conds = conditions(m);
    const header = el('header', { class: 'sheet-head' + (face ? ' with-portrait' : '') }, [
      face ? el('img', { class: 'portrait', src: face, alt: '' }) : null,
      el('h2', {}, [m.name]),
      conds.length ? el('div', { class: 'reminders' }, conds.map((c) => el('span', { class: 'chip warn' }, [c]))) : null,
      el('div', { class: 'meta' }, [E.link({ hash: t.id, name: t.name }), el('span', { class: 'muted' }, [t.form === 'ACTOR' ? 'a shared sheet' : (t.type || '')])]),
      ...(opts.compact ? [] : sp.header).map((h) => h.ref ? el('div', { class: 'prop' }, [el('div', { class: 'prop-k' }, [h.name]), el('div', { class: 'prop-v' }, [E.link(h.ref)])])
        : typeof h.value === 'string' && h.value.length > 60 ? el('details', { class: 'sheet-text' }, [el('summary', {}, [h.name]), paragraphs(h.value, 'prose small')])
        : el('div', { class: 'tagline' }, [el('span', { class: 'muted' }, [h.name + ': ']), String(h.value)])),
      ...Object.keys(m.live.fields || {}).filter((k) => m.live.fields[k]).map((k) => el('div', { class: 'tagline' }, [el('span', { class: 'muted' }, [k + ': ']), String(m.live.fields[k])])),
    ]);
    // a redraw of this sheet in place (the actions bar and the armed modifiers live in this window)
    const redraw = () => {
      const fresh = live(m, opts);
      if (article.parentNode) article.parentNode.replaceChild(fresh, article);
      if (m.preview && m.preview.onChange) m.preview.onChange();
    };
    if (!m.preview) mounted[m.id] = () => { if (article.isConnected) redraw(); };
    // compact (the player's page beside the table): what a roll needs — the actions bar, the
    // tracks and counters, the ratings, the last rolls — and nothing to read
    const body = el('div', { class: 'sheet-body' + (opts.compact ? ' compact' : '') }, [
      actionsBar(m, sp, opts, redraw),
      sp.tracks.length ? el('section', { class: 'tracks' }, [el('h4', {}, ['Tracks']), ...sp.tracks.map((tr) => trackRow(m, tr))]) : null,
      sp.counters.length ? el('section', { class: 'counters' }, sp.counters.map((c) => counterRow(m, c))) : null,
      ...sp.ratings.map((r) => ratingRows(m, r, log, redraw)),
      el('section', { class: 'rolls' }, [el('h4', {}, ['Rolls']), rollLog]),
      ...(opts.compact ? [] : [
      sp.picks.length ? el('section', {}, [el('h4', {}, ['Choices']), ...sp.picks.map((pk) => pickRow(m, pk))]) : null,
      ...sp.lists.map((l) => listRows(m, l)),
      ...sp.texts.map((tx) => textRows(m, tx)),
      sp.rubrics.length ? el('div', { class: 'rubric' }, [sp.rubrics.join(' · ')]) : null,
      opts.player || opts.preview ? null : el('section', { class: 'gm-notes' }, [
        el('h4', {}, ['GM notes ', el('span', { class: 'muted' }, ['(never sent to players)'])]),
        el('textarea', { rows: 3, oninput: debounce((ev) => State.commit('setPartyNotes', [m.id, ev.target.value]), 400) }, [m.notes || '']),
      ]),
      opts.preview ? null : el('section', { class: 'player-notes' }, [
        el('h4', {}, ['Player notes']),
        el('textarea', { rows: 3, oninput: debounce((ev) => State.commit('setPartyPlayerNotes', [m.id, ev.target.value]), 400) }, [m.playerNotes || '']),
      ]),
      ]),
    ]);
    const alertRows = alerts(m);
    const alert = alertRows.length ? el('div', { class: 'sheet-alert' }, alertRows.map((r) => el('div', { class: 'alert-row' }, [el('b', {}, [r.head]), r.text ? el('span', {}, [' — ' + r.text]) : null]))) : null;
    const article = el('article', { class: 'sheet' + (opts.compact ? ' compact' : '') }, [alert, header, body]);
    return article;
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

  // ── a character as a file (the site's creator writes one; the GM's Party panel reads it) ──
  const CHARACTER_KIND = 'sortilege-vtt-character';
  function exportCharacter(m) {
    const member = Object.assign({}, m);
    delete member.preview;
    return { kind: CHARACTER_KIND, version: 1, system: (window.VttConfig || {}).system || 'teeth', exportedAt: new Date().toISOString(), member };
  }
  function downloadCharacter(m) {
    const file = exportCharacter(m);
    const blob = new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(m.name || 'character').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}.teeth-character.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 0);
  }
  // Parse a character file into a party member for this campaign, or throw.
  function readCharacter(obj, fileName) {
    if (!obj || obj.kind !== CHARACTER_KIND) throw new Error('Not a character file (kind ' + (obj && obj.kind) + ').');
    if (obj.version > 1) throw new Error('This character was saved by a newer build.');
    const m = obj.member;
    if (!m || !m.templateId || !m.live) throw new Error('The file has no character in it.');
    const t = D.entity(m.templateId);
    if (!t) throw new Error(`${m.name || 'This character'}'s playbook (${m.templateId}) is not in the loaded books.`);
    return Object.assign({}, m, { id: State.genId('pc'), notes: '', preview: undefined, source: { kind: 'file', name: fileName || null, exportedAt: obj.exportedAt || null, loadedAt: new Date().toISOString() } });
  }

  return { spec, declared, newMember, member, live, render, doRoll, rollLine, rollEntity, standalone, scope, exportCharacter, downloadCharacter, readCharacter, conditions, resetLive, worstInjury, injuryPenalty, injuryLevels, injurySlots, takeInjury, healInjury, setTrack, positions, positionText, EFFECT_LEVELS };
})();
