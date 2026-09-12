---
screen: sprint-1-hardening
feature: security
last_verified: 2026-09-12
---

## Web (book-tracker-frontend-stitch)
No web files touched this sprint — no page, component, or `api.js` change (spec Parity: web = no change).

## Mobile (book-tracker-mobile-stitch)
No mobile files touched this sprint — no screen, `api.js`, or `app.json` change (spec Parity: mobile = no change, no build).

## Backend (app/)
| What | File | Notes |
|---|---|---|
| Route handlers (R1) | `app/routers/books_router.py` → `list_books()`, `add_book()`, `get_book()`, `delete_book()` | `list_books`/`add_book`/`get_book` gained `_=Depends(get_current_user)`; `delete_book` gained `_=Depends(get_admin_user)`; `list_books` gained `limit: int = Query(50, ge=1, le=200)`. `add_book_to_library`, `get_recommendations`, `search_books` untouched. |
| Route handlers (R3) | `app/routers/push_router.py` → `register_push_token()`, `deregister_push_token()` | Both queries now filter `PushToken.token_type == "expo"`; register sets `token_type="expo"` explicitly on insert; deregister uses `.all()` + loop so it clears every historical `expo` duplicate. |
| Dependency import | `app/deps.py :: get_admin_user` | Already existed; newly imported into `books_router.py`. No change to `deps.py` itself. |
| Untouched (R2) | `app/routers/auth_router.py :: request_account_deletion` (`POST /auth/delete-account`) | Deliberately left unauthenticated — see architecture.md Security Review. |
| Migration | none | `PushToken.token_type` already existed in `app/models.py:145`; `context/supabase_migration.sql` not touched. |
| Tests | `tests/test_books.py` | 9 stale call-site fixes (`["userbook"]["id"]` → `["id"]`); new `TestCatalogAuth`, `TestCatalogList`, `TestCatalogCreate`, `TestRecommendations`; extended `TestAddToLibrary`, `TestListUserbooks`, `TestBookSearch`. |
| Tests | `tests/test_reading_activity.py` | 3 stale call-site fixes only, nothing else changed. |
| Tests | `tests/test_push_tokens.py` | New file — 7 test functions covering R3 (coexistence, dedupe, scoped deregister, invalid token, auth, web-only no-op, duplicate cleanup). |
| Tests | `tests/test_auth.py` | New `TestPublicDeleteAccountForm` class (2 tests) — regression guard that `/auth/delete-account` stays public. |

## Repo hygiene (R5)
| What | File | Notes |
|---|---|---|
| Git index | `.venv/`, `venv/` | `git rm -r --cached .venv venv` staged (12,313 files); **not committed** — Builder was instructed not to run `git commit` this sprint. Both directories remain on disk untouched. |
| Ignore rule | `.gitignore` | Added `.venv/` line next to the existing `venv/` line in the `# Virtual environment` block. |

## Dependency map (R6)
| What | File | Notes |
|---|---|---|
| Regenerated appendix | `dependency-map.md` (generated section) | `python scripts/gen_dependency_map.py` re-run. The four `/books` rows now show `user`/`user`/`user`/`admin`, no ⚠️. `/auth/delete-account` and `/api/googlebooks/*` correctly retain ⚠️ (out of scope). |
| Curated section | `dependency-map.md` → `### pushtoken table` | Sentence updated to state both push-token paths now filter `token_type == "expo"`; closing sentence about filtering `token_type` kept. |

## Notes
- `books_router.py` route declaration order (`add-to-library` → `recommendations` → `search` → `{book_id}`) was not changed — verified by `test_literal_paths_not_swallowed_by_book_id`.
- `conftest.py` uses one shared in-memory DB for the whole test session; new tests that create/delete catalog rows use throwaway rows (unique isbn per test) rather than reusing `book id 1` or similar, to avoid cascading failures into other test files.
- `tests/test_push_tokens.py` follows the `db.expire_all()` pattern from architecture.md before every post-request DB read-back, since the `db` fixture session and the request-handler session are different `Session` objects over the same shared-cache SQLite DB.
