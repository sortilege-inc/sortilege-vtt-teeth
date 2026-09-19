// engine/site.js — the public face of a deployment: the tabs the system declares
// (window.VttSiteTabs), one hash route per tab (#rules/<book>/<entity>,
// #characters/<adventure>/<template>), and nothing else. This page reads the corpus
// and writes nothing: no campaign, no session — those live under gm/.
(function () {
  const { el } = window.VttRender;
  const tabs = window.VttSiteTabs || [];
  const bar = document.getElementById('site-tabs');
  const main = document.getElementById('site-main');

  function route() {
    const parts = location.hash.replace(/^#/, '').split('/').map((p) => decodeURIComponent(p));
    const id = tabs.some((t) => t.id === parts[0]) ? parts[0] : (tabs[0] || {}).id;
    return { id, path: parts[0] === id ? parts.slice(1) : [] };
  }

  function go(id, path) {
    location.hash = [id].concat((path || []).map((p) => encodeURIComponent(p))).join('/');
  }

  function href(id, path) {
    return '#' + [id].concat((path || []).map((p) => encodeURIComponent(p))).join('/');
  }

  const ctx = { go, href, route };

  function render() {
    const r = route();
    bar.innerHTML = '';
    tabs.forEach((t) => bar.appendChild(el('a', { class: 'site-tab' + (t.id === r.id ? ' active' : '') + (t.disabled ? ' disabled' : ''), href: href(t.id), title: t.note || null }, [t.label])));
    main.innerHTML = '';
    const t = tabs.find((x) => x.id === r.id);
    if (t) t.render(main, r.path, ctx);
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', render);
  window.VttSite = { go, href, route, render };
  render();
})();
