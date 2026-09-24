// engine/config.js — where things are. The one file a deployment edits.
window.VttConfig = {
  system: 'teeth',
  title: 'TEETH',
  channel: 'sortilege-vtt-teeth',        // BroadcastChannel name (same-machine windows)
  storagePrefix: 'sortilege-vtt-teeth',  // localStorage key prefix
  // The pages, relative to the site root. The site (index.html) is the public face —
  // rules, the published characters; gm/ is the table. The gm/ pages carry
  // <base href="../"> so every path in code and in saved state is root-relative.
  pages: { site: './', gm: 'gm/', table: 'gm/vtt.html', play: 'gm/play.html' },
  // what a fresh browser opens on until a campaign is created or restored
  defaultCampaign: { name: 'Blood Cotillion', modules: ['cotillion'], books: ['core', 'oneshot-shared', 'cotillion'] },
  // The Worker that holds player sessions (M5). Served from localhost the app talks
  // to `wrangler dev`; deployed, to the URL below. Empty = sessions disabled.
  // The family standards (PLAYBOOK §4b): the public site's book tabs are off — the GM turns them on,
  // per browser, in the GM page's Settings (engine/site.js) — and a veil stands in front of /gm/
  // (engine/app.js). The GM's own material lives in the GM tabs (engine/gm-panes.js), in the pack.
  siteBooks: false,
  gmGate: {
    title: 'The GM\u2019s table',
    text: 'Beyond is the GM\u2019s material \u2014 the prep, the threads, what the players have not yet found. If you are playing, turn back.',
    enter: 'Enter',
    leave: 'Turn back',
  },
  worker: {
    deployed: 'https://sortilege-vtt-teeth.sortilege.workers.dev',
    local: 'http://localhost:8787',
  },
};
window.VttConfig.workerUrl = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? window.VttConfig.worker.local : window.VttConfig.worker.deployed;
