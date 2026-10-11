---
screen: sprint-4i-report-block
feature: safety
status: decided
decided: 2026-10-11
decided_by: PM
---

# PM decisions on the Sprint 4I escalations

Eight escalations, all answered. Where a decision changes the design it is binding.

## E-5 — The split: **two API sprints, one store release.** Accepted as proposed.

- **4I-A — Report.** Ships first and alone. It satisfies Guideline 1.2 item 2 by itself, moves
  **zero** query budgets, and is independently deployable.
- **4I-B — Block.** Follows. It is the half that touches fourteen serving paths and moves 24 of
  the 67 budget rows.

**One client release for both.** The app has no OTA channel, so each client release is an iOS
review wait and another chance at an unrelated rejection. The API halves deploy invisibly
(steps 1–7 are not reader-visible by construction); the clients ship once, when both are done.

## E-1 — Block symmetry: **symmetric, and the follow rows are deleted.** As proposed.

The Architect did not argue this from taste, it enumerated what a one-directional block leaves
the blocked reader — the feed, the blocker's notes, their profile, their stats, their shelf,
their activity, plus the ability to comment under their post and fire a push at them. That is
the absence of the feature with a button on top.

Deleting both `follow` rows in the same transaction is accepted, including that **unblocking
does not restore them**. A reader who unblocks and wants the follow back can follow again; the
alternative is resurrecting a relationship neither person asked for.

**Also build the softer option.** A menu offering only "block" pushes people into the nuclear
choice. The menu carries **Unfollow** as well, and unfollow is the first item.

## E-2 — Circles: **hide the content, leave the structure.** As proposed, with the residual stated.

A block hides posts and activity inside a shared circle but does not remove either person from
it. The accepted residual: A still sees B's name in the Members list and on the leaderboard.

The alternative — a block ejecting someone from a circle — lets one reader remove another from a
shared space unilaterally. That is a worse failure than a name in a list, and it is not
reversible by the person it happens to.

## E-3 — What a report does before a human looks: **nothing globally. Plus "also block", checked.**

No auto-hide. With 131 readers an automatic threshold would have to be two or three reports,
which is a brigading weapon, not a safety feature. A report queues for review and changes
nothing that anyone else sees.

The reporter is not left waiting, though: the report dialog carries **"Also block this person"**,
**checked by default**. That gives the reporter immediate relief by their own hand, which is the
thing that actually matters in the moment, and it is why 4I-B must land before the clients ship.

**The response-time commitment is 2 working days**, matching what trackmyread.com/support already
promises. Apple checks that reports go somewhere a human sees, so the admin queue is a
requirement of 4I-A and not a later nicety.

## E-6 — A report about the admin lands in the admin's queue: **accepted, unfixable in code.**

There is one admin. Recorded so it is a known property rather than a surprise. If the reader
base grows enough for this to matter, the answer is a second moderator, not a code change.

## E-8 — A signed-out reader sees the public feed: **accepted.**

`/notes/feed` serves anonymous callers and cannot filter by a block that has no viewer. Blocking
is a tool between accounts, not a privacy wall against the open web — the existing private-profile
setting is the control for that. **Say this plainly in the UI copy** where someone blocks: it
hides them from each other inside TrackMyRead, it does not unpublish public posts.

## E-4 / E-7 — Accepted as recorded

- **E-4** Past likes and comments survive a block. Removing them would rewrite other people's
  threads; the content is hidden from the blocked reader's view, which is the point.
- **E-7** `EXPECTED_ENDPOINTS` does double duty in Sprint 4E's budget file, so the new GET routes
  stay unbudgeted rather than editing 4E's architecture mid-sprint. Split the literal later.

## Two things from the report that are now requirements

1. **The per-post menu is gated owner-or-admin on both clients** (`HomePage.jsx:184`,
   `FeedScreen.js:669`), so a non-owner sees no menu at all. Opening that gate is the largest
   client change in the sprint and must not leak owner-only actions (edit, delete) to
   non-owners. That is a test, not a review note.
2. **`BQ-08e` lands exactly on the `if m.n > 3` ceiling** in
   `test_empty_accounts_keep_their_early_returns`, leaving zero headroom after this sprint, and
   **`BQ-24` is the project's only `TARGET` row** and moves 3→4. Both are re-measured, never
   widened. If a later change needs BQ-08e to go to 4, that is a design conversation about the
   empty-feed early return, not a number to edit.

Also carried: the large seed must gain `block` rows, or `test_no_endpoint_scales_with_row_count`
never exercises the filter — and blocks shorten response bodies, so its `len(bigger) >= 5`
assertion is a trap the test plan has to handle deliberately.
