---
screen: sprint-4f-activity-engine
feature: community
package: P3 — web
branch: builder-4f-p3
status: built
built: 2026-09-23
---

# Sprint 4F, package P3 — build notes

Requirements: **R-03** (the web badge) and **R-16**'s admin half.
Acceptance contract: `tests.md` §4 (W-04..W-07, L-4F-01..05) and §10 rows MUT-4F-55..60.

## What shipped

| File | Change |
|---|---|
| `book-tracker-frontend-stitch/src/components/BotBadge.jsx` | **new.** Renders `null` unless `user?.is_bot`; otherwise the pill |
| `…/src/pages/HomePage.jsx` | import + **4** badge sites |
| `…/src/pages/UserProfilePage.jsx` | import + **1** badge site |
| `…/src/pages/GroupDetailPage.jsx` | import + **2** badge sites |
| `…/src/pages/AdminPage.jsx` | R-16: `is_bot` column, reader-labelled overview with `bot_users` / `bot_notes`, the bot-trigger control deleted |
| `…/src/services/api.js` | `triggerBot()` deleted (its endpoint is deleted by P2) |
| `qa/unit/botBadge.test.mjs` | **new.** W-04..W-07 |
| `qa/web_4f_local.mjs` | **new.** L-4F-01..05 |

### The badge

```jsx
if (!user?.is_bot) return null
<span className="text-xs font-bold uppercase tracking-wider text-secondary bg-secondary/10 px-1.5 py-0.5 rounded-full shrink-0 ml-1.5 align-middle">BOT</span>
```

The Curator pill's class string (`GroupDetailPage.jsx:967`) is copied byte-for-byte; `ml-1.5
align-middle` is appended so the pill sits beside a name without any call site needing a flex
wrapper. **The margin exists only when the pill does**, because the component returns `null` for a
reader — so a reader's card gains no node, no gap and no height. That is asserted by rendering, not
by argument: L-4F-02 measures the reader's card against the same page fed `user` objects with no
`is_bot` key at all (exactly the pre-4F API shape) and requires the two heights to be within 2 px.
They were **identical**.

`user?.is_bot` is a truthiness test on an optional chain. A stale 60-second GET cache (`api.js:10-44`)
can serve a `user` object from before R-02 shipped, and that must render nothing rather than crash or
badge everybody — L-4F-04.

## The site list, by the anchor that was matched (never by line number)

Seven sites, exactly spec R-03's list. Every anchor was verified unique in its file.

| # | File | Anchor matched on | Where the badge sits |
|---|---|---|---|
| 1 | `HomePage.jsx` | `{post.user?.name || 'User'}` | inside the `<h4>`, after the name. One `PostCard` serves both the community and the friends tab |
| 2 | `HomePage.jsx` | `<span className="font-bold text-on-surface text-xs">{c.user?.name}` | inside the comment-author span, before its existing trailing space |
| 3 | `HomePage.jsx` | `<p className="text-sm font-bold text-on-surface">{u.name}` | inside the sidebar search-result `<p>` |
| 4 | `HomePage.jsx` | `text-sm font-medium text-on-surface group-hover:text-primary transition-colors` | inside the following-list `<span>`, on the **line after** the anchor |
| 5 | `UserProfilePage.jsx` | `<h1 className="font-serif text-3xl md:text-4xl font-bold text-primary">{profile.name}` | inside the `<h1>` |
| 6 | `GroupDetailPage.jsx` | `className="font-bold text-sm text-on-surface hover:text-primary transition-colors">{post.user?.name}` | inside the author `<button>` |
| 7 | `GroupDetailPage.jsx` | `<p className="text-sm font-bold text-on-surface truncate">{m.name}</p>` | **sibling** of the `<p>`, beside the Curator pill |

Site 7 is the one that is not inside the name element. That `<p>` carries `truncate`
(`overflow-hidden`, `whitespace-nowrap`), so a pill inside it would be clipped away by a long name.
It goes in the flex row instead, exactly where the Curator pill lives. Consequence, noted rather
than hidden: at that one site the pill sits `gap-1.5 + ml-1.5` from the name instead of `ml-1.5`.
A bot can never appear in a circle's member list (R-05), so this is defence in depth and 6 px of
cosmetics on a row nobody will see.

### The site that was deliberately dropped

**`HomePage.jsx:704` — the "friends are reading" strip — is not badged.**

`architecture.md:113` lists it as a P3 badge site. Spec R-03 does not, and neither does the test
plan (`tests.md` K-05). The strip is fed by `/userbooks/friends/currently-reading`, which is **not**
one of R-02's endpoints, so `item.user.is_bot` is `undefined` there and will stay `undefined`. A
`<BotBadge user={item.user} />` at that site would render `null` for ever and any case asserting it
would be structurally vacuous — a Critical-looking test that tests nothing.

It is not merely omitted: `W-04` carries a tripwire (`DROPPED_SITE`) that fails if anyone badges it,
and asserts `HomePage.jsx` holds exactly **4** badges. Proved by MUT-4F-55e below.

**`architecture.md:113` is still wrong on this branch** and should be corrected by the Architect.

## R-16, the admin half

- **`GET /admin/users` → a Bot column.** New `'Bot'` header between `Admin` and `Joined`; the cell
  renders the same pill markup as the adjacent Admin cell, with an em dash for a reader. It does
  **not** use `<BotBadge />`, deliberately: a table column must show something for a reader, and
  `BotBadge` by contract shows nothing. Keeping it inline also keeps `W-04`'s "exactly N badges"
  counts meaningful.
- **The overview labels the reader figures as readers.** `Total Users → Total Readers`,
  `New This Week → New Readers This Week`, `New This Month → New Readers This Month`,
  `Notes → Reader Notes`, and the section heading `Users → Readers`. Two new cards sit beside them,
  `Bot Accounts` (`stats.bot_users`) and `Bot Notes` (`stats.bot_notes`), each labelled as the
  excluded figure. Until P2 ships those two fields, `StatCard` renders `—` for them, which is the
  existing behaviour for a missing stat and needs no guard.
- **The trigger control is gone**: the `Editorial Bot` section, `handleBotTrigger`, the
  `botLoading` / `botResult` state, the `triggerBot` import, and `triggerBot()` in `api.js`.
  `grep -rn "bot/trigger\|triggerBot\|editorial_bot" book-tracker-frontend-stitch/src/` → no output
  (ST-4F-04's web half). The replacement comment in `api.js` is worded to avoid those three tokens
  so it cannot itself break that grep.

## Mutation-proof table (G-4F-09)

Procedure per row: run green, apply the one-line change, run only the named test, paste the first
red line, `git checkout -- <file>`, confirm green. Every row bit.

| MUT-4F | File | One-line change | Test | Observed first red line | Caught | Restored |
|---|---|---|---|---|---|---|
| **55** | `HomePage.jsx` | remove `<BotBadge user={post.user} />` from the feed-post header | W-04 | `AssertionError [ERR_ASSERTION]` `expected: 7  actual: 6` — `6 of 7 R-03 sites carry <BotBadge; missing: home:feed-post-header` | yes | yes |
| **55** | " | " | L-4F-01 | `FAIL L-4F-01 a bot post is badged in the community feed — expected exactly one BOT pill on the bot's card, found 0` | yes | yes |
| **56** | `BotBadge.jsx` | replace the pill classes with `text-[10px] font-black … bg-red-600 rounded-md` | W-05 | `BotBadge.jsx does not contain the Curator pill classes byte-for-byte.` | yes | yes |
| **57** | `BotBadge.jsx` | delete the `if (!user?.is_bot) return null` line (render unconditionally) | W-06 | ``BotBadge.jsx has no `if (!user?.is_bot) return null` guard`` | yes | yes |
| **57** | " | " | L-4F-02 | `FAIL L-4F-02 … — the reader's card carries 1 BOT pill(s)` | yes | yes |
| **58** | `src/services/api.js` | paste `export const triggerBot = () => apiFetch('/admin/bot/trigger', …)` back | W-07 | `src/services/api.js still exports triggerBot (1)` | yes | yes |
| **59** | `BotBadge.jsx` | `if (!(user?.is_bot ?? true)) return null` | L-4F-04 | `FAIL L-4F-04 … — a BOT pill rendered for a user object that has no is_bot key` | yes | yes |
| **59** | " | " | W-06 | ``BotBadge.jsx has no `if (!user?.is_bot) return null` guard`` — see the note below | yes | yes |
| **60** | `HomePage.jsx` | render `{post.text?.split(…).slice(0, -1).join(…)}` (trim the post's last line) | L-4F-05 | `FAIL L-4F-05 … — the bot's card does not contain "— automated post from @TMRBot" — the card reads: "…This week's bestsellers, in brief.\n\nfavorite…"` | yes | yes |

Four rows the plan does not name, added because the brief calls this package's specific trap out and
a walker that cannot fail is the whole risk. **A split is a finding, not bookkeeping** (§10).

| MUT-4F | File | One-line change | Test | Observed first red line | Caught | Restored |
|---|---|---|---|---|---|---|
| **55b** | `qa/unit/botBadge.test.mjs` | make `stripBadges` a no-op, so the synthetic copy still has every badge | W-04 | `the detector reported 7 badges on a copy with every <BotBadge /> removed — it cannot fail, so its pass means nothing` | yes | yes |
| **55c** | `HomePage.jsx` | remove the badge from the following-list site — the one whose badge is **one line below** its anchor | W-04 | `6 of 7 R-03 sites carry <BotBadge; missing: home:sidebar-following-list` | yes | yes |
| **55d** | `HomePage.jsx` | drop `transition-colors` from the following-list span, so site 4's anchor no longer matches | W-04 | `home:sidebar-following-list: anchor matched 0 lines, expected exactly 1 — the anchor is stale, fix it rather than the count` | yes | yes |
| **55e** | `HomePage.jsx` | badge the dropped K-05 site (`{item.user?.name}`) | W-04 | `HomePage.jsx:704 (/userbooks/friends/currently-reading) was badged — that endpoint carries no is_bot (K-05), so the badge can only ever render null there` | yes | yes |

**Proof the walker can fail** (the trap in the brief): three independent ones, all red above.
MUT-4F-55b makes the in-test synthetic zero-badge copy stop being zero-badge and the test says so in
those words. MUT-4F-55d proves a *stale anchor* is a loud failure and not a silent skip — the thing
that would otherwise turn a 7-site walk into a 0-site walk that passes. And the walker asserts
`found === 7` against a literal **before** any per-site assertion, which is what makes 55 and 55c
name the missing site rather than just failing.

### One mutation that bit for a different reason than the plan expects

**MUT-4F-59** (`user?.is_bot ?? true`). The plan lists it against L-4F-04 only, and there it bit
exactly as written. W-06 also went red, but on its *guard-shape* assertion
(``has no `if (!user?.is_bot) return null` guard``) rather than on its `?? true` assertion, because
the guard regex is checked first and `if (!(user?.is_bot ?? true))` does not match it. Both are red,
so the mutation is caught twice over; recorded because the red line is not the one a reader of the
plan would predict.

### Nothing was found that failed to bite

Every mutation listed for P3 went red on the named test. No row is reported as uncaught.

## Test totals

| Command | Before | After |
|---|---|---|
| `node --test "qa/unit/*.test.mjs"` | `# tests 34`, `# pass 34`, `# fail 0` | **`# tests 38`, `# pass 38`, `# fail 0`, `# skipped 0`** |
| `node qa/web_4f_local.mjs --mock --web http://127.0.0.1:5178` | — | **`4F web local: 5 passed, 0 failed`** (exit 0) |

K-03's trap was live in this worktree: before `npm ci --prefix qa`, the same command reported
`# tests 29, # pass 28, # fail 1` — five assertions simply absent from the count, with
`pagePerfWaterfall.test.mjs` failing to load on a missing `playwright`. Both numbers above were
taken **after** `npm ci --prefix qa` in the worktree, and the collected total is what was compared,
not the pass/fail line.

## Build and lint (ST-4F-06 / G-4F-05)

- `npm --prefix book-tracker-frontend-stitch run build` → **exit 0**, `✓ built in 12.34s`,
  `dist/assets/index-*.js 772.17 kB`. The pre-existing chunk-size warning is unchanged.
- `npx eslint src/components/BotBadge.jsx src/pages/{HomePage,UserProfilePage,GroupDetailPage,AdminPage}.jsx src/services/api.js`
  → **`BotBadge.jsx`: 0 errors, 0 warnings.** Every other file's counts are **identical** to the same
  files at `HEAD~1`, measured by linting the pristine `git show HEAD:…` copies of all five and
  comparing per file: AdminPage 3/0, GroupDetailPage 5/1, HomePage 6/0, UserProfilePage 1/1,
  api.js 0/0, before and after. No new problem.

## `qa/web_4f_local.mjs` — why it has two fixture sources

The plan's §4.2 shape needs a local backend whose `/notes/feed` carries `is_bot`. **Package P2 is
not merged**, so on this branch no local API can produce a badged post at all, and the harness as
specified can only ever exit 6. That would have left R-03's central claims — the pill paints, a
reader's card gains no height, a missing `is_bot` does not crash the page — proved by a source scan
and nothing else.

So the file keeps the plan's `--api` mode verbatim (exit 5 on a production host, exit 6 with each
missing precondition named, including *"the local API's GET /notes/feed does not carry is_bot — run
P2 first, or apply the two SQLite ALTERs"*), and adds `--mock`: the same five case bodies, with every
request to the API origin served by `page.route` from a fixture holding one bot-authored post and one
reader-authored post. It needs only the web dev server. Verified on this branch:

- `--mock` → `4F web local: 5 passed, 0 failed`, exit 0
- `--api` with no backend → exit **6**, `REVIEW_LOGIN_SECRET not set …`
- `--mock --web https://www.trackmyread.com` → exit **5**, refuses the production host

The API mode additionally requires the local feed to already hold one bot post and one reader post,
and says so by name if it does not — a bot account cannot be created through the API (R-05, R-08), so
it has to be flagged in the local SQLite DB by hand. **QA should run `--api` once after P2 merges**;
that is the mode G-4F-08 gates on.

## Findings

1. **`architecture.md:113` still lists `HomePage.jsx:704` as a badge site.** K-05 called this out on
   2026-09-23 and it is uncorrected at `e75d49e`. Dropped here, with a tripwire. **Architect to fix.**
2. **Spec R-03's line numbers are right for six sites and off for one.** `HomePage.jsx:655` is the
   `{following.slice(0, 5).map(u => (` line; the name it refers to is rendered at `:663-665`, ten
   lines further down. The plan's W-04 wording — *"the source line or one of the two lines after it
   contains `<BotBadge`"* — is therefore unsatisfiable for that site as a line-number rule. It is
   satisfiable, and is satisfied, as the **content-anchor** rule the same row goes on to require. No
   change needed to the product; the plan's two phrasings of W-04 disagree and the anchor one is the
   one that works. The other six line numbers (`175`, `291`, `641`, `386`, `111`, `965`) were all
   confirmed exact on this branch.
3. **`spec.md` R-02's two mislabelled sites (K-04) are still uncorrected** at `e75d49e`, as the plan
   predicted. It does not affect P3 — no web file reads R-02's labels — but it is still open.
4. **The plan's §4.1 header calls `qa/web_4f_local.mjs` "QA-owned"** while this package's brief
   assigns it to P3. Built here. If QA intended to own it, the `--api` half is the part to review.
5. `qa/node_modules` and `book-tracker-frontend-stitch/node_modules` were both absent in a fresh
   worktree; `npm ci --prefix qa`, `npm ci` in the frontend and `npx playwright install chromium`
   are all needed before any of the above can be reproduced.
