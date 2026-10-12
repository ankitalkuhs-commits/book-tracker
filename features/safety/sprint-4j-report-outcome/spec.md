# Sprint 4J — the reporter hears an outcome

Status: **scoped, not started.** Three PM decisions below block the build.
Written 2026-10-12, out of the report-button design review that produced `cab75bb`.

---

## What It Does

When an admin resolves a report, the reader who filed it is told that a human looked at it.
Nothing more: not what was done, not to whom, not what the moderator wrote.

Today that loop is open. `PATCH /admin/reports/{id}` writes `status`, `resolved_at`,
`resolved_by` and `resolution`, and the reporter is never told any of it. 4I built that
deliberately for the *reported* reader — R-10 keeps them in the dark — and the reporter was
simply not considered. The consequence is predictable: the only thing a reporter gets for their
trouble is silence, so they learn that reporting does nothing and they stop. The queue then
dries up, and the queue is the entire reason the report button exists. **Block is what gives
the reader relief; report is what gives us signal** — and signal that is never acknowledged
decays.

## Why this is not a nice-to-have

At 131 readers with one moderator, reports are rare enough that every one is actually read.
That is exactly the condition under which closing the loop is cheapest and worth most: a reader
who reports once and hears back reports again. A reader who hears nothing will, next time,
block silently — and a silent block teaches us nothing about the account that earned it.

## Appetite

**Small. No migration.** No schema change: `Report` already carries `status`, `resolved_at`,
`resolved_by` and `resolution`, and the notify-once rule is derivable from the status the row
held *before* the write (R-04). That makes this the first safety sprint since 4E with **zero
SQL** — `schema_guard` cannot fail the deploy and `PM_SQL_QUEUE.md` gains no step. One new
notification event, one call site, twelve locale files, and the tests.

---

## Requirements

### R-01 — One new event, mirrored on both sides

`report_resolved` is added to `app/notifications/config.py` **and** to the mobile
`EVENT_CONFIG`. This is not bookkeeping: `__tests__/notificationEvents.test.mjs` greps
`app/notifications/config.py` at test time, so a Python-only change turns the **mobile** suite
red. 4I shipped `content_reported` without its mobile entry and that is exactly how the trap
was found. Both halves land in the same commit.

`daily_cap: False`. A reader with several open reports is a reader having a bad week; a cap
would silently drop the answer to one of them.

### R-02 — The message names nothing and nobody

The notification must never carry the reported reader's name or id, the content reported, the
reason, or `resolution`. `resolution` is a moderator's private note that may quote the content
or name its author; a reporter-facing message built from it is a channel from the moderator to
the reported reader's accuser and, transitively, an invitation to retaliate. R-10's mirror
image.

A static string from the locale files, with nothing off the row interpolated into it. Pinned by
a test asserting the outbound payload carries no field of `Report` but its own id.

### R-03 — Dismissal is the dangerous half

"We found no violation" lands on a reader who felt wronged. It must not read as a verdict on
*them*. The copy is a deliverable of this sprint, not an afterthought, and it ends by pointing
at the tool that is still entirely theirs: they can block.

### R-04 — Notify exactly once, on the transition out of `open`

`resolve_report` fires only when the row's status was `open` immediately before the write. An
admin re-resolving a report (`actioned` → `dismissed`, or fixing a mis-click) must not send a
second notification. Derived from the pre-write status, never from a new column.

### R-05 — A reporter who no longer exists

`Report` has **no foreign keys**, deliberately (R-07): a report outlives its content and can
outlive its reporter. `fire_event` must tolerate a `reporter_id` that resolves to no user, and
the resolve must still return 200 — a deleted account cannot break the moderator's queue.

### R-06 — Re-measure the query budget

`PATCH /admin/reports/{id}` gains statements. `tests/test_query_budget.py` holds an exact
measured count per endpoint with **margin zero**, so that row is re-measured on a run and moved
in the same commit. The file is in 4G's `permitted_removals`, so editing it is allowed — but the
number comes off a run, never out of this document.

### R-07 — Twelve locale files

Two strings (actioned, dismissed) plus a title, in six languages, in both clients. The parity
tests (`i18nParity.test.mjs`, `C-16`) enforce it once the keys are in their lists; both lists
assert their own length against a literal first, so both literals move too.

---

## Blocked on — three PM decisions

### D-1 — Outcome-free, or a binary outcome?

- **(a) Outcome-free.** "A moderator reviewed your report." Identical whatever happened. Safest,
  and close to useless — a reader who gets it twice learns it is boilerplate.
- **(b) Binary.** "…and took action" / "…and did not find a guideline violation." Reveals
  nothing specific about the other account; tells the reporter whether they were heard.

**Recommendation: (b).** It is the question the reporter is actually asking. (a) is a read
receipt dressed up as an outcome.

### D-2 — Does a dismissal notify at all?

Silence-on-dismissal is tempting and wrong. Dismissal will be the *common* outcome — most
reports are a reader disliking something rather than a guideline breach — so staying silent
there means the modal experience of reporting is still silence and R-01 buys nothing. The cost
is that some readers will be annoyed by the answer.

**Recommendation: notify on both,** with R-03's copy.

### D-3 — Preference-gated, or always sent?

Every other event respects a per-reader notification preference. This one is a direct response
to an action the reader themselves took, which is the usual definition of transactional.

**Recommendation: always sent, honouring only `is_active` as a kill-switch** — the exception
`admin_broadcast` already has, for a narrower and better reason.

---

## Not building

- **No appeal flow.** A reader who disagrees has `/support`: a human at a published address. An
  in-app appeal is a second queue for one moderator.
- **No per-report thread.** The notification is terminal.
- **No backfill.** Reports resolved before this ships stay silent. A retroactive wave about
  months-old reports is a bug, not a feature.
- **No change to what the reported reader is told.** Still nothing (R-10).
- **No change to block.** Untouched.

---

## Done checklist

- [ ] `report_resolved` in `app/notifications/config.py` **and** mobile `EVENT_CONFIG`, one commit
- [ ] `fire_event` called from `resolve_report` only on the transition out of `open` (R-04)
- [ ] Outbound payload carries nothing off the `Report` row but its id (R-02), pinned by a test
- [ ] A resolve whose `reporter_id` matches no user still returns 200 (R-05)
- [ ] Query-budget row for `PATCH /admin/reports/{id}` re-measured off a run (R-06)
- [ ] Three strings in all six locales, both clients; both literal counts moved (R-07)
- [ ] Named mutations recorded, each shown RED then reverted
- [ ] pytest / mobile / qa-unit floors re-measured and raised in `ci-tests.yml`
