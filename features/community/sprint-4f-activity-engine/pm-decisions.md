---
screen: sprint-4f-activity-engine
feature: community
status: decided
decided: 2026-09-23
decided_by: PM
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
| **E-1** Android has no OTA | **(b) — ship API + web, start the bots, do not wait for 2.2.4 adoption.** R-05a's in-text line is a real label that every installed version shows. The badge arrives as an upgrade. Accepted explicitly, including that some readers will see the label only as text for some weeks. |
| **E-2** wording of the in-text line | **The trailing named form**, exactly: `— automated post from @TMRPrompts` (em dash, space, lowercase "automated", the account's handle). Fixed string, never model-generated, asserted by a test. |
| **E-3** circle roundup privacy floor | **Keep the floor: ≥3 readers across ≥2 public circles.** If it does not fire, the Thursday slot is a second prompt. Lowering the floor is not an option that exists. |
| **E-4** scope claim on the bot token | **No claim.** `user.is_bot` on the row is the single authority. |
| **E-6** quote copyright | **Public-domain pool only**, checked into the repo, no model-generated quotes. "Margin Notes" leans into being old-fashioned. Contemporary quotes are a separate question with a separate answer. |
| **E-8** seven posts a week | **Ship seven, measure after four weeks.** If bot posts outnumber reader posts, bestsellers drop to one a week. R-13's 2/bot/day cap is a safety limit and must never be read as headroom. |
| **E-9** `@TMRBot`'s display name | **Rename to *TrackMyRead Bestsellers*.** Every bot bio begins with the words "Automated account." One `UPDATE` per account in the same PM SQL step. |

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
