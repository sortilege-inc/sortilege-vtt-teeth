# Instances — a campaign as a fork of its system's VTT

The general guide to PLAYBOOK §4. Proven by the first instance, *Portents & Fortunes* (an L5R5e
campaign forked from `sortilege-vtt-l5r5e`, live at portents.sortilege.online): its plan and
decision log record each step as it was proven, and this file is what generalises from it.

## What an instance is

A campaign repo that **is a fork of its system's VTT**. The VTT owns the root — the site at `/`,
the GM's table at `/gm/`, the player's page, the engine, the system module, the generated books.
The campaign owns `campaign/` and a short list of root files. Campaign material is presented
*inside* the VTT's framing — site tabs, GM panes and a data layer the campaign registers — not as
a second site beside it. The pack still exists; it lives in the campaign's own repo, which is the
instance.

**Before forking a VTT, it needs the hook.** The instance hook (below) was built in
`sortilege-vtt-l5r5e` (`engine/instance.js`, the stage tags in its pages, the layer build, the
seed and the Notes document). Another system's VTT gets them ported into its `engine/` and
`build/` first; an instance never edits upstream files to make room for itself.

## The boundary

| Owned by | Paths | Rule |
|---|---|---|
| Upstream | everything not listed below | **Never edited in the instance.** A change every campaign of the system would want is built upstream and pulled. |
| The instance, at the root | `engine/config.js`, `worker/wrangler.jsonc`, `README.md`, `CNAME`, `.gitignore`, `.claude/launch.json`, `.gitattributes` | Per-origin and per-deployment. Marked `merge=ours` in `.gitattributes`, so an upstream pull never overwrites them. |
| The instance | `campaign/`, `.claude/skills/` | Everything the campaign authors. |

`merge=ours` needs a driver git does not store in the repo — run once per clone:

```bash
git config merge.ours.driver true
```

Without it the attribute does nothing and an upstream change to `engine/config.js` conflicts. The
driver engages only when both sides changed a file, and every instance-owned file differs from
upstream's by design, so it always does. The instance's `.gitignore` adds `!.claude/skills/`
(upstream ignores `.claude/*`).

**Pulling upstream is a merge, never a rebase** (a rebase would rewrite the campaign's history):

```bash
git fetch upstream && git merge upstream/main
```

`git pull` refuses with no strategy configured. If `engine/config.js` has uncommitted changes,
stash first — the merge refuses to touch a dirty file that upstream also changed. Because
`merge=ours` keeps the instance's **whole** `engine/config.js`, a key upstream adds there never
arrives on its own: after each pull, read `git diff <last pulled>..upstream/main -- engine/config.js`
and carry what applies by hand.

## Where a thing goes

| It is… | It goes in… | Because |
|---|---|---|
| Game data that must be right — an NPC's statblock, a PC, a house rule | `campaign/dsl/`, in the Titterpig DSL | The VTT's build parses it into the campaign's data through the same two-way gate as the books. A house rule is a `MODIFY`, shown beside the rule it changes as errata are. |
| State that changes in play — the arc, threads, notes, the party's tracks | the pack (the live room; its saves) | Edited in the tool; archive first, then change. |
| A starting arc, encounters, anything a fresh GM browser should have | `campaign/pack/seed.json`, generated | `defaultCampaign.seed` fills only what the campaign has **never had**, once; the GM's edits are never overwritten. |
| Authored prose — the GM's state document, a chronicle, a gazetteer | `campaign/docs/` | Written and reviewed as files; site tabs and the GM's Notes pane render them. |
| Presentation only — portraits, what a player has revealed, build notes | `campaign/site/`, keyed by entity id | Not game data; kept out of the gate. |
| Code | upstream if generic; `campaign/site/` through the hook if not | A feature one campaign needs today, every campaign of the system needs tomorrow. Portents' player-page work (phone layout, the Conflict tab, advancement) all went upstream. |
| Art | `campaign/assets/` | The campaign's own. |

## Standing it up

Each step proven before the next, in the browser through the real controls.

1. **Decide visibility.** A public instance publishes the VTT's `data/` — the books, verbatim. The
   first push carrying it is the point of publication (a branch of a public repo counts).
2. **Fork**, in three commits on a branch:
   1. **Move** every existing campaign file under `campaign/` with `git mv`, nothing else. Prove
      it: `git show --name-status` lists only `R100`, zero insertions, zero deletions.
   2. **Merge**: add the VTT as `upstream`, `git merge --allow-unrelated-histories upstream/main`.
      After the move the only collision should be `.gitignore` — resolve it as the union.
   3. **Boundary**: the instance-owned root files, `.gitattributes`, the driver.

   **Prove the boundary by making it fail first**, in a throwaway clone: a fake upstream change to
   `engine/config.js` and to an upstream-owned file, merged without the driver (conflicts on
   `config.js`), then with it (`config.js` keeps the instance's copy, the other file takes the
   change). Check every link statically: a site moved by one prefix keeps relative links, but only
   if none is root-absolute. **Distrust the first load of `/`** — the old home is cached at the same
   URL; force it with `fetch(url, {cache: 'reload'})` before reading anything.
3. **Homebrew into the DSL**, by a script kept in `campaign/source/`, piloted on **one** entity and
   checked field by field against the old record — including a planted difference that must fail —
   before the rest:
   - An NPC is a **full statblock on the corpus's NPC type**, never an `EXTENDS` of another NPC (the
     VTT lists NPCs by direct type and inherits only through type declarations); what it was built
     on is a presentation note.
   - A one-line ability is a `RULES` line carrying the **current corpus's own line**; a
     multi-paragraph ability that is a corpus technique is a **reference** to it.
   - A reference is by hash where the corpus hashes the target.
   - A house rule is a `MODIFY` + `GUIDANCE` on the rule it changes; its text extracted from where
     the table recorded it, never retyped. A number the sheet should honour is a property the
     `MODIFY` introduces, read by the system (a campaign supplies only the `MODIFY`).
   - A character is an instance of the system's actor; keep the original sheet records byte for
     byte in `campaign/source/` and check every version against them.
   - A corpus defect goes to the corpus's TODO, never corrected in the layer.
4. **Characters onto the VTT sheet**, every version checked field by field. A player's old live
   state, where the old site kept it at the same origin, is imported once by a small script at the
   `gm`/`play` stages — and only into the member that player has claimed.
5. **Integrate:**
   - **Move the old pages, don't rewrite them.** A script takes each page's content region into
     `campaign/docs/<name>.html` — nav, breadcrumb, footer and scripts dropped, links rewritten to
     tab routes, assets to `campaign/assets/` — and proves it: text identical to the old region,
     every link resolving. Make the proof fail once before trusting it, and run it **before**
     deleting the old pages.
   - **Scope the old stylesheets** to the element each document is drawn into, by a script: the
     VTT's stylesheet shares custom-property names, and an unscoped `body` or `:root` rule restyles
     the whole VTT. A small hand-written file fits the paper to the frame (the old `body`'s
     `min-height: 100vh` is the first thing to undo).
   - **Tabs** are pushed onto the site's tab list at the `site` stage, campaign first. A tab's path is
     an anchor in its document; a page's own script becomes a function the tab calls after drawing
     it, and any listener it puts on `window`/`document` removes itself once its element is gone —
     the site re-renders a tab, the page does not reload.
   - **A page drawn from records** (the cast) is rebuilt on the DSL layer, keeping the old page's
     storage keys so what a player had stored still applies.
   - **The GM's document** is `VttConfig.notes` (a `.html` fragment, its class, its spoiler gate).
   - Re-point every script that read an old page; re-run every check after deleting.
6. **Deploy** — confirmed with the owner, step by step:
   - The Worker, named for the instance, `ALLOWED_ORIGIN` the custom domain **and** the github.io
     address behind it. Prove it with `curl`: a room from each allowed origin (200), a foreign
     origin refused (403). `engine/config.js` names it.
   - Fast-forward `main` to the working branch and push; Pages builds it. Turn on *Enforce HTTPS*
     once the certificate is approved; `http://` then redirects.
   - **The Worker imports the system's ops. Redeploy it after any change to `engine/ops.js` or the
     system's `ops.js`**, or the live room refuses (or silently drops) the new op.
   - **The live session proof needs two browsers.** Pages redirects the github.io address to the
     custom domain, so a browser can reach only one live origin, and two tabs of one browser share
     the session's storage and overwrite each other. The real proof is the owner's first session
     with a player on their own device.

## The hook (in `sortilege-vtt-l5r5e`)

The instance declares everything it adds in `engine/config.js`, which it owns:

```js
instance: {
  styles: ['campaign/site/campaign.css'],
  stages: {
    data:  ['campaign/data/index.js'],   // every page, after the books' index and records
    site:  ['campaign/site/site.js'],    // push tabs onto window.VttSiteTabs
    gm:    ['campaign/site/gm.js'],      // window.VttPanels.register(id, {label, render, count})
    table: [], play: [],                 // the map table's and the player's page, before they boot
  },
},
defaultCampaign: { name: '…', seed: 'campaign/pack/seed.json' },
notes: { src: 'campaign/docs/state.html', title: '…', class: '…', gate: { title, text, enter } },
defaultSlots: ['notes', 'scenes', 'threads'],   // the panes the GM's table opens on
```

`engine/instance.js` writes those scripts into each upstream page where its stage tag stands, so
they run in order as if the page listed them. The homebrew is built after the books with

```bash
bash build/build_layer.sh campaign/dsl campaign "<the campaign's title>" campaign/data
```

— one more book, shelved first as *This campaign*, its records ahead of the corpus's, gated three
ways: its strings both ways by count, no id the corpus uses, every id it points at resolving. Page
titles come from `VttConfig.title`.

## An instance's own decisions

Record them in the instance's plan before starting, each with the owner's answer: visibility (and
so publication of `data/`), the fork, whether the VTT owns `/`, one character sheet, house rules as
`MODIFY`s and which are enforced vs shown, how the GM's table opens, where the process is written.
