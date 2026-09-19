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
  worker: {
    deployed: 'https://sortilege-vtt-teeth.sortilege.workers.dev',
    local: 'http://localhost:8787',
  },
};
window.VttConfig.workerUrl = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? window.VttConfig.worker.local : window.VttConfig.worker.deployed;
