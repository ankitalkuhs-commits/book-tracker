# TrackMyRead — Project Context for Claude

Social book-tracking platform: FastAPI backend (`app/`), React web (`book-tracker-frontend-stitch/`), Expo Android app (`book-tracker-mobile-stitch/`). One git repo, everything on `master`. This project has its own memory dir (`~/.claude/projects/c--Users-sonal-Documents-projects-book-tracker/memory/`) — never write its notes into another project's memory.

## Session start

**Always read `context/LOAD_ME_FIRST.md` first.** Then the `features/{feature}/index.md` for whatever you are touching, and `dependency-map.md` before changing any endpoint.

## Ownership + privacy — the most critical rule

There is no multi-tenancy; the equivalent invariant is: **a user can only mutate their own rows, and can only read another user's data if that user is not private or they follow them.** Concretely:
- every mutation checks `row.user_id == current_user.id` (curator role for groups) → 404
- every cross-user read checks `is_private_profile` + Follow, or group `is_private` + active membership → 403 / locked view
- `note.is_public=False` never appears in any feed, list, or group activity
- every endpoint requires `get_current_user` / `get_admin_user` unless a spec explicitly says otherwise

## API response rules
- Userbook-returning endpoints share one flat shape with nested `book.google_books_id` (see `dependency-map.md` → Contracts). Never return a raw SQLModel.
- Rating → `PATCH /userbooks/{id}`; page progress → `PUT /userbooks/{id}/progress`. Mixing them corrupted book status in May 2026.
- Timestamps ISO with `Z`. List endpoints have a `limit`. Batch lookups with `IN()`.

## The Agent System

7-agent process ported from School ERP on 2026-09-12. Design: `AGENTS_DESIGN.md`. PM guide: `specs/PM_PLAYBOOK.md`. Prompts in `agents/`. **Pass `model` explicitly** when spawning.

| Agent | File | Model | When |
|---|---|---|---|
| PM Helper | `agents/pm-helper.md` | opus | Before any feature — validates the brief |
| Architect | `agents/architect.md` | opus | After spec approved; owns `dependency-map.md` |
| Senior QA | `agents/senior-qa.md` | opus | After architecture, BEFORE build |
| Builder | `agents/builder.md` | sonnet | After the test plan exists |
| Junior QA | `agents/junior-qa.md` | haiku | After build |
| Doc Sync | `agents/doc-sync.md` | haiku | End of every sprint |
| Platform Guardian | `agents/platform-guardian.md` | opus | Every 3–4 sprints / before a store release |

Small bug fix: Builder → Junior QA → Doc Sync. Endpoint or shape change: Architect → Builder → Junior QA.

## Node System (feature graph)

| Path | Purpose | Written by |
|---|---|---|
| `repos/{api,web,mobile}/index.md` | Repo overview — entry points, deploy, health | Doc Sync |
| `features/{feature}/index.md` | Feature overview, screens, cross-feature deps | PM Helper / Doc Sync |
| `features/{feature}/{screen}/spec.md` | Requirements, states, appetite | PM Helper |
| `…/architecture.md` | Risk summary + technical brief + build notes | Architect, Builder |
| `…/tests.md` | Test cases + run results | Senior QA writes, Junior QA runs |
| `…/code-map.md` | File locations | Builder |
| `…/learnings.md` | What broke and why | Junior QA, Doc Sync |
| `…/decisions/ADR-NNN.md` | One decision per file | Architect / Builder |
| `features/_templates/` | Templates for all of the above | — |
| `retros/` | Doc Sync reports, platform health, retros | Doc Sync, Guardian |

Screen sub-folders are created when a screen is first touched by the process — not pre-populated.

## Agent context load

| Agent | Must load | If crossing a boundary |
|---|---|---|
| PM Helper | CLAUDE.md, LOAD_ME_FIRST.md, feature index.md | sibling screen specs |
| Architect | spec.md, dependency-map.md, models.py, relevant routers, both api.js | depended_by screens' architecture.md |
| Senior QA | spec.md, architecture.md, dependency-map.md, tests/conftest.py | learnings.md of siblings |
| Builder | spec, architecture, tests, code-map, LOAD_ME_FIRST → CRITICAL PATTERNS | depended_by code-maps |
| Junior QA | tests.md, build notes | architecture.md if a failure is ambiguous |
| Doc Sync | every node touched this sprint + git log | — |
| Platform Guardian | all of `app/`, both api.js, workflows, last health report | — |

## Key documents

| Document | Purpose |
|---|---|
| `context/LOAD_ME_FIRST.md` | Session starter — stack, CRITICAL PATTERNS, recently shipped, known issues |
| `context/PROJECT_CONTEXT.md` | Architecture decisions, component hierarchy |
| `context/INDEX.md` | Navigation |
| `context/PLATFORM_MAP.md` | Feature map + user journeys |
| `context/supabase_migration.sql` | **Run in Supabase before pushing any `models.py` change** |
| `dependency-map.md` | Endpoint → consumers; curated contracts + generated appendix (`scripts/gen_dependency_map.py`) |
| `AGENTS_DESIGN.md`, `specs/PM_PLAYBOOK.md` | The process |

## Verification (run before claiming anything works)

| Command | Proves |
|---|---|
| `pytest tests -q` (from repo root, `.venv` active, `SECRET_KEY` set by conftest) | backend contract + privacy tests. 103/115 at install; 12 failures are stale `add-to-library` shape expectations in `tests/test_books.py` — first sprint fixes them |
| `python scripts/gen_dependency_map.py` | regenerates the endpoint→consumer table; ⚠️ marks routes with no auth; lists client calls with no route |
| `cd book-tracker-frontend-stitch && npm run build` | web compiles |
| EAS build (`.github/workflows/build-stitch-apk.yml`) | mobile — no Expo Go; needs `app.json` version + versionCode bump |

## Live context updates (non-negotiable)

Update as the work unfolds, not at the end: `context/LOAD_ME_FIRST.md` (Recently Shipped, Known Issues, CRITICAL PATTERNS / GOTCHAS), the touched `features/…` nodes, `dependency-map.md` when an endpoint or shape changes, and memory files for anything that must survive across sessions. Trigger: after any code edit, decision, discovered bug, failed approach, or before switching topic.

## Architecture reminders
- Push: only `fire_event()` from `app/notifications/dispatcher.py`; register the event in `config.py`; supply every `{placeholder}` (missing ones ship the raw template silently)
- DB: SQLite dev / PostgreSQL prod — `information_schema`, never `sqlite_master`
- Mobile: stale-while-revalidate from `PreloadContext`; no spinner over preloaded data; `react-native-svg` 15.15.4; no `adjustsFontSizeToFit`; `Alert.prompt` is iOS-only
- Web: `api.js` 60s cache — `cacheClear()` after mutations; `console.*` DEV-gated
- Render free tier sleeps 15 min → ~30s cold start; mobile timeout is 30s
