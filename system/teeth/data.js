// system/teeth/data.js — accessors over the generated corpus (window.TEETH from
// data/*.js): books, modules (the books with an ARC), entities by hash, by type,
// search. This is the only file that knows the data files' shape; panels ask here.
window.TeethData = (function () {
  const T = window.TEETH || { books: {}, entities: {}, index: { books: [] } };

  function books() {
    return (T.index && T.index.books ? T.index.books : Object.keys(T.books).map((id) => ({ id }))).map((b) => T.books[b.id]).filter(Boolean);
  }

  function book(id) {
    return T.books[id] || null;
  }

  // A module is a book that carries an ARC (scenes to run).
  function modules() {
    return books().filter((b) => b.arcs && b.arcs.length);
  }

  function arc(moduleId) {
    const b = book(moduleId);
    return b && b.arcs && b.arcs[0] ? b.arcs[0] : null;
  }

  function scene(moduleId, sceneId) {
    const a = arc(moduleId);
    return a ? a.scenes.find((s) => s.id === sceneId) || null : null;
  }

  // Source order: the FLOW's phases, then any scene no phase references.
  function pages(moduleId) {
    const a = arc(moduleId);
    if (!a) return [];
    const out = [];
    const seen = new Set();
    (a.phases || []).forEach((ph) => {
      (ph.scenes || []).forEach((id) => {
        const s = a.scenes.find((x) => x.id === id);
        if (s) {
          seen.add(id);
          out.push({ phase: ph.name, scene: s });
        }
      });
    });
    a.scenes.forEach((s) => {
      if (!seen.has(s.id)) out.push({ phase: 'Other scenes', scene: s });
    });
    return out;
  }

  function cast(moduleId) {
    const a = arc(moduleId);
    if (!a) return [];
    const out = [];
    (a.cast || []).forEach((c) => (c.hashes || []).forEach((h) => T.entities[h] && out.push(T.entities[h])));
    return out;
  }

  function entity(id) {
    return T.entities[id] || null;
  }

  function children(id) {
    const e = entity(id);
    return e ? e.children.map(entity).filter(Boolean) : [];
  }

  function ancestors(id) {
    const out = [];
    let e = entity(id);
    while (e && e.parent) {
      e = entity(e.parent);
      if (e) out.unshift(e);
    }
    return out;
  }

  function byType(type, bookIds) {
    return all(bookIds).filter((e) => e.type === type);
  }

  function all(bookIds) {
    const ids = bookIds && bookIds.length ? bookIds : Object.keys(T.books);
    const out = [];
    ids.forEach((bid) => {
      const b = T.books[bid];
      if (!b) return;
      const stack = b.entities.slice();
      const seen = new Set();
      while (stack.length) {
        const id = stack.shift();
        if (seen.has(id)) continue;
        seen.add(id);
        const e = T.entities[id];
        if (!e) continue;
        out.push(e);
        stack.push.apply(stack, e.children);
      }
    });
    return out;
  }

  // Top-level entities of a book (the printed chapters / sections), in order.
  function roots(bookId) {
    const b = book(bookId);
    return b ? b.entities.map(entity).filter((e) => e && !e.parent) : [];
  }

  function propValue(e, name) {
    const p = (e.props || []).find((x) => x.name === name);
    if (!p) return undefined;
    if (p.vk === 'scalar') return p.value;
    if (p.vk === 'ref') return p.ref;
    if (p.vk === 'list') return p.items;
    return p;
  }

  // Plain text of an entity for search: name, description, scalar props, list items.
  function searchText(e) {
    const parts = [e.name, e.desc || ''];
    (e.props || []).forEach((p) => {
      if (p.vk === 'scalar' && typeof p.value === 'string') parts.push(p.value);
      if (p.vk === 'list') p.items.forEach((it) => it.vk === 'scalar' && parts.push(String(it.value)));
    });
    (e.guidance || []).forEach((g) => parts.push(g.text || ''));
    (e.outcomes || []).forEach((o) => parts.push(o[1]));
    (e.hooks || []).forEach((h) => h.fields.forEach((f) => f.vk === 'scalar' && parts.push(String(f.value))));
    return parts.join('\n').toLowerCase();
  }

  const searchCache = new Map();
  function search(query, bookIds, limit) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const hits = [];
    all(bookIds).forEach((e) => {
      let text = searchCache.get(e.id);
      if (!text) {
        text = searchText(e);
        searchCache.set(e.id, text);
      }
      const inName = e.name.toLowerCase().indexOf(q) !== -1;
      // name matches first; among them, entities with text before bare type declarations
      const hasText = !!(e.desc || (e.props || []).some((p) => p.vk === 'scalar' && p.value !== undefined) || e.children.length);
      if (inName || text.indexOf(q) !== -1) hits.push({ e, score: (inName ? 0 : 2) + (hasText ? 0 : 1) });
    });
    hits.sort((a, b) => a.score - b.score || a.e.name.localeCompare(b.e.name));
    return hits.slice(0, limit || 200).map((h) => h.e);
  }

  return { T, books, book, modules, arc, scene, pages, cast, entity, children, ancestors, byType, all, roots, propValue, search };
})();
