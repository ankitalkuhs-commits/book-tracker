---
screen: sprint-4f-activity-engine
feature: community
status: decided
decided: 2026-09-23
decided_by: PM
amended: 2026-09-29 — E-2 reversed (R-05a withdrawn) and R-17 added, after the PM reviewed the first live bot post
---

# PM decisions on the Sprint 4F escalations

The Architect raised nine escalations (`architecture.md` §Escalations). All nine are answered here.
Where a decision changes the design, the change is stated as a binding requirement, not a suggestion.

## The one that changed the design

### E-7 — Is the repository public? **Yes. Verified, not assumed.**

```
gh repo view --json visibility  ->  {"visibility":"PUBLIC"}
remote: https://github.com/ankitalkuhs-commits/book-tracker
```

Consequences, both directions:

- **Actions minutes are not a constraint.** Public repositories get unlimited free minutes on
  GitHub-hosted runners, so the keep-alive's ~4,300 runs a month and seven more bot runs a week
  cost nothing. The Architect's minutes worry is withdrawn.
- **Workflow files and every run log are world-readable.** That is fine for the prompt and quote
  pools. It is not fine for a production database credential.

### E-5 — Should the bot have a database connection at all? **No. Take the endpoint option.**

E-5's recommendation ("keep the direct connection for this sprint") was explicitly conditional on
E-7, and E-7 came back public. So:

- **`DATABASE_URL` must not be created as a GitHub Actions secret.** Not for this sprint, not as a
  temporary measure. The bot gets zero direct database access.
- The only secrets the bot workflows hold are `BOT_LOGIN_SECRET` (revocable in one Render edit,
  buys only a 15-minute token for an account that owns no reader data) and the existing
  `NYT_API_KEY` / `GEMINI_API_KEY`.

**Simplify while taking it.** The Architect costed this as two endpoints (`GET`/`POST /bots/dedup`).
Build it as **one endpoint plus one field**:

- `POST /notes/` accepts an optional `dedup_key: str | None` **which is honoured only when the
  caller is a bot account**, and writes the `bot_post` row in the same transaction as the note.
- `GET /bots/posted?content_type=…&since=…` returns the keys already used, for the run to filter
  against before it composes anything.

This is smaller than the original design *and* strictly safer: it deletes R-15's stated failure
mode ("the post succeeds and the dedup write then fails"), because there is no longer a window
between the two writes. A duplicate `dedup_key` from a bot is a **409**, and a 409 fails the run
without posting.

Architect: fold this into `architecture.md` before the Senior QA writes the plan. If the atomic
version turns out not to work against the existing `create_note` transaction boundaries, say so
and fall back to the two-endpoint form — but do not fall back to `DATABASE_URL` in Actions.

## Accepted as recommended

| | Decision |
|---|---|
| **E-1** Android has no OTA | **(b) — ship API + web, start the bots, do not wait for 2.2.4 adoption.** R-05a's in-text line is a real label that every installed version shows. The badge arrives as an upgrade. Accepted explicitly, including that some readers will see the label only as text for some weeks. **Undermined 2026-09-29:** E-2/R-05a is withdrawn, so the in-text label this bargain rested on no longer exists and an installed app below 2.2.4 shows nothing. |
| **E-2** wording of the in-text line | ~~**The trailing named form**, exactly: `— automated post from @TMRPrompts` (em dash, space, lowercase "automated", the account's handle). Fixed string, never model-generated, asserted by a test.~~ **REVERSED 2026-09-29 — see "The one that was reversed after ship" below.** |
| **E-3** circle roundup privacy floor | **Keep the floor: ≥3 readers across ≥2 public circles.** If it does not fire, the Thursday slot is a second prompt. Lowering the floor is not an option that exists. |
| **E-4** scope claim on the bot token | **No claim.** `user.is_bot` on the row is the single authority. |
| **E-6** quote copyright | **Public-domain pool only**, checked into the repo, no model-generated quotes. "Margin Notes" leans into being old-fashioned. Contemporary quotes are a separate question with a separate answer. |
| **E-8** seven posts a week | **Ship seven, measure after four weeks.** If bot posts outnumber reader posts, bestsellers drop to one a week. R-13's 2/bot/day cap is a safety limit and must never be read as headroom. |
| **E-9** `@TMRBot`'s display name | **Rename to *TrackMyRead Bestsellers*.** Every bot bio begins with the words "Automated account." One `UPDATE` per account in the same PM SQL step. |

## The one that was reversed after ship

### E-2 / R-05a — the in-text line. **Withdrawn, 2026-09-29.**

Sprint 4F shipped on 2026-09-29 and the PM read the first live bot post. The decision:
**the in-text line comes out.** It was stripped from that one post by hand; the code, the
tests and the documents followed the same day on branch `fix/bot-post-parity`.

E-2's original answer is left above with a line through it rather than deleted, because
the reasoning it rested on is still on the record and still correct — what changed is the
PM's weighing of it, not the facts. R-05a existed because R-03/R-04's badge depends on the
client, and an Android 2.2.1 reader, a stale API cache and a screen reader all see text
and not a pill. None of that stopped being true.

**What still labels a bot post**

1. the account's **username** — `@TMRBot`, `@TMRPrompts`, `@TMRQuotes`, `@TMRCircles`;
2. the account's **display name** — e.g. *TrackMyRead Bestsellers* (E-9);
3. the account's **bio**, which begins "Automated account." (E-9);
4. the **`is_bot` field** on every author object every API surface returns (R-02);
5. the **BOT badge** on web (R-03) and on Android **2.2.4 and later** (R-04).

**Residual risk, accepted with the decision**

- **Installed Android apps below 2.2.4 now show no per-post marker at all.** Items 4 and 5
  need the new build; items 1–3 are visible only if the reader opens the profile. This is
  a direct reversal of the bargain struck in **E-1**, which accepted shipping ahead of the
  badge *because* R-05a covered the gap. Nothing now covers it until 2.2.4 reaches readers.
- A stale 60-second GET cache (`api.js:10-44`) predating R-02 serves author objects with no
  `is_bot`; those cards render unbadged on web too.
- A screen-reader user no longer has a spoken label inside the post body, only whatever the
  pill's markup gives them. `qa/a11y_audit.mjs` does not cover the pill.
- Any future surface that prints an author's name into a server-composed sentence has no
  label. R-05 keeps bots out of the two that exist today.

Shipping Android 2.2.4 is the only mitigation on record.

### The same review added one requirement: **R-17**, 2026-09-29

The PM's second observation on the same post: a reader's feed card carries a book cover
thumbnail and the book title in gold, and `@TMRBot`'s carried neither, so it read as a
different kind of object in the feed. A bestseller post now carries a **real linked book**,
obtained through the reader's own `POST /books/add-to-library`. Two consequences the PM
should hold rather than discover:

- **`@TMRBot` now owns a library**, and its profile shows one. For this account that reads
  as "the bestsellers it has featured", which is why it was accepted. The rows are added as
  `to-read` with no rating, which keeps them out of "friends currently reading" and out of
  recommendations for anyone who follows the bot.
- **R-05's prohibitions are untouched.** They are exactly four routes — follow, like, unlike,
  comment. A bot owning its own library is not interaction with a reader's content, and its
  `book_added` event cannot reach a reader because `fire_event` returns early on a bot actor.
  Both were confirmed by reading the guards and are pinned by tests B-35 and B-36.

Full detail in `spec.md` R-17 and `build-notes-4f-p6.md`.

## Standing constraints reaffirmed

1. **No disguised-human accounts.** The spec's §"Not building" stands as written. The app carries
   Amazon affiliate tags, so an invented reader praising a book is a fabricated review attached to
   a commercial benefit — the FTC's 2024 rule and India's consumer-affairs guidance both reach it.
   Distinct editorial *voices* are wanted; disguised humans are not built here.
2. ~~**4F merges after 4E.** 4E's package P3 rewrites the same `notes_router.py` functions. No 4F
   branch merges to master while 4E is unmerged.~~ **Lifted 2026-09-23.** 4E was descoped to three
   packages and **P3 — the only reason for this constraint — was dropped**
   (`features/maintenance/sprint-4e-query-budget/pm-decisions.md`). Nothing in 4E now touches
   `notes_router.py`, `likes_comments.py` or `crud.py`. The one file overlap left is
   `users_router.py` / `groups_router.py`, from 4E's two N+1 fixes (`4b0df5c`); 4F's P2 edits
   different functions in those files, and whoever merges confirms that in the diff rather than
   trusting this line.
3. **The two PM SQL steps run before the code that depends on them**, in the order
   `architecture.md` §"Deploy order" gives, because `schema_guard` exits at startup on a missing
   column.
