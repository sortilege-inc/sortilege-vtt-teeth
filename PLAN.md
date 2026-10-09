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

**Hogmen maps and art (2026-10-07, owner's assets):** decision 37. Proof on localhost: with
*Night of the Hogmen* in play, `VttSystem.maps()` listed 10 maps and every one of the 13 scenes from
*Calamity Strikes* to *Brace For The Hogstorm!* resolved to its place (the three bridge scenes to
`hog-bridge`, the two Travel openers to `hog-valley`); all ten images answered 200; the table opened
on *Calamity Strikes · The bridge* and the add-token menu offered the party with portraits, a
Hogman and "Someone (name them)" — three tokens drawn with their images (Pudget's portrait, the
hogman, the generic token as "Stricken Coachman"); Sir Shartle Pudget's sheet showed his portrait;
the site's Hogmen page showed all nine portraits loaded. Test member, tokens and campaign changes
reverted.

**Iso grid, scene figures, ability text (2026-10-07, owner's asks):** decisions 38–40. Proof on
localhost: *The Farmhouse* opened with `grid.iso` on, ratio 0.577, cell 120, the pattern a 120×69
diamond lattice, and the toolbar showing *iso* and *ratio*; the add-token menu opened with *In this
scene: The farmer, The farmer's wife*; "The farmer" landed at cell (1,1) wearing the generic token
and, after the centring fix, at the diamond's centre (translate(0,103.86), the projection of
(1.5, 1.5) on that grid); Dr Nabeel Uddin's sheet listed his three
abilities by their text with no "Ability n" label left. New tokens stage in a row across the
top-centre of the map in pixel space, a cell apart (three figures landed in distinct cells, all
inside the map, on the iso farmhouse and on the square Vale map alike). Test member, tokens and
campaign reverted.

**Selecting and deleting shapes (2026-10-07, owner's ask):** decision 41. Proof on localhost
through the real handlers: a circle, a square and a line drawn with the tools; with the Line tool
still active a click on the circle selected it (dashed, hint "circle selected · Delete or the
toolbar's Remove…", a *Remove circle* button in the toolbar) and Remove took it; right-click on the
square opened a menu (Label / Remove square), Label set "Lantern oil" as its title and the menu's
Remove took it; Clear (confirmed) emptied the rest and its button went with them. Map restored.

**The review batch (2026-10-07, owner's picks):** decisions 42–47. Proof on localhost through the
real controls, GM page: Dr Nabeel Uddin's sheet showed the Actions bar (*Actions · Guts 0 / 8*,
Push +1D / +1E at 2 Guts, Assist at 1 Guts with Mr Trode Wickle to pick, "in the book" links,
+1D / +1E next-roll toggles); Push +1D took Guts to 2, logged "pushes themselves: 2 Guts for +1D",
and the Brawn roll carried it (base 1, +1D, two dice, line "Brawn 1 +1D") then cleared; +1E next
roll gave "Wit 3 +1E"; Assist took Guts to 3 and logged it; at Guts 8 both Push buttons disabled
with "No Guts left"; picking Wild panic and filling an injury put "Hysteria: Wild panic",
"Injured: Level one · Less Effect" and "Guts used up" on the head and in the token's status;
Ctrl+Z twice undid the injury then the pick, Ctrl+Shift+Z brought the pick back, the sidebar's
Undo counted. Scene panel at *The Farmhouse*: *On the table · The Farmhouse*, buttons for the
farmer, his wife, All figures, Party to the table — the farmer and both party members landed on
`hog-farm` ("2 of 2 there"). Table: adding a Hogman made the Undo button read (1); clicking it took
the token off the map and the state (found and fixed on the way: the table had been mutating the
state's own map object, so an inverse saw the change already made — it now works on copies).
Player on 127.0.0.1 in room DA9TR, phone viewport 375×812: the sheet ran Actions bar → attributes
→ *At the table* (the GM's four log lines) → tracks, 24 px boxes; the player set Guts to 2 and
pushed +1E: Guts 4 on the GM's page, the line in the GM's log and the token status; joining a room
that does not exist showed the banner "Lost the table — reconnecting…" with Retry now. Test
members, tokens, session and campaign reverted.

**The rest of the review (2026-10-07):** decisions 48–58. Proof on localhost through the real
controls, GM page: *Let the Festivities Commence* listed the Chaperone, Lord Kirklan Kelmorton,
the four sons and the Other Guests, each linked to its cast entry with the generic portrait, and
*Rescue!* listed Ivo Mehmed, the Crown's agents, Mr Bagbury and his men; *Running* set the slots
to Scene · Party · Dice log and *Prep* back; a started session showed "0m at the table", "nothing
rolled yet", and the Worker answered the room's createdAt / lastActive; *Notes as text* produced
`night-of-the-hogmen-notes.txt` with the scene's note; a forced autosave listed two autosaves a
party member apart; *Print* sits in the scene nav. Table on the iso farmhouse: the clocks overlay
read 3 / 8 and a click made it 5 / 8 on the GM page too; the ruler read "11.2 cells" and left
nothing; the brush painted seven circles, seven fog holes, persisted; a selected Hogman took size
2 from the 3 key, hid on H, and Ctrl+D made a second at the next cell; the next map (the bog) was
preloaded; the player view kept the 120×69 diamond lattice and showed the clock with its boxes
disabled. The sheet window opened on Mr Laconicus Strong with GM notes and a Brawn roll from it
reached the GM sidebar's ticker ("last: Mr Laconicus Strong · Brawn → 6"). Worker redeployed
(version c83c9721). Test data reverted.

**Three views and their own token (2026-10-08):** decisions 59–60. Proof on localhost, the local
Worker, GM on localhost (room 3UKU2, a Bruiser *Test Player* added, the table on the Manor's middle
floor), player on 127.0.0.1: the claimed sheet opened full-page with *Sheet · Map · Map + sheet* in
the header and *Map* / *Map + sheet* on its bar; *Map* hid the sheet and framed
`gm/vtt.html?view=player` with the toolbar "Fit · Ping · Clocks · Place my token" and the hint
"Place my token puts you on the map"; the button put `tk-pc-…` at cell 13,11 on the player's map
and on the GM's state through the room, the button then gone and the hint "Drag your own token";
pointer events on the token's circle moved it to 15,9 on both sides (the harness's drag panned
instead — it never landed on the 26 px circle; the table's own handlers were exercised directly);
*Map + sheet* showed the compact sheet (actions-bar, tracks, ratings, rolls) beside the same frame
(same `src`, the token still on it) with *Expand the sheet · Map only*, and *Expand the sheet* went
back to the full sheet; at 375×812 the split stacked the map (365 px) over the sheet. No console
errors. Test member, token, session reverted.

**NPC options and box selection (2026-10-08):** decision 63. Proof on localhost, GM table on the
Manor's middle floor with Mr Bagbury (cast) and A Hogman (foe) added: a left click on Mr Bagbury
opened the menu titled with his name — Ring (10 swatches + a colour picker), Face (12 icons), Name
(Below · On hover), Size (squares on a side), Hide · Rename · Remove; *Ochre* set his ring stroke
to `#b9842a`, *Skull* his image to `assets/tokens/npc/skull.svg`, *On hover* put `label-hover` on
the token (label opacity 0 until hovered), size 2 made him two squares — all four in the state's
map (undo stack 4). A box dragged over both tokens selected 2 ("2 selected · drag one to move them
all" in the hint); dragging the Hogman moved both from 9,1 / 10,1 to 13,5 / 14,5 as one undo (5);
Delete removed both, Ctrl+Z brought both back; a middle-button drag panned the view, a left drag
on empty map selected nothing; a click on a party token raised `select` for its sheet and no menu.
Test tokens reverted.

**Calls, the roll line, the token's sheet (2026-10-09):** decisions 81–83. Proof on localhost with
the local Worker, Blood Cotillion, Miss Maria Morsock, room SPZ6E, the player claimed on
127.0.0.1: the Calls panel offered Controlled · Risky · Desperate, Poor · Limited · Reasonable ·
Superb and Brawn · Wit · Sleight · Will; *Call* with the note "shove the butler" put the call in
the state (Risky · Reasonable · Brawn), the card went live with *Update · Withdraw*; the player's
sheet showed "The GM calls · shove the butler | Risky | Reasonable | Brawn | Roll Brawn (0)" with
the Risky description on hover; the GM changed the selects to Desperate and Superb and the player's
block read "Desperate | Superb | Brawn" with no click; *Roll Brawn (0)* logged position Desperate,
called, effectBase Superb, band 1-3, the line "… 1-3 You fail and there are bad consequences.
Sorry. | Desperate · Effect Superb · not reached", the call cleared on both sides and the panel's
card read "Last answered:" with that line. Table: her party token's label was her name alone;
a click opened the menu with a Sheet section "Stress 1 / 8 − + / Suspicion 0 / 6 − + / Level one −
+ Less Effect / Level two − + -1D / Level three − +"; *+* on Stress made it 2 / 8 with the menu
open; *+* on Level one filled a box and the token read "Miss Maria Morsock · Injured: Level one ·
Less Effect". Worker redeployed (7efb5c37). Test member, token, log, calls, session reverted.

**Layouts (2026-10-08):** decision 80. Proof on localhost at 1400 × 900: the page opened in
`main wide ly-3col`; Settings listed Three rows · Three columns (on) · Four columns · Three columns,
first split · Four columns, ends split; *Four columns, ends split* gave four columns and six
regions (tracker, scene, settings, party, log, clocks) with the preference saved; a click into the
second region selected it (focus 1, the outline on `data-region="1"`) and *Rules & Books* from the
nav opened there; no console errors. Layout and slots put back.

**The GM's map and the players' (2026-10-08):** decision 79. Proof on localhost, the GM's table
and a player view (`?view=player`) on the same origin: both on the middle floor, the button read
"Players are here" (disabled); the map list switched the GM to the lower floor and the players'
`table.map` stayed `manor-middle`, the player view's title too, the button now "Bring players
here" with the tooltip "The players are on The Manor Itself · Middle Floor — bring them to this
one"; a click set `table.map` to `manor-lower` (one undo), the player view's title went to the
lower floor and the button read "Players are here". Reverted to the middle floor.

**Guts used up and injuries told (2026-10-08):** decision 78. Proof on localhost through
`TeethSheet.live` for Miss Maria Morsock: the last Stress box logged "has used up their Stress
(8 / 8)"; Stress back to 6 then *Push +1E (2 Stress)* logged the used-up line before the push line;
*+* on Level two logged "takes a Level two injury — -1D"; "stabbed with a fork" typed into a Level
one box logged "takes a Level one injury: stabbed with a fork — Less Effect". Test member and log
reverted.

**Everyone's next roll, panning, the two panes (2026-10-08):** decisions 72–77. Proof on
localhost with the local Worker, a Hogmen campaign (room Q8G2P), Mr Laconicus Strong on the GM's
page and Dr Nabeel Uddin claimed on 127.0.0.1: Strong's abilities 1 and 2 chosen; the couplet
button (title "Using 2 Guts, Strong bellows an inspiring couplet: +1E on each players’ next roll")
took Guts 0 → 2, logged "… — +1E on everyone's next roll", and both sheets on the GM's page read
"next roll: +1E" (once each, after the double-count was fixed); Uddin's page read "next roll: +1E"
and his roll carried effect 1, "Effect: Superb", why "Mr Laconicus Strong Ability 1", the note
clear after it. Table, Uddin's own token placed at 13,11: a real left drag moved it to 16,8 on his
map and the GM's with the viewBox unchanged; a left drag on empty map did not pan; ArrowRight
panned (viewBox x 216); a right-button drag panned and the contextmenu event was prevented. The
player's sheet has no "in the book"; the Level one row's tooltip reads "Less Effect — Minor injury,
e.g. bloodied and bruised. (-1E)"; Map + sheet showed the sheet pane (469 px, scrolling) over the
rolls pane (227 px, scrolling, 2 lines), *hide* collapsed it to a header. Worker redeployed for the
`arm` event. Test members, tokens, log, module and session reverted.

**Sheet mechanics, the reset, the feed column (2026-10-08):** decisions 64–71. Proof on localhost
with the local Worker. Sheet (Miss Maria Morsock, Blood Cotillion, through `TeethSheet.live`): the
actions bar read Effect · Poor / Limited / Reasonable / Superb, three ability buttons, three injury
rows "Level one − + Less Effect / Level two − + -1D / Level three − + Ugh! …"; *+* on Level one filled a
box and the roll line read "Effect: Limited (Reasonable -1E injured) | Level one: Less Effect"; two
more *+* filled Level one and went up to Level two, whose roll read "Brawn 0 -1D … Level two: -1D"
on two dice taking the lowest; the checkbox off left the next roll uninjured; *+1E next roll* then a
roll read "Effect: Superb (Reasonable +1E)" and the tick was clear after it; the fire ability logged
"uses an ability: When entering a room with an open fire…" and armed "next roll: +1E"; three *−*
healed everything; an Aberrant Behaviour pick put "ABERRANT BEHAVIOUR: UNWARRANTED AGGRESSION"
first in the compact sheet, which also carried the abilities, injuries and Effect. Table: a click on
her party token opened the menu with Open sheet · Hide · Rename · Remove, 11 swatches, 12 faces;
Open sheet raised `select` for her. GM page, room WNMWG with a clock at 3/4, a scene done, a token
on the map, the player on 127.0.0.1 claimed: the full page showed the feed in a 300 px right column
(10 lines), the split folded it under "At the table · 5" and remembered it closed; *Reset to the
beginning of the scenario* (confirm accepted) left progress `{}`, current `{}`, the clock at 0, the
log empty, 0 tokens on 7 kept maps, her picks `{}`, injuries `[]`, Stress 0, no claims; the player's
page went back to "Who are you?"; one Undo restored the scene, the clock, the 12 log lines, the token
and the pick. Worker redeployed (version 0e39dcc7). Test members, clock, scene, token, session reverted.

**Map-only fixed, fit on switch (2026-10-08):** decisions 61–62. Proof on localhost, GM on
localhost (room ETAL9, a Bruiser *Test Player*), player on 127.0.0.1 at 1024×768: the join link
moved the tab out of room 3UKU2 into ETAL9 and the claim seated it; *Map* gave the frame the whole
width (left 0, 1024 × 696) with the viewBox at the map's `0 0 2160 1760`; a wheel zoom in map
view then *Map + sheet* refit it (frame at 380, 644 wide; viewBox back to `0 0 2160 1760`; the
compact sheet beside it); a zoom in the split then *Map* refit it again; *Sheet* gave the full
sheet. No console errors. Test member and session reverted.

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

**Playbooks of the modules in play (2026-10-07, owner's report):** decision 36. Proof on
localhost through the real controls: with books set to core / shared / cotillion only, ticking
*Night of the Hogmen* in the Campaign panel listed 9 Passengers beside the 8 Ingenues and added
`hogmen` to the books; with books left at cotillion's and the module switched to *Stranger and
Stranger*, the picker listed 7 Villagers, adding Peter Clovis as "Test Villager" gave a sheet with
Stress, Corruption and Stranger's own injury levels (Level one · Less Effect …); the books a module
in play needs show locked in the Campaign panel. Test member removed, campaign restored.

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
| 36 | The books a campaign plays with are its "Books for reference" **plus, always, every module in play's own** (`VttSystem.playBooks`: a one-shot brings the core and the shared types with it). The Party picker, Clocks, the sheet's lookups (Roll ladder, Tracks, Injury Levels) and the Rules browser read that set; the Campaign panel's module checkbox adds the module's books, and a book a module in play needs is locked on | Owner 2026-10-07: "add a character from a playbook" showed no Passengers or Villagers — the picker read only the reference books, which the Campaign panel's module checkbox never touched (the tracker's picker did). The module's own material must not depend on which control put it in play. |
| 37 | Night of the Hogmen ships ten maps — isometric engravings the owner generated to prompts written from the scenes (2026-10-07), WebP q70 at native size (~1 MB each) — one per place, plus the book's engraved map of the Vale (owner's screenshot) for *The Set-Up & The Scenario* and *Who Are The Passengers?*; a map def's `scene` may list several scenes that happen in one place (the bridge serves *Calamity Strikes*, *What Do They Take?* and *The True Peril Is Revealed*; the valley serves the two Travel openers) and is listed once under the first. Portraits for the nine Passengers (`PORTRAITS` by template name) become the party token's face and the sheet's and the site card's; a cast member without art wears a drawn generic token (`assets/tokens/npc.svg`); a Hogman token and a "Someone (name them)" entry sit in the add-token menu for every campaign | Owner supplied the art. Maps devoid of figures so tokens carry the people; art by name because the corpus has no image fields. |
| 38 | The table's grid has an **iso** mode (`grid.iso`, `grid.ratio`): a cell is a diamond `size` wide and `size × ratio` tall, cell x running down-right and cell y down-left; cell space stays a square lattice, so tokens, snapping, fog reveals and square effects need no new logic — rectangles in cell space draw as polygons. The isometric Hogmen maps ship with it on (ratio 0.577, the 30° engravings); the Vale map and the Cotillion plans stay square | Owner's ask 2026-10-07. One projection function, everything else unchanged. |
| 39 | Each scene's figures are offered first in the add-token menu, under *In this scene*, as the scene's own text names them (`SCENE_FIGURES`, by module and scene name): a Hogman wears the horde's token, a person the generic one, an animal its initials. Hand-listed in the system module because the corpus links no people to the one-shots' scenes (their refs are rules terms) | Owner's ask 2026-10-07. Written for Night of the Hogmen; Blood Cotillion's and Stranger's scenes are still to be listed. |
| 40 | A one-shot playbook's Special Abilities carry no titles in the book — the corpus says so at the `Sheet Ability` type ("the DEF names are authored labels") — so the sheet shows each ability's text as the item, not "X Ability 1" | Owner asked whether the pregens' abilities should have names (2026-10-07): they don't; the labels were the converter's. |
| 41 | Shapes drawn with the circle, line and square tools are selected by a click (dashed highlight), removed by the toolbar's **Remove** button or the Delete key, labelled or removed from a right-click menu, and all cleared at once by **Clear** (confirmed); the hint names the selection. Right-click no longer deletes a shape outright | Owner 2026-10-07: there was no visible way to select or delete a shape — selection and Delete existed but nothing said so, and right-click deleted without warning. |
| 42 | **Undo / redo**, per window, of that window's own commits: `Ops.inverse(state, name, args)` computes the inverse op before the op is applied (previous live sub-objects, token position, whole map state, clock, member, notes, scene, order, campaign fields; a log line has none); `State.undo()` commits the inverse like any other op, so sibling windows and the room follow; a 30-deep stack with redo. Ctrl+Z / Ctrl+Shift+Z on the GM page, the table and the player's page; an Undo button with a count on the GM page and the table | Owner's review ask 2026-10-07. Inverses computed from state rather than snapshots keep the room's document and the op stream the single source. |
| 43 | **Rolls carry modifiers.** A sheet's Actions bar arms +1D / +1E for the next roll (free toggles for an item or a bargain with the GM) and the roll logs base, extra dice, effect and why; the roll line reads "Brawn 0 +1D +1E" | Owner's review ask: the book's +1D / +1E had to be done in the player's head. |
| 44 | **Push and Assist as named actions**, at the book's costs — 2 of the resource for a push (+1D or +1E), 1 to assist another player (+1E) — on Guts where the sheet has it (the Hogmen) else Stress, both of which fill; each spends through `setPartyLive` (undoable) and writes an `action` line to the log; at the limit the buttons disable with the reason. "In the book" links beside them open the core's Stress Sources or the one-shot's Guts / Stress and Team Actions sections | Owner's review ask. The costs are the same in every book read (core, Hogmen, Cotillion, Stranger). |
| 45 | **Reminders.** `TeethSheet.conditions(m)` — the behaviour pick at the limit (Hysteria / Aberrant / Erratic Behaviour), the worst injury filled with its penalty, the resource used up — as chips on the sheet head and in the party token's status line (dashed ring) | Owner's review ask. |
| 46 | **The player's page** shows *At the table*, the last ten rolls and named actions of everyone (the log as the room already shares it), a reconnect banner with *Retry now* (`Session.reconnect()` drops the backoff) whenever the session is active but not online, and on a phone (≤600 px) puts the Actions bar, the attributes and the roll feed first with larger targets | Owner's review asks. |
| 47 | **On the table** in the Scene panel: the scene's map name, a button per figure (and *All figures*), *Party to the table* with a count of who is there; `VttSystem.placeTokens` builds the map state the way the table does and stages tokens a cell apart | Owner's review ask: the figures were three clicks away in another window. |
| 48 | Blood Cotillion's and Stranger and Stranger's scenes have their figures (`SCENE_FIGURES`), named as the scene text names them; a figure whose name is a cast member's links to it and wears its portrait | The rest of decision 39. |
| 49 | The GM sidebar's session block shows the time at the table, the last roll or action, and the room's idleness (the Worker's GET now returns `createdAt` / `lastActive` / `idleMs`), in red from two days before expiry | Review item: the GM page showed no life from the players. |
| 50 | Panel presets, one click each: *Prep* (Module · Scene · Inspector) and *Running* (Scene · Party · Dice log); on a narrow screen the preset's first panel shows | Review item. |
| 51 | Right-click on a party card opens the sheet in its own window (`gm/sheet.html?member=…`, `engine/sheet-window.js`): the GM's view, on the same state, for a second screen | Review item. |
| 52 | *Notes as text* in the Campaign panel downloads every scene's done-mark and notes per module and the party's GM notes as one text file; *Print* in the Scene panel prints the scene alone (a print stylesheet hides the rest) | Review item. |
| 53 | The table shows the campaign's clocks over the map (*Clocks* toggles; the GM ticks them there, the player view shows the visible ones read-only) | Review item. |
| 54 | Token keys: with a token selected, 1–4 set its size, H hides or reveals it, Ctrl+D duplicates it a cell over; the hint says so | Review item. |
| 55 | A *Ruler* tool: drag to read a distance in cells (cell-space, so true on an iso grid); nothing is left behind | Review item. |
| 56 | A fog *Brush*: a circle of reveal of radius *r* painted as the pointer moves; reveals may be circles or rectangles, drawn as polygons (ellipses on an iso grid) and honoured when a player's token is tested for visibility | Review item. |
| 57 | On every map switch the next scene's shipped map is fetched ahead; the player view was proven to keep the iso grid | Review items. |
| 58 | Rolling autosaves: a minute apart while anything changes, the last three per campaign, in IndexedDB; the Campaign panel lists them with *restore* | Review item: the browser was the only live copy between pack downloads. |
| 59 | The player's page is one of three views once seated: the sheet full-page (where it starts), the map full-page, or the map beside a compact sheet (actions, tracks, ratings, rolls — nothing to read), chosen in the header or on the sheet's bar; the compact sheet has *Expand the sheet* and *Map only*; the map is the table's player view in a frame made once and kept, so the player's pan and zoom survive switching; on a phone the split stacks the map over the sheet; the choice is remembered per tab | Owner's ask (2026-10-08). A frame rather than a second table in the page: the table stays one module, and it already works as a sibling window on the bus. |
| 61 | The map fits itself whenever the player's view changes (map ↔ split), on a timer rather than an animation frame so it fires in a background tab too; map-only takes a single column — `body` carries the GM page's sidebar + main columns, and the frame had landed in the 190 px sidebar column | Owner's report with a screenshot (2026-10-08): the map-only view was a 190 px strip beside blank paper. |
| 62 | A join link (`play.html?s=CODE`) joins its room even when the tab is still seated in another room from last time | Found while proving 61: the tab stayed in the previous evening's room and showed "Your character isn't in the party any more". |
| 63 | NPC tokens have an options menu on a left click (a drag still moves): ring colour from the system's palette or any colour, a face from a dozen generic icons (`assets/tokens/npc/`, the house style), the name below or on hover, size as squares on a side; the right-click menu is the same menu. The table keeps a selection set: drag a box on the map to select the tokens inside (Shift adds), drag one to move them all as one undo step, the keys and Delete take them all; Space, the middle button or a *Pan* tool pans. The system supplies `tokenPalette()` and `tokenIcons()`; a party token's click still opens its sheet | Owner's ask (2026-10-08): "left-click on the top and get an options menu … click and drag should still move them. Clicking and dragging a box around should select." Plain drag on the map became the marquee, so panning moved to Space / middle button / Pan. |
| 64 | The token options menu serves party tokens too (ring, face, name, size, hide, rename, remove), with *Open sheet* in it; a cast token's menu has *Open entry* | Owner's ask (2026-10-08). |
| 65 | The next-roll modifiers were lost after the first roll: `doRoll` replaced the sheet's armed object with a new one, so the actions bar kept toggling a dead one and its tick never cleared. It now resets in place and the sheet redraws after a roll | Owner's report: "+1E next roll doesn't seem to apply". The entry always carried `effect: 1`; the sheet's view of it was the bug. |
| 66 | The Effect reached is in the dice result: the sheet carries the level the GM set from the book's range "Poor—Limited—Reasonable—Superb" (Reasonable until changed), +1E and an injury's −1E move along it, and the roll line reads "Effect: Superb (Reasonable +1E)" | Without a base level, "+1E" had nothing to show against. The range is the book's words; the default is a choice the sheet exposes. |
| 67 | Injuries have controls on the sheet, for the GM and the player alike: each level's boxes with − and + in the actions bar (a full level goes up a tier, as the book says); the worst injury's penalty is applied to the roll and named on the roll line ("Level one: Less Effect", "Level two: −1D", the mortal level's sentence), with a checkbox to leave it off a roll it does not touch | Owner's ask. The penalty is the book's text where the level prints a Penalty, else its sentence on the penalty. "Relevant to the Injury" is the GM's call, hence the checkbox. |
| 68 | The chosen special abilities are buttons in the actions bar (so in the compact sheet too): a press spends what the text says ("Spend 2 Guts", "for 2 Guts", "at no Guts cost"), arms what it grants (+1D, +1E, "Greater Effect") for the next roll, and logs the use for the table. A fixed list (a pregen's) counts as all chosen | Owner's ask. The terms are read from the text; an ability with none just logs. |
| 69 | A behaviour at the limit (Hysteria, Aberrant Behaviour, Erratic Behaviour) and a mortal injury stand in a blood-red bar across the top of the sheet, in the book's words — GM's panel, player's page, compact sheet alike | Owner's ask. The header chips stay; the bar is what is seen first. |
| 70 | *Reset to the beginning of the scenario* in the Campaign panel: scenes undone, clues unrevealed, the current scene cleared, clocks emptied, the log cleared, every map's tokens, shapes and fog reveals gone, every sheet back to before play (tracks, counters, injuries, behaviours reset; ratings, abilities, items and other choices kept) and every claim released — one op (`setKeys`, GM only, the previous values as its inverse), one undo | Owner's ask, incl. "reset all the character sheets to unclaimed and no changes made". Choices made at creation are not play, so they stay; the Worker was redeployed for the op. |
| 71 | The player's full-page sheet keeps *At the table* in a column on the right (sticky, its own scroll); beside the map it folds under its heading, remembered per tab | Owner's ask. |
| 72 | An ability "for each player's next roll" arms every sheet: the press emits an `arm` event (ids, dice, effect, why) that the bus applies to this page's sheets and the room carries to every other device (`arm` joined the relayed events in session.js and the Worker); each page redraws the live sheets it has mounted | Owner's ask. The modifiers live per window, so the event is the only way across devices; the originating page applies it once (through its own bus listener, not directly as well — that double-counted at first). |
| 73 | The map pans by right-drag, the arrow keys (Shift for half a screen), Space, the middle button or the Pan tool; a player's left drag moves their own token or nothing (a finger still pans on touch); a right click that did not move still opens the GM's menu; every token has a hit circle a little wider than its ring | Owner's report: a left drag on their token panned the map; with the left button free of panning a missed grab does nothing instead of moving the view. |
| 74 | "in the book" links are off the player's sheet (no Inspector there to open them in); the GM's keep them | Owner's ask. |
| 75 | An injury level's row carries its penalty and the book's description as a tooltip; the short penalty ("Less Effect", "-1D") stays inline, a sentence lives in the tooltip; the + and − say what they do | Owner's ask. |
| 76 | Beside the map the player's sidebar is two panes: the sheet above (two thirds), *At the table* below (one third, the last 30 lines), each with its own scroll, the rolls pane hideable | Owner's ask: no scrolling up and down between the sheet and the rolls. Replaces the fold of decision 71. |
| 77 | A pick-them-all ability list (pick n of n) counts as chosen for the buttons; a pick-some list shows its buttons once the picks are made | Found proving 72: Mr Laconicus Strong picks 2 of 3, so a fresh pregen showed no buttons until chosen — by design, said so. |
| 78 | The table is told when Guts or Stress is used up (a box set to the limit, or a Push/Assist that reaches it) and when an injury is taken (the stepper, or an injury written into a box): action lines in the log, so they show in *At the table* and the GM's Dice log | Owner's ask. Only the crossing is told, not every spend. |
| 79 | The GM switches maps without moving the players: a map switch no longer sets the shared `table.map` (only the first map shown does, when nothing is shared yet); *Bring players here* in the toolbar sets it, reads *Players are here* once they are, and its tooltip names the map the players are on | Owner's ask: look ahead at another map while the players stay. |
| 80 | Settings ▸ Layout, ported from the Daggerheart VTT: five arrangements of the wide GM page (three rows; three or four columns; three columns with the first split; four with both ends split), each region with its own picker, a click into a region selecting where a nav choice opens, the choice per browser; the classic three columns keep TEETH's 22 / flex / 32 proportions; the Prep / Running presets fill the first three regions and leave the rest | Owner's ask (the "tile structure" setting Daggerheart has). Coyote & Crow, Daggerheart, D&D 5e, Marvel and Pendragon already carry it; Aegean, Invisible Sun, L5R5e, TOR2e, Troika and VtM5e do not. |
| 81 | A *Calls* panel: the GM sets Position (the book's Controlled · Risky · Desperate), Effect (Poor—Limited—Reasonable—Superb) and the Action or Attribute for a member's next roll, with a note, and *Call* pushes it (`setCall`, shared `calls`); the sheet shows *The GM calls* with the terms (the Position's description on hover) and one Roll button for that Action; while the call stands every change the GM makes goes to the sheet at once, *Withdraw* takes it back; the roll takes the call's Effect as its base, carries the Position, and clears the call (`clearCall`, the player's own); the panel shows the roll that answered | Owner's ask: "GM sets Risky, Reasonable, Brawn … they discuss … the GM makes the changes … the player sees the updated roll, and then makes the roll." |
| 82 | The roll line reads what happened first — the band and the book's words — and only then the terms: "Desperate · Effect Superb", or on a 1-3 "Effect Superb · not reached" | Owner's report: Effect led and read as if it would happen on a failure. |
| 83 | Party tokens no longer print their tracks; the token's status is its conditions (Hysteria, an injury, a resource used up). A party token's options menu carries a *Sheet* section: every track and counter with − and +, every injury level with its boxes and − and +, the menu staying open as they change (`Sys.tokenMenu`, the table page now loads the sheet module) | Owner's ask: no Guts/Silver on the tokens; set them from the token's menu. |
| 60 | A player places and moves their own token: `placeToken(mapId, token)` is a new op a player may send for a party token they own (the map must be in the state — the GM's table put it there — and one token per member per map); the table in player view offers *Place my token* when theirs is not on the map, drops it at the centre of their view, and reads the seat from the session record in storage, since the table's window (its own tab, or the player page's frame) holds no socket | Owner's report: players could not place or move their own token — `canDrag` asked a `VttSession` the table page never loads, so it was always "no". Moving was already the player's op; placing was not. The map and everyone else's tokens stay the GM's. |
| 23 | Cross-window sync carries the change, not a hint: `state:changed` now travels with the op (or the whole document) and sibling windows apply it in memory instead of re-reading localStorage | Found while proving 21: a BroadcastChannel message reached the GM page before the table's localStorage write was visible there; the stale re-read was then saved back over the table's map. Applying the op is deterministic and needs no read. |
| 13 | The player's page (`engine/play.js`) is generic; the system supplies `liveSheet(member, {player})` and `memberSubtitle(member)` through `VttSystem` | The join → claim → sheet flow is the same for every system. |
| 14 | `wrangler dev` was run from Bash for the M5 proof because the preview harness had reached its five-servers-per-folder limit (four belong to other chats); stopped after the test | Reported as the deviation it is; the launch entry `vtt-teeth-worker` exists for the harness. |
| 12 | The Blood Cotillion map downloads in the owner's `~/Downloads/TEETH/Blood Cotillion` were converted to 2400 px WebP under `assets/maps/cotillion/` (owner's Q2: art lives in this repo) and declared per scene in `system/teeth/table.js`; grid at 80 px until the GM calibrates | The table needed a map to be proven on; the originals (5500 × 7000 JPG, up to 27 MB) stay out. |

## Family standards (PLAYBOOK §4b, owner 2026-09-24)

Ported from sortilege-vtt-l5r5e (I19) as system-free engine files, so this repo's `system/` is
untouched but for its site tabs:

1. **Not crawled** — `robots.txt` (the AI crawlers by name, then `*`) and a robots meta tag on every page.
2. **The GM's material in the GM tabs, in the pack** — `engine/gm-text.js` (the GM Markdown with its
   SET / OPEN / SOURCE tags, sections with an editor, notes, search) and `engine/gm-panes.js`
   (Overview with rulings and free notes, Scenes with sessions, beats and questions for the table,
   Threads, Places, People); their ops are local, never sent to a session's room
   (`engine/ops.js` LOCAL, `engine/session.js`). The seed now fills by id and never re-adds what the
   GM removed (`engine/state.js`); `hidePanes` / `paneOrder` (`engine/panels.js`).
3. **A gate in front of /gm/** — `VttConfig.gmGate` (`engine/app.js`), once per tab.
4. **The books off the public site** — `siteBooks: false`; every site tab but the dice is marked
   `books`; the GM turns them on per browser in the new Settings pane. With every tab closed the
   site says so. The book data stays publicly served (owner: fine for now).

**Landed 2026-09-24** — localhost:8735 — the site: one tab, the closed-books page, the robots tag; /gm/: the gate, Enter, the nav gains Overview · Scenes · Threads · Places · People · Settings; a section with [SET]/[OPEN], bold, italic and code saved and drawn; a scene added; Settings' toggle wrote the key and the site then showed Rules · Characters · Character creator; vtt.html and play.html load with no console errors.
