// engine/render.js — DOM helpers. Nothing here knows the game.
window.VttRender = (function () {
  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k === 'text') e.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    (children || []).forEach((c) => {
      if (c == null || c === false) return;
      if (Array.isArray(c)) c.forEach((cc) => cc != null && e.appendChild(typeof cc === 'string' ? document.createTextNode(cc) : cc));
      else e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return e;
  }

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Source text uses \n\n for paragraph breaks and \n for line breaks; nothing is
  // added or reflowed — the text stays the book's.
  function paragraphs(text, cls) {
    if (text == null || text === '') return null;
    const wrap = el('div', { class: cls || 'prose' });
    String(text).split(/\n\s*\n/).forEach((p) => {
      wrap.appendChild(el('p', { html: esc(p).replace(/\n/g, '<br>') }));
    });
    return wrap;
  }

  function chip(label, attrs) {
    return el('span', Object.assign({ class: 'chip' }, attrs || {}), [label]);
  }

  function button(label, onclick, cls) {
    return el('button', { class: 'btn' + (cls ? ' ' + cls : ''), type: 'button', onclick }, [label]);
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  function debounce(fn, ms) {
    let t = null;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms || 250);
    };
  }

  return { el, esc, paragraphs, chip, button, clear, debounce };
})();
