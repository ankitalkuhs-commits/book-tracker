---
screen: review-login
feature: auth
created: 2026-09-13
---

## Learnings (one sentence each, with the why)

**a. TrackMyRead login is Google-only, so QA cannot use the real button.** Agents cannot enter credentials into a browser, Google blocks automated sign-in, and `trackmyread.com` mail is on `mail.parktons.com` (not Google Workspace), so Google accounts on that domain would need a mailbox. Hence an allowlisted backend review-login plus a screenshot script, not a browser login.

**b. Render env key names must match the code exactly.** Keys named `Reader_acc` / `Friend_acc` were silently ignored and the endpoint stayed 404; `GET /version` plus the 404/401 distinction diagnosed it in one request.

**c. Node 22 treats `--env-file` as its own flag even after the script path (exit 9, "not found").** Script options must avoid Node's flag names, so the option is `--secret-file`.

**d. In Git Bash, a `/nonexistent`-style argument is rewritten to `C:/Program Files/Git/nonexistent`.** Use Windows-style paths in test commands.

**e. The Browser pane's `preview_start` resolved to the session-root project's `.claude/launch.json` (biodata, port 3000, another chat's server), not book-tracker's.** The local web dry run was skipped rather than editing another project's config.

**f. A Builder subagent was cut off by a usage limit before writing anything.** Check the working tree before relaunching, so partial work is resumed rather than duplicated.

**g. The Builder left a uvicorn server running on :8765 after its smoke test.** The orchestrator stopped it. Any background server a subagent starts must be stopped when the sprint closes.

**h. `GET /version` closes the sprint-2 gap: behaviour-only deploys leave `/openapi.json` byte-identical, so only the running commit SHA proves a deploy.** Deployments are now verifiable with one unauthenticated curl that does not depend on login working.
