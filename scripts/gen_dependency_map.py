"""
Regenerate the GENERATED section of dependency-map.md from the code.

    python scripts/gen_dependency_map.py

Sources of truth:
  app/**/*.py                                       -> every route + its auth level
  book-tracker-frontend-stitch/src/services/api.js  -> web fn -> endpoint, then who imports the fn
  book-tracker-mobile-stitch/src/services/api.js    -> mobile group.fn -> endpoint, then who calls it

Everything above the marker line in dependency-map.md is hand-curated and left alone.
"""
import collections
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
MARK = "<!-- GENERATED BELOW — do not edit by hand; run scripts/gen_dependency_map.py -->"


def norm(path: str) -> str:
    """Client template path -> backend route form: /x/${id} -> /x/{id}; strip query/trailing junk."""
    p = re.sub(r"\$\{[^}]*\}", "{id}", path)
    p = p.split("?")[0].split("$")[0].rstrip("/") or "/"
    return p


def route_key(path: str) -> str:
    return re.sub(r"\{[^}]*\}", "{id}", path).rstrip("/") or "/"


def read(p: pathlib.Path) -> str:
    return p.read_text(encoding="utf-8", errors="replace")


# ---- backend routes ----
routes = []  # (method, path, auth, file:line)
for p in sorted(ROOT.glob("app/**/*.py")):
    if "__pycache__" in str(p):
        continue
    src = read(p)
    lines = src.split("\n")
    m = re.search(r'APIRouter\(prefix="([^"]*)"', src)
    prefix = m.group(1) if m else ""
    for i, ln in enumerate(lines):
        m = re.match(r'\s*@router\.(get|post|put|patch|delete)\("([^"]*)"', ln)
        if not m:
            continue
        sig = "\n".join(lines[i:i + 30]).split("):")[0]
        if "get_admin_user" in sig:
            auth = "admin"
        elif "get_current_user_optional" in sig:
            auth = "optional"
        elif "get_current_user" in sig:
            auth = "user"
        else:
            auth = "NONE"
        routes.append((m.group(1).upper(), prefix + m.group(2), auth,
                       f"{p.relative_to(ROOT).as_posix()}:{i + 1}"))

# ---- web ----
web = ROOT / "book-tracker-frontend-stitch/src"
api = read(web / "services/api.js")
web_fns = {}  # name -> (method, path)
for m in re.finditer(r"export const (\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>\s*([\s\S]*?)(?=\nexport const |\n// |\Z)", api):
    name, body = m.group(1), m.group(3)
    body_no_cache = re.sub(r"cacheClear\([^)]*\)", "", body)
    paths = re.findall(r"[`'\"](/[^`'\"?]*)", body_no_cache)
    meth = re.search(r"method:\s*'(\w+)'", body)
    if not paths:
        continue
    web_fns[name] = ((meth.group(1) if meth else "GET"), norm(paths[0]))
web_files = list(web.rglob("*.jsx")) + [p for p in web.rglob("*.js") if p.name != "api.js"]
web_users = {}
for name in web_fns:
    pat = re.compile(r"\b" + name + r"\b")
    web_users[name] = sorted(p.relative_to(web).as_posix() for p in web_files if pat.search(read(p)))

# ---- mobile ----
mob = ROOT / "book-tracker-mobile-stitch/src"
api = read(mob / "services/api.js")
mob_fns = {}  # "group.fn" -> (method, path)
for gname, body in re.findall(r"export const (\w+API) = \{([\s\S]*?)\n\};", api):
    for m in re.finditer(r"\n\s+(\w+):\s*async\s*\([^)]*\)\s*=>\s*([\s\S]*?)(?=\n\s+\w+:\s*async|\Z)", body):
        fb = m.group(2)
        meth = re.search(r"api\.(get|post|put|patch|delete)\(", fb)
        path = re.search(r"[`'\"](/[^`'\"?]*)", fb)
        if not path:
            continue
        mob_fns[f"{gname}.{m.group(1)}"] = ((meth.group(1).upper() if meth else "GET"), norm(path.group(1)))
mob_files = [p for p in mob.rglob("*.js") if p.name != "api.js"] + [ROOT / "book-tracker-mobile-stitch/App.js"]
mob_users = {}
for key in mob_fns:
    g, n = key.split(".")
    pat = re.compile(r"\b" + g + r"\." + n + r"\b")
    mob_users[key] = sorted(("App.js" if p.name == "App.js" else p.relative_to(mob).as_posix())
                            for p in mob_files if pat.search(read(p)))

# ---- join ----
by_route = collections.defaultdict(lambda: {"web": [], "mobile": []})
for name, (meth, path) in web_fns.items():
    by_route[(meth, route_key(path))]["web"].append((name, web_users[name]))
for key, (meth, path) in mob_fns.items():
    by_route[(meth, route_key(path))]["mobile"].append((key, mob_users[key]))

out = [MARK, "",
       f"_Regenerated from code. {len(routes)} backend routes, {len(web_fns)} web api.js functions, "
       f"{len(mob_fns)} mobile api.js methods. ⚠️ = no auth dependency._", "",
       "## Every endpoint → consumers", "",
       "| Method | Path | Auth | Defined | Web fn → pages | Mobile fn → screens |",
       "|---|---|---|---|---|---|"]
seen = set()
for meth, path, auth, loc in routes:
    k = (meth, route_key(path))
    seen.add(k)
    c = by_route.get(k, {"web": [], "mobile": []})
    w = "<br>".join(f"`{n}` → {', '.join(u) or '(unused)'}" for n, u in c["web"]) or "—"
    m_ = "<br>".join(f"`{n}` → {', '.join(u) or '(unused)'}" for n, u in c["mobile"]) or "—"
    flag = " ⚠️" if auth == "NONE" else ""
    out.append(f"| {meth} | `{path}`{flag} | {auth} | {loc} | {w} | {m_} |")

orphans = [(k, v) for k, v in by_route.items() if k not in seen]
if orphans:
    out += ["", "## Client calls with NO backend route (dead or broken)", ""]
    for (meth, path), c in sorted(orphans):
        fns = ", ".join(f"`{n}`" for n, _ in c["web"] + c["mobile"])
        out.append(f"- {meth} `{path}` — {fns}")

unused = [n for n, u in web_users.items() if not u] + [n for n, u in mob_users.items() if not u]
if unused:
    out += ["", "## api.js functions nobody calls", "", ", ".join(f"`{n}`" for n in unused)]

fan = []
for (meth, path), c in by_route.items():
    n = sum(len(u) for _, u in c["web"]) + sum(len(u) for _, u in c["mobile"])
    if n >= 4:
        fan.append((n, meth, path))
out += ["", "## Fan-out (4+ consuming files) — a response-shape change here is breaking", ""]
for n, meth, path in sorted(fan, reverse=True):
    out.append(f"- **{n}** files — {meth} `{path}`")

# ---- UI actions (qa/inventory/*.json, written by the inventory agents) ----
import json

inv_dir = ROOT / "qa" / "inventory"
inv = []
if inv_dir.exists():
    for f in sorted(inv_dir.glob("*.json")):
        try:
            inv += json.loads(read(f))
        except json.JSONDecodeError as e:
            print(f"skipping {f.name}: {e}")
if inv:
    route_keys = {(m, route_key(p)) for m, p, _, _ in routes}
    out += ["", "## UI actions → API (from qa/inventory)", "",
            f"_{len(inv)} actionable elements across web + Android. `side_effect`: none · self · others · destructive · external._", ""]
    for platform in sorted({e.get("platform", "?") for e in inv}):
        rows = [e for e in inv if e.get("platform") == platform]
        out += [f"### {platform} — {len(rows)} elements", "",
                "| screen / route | element | side effect | API calls | contract |", "|---|---|---|---|---|"]
        for e in sorted(rows, key=lambda x: (x.get("route") or x.get("screen") or "", x.get("id", ""))):
            calls = []
            for c in e.get("api") or []:
                m, p = (c.get("method") or "?").upper(), c.get("path") or "?"
                known = (m, route_key(norm(p))) in route_keys
                calls.append(f"`{m} {p}`" + ("" if known else " ⚠️no route"))
            where = e.get("route") or e.get("screen") or "?"
            contract = e.get("contract_check") or ("MISSING cacheClear" if e.get("cache_invalidation") == "MISSING" else "")
            out.append(f"| `{where}` | {str(e.get('element', '')).replace('|', '/')} | {e.get('side_effect', '')} | "
                       f"{'<br>'.join(calls) or '—'} | {str(contract).replace('|', '/')} |")
        out.append("")
    by_effect = collections.Counter((e.get("platform"), e.get("side_effect")) for e in inv)
    out += ["**Counts:** " + " · ".join(f"{p} {s}: {n}" for (p, s), n in sorted(by_effect.items(), key=str)), ""]

dm = ROOT / "dependency-map.md"
existing = read(dm) if dm.exists() else ""
head = existing.split(MARK)[0].rstrip() + "\n\n" if MARK in existing else existing.rstrip() + "\n\n"
dm.write_text(head + "\n".join(out) + "\n", encoding="utf-8")
print(f"wrote {dm.name}: {len(routes)} routes, {len(orphans)} orphan client calls, "
      f"{len(unused)} unused fns, {len(fan)} high fan-out endpoints")
