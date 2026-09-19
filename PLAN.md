# sortilege-vtt-teeth — plan and decision log

A virtual tabletop for **TEETH** (Rossignol & Davies): the GM's table, the players' sheets on
their own devices, maps the GM supplies, and the published modules (Night of the Hogmen, Blood
Cotillion, Stranger and Stranger, False Kingdom, More TEETH's scenarios) built in from the DSL
corpus. Fourth in a line — Wyldwolf Axis (D&D 5.5e), NOVA Open (Curseborne), City of Winter — and
meant to be the one whose shape the next system copies.

Status words: **PROPOSED** (awaiting the owner), **(owner)** decided, **landed** built and
verified in the browser by the main session.

## Goals (owner, 2026-09-19)

1. A generalised TEETH VTT with the prewritten modules built in.
2. Run a game in a browser: every player on their own sheet, player-facing information, maps.
3. The specific campaign lives **outside the repo** as an instance: persistent, backed up, restored.
4. A playbook for future custom VTTs — the design generalises to other systems in principle.

## What the four predecessors taught (read 2026-09-19)

| Repo | Take | Leave |
|---|---|---|
| **wyldwolf-axis** | The whole shared-state architecture: named **ops** (`ops.js`) applied identically in the browser and in a Cloudflare **Durable Object** room; role rules per op; `playerView()` filtering; `BroadcastChannel` bus for same-machine windows; SVG VTT with grid calibration, fog, effects, tokens bound to encounter instances (no second HP system); tile layout; join-link + claim identity (no accounts); export/import as files. | D&D-specific everything (D&D Beyond import, spell slots, 5e templates); D&D Beyond proxy; adventure data hard-wired to one module. |
| **NOVA Open** | Generated `data.js` from the DSL with a **two-directional content gate** (every corpus string reaches the site, every site string came from the corpus); one parser, generic table handling; the `/` search; the password latch done right (inline, dependency-free). | Single-page, single-module, no players. |
| **City of Winter** | The **storage adapter** contract written down before the backend exists; `rev`-numbered documents; the log kept across migrations; the honest note that whole-document last-write-wins loses shared mutations. | Card-table UI. |
| **Portents / Pregens** | A sheet engine as a **drop-in** (`sheet_from_tier()` is the only translation layer); player-driven rolls (never auto-keep); archive the outgoing sheet before advancing it; rules text verbatim from the corpus, never from a VTT export. | Static one-character pages. |

## Architecture (PROPOSED)

Buildless static site + one Cloudflare Worker, like Wyldwolf — but split into three layers that
do not know each other's names:

```
engine/        system-agnostic. bus, ops-core (commit/apply/permits), state, session (WebSocket
               client), store adapters, layout tiles, panel registry, VTT (SVG map/grid/fog/
               tokens/effects/pings), dice log, campaign pack loader, export/import. No word
               "Stress", "Hunter" or "TEETH" anywhere in it.
system/teeth/  the TEETH system module: sheet renderer (Playbook / one-shot playbook / Hogman /
               Courtier TEMPLATEs → live sheet), tracks & clocks, the d6 pool roller with the
               Multiple 6 / 6 / 4-5 / 1-3 ladder, Position/Effect prompts, Stress→Erratic
               Behaviour, Corruption→Mutation, Coin/Stash, Injury boxes, the Outfit sheet; its
               ops (setTrack, setClock, spendCoin, …) registered into ops-core with role rules.
data/          GENERATED from titterpig-dsl-teeth/0.5 by build/ (synthesist merge for .ttrpg +
               the generic .arc/.lore parser): rules glossary, tables, bestiary, playbooks,
               and one `modules.<id>` per adventure (scenes by phase, READ_ALOUD, clues,
               cast, GM guidance, maps the module names). Gate: two-directional, as NOVA Open.
worker/        the Worker: `SessionRoom` Durable Object (SQLite) — one per campaign, not per
               evening; ops validated by role, players get the filtered view; plus an R2 (or
               Pages) origin for campaign assets if we choose that route below.
```

Pages: `index.html` (GM table: tiles — Module tracker · Scene · Inspector · Party · Glossary ·
Clocks), `vtt.html` (map; `?view=player` for players and the TV), `play.html` (join → claim →
sheet), `campaign.html` (open / create / back up / restore an instance).

### The campaign instance (goal 3)

A **campaign pack** is a folder, its own git repo, outside this one — e.g.
`~/Sortilege/Campaigns/2026 TEETH/teeth-campaign-<name>/`:

```
campaign.json      manifest: name, system "teeth", modules enabled, party (the imported
                   sheets), scene order/progress, GM notes, map definitions (image, grid,
                   fog, tokens), clocks, campaign log
assets/maps/*.webp the GM's maps (web-sized; originals stay out)
assets/art/*.webp  portraits, handouts
snapshots/         dated exports (state at the end of each session) — the backup
```

- **Live truth while playing** is the room's Durable Object document (survives reloads and
  devices; players reconnect with their claim token).
- **Save** writes the whole document back into `campaign.json` + `snapshots/<date>.json` (a
  download the GM drops into the repo, or — later — a Worker endpoint that commits for them).
- **Restore** seeds a room from a `campaign.json` / snapshot. Rooms are therefore disposable;
  the repo is the durable record. This is the pattern Portents already uses for advancement
  (archive first, then change), applied to a whole campaign.
- The engine takes `?campaign=<url of campaign.json>`; assets resolve relative to it. In dev
  the pack is served by the same `python3 -m http.server` from a sibling directory; in
  production the pack repo is published (private assets would need the R2 route — see Q2).

### Modules (goal 1)

Every published adventure becomes `data.modules.<id>` from its `.arc` (scenes in FLOW order,
phases, READ_ALOUD, CLUES, RESOLUTIONS, GUIDANCE, CAST) plus its people/rules files, exactly as
the DSL already has them. A campaign enables any set; the tracker pages through the enabled
ones. Maps a module names (Blood Cotillion's grounds and manor) are declared in the module
with **no image** — the GM's campaign pack supplies the image and calibration, so the repo never
carries the publisher's art.

### Players (goal 2)

Join link + claim, as Wyldwolf. Players may edit their sheet's *live* state (Stress, Injury,
Coin, Corruption ticks, item picks, XP marks, notes), roll, and move their own token. They may
not edit what the Playbook decides. They see: their sheet, the party, the current map (fog
applied), revealed clues, shared clocks, the roll log, and any handout the GM has published.

### The playbook for the next system (goal 4)

`PLAYBOOK.md` in this repo, written as we go: the layer boundary, the op contract, the storage
adapter, the campaign-pack schema, the build gate — with "what TEETH needed that the engine did
not have" as the worked example of adding a system.

## Decisions made (owner, 2026-09-19)

- **Q1 Backend: Cloudflare Worker + Durable Object** (Wyldwolf's pattern; DO SQLite on the
  free plan; the account is logged in).
- **Q2 Maps and art: the owner adds them to THIS repo** (`assets/maps/`, `assets/art/`), served
  by GitHub Pages with the engine. So a module *may* declare its map image (the file the owner
  drops in), and the campaign pack is **state only** — `campaign.json` + snapshots, no assets.
  "Later art might require a separate handling" (owner) — R2 behind the room token is the
  route if that day comes; nothing in the pack schema assumes assets live beside it (a map's
  `image` is a URL, relative to the site).
- **Q3 First module playable end to end: Blood Cotillion**, then the core Playbooks/Outfit for
  a campaign game, then the other three modules.

## Milestones

| # | Milestone | Proof |
|---|---|---|
| M1 | Repo skeleton, `build/` generating `data/` from the TEETH corpus with the two-directional gate; `PLAYBOOK.md` started | **landed 2026-09-19** — `build.sh`: 94 files, 7 books, 2359 entities; `verify_data: 6488 DSL strings + 246 lore lines — 0 uncovered · 0 unsourced` |
| M2 | Engine: bus, ops-core, state, store adapters (local), layout, panel registry; TEETH rules glossary + module tracker + scene panel for Blood Cotillion | **landed 2026-09-19** — browser at 1440px: three columns Module · Scene · Inspector; scene 10 opened from the tracker (current row marked, six clues shown), a clue ticked and GM notes typed both persisted through a reload; Cast → Lord Kirklan Kelmorton in the Inspector; search "Position" → 41 results across the campaign's books; 0 console errors |
| M3 | TEETH sheets derived from the actor types (tracks, counters, ratings, picks, checklists, injury boxes), the book's own roll ladder, the party panel and dice log; campaign pack export | **landed 2026-09-19** — browser: Miss Lizzie Ambleclott added to the party through the Party picker; Stress ticked to 3/8, Brawn 2 · Will 1, Aberrant Behaviour picked, Hidden Objects toggled on and off (header reads "pick 4 (2 chosen)"), a Brawn roll logged as [3, 5] → 4-5 with the book's outcome text; all of it back after a reload; pack export carries the party |
| M4 | The table (`vtt.html`): the module's maps, grid calibration, tokens for party and cast, fog, pings, effects; player view | **landed 2026-09-19** — two tabs (GM page + table): the table opened on Buckleridge Manor (the GM's scene had no map, the note said so); Lizzie and Lord Kirklan Kelmorton added from the toolbar; Lizzie dragged to cell (6, 8) and the GM tab's state showed (6, 8) without a reload; a ping ring drawn; fog on, a reveal rectangle dragged and persisted; the GM changed scene → the table followed to the grounds map; player view: the hidden Kelmorton token not drawn, fog opaque, only Fit and Ping offered; 0 console errors |
| M5 | Worker + rooms: join, claim, role-filtered ops, reconnect; play.html sheet on a phone | localhost vs 127.0.0.1 two-origin test; wrangler deploy |
| M6 | Remaining modules (Hogmen, Stranger, False Kingdom courtiers, More TEETH scenarios), Outfit sheet, clocks panel | gate counts per module; each module paged through |
| M7 | Deploy (GitHub Pages + Worker), first campaign pack repo, `PLAYBOOK.md` complete | live URLs; a pack round-trips |

One commit per milestone, pushed; each verified in the browser by the main session.

## Decision log

| # | Decision | Why |
|---|---|---|
| 1 | Buildless static site + one Worker; three layers `engine/` · `system/teeth/` · `data/` (PROPOSED) | The three predecessors that worked were buildless; the layer split is what makes goal 4 real. |
| 2 | Campaign = a pack folder/repo outside this repo; the room is live truth, the pack the durable record (PROPOSED) | Goal 3; Portents' archive-first rule applied to a campaign. |
| 3 | ~~Module maps are declared without images; the pack supplies them~~ → **(owner)** maps and art live in this repo under `assets/`, served by Pages; the pack is state only | Q2 above. |
| 4 | `data/` is parsed straight from the DSL with the generic parser, not merged by the synthesist | The synthesist's implicit override collapses same-named DEFs across books (every module has its own `^"Stress"`, `^"Position"`…); the VTT wants all of them, keyed by hash. |
| 5 | One `data/<book>.js` per book, generic hash-keyed entities; `system/teeth/` interprets by `type` | 2.3 MB of prose loads per book; the engine never learns a game word (goal 4). |
| 6 | The GM page is three fixed columns with a panel picker per column (Module · Scene · Inspector by default), not Wyldwolf's nested tile tree yet | Enough for play; the picker is the same registry the tree would use, so the tree can come later without touching panels. |
| 7 | A campaign is state only in this browser (`localStorage` per campaign id) until M5; the pack (`kind: sortilege-vtt-campaign`) exports/restores it | Goal 3 from day one; the room server becomes another store for the same document. |
| 8 | **Sheets are derived, not hand-listed:** the ACTOR type's property declarations (walking EXTENDS) decide the sheet — `INTEGER MIN/MAX` → track, `INTEGER` → counter, `LIST OF <… Rating>` → ratings (axis and maximum read from the rating type), `LIST OF <Type>` → checklist with the template's CHOICES as pick limits, `LIST OF STRING` → text lines (Injury Levels give the boxes), `^"X" ^"Type"` → a pick from CHOICES or every entity of that type | One renderer serves Hunters, Ingenues, Passengers, Villagers, Hogmen and Courtiers; a new system's sheet is its BASE, not new code. |
| 9 | Ratings on a live sheet are freely editable within the type's maximum (the book has the players apportion points at the table); the template's printed values are the start | The sheet is the player's; the corpus is not edited. |
| 10 | Rolls read the ladder from the book's own `Roll` entity (the module's before the core's); an unrated action rolls two dice and keeps the lowest, as printed | Verbatim outcome text at the table. |
| 11 | The table's token is generic — `{ id, label, kind, owner, x, y, size, hidden }` — and the system adapter (`system/teeth/table.js`) says what can stand on it (party members owned by their player, the module's cast, markers), what a token's state reads as, and which map a scene ships with | The engine draws; the system means. No HP on tokens because TEETH has none — a party token's word is its tracks. |
| 12 | The Blood Cotillion map downloads in the owner's `~/Downloads/TEETH/Blood Cotillion` were converted to 2400 px WebP under `assets/maps/cotillion/` (owner's Q2: art lives in this repo) and declared per scene in `system/teeth/table.js`; grid at 80 px until the GM calibrates | The table needed a map to be proven on; the originals (5500 × 7000 JPG, up to 27 MB) stay out. |
