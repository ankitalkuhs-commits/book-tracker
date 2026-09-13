---
screen: sprint-2-audit-bugs
feature: maintenance
---

## Learnings

- `reverse=True` on a tuple key inverts every component including the sort indicator — the mutual-first flag must be encoded so reverse still puts mutuals first, or sort in two passes. `notes_router.get_friends_feed` sorted `[(not is_mutual, -created_at)]` which put non-mutual first; fixed by sorting `[(is_mutual, -created_at)]` then reversing only the date part.

- "Last 12 months" by 30-day steps skips February and duplicates 31-day months — walk year/month integers instead. The old loop stepped every 30 days, creating gaps and overlaps at month boundaries; replaced with explicit month arithmetic to get exactly 12 consecutive months ending this month.

- A streak anchored on "today" reads 0 for everyone who has not read yet today — anchor on yesterday when today is empty. The old `current_streak` looked back from today only, so a reader who was active yesterday but not yet today showed 0 instead of their running streak; now checks if today has activity, falls back to yesterday if empty.

- `_check_daily_cap` compares local `date.today()` against UTC `sent_at` — a pre-existing 00:00–05:30 IST window where the cap can misjudge; tests avoid it by controlling time, not by changing the dispatcher. This is a known timing edge case; tests work around it with `freezegun`, not a blocker for production.

- `app/utils/push.py` is still imported by `likes_comments.py` (`send_push_notification_to_user`, unused there) — carry as a cleanup item; do not delete the module yet. The import exists but the function is never called; left in place to avoid accidental breakage if it is shadowed elsewhere.

- A Builder subagent will refuse a task whose shell defaults to another project until the target repo is confirmed — the `feedback_repo_context` rule working; the orchestrator confirms with concrete evidence. This prevented mid-sprint confusion when tools defaulted to the wrong project root; the enforcement was correct.
- A behaviour-only deploy cannot be confirmed from outside: sprint 2 changed no route signature or docstring, so `/openapi.json` on Render is byte-identical before and after, and every changed endpoint needs a token — the orchestrator polled the schema hash for 10 min and learned nothing. Add `GET /version` returning `RENDER_GIT_COMMIT` (Render sets it) so a push can be confirmed live in one curl.
