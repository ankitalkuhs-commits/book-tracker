# Build Notes — Package B2 (Sprint 4A, Web content pages)

Scope: `features/maintenance/sprint-4a-platform-audit/architecture.md` → Execution Plan → **Package B2 — Web content pages: circles, book preview, library, composers, search, locales**.

## Workspace note

This worktree's branch (`worktree-agent-addef573fe02bca67`) diverges from `master` at `bc5ed91`, before Package B1 (web) was merged into `master` at `7a88da0`. B2's file list is disjoint from B1's, so this was not a blocker — B1's `AuthContext.jsx` (on `master`, not in this branch) already imports `NOTE_VISIBILITY_KEY` from B2's pre-committed `src/utils/noteVisibility.js` for E2 (logout clears the key), confirming the K-15 resolution the architecture recommended. No merge/rebase was performed on this branch; that is the orchestrator's job when reassembling C + B1 + B2.

## Files changed (13 — matches the architecture's B2 list exactly)

All paths relative to `book-tracker-frontend-stitch/`:
- `src/components/VisibilityToggle.jsx` — **new**
- `src/components/BookPreviewModal.jsx`
- `src/pages/GroupDetailPage.jsx`
- `src/pages/LibraryPage.jsx`
- `src/pages/HomePage.jsx`
- `src/pages/BookDetailPage.jsx`
- `src/pages/ProfilePage.jsx`
- `src/pages/SearchPage.jsx`
- `src/i18n/locales/{en,de,es,fr,pt,ru}.json`

`src/utils/noteVisibility.js` was **not modified** — imported read-only from all three composers, per the brief. No other file outside this list was touched (`git diff --stat` against the working tree confirms exactly these 13 paths).

## Per finding

### F-25 · `GroupDetailPage.jsx` — confirm before Leave / Remove member / Delete post
- Added `const [confirm, setConfirm] = useState(null)` alongside the existing `showDeleteConfirm` (Disband stays a separate state, untouched).
- Split each action into an "ask" function (`handleLeave`, `handleRemoveMember`, `handleDeletePost`) that only calls `setConfirm({ title, body, confirmLabel, onConfirm })`, and a "do" function (`doLeave`, `doRemoveMember`, `doDeletePost`) that holds the actual API call.
- `doDeletePost` now has a `try/catch`; the catch calls `toast(e.message || 'Could not delete post', 'error')` — today's code had no error handling at all.
- Rendered one generic confirm modal (copied from the Disband modal's markup) after it. Its confirm button clears `confirm` **before** awaiting the handler (`const fn = confirm.onConfirm; setConfirm(null); await fn()`), so a double-click cannot double-fire. No `onClick` on the backdrop, so a backdrop click sends nothing (matches the existing Disband modal's pattern).
- Covered by: **L-B2-13**, **ST-B2-06**, **P-14**.

### F-07 web · dedup keys on Add Book
- `BookPreviewModal.jsx handleAdd`: added `book_id: book.id || null` and `isbn: book.isbn || null` alongside the existing payload fields. No key removed.
- `LibraryPage.jsx handleAdd` (the live Add Book modal): added `google_books_id: book.google_books_id || null`. Did **not** add `book_id` there (Google search results have no local id, per the brief). The dead `BookDetailPanel` block (`:306-604` in the original file) had no logic changes — only F-10 class renames inside it, as instructed.
- Covered by: **L-B2-11**, **ST-B2-09**.

### F-17 web · remembered Public / Only me switch
- `src/components/VisibilityToggle.jsx` (new): props exactly `{ value, onChange }`; `role="radiogroup"` with `aria-label={t('feed.visibilityLabel')}`; each option `role="radio"` `aria-checked`; **Only me** (icon `lock`) rendered first, **Public** (icon `public`) second; click handler calls `writeNoteVisibility(next)` **before** `onChange(next)`; no `useEffect` writes on mount.
- All three composers (`HomePage.jsx` `PostComposer`, `BookDetailPage.jsx`, `ProfilePage.jsx` `NewNoteModal`) now do `const [visibility, setVisibility] = useState(readNoteVisibility)`, render `<VisibilityToggle value={visibility} onChange={setVisibility} />` beside the Post button, and send `is_public: visibility === 'public'`. `ProfilePage.jsx`'s composer previously omitted `is_public` entirely (the web equivalent of the Android book-detail defect) — it now always sends the key, matching the brief's explicit callout.
- Switch is **never reset** after posting, in any composer.
- Home composer: on a private post, the toast reads `t('feed.savedPrivately')` and the note is **not** passed to `onPost`, so it never reaches `handleNewPost`/the rendered list. On a public post, `onPost` fires as before with the existing `'Reflection posted!'` toast.
- Covered by: **L-B2-01..06**, **ST-B2-01**, **ST-B2-02**, **ST-B2-03**.

### F-60 · `HomePage.jsx` — a post made while the feed loads stays visible
Replaced the flat `fetchFeed`/`handleNewPost`/`handleDeletePost`/`handleEditPost` with the guard from the architecture:
- Three refs: `requestSeq` (bumped at the top of every `fetchFeed` call), `activeTabRef` (the tab the newest call is for), `localPosts` (`[{ post, tab }]` created this session, not yet seen in a server response).
- `fetchFeed` captures its own `seq` at entry, sets `activeTabRef.current = tab`, and after the awaited response checks `if (seq !== requestSeq.current || tab !== activeTabRef.current) return` before touching state — a stale response or a response for a tab that's no longer active is dropped, never written to `posts`.
- On a fresh response, `localPosts.current` is filtered down to entries the server doesn't have yet (`seen` = set of response ids), then the carried posts *for the active tab only* are prepended to the fresh list: `setPosts([...carried, ...fresh])`. `setPosts(data || [])` (the original bug) no longer appears anywhere in the file.
- `handleNewPost` pushes `{ post, tab: activeTabRef.current }` onto `localPosts.current` before updating `posts`. `handleDeletePost` and `handleEditPost` each also update `localPosts.current` (filter / map respectively), so a deleted post cannot be resurrected by a later-landing response and an edit is preserved in the carried copy too.
- Only public posts ever reach `handleNewPost` (enforced by the F-17 change above), so a carried post is always valid in the feed it's rendered in.
- Covered by: **L-B2-07..10**, **ST-B2-04**, and the production check **P-12** (`qa/scenarios_web.mjs` S1).

### F-21 · `SearchPage.jsx` — dead format filter removed
- Deleted `FORMAT_OPTIONS`, the `activeFormat` state, `filterByFormat`, and the chips block that rendered them. `activeResults` is now `tab === 'google' ? googleResults : localResults` (no filtering).
- Did **not** touch the `format.*` i18n keys (grepped first — other screens still use them) or anything under `book-tracker-mobile-stitch/`.
- Covered by: **L-B2-12**, **ST-B2-05**.

### F-10 (inside B2's files only)
Applied the Package C mapping (`text-on-surface-variant/{20,30,40,50,60,70}` → `text-on-surface-faint`/`text-on-surface-muted` by tier; `text-on-surface/{40,50,60}` → muted; `text-error/{50,60,70}` → `text-error`; `text-primary/{60,70}` → `text-primary`; every `text-[7-11px]` → `text-xs`) to every file in B2's list, leaving untouched: icon-only `material-symbols-outlined` elements/wrappers, `hover:`/`focus:`/`placeholder:` variants, and anything outside the documented fraction list (e.g. `text-primary/80`, `text-secondary/80` resting, which the mapping doesn't cover).

- **`BookPreviewModal.jsx`**: 1 conversion (affiliate disclaimer → `text-on-surface-faint`); 1 icon (`menu_book`, `text-outline/40`) left as-is.
- **`GroupDetailPage.jsx`**: 18 colour conversions, 18 size conversions (all `text-[Npx]` → `text-xs`). Left as-is: 2 icon-only delete/remove buttons (`text-on-surface-variant/40`, `/30`), 1 hover variant (`hover:text-primary/70`), and 7 icon spans using `text-outline`/`text-outline/NN`.
- **`HomePage.jsx`**: 4 colour conversions, 3 size conversions. Synthetic-cover fix: `COVER_COLORS` entries `#2e7d32`→`#256b29`, `#e65100`→`#a84300`, `#bf360c`→`#a52f0a` (the other five already pass); the title `<p>` is now `className="hidden md:line-clamp-4 text-xs font-bold text-center leading-tight"` (hidden on mobile instead of shrinking below 12 px). Left as-is: 1 icon-only delete-comment button, 1 `placeholder:` variant, 5 icon spans.
- **`BookDetailPage.jsx`**: 4 colour conversions, 0 size (file had none). Left as-is: 1 `placeholder:` variant, 3 icon spans (including the star-rating icons at the line the architecture names, `:47`).
- **`ProfilePage.jsx`**: 17 colour+size conversions (12 colour, 13 size — one `text-[10px]` conversion, the yearly-goal on-track/behind-pace label, had no accompanying resting-state colour match since its colour is chosen dynamically between `text-primary`/`text-secondary`). Left as-is: 1 icon-only menu button, 3 icon-only stat-card icons, 1 icon (`chevron_right`), 1 icon (favourite heart inside a text label — only the icon's own span, not the label), 1 hover variant.
- **`SearchPage.jsx`**: 7 colour conversions, 2 size conversions. Left as-is: 4 icon spans (`search`, `search_off`/`library_books`, `auto_stories`).

Every remaining un-converted hit in all six files is icon-only or a `hover:`/`placeholder:` variant — verified by re-grepping each file after edits (see the ST-B2-10 / ST-C-02-style check below).

### Locales (`src/i18n/locales/{en,de,es,fr,pt,ru}.json`)
Added 8 new keys under `groups` (F-25) and 4 under `feed` (F-17) to all six files:

**`groups`**: `leaveConfirm`, `leave`, `removeMemberTitle`, `removeMemberConfirm`, `remove`, `deletePostTitle`, `deletePostConfirm`, `delete`.
**`feed`**: `visibilityLabel`, `visibilityPublic`, `visibilityPrivate`, `savedPrivately`.

`en.json` values are byte-identical to the architecture's tables. Translations for de/es/fr/pt/ru (none reused an English fallback — all 60 new strings were translated):

| Key | de | es | fr | pt | ru |
|---|---|---|---|---|---|
| `feed.savedPrivately` | "Privat gespeichert — zu finden in deinem Profil" | "Guardado en privado — encuéntralo en tu perfil" | "Enregistré en privé — retrouvez-le sur votre profil" | "Salvo em privado — encontre no seu Perfil" | "Сохранено в приватном режиме — найдите в своём профиле" |
| `feed.visibilityLabel` | "Wer kann das sehen" | "Quién puede ver esto" | "Qui peut voir ceci" | "Quem pode ver isso" | "Кто может это видеть" |
| `feed.visibilityPublic` | "Öffentlich" | "Público" | "Public" | "Público" | "Публично" |
| `feed.visibilityPrivate` | "Nur ich" | "Solo yo" | "Seulement moi" | "Só eu" | "Только я" |
| `groups.leave` | "Verlassen" | "Salir" | "Quitter" | "Sair" | "Покинуть" |
| `groups.remove` | "Entfernen" | "Eliminar" | "Retirer" | "Remover" | "Удалить" |
| `groups.delete` | "Löschen" | "Eliminar" | "Supprimer" | "Excluir" | "Удалить" |

(Full sentences for `leaveConfirm`, `removeMemberTitle/Confirm`, `deletePostTitle/Confirm` are in the JSON files themselves.)

**Parity check** (`node -e` walking dotted key paths, run after all edits):
- All 12 new keys present in all 6 locales.
- `en`: 512 total keys (was 500).
- `de`/`es`/`fr`/`pt`: 480 total keys each (was 468); still exactly 32 keys missing relative to `en` — the pre-existing K-02 gap did **not** grow.
- `ru`: 490 total keys (was 478); still exactly 32 missing relative to `en` and 10 extra — unchanged from baseline.
- All six files still parse as valid JSON (`JSON.parse` succeeded on every file).

## Build and lint

No `node_modules/` existed in the worktree; ran `npm ci` (succeeded cleanly, 251 packages, no lockfile change).

- **Before** (captured by stashing this session's edits with a tagged `git stash push -u -m`, running lint, then `git stash apply <sha>` + `git stash drop <sha>` to restore — never a bare `stash pop`, since the stash stack is shared across worktrees): `npm run build` → exit 0. `npm run lint` → **44 problems (37 errors, 7 warnings)**, identical to the sprint's documented `3157eee` baseline.
- **After** (this session's full diff): `npm run build` → exit 0, same output (`dist/` produced, one pre-existing chunk-size advisory, no module-resolution warnings — `VisibilityToggle.jsx` and `noteVisibility.js` both resolve). `npm run lint` → **44 problems (37 errors, 7 warnings)** — unchanged.
- **0 lint problems in `VisibilityToggle.jsx`** (the only new file this package creates; `navigation.js` is B1's).
- Gate G-07 (≤ 37 errors / ≤ 7 warnings, 0 in new-4A files) is met with 0 regressions.

Note: this worktree's branch predates B1's merge into `master`, so this "before" number is this branch's own baseline, not the `36/7` figure quoted in the brief (that figure reflects `master` *after* B1 landed, which this branch does not yet contain). The important fact — B2 added 0 new lint problems — holds either way.

## Locale JSON validity
Verified with a one-off `node -e` script (no dependency added to the frontend package, per K-18): all six locale files parse, and the dotted-key-path parity numbers above were computed the same way.

## Deviations from the brief
None. Every item in F-07 web, F-17 web, F-21, F-25, F-60, and F-10 (inside B2's files) was implemented as specified. The one open question the architecture flagged for B2 (K-15, the B1↔B2 `noteVisibility.js` import) was already resolved upstream (the file is pre-committed and read-only, and B1's merged `AuthContext.jsx` already imports the constant) — nothing further was needed from this package.

## Explicitly not built
- Nothing in B2's scope was skipped.
- `LibraryPage.jsx`'s dead `BookDetailPanel` (`:306-604` in the pre-edit file) had its F-10 class names updated (as instructed) but its logic was left untouched, per the brief.

## Ready-for-QA checklist
- [x] All screen states implemented (confirm modals, visibility toggle in all three composers, feed race guard, format-chip removal, dedup-key payloads, F-10 token/size mapping)
- [x] `pytest tests -q` — not applicable to this package (web-only, no API changes)
- [x] `npm run build` passes (exit 0)
- [x] `npm run lint` — 44/37/7, unchanged from this branch's baseline, 0 in the file this package creates
- [x] Migration — not applicable (no `models.py`/DB touched)
- [x] `app.json` — not applicable (no mobile code touched)
- [x] Notification — not applicable (no `fire_event`/config.py touched)

## Commit
Committed with `ankitshukla47as-ops` / `ankitalkuhs@gmail.com` per the brief. Not pushed.
