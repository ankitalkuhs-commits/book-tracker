---
screen: sprint-4f-activity-engine
feature: community
package: P4 — Android
branch: builder-4f-p4
base: e75d49e (P1 merged at a9d4a0c)
built: 2026-09-23
---

# Build notes — Sprint 4F, package P4 (the Android badge)

Spec R-04; architecture §"P4 — Android" and §"Where the badge is drawn"; tests.md §5
(A-01, A-01a, A-02..A-06) as the acceptance contract.

There is no device and no emulator in this environment, so every case is an AST
assertion over the committed source. The behavioural half stays D-4F-01/02 in tests.md §8.

---

## 1. The badged sites

Six sites, exactly spec R-04's list. Every one is located in the test by **content** —
the style key on the `<Text>` that prints the name, plus a literal for the emotion
sentence — never by line number, so a refactor moves a site rather than voiding the case.
Line numbers below are where they landed on this branch, for reading only.

| # | File | Anchor matched on | Line (after) | How the badge sits beside the name |
|---|---|---|---|---|
| 1 | `src/screens/FeedScreen.js` | `<Text style={styles.userName}>` (feed-post name) | 663 | **new** `styles.userNameRow` View wraps the name + badge |
| 2 | `src/screens/FeedScreen.js` | `<Text style={styles.emotionLineText}>` containing `is feeling` | 702-703 | badge is a sibling inside `styles.emotionLine`, which becomes a wrapping row |
| 3 | `src/screens/FeedScreen.js` | `<Text style={styles.commentName}>` (comment row) | 758 | **new** `styles.userNameRow` View wraps the name + badge |
| 4 | `src/screens/FeedScreen.js` | `<Text style={styles.userNameText}>` (user-search row) | 595 | already a `styles.userNameRow`; badge added before the Mutual / Follows-you pills |
| 5 | `src/screens/GroupDetailScreen.js` | `<Text style={styles.postAuthor}>` (group post author) | 726 | **new** `styles.postAuthorRow` View inside `postMeta` |
| 6 | `src/screens/UserProfileScreen.js` | `<Text style={styles.userName}>` (profile display name) | 305 | **new** `styles.userNameRow` View in the hero |

Each anchor is asserted to be found **exactly once** per file before anything is said
about a badge, and the badged count is compared to the literal `6` before the per-site
messages are produced (tests.md non-vacuity rules 2 and 4).

### The component

`src/components/BotBadge.js` (new). It is the **Mutual / Follows-you pill**, not a new
visual element:

- The two style objects that pill is made of (`userBadge`, `userBadgeText`, the values
  that were at `FeedScreen.js:1055-1057`) now live in `BotBadge.js` as plain exported
  objects, and `FeedScreen.js`'s `StyleSheet.create` keeps its `userBadge` /
  `userBadgeText` **keys** by pointing at them. So the app holds exactly one definition
  of the pill, the Mutual pill and the BOT pill cannot drift apart, and `BotBadge.js`
  declares **no `StyleSheet` of its own** (A-03).
- It returns `null` when `isBot` is falsy, so all six call sites are unconditional and a
  reader's card gains no extra whitespace (spec R-04).
- Label text is the literal `BOT`, matching web R-03 and matching the existing `Mutual`
  literal beside it (neither goes through i18n).

### The `userNameRow` change (A-01a)

The architecture's claim was verified in the source and is correct: the feed card wrapped
its name in a bare `<View style={{ flex: 1 }}>` (`FeedScreen.js:654-662` on master), with
the name `Text` and the timestamp `Text` stacked directly inside it and nothing able to
sit beside the name. It now contains a `styles.userNameRow` View — the same style the
user-search row at `:593` already used — holding the name and the badge. `styles.userName`
gained `marginRight: 6` to match `styles.userNameText`, which is how that row already
spaces a name from a pill. A-01a asserts the row style is declared exactly once, is
referenced at least twice, is the name's direct parent, holds the badge as a sibling, and
is still inside the post header's `<View style={{ flex: 1 }}>`.

Two small style edits were needed for the other rows and are recorded here so they are not
mistaken for drift: `styles.emotionLine` becomes a wrapping row (`flexDirection: 'row',
alignItems: 'center', flexWrap: 'wrap'`) with `flexShrink: 1` / `marginRight: 6` on
`emotionLineText`, so the badge can sit after the sentence and the sentence still wraps;
and `styles.commentName` gained `marginRight: 6`.

### `GroupDetailScreen.js`'s local `Avatar` (A-04)

Also verified: `Avatar` at `:42-49` takes a `name` **string**, not a user object. It gains
`isBot` rather than being rewritten, and the post-header call passes `post.user?.is_bot`.
See finding **F-3** below — A-01 and A-04 want the badge in two different places, so
`isBot` is used to tint the avatar circle with the pill's own `tertiaryContainer` rather
than to render a second copy of the badge.

### Version bump

`book-tracker-mobile-stitch/app.json`: `expo.version` `2.2.3` → **2.2.4**,
`expo.android.versionCode` `62` → **63**.
`node scripts/check-version-bump.js --strict` exits 0 and prints `versionCode=63`.
`release/last-released.json` is untouched (still 2.2.1 / 60 — that file moves on release).

**No EAS build was triggered.**

---

## 2. Test totals

| Run | `# tests` | `# pass` | `# fail` | `# skipped` |
|---|---:|---:|---:|---:|
| Before (branch HEAD `e75d49e`, after `npm ci` in the worktree) | 113 | 112 | 1 | 0 |
| After P4 | **120** | **119** | **1** | 0 |

Command, from `book-tracker-mobile-stitch/`: `node --test "__tests__/*.test.mjs"`.

The rise is exactly **+7**, which is the number of cases P4 adds (A-01, A-01a, A-02, A-03,
A-04, A-05, A-06) — so no file failed to load and no assertions vanished behind a
single `fail 1`.

The **one remaining failure is pre-existing and is not P4's**:
`workflows.test.mjs::build_android_yml_absent` (tests.md K-02), owned by package P5.
It is the same failure the baseline run shows. See finding F-1.

---

## 3. Mutation-proof table (G-4F-09)

Each row: apply the one-line change, run only the named test by name pattern, record the
first failing assertion, `git checkout -- <file>`, re-run, confirm green. Every row was
restored and the working tree is clean.

| MUT-4F | File | One-line change | Test | Observed first red line | Caught | Restored |
|---|---|---|---|---|---|---|
| 61 | `src/screens/FeedScreen.js` | delete `<BotBadge isBot={user.is_bot} />` from the user-search row | `botBadge.test.mjs::badge_present_at_every_r04_site` | `unbadged R-04 site(s): FeedScreen user-search row` / `5 !== 6` | yes | yes |
| 62 | `src/screens/FeedScreen.js` | move the feed-card badge out of the `userNameRow`, next to it | `::feed_card_name_is_wrapped_in_a_userNameRow` | `the badge is not a sibling of the feed-card name inside the userNameRow` / `0 !== 1` | yes | yes |
| 62 (also) | — | the same edit | `::badge_present_at_every_r04_site` | `unbadged R-04 site(s): FeedScreen feed-post name` / `5 !== 6` | yes | yes |
| 63 | `src/screens/FeedScreen.js` | render `{post.text.replace(LABEL_RE, '')}` instead of `{post.text}` | `::post_text_is_rendered_verbatim` | `expected 3 verbatim note-text render sites, found 2 (FeedScreen.js=0, GroupDetailScreen.js=1, UserProfileScreen.js=1)` / `2 !== 3` | yes | yes |
| **63b** (split) | `src/screens/FeedScreen.js` | add `const cleanText = trimTrailingLine(post.text);`, leave the render verbatim | `::post_text_is_rendered_verbatim` | `src/screens/FeedScreen.js transforms a note's text: trimTrailingLine(post.text)` / `1 !== 0` | yes | yes |
| 64 | `src/components/BotBadge.js` | add a `StyleSheet.create({ pill: { backgroundColor: '#7e4924', … } })` | `::badge_reuses_the_existing_pill_styles` | `BotBadge.js must not declare a StyleSheet of its own — it reuses the Mutual pill` / `1 !== 0` | yes | yes |
| 65 | `src/screens/GroupDetailScreen.js` | `function Avatar({ name, size = 40 })` — drop `isBot` | `::group_avatar_takes_an_isBot_prop` | `Avatar's param list is ["name","size"]` / deep-equal diff missing `'isBot'` | yes | yes |
| 66 | `app.json` | leave `2.2.3` / `62` | `::app_json_is_2_2_4_63` | `'2.2.3' !== '2.2.4'` | yes | yes |
| 66 (also) | `app.json` | the same edit | `::versionGuard_and_apiContract_still_green` | `The input did not match the regular expression /versionCode=63/` | yes | yes |
| 67 | `src/screens/UserProfileScreen.js` | `import BotBadge from '../components/BotBadgeX'` | `apiContract.test.mjs::named_imports_resolve_to_real_exports` | `src/screens/UserProfileScreen.js: cannot resolve import '../components/BotBadgeX'` | yes | yes |
| 67 (also) | — | the same edit | `botBadge.test.mjs::versionGuard_and_apiContract_still_green` | `the set of screens importing BotBadge changed` / deep-equal diff missing `UserProfileScreen.js` | yes | yes |
| **67b** (split) | `src/screens/UserProfileScreen.js` | `import BotBadge from '../components/missing/BotBadge'` — same module name, absent path | `::versionGuard_and_apiContract_still_green` | `src/screens/UserProfileScreen.js: cannot resolve import '../components/missing/BotBadge'` | yes | yes |

**Every mutation bit.** None was replaced or invented around.

Two rows are recorded as splits, per tests.md §10 ("where a Builder finds that a listed
mutation splits into two genuinely different product changes, both are recorded"):

- **63 / 63b.** A-02 makes two separate claims: that the three note-text render sites are
  verbatim, and that nothing in those three screens reshapes a note's text at all. A
  mutation inside the `<Text>` only exercises the first; 63b exercises the second, and it
  is 63b that produces the plan's predicted `1 !== 0`.
- **67 / 67b.** My A-06 matches `from '<...>/BotBadge'`, so renaming the *module* (67)
  is caught by the importer-set assertion rather than by the resolution assertion. 67b
  keeps the module name and breaks the path, which is what exercises the resolution half.
  The precise message MUT-4F-67 predicts comes from the **existing**
  `apiContract.test.mjs::named_imports_resolve_to_real_exports`, which catches both.

### Proof the detectors can fail

Built into the cases themselves, not run once by hand (tests.md non-vacuity rule 3), so it
re-runs on every CI run:

- `badge_present_at_every_r04_site` runs the anchor/badge walker over two synthetic
  sources before it touches the real files: one with `<Text style={styles.userName}>` +
  `<BotBadge>` (must report anchor 1, badge 1) and one identical but with the badge
  removed (must report anchor 1, badge **0**).
- `post_text_is_rendered_verbatim` runs both detectors over four synthetic snippets:
  `<Text>{post.text}</Text>` → verbatim 1 / transforms 0, and
  `<Text>{post.text.replace(/—.*$/, '')}</Text>` → verbatim **0** / transforms **1**.

If any of those synthetic expectations stopped holding, the test fails at the top, before
it can report anything reassuring about the real source.

---

## 4. Findings — things in the plan or the brief that are wrong

**F-1 — the Android baseline is 113 / 112 / 1 on this branch, not 120 / 120 / 0.**
The orchestration brief for this package says the suite "currently runs 120 tests, all
passing (a workflow test that had been red was fixed earlier today)". It does not, here.
The fix exists — commit `702e485` *"test(mobile): scope the build-workflow listing check
to build-\* files"* — but it lives on branch `fix/workflows-test-listing` and is **not an
ancestor of `builder-4f-p4`** (`git merge-base --is-ancestor 702e485 HEAD` → false).
So the measured baseline is tests.md's own K-02 number, 113 / 112 / 1, and
`workflows.test.mjs::build_android_yml_absent` is still red after P4. P4 did not touch it
(tests.md assigns it to P5 as case C-20). **Whoever merges must either merge
`fix/workflows-test-listing` or let P5's C-20 land, or G-4F-07 cannot reach
`# fail 0`.**

**F-2 — tests.md §5 misses an existing test that the version bump breaks.**
`__tests__/localDate.test.mjs::app_json_is_2_2_3_62` (4C case M-12) pins
`expo.version === '2.2.3'` and `versionCode === 62` as literals. Bumping to 2.2.4 / 63 —
which P4 is required to do — turns it red. tests.md's §1 summary lists only
`workflows.test.mjs::build_android_yml_absent` under P4's "changed existing", and the P4
section names no such case, so this is an unrecorded collision. It is exactly the defect
tests.md already records as **K-01a** for `REQUIRED_COLUMNS`: a literal that means "no
sprint after this one may ever bump the version".

Resolved the same way K-01a was: the case is rescoped to a **floor** — `versionCode >= 62`
and `version >= 2.2.3`, with the reason in a comment — and renamed
`app_json_not_behind_the_4c_release`, so no future sprint has to edit it again. The exact
current numbers are pinned once, by the sprint that sets them (P4's A-05). Test count is
unchanged by the rename (120 = 113 + 7).

This file is **outside P4's stated ownership**, and no other 4F package owns it. Flagging
it rather than leaving it silently: if the Orchestrator would rather P4 had left it red and
handed the edit to Doc Sync or to P5, revert that hunk — it is self-contained.

**F-3 — architecture §"Where the badge is drawn" and tests.md A-01 disagree about
`GroupDetailScreen`, and the disagreement cannot be satisfied without duplicating the
badge.**
The architecture says the local `Avatar` "is the single best insertion point for that
screen" and "gains an `isBot` prop". tests.md **A-01** requires a `BotBadge` element in the
**same JSX parent as the `Text` that prints the name**, anchored on `styles.postAuthor` —
which is inside `styles.postMeta`, a sibling of the `Avatar`, not inside it. tests.md
**A-04** separately requires `Avatar` to take `isBot` and the call to pass it.

Rendering the badge inside `Avatar` fails A-01; rendering it in both places puts two BOT
pills in one post header. tests.md is the acceptance contract, so the badge went beside
`styles.postAuthor`, and `Avatar`'s `isBot` was given a real, non-duplicative job: it tints
the circle with `colors.tertiaryContainer`, the pill's own colour, via one new style key
(`avatarBot`). That is the smallest use that is not dead code. **If the Architect intended
the avatar to carry the badge itself, A-01's GroupDetailScreen anchor needs changing and
this tint should be removed** — say so and it is a two-line revert.

**F-4 — the plan's line numbers are right; one in the architecture is off by one
(harmless).** Verified in the source on this branch, before any edit. Architecture P4
cites the group-post `<Avatar>` call at `:722`; it is at `:721`. Everything else was
exact: `FeedScreen.js` `:593` (the search row's `userNameRow`; the name `Text` is the
next line), `:660`, `:697` (the emotion `<Text>`'s opening tag; `{userName}` is on
`:698`), `:705`, `:751`, `:1053`, `:1055-1057`; `GroupDetailScreen.js` `Avatar` at
`:42-49` and `postAuthor` at `:724`; `UserProfileScreen.js` `:303`. No case depends on a
line number: every anchor is matched on content.

**F-5 — A-02's "three `post.text` render sites" includes one that is `note.text`.**
The third site is `UserProfileScreen.js:537`,
`<Text style={styles.noteText} numberOfLines={6}>{note.text}</Text>` — the variable is
`note`, not `post`. The detector accepts either identifier, which is what makes the count
come to 3. Worth writing down because a literal reading of "`post.text`" gives 2 and would
look like a missing site.

---

## 5. What P4 did not touch

- `src/services/api.js` — untouched. No base-URL change, nothing else.
- `__tests__/workflows.test.mjs` — untouched (P5 / C-20).
- `release/last-released.json` — untouched.
- No EAS build was triggered; nothing was pushed.
