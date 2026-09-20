---
screen: sprint-4d-page-speed
feature: maintenance
repo: web only (no API change, no DB change, no Android package)
status: planned
last_verified: 2026-09-20
spec_status: DRAFT, awaiting PM approval (written by the Architect with the PM Helper's spec duty, 2026-09-20)
source: qa/reports/page-perf-2026-09-19.md (Analysis section, production waterfall), qa/reports/triage-2026-09-13.md rows F-68, F-69, F-70
code_read_at: e6ede32 (master)
---

## What It Does
A signed-in reader opening any page of the website waits 2.9–6.4 s on a desktop, 3.6–8.9 s on a phone, before the content appears. Two of the reasons are in the website's own code:
- **F-69.** The website asks "who is signed in?" (`GET /profile/me`, 1.5–1.9 s) and starts loading the page only after the answer. Every signed-in page pays this wait, on every load.
- **F-70.** The circle page asks for the circle, and only then for its members, leaderboard, goal, posts and activity, although those need only the circle id in the address bar. That is a second wait of about 1.3 s.

This sprint makes the pages ask for their data at the same time as the "who is signed in?" question. Two more pages with the same second wait (book detail, a friend's profile) are fixed the same way. Nothing else about the pages changes: the same data, the same errors, the same redirects. A reader sees content about 1–3 s sooner.

**F-68 (context only, not in this sprint).** Every database query in production costs ~180 ms, which points to the API and the database being in different regions. Moving them together is the biggest single speed-up and needs no code. The PM is checking the regions. 4D and F-68 add up: 4D removes waiting *stages*, F-68 makes each stage shorter.

## User story
As a reader opening TrackMyRead, I want my feed, library or circle to appear as soon as its data is ready, so that the site feels quick and I do not stare at "Loading...".
- **Evidence, not assumption:** production measurements on 2026-09-19/20 (`qa/page_perf.mjs`) and the waterfall in the report's Analysis section.
- **Success metric:** the production waterfall shows no signed-in page starting its own requests after `/profile/me` has finished (except the two deliberate exceptions below). Desktop first-visit "ready" drops by about 1–3 s per page (table in architecture.md, "Expected outcome").

## Appetite
Max complexity: simple (1–2 days of build across two web packages and one QA package).

Not building:
- **F-68**, the region move (PM, infrastructure).
- **Any Android change.** The app has no serial stage (see "Parity").
- **Keeping the signed-in profile across reloads** (for example in `localStorage`). Not needed to remove the wait; it would add an identity cache to secure. See ADR-001.
- **Faster return visits.** A return visit is barely faster than a first visit because the website keeps no API data across reloads. That is correct for private data, and F-68 is the fix for the per-call cost.
- **Changes to `book-tracker-frontend-stitch/src/services/api.js`**. That file is in Sprint 4C's web package. No request de-duplication or new caching.
- **Fewer queries per endpoint.** A separate backend item.
- **The rule that a failed `/profile/me` (offline, 500) signs the reader out.** It is kept exactly as it is. Changing it is a product call (escalation E-5).
- CORS preflight round trips (every call carries `Authorization`, so browsers preflight it). This is noted as a later option, not in scope.

## Requirements

### Signed-in pages start their own data at once (F-69)
- [ ] **R-01 No wait for `/profile/me` before a signed-in page loads.**
  - **Defect:** `App.jsx:74-78` renders "Loading..." for the whole app, and `PrivateRoute` (`App.jsx:44-53`) renders it again, until `AuthContext` has the `/profile/me` answer. No page component mounts before that, so no page request starts.
  - **Accept:**
    - With `/profile/me` held back 2 s (test harness), every signed-in route in the table in architecture.md "Call-site inventory" starts its listed requests at least 1 s before `/profile/me` answers.
    - No page request is sent a second time when `/profile/me` answers. The page does not re-mount.
    - Signed-in visitors on `/` are sent to `/home` at once, without waiting. Public pages (`/about`, `/blog`, `/privacy`, `/terms`) render at once for signed-in visitors too.
    - Until `/profile/me` answers, the page shows its own loading skeleton under the normal nav bar, not the full-screen "Loading...".
- [ ] **R-02 Sign-in outcomes do not change.**
  - **Accept:**
    - **No token:** `/` shows the login page, and any signed-in URL goes to `/`. The browser sends no authenticated API request and does not reload in a loop.
    - **Invalid or expired token**, on `/`, `/home`, `/groups/{id}` and `/join/{code}`: the browser lands on the login page at `/`, and `bt_token` is removed. There are at most 3 document loads, so no loop, within 8 s on the local harness.
    - **`/profile/me` fails with a 5xx or a network error:** the token is removed and the reader lands on the login page. This is today's behaviour, kept on purpose (E-5).
    - **Valid token:** the same pages and data as today.
- [ ] **R-03 Nothing shows the wrong identity while the answer is pending.**
  - **Accept:**
    - `/admin` still waits for this load's `/profile/me`. The admin page never mounts, and no `/admin/*` request is sent, before the server has said `is_admin: true`. A non-admin still goes to `/home`.
    - Visiting your own `/profile/{yourId}` never shows the public-profile view of yourself (for example, a Follow button on yourself). It goes to `/profile`, as today.
    - Edit and Delete controls on a post appear only once the reader's id is known. They are never shown on a post that has no author.
    - `is_admin` comes only from this page load's `/profile/me`, never from anything kept from an earlier load.
    - Circle curator and creator controls are unaffected: they come from the circle's own response (`membership_role`), and the server checks every action.
- [ ] **R-04 A profile edit saved in the first seconds is not lost.**
  - **Defect it prevents:** Settings and Profile update the signed-in user with `login({ ...user, change })`. If `user` is not loaded yet, that creates a user object with no id. That cannot happen today, but it could once pages mount before `/profile/me` answers.
  - **Accept:**
    - A name, bio, goal or avatar change saved before `/profile/me` answers shows in the nav bar once it answers. It is not overwritten by the older answer.
    - A partial user object (no `id`) never exists.
    - A profile edit no longer re-registers web push. Today every `login(...)` call re-registers it, which was a side effect, not a feature.

### Privacy
- [ ] **R-05 Signing out forgets the previous account's data** (F-71, proposed id; new finding in this design).
  - **Defect:** the website keeps GET responses in memory for 60 s (`api.js` cache). Signing out (`AuthContext.logout`) does not clear that memory and does not reload the page. If another person signs in on the same tab within 60 s, pages served from that memory (`/userbooks/`, `/notes/me`, `/profile/me` and others) show **the previous account's** data. A background refresh updates only the memory, not the screen.
  - **Accept:**
    - After Sign out, a GET made with the next account's token returns that account's data, never a remembered response.
    - Signing in also clears the memory, which closes the gap where a request sent before sign-out answers after it.

### Second waits on three pages (F-70 and the same pattern)
- [ ] **R-06 Circle page (F-70).**
  - **Accept:**
    - With `GET /groups/{id}` held back 2 s, the `members`, `leaderboard`, `goal`, `posts` and `activity` requests all start at least 1 s before it answers.
    - A curator's pending-requests call starts as soon as the circle answers, without waiting for the other five. A non-curator never calls it (as today).
    - **Failure behaviour is unchanged:** for an unknown circle, or a private circle you are not in, the reader sees the same error toast and goes back to `/groups`. No section content from that circle is ever shown. The five parallel requests get the same 403/404 from the server and are discarded.
- [ ] **R-07 Book detail, opened directly or refreshed (F-70b, same pattern).**
  - **Accept:** with `GET /userbooks/` held back 2 s, `GET /notes/userbook/{id}` starts at least 1 s before it answers. Opening a book from the Library (which passes the book along) behaves as today.
- [ ] **R-08 A friend's profile (F-70c, same pattern).**
  - **Accept:**
    - With `GET /profile/{id}` held back 2 s, the books, notes, 30- and 90-day activity and stats requests start at least 1 s before it answers.
    - **A locked private profile shows exactly what it shows today:** no books, notes, activity or stats. The server refuses those four requests (403), and the page discards them.

### Proof in production
- [ ] **R-09 Release check.**
  - **Accept:**
    - After the web deploy, `node qa/page_perf.mjs` reports a waterfall line per signed-in page.
    - Every signed-in page except `/admin` and `/onboarding` shows its first own request starting before `/profile/me` finishes.
    - Desktop first-visit "ready" matches the "after" column in architecture.md within ±0.5 s, or is at least 0.8 s faster than 2026-09-19. If F-68 has shipped in between, the waterfall rule alone is the gate, against a fresh baseline.
- [ ] **R-10 Tests prove the order, not just the result.**
  - **Accept:**
    - `qa/web_4d_local.mjs` implements the L-4D cases in architecture.md. Each Critical or Major case goes red under its named one-line mutation.
    - `qa/web_4a_local.mjs` stays 25/25, and `npm run build` and lint are unchanged (lint 36/7).

## Screen States
| State | Trigger | What the reader sees (after 4D) | Today |
|---|---|---|---|
| loading | a signed-in page is opened or refreshed | nav bar (avatar shows initials `?` until identity arrives) + the page's own skeleton | full-screen "Loading..." for 1.5–1.9 s, then the nav bar and skeleton |
| default | page data arrived | unchanged | unchanged |
| identity pending | `/profile/me` not answered yet, page data already here | page content; own-post Edit/Delete, the nav avatar and the Admin link appear when identity arrives | (not reachable) |
| own profile by id | `/profile/{myId}` | skeleton until identity arrives, then `/profile` | "Loading..." then `/profile` |
| admin | `/admin` | "Loading..." until the server answers, then the admin page or `/home` | same |
| expired token | any signed-in URL | login page at `/`, token removed | same |
| `/profile/me` 5xx or offline | any signed-in URL | login page, token removed (the page may flash for a moment first) | login page, token removed |
| error (page call) | a page's own call fails | unchanged per page | unchanged |
| Render cold start (~30 s) | first request after 15 min idle | the nav bar and page skeleton, instead of "Loading..." (every request waits for the wake-up either way) | "Loading..." |

## Parity
- [x] Web: the only client changed.
- [x] **Android needs nothing** (evidence in architecture.md, "Android finding"):
  - `App.js:90-133` preloads 9 requests together, `/profile/me` among them, with `Promise.allSettled`, and checks sign-in from the stored token alone (`api.js:74`). There is no identity-first stage.
  - `GroupDetailScreen.js:315-344` loads the circle and its 7 sections in one `Promise.all`.
  - `UserProfileScreen` uses one `Promise.allSettled`.
  - `BookDetailScreen` receives the book from navigation.
  - The app's remaining wait is F-68's per-query cost. No parity debt.

## Privacy and ownership
- **No new data reaches anyone.** Every request a page now sends earlier is a request it already sent. Each one authenticates on its own (`get_current_user`) and runs the same privacy gate as before:
  - circle sections: private-circle membership
  - friend's-profile content: `is_private_profile` + follow
  - book notes: owner only
- The "who is signed in?" wait was never a security check. It only decided what to draw.
- **The shared-browser leak in R-05 exists today** and is closed here.
- **Notifications:** none added or changed.

## Done checklist (PM clicks, after the web deploy)
1. Open `https://www.trackmyread.com/home` signed in, with DevTools → Network open. The feed request starts at the same moment as `profile/me`, not after it.
2. Open your Review Circle. `members`, `leaderboard`, `goal`, `posts` and `activity` start together with `groups/{id}`.
3. Sign out, then sign in as a different Google account in the same tab within a minute, and open Library. Only the second account's books appear.
4. In a private window, open `https://www.trackmyread.com/profile/<your own id>`. You land on your own profile page and never see a Follow button on yourself.
5. As a non-admin, open `/admin`. You go to `/home`, and the Network panel shows no `/admin/` request.

## Escalations
Five product calls (E-1 to E-5), each with a recommendation, are in architecture.md under "Escalations". The build can proceed on the recommendations.
