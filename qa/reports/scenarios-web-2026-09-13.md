# Web scenario run — 2026-09-13

`https://www.trackmyread.com` as review.reader · created 1 / cleaned 1 · fixture identical to baseline: **true**

## S1 — Home composer: post (quote + emotion) → comment → like → edit → delete

| result | step | detail |
|---|---|---|
| PASS | POST /notes/ from composer | 201 in 3823 ms |
| PASS | persisted with quote + emotion | emotion=Joyful is_public=true |
| INFO | composer default visibility (F-17 decision: should become private) | is_public=true |
| **FAIL** | post appears in feed without reload | not rendered within 20 s of the 201 |
| INFO | diagnostic: feed tabs / first article | tabs=["Community","Friends"] first="R\nReview.Reader\n\n10m ago\n\nmore_horiz\n\nPRIDE AND PREJUDICE\n\nA line from this book" |

## CLEANUP — Remove rows created in this run; restore profile; compare with baseline

| result | step | detail |
|---|---|---|
| PASS | API delete leftover note 220 | 200 |
| PASS | fixture identical to baseline (ids, status, page, rating) |  |
