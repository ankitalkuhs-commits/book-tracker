---
screen: sprint-4f-activity-engine
feature: community
package: P5 — the bot package, its CI, and the test-count gate
built_by: Builder (branch `builder-4f-p5x`)
built: 2026-09-23
requirements: R-05a, R-07, R-09, R-10, R-11, R-12, R-14, R-15
---

# Build notes — Sprint 4F, Package P5

## What was built

| File | Change |
|---|---|
| `bots/__init__.py` | **new.** The package docstring is the statement of the constraint: no ORM, no driver, no engine, no connection string, anywhere in here |
| `bots/common.py` | **new.** `LABEL_TEMPLATE` (the one R-05a literal), `append_label`, `login`, `posted_keys`, `get_json`, `post_note`, `load_pool`, `first_unused`, `run_guarded`. One HTTP seam, `_request`, which every test double replaces |
| `bots/bestsellers.py` | **new.** `@TMRBot` — the NYT list rotation, the Open Library → Google Books → NYT cover chain and the Gemini teaser with its description fallback, lifted from `editorial_bot.py` minus its engine and its raw INSERT |
| `bots/prompts.py` | **new.** `@TMRPrompts`, `NO_REPEAT_DAYS = 60`. `post_prompt()` is also the Thursday fallback path |
| `bots/quotes.py` | **new.** `@TMRQuotes`, `NO_REPEAT_DAYS = 180`, `PUBLIC_DOMAIN_YEAR_CEILING = 1928` |
| `bots/circles.py` | **new.** `@TMRCircles`, `MIN_READERS = 3`, `MIN_CIRCLES = 2`; below the floor it calls `prompts.post_prompt()` |
| `bots/content/prompts.json` | **new.** **44** prompts, each with a question mark and a call to action naming a post |
| `bots/content/quotes.json` | **new.** **38** quotes, every one from a work published 1928 or earlier, each with `author`, `work`, `year` |
| `.github/workflows/tmr-bots.yml` | **new.** Seven crons, `workflow_dispatch`, 0–25 min jitter, `BOT_ENABLED` as **step 0** |
| `.github/workflows/ci-tests.yml` | **new.** pytest + `qa/unit` + the Android `__tests__` on every push and pull request, each with a pinned test-count **floor** |
| `tests/test_bot_content.py` | **new.** 27 cases (C-01..C-22, incl. C-02a/04a/05a/11a/13a/13b) |
| `book-tracker-mobile-stitch/__tests__/workflows.test.mjs` | C-20: comment updated to name the 4F workflows; **one new case** `only_the_two_build_workflows_build_the_app` |
| `context/deployment/README.md` | The two new backend env vars, the exact secrets and variables the PM must create, both kill switches with their click paths, and the Render cron deletion |
| `features/community/index.md` | `bots/` file map, `bots_router.py`, and the sprint row moved to "P5 built" |

`editorial_bot.py` is **left in the tree, unscheduled and unreferenced by any workflow** — the
architecture says it is deleted only after `bots/bestsellers.py` has posted successfully twice
in production. C-22 pins that in both directions.

### Suite numbers

| Suite | Before (measured on this branch, clean) | After | Delta |
|---|---:|---:|---:|
| `pytest tests -q` | **596 passed**, 0 failed | **623 passed**, 0 failed | +27 |
| `node --test "qa/unit/*.test.mjs"` | **38 / 38 / 0** | **38 / 38 / 0** | 0 |
| `node --test "__tests__/*.test.mjs"` (mobile) | **120 / 120 / 0** | **121 / 121 / 0** | +1 |

All three baselines were re-measured here before any code was written and all three matched
the numbers handed over. 623 − 596 = 27, exactly the number of cases added, so no test file
failed to load. **623 is also G-4F-02's gate number**, reached exactly.

`npm ci --prefix qa` and `npm ci` in `book-tracker-mobile-stitch/` were both run **in this
worktree**; the main checkout was not touched (4C K-10).

---

## The headline proof — `BOT_ENABLED=false` stops the run at its first step

The workflow cannot be dispatched from here (and must not be), so the proof is a replay of
the job that applies GitHub's own rules: a step whose `if` is false is skipped, and a step
that exits non-zero fails the job so every later step is skipped — no step in this workflow
carries `continue-on-error` or `if: always()`. Step 0 is executed for real, in bash, exactly
as written. Every step that would post or reach the network is stubbed.

```
========================================================================
vars.BOT_ENABLED = 'false'
========================================================================
  step 0  RUN                                 Kill switch - BOT_ENABLED is not true
           | BOT_ENABLED is not 'true' (repository variable). Stopping before any post.
           | Set it back to 'true' in Settings > Secrets and variables > Actions > Variables.
           | exit code: 1
  step 1  SKIPPED (the job already failed)  Checkout
  step 2  SKIPPED (the job already failed)  Set up Python
  step 3  SKIPPED (the job already failed)  Install dependencies
  step 4  SKIPPED (the job already failed)  Choose today's content type
  step 5  SKIPPED (the job already failed)  Jitter - sleep 0-25 minutes
  step 6  SKIPPED (the job already failed)  Post
  JOB RESULT: FAILED at the first step

========================================================================
vars.BOT_ENABLED = <unset>
========================================================================
  step 0  RUN                                 Kill switch - BOT_ENABLED is not true
           | BOT_ENABLED is not 'true' (repository variable). Stopping before any post.
           | Set it back to 'true' in Settings > Secrets and variables > Actions > Variables.
           | exit code: 1
  ... every later step SKIPPED ...
  JOB RESULT: FAILED at the first step

========================================================================
vars.BOT_ENABLED = 'true'
========================================================================
  step 0  skipped (if false)                Kill switch - BOT_ENABLED is not true
  step 1  RUN (action, not executed here)   Checkout
  step 2  RUN (action, not executed here)   Set up Python
  step 3  RUN (stubbed: network / posting)  Install dependencies
  step 4  RUN                                 Choose today's content type
           | Content type for this run: bestseller
           | exit code: 0
  step 5  RUN (stubbed: network / posting)  Jitter - sleep 0-25 minutes
  step 6  RUN (stubbed: network / posting)  Post
  JOB RESULT: would post
```

Three things this shows that a status-code test would not:

1. **An unset variable is off, not on.** A repository variable that was never created is the
   empty string in a GitHub expression, so `vars.BOT_ENABLED != 'true'` is true and the run
   stops. Failing closed is the right default for this switch, and it means the bots cannot
   start posting before the PM has deliberately switched them on.
2. **Nothing has happened by then.** The gate is before checkout, before `pip install` and
   before any secret is put into an environment. No token is minted, so nothing to revoke.
3. **The log says why, and says how to undo it** — R-14's "written into the deployment
   documentation with the exact click path" is also printed by the run itself.

**A deliberate choice: the kill switch fails the run rather than skipping it green.** Trade-
off recorded: while `BOT_ENABLED` is `false` the PM gets a failed-run notification seven times
a week. That is the point — a kill switch that leaves a green tick is a kill switch somebody
forgets is on, and a silent skip looks identical to GitHub having dropped the schedule. If the
PM finds the noise worse than the ambiguity, the alternative is a `steps.gate.outputs` flag on
every later step, and C-18 would need re-wording with it.

C-18 pins the structure (step index 0, the `vars.BOT_ENABLED` condition, `!= 'true'`, `exit 1`,
and that it precedes the `python -m bots.` step), and both mutations against it go red.

---

## What the PM must create, and where

Nothing here is optional and nothing here is `DATABASE_URL`.

### GitHub → Settings → Secrets and variables → Actions → **Secrets** tab

| Secret | Value |
|---|---|
| `BOT_LOGIN_SECRET` | a long random string, **identical** to the one set on the Render API service |
| `NYT_API_KEY` | the existing NYT Books key (already held for `editorial_bot.py`) |
| `GEMINI_API_KEY` | the existing Gemini key (already held for `editorial_bot.py`) |

That is the complete list. **`DATABASE_URL` must not appear in it** — not now, not temporarily,
not behind a comment saying it will be removed (E-5/E-7, P-4F-07). C-21 asserts the bot
workflow's own secret set is exactly these three and that no file under `.github/` *uses* a
database connection string.

### GitHub → Settings → Secrets and variables → Actions → **Variables** tab

| Variable | Value |
|---|---|
| `BOT_ENABLED` | `true` to let the bots post. Anything else — including not creating it — stops every run at step 0 |

A variable, not a secret, on purpose: its value is visible on that page, so anyone can see at a
glance whether the bots are on.

### Render → the API service → Environment

| Variable | Value |
|---|---|
| `BOT_LOGIN_SECRET` | the same string as the GitHub secret |
| `BOT_LOGIN_EMAILS` | `tmrbot@trackmyread.com,tmrprompts@trackmyread.com,tmrquotes@trackmyread.com,tmrcircles@trackmyread.com` |

With either unset, `POST /auth/bot-login` is a 404 and no bot can obtain a token.

### Kill-switch click paths (also in `context/deployment/README.md`)

**Lever 1 — `BOT_ENABLED` (no deploy, no restart):**
1. Open the repository on github.com.
2. **Settings** (the repository's tab bar, not your account settings).
3. Left sidebar → **Secrets and variables** → **Actions**.
4. The **Variables** tab, next to *Secrets*.
5. **Edit** on `BOT_ENABLED` → value `false` → **Update variable**.

Effect: the next scheduled run stops at step 1 with the message above. Reverse by setting it
back to `true`.

**Lever 2 — clear `BOT_LOGIN_SECRET` on Render (emergency):** Render dashboard → the API
service → **Environment** → delete `BOT_LOGIN_SECRET` → **Save Changes**. This restarts the
service, which is why it is the second lever and not the first. It revokes every bot's ability
to log in at all and affects no reader.

### Order

Unchanged from P1/P2: `PM_SQL_QUEUE.md` step 6, then step 7, **then** deploy, then the two
Render variables, then `python -m migrations.add_bot_accounts`. `BOT_ENABLED` is set to `true`
only after all of that, and P-4F-01's verification query returns 4 rows.

---

## The CI gap, and what closes it

Three times in one day a whole test file vanished from a run. It kept happening because a file
that fails to *load* is reported as one error while every assertion inside it silently stops
running — and because **the Node suites were not in CI at all**, so nothing but somebody's
laptop was running them.

`.github/workflows/ci-tests.yml` runs all three suites on every push and every pull request,
and **each job fails if the number of tests that ran has dropped**, not merely if a test failed.
That is the assertion this failure mode needs: a file that does not load lowers the count
without failing anything.

The floors are the numbers measured on this branch — pytest **623**, `qa/unit` **38**, Android
**121** — and the file says in a comment, at the top and beside each one, that they are a floor
to be raised and never lowered: adding tests means raising the floor in the same commit, and a
number that needs to go *down* is either a deletion that should be argued for in review or the
bug this workflow exists to catch. Lowering a floor to go green is the exact move it prevents.

No secrets, no `DATABASE_URL`: the pytest suite runs on in-memory SQLite and the Node suites
read source files. Public repositories get unlimited GitHub-hosted minutes, so all three jobs on
every push cost nothing.

**Proof that the guard fires.** The workflow cannot be dispatched from here, so the pytest
job's script was run in bash with the suite replaced by a canned log and a canned exit code —
everything else, including the floor comparison, is the shipped script unchanged:

| Scenario | Step exit | What the log said |
|---|---:|---|
| 623 passed, pytest exit 0 | **0** | `pytest passed: 623 (floor: 623), pytest exit 0` |
| 612 passed + 1 error — **a file failed to load** | **1** | `::error::Only 612 tests passed; the floor is 623.` |
| 623 passed but 2 failed | **1** | `pytest passed: 623 (floor: 623), pytest exit 1` |
| collection error, no summary line at all | **1** | `::error::Could not read a passed-count from the pytest output.` |

Row 2 is the whole point: 612 of 623 is a green-looking run under any ordinary CI setup — one
error, no failing assertions — and it fails here. Rows 3 and 4 are why the step does **not**
use `set -e` with `pipefail`: that would abort before the count was read, and the diagnostic
would be lost. `${PIPESTATUS[0]}` keeps the suite's own exit code and the step ends with it.

One thing worth knowing: `requirements.txt` is the **runtime** list and contains neither
`pytest` nor `pyyaml`, so the pytest job installs those two explicitly. (It is also UTF-16LE
with a BOM; pip's `auto_decode` handles that, but nothing else should assume it is UTF-8.)

---

## Mutation-proof table

Driver: `scratchpad/mut4f_p5.py` — one exact anchored edit (or a file create / delete), one test
run by **full node id** (rule 6), the tree restored byte-for-byte in a `finally`, then re-run to
confirm green. Every row below was restored and re-verified; `git status` is clean of product
changes afterwards.

| MUT-4F | Case | Change to product code | Result | Actual first RED line |
|---|---|---|---|---|
| 68 | C-01 | `common.py`: em dash → hyphen in `LABEL_TEMPLATE` | RED | `E AssertionError: assert '- automated ...rom @{handle}' == '— automated ...rom @{handle}'` |
| 68b | C-01 | `quotes.compose` returns the attribution with no label | RED | `E AssertionError: ('quote', "'Jane Austen — Pride and Prejudice (1813)'")` |
| 69 | C-02 | `append_label` leaves an empty body unlabelled | RED | `E AssertionError: assert False` |
| 69b | C-02 | `append_label` puts the line first instead of last | RED | `E AssertionError: assert False` |
| 70 | C-02a | `LABEL_TEMPLATE = os.environ.get("TMR_LABEL", …)` | RED | `E AssertionError: LABEL_TEMPLATE must be one module-level string literal` |
| 71 | C-03 | drop `"is_public": True` from the `POST /notes/` body | RED | `E AssertionError: bestseller:9780000000001` |
| 72 | C-04 | `quotes` files its key under `prompt:` | RED | `E AssertionError: assert ['bestseller'...pt', 'prompt'] == ['bestseller'...mpt', 'quote']` |
| 72b | C-04 | drop `dedup_key` from the `POST /notes/` body | RED | `E AssertionError: {'image_url': 'https://example.com/9780000000001.jpg', 'is_public': True, 'text': 'A Book by An Author` |
| 73 | C-04a | add `from sqlalchemy import create_engine` to `common.py` | RED | `E AssertionError: assert ['bots\\commo...: sqlalchemy'] == []` |
| 74 | C-05 | a three-attempt retry loop around `post_note` | RED | `E AssertionError: (429, [{'dedup_key': 'prompt:1', 'is_public': True, …}, …])` — three bodies, not one |
| 75 | C-05a | generate the teaser **inside** the candidate loop | RED | `E AssertionError: {'n': 16}` |
| 76 | C-12 | log the response body beside the status | RED | `E AssertionError: SEKRIT-BODY` |
| 76b | C-12 | log the token after a successful login | RED | `E AssertionError: SEKRIT-TOKEN` |
| 77 | C-06 | remove the `except` around the teaser call | RED | `E RuntimeError: gemini is down` |
| 78 | C-07 | substitute placeholder book data when NYT fails | RED | `E AssertionError: assert [{'dedup_key'...rom @TMRBot'}] == []` |
| 79 | C-08 | choose a prompt without the `GET /bots/posted` answer | RED | `E AssertionError: assert ['prompt:1', 'quote:2'] == ['prompt:2', 'quote:2']` |
| 80 | C-09 | `bestsellers` ignores `GET /bots/posted` | RED | `E AssertionError: assert ['bestseller:9780000000009'] == ['bestseller:9780000000010']` |
| 81 | C-10 | the roundup names the top circle's creator | RED | `E AssertionError: Priya` |
| 82 | C-11 | `MIN_READERS = 1`, `MIN_CIRCLES = 1` | RED | `E AssertionError: circles:2026-W39` |
| 83 | C-11a | the fallback prompt skips the 60-day window | RED | `E AssertionError: assert ['prompt:1'] == ['prompt:2']` |
| 84 | C-13 | the prompt pool sliced to 20 | RED | `E AssertionError: the prompt pool holds 20; a 60-day no-repeat window across 3 slots a week needs at least 28` |
| **84a** | C-13 | **tests.md's own second form** — make Wednesday a fourth prompt slot | **GREEN — does not bite** | — (Finding 3) |
| 84b | C-13 | Mon/Wed/Fri become prompt slots (six slots a week) | RED | `E AssertionError: the prompt pool holds 44; a 60-day no-repeat window across 6 slots a week needs at least 55` |
| 85 | C-13a | `prompts.NO_REPEAT_DAYS = 7` | RED | `E assert 7 == 60` |
| 86 | C-13b | the prompt pool sliced to 39 | RED | `E assert 39 >= 40` |
| 87 | C-14 | duplicate a prompt id (44 → 43) | RED | `E assert 43 == 44` |
| 88 | C-15 | one quote's `year` becomes 1998 | RED | `E AssertionError: (38, 1998)` |
| 89 | C-16 | a prompt loses its question mark | RED | `E AssertionError: 1` |
| 90 | C-17 | duplicate a cron (Sunday becomes a second Saturday) | RED | `E AssertionError: ['30 05 * * 6', '30 05 * * 6', '30 13 * * 1', …]` |
| 90b | C-17 | drop the Sunday cron | RED | `E AssertionError: ['30 13 * * 1', '30 13 * * 2', '30 13 * * 3', '30 13 * * 4', '30 13 * * 5', '30 05 * * 6']` (six) |
| 91 | C-18 | move the gate below `Checkout` | RED | `E assert 'vars.BOT_ENABLED' in ''` |
| 91b | C-18 | delete the `if:` from step 0 | RED | `E assert 'vars.BOT_ENABLED' in ''` |
| 92 | C-19 | remove the jitter step | RED | `E AssertionError: no 0-25 minute jitter step` |
| 93 | C-21 | add `DATABASE_URL: ${{ secrets.DATABASE_URL }}` to the bot workflow | RED | `E AssertionError: ['DATABASE_URL']` |
| 94 | C-22 | delete `editorial_bot.py` in this sprint | RED | `E AssertionError: assert False is True` |
| 94b | C-22 | an executable `editorial_bot` reference back in `app/` | RED | `E AssertionError: ['app\\routers\\admin_router.py']` |
| 95 | C-20 | add an unlisted `build-*.yml` workflow | RED | `not ok 6 - build_android_yml_absent` … `actual: 0: 'build-extra.yml' 1: 'build-stitch-aab.yml' 2: 'build-stitch-apk.yml'` |
| 95b | C-20 | give `tmr-bots.yml` an `eas build` step | RED | `not ok 7 - only_the_two_build_workflows_build_the_app` … `+ ['tmr-bots.yml'] - []` |

**One mutation did not bite** — MUT-4F-84a, and it is reported rather than replaced silently.
See Finding 3. Everything else went red on the first attempt.

A driver bug worth recording for whoever writes the next one: the first version captured the
original file content **per edit**, so a spec with two edits to the same file restored the
*intermediate* state and quietly left the product mutated. It was caught by the "re-run after
restore" step (`restored, re-run exit: 1 -> STILL RED`), which is the reason that step exists.
Fixed with `originals.setdefault(path, data)`; MUT-4F-81, 82 and 83 were re-run afterwards and
the rows above are from the re-run.

---

## Findings — things in the spec, architecture or test plan that are wrong or unbuildable

### Finding 1 (Major) — ST-4F-01 and C-21's "`DATABASE_URL` appears nowhere in `.github/**`" cannot be satisfied, and should not be

Two reasons, both on this branch:

- **It already fails, for a pre-existing reason.** `.github/copilot-instructions.md:23` reads
  "**Prod**: PostgreSQL via `DATABASE_URL` env var". That file predates 4F and has nothing to
  do with the bots. `grep -rn "DATABASE_URL" .github/` has therefore never been empty.
- **The rule forbids documenting itself.** The single most important sentence in
  `tmr-bots.yml` is the one saying `DATABASE_URL` must never be added to it. A grep-for-the-
  token rule deletes that sentence, which is the opposite of what E-5/E-7 want.

**What C-21 asserts instead:** no *use* of a connection string anywhere under `.github/**` —
defined as a `secrets.`/`vars.`/`env.` reference, a YAML mapping key, or a shell assignment —
plus the exact-secret-set assertion, plus a synthetic positive proving the detector fires. Prose
forbidding one is allowed and the test says so in a comment. MUT-4F-93 adds a real
`secrets.DATABASE_URL` and goes red.

**ST-4F-01 should be re-worded the same way**, or it will be "failing" forever for a reason
nobody will read past.

### Finding 2 (Minor) — ST-4F-04 already has three comment-only hits, from P2, and C-22 had to be scoped

`grep -rn "bot/trigger\|triggerBot\|editorial_bot" app/ …` returns:

```
app/routers/admin_router.py:383-384   # a comment explaining that POST /admin/bot/trigger is DELETED
app/routers/bots_router.py:30         # a comment naming migrations/add_editorial_bot.py
```

All three are comments P2 added on purpose, and all three are good comments. C-22 is therefore
built as an **executable**-reference check — AST over `app/`, ignoring comments and docstrings,
looking for an import or a non-docstring string literal mentioning `editorial_bot`. MUT-4F-94b
puts one back and it goes red. ST-4F-04 needs the same scoping or it is permanently red.

### Finding 3 (Major) — MUT-4F-84's second form does not bite, because tests.md's arithmetic for it is wrong

tests.md C-13 names two mutations: shrink the pool (`assert 20 >= 28`) and "add a fourth prompt
slot to the workflow without growing the pool" (`assert 40 >= 49`).

The first is right and bites. The second cannot: the formula in the same row is
`ceil(window_days / 7) * slots_per_week + 1`, and at four slots that is
`ceil(60/7) * 4 + 1 = 9 * 4 + 1 = **37**`, not 49. 37 is below both the 44-entry pool that
shipped and the PM's own floor of 40, so a fourth slot leaves C-13 green — **and it is right to**,
because a pool of 44 genuinely is sufficient for four slots. The "49" appears to be arithmetic
that does not reproduce from the stated formula.

Recorded as **MUT-4F-84a, GREEN**. The faithful version of the same defect — *enough* new prompt
slots that the pool really is too small — is **MUT-4F-84b**: Mon/Wed/Fri become prompt slots,
six slots a week, requirement 55, and C-13 goes red naming both numbers. C-13a independently
pins `slots_per_week == 3` so a slot added quietly is caught there as well.

### Finding 4 (Major) — `GET /groups/public` does not exist

`architecture.md` §"Data flow — one run" says the circle roundup reads
`GET /groups/public`, and §"Security review" 5 repeats it. There is no such route. The public-
circle endpoint on this branch is **`GET /groups/discover`** (`groups_router.py:312`), which
returns `is_private == False` circles the caller has not joined, each with `member_count` and
`current_book`. A bot has joined no circle, so it sees every public one — which is exactly what
the roundup needs, and it is read as an ordinary signed-in account, so it can only see what any
reader can see.

`bots/circles.py` is built against `/groups/discover`. The architecture should be corrected.

### Finding 5 (Major) — C-02 is vacuous against a correct implementation unless the seam is asserted directly

C-02 is "a Gemini double that returns `""` … the post still ends with the line". A bestseller run
that returns an empty teaser correctly falls back to the NYT description, so the post is never
actually empty and the case passes no matter where the label is appended. Measured: the obvious
mutation (make the label conditional on there being model output) stayed green.

C-02 now asserts the seam itself as well — `common.append_label("", "TMRBot")` ends with the
exact line — and MUT-4F-69 (`append_label` returns an empty body unlabelled) and MUT-4F-69b (the
line first instead of last) both go red. The run-level half is kept; it is the direct assertion
that gives the case its teeth.

### Finding 6 (Minor) — C-13's `slots_per_week` has no machine-readable source in the architecture's workflow sketch

K-13 is right that the number must be derived rather than typed, and C-13 says to count it "from
`.github/workflows/tmr-bots.yml`'s schedule". But the architecture's sketch carries the content
type only in a YAML **comment** beside each cron, and `yaml.safe_load` throws comments away — so
there is nothing to count.

The shipped workflow puts the map in product code instead: the `Choose today's content type`
step has a `case "$(date -u +%u)"` block, one line per day. C-13 parses that block, maps each
cron's day-of-week field through it, and counts the crons that land on `prompt` or `circles`
(Thursday counts because it can fall through). Nothing in the assertion is a literal, and
changing either the crons or the map changes the answer.

### Finding 7 (Minor) — the Android baseline moves 120 → 121, so G-4F-07's pinned number is stale

C-20's fix had already landed on the sprint branch (`702e485`, "scope the build-workflow listing
check to build-* files"), and it is a better fix than the one tests.md specifies: an explicit
four-file allowlist would go red again the next time an operational workflow lands, which is the
exact regression `702e485` repaired. **It was not reverted.** `tmr-bots.yml` and `ci-tests.yml`
are not `build-*` files, so the existing assertion needed no change at all — only its comment,
which now names them.

What the `build-*` scoping loses is the "a workflow cannot sneak in" property, so that is added
back in its own right rather than by widening the listing: `only_the_two_build_workflows_build_
the_app` asserts no workflow outside the two build files runs `eas build`/`eas submit`/`expo
build`, with the two real build workflows as the non-vacuity control. MUT-4F-95 (an unlisted
`build-*.yml`) and MUT-4F-95b (an `eas build` step inside `tmr-bots.yml`) both go red.

Android is therefore **121**, not 120. G-4F-07 needs updating.

### Finding 8 (Minor) — two deliberate divergences from `editorial_bot.py`, both testability-driven

- **Book selection is rank order, not `random.choice(unposted[:3])`.** A bot whose output cannot
  be predicted from its inputs cannot be asserted about, and "the highest-ranked book we have not
  posted" is a better editorial rule than a coin flip. C-05a and C-09 both depend on it.
- **The candidate pool is filtered before the model is called.** The old script filtered first
  too, but from its own `SELECT`; this one filters from `GET /bots/posted`, which is the union of
  `bot_post` and the legacy `editorial_post` (B-29). C-05a pins that exactly one Gemini call is
  spent even when fourteen books are skipped.

### Finding 9 (Minor) — the bestseller window sends no `since`

R-15 says a bestseller is never posted twice **across all lists**, with no expiry, while prompts
and quotes have 60- and 180-day windows. `bots/bestsellers.NO_REPEAT_DAYS` is therefore `None`
and `GET /bots/posted` is called without `since`, which `bots_router.py` already handles
(`since: Optional[datetime] = None`). Written down because the constant reads oddly next to the
other two.

### Finding 10 (Minor) — the jitter is skipped on `workflow_dispatch`, deliberately

R-09's reason for the jitter is that posts must not all land on the half hour. A manual dispatch
is a single run at a time the PM chose, so the clustering cannot happen — and P-4F-08 requires
the PM to re-dispatch a bestseller run by hand and read the 409, which would otherwise mean
waiting up to 25 minutes staring at a `sleep`. The `if: github.event_name == 'schedule'` is the
whole of the difference; C-19 is unaffected because the step still exists and still precedes the
post.

### Finding 11 (Informational) — `pyyaml` is a test dependency nothing declares

C-17..C-22 parse the workflow with `yaml.safe_load`, as tests.md specifies. `pyyaml` is not in
`requirements.txt` (nor is `pytest`); both are present locally only as transitive installs. The
CI workflow installs both explicitly. If anyone adds a dev-requirements file, those two belong
in it.

### Finding 12 (Informational) — no `schema_guard.REQUIRED_COLUMNS` entry was added

P5 adds no column and no table, so nothing was appended (K-01b: an entry for a table with no
SQLModel model fails `test_required_columns_match_models` with a bare `KeyError`). The K-01
exemption set stays at exactly two files and `tests/test_sql_artifacts.py` was not touched by
this package.
