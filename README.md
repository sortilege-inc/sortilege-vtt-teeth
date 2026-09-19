# sortilege-vtt-teeth

A virtual tabletop for **TEETH** (Jim Rossignol & Marsh Davies) — the GM's table, the players'
sheets on their own devices, the GM's maps, and the published modules built in from the
[Titterpig DSL corpus](../../Titterpig/DSL/titterpig-dsl-teeth) — built so the next system can
copy its shape ([PLAYBOOK.md](PLAYBOOK.md)). Plan, decisions and milestones: [PLAN.md](PLAN.md).

Buildless static site (GitHub Pages) plus one Cloudflare Worker for player sessions.

**Live:** https://teeth.sortilege.online/ (the site: the rules, the published characters, the
creator) · https://teeth.sortilege.online/gm/ (the GM's table) · the github.io address redirects ·
Worker: `https://sortilege-vtt-teeth.sortilege.workers.dev` ·
first campaign: `~/Sortilege/Campaigns/2026 TEETH/teeth-campaign-blood-cotillion/` (its own repo).

## Status

| Milestone | State |
|---|---|
| M1 — `build/` generates `data/` from the corpus; two-directional gate | **landed** (2026-09-19) |
| M2 — engine + TEETH glossary, module tracker, scene panel (Blood Cotillion) | **landed** (2026-09-19) |
| M3 — sheets, party, dice log, campaign pack | **landed** (2026-09-19) |
| M4 — the table (maps, grid, tokens, fog, pings, player view) | **landed** (2026-09-19) |
| M5 — Worker + rooms: players on their own devices | **landed** (2026-09-19) |
| M6 — the other books, the Outfit as a shared sheet, Clocks, table rolling | **landed** (2026-09-19) |
| M7 — deployed (Pages + Worker); first campaign pack repo | **landed** (2026-09-19) |

## Running it

```bash
python3 -m http.server 8735
```

then open `http://localhost:8735/` for the site or `http://localhost:8735/gm/` for the table.

**The site** (`index.html`) is the public face, and touches no campaign: **Rules** is a reader
over every book — pick a book, its chapters on the left, the text on the right, verbatim, or
search it; **Characters** picks one of the published adventures (the three one-shots and *False
Kingdom*) and lists its characters — each opens as the sheet the players will use (boxes, dice
and picks work, and nothing is saved) or as the book prints it; **Character creator** walks the
core's own chapter (*Creating the Hunters* and *Finalise the Playbook*, each step's text verbatim)
for any Hunter playbook — the core's five and More TEETH's five Hogmen — with the controls the
sheet derives from that playbook: name and background, what they want, four points on Actions
over the playbook's own, a special ability, magic (optional), a friend and an enemy, a vice, the
items to know about. The draft stays in that browser; the result is **Download as JSON** — a
`.teeth-character.json` file — or a printed sheet. On the GM's table, **Campaign › Player
characters › Load character file(s)…** (or **Party › Add from file…**) puts it in the campaign;
from then on it is part of the party, so **Save pack** carries it and **Restore pack** brings it
back, and each one can be downloaded again from there.

**The GM's table** (`gm/`) opens on a *Blood Cotillion* campaign: **Module**
(scenes by phase, tick as you go) · **Scene** (the book's text, read-aloud, clues you reveal,
resolutions, GM guidance, your notes) · **Inspector** (whatever you last clicked). The sidebar
swaps in **Party** (add a character from any playbook in the campaign's books — or the Outfit as a
shared sheet; the live sheet — tracks, ratings, rolls, picks, items, injuries, notes — opens in the
Inspector), **Clocks** (the books' clocks or your own, each GM-only or shown to players), **Dice log**,
**Cast**, **Rules & Books** (search everything with `/`, or browse a book), **Lore** and
**Campaign** (which modules and books are in play; save / restore the campaign as a pack). Any
table the books roll on has a **Roll on this table** button in the Inspector.
Everything you tick or type is saved in this browser as you go.

**Open table** puts the current scene's map in its own window (`gm/vtt.html`): grid calibration,
tokens for the party and the cast (add them from the toolbar; drag to move; right-click to hide,
resize, rename), pings, circle / line / square effects, fog with reveal rectangles. A scene may
ship several maps — Buckleridge Manor is four floors, one map each, the middle floor first — and
the toolbar's map list switches between them; tokens and fog belong to the floor. It follows the
GM's scene unless pinned. **Legend** pulls up the map's key, verbatim from the book (the
Floorplan's numbered rooms), as a panel for the GM only: it is not drawn on the map and never
reaches players. **Open player view** (`gm/vtt.html?view=player`) is the same map with no controls,
fog opaque and hidden tokens absent — for the TV, or for a player's device in a session; it
follows whichever map the GM's table is showing. Map images live in `assets/maps/`;
`system/teeth/table.js` says which scene ships with which maps and where each legend comes from.

## Sessions — players on their own devices

**Start session** in the sidebar creates a room and shows a code and a join link
(`gm/play.html?s=CODE`). A player opens it on their phone, claims one of the party's characters,
and gets their sheet: tracks, ratings, rolls, picks, items, injuries and their own notes; they
can open the table in player view and move their own token. Everything they do shows up live
on the GM's page and table; everything the GM does to their character shows up live on theirs.
They never receive GM notes, hidden tokens or unrevealed fog; they may not change what the
playbook decides.

How it works: every shared change is a named op (`engine/ops.js`) applied identically in the
browser and in a `SessionRoom` Durable Object (`worker/`) that holds the campaign's document,
validates each op by role, and fans it out over WebSockets. One window per browser holds the
socket; the other windows ride the in-browser bus. No session → nothing leaves the browser.
No accounts: the join link plus a claim is the whole identity, and the GM can release a
claim. The room is the live document until the GM ends it or it idles out after 14 days; the
campaign pack (Campaign panel) is the durable record, and **reseed** pushes this browser's
campaign into the room after a restore.

Deploy per `worker/README.md`, then set the URL in `engine/config.js`; served from
`localhost` the app talks to `wrangler dev` on 8787 automatically.

## Where the content comes from

Everything the tool shows is generated from `titterpig-dsl-teeth/0.5` — the core book, the
three one-shots (Night of the Hogmen, Blood Cotillion, Stranger and Stranger), More TEETH and
False Kingdom — whose own gates report 0 verbatim drift against the PDFs. **Nothing here is
hand-transcribed**; `data/*.js` is generated and regenerating is the only way to change it.

```bash
bash build/build.sh            # parse → build → verify (both directions) → node --check
```

| Script | What it does |
|---|---|
| `build/parse_dsl.py` | The generic DSL parser (from the NOVA Open tool; tokenizer per the canonical validator) with spec 0.5's hash-bound list bodies, `CHOICE` rows and escaped quotes in names. Contract: every token consumed or it raises. |
| `build/build_data.py` | One `data/<book>.js` per book: hash-keyed entities with their props, choices, entries, thresholds, outcomes, tables, hooks, references and guidance — a **generic** shape the engine reads without knowing the game; `system/teeth/` interprets it by each entity's `type`. Arcs (scenes by phase, read-aloud, clues, resolutions, cast) and `.lore` sections ride with their book. |
| `build/verify_data.py` | The gate: every string the corpus prints (every string and caret token of every DSL file, every line of every `.lore`) reaches `data/`, and every string in `data/` came from the corpus. |

Gate status from `bash build/build.sh` on 2026-09-19: 94 DSL files, **7 books, 2359 entities**;
`verify_data: 6488 distinct DSL strings + 246 lore lines — 0 uncovered · 0 unsourced`.

## Layout

```
index.html      the site: rules reader, character selector (engine/site.js + system/teeth/site.js)
gm/             the GM's table (index.html), the map window (vtt.html), the player's page (play.html);
                each carries <base href="../"> so every path is root-relative
build/          the generator and its gate
data/           GENERATED — window.TEETH.books / .entities / .index
engine/         system-agnostic: bus, ops, state, session, panels, the shell, the table, the player's page, the site shell
system/teeth/   the TEETH module: sheets, tracks, clocks, the d6 pool roller, TEETH ops, the site's tabs
assets/maps/    the GM's maps (web-sized; the Manor's four floors cut from the flat plan); assets/art/ portraits and handouts
worker/         the Cloudflare Worker: the SessionRoom Durable Object (deploy separately)
docs/           notes; PLAN.md is the decision log
```

## Rights

TEETH, Night of the Hogmen, Blood Cotillion, Stranger and Stranger, More Teeth and False
Kingdom are © Jim Rossignol and Marsh Davies (More Teeth also Jamie Brittain), based on Blades
in the Dark by John Harper (CC BY 3.0). This is an unofficial play aid for the owner's table,
not a redistribution of the books.
