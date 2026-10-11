---
screen: sprint-4i-report-block
feature: safety
package: 4I P4 — the web client (report, block, the admin Reports tab)
builder: Builder (4i-web worktree, branch `builder-4i-web`)
built: 2026-10-11
qa/unit: 38 before -> 48 after (10 new)
pytest: 952 collected before and after (no Python touched)
vite build: PASS
---

# Sprint 4I P4 build notes — report and block on the web

What shipped: Report on all six surfaces spec R-05 names, Block on the public profile, the
user-search row and the per-post menu, a blocked-readers list with Unblock in Settings, **the admin
Reports tab**, six API client functions, 33 new strings in all six locales, and
`qa/unit/reportAffordance.test.mjs` (10 cases: C-01, C-03, C-04, C-05, C-06, C-10, C-12, C-13,
C-14, C-16).

**The largest edit, and the thing that had to not go wrong:** `HomePage.jsx:184` gated the whole
per-post menu on `(isOwn || isAdmin)`, so a non-owner saw no menu and Report had nowhere to live.
That gate is gone. Inside it, **Delete carried no condition of its own** — it relied entirely on the
outer gate — so opening the gate without first wrapping Delete would have handed every reader a
Delete button on every post. It now carries `(isOwn || isAdmin)`, Edit keeps `isOwn`, and C-04
asserts both halves with its own synthetic negatives. Details in §3 and §4.

---

## 1. What was built, file by file

| File | Change |
|---|---|
| `src/services/api.js` | `+ reportContent`, `+ blockUser`, `+ unblockUser`, `+ getBlocks` under a new `// Safety — report & block` header before `// Account`; `+ getAdminReports`, `+ resolveReport` at the end of the `// Admin` group. `+ invalidateBlocks()` — a block severs follows and hides both readers on fourteen paths, so the 60 s GET cache for `/blocks`, `/follow`, `/users`, `/profile`, `/notes`, `/userbooks/friends`, `/books/recommendations` and `/groups` all have to go or the blocked reader stays on screen until the TTL expires. |
| `src/components/ReportButton.jsx` (new, 185 lines) | The one Report affordance and the one report dialog: reason picker, optional detail, **"Also block this person" checked by default**, and the E-8 sentence beside it. Exports `REPORT_REASONS`, the API's closed set. `variant="menu-item" \| "icon"`. The dialog is a `createPortal` into `document.body`, so it is not clipped by the dropdown's `overflow-hidden`. |
| `src/components/BlockButton.jsx` (new, 62 lines) | The one Block affordance, and therefore the one place the confirm copy exists. |
| `src/pages/HomePage.jsx` | the per-post menu gate **opened** (`:184`), Delete given its own `(isOwn \|\| isAdmin)`; Report + Block as the two items a non-owner gets; Report on the comment row; Report + Block on the sidebar user-search row, whose outer `<button>` became a `<div>` so the two controls are not nested inside a button. |
| `src/pages/UserProfilePage.jsx` | Report in `PublicNoteCard`'s action cluster (`+ authorName` prop); a `···` menu beside the follow button holding **Unfollow first**, then Report, then Block (pm-decisions E-1). `+ showUserMenu` state. |
| `src/pages/GroupDetailPage.jsx` | the circle-post delete gate no longer wraps the whole cluster: the cluster is a `<div>`, Report sits outside the gate for a non-owner, Delete keeps `(isOwn \|\| isCurator)`. |
| `src/pages/SettingsPage.jsx` | the blocked-readers list with Unblock, inside the Privacy section beside the private-profile toggle (R-28). `+ getBlocks` on mount, `+ handleUnblock`. |
| `src/pages/AdminPage.jsx` | `TABS` gains `'reports'`; `loadReports` lazy-loads from the tab click handler the way `loadContent` does; a panel after the content panel with status filters, `target_snapshot`, the reporter, `reports_on_target`, the bot flag, the existing delete routes for `note`/`comment` targets, and **Actioned / Dismiss** through `PATCH /admin/reports/{id}`. |
| `src/i18n/locales/{de,en,es,fr,pt,ru}.json` | `+ "safety"` namespace, **33 leaves each**, hand-written per locale with matching `{{name}}` placeholders. |
| `qa/unit/reportAffordance.test.mjs` (new) | 10 collected. |
| `.github/workflows/ci-tests.yml` | the `node-qa` floor 38 -> **48**, measured on a run. |

**Not touched:** no Python, no `tests/`, no existing `qa/unit` file, nothing in
`book-tracker-mobile-stitch/`. `git status` carries 13 modified + 3 new files, all inside
`book-tracker-frontend-stitch/src/**`, `qa/unit/` and the one CI floor this package is told to
raise.

### The six R-05 surfaces, with the anchor each is matched on

| # | Surface | File | Anchor the scan resolves (must match exactly 1 line) | lookahead |
|---|---|---|---|---|
| 1 | Feed post | `HomePage.jsx` | `<span className="material-symbols-outlined text-lg">more_horiz</span>` | 5 |
| 2 | Feed comment | `HomePage.jsx` | `<span className="text-on-surface-variant">{c.text}</span>` | 5 |
| 3 | Public-profile note | `UserProfilePage.jsx` | `<div className="absolute top-4 right-4 flex items-center gap-1">` | 1 |
| 4 | Public profile (the reader) | `UserProfilePage.jsx` | `aria-label={t('safety.moreActions')}` | 30 |
| 5 | Circle post | `GroupDetailPage.jsx` | `<div className="shrink-0 flex items-center gap-1">` | 2 |
| 6 | User search result | `HomePage.jsx` | `<p className="text-sm font-bold text-on-surface">{u.name}` | 6 |

`lookahead` is the number of lines after the anchor that belong to that site — the smallest window
that reaches its affordance. Site 4's window is the whole action menu, which *is* the site
(Unfollow, Report, Block). Block's two sites (C-05) are rows 4 and 6, the same anchors with the
other marker. **A seventh Block affordance exists in the per-post menu** and is deliberately not a
C-05 site: C-05's literal is 2, which is what spec R-05 and the plan commission.

### The exact copy

`safety.blockConfirm` (`en`), shown by `window.confirm` before any block:

> Block {{name}}?
>
> You will stop seeing each other inside TrackMyRead — their posts, comments and profile disappear
> from your view, and yours from theirs.
>
> Any follow between you is removed and will not come back if you unblock later.
>
> This does not unpublish their public posts: anyone who is signed out can still read them on the
> open web.

`safety.blockEffect`, under the checked-by-default checkbox in the report dialog:

> Blocking hides the two of you from each other inside TrackMyRead. It does not unpublish their
> public posts — anyone who is signed out can still read those on the open web.

`safety.alsoBlock`: **"Also block this person"**. `safety.unfollow`: **"Unfollow"** — the first item
of the profile menu, above Block (pm-decisions E-1: a menu whose only option is the nuclear one
pushes people into choosing it).

Both strings carry E-8 because a block is a tool between two accounts, not a privacy wall against
the open web: `/notes/feed` serves anonymous callers and cannot filter by a block that has no
viewer. C-06 asserts all three content anchors as regexes, so the sentence stays the PM's while the
facts stay in it.

---

## 2. The admin Reports tab — what a moderator can now do without a terminal

1. **Open `/admin` → Reports.** The queue is fetched by the tab's own click handler, never on mount:
   `AdminPage.jsx`'s mount effect ends `.catch(() => {})`, so a queue loaded there would fail
   silently and the tab would read "Nothing in this queue" after a 403. C-10 asserts the mount
   effect does not mention `getAdminReports` or `loadReports`.
2. **Read the report.** Per row: the reason, `target_type #target_id`, the reported words
   (`target_snapshot`), the reporter's name, the reported reader's name and bot flag, the reporter's
   `detail` and **`reports_on_target`** when it is above 1 — one complaint told from a pattern,
   without a second request.
3. **Act.** For a `note` or `comment` target, a Delete button calling the existing
   `DELETE /admin/content/{note,comment}/{id}`. The two routes are unmodified.
4. **Close it.** Actioned / Dismiss prompt for a resolution and `PATCH /admin/reports/{id}`.
   Resolving is not deleting (R-07): the row leaves the open queue and is still readable under the
   `actioned` / `dismissed` / `all` filters, which the tab offers as four buttons.

E-6 is unchanged and unfixable here: there is one admin, so a report about the admin is reviewed by
its subject.

---

## 3. Mutation-proof table

Procedure per row: suite **green**, apply one textual change to one named file, run `node --test
qa/unit/reportAffordance.test.mjs` — the **whole file**, never a `-k`/`--test-name-pattern` filter —
record the first failing assertion, revert, re-run and require `# pass 10 / # fail 0` again. The
harness that did this lived in the session scratchpad and is deliberately not committed. Every row's
green-before and green-after were measured; the final state is green.

| MUT-4I | File | One-line change | Node that went red | Measured first RED line | Caught |
|---|---|---|---|---|---|
| **45m** | `src/pages/HomePage.jsx` | re-insert `{(isOwn \|\| isAdmin) && (` around the whole menu | `C-04 the_post_menu_is_open_to_everyone_and_leaks_no_owner_action` | `the whole post menu is gated on line 192: {(isOwn \|\| isAdmin) && ( — the menu is gated again, so a non-owner has nowhere to report from` / `+ [ 'the whole post menu is gated on line 192: …' ] - []` | yes |
| **46** | `src/pages/HomePage.jsx` | delete Delete's own `{(isOwn \|\| isAdmin) && (` | `C-04 …` | `these menu items are not guarded by their own condition: delete` / `+ [ 'delete' ] - []` | yes |
| 70 | `src/pages/HomePage.jsx` | delete the comment row's Report item | `C-01 report_reachable_at_every_r05_web_site` | `5 of 6 R-05 sites carry <ReportButton; missing: home:comment-author` / `5 !== 6` | yes |
| 70b | `src/pages/GroupDetailPage.jsx` | delete the circle post's Report item | `C-01 …` | `5 of 6 R-05 sites carry <ReportButton; missing: group:circle-post` / `5 !== 6` | yes |
| **71** | `qa/unit/reportAffordance.test.mjs` | remove C-03's synthetic-negative assertion | — | **stays GREEN by construction — see "Mutations that did not bite", item 1** | no |
| 71b | `qa/unit/reportAffordance.test.mjs` | make the strip regex match nothing (break the detector) | `C-03 the_detector_reports_zero_on_a_stripped_copy` | `the detector reported 6 Report affordances on a copy with every <ReportButton removed — it cannot fail, so its pass means nothing` / `6 !== 0` | yes |
| 72 | `src/pages/UserProfilePage.jsx` | remove `<BlockButton />` from the profile menu | `C-05 block_reachable_from_the_profile_and_from_a_search_result` | `1 of 2 Block sites carry <BlockButton; missing: profile:reader-actions` / `1 !== 2` | yes |
| 73 | `src/i18n/locales/en.json` | drop the follow paragraph from `safety.blockConfirm` | `C-06 the_block_confirm_says_what_it_cannot_undo` | `AssertionError: the confirm does not mention the follow at all` | yes |
| 75 | `src/pages/AdminPage.jsx` | add `getAdminReports('open')` to the mount `Promise.all` | `C-10 the_reports_tab_is_registered_and_lazy_loaded` | `AssertionError: the Reports queue is loaded on mount, where a failed fetch is swallowed` | yes |
| 76 | `src/pages/SettingsPage.jsx` | delete the Unblock control's `onClick` | `C-12 settings_has_a_blocked_list_with_unblock` | `onClick={() => handleUnblock(b.user_id)}: matched 0 lines, expected exactly 1` | yes |
| 77 | `src/components/ReportButton.jsx` | `useState(false)` for `alsoBlock` | `C-13 also_block_is_checked_by_default` | `"Also block this person" initialises to false, not true` / `'false' !== 'true'` | yes |
| 78 | `src/components/ReportButton.jsx` | send `also_block: false` — render the box, never act on it | `C-13 …` | `AssertionError: the checkbox state never reaches the request — it renders and does nothing` | yes |
| 79 | `src/components/ReportButton.jsx` | add an eighth client reason (`'copyright'`) | `C-14 the_reason_picker_offers_exactly_the_apis_closed_set` | `the client offers 8 reasons, expected 7: spam, harassment, hate, sexual, violence, self_harm, other, copyright` / `8 !== 7` | yes |
| 80 | `src/i18n/locales/de.json` | remove `safety.blockConfirm` | `C-16 every_new_web_string_is_in_all_six_locales` | `AssertionError: de:safety.blockConfirm is missing` | yes |

### Mutations that did not bite, reported rather than replaced

1. **MUT-4I-71, as tests.md words it: "remove the synthetic-negative assertion → the case can no
   longer fail".** Measured: the suite stays at `# pass 10 / # fail 0`. That is not a defect in the
   test, it is what the row says — **deleting an assertion cannot make a test red**, so this row can
   never be "caught" by a run, and tests.md's own text concedes it ("G-4I-07 treats it as an
   uncaught mutation and blocks the merge" is a review instruction, not a measurement). The property
   the row is reaching for *is* measurable from the other side, and **MUT-4I-71b** measures it:
   break `stripAffordance` so the synthetic copy is identical to the real sources, and C-03 goes red
   with `6 !== 0`. Both rows are in the table. **The review control this leaves standing is that
   C-03's assertion is present in the committed diff** — which is a reviewer's job, not CI's.

2. **`MUT-4I-74` and `MUT-4I-70m` are not this package's.** 74 is `FeedScreen.js` and 70m is the
   mobile twin; both belong to P5. Recorded so the table's gaps are deliberate.

3. **A hole the sweep found in my own test, fixed by doing the mutation run rather than by reading
   the test.** C-04's "every destructive item carries its own condition" originally found an item's
   enclosing conditional by scanning upward for the first `{… && (` line. MUT-4I-46 **stayed green**
   against it: with Delete's own guard deleted, the first `&& (` above Delete is the *Edit* item's
   `{isOwn && (` — a closed sibling block — and the detector read that as Delete's guard. The scan
   now counts `)}` closings and skips the openers they belong to, so it finds the conditional that
   *encloses* the line rather than the nearest one above it, and the mutation bites with
   `+ [ 'delete' ]`. This is the exact shape of the defect K-4I-11 warns about and it was one
   upward-scan away from shipping as a privilege escalation with a green test.

---

## 4. Proof the owner-only actions did not leak

`C-04` is two-sided and each side carries its own synthetic negative (non-vacuity rule 3):

- **(a) the menu is open.** The detector finds the `more_horiz` trigger (exactly one line in
  `HomePage.jsx`), walks up to its `<div className="relative">` container, and asserts that none of
  the three source lines immediately above it (blanks and comments skipped) is an
  `isOwn`/`isAdmin` conditional. **Control:** the same detector run over a copy with
  `{(isOwn || isAdmin) && (` spliced back in immediately above the container must report exactly
  **1** violation — so "no violations" is a fact about the file and not about a broken pattern.
- **(b) nothing leaked.** The dropdown is bounded at both ends (`{showMenu && (` to the `)}` at its
  own indentation — `HomePage.jsx` holds three `<ReportButton`s and two `<BlockButton`s, so an
  unbounded search finds the comment row's and reports "3 matches, expected 1"). Inside it, the
  item inventory is **exactly four**, asserted before any per-item assertion:
  `['report', 'block', 'edit', 'delete']`. The two that act on the post (`setEditing(true)`,
  `onClick={handleDelete}`) must each have a nearest *enclosing* conditional naming `isOwn` or
  `isAdmin`; the two open to a non-owner must each have one naming `!isOwn`. **Control:** strip
  Delete's guard line and the detector must report `['delete']` — measured, and it is what caught
  the upward-scan hole in item 3 above.

An exact inventory rather than "at most one" (rule 14): a fifth menu item, or a deleted one, fails
the `deepEqual` before anything else runs.

The same shape applies to the circle post: `GroupDetailPage.jsx`'s delete gate no longer wraps the
cluster, and `(isOwn || isCurator)` moved onto the Delete button itself.

---

## 5. Counts and gates

| Gate | Command | Before | After |
|---|---|---|---|
| **G-4I-06** web unit | `node --test "qa/unit/*.test.mjs"` | `# tests 38 / # pass 38 / # fail 0` | **`# tests 48 / # pass 48 / # fail 0 / # skipped 0`** |
| the new file alone | `node --test "qa/unit/reportAffordance.test.mjs"` | collection failure (no file) | `# tests 10 / # pass 10 / # fail 0` |
| pytest | `python -m pytest tests -q --collect-only` | **952 collected** | **952 collected** (no Python touched) |
| Vite build | `cd book-tracker-frontend-stitch && npm run build` | PASS (13.9 s) | **PASS (2.5 s warm)** — same pre-existing >500 kB chunk warning, no new warning |
| **G-4I-13** CI floor | `.github/workflows/ci-tests.yml` `node-qa` | 38 | **48**, re-measured off the run, with the reason in the comment block |

**Both briefed baselines verified before starting, not assumed:** `qa/unit` was 38 and
`pytest --collect-only` was 952 on this branch at `61c2947`. The `pytest` floor in
`ci-tests.yml:68` already reads 952 from 4I-B and is untouched.

`qa/unit` needs `npm ci --prefix qa` in the worktree; the web build needs `npm ci` in
`book-tracker-frontend-stitch/` (neither `node_modules` existed here).

**Collected count, not pass/fail (trap 1):** the new file is asserted at `# tests 10`, and the
suite total at `# tests 48` as well as `# pass 48`. A file that failed to parse would move
`# tests`, which is the number the CI step reads.

### Regression checks that mattered

- `qa/unit/botBadge.test.mjs` asserts `HomePage.jsx` holds **exactly 4** `<BotBadge` occurrences
  (`:167-168`) and resolves seven anchors there and in `UserProfilePage.jsx` /
  `GroupDetailPage.jsx`. Reworking the menu, the comment row and the sidebar row did not move any of
  them: all seven other `qa/unit` files stay green **unedited** (RG-4I-10).
- `python scripts/gen_dependency_map.py` resolves **all six** new client calls to real routes
  (`POST /reports`, `POST`/`DELETE /blocks/{user_id}`, `GET /blocks`, `GET /admin/reports`,
  `PATCH /admin/reports/{report_id}`), with no new orphan: the 2 it reports are pre-existing
  (`POST /admin/bot/trigger`, a hand-curated row 4F's deletion left behind, and the
  `/library/book/:userbookId` load-path note). **The regenerated `dependency-map.md` is deliberately
  not committed** — it is not this package's file, G-4I-11 runs it after the merge, and committing a
  188-line regeneration on two sibling Builder branches is a guaranteed conflict.

---

## 6. Problems found — in the plan, the spec and the architecture

1. **tests.md C-13 and MUT-4I-78 describe a flow pm-decisions Q-3 deleted.** C-13 asserts the
   checkbox is "wired to the `POST /blocks` call" and MUT-4I-78 is "render the checkbox and never
   call `/blocks`". Q-3 made it **one** request with an `also_block` field, and 4I-B's build notes
   and `reports_router.py` confirm it. A client that called `POST /blocks` separately would be
   re-introducing exactly the partial state Q-3 removed. C-13 therefore asserts `also_block:
   alsoBlock` reaches `reportContent`, that `api.js` forwards it, **and** that the dialog does *not*
   call `blockUser(` — the mutation bites on the field. The same stale wording makes **C-06b
   moot for P5**: there is no second request whose failure could be reported separately.
2. **tests.md §10's file header guard, `assert.match(SOURCES.home, /reportContent|blockUser/)`,
   cannot hold as written.** The architecture's own P4 note says "P4 extracts one small menu
   component and one small modal", and one shared `ReportButton`/`BlockButton` is what makes the six
   surfaces share one reason picker and one piece of copy. The API calls therefore live in the
   components, not in `HomePage.jsx`. The guard is split in two — the page carries an affordance,
   `api.js` carries the route — which is what the one-liner was standing in for. **MUT-4I-77, -78
   and -79 name `src/pages/HomePage.jsx` for the same reason and were applied to
   `src/components/ReportButton.jsx`.**
3. **The architecture's P4 row for the sidebar search result is not a one-line addition.** That row
   is a single `<button onClick={navigate}>`, and a Report or Block control inside it is a nested
   interactive element — invalid HTML, and the inner click would fight the outer one. The row is now
   a `<div>` holding the navigate button plus the two controls. Noted because "add Block on a search
   result" reads like one line and is not.
4. **spec R-05 site 4's anchor (`onClick={toggleFollow}` at `:424`) cannot be the scan's anchor
   once Unfollow is in the menu.** pm-decisions E-1 requires an Unfollow item, the natural handler
   for it is `toggleFollow`, and a second occurrence makes the anchor resolve to two lines — which
   this scan treats as a failure, correctly. Site 4 is anchored on the cluster's own menu trigger
   (`aria-label={t('safety.moreActions')}`) instead, and C-05 separately asserts
   `indexOf("{t('safety.unfollow')}") < indexOf('<BlockButton')` so E-1's ordering is a test and not
   a convention.
5. **`HomePage.jsx:184`'s Delete button is the leak K-4I-11 describes, and it is worse than "no
   condition".** Edit at `:194` is separately wrapped in `{isOwn && (`, which makes the file *look*
   like each item is guarded. Verified on this branch before editing: the Delete button at
   `:202-209` has no condition of its own at all.
6. **tests.md C-01's expected failure message names `home:comment-author`.** Measured output is
   `5 of 6 R-05 sites carry <ReportButton; missing: home:comment-author` — the plan's wording, with
   the marker named. Recorded because it is the one plan-predicted message in this package that
   matched exactly.
7. **There is still no web i18n-parity test outside this file.** Confirmed: `qa/unit/` holds
   `authCacheClear`, `botBadge`, `contrast`, `localDate`, `navigation`, `noteVisibility`,
   `pagePerfWaterfall` and now `reportAffordance`. C-16 is the only thing standing between the web
   client and English-only copy, and it covers **only this package's 33 keys** — every other string
   on the web is still unguarded. That is a gap worth a general test, not a P4 edit.
8. **`window.confirm` and `window.prompt` are the house style and they are what P4 used** (three
   other pages already confirm that way; `GroupDetailPage.jsx` rolls its own modal). The block
   confirm is therefore a browser dialog, which means the copy cannot be formatted and the reader
   cannot scroll it on a small viewport. The copy is four short paragraphs for that reason. If the
   PM wants it styled, that is a shared confirm primitive — a refactor across four pages, not this
   sprint.

---

## 7. What this package does NOT do

- **No render proof.** Every case is an AST-or-anchored-text assertion over committed source. It
  proves the affordance exists at each surface, outside a closed gate, with the owner-only actions
  still guarded. It does **not** prove the item renders, the modal opens, or the request is sent —
  tests.md §15.11's substitute proof (D-4I-01/02/04, P-4I-09, by hand on the real build) still
  stands and is **not** discharged by this commit.
- **No mobile.** `book-tracker-mobile-stitch/` is untouched; P5 is the sibling worktree. `app.json`
  is not bumped here.
- **No `dependency-map.md`, no `context/` node, no `features/safety/index.md` edit.** Run and
  verified (§5), not committed.
- **Nothing is deployed.** The client needs both API halves on production first: PM SQL steps 10
  **and** 11 are still outstanding per 4I-A's and 4I-B's notes, and every affordance here 404s or
  500s until they are.
