# TrackMyRead — Agent System Design

> Ported from the School ERP (EduCore) 7-agent process on 2026-09-12 and adapted. Full prompts live in `agents/`. The PM-facing guide is `specs/PM_PLAYBOOK.md`.

## The 7-Agent Roster

| # | Agent | Model | Cadence | Job in one line |
|---|---|---|---|---|
| 1 | PM Helper | opus | Every feature | Interrogates the brief until it is airtight |
| 2 | Architect | opus | Every feature | Build plan + risk summary before any code; owns `dependency-map.md` |
| 3 | Platform Guardian | opus | Every 3–4 sprints | Auth / privacy / push / cost / hygiene audit |
| 4 | Senior QA | opus | Every feature, BEFORE build | Test cases from spec — never reads builder code |
| 5 | Builder | sonnet | Every feature, AFTER Senior QA | Writes code to spec only, flags blockers |
| 6 | Junior QA | haiku | After build | Runs the cases, reports PASS/FAIL, no interpretation |
| 7 | Doc Sync | haiku | End of every sprint | Makes the docs match reality |

Always pass `model` explicitly when invoking the Agent tool.

## The Flow
```
PM describes problem  →  PM Helper (spec.md)            [GATE 1: PM approves spec]
                      →  Architect (architecture.md,
                         risk summary, dependency-map)  [GATE 2: PM approves risk summary — product decisions only]
                      →  Senior QA (tests.md)
                      →  Builder (code, code-map.md, build notes)
                      →  Junior QA (tests.md run)       [GATE 3: PM decides what ships]
                      →  Doc Sync (nodes, LOAD_ME_FIRST, map, memory, retro)
```

## Where Output Lives (node system)
Everything for a screen lives in one folder: `features/{feature}/{screen}/`
`spec.md` (PM Helper) · `architecture.md` incl. Technical Brief + Risk Summary + Build Notes (Architect, Builder) · `tests.md` (Senior QA writes, Junior QA runs) · `code-map.md` (Builder) · `learnings.md` (Junior QA, Doc Sync) · `decisions/ADR-NNN.md`.
Templates: `features/_templates/`. Repo overviews: `repos/{api,web,mobile}/index.md`. Sprint-level output: `retros/`.

## What Changed From the ERP Version
| ERP | TrackMyRead |
|---|---|
| 5 repos, 4 apps | 1 git repo: `app/` (api), `book-tracker-frontend-stitch/` (web), `book-tracker-mobile-stitch/` (mobile) |
| "Multi-tenancy — school_id on every query" | **Ownership + privacy**: `user_id == me` on every mutation; `is_private_profile` follower gate; group `is_private` membership gate; `note.is_public` |
| Roles admin/teacher/parent/superadmin | user / admin (`is_admin`) |
| Numbered migration runner with rollback | Hand-run `context/supabase_migration.sql` in Supabase SQL Editor **before** pushing `models.py`; rollback recorded as a comment |
| Supabase RLS, DPDP, Razorpay, MSG91 | Dropped |
| `EVENT_CONFIG` template trap | Identical trap: `app/notifications/config.py` + `_render_template` returns the raw template on a missing key |
| `specs/ plans/ qa/` (deprecated there) | Not created here — nodes only |
| Industry-standards research rotation | Dropped. Guardian keeps an 11-item checklist instead |

## Sprint
1–3 features, not time-based. Every sprint closes at least one Known Issue from `context/LOAD_ME_FIRST.md`. Done when Junior QA verdict is PASS (or PM documented acceptance), Doc Sync ran, and PM checked the done list.

## Retro (short form)
After each sprint, 3 questions in `retros/retro-YYYY-MM-DD.md`: what shipped; which QA failures were spec gaps vs build gaps; which agent's output needed correction → add one checklist line to that agent's file.

## When to Use What
| Situation | Path |
|---|---|
| New feature / screen | Full pipeline |
| Small bug fix | Builder → Junior QA → Doc Sync |
| Response-shape or endpoint change | Architect (map + brief) → Builder → Junior QA |
| "Something keeps going wrong" | Retro |
| Every 3–4 sprints, or before a Play Store release | Platform Guardian |
