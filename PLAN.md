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

`PLAYBOOK.md`, written as we go (first in this repo; since 2026-09-24 in `~/Sortilege/VTT/`, beside the VTT repos, with `INSTANCES.md`): the layer boundary, the op contract, the storage
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
| M5 | Worker + rooms: join, claim, role-filtered ops, reconnect; play.html sheet on a phone | **landed 2026-09-19** (local `wrangler dev`; deploy is M7) — GM on localhost started room J9AU6 (status live); a player on 127.0.0.1 (a separate origin, separate storage) joined by link, saw the party with GM notes and scene notes absent from their copy, claimed Lizzie and got her sheet; the player's Stress tick reached the GM's state over the socket; a forbidden `setSceneNotes` from the player was refused by the room ("not allowed") and the GM's notes stayed; the player's roll landed in the GM's log; the GM's Suspicion change redrew the player's sheet; `engine/ops.js` role rules and player view checked by 12 Node assertions |
| M6 | The other books in play: Hogmen and Stranger as modules, the core campaign game (Hunter Playbooks, the Outfit as a shared sheet), False Kingdom / More TEETH through Rules & Books and their tables; Clocks panel; table rolling | **landed 2026-09-19** — browser: a Bruiser ("Nell") added from the core: Coin 4 · Stash 20 · Stress 9 · Corruption 12 · four XP tracks, twelve Actions rated (Fight 2, Command 1 printed), Disciplines / Methods / Special Abilities as pick-1 checklists, 18 items, 5 acquaintances, 3 XP triggers, the core's Injury Levels; the Outfit added as a shared sheet: Agenda Points 12 · Coin 30 · Season Clock 16, Type from the five Outfit Types, 32 Boons, 8 Affiliations; a Suspicion clock (6) started from the book's Clock entity, ticked to 3 and hidden from players (player view then carries 0 clocks); "Roll on this table" on Weather: Spring → d20: 8 with the entry highlighted and logged; Hogmen 15 / Cotillion 17 / Stranger 22 scenes page in the tracker |
| M7 | Deploy (GitHub Pages + Worker), first campaign pack repo, `PLAYBOOK.md` complete | **landed 2026-09-19** — site: https://sortilege-inc.github.io/sortilege-vtt-teeth/ (Pages from `main`, root); Worker: https://sortilege-vtt-teeth.sortilege.workers.dev (`wrangler deploy`, version 39d163e7); first pack repo `~/Sortilege/Campaigns/2026 TEETH/teeth-campaign-blood-cotillion/` (starter `campaign.json`, `snapshots/`, README; local git, no remote yet — the owner's to create) |

One commit per milestone, pushed; each verified in the browser by the main session.

**After M7 (2026-09-19, owner's ask):** the Manor split into four floor maps with a GM-only legend
(decisions 21–23). Proof: GM table opened on *The Manor Itself · Middle Floor* (2160×1760) with
the map list showing the four floors and the grounds; **Legend** showed the 16 Middle Floor lines
from the corpus and, after switching to *Roof & Attic*, the 4 roof lines; the player view showed
the roof with only Fit/Ping and no legend element; switching floors on the GM table moved the
player window (BroadcastChannel); changing scene on the GM page (Manor ↔ Grounds) moved both the
table and the player view, the op arriving while localStorage still read the old value
(instrumented log). Worker redeployed with the new op (version 54e6a879); 10 Node assertions on
`setTableMap` / map-id ops pass.

**The site (2026-09-19, owner's ask):** root = the site, `/gm/` = the table (decisions 24–26).
Proof: `/` opened on Rules · core with the five chapters (How to Begin … The Rules); *The Action
Roll* read verbatim with its Contents; search "resistance" gave 11 results; Characters listed
Night of the Hogmen (9), Blood Cotillion (8), Stranger and Stranger (7), False Kingdom (24);
Lizzie Ambleclott's sheet showed Stress 0/8, Suspicion 0/6, four Attributes, Hidden Objects
pick 4 — a Stress box and a Brawn roll worked and localStorage was byte-identical before and
after; "As printed" showed the TEMPLATE; Beatrice Yoker (False Kingdom) rendered with Dede Dice,
Coin, Actions · 3 points, Titles. `/gm/` loaded 7 books with the sidebar, `gm/vtt.html` resolved
its map to `/assets/maps/…` (200), `gm/play.html` showed Join. No console errors on the site.

**The character creator (2026-09-19, owner's ask):** decisions 27–28. Proof, through the real
controls on localhost: the Playbook step listed the core's five and More TEETH's five Hogmen with
taglines and descriptions; Bruiser → "Hob Gaskin", Soldiery (the six backgrounds with their
text); an answer to the first of the seven questions landed in the player's notes; Actions showed
Fight 2 / Command 1 as fixed, accepted four added points, refused a fifth, and would not drop
Fight below its floor; Savage Defences with its text; Elementalism + Touch (pick 1 each);
The Big Lad as friend, Jenny Derwent as enemy, with the book's five questions; Stupor; the
finished sheet showed all of it and the campaign's localStorage was byte-identical throughout.
The exported file (no `preview`, kind `sortilege-vtt-character`) read back on the GM's page
became a party member with the same picks, ratings and notes in the Inspector (then removed).
A Hogman draft (Bopo the Scamp) offered a Clan field and Magic · pick 1.

**Loading custom characters (2026-09-19, owner's ask):** decision 30. Proof on localhost: the
Campaign panel showed *Player characters · saved in the pack* with a multi-file loader accepting
`.json`; a character file read through `readCharacter` and committed appeared in the list as
"Hob Gaskin · Bruiser · loaded from hob-gaskin.teeth-character.json" with download and remove;
`exportPack()` carried the member with its source and Background pick; importing that pack as a
new campaign restored the party with the member (then removed, and the test campaign deleted).
The creator's last step reads **Download as JSON** and names the file.

**Players load their own (2026-09-19, owner's ask):** decision 31. Proof over the deployed
Worker (version 9de18ac9), GM on localhost, player on 127.0.0.1 (room HN6RU): the player's claim
screen showed *Load my character file…*; a character file read through the loader's path was
committed and claimed — the player went straight to Perrin Vole's sheet, no error; the GM's
party gained "Perrin Vole · Outrider · loaded from perrin-vole.teeth-character.json" with empty
GM notes, the room's claims showed it, and the Campaign panel listed it. Seven Node assertions on
the rule (file character with or without a claim: yes; a plain member, a live patch or a log line
from an unclaimed player: no). Clue fix: ticking "1. Keys to locked places." wrote the key
`<scene>::1. Keys to locked places.` and the box was still ticked after a reload.

**Load before joining (2026-09-19, owner's ask):** decision 32. Proof over the deployed Worker
(room GKZCV): a character written as pending, then a reload — the join screen read "Ysolde Marrow
is ready — they take their seat when you join." with *Load a different character file…*; on Join
the player landed on Ysolde Marrow's sheet, claimed, pending cleared, no error; the GM's party
and the room's claims showed her with the file name.

**Download from the sheet (2026-09-19, owner's ask):** decision 33. Proof over the deployed
Worker (room 4FLVV): Bartholomew Crane joined by file; the GM wrote a GM-only note on him and the
player ticked Stress to 2; **Download my character** produced `bartholomew-crane.teeth-character.json`
with Stress 2, the player's own note, the file's source, no `preview` — and an empty GM-notes
field, while the GM's copy still held the note.

**Module picker, drag arrangement (2026-09-20, owner's ask):** decisions 34–35. Proof on
localhost through the real controls: the tracker's picker listed the three modules; choosing
*Night of the Hogmen* set `modules: [hogmen]`, `books: [core, oneshot-shared, hogmen]`, and the
tracker showed its 15 scenes in three phases with no numbers and a grip on each row; dragging
*Calamity Strikes* to the top of its phase and *Journey To The Lone Church* into the first phase
changed the DOM, the shared `order.scenes.hogmen` (7 / 7 / 1) and `VttSystem.pages`; the Scene
panel's Next followed the new order (found a page-identity bug there and fixed it); switching back
to *Blood Cotillion* left Hogmen's arrangement in place and Cotillion's untouched; dragging
*Wilfrum Kelmorton* to the front of Cotillion's 28 cast members reordered the cards, the shared
`order.cast.cotillion` and the table's token list; the table's map list read *The Manor Itself ·
Middle Floor* with no numbers. Six Node assertions: players receive but cannot send the
arrangement. Worker redeployed (version 40d46430) for the new shared key.

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
| 15 | A sheet's lists come from the actor's declarations **and** the template's own props; an actor's `Special Abilities` and a Playbook's `Special Ability List` are one list (same stem), and a CHOICES row governs a list by name, singular or `List`-less form | The core generator named the Playbook lists differently from the actor's declarations; the sheet reconciles rather than the corpus being edited. |
| 16 | An ACTOR that no TEMPLATE extends (the Outfit) can be added to the party as a shared sheet; its lists offer every entity of the list's type in the campaign's books | The core campaign game's second sheet, with no new code path. |
| 17 | Clocks are started from the books' Clock and Track entities (name, segments, thresholds) or ad hoc, each GM-only or visible; visible clocks show on the player's page | The Fate Clock, a Suspicion Clock, the Hogsiege clocks are the books' own. |
| 18 | Any table whose entries carry a `Roll` field gets "Roll on this table" (dN from the highest entry, ranges honoured), the hit highlighted and logged | Every roll table in every book, one control. |
| 19 | Deployed as Wyldwolf is: GitHub Pages from the repo root (the repo is public; the org's free plan allows Pages only there) and one Worker; `ALLOWED_ORIGIN` is the Pages origin, localhost allowed for `wrangler dev` | Owner's Q1/Q2. |
| 20 | The first campaign pack is a sibling folder with its own git history and no remote — a starter pack, not the test data from this build | Goal 3: the instance is the owner's; a remote is their call. |
| 21 | Maps are first-class, keyed by a map id, and a scene may ship several (`MODULE_MAPS.<module>` is a list; a scene with none is its own blank map). Buckleridge Manor is four floors cut from the flat plan (2160 px wide, the legend column cropped away), the middle floor first because guests arrive there; the combined plan is gone. Which map the table shows is shared state (`table.map`, op `setTableMap`, GM only), so the player view follows the GM's floor | Owner's ask 2026-09-19: "split it into the four maps instead". Tokens and fog then belong to a floor, which is what a floor plan needs. |
| 22 | A map's legend is the corpus entity's verbatim lines (`A Floorplan of Buckleridge Manor`, one list per floor — checked against the book's p. 10, which the DSL follows; the flat JPG's own legend wording differs slightly and is not used). The GM pulls it up from the table's toolbar as an HTML panel over the stage; it is never drawn into the SVG, never built in the player view, never shared. The Scene panel's text already carries the same lines, so no second copy was added there | Owner's ask: a legend the GM can pull up, not displayed on the map. Verbatim-rules rule. |
| 24 | The GM's table moved under `gm/` (index, vtt, play — everything that was at the root) and the root became the site. The moved pages carry `<base href="../">` so scripts, assets and the map paths saved in campaign state stay root-relative; the pages link to each other through `VttConfig.pages` | Owner's ask 2026-09-19: the table at `/gm/`, a landing page at `/`. A base href moves three pages without rewriting a path or migrating a pack. |
| 25 | The site (`engine/site.js` shell, `system/teeth/site.js` tabs) reads the corpus and writes nothing: no op, no save, no session. Its **Rules** tab is a reader over each book's untyped chapters (the typed roots — people, items, notables — are reached by search or by link); **Characters** lists the published adventures as the books of kind one-shot and standalone game that ship TEMPLATEs (the core's and More TEETH's Playbooks are the creator's business, not the selector's) | Goal: a public face that cannot disturb a campaign. Chapters by type-lessness is what the corpus gives without a hand list. |
| 26 | A character on the site is the real sheet (`TeethSheet.live`) on a preview member: `m.preview` makes `patch` and `doRoll` change memory and redraw instead of committing; notes are not shown; `TeethSheet.scope(books)` gives it the adventure's books (a one-shot: core + shared + itself, as the GM's default campaign; a standalone game: itself). "As printed" is the entity renderer | One renderer for the GM, the player and the visitor; the visitor's tinkering is never saved (checked: localStorage byte-identical after boxes and a roll). |
| 27 | The creator's steps are the core chapter's own (*Pick a Playbook*, *Define a Background*, *Decide What Hunters Want*, then *Finalise the Playbook*'s six), each shown verbatim from the entity of that name; the controls come from `TeethSheet.spec` of the chosen playbook, so More TEETH's Hogmen (EXTENDS Hunter) take the same walk, plus any scalar the actor declares and the playbook leaves open (Clan). The one number not in the corpus as a field — "Players add four more" — is a named constant citing the sentence. The playbook's own points are a floor; magic and items are optional as the book says | No hand-written step list: the book's chapter is the wizard. |
| 28 | A made character leaves the site as a **character file** (`kind: sortilege-vtt-character`, v1, the party-member record) and enters a campaign through **Party › Add from file…**, which re-ids it and drops GM notes; the draft itself lives under a site key in that browser, never in a campaign. The answers to "what they want" become the player's notes | The site still writes nothing to a campaign; the GM's table stays the only writer. A file also survives a browser. |
| 29 | The site answers at **teeth.sortilege.online** (the owner added the CNAME through Pages, 2026-09-19); the Worker's `ALLOWED_ORIGIN` became a comma-separated list — the custom domain and the github.io fallback — so a session started from either origin is admitted | Found as a rejected push (the CNAME commit); without the change, Start session on the new domain would be refused. |
| 30 | Custom player characters enter a campaign through the Campaign panel's **Player characters** section (or Party › Add from file…): a loaded character is a party member with a `source` (file name, when exported, when loaded), so it is in the pack's `party` and survives Save / Restore; it can be downloaded again as a character file from the same list. The creator's last step names the download plainly: **Download as JSON** | Owner's ask 2026-09-19. The party is already what the pack carries; the section makes the loading and its consequence visible rather than adding a second store. |
| 31 | A player may bring their own character: the claim screen's **Load my character file…** commits `addPartyMember` and claims it. The room admits that op from a player — even one who has not claimed yet (`opts.unclaimed`) — only for a member carrying `source.kind === 'file'` (a character file); every other op still needs a claimed character, and the GM's notes never travel. Found and fixed alongside: the op wrote clue keys with a NUL separator while the Scene panel read `scene::clue`, so a revealed clue did not survive a redraw; both now use `::` | Owner's ask 2026-09-19. The rule is the narrowest that lets a file in. |
| 32 | The player's character file can be loaded before joining: it waits (in that tab's sessionStorage, so a reload keeps it) and takes its seat — `addPartyMember` + claim — the first time the session reports online without a claimed character. One loader serves the join and claim screens | Owner's ask 2026-09-19. |
| 33 | The player's sheet has **Download my character**: the party member as the player holds it now — live tracks, picks, their notes — as a character file; the GM's notes are not in the player's copy, so they cannot leak into it. A file downloaded here loads again on the join screen | Owner's ask 2026-09-19. The character belongs to the player; the file is how they keep it. |
| 34 | The module in play is picked at the top of the Module tracker (every book with an ARC); picking one sets `campaign.modules` to it and its books to the core, the shared types and itself, keeping the campaign's other reference books, and renames the default campaign (or one still carrying a module's name) after the module; a campaign the GM named keeps its name. The Campaign panel's checkboxes remain for several modules at once | Owner could not find how to run Night of the Hogmen (2026-09-20): the control was three panels away. Progress and current scene are per module already, so switching loses nothing. |
| 35 | Scenes carry no numbers. The GM drags a scene within or between phases in the tracker, and the cast into any order; the arrangement is shared state (`order.scenes[module]` = phases with scene ids, `order.cast[module]` = ids) and so in the pack, and every page reads it (`VttSystem.pages/cast`): the Scene panel's Previous / Next, the table's map list, the token list. A scene the arrangement does not name keeps the book's phase; ids not listed follow in the book's order | Owner's ask 2026-09-20. Plain HTML5 drag (`VttRender.dragSort`), the order read off the DOM on drop — no library. |
| 23 | Cross-window sync carries the change, not a hint: `state:changed` now travels with the op (or the whole document) and sibling windows apply it in memory instead of re-reading localStorage | Found while proving 21: a BroadcastChannel message reached the GM page before the table's localStorage write was visible there; the stale re-read was then saved back over the table's map. Applying the op is deterministic and needs no read. |
| 13 | The player's page (`engine/play.js`) is generic; the system supplies `liveSheet(member, {player})` and `memberSubtitle(member)` through `VttSystem` | The join → claim → sheet flow is the same for every system. |
| 14 | `wrangler dev` was run from Bash for the M5 proof because the preview harness had reached its five-servers-per-folder limit (four belong to other chats); stopped after the test | Reported as the deviation it is; the launch entry `vtt-teeth-worker` exists for the harness. |
| 12 | The Blood Cotillion map downloads in the owner's `~/Downloads/TEETH/Blood Cotillion` were converted to 2400 px WebP under `assets/maps/cotillion/` (owner's Q2: art lives in this repo) and declared per scene in `system/teeth/table.js`; grid at 80 px until the GM calibrates | The table needed a map to be proven on; the originals (5500 × 7000 JPG, up to 27 MB) stay out. |
