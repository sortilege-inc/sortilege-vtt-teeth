#!/usr/bin/env python3
"""
build_data.py — the TEETH corpus (titterpig-dsl-teeth/0.5) → data/<book>.js, one file per
book, plus data/index.js. Everything the VTT shows comes from here; nothing is hand-typed.

The shape is GENERIC and hash-keyed — the engine reads it without knowing the game, and
system/teeth/ interprets entities by their `type` (the caret name they EXTEND):

    window.TEETH.books[<id>]      { id, title, kind, files:[{file, name}], entities:[ids in
                                    printed order], arcs:[…], lore:[…] }
    window.TEETH.entities[<hash>] { id, name, key, form: "DEF"|"TEMPLATE"|"ACTOR", book, file,
                                    type, typeHash, parent, children:[ids], desc,
                                    props:[…], choices:[…], entries:[…], thresholds:[…],
                                    outcomes:[[band, text]…], table:{columns, rows},
                                    hooks:[…], refs:[…], guidance:[…] }

Every string is carried byte-for-byte from the DSL (only DSL escapes resolved); this file
only decides the shape. verify_data.py proves the round trip both ways afterwards.

    python3 build/build_data.py [<path to titterpig-dsl-teeth/0.5>]
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from parse_dsl import parse_files  # noqa: E402

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_CORPUS = os.path.expanduser("~/Sortilege/Titterpig/DSL/titterpig-dsl-teeth/0.5")


# ───────────────────────── AST accessors ─────────────────────────

def kws(body, name):
    return [x for x in (body or []) if x.get("n") == "kw" and x["kw"] == name]


def kw1(body, name):
    got = kws(body, name)
    return got[0] if got else None


def kwstr(body, name):
    n = kw1(body, name)
    if not n:
        return None
    for a in n["args"]:
        if a["k"] == "str":
            return a["v"]
    return None


def kwstrs(body, name):
    out = []
    for n in kws(body, name):
        for a in n["args"]:
            if a["k"] == "str":
                out.append(a["v"])
                break
    return out


def kwlist(body, name):
    n = kw1(body, name)
    if not n:
        return []
    for a in n["args"]:
        if a["k"] == "list":
            return a["v"]
    return []


def arg(node, kind):
    return next((a["v"] for a in node.get("args", []) if a["k"] == kind), None)


def ref_of(node):
    """{hash, name} from an EXTENDS / SCENE_REF-style statement's args."""
    return {"hash": arg(node, "hash"), "name": arg(node, "caret")}


def elem_ref(e):
    if e["k"] == "ref":
        return {"hash": e.get("hash"), "name": e["v"]}
    if e["k"] == "hash":
        return {"hash": e["v"], "name": None}
    if e["k"] == "caret":
        return {"hash": None, "name": e["v"]}
    return None


# ───────────────────────── property values ─────────────────────────

def prop_nodes(body):
    out = [x for x in (body or []) if x.get("n") == "prop" and x.get("type") != "CHOICE"]
    for pb in kws(body, "PROPERTIES"):
        out.extend(x for x in (pb.get("body") or []) if x.get("n") == "prop")
    return out


def elem_value(e):
    if e["k"] == "def":
        return {"vk": "def", "fields": [prop_value(p) for p in (e.get("body") or []) if p.get("n") == "prop"]}
    if e["k"] in ("ref", "hash", "caret"):
        return dict(vk="ref", **elem_ref(e))
    return {"vk": "scalar", "value": e["v"]}


def prop_value(p):
    v = {"name": p["name"]}
    t = p.get("type")
    if t == "DEF":
        v["vk"] = "def"
        ext = kw1(p.get("body"), "EXTENDS")
        if ext:
            v["type"] = arg(ext, "caret")
            v["typeHash"] = arg(ext, "hash")
        v["fields"] = [prop_value(x) for x in prop_nodes(p.get("body"))]
        return v
    if t == "LIST":
        v["vk"] = "list"
        if p.get("of"):
            v["of"] = p["of"]
        if p.get("of_hash"):
            v["ofHash"] = p["of_hash"]
        v["items"] = [elem_value(e) for e in p.get("items", [])]
        return v
    if t == "ENUM":
        v["vk"] = "enum"
        v["options"] = p.get("options", [])
        return v
    if t == "REF":
        v["vk"] = "ref"
        v["name_"] = None
        v["ref"] = {"hash": p.get("hash"), "name": p.get("ref")}
        del v["name_"]
        return v
    v["vk"] = "scalar"
    if t and t != "VALUE":
        v["type"] = t
    if "value" in p:
        v["value"] = p["value"]
    for m in ("min", "max", "required", "fixed"):
        if m in p:
            v[m] = p[m]
    return v


def flat(pv):
    k = pv.get("vk")
    if k == "scalar":
        return pv.get("value")
    if k == "ref":
        return (pv.get("ref") or {}).get("name")
    return None


# ───────────────────────── entity blocks ─────────────────────────

def refs_of(body):
    out = []
    for rb in kws(body, "REFERENCES"):
        for item in (rb.get("body") or []):
            if item.get("n") != "str":
                continue
            for a in item.get("args", []):
                if a["k"] == "ref":
                    out.append({"label": item["v"], "hash": a["hash"], "name": a["v"]})
    return out


def guidance_of(body):
    out = []
    for gb in kws(body, "GUIDANCE"):
        for e in kws(gb.get("body"), "ENTRY"):
            out.append({
                "name": arg(e, "caret"), "id": arg(e, "hash"),
                "concerns": [elem_ref(x) for x in kwlist(e.get("body"), "CONCERNS") if x["k"] in ("ref", "hash", "caret")],
                "topics": [x["v"] for x in kwlist(e.get("body"), "TOPICS") if x["k"] == "str"],
                "text": kwstr(e.get("body"), "TEXT"),
            })
    return out


def choices_of(body):
    """CHOICES rows; a bare string in the block (the sheet's printed rubric, e.g. "Items ◆ Pick
    as needed ◆ …") rides along as a note."""
    out = []
    for cb in kws(body, "CHOICES"):
        for p in (cb.get("body") or []):
            if p.get("n") == "prop" and p.get("type") == "CHOICE":
                out.append({"name": p["name"], "pick": p.get("pick"), "items": [elem_ref(e) for e in p.get("items", []) if elem_ref(e)]})
            elif p.get("n") == "str":
                out.append({"rubric": p["v"]})
    return out


def defs_block(body, keyword):
    """ENTRIES / THRESHOLDS rows, in printed order: an unhashed `^"label" DEF { … }` row is
    carried as a def value; a hashed `#hash ^"Name" DEF { … }` row is an entity of its own
    (collected by collect_entities) and is carried here by id."""
    out = []
    for b in kws(body, keyword):
        for p in (b.get("body") or []):
            if p.get("n") == "prop" and p.get("type") == "DEF":
                out.append(prop_value(p))
            elif p.get("n") == "entity":
                out.append({"vk": "entity", "id": p["hash"], "name": p["name"]})
    return out


def outcomes_of(body):
    out = []
    for ob in kws(body, "OUTCOMES"):
        items = [x["v"] for x in (ob.get("body") or []) if x.get("n") == "str"]
        for i in range(0, len(items) - 1, 2):
            out.append([items[i], items[i + 1]])
    return out


def table_of(body):
    tb = kw1(body, "TABLE")
    if not tb:
        return None
    columns = [x["v"] for x in kwlist(tb.get("body"), "COLUMNS") if x["k"] == "str"]
    rows = []
    for r in kws(tb.get("body"), "ROW"):
        rows.append([x["v"] if x["k"] == "str" else x["v"] for x in arg(r, "list") or []])
    return {"columns": columns, "rows": rows}


def hooks_of(body):
    out = []
    for hb in kws(body, "HOOKS_LIST"):
        for e in kws(hb.get("body"), "ENTRY"):
            ext = kw1(e.get("body"), "EXTENDS")
            out.append({"type": arg(ext, "caret") if ext else None, "fields": [prop_value(p) for p in prop_nodes(e.get("body"))]})
    return out


def entity_record(e, doc, book, parent_id=None):
    body = e["body"]
    props = [prop_value(p) for p in prop_nodes(body)]
    pm = {p["name"]: p for p in props}
    ext = kw1(body, "EXTENDS")
    display = flat(pm["Name"]) if "Name" in pm else None
    rec = {
        "id": e["hash"],
        "name": display or e["name"],
        "key": e["name"],
        "form": e.get("kind") or "DEF",
        "book": book,
        "file": doc["file"],
        "type": arg(ext, "caret") if ext else None,
        "typeHash": arg(ext, "hash") if ext else None,
        "parent": parent_id,
        "children": [],
        "desc": kwstr(body, "DESCRIPTION"),
        "props": props,
        "choices": choices_of(body),
        "entries": defs_block(body, "ENTRIES"),
        "thresholds": defs_block(body, "THRESHOLDS"),
        "outcomes": outcomes_of(body),
        "table": table_of(body),
        "hooks": hooks_of(body),
        "refs": refs_of(body),
        "guidance": guidance_of(body),
    }
    return rec


def collect_entities(doc, book, out, body=None, parent=None):
    """Every hashed entity anywhere in the tree — directly nested or inside an ENTRIES /
    other keyword block — keyed by hash, with `parent` the nearest enclosing entity."""
    ids = []
    for e in (body if body is not None else doc["body"]):
        if e.get("n") == "entity":
            rec = entity_record(e, doc, book, parent["id"] if parent else None)
            if rec["id"] in out:
                raise SystemExit("duplicate entity hash %s (%s and %s)" % (rec["id"], out[rec["id"]]["file"], doc["file"]))
            out[rec["id"]] = rec
            ids.append(rec["id"])
            if parent:
                parent["children"].append(rec["id"])
            collect_entities(doc, book, out, e["body"], rec)
        elif e.get("n") == "kw" and e.get("body"):
            ids.extend(collect_entities(doc, book, out, e["body"], parent))
    return ids


# ───────────────────────── arcs and lore ─────────────────────────

def build_scene(s):
    body = s.get("body") or []
    clues = []
    for cb in kws(body, "CLUES"):
        for c in kws(cb.get("body"), "CLUE"):
            clues.append({"name": arg(c, "caret"), "desc": kwstr(c.get("body"), "DESCRIPTION")})
    resolutions = []
    for rb in kws(body, "RESOLUTIONS"):
        for r in kws(rb.get("body"), "RESOLUTION"):
            resolutions.append({"name": arg(r, "caret"), "condition": kwstr(r.get("body"), "CONDITION"), "outcome": kwstr(r.get("body"), "OUTCOME")})
    ra = kw1(body, "READ_ALOUD")
    return {
        "id": arg(s, "hash"), "name": arg(s, "caret"),
        "type": kwstr(body, "TYPE"),
        "desc": kwstr(body, "DESCRIPTION"),
        "readAloud": kwstrs(ra.get("body") if ra else None, "TEXT"),
        "clues": clues, "resolutions": resolutions,
        "guidance": guidance_of(body),
        "refs": refs_of(body),
    }


def build_arc(doc):
    body = doc["body"]
    phases = []
    for fl in kws(body, "FLOW"):
        for p in kws(fl.get("body"), "PHASE"):
            phases.append({"name": arg(p, "caret"), "scenes": [arg(n, "hash") for n in kws(p.get("body"), "SCENE_REF")]})
    cast = []
    for cb in kws(body, "CAST"):
        for f in kws(cb.get("body"), "FROM"):
            cast.append({"from": arg(f, "str"), "hashes": [e["v"] for e in (arg(f, "list") or []) if e["k"] == "hash"]})
    return {
        "id": doc["name"], "file": doc["file"],
        "name": kwstr(body, "NAME"),
        "dependsOn": kwstrs(body, "DEPENDS_ON"),
        "usesExtensions": kwstrs(body, "USES_EXTENSION"),
        "desc": kwstr(body, "DESCRIPTION"),
        "phases": phases, "cast": cast,
        "scenes": [build_scene(s) for s in kws(body, "SCENE")],
    }


def build_lore(path):
    """A .lore is Markdown: headings name sections, blank lines separate paragraphs; the
    `<!-- source: … -->` comments are the generator's, not the book's."""
    text = open(path, encoding="utf-8").read()
    sections, cur, buf = [], None, []

    def flush():
        if cur is not None and buf:
            para = "\n".join(buf).strip()
            if para:
                cur["paragraphs"].append(para)
        buf.clear()

    for line in text.split("\n"):
        if line.strip().startswith("<!--"):
            continue
        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if m:
            flush()
            cur = {"level": len(m.group(1)), "title": m.group(2).strip(), "paragraphs": []}
            sections.append(cur)
            continue
        if not line.strip():
            flush()
            continue
        if cur is None:
            cur = {"level": 0, "title": None, "paragraphs": []}
            sections.append(cur)
        buf.append(line.rstrip())
    flush()
    return {"file": os.path.basename(path), "sections": sections}


# ───────────────────────── assembly ─────────────────────────

BOOK_KIND = {"core": "core", "oneshot-shared": "shared"}


def build(corpus):
    sources = json.load(open(os.path.join(corpus, "sources.json"), encoding="utf-8"))
    books, entities = {}, {}
    for src in sources["sources"]:
        bid = src["id"]
        dsl_paths = [os.path.join(corpus, f) for k in ("ttrpg_files", "arc_files", "actor_files") for f in src.get(k, [])]
        docs = parse_files(dsl_paths)
        book = {"id": bid, "title": src["title"], "kind": BOOK_KIND.get(bid, src.get("kind") or ("one-shot" if "oneshots/" in (src.get("ttrpg_files") or [""])[0] else "supplement")),
                "note": src.get("note"), "files": [], "entities": [], "arcs": [], "lore": []}
        for doc in docs:
            book["files"].append({"file": doc["file"], "container": doc["container"], "name": kwstr(doc["body"], "NAME"), "extends": doc["extends"]})
            if doc["ext"] == "arc":
                book["arcs"].append(build_arc(doc))
            book["entities"].extend(collect_entities(doc, bid, entities))
        for f in src.get("lore_files", []):
            book["lore"].append(build_lore(os.path.join(corpus, f)))
        books[bid] = book
    return books, entities


def main():
    corpus = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CORPUS
    books, entities = build(corpus)
    out_dir = os.path.join(HERE, "data")
    os.makedirs(out_dir, exist_ok=True)
    head = ("/* Generated by build/build_data.py from %s — do not edit by hand.\n"
            "   Every string is verbatim from the DSL corpus; regenerate rather than patch. */\n" % corpus)
    total = 0
    for bid, book in books.items():
        ents = {i: entities[i] for i in book["entities"]}
        # nested entities are reachable through children; index them too
        stack = list(book["entities"])
        while stack:
            i = stack.pop()
            for c in entities[i]["children"]:
                if c not in ents:
                    ents[c] = entities[c]
                    stack.append(c)
        payload = json.dumps({"book": book, "entities": ents}, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        with open(os.path.join(out_dir, bid + ".js"), "w", encoding="utf-8") as fh:
            fh.write(head)
            fh.write("(function(){var d=%s;var T=window.TEETH=window.TEETH||{books:{},entities:{}};"
                     "T.books[d.book.id]=d.book;for(var k in d.entities)T.entities[k]=d.entities[k];})();\n" % payload)
        total += len(ents)
        print("  data/%s.js  %d entities · %d arcs · %d lore files" % (bid, len(ents), len(book["arcs"]), len(book["lore"])))
    index = {"system": "teeth", "corpus": corpus, "books": [{"id": b["id"], "title": b["title"], "kind": b["kind"], "file": "data/%s.js" % b["id"]} for b in books.values()],
             "counts": {"entities": total, "books": len(books)}}
    with open(os.path.join(out_dir, "index.js"), "w", encoding="utf-8") as fh:
        fh.write(head)
        fh.write("(function(){var T=window.TEETH=window.TEETH||{books:{},entities:{}};T.index=%s;})();\n" % json.dumps(index, ensure_ascii=False, sort_keys=True))
    print("build_data: %d books, %d entities" % (len(books), total))


if __name__ == "__main__":
    main()
