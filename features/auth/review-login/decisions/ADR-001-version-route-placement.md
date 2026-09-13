---
id: ADR-001
date: 2026-09-13
status: accepted
affects: features/auth/review-login (R2), app/main.py, dependency-map.md
---

## Context

R2 requires `GET /version` at exactly that path, and R6 requires it to appear in the generated section of `dependency-map.md` after `python scripts/gen_dependency_map.py` runs.

Two constraints in `scripts/gen_dependency_map.py` decide this:

- Line 46 matches `@router.<verb>("<path>")` only. An `@app.get(...)` decorator is invisible to it. **Verified consequence: `GET /` — which lives in `app/main.py:108` — has never appeared in the generated table.**
- Line 43 takes the file's **first** `APIRouter(prefix="…")` match as the prefix for every route in that file. A second router object inside `auth_router.py` would still be recorded under `/auth`.

## Options Considered

**A) `@app.get("/version")` in `main.py`, beside `GET /`** — Pro: no new file; the obvious home. Con: invisible to the dependency-map generator, so R6 fails unless the script's route regex is also widened — a change that would additionally start emitting a `GET /` row and is far riskier than the route itself.

**B) `@router.get("/version")` in `auth_router.py`** — Pro: no new file. Con: the router has `prefix="/auth"`, so the served path becomes `/auth/version`, which violates R2. A second `APIRouter` in the same file does not help: the generator would still record it under `/auth`.

**C) New `app/routers/meta_router.py` with `APIRouter(tags=["meta"])` and no `prefix` argument** — Pro: served at `/version`; the generator finds no `APIRouter(prefix=` in the file, falls back to `prefix=""`, and emits the row `| GET | /version ⚠️ | NONE | app/routers/meta_router.py:N |`, satisfying R2 and R6 with no change to the script. Con: one new ~20-line file and one extra `include_router` line in `main.py`.

## Decision

**Option C.** It is the only option that satisfies R2 and R6 simultaneously without editing `scripts/gen_dependency_map.py`, and a 20-line file is a smaller change than widening the route-discovery regex of the tool the whole process depends on.

## Consequences

- `/version` must stay in a router module. If anyone later moves it to `main.py` it will silently vanish from `dependency-map.md` — the same way `GET /` already has. This is recorded in the curated section of `dependency-map.md` so it survives the move.
- `app/routers/meta_router.py` must be declared **without a `prefix` argument**. Adding `prefix="/meta"` later would change the served path and break the deploy-verification curl in `context/deployment/README.md`.
- `main.py` gains exactly two lines (an import and an `include_router`). `GET /` is left where it is and is still absent from the map — out of scope here.
- If a future sprint wants `GET /` and other `@app.*` routes in the map, that is a change to `scripts/gen_dependency_map.py`, not to this route.
