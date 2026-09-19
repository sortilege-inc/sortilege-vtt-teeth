// engine/config.js — where things are. The one file a deployment edits.
window.VttConfig = {
  system: 'teeth',
  title: 'TEETH',
  channel: 'sortilege-vtt-teeth',        // BroadcastChannel name (same-machine windows)
  storagePrefix: 'sortilege-vtt-teeth',  // localStorage key prefix
  // what a fresh browser opens on until a campaign is created or restored
  defaultCampaign: { name: 'Blood Cotillion', modules: ['cotillion'], books: ['core', 'oneshot-shared', 'cotillion'] },
  // The Worker that holds player sessions (M5). Served from localhost the app talks
  // to `wrangler dev`; deployed, to the URL below. Empty = sessions disabled.
  worker: {
    deployed: '',
    local: 'http://localhost:8787',
  },
};
window.VttConfig.workerUrl = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? window.VttConfig.worker.local : window.VttConfig.worker.deployed;
