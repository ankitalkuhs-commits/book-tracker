# Build Notes — Sprint 4A, Package C (Web styling: F-10 tokens + remaining pages)

Built against `features/maintenance/sprint-4a-platform-audit/{spec,architecture,tests}.md`.
Worktree base: `082953d` (merge(web-4a): Package B2 — circles, book preview, library, composers,
search, locales). B1 and B2 were already merged into this worktree.

## Scope

Files touched (all under `book-tracker-frontend-stitch/`), exactly the Package C list:
- `tailwind.config.js`
- `src/components/Nav.jsx`
- `src/pages/CreateGroupPage.jsx`
- `src/pages/GroupsPage.jsx`
- `src/pages/InsightsPage.jsx`
- `src/pages/LoginPage.jsx`
- `src/pages/SettingsPage.jsx`
- `src/pages/UserProfilePage.jsx`

No other file was edited. No dependency was added, no `node_modules`/`dist`/lockfile changes.

## What was built

### 1. Tokens (`tailwind.config.js`)
Added exactly 2 lines, removed 0 (`git diff` confirmed):
```js
"on-surface-muted": "#586060",
"on-surface-faint": "#636a6a",
```
Placed next to `on-surface-variant` per the architecture's table. No existing colour changed.

### 2. Mapping rule applied to the 7 files
Per the architecture's "Mapping rule" table:
- `text-on-surface-variant/60`, `/70` → `text-on-surface-muted`
- `text-on-surface-variant/20..50` → `text-on-surface-faint`
- `text-on-surface/40,50,60` → `text-on-surface-muted`
- `text-error/50,60,70` → `text-error`
- `text-secondary/80` → `text-secondary`
- `text-primary/60,70` → `text-primary`
- `text-[7-11px]` → `text-xs` (12px / 16px line-height)
- Fixed-size number badges (`w-4 h-4 … text-[10px] … rounded-full`) → `min-w-[18px] h-[18px] px-1 text-xs leading-none rounded-full` (`Nav.jsx:67`, the unread-count pill). The second, mobile-menu badge (`Nav.jsx:173`, `w-5 h-5`) already had room ≥18px; only its `text-[10px]` was raised to `text-xs` (kept `w-5 h-5`, added `leading-none`) since it isn't the specific `w-4 h-4` pattern ST-C-04 targets.

**Not changed** (left as-is, per the architecture's explicit exemptions):
- `hover:`, `group-hover:`, `focus:`, `placeholder:` variants — e.g. `CreateGroupPage.jsx:137` (`placeholder:text-on-surface-variant/40`).
- `text-on-surface/70` — already passes (6.32 / 5.88), not in the mapping table.
- Icon-only `material-symbols-outlined` elements (governed by WCAG 1.4.11, axe skips ligatures). Full list of skipped (b)-class hits, file:line:
  - `CreateGroupPage.jsx:234` (search icon, `text-outline/60`)
  - `GroupsPage.jsx:289, 310, 326` (`text-outline/30`, `/60`, `/30`)
  - `InsightsPage.jsx:26, 173, 233, 289, 311` (line 26 is the icon span inside `StatCard`; the rest are `text-outline/*` placeholders)
  - `UserProfilePage.jsx:108, 144, 152, 336, 434, 483, 520, 564, 588` — 144 and 152 are `<button>` elements whose *only* child is a `material-symbols-outlined` span (delete / share icon buttons on `PublicNoteCard`); the low-contrast class sits on the button but only ever colours the icon ligature, so it is exempt the same as a class placed directly on the span.
- Borders and backgrounds (untouched throughout).

`text-on-primary/70` (StatCard accent branch, `InsightsPage.jsx:25/26/29`, and `CreateGroupPage.jsx:284`) is **not** in the architecture's mapping table (only `on-surface-variant`/`on-surface`/`outline`/`error`/`secondary`/`primary` are listed) — left untouched as out of scope for F-10.

## Verification

### Static greps (ST-C-02, ST-C-03, ST-C-05, ST-C-04) — run against the 7 owned files and repo-wide
- `text-\[(7|8|9|10|11)px\]`: **0 hits anywhere in `src`** (ST-C-03 — absolute, satisfied).
- Low-contrast colour pattern (ST-C-02) on the 7 files: every remaining hit is (a) a `placeholder:` variant or (b) icon-only — listed above. No unexplained hit.
- `text-outline` pattern (ST-C-05) on the 7 files: every remaining hit is on a `material-symbols-outlined` element.
- Badge pattern (ST-C-04): 0 remaining `w-4 h-4 … text-[10px] … rounded-full` anywhere in `src`.
- Guard: `text-on-surface-faint` never appears with `bg-surface-container-highest` or `bg-surface-variant` anywhere in `src` (0 hits).

### Contrast ratios (before → after), WCAG 2.1 relative luminance
Computed independently with a throwaway Node script (no dependency added — `node --test`-style plain
script, matches the K-18 constraint), reproducing the architecture's table to 2 decimals:

| Text token | #ffffff | #fbf9f4 | #f5f3ee | #f0eee9 | #eae8e3 |
|---|---|---|---|---|---|
| `on-surface-variant` #3f4949 (unchanged, tier 1) | 9.29 | 8.83 | 8.38 | 8.01 | 7.59 |
| **`on-surface-muted` #586060 (NEW, tier 2)** | 6.45 | 6.13 | 5.81 | 5.56 | 5.27 |
| **`on-surface-faint` #636a6a (NEW, tier 3)** | 5.53 | 5.25 | 4.98 | 4.77 | 4.51 |
| `error` #ba1a1a (replaces `error/50-70`) | 6.46 | 6.14 | 5.83 | 5.57 | 5.28 |
| `secondary` #735c00 (replaces `secondary/80`) | 6.44 | 6.12 | 5.81 | 5.56 | 5.26 |
| `primary` #00464a (replaces `primary/60-70`) | 10.63 | 10.11 | 9.59 | 9.17 | 8.68 |
| **before:** `variant/60` → #8c9292 (effective) | 3.16 | 3.01 | 2.85 | 2.73 | 2.58 |
| **before:** `outline` #6f7979 solid | 4.48 | 4.26 | 4.04 | 3.86 | 3.66 |

Before → after examples actually hit in this package's files:
- `Nav.jsx` inactive tab (`text-on-surface/50` ≈ 2.4:1 on white → `on-surface-muted` 6.45:1)
- `UserProfilePage.jsx:60` empty-state (`text-on-surface-variant/50` ≈ 2.5:1 on `#f5f3ee` → `on-surface-faint` 4.98:1)
- `SettingsPage.jsx:794` delete-account link (`text-error/60` ≈ 4.6:1 on white, but was inconsistent across the two `#f5f3ee`/`#f0eee9` container variants it also renders on → solid `error` 6.46/5.83/5.57:1)

Guard confirmed: `on-surface-faint` on `#e4e2dd` (`surface-container-highest`) = **4.27** (architecture says ≈4.3), i.e. **< 4.5** — correctly never used against that background in this package (grep above), matching the architecture's warning.

### Token cross-reference (both directions)
- **Every token I defined is referenced in the merged `src/`:** `on-surface-muted` and `on-surface-faint` are both already used by B1 (`AdminPage.jsx`, `HomePage.jsx`) and B2 (`BookPreviewModal.jsx`, `BookDetailPage.jsx`, `GroupDetailPage.jsx`, `HomePage.jsx`, `LibraryPage.jsx`, `NotificationsPage.jsx`, `ProfilePage.jsx`, `SearchPage.jsx`) — confirmed by `grep -rn "on-surface-muted\|on-surface-faint" src` before I touched anything, and now also by my own 7 files.
- **Every token B1/B2 reference is defined:** same grep — both exact hex/name pairs (`#586060` / `#636a6a`) match what B1/B2 already typed, so no other token names are expected from `tailwind.config.js`.

### Build / lint
- `npm --prefix book-tracker-frontend-stitch ci` — succeeded (251 packages), no lockfile/package.json diff.
- `npm --prefix book-tracker-frontend-stitch run build` — **exit 0**, `dist/` produced, no unresolved-module warnings (only a chunk-size-over-500kB advisory, pre-existing/unrelated).
- `npx eslint . -f json` (from `book-tracker-frontend-stitch/`):
  - **Before my C changes** (per the task brief, state after B1+B2 merge): **36 errors / 7 warnings**.
  - **After my C changes**: **36 errors / 7 warnings** — identical. My edits are className-string-only; the errors that appear in files I touched (`CreateGroupPage.jsx: 'searching' unused`, `GroupsPage.jsx: 'timeAgo' unused` + one `setState`-in-effect, `InsightsPage.jsx: 'user' unused`, `UserProfilePage.jsx: 'pct' unused`) are all pre-existing and unrelated to this change (confirmed against `git show HEAD:...` — same line numbers, present before I edited).
  - Gate G-07 (≤37 errors / ≤7 warnings) — **passes**. 0 problems in files I created — N/A, I created no new files.

## Diverged From Brief
None. Implemented the architecture's mapping rule and token hexes exactly as specified.

## Assumptions
- The architecture's per-file "Occurrences" counts (colour/size) are informational cross-checks, not exact gates. My actual resting-state edit counts differ slightly from the table for two files, both explainable and recorded here for the Architect:
  - `CreateGroupPage.jsx`: table says colour 5; I found 6 raw regex hits, of which 1 (`:137`) is a `placeholder:` variant (excluded) and 1 (`:234`) is icon-only (excluded), leaving **4** actual conversions. Net effect after exemptions is the same or fewer than the table implies either way — no low-contrast resting text was left unconverted (verified by the post-edit grep above).
  - `SettingsPage.jsx`: table says colour 4; I found only **2** raw hits (`:385`, `:794`) under the literal ST-C-02 regex, both converted. I re-checked the whole file for every other pattern in the mapping table (`text-outline`, `text-secondary/80`, `text-primary/60,70`, `text-on-surface/40,50,60`) and found no further matches. Recorded as a discrepancy rather than silently assumed away; the static/local checks (ST-C-02, L-C-01/02) are what actually gate this, and both pass on this file.
- `Nav.jsx:173`'s mobile-menu unread badge (`w-5 h-5`) is treated as already satisfying the "≥18px" badge intent without the `min-w-[18px] h-[18px]` rewrite, since 20px > 18px; only its text size was raised to `text-xs`. Flagged in case the Architect wants byte-for-byte consistency with the `min-w-[18px] h-[18px] px-1 text-xs leading-none` pattern instead.

## Explicitly Not Built
- **L-C-01 (axe run against a live dev server) was not run.** Per K-21, a local dev server must run on `--mode localapi --port 5174` against a local API with `REVIEW_LOGIN_SECRET`/`REVIEW_LOGIN_EMAILS` seeded (`scripts/seed_review_accounts.py`), and this worktree/session has no local API instance seeded for review accounts, nor was one started, to honour `qa/RULES_OF_ENGAGEMENT.md` and K-21's warning against pointing a dev server at production. Per the tests.md precondition, **this is a documented skip, not a claimed pass** — P-19 (production check) remains the outstanding proof, owned by QA/PM after deploy, same as `L-C-02`.
- No screenshot-based human sign-off (P-19 step 3) — that is explicitly a human/QA step, not a Builder deliverable.
- No changes to any file outside the Package C list, including no attempt to fix the pre-existing unrelated eslint errors noted above (out of scope; "adjacent bug → mention, do not fix").

## Ready-for-QA checklist
- [x] All screen states implemented (this package is styling-only; no new states)
- [x] `pytest tests -q` — N/A, this package touches no Python
- [x] Web build passes (`npm run build` exit 0)
- [x] Migration appended + flagged — N/A, no DB change
- [x] `app.json` bumped — N/A, no mobile change
- [x] Notification config/placeholders/`fire_event` — N/A, no notification change
- [ ] `node qa/a11y_audit.mjs` / L-C-01 — **skipped**, no seeded local API in this session (see Explicitly Not Built); relies on P-19 post-deploy
