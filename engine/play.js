// engine/play.js — the player's page: join a room by code, claim a character, play
// from its sheet. Everything it shows arrives over the session socket into the same
// State the GM's page uses; the sheet itself is the system's (VttSystem.liveSheet).
(function () {
  const { el, button } = window.VttRender;
  const State = window.VttState;
  const Bus = window.VttBus;
  const Session = window.VttSession;
  const Sys = window.VttSystem;
  const CFG = window.VttConfig;

  const main = document.getElementById('play-main');
  const statusEl = document.getElementById('play-status');
  const params = new URLSearchParams(location.search);

  function status(s) {
    statusEl.innerHTML = '';
    if (!s.active) {
      statusEl.appendChild(el('span', { class: 'muted' }, ['not in a session']));
      return;
    }
    statusEl.appendChild(el('span', { class: 'chip' + (s.connected ? ' on' : '') }, [s.connected ? 'connected' : s.status]));
    statusEl.appendChild(el('span', { class: 'muted' }, [' room ', el('b', {}, [s.info.code])]));
    statusEl.appendChild(button('Leave', () => { Session.leave(); render(); }, 'ghost tiny'));
  }

  // ── bring your own character ───────────────────────────────────────
  // A character file (the site's creator writes one) can be loaded before joining or on the
  // claim screen. It waits here until the room is online, then joins the party and is
  // claimed in one go — and it waits out a reload, in this tab.
  const PENDING_KEY = (CFG.storagePrefix || 'sortilege-vtt') + ':play:pending';
  let pending = (() => {
    try {
      return JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null');
    } catch (e) {
      return null;
    }
  })();
  function setPending(m) {
    pending = m;
    try {
      if (m) sessionStorage.setItem(PENDING_KEY, JSON.stringify(m));
      else sessionStorage.removeItem(PENDING_KEY);
    } catch (e) {
      /* no storage */
    }
  }
  function seatPending() {
    const s = Session.current();
    if (!pending || !s.active || !s.connected || s.info.memberId) return false;
    const m = pending;
    setPending(null);
    State.commit('addPartyMember', [m]);
    Session.claim(m.id);
    return true;
  }
  function characterLoader(note) {
    const file = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
    const msg = el('div', { class: 'muted' }, [pending ? `${pending.name} is ready — they take their seat when you join.` : '']);
    file.addEventListener('change', () => {
      const f = file.files && file.files[0];
      if (!f) return;
      f.text().then((text) => {
        const m = Sys.readCharacter(JSON.parse(text), f.name);
        setPending(m);
        if (!seatPending()) msg.textContent = `${m.name} is ready — they take their seat when you join.`;
        else msg.textContent = `${m.name} is at the table.`;
      }).catch((e) => (msg.textContent = e.message)).finally(() => (file.value = ''));
    });
    return el('div', {}, [
      el('div', { class: 'chiprow' }, [button(pending ? 'Load a different character file…' : 'Load my character file…', () => file.click(), 'ghost'), el('span', { class: 'muted' }, [note]), file]),
      msg,
    ]);
  }

  function joinScreen() {
    const code = el('input', { type: 'text', class: 'text code-input', placeholder: 'Room code', maxlength: '8', autocapitalize: 'characters', value: (params.get('s') || '').toUpperCase() });
    const msg = el('div', { class: 'muted' });
    const go = button('Join', () => {
      const c = code.value.trim().toUpperCase();
      if (!/^[A-Z0-9]{4,8}$/.test(c)) {
        msg.textContent = 'That doesn’t look like a room code.';
        return;
      }
      Session.join(c);
      render();
    });
    return el('div', { class: 'play-card' }, [
      el('h1', {}, ['Join the table']),
      el('p', {}, ['Your GM gave you a room code. Enter it to claim your character — or bring the one you made.']),
      el('div', { class: 'chiprow' }, [code, go]),
      msg,
      characterLoader('made on the site’s character creator; it joins the party when you do'),
      Session.configured() ? null : el('div', { class: 'muted' }, ['Sessions aren’t configured on this deployment yet.']),
    ]);
  }

  function claimScreen(s) {
    const party = State.state.party || [];
    const cards = party.map((m) => {
      const claimed = s.claims[m.id];
      const b = button(claimed ? `Claimed by ${claimed.name}` : 'Claim', () => Session.claim(m.id), claimed ? 'ghost' : '');
      b.disabled = !!claimed;
      return el('div', { class: 'card static' }, [el('div', { class: 'card-name' }, [m.name]), el('div', { class: 'card-sub' }, [Sys.memberSubtitle(m)]), b]);
    });
    return el('div', { class: 'play-card' }, [
      el('h1', {}, ['Who are you?']),
      party.length ? el('div', { class: 'cards' }, cards) : el('p', { class: 'muted' }, [s.connected ? 'The GM hasn’t added any characters yet.' : 'Connecting…']),
      characterLoader('made on the site’s character creator'),
    ]);
  }

  function sheetScreen(s) {
    const m = (State.state.party || []).find((x) => x.id === s.info.memberId);
    if (!m) return el('div', { class: 'play-card' }, [el('p', { class: 'muted' }, ['Your character isn’t in the party any more.'])]);
    const bar = el('div', { class: 'chiprow play-bar' }, [
      el('a', { class: 'btn ghost', href: CFG.pages.table + '?view=player', target: (CFG.channel || 'vtt') + '-player' }, ['Open the table']),
      button('Download my character', () => Sys.downloadCharacter(m), 'ghost'),   // as played, right now — the file the join screen takes back
      button('Release character', () => Session.unclaim(m.id), 'ghost'),
    ]);
    const clocks = (State.state.clocks || []).filter((c) => c.visible !== false);
    const strip = clocks.length ? el('div', { class: 'clock-strip' }, clocks.map((c) => el('div', { class: 'clock-row' }, [el('div', { class: 'track-head' }, [el('span', { class: 'track-name' }, [c.name]), el('span', { class: 'muted' }, [`${c.filled} / ${c.segments}`])]), el('div', { class: 'boxes clock' }, Array.from({ length: c.segments }, (_, i) => el('span', { class: 'box' + (i < c.filled ? ' on' : '') })))]))) : null;
    return el('div', { class: 'play-card wide' }, [bar, strip, Sys.liveSheet(m, { player: true })]);
  }

  function render() {
    const s = Session.current();
    status(s);
    if (document.activeElement && /TEXTAREA|INPUT/.test(document.activeElement.tagName) && main.contains(document.activeElement)) return;
    main.innerHTML = '';
    if (!s.active) main.appendChild(joinScreen());
    else if (!s.info.memberId) main.appendChild(claimScreen(s));
    else main.appendChild(sheetScreen(s));
  }

  Session.onChange(() => {
    seatPending();     // a character loaded before joining takes its seat once the room is online
    render();
  });
  Bus.on('state:remote', () => render());
  Bus.on('state:changed', () => render());
  Bus.on('session:error', (p) => {
    const note = el('div', { class: 'muted session-error' }, [p.message]);
    main.prepend(note);
    setTimeout(() => note.remove(), 4000);
  });

  render();
  if (params.get('s') && !Session.current().active) {
    Session.join(params.get('s'));
    render();
  }
})();
