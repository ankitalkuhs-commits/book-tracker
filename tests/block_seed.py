"""Sprint 4I-B (K-4I-03, K-4I-08) — the `block` rows the query-budget seed needs.

WHY THIS IS A SEPARATE FILE
===========================
`tests/test_bots.py::test_budget_exemption_lines_name_the_row_they_change` requires every added
line in `tests/test_query_budget.py`'s diff to carry one of `("BQ-39", 'Row("39"', "Sprint 4F",
"#")` once any line is removed. 4I moves rows 03..37, so `Row("39"` never matches and the only
generic marker is `"#"`. Putting the seeding code here keeps the budget file's diff down to the
24 numbers and two wiring lines, each with a trailing comment, and leaves that guard cheap.

WHY THE FILLERS LOOK LIKE THIS (K-4I-08)
========================================
`test_no_endpoint_scales_with_row_count` measures every `scales` row with `expect=row.status`,
and **every status in the budget table is 200**. If the budget reader `me` blocked `d.pub`, then
`/profile/{pub}`, `/notes/user/{pub}`, `/userbooks/user/{pub}`, `/users/{pub}/stats` and
`/reading-activity/user/{pub}/daily` would all answer **404** and twelve rows would fail on
status before a single count was compared. The same test then asserts `len(bigger) >= 5` — at
least five endpoints return a LONGER body on the large seed — and a block SHORTENS bodies, so a
block against anyone the table measures could break that too.

So the blocks are against readers who are measured by nothing: `3 * scale` dedicated fillers who
author no note, comment or group post, hold no `follow` row, belong to no circle, are none of
`pub`/`priv`/`privx`/`admin`/`empty_viewer`/the friend-note author, and whose name and username
match neither `q=Searchable` nor `q=Budget` (the table's two search literals). The hidden set is
then non-empty **and grows with `scale`**, which is the only thing that makes a per-row block
lookup visible to that test, while no body shortens and no status changes.

**The EMPTY database deliberately gets none.** That is what makes `BQ-08e` prove the helper runs
and costs one statement against an *empty* block set.

`B-43a` asserts every one of those invariants, because a seed that silently stopped inserting
blocks would make `B-43` vacuous rather than red.
"""
from sqlmodel import Session, select

from app import models

# The prefix every filler shares. Deliberately contains neither "Searchable" nor "Budget": the
# budget table searches `q=Searchable` (BQ-23) and `q=Budget` (BQ-16, over book titles), and a
# filler that matched either would change a measured body.
FILLER_PREFIX = "blockfiller"
FILLER_NAME = "Quiet Neighbour"
BLOCKS_PER_SCALE = 3

# The seeded readers the budget table measures by name. A filler must be none of them, and
# B-43a asserts that against this literal rather than against a comment.
MEASURED_ATTRS = ("me", "admin", "pub", "priv", "privx", "empty_viewer")

# The two search literals the budget table uses. A filler's name and username must match
# neither, or BQ-23's measured body changes.
SEARCH_LITERALS = ("searchable", "budget")


def add_block_rows(session: Session, data, scale: int, *, password_hash: str) -> list[int]:
    """Create `3 * scale` filler readers and one `Block(blocker_id=data.me, blocked_id=filler)`
    per filler. Returns the filler ids. Commits once.

    The blocker is the budget reader, because they are the viewer on every `who="me"` row and
    therefore the only reader whose hidden set is ever computed by a measured request.
    """
    fillers = [
        models.User(
            name=f"{FILLER_NAME} {i}",
            email=f"{FILLER_PREFIX}_{i}@example.com",
            username=f"{FILLER_PREFIX}_{i}",
            password_hash=password_hash,
        )
        for i in range(BLOCKS_PER_SCALE * scale)
    ]
    session.add_all(fillers)
    session.commit()
    for f in fillers:
        session.refresh(f)
    session.add_all([
        models.Block(blocker_id=data.me, blocked_id=f.id) for f in fillers
    ])
    session.commit()
    return [f.id for f in fillers]


def filler_ids(session: Session) -> list[int]:
    """The filler reader ids in a seeded database, found by their username prefix."""
    return list(session.exec(
        select(models.User.id).where(models.User.username.like(f"{FILLER_PREFIX}_%"))
    ).all())
