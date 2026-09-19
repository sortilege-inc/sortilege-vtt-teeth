# sortilege-vtt-teeth

A virtual tabletop for **TEETH** (Jim Rossignol & Marsh Davies) — the GM's table, the players'
sheets on their own devices, the GM's maps, and the published modules built in from the
[Titterpig DSL corpus](../../Titterpig/DSL/titterpig-dsl-teeth) — built so the next system can
copy its shape ([PLAYBOOK.md](PLAYBOOK.md)). Plan, decisions and milestones: [PLAN.md](PLAN.md).

Buildless static site (GitHub Pages) plus one Cloudflare Worker for player sessions.

## Status

| Milestone | State |
|---|---|
| M1 — `build/` generates `data/` from the corpus; two-directional gate | **landed** (2026-09-19) |
| M2 — engine + TEETH glossary, module tracker, scene panel (Blood Cotillion) | **landed** (2026-09-19) |
| M3 — sheets, party, dice log, campaign pack | **landed** (2026-09-19) |
| M4 — the table (maps, grid, tokens, fog, pings, player view) | **landed** (2026-09-19) |
| M5 — Worker + rooms | next |
| M6 — remaining modules, Outfit sheet, clocks | — |
| M7 — deploy, first campaign pack | — |

## Running it

```bash
python3 -m http.server 8735
```

then open `http://localhost:8735/`. The GM page opens on a *Blood Cotillion* campaign: **Module**
(scenes by phase, tick as you go) · **Scene** (the book's text, read-aloud, clues you reveal,
resolutions, GM guidance, your notes) · **Inspector** (whatever you last clicked). The sidebar
swaps in **Party** (add a character from any playbook in the campaign's books; the live sheet —
tracks, ratings, rolls, picks, items, injuries, notes — opens in the Inspector), **Dice log**,
**Cast**, **Rules & Books** (search everything with `/`, or browse a book), **Lore** and
**Campaign** (which modules and books are in play; save / restore the campaign as a pack).
Everything you tick or type is saved in this browser as you go.

**Open table** puts the current scene's map in its own window (`vtt.html`): grid calibration,
tokens for the party and the cast (add them from the toolbar; drag to move; right-click to hide,
resize, rename), pings, circle / line / square effects, fog with reveal rectangles. It follows the
GM's scene unless pinned. **Open player view** (`vtt.html?view=player`) is the same map with no
controls, fog opaque and hidden tokens absent — for the TV, or for a player's device once
sessions exist (M5). Map images live in `assets/maps/`; `system/teeth/table.js` says which scene
ships with which.

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
build/          the generator and its gate
data/           GENERATED — window.TEETH.books / .entities / .index
engine/         system-agnostic: bus, ops, state, session, store, layout, panels, VTT, dice log
system/teeth/   the TEETH module: sheets, tracks, clocks, the d6 pool roller, TEETH ops
assets/maps/    the GM's maps (web-sized); assets/art/ portraits and handouts
worker/         the Cloudflare Worker: SessionRoom Durable Object (M5)
docs/           notes; PLAN.md is the decision log
```

## Rights

TEETH, Night of the Hogmen, Blood Cotillion, Stranger and Stranger, More Teeth and False
Kingdom are © Jim Rossignol and Marsh Davies (More Teeth also Jamie Brittain), based on Blades
in the Dark by John Harper (CC BY 3.0). This is an unofficial play aid for the owner's table,
not a redistribution of the books.
