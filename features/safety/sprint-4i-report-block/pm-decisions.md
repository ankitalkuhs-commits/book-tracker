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

---

# Addendum, 2026-10-11 — decisions on the QA plan's open questions

## Q-1 — The two unclassified circle endpoints: **delete the rows, then neither needs filtering**

`GET /groups/{id}/pending` and `GET /groups/invites/pending` both serve names, so the
classification rule says "filter". But filtering a **pending join request** hides a decision from
the only person who can take it: the curator would see a request they cannot action, and it would
sit there for ever. That is a worse outcome than the name being visible.

The answer is the one already taken for follows. **A block deletes any pending join request and
any pending invite between the two readers, in the same transaction**, and refuses new ones. Then
the row cannot exist, and "not filtered" is true for the same reason the Architect gave for
`/follow/followers` — *the row cannot exist*, rather than *we chose not to look*.

Both endpoints are classified **not-filtered, with that reason**, and the deletion is a new
requirement under the block transaction alongside the follow rows.

## Q-2 — Who may be reported: **any existing user, including bots**

R-02's visibility rule is note-shaped and taking it literally means a reader cannot report a
private profile — which would delete the affordance R-05 commissions on the profile page.

The rule is instead: **a report may name any existing user id.** A report is a message to a
moderator, not an action against the target, so visibility is the wrong gate. The response is
**identical whether or not the reporter could see that person**, so the endpoint leaks nothing
about private profiles — that sameness is a test, not a note.

Bots are reportable too. If `@TMRQuotes` posts something wrong, a reader must be able to say so.

**Rate limit: 20 reports per reporter per 24 hours**, server-enforced, same shape as Sprint 4F's
bot cap. Without it "report anyone" is a spam channel into the admin queue.

## Q-3 — "Also block" as two requests: **make it one**

The QA is right that two requests leaves "what if the block half fails" unanswered. Rather than
specify failure handling, remove the failure: `POST /reports` takes **`also_block: bool`**, and
the server writes the report and the block **in one transaction**. Either both happen or neither
does, and there is no partial state to describe.

Sequencing, which falls out cleanly: `also_block` belongs to **4I-B**, because it cannot exist
before blocking does. 4I-A ships the report API without it. The clients ship once, after both,
so no reader ever sees a checkbox that does nothing.

## R-24 — The unlike refusal: **dropped**

`unlike_note` never loads the note and never calls `_assert_can_view_note`, so the requirement has
no call site. It is also not worth creating one: unliking **removes** a row the reader themselves
created. Letting someone withdraw a like they left before the block is correct, not a leak. The
requirement is struck, with this reason recorded rather than quietly dropped.

## Spec done-checklist item 7 — **amended**

"No edits to any existing test except the budget numbers" becomes false the moment the report
routes gain `deny_bot_actor`, because Sprint 4F's four-route inventory in
`tests/test_bots.py::GUARDED_ROUTES` is an exact list. The item now names that file and that
constant as the one permitted edit, so it is a bounded exception rather than a broken claim.

## One correction to my earlier note

I wrote that `BQ-24` is the project's only `TARGET` row. The QA measured it: **`29` and `29e` are
targets too**. The substantive point stands — a `TARGET` moving is a bigger deal than a ratchet
moving — but the count was wrong and the plan carries the measured version.

---

# Carried findings, 2026-10-11 — not this sprint's work

Two things the 4I-A Builder surfaced that are real and are deliberately **not** being fixed here.

## Test-order fragility, pre-existing

Six cases across `tests/test_bots.py` and `tests/test_notes.py` fail when `test_notes.py` runs
**before** `test_bots.py` ("the note did not surface"). Reproduced by the Builder with no 4I file
loaded, so it predates this sprint. The default alphabetical collection order happens to hide it.

Why it matters beyond tidiness: it means part of the suite depends on collection order, and a
green run is therefore conditional on something nobody chose. Any tool that shards, randomises or
reorders tests — including `pytest -p xdist` or a future CI change — turns it red for reasons
that have nothing to do with the change under test.

Not fixed now because it touches two other sprints' files mid-build. **Triage it.**

## The admin queue has no UI until the clients ship

`GET /admin/reports` exists and every admin gets a push the moment a report is filed, so nothing
sits unseen. But until `AdminPage.jsx` gains its Reports tab in P4, "a human looks at it" means
the PM making an authenticated request by hand.

That is acceptable for the gap between the API deploy and the client release — the notification
is the part that makes the 2-working-day commitment real — but **the Reports tab is a requirement
of the client package, not a nicety.** If it slips, the commitment published on
trackmyread.com/support stops being true.
