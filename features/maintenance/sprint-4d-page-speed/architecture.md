---
screen: sprint-4d-page-speed
feature: maintenance
repo: web only
status: architecture-complete
spec_status: DRAFT, awaiting PM approval (spec.md; Architect wrote it with the PM Helper's duty, 2026-09-20)
architect_verified: 2026-09-20 (code read at e6ede32 on master; Sprint 4C branch `sprint-4c-local-day` at f0867fd checked for overlap)
---

## Risk Summary (for PM)

- **What changes.** Signed-in web pages start loading their own data at the same moment as the "who is signed in?" call, instead of after it (F-69). The circle page, book detail and a friend's profile also stop waiting on one call before starting the rest (F-70 and the same pattern).
- **Expected result:** about 1–3 s faster per signed-in page, for example the circle page 6.4 s → ~3.3 s and Home 5.4 s → ~3.7 s. No API, database or Android change.
- **What users will notice.** For the first second or so, the nav avatar shows `?`, and your own posts' Edit/Delete menu appears a moment after the post. `/admin` and `/onboarding` still wait, on purpose.
- **Privacy fix included (F-71, new):** today, if you sign out and someone else signs in on the same tab within a minute, they can briefly see your library and notes. Sign-out and sign-in now clear that memory.
- **Could break:** sign-in redirects. Each outcome (no token, expired token, server error, admin, your own profile) has a Critical test that is proven to fail if the code is broken.
- **Your actions:** approve the spec; after the web deploy, run `node qa/page_perf.mjs` (or ask for it). Rollback = promote the previous Vercel deployment.
- **Decisions needed:** none block the build. E-1..E-5 below carry recommendations. The biggest remaining speed-up is still F-68 (region move).
- **Recommendation:** approve.

---

## Data Flow

**Today.**
1. `AuthProvider` (`context/AuthContext.jsx:48-61`) calls `getMyProfile()` on boot.
2. `App` (`App.jsx:74-78`) returns a full-screen "Loading..." while `loading` is true. `PrivateRoute` (`:44-53`) repeats the gate.
3. So no page component mounts, and no page `useEffect` runs, until `/profile/me` has answered.
4. The page then fires its own calls.
- **Measured** (report Analysis §2): `/home` 298→1833 ms `/profile/me`, then 1917→5301 page calls.

**After.**
1. `AuthProvider` still calls `getMyProfile()` on boot, but routes render at once when a token is stored.
2. Page effects fire in the same commit. React runs child effects before the provider's, so page calls actually leave first.
3. `useAuth().user` is `null` until `/profile/me` answers, and identity-dependent UI waits for it.
4. `/admin` and `/onboarding` still wait.

**Circle, book detail, friend's profile.** The dependent calls start together with the parent call. Results are applied only after the parent succeeds, so failure paths are unchanged.

## Where F-69 and F-70 live (proof from code)
| Finding | Location | Mechanism |
|---|---|---|
| F-69 | `App.jsx:74-78` | `if (loading) return <div>Loading...</div>` before `<Routes>`: no route element exists while `/profile/me` is in flight |
| F-69 | `App.jsx:44-53` `PrivateRoute` | the same gate, again. `AdminRoute :63-69` and `OnboardingRoute :55-61` return `null` while loading |
| F-69 | `AuthContext.jsx:45-61` | `loading` starts `true`, and becomes `false` only in `.finally` of `getMyProfile()` |
| F-70 | `GroupDetailPage.jsx:526-554` | `const g = await getGroup(id)` (`:529`), then `Promise.all` of 5 (`:532-538`), then, for a curator, `getPendingMembers` (`:547`). That is 3 serial stages for a curator |
| F-70b (same pattern) | `BookDetailPage.jsx:112-135` | on a refresh or direct link, `getUserbook` (`GET /userbooks/`) runs, then a second effect keyed on `userbook?.id` fetches `/notes/userbook/{id}`. The id is already in the URL |
| F-70c (same pattern) | `UserProfilePage.jsx:232-256` | `getPublicProfile(userId).then(p => Promise.all([5 calls]))`. The 5 need only `userId` from the URL |
| Why return visits are not faster | `api.js:8-42` | the GET cache is an in-memory `Map`; a reload empties it. No HTTP caching applies to authorised JSON |

The server never relied on this gate. Every endpoint a page calls authenticates on its own (`deps.get_current_user`, `deps.py:43-87`), or is optional-auth for public data (`/notes/feed`).

## Android finding (no package)
The app does **not** have the serial stages.
- **Startup.** `App.js:90-102` decides "logged in" from the stored token alone (`api.js:74`, `isLoggedIn = !!AsyncStorage.getItem('bt_token')`). It then runs `preloadData()` (`:105-133`), which sends `/profile/me` **together with** 8 other requests in one `Promise.allSettled` (`:107-117`). The splash waits for the slowest of the 9: one parallel stage, whose length is F-68's per-query cost.
- **Circle.** `GroupDetailScreen.js:315-344` sends the circle and 7 section calls in one `Promise.all`. A separate `getProfile` + `getMyBooks` effect (`:348-351`) runs alongside, not after.
- **Friend's profile.** `UserProfileScreen.js:106` uses one `Promise.allSettled` of 5.
- **Book detail.** The screen gets the userbook from navigation (`BookDetailScreen.js:68`), and `loadNotes` (`:87-94`) needs only `ub.id`.
- **Minor, not worth a build on their own:**
  - `GroupDetailScreen` calls `/pending` for every visitor (a 403 for non-curators, swallowed).
  - It re-fetches `/profile/me` instead of reading `PreloadContext`.
  - These add requests, not waiting stages.
- **Result:** no Android package. Sprint 4C's 2.2.3 (`sprint-4c-local-day`) is unaffected. Android speeds up only with F-68.

## Call-site inventory

### Identity consumers (`useAuth`) and what each does after 4D
| File:line | Uses | While `user` is null (pending) | Change |
|---|---|---|---|
| `App.jsx:74-78` | `loading` | — | **remove the app-wide gate** (A) |
| `App.jsx:82` `/` route | `user` | token stored → `/home` at once | `user \|\| loading` (A) |
| `App.jsx:44-53` `PrivateRoute` | `user, loading` | renders the page | **optimistic render** (A) |
| `App.jsx:55-61` `OnboardingRoute` | `user, loading` | waits (its only call is `/profile/me`) | show the same "Loading..." as today (A) |
| `App.jsx:63-69` `AdminRoute` | `user.is_admin` | **waits** for this load's answer | show the same "Loading..." as today (A) |
| `components/Nav.jsx:17,38-40,78,100-103` | `user?.name`, `is_admin`, `profile_picture` | initials `?`, no Admin link | none (already null-safe) |
| `pages/HomePage.jsx:716,766,788,839-840` | composer avatar, optimistic post author, `currentUserId`, `isAdmin` | avatar `?`; own-post menu hidden | **guard `isOwn` at `:62`** (A) |
| `pages/GroupDetailPage.jsx:290` (`NewPostModal`) | avatar | `?` | none |
| `pages/GroupDetailPage.jsx:488,934` | `isOwn={post.user?.id === user?.id}` | `undefined === undefined` is **true** for an authorless post | **guard** (B) |
| `pages/InsightsPage.jsx:205` | `user` (unused) | — | **none** (4C file; do not touch) |
| `pages/ProfilePage.jsx:230,241` (`EditBioModal`) | `login({...user, name, bio})` | would create a user without an id | **`updateUser`** (A) |
| `pages/ProfilePage.jsx:445,462,473` | `getUserBooks(user?.id)`, deps `[user?.id]` | `/userbooks/user/undefined` → 422, then a refetch | **`getMyBooks()`, deps `[]`** (A) |
| `pages/ProfilePage.jsx:496,534,577` | `login({...user, profile_picture})`, avatar, `@username` | as above; avatar and username render guarded | **`updateUser`** (A) |
| `pages/SettingsPage.jsx:85,170,186,208` | `login({...user, …})` ×3 | would create a user without an id | **`updateUser`** (A) |
| `pages/UserProfilePage.jsx:213,230,233,594` | `isOwnProfile`, `me?.is_admin` | "is this me?" unknown | **skeleton until known** (B) |
| `pages/LoginPage.jsx:34,44` | `login(data.user)` | — | none |
| `components/AppTour.jsx`, `pages/OnboardingPage.jsx`, `AdminPage.jsx`, `CreateGroupPage.jsx` | no `useAuth` (`CreateGroupPage:50` `user` is a parameter) | — | none |

### `GET /profile/me` callers on web
- `AuthContext.jsx:51`: the boot call. It stays; it is no longer awaited by routes.
- `ProfilePage.jsx:460`, `SettingsPage.jsx:157`: each page's own copy for its form or header. **Unchanged.** Today these pages already send `/profile/me` twice: the boot call, plus the page's cache hit that revalidates in the background (`api.js:34`). After 4D both go out together, so the count is unchanged.

### Requests each signed-in route sends at mount (the L-4D-02 table)
"Early" = must start ≥ 1 s before a 2 s-held `/profile/me` answers. The Nav's `GET /notifications/unread-count` is sent on every route inside `AppLayout`.
| Route | Page component → requests at mount | Early after 4D |
|---|---|---|
| `/home` | `/notes/feed` (`HomePage:748`), `/userbooks/` (composer `:358`), `/books/recommendations` (`:554`), `/users/following` + `/userbooks/friends/currently-reading` (`:602-605`) | all 5 + unread |
| `/library` | `/userbooks/` (`LibraryPage:802`), `/reading-activity/daily?days=7` (sidebar `:741`) | all + unread |
| `/library/book/:id` (direct) | `/userbooks/` (`BookDetailPage:112`), `/notes/userbook/:id` | both + unread (the second needs R-07) |
| `/search` | none | unread |
| `/groups` | `/groups/my`, `/groups/discover`, `/groups/invites/pending`, `/groups/my/pending` (`GroupsPage:154-169`) | all + unread |
| `/groups/:id` | `/groups/:id`, `members`, `leaderboard?period=monthly`, `goal`, `posts`, `activity`; curator: `pending` after `/groups/:id` | all 6 + unread (5 need R-06); `pending` excluded |
| `/groups/new` | none | unread |
| `/join/:code` | `POST /groups/join/:code` (`JoinGroupPage:15`) | POST + unread |
| `/insights` | `/reading-activity/insights` | + unread |
| `/notifications` | `/notifications/history` | + unread |
| `/profile` | `/profile/me` (page copy), `/notes/me`, `/userbooks/`, `/reading-activity/daily?days=30`, `/reading-activity/insights` | all + unread (needs the `getMyBooks` change) |
| `/profile/:friend` | `/profile/:id`, `/userbooks/user/:id`, `/notes/user/:id`, `/reading-activity/user/:id/daily?days=30` and `?days=90`, `/users/:id/stats` | all 6 + unread (5 need R-08) |
| `/settings` | `/profile/me` (page copy), `/notifications/prefs` | + unread |
| `/onboarding` | none (route waits) | **deliberately waits** |
| `/admin` | `/admin/stats`, `/admin/users`, … (`AdminPage:53`) | **deliberately waits; zero `/admin/*` before the answer** |
| `/`, `/about`, `/privacy`, `/terms`, `/blog*` | none | render without the "Loading..." screen |

## depends_on
- `deps.get_current_user` / `get_current_user_optional` / `get_admin_user` (unchanged). Each early request authenticates by itself.
- The server's privacy gates on the early requests (unchanged, verified):
  - `groups_router.py`: `get_group :457-459`, `get_members :591-593`, `get_group_posts :812-814`, `get_leaderboard :913-915`, `get_goal_progress :1010-1012`, `get_group_activity :1104-1106`. All six use the same `g.is_private and not _is_member` rule → 403; `_group_or_404` → 404.
  - The friend's-profile content uses the same "private and not followed → 403" rule as the `locked` flag in `profile_router.get_public_profile :201-248`: `userbooks_router.get_user_books :478-497`, `notes_router.get_public_notes_for_user :394-410`, `reading_activity_router.get_user_daily_reading_stats :202-220`, `users_router.get_user_stats :180-204`.
  - `notes_router.get_notes_for_userbook :466-476`: owner only → 404.
- `api.js` behaviour (unchanged; 4C owns the file):
  - a 401 carrying a token → `clearToken()` + `window.location.href = '/'`, resolving `undefined` (`:54-66`)
  - `cacheClear()` is exported (`:19-23`)
- React Router DOM 7 `BrowserRouter`, React 19 `StrictMode` (dev double-invokes mount effects; the harness tolerates it).

## depended_by
- **No API contract changes.** No response shape, route or auth level changes.
- `GET /userbooks/user/{id}` loses one web consumer (`ProfilePage`). It keeps `UserProfilePage` and Android `UserProfileScreen`, so the endpoint stays.
- **Web convention that changes** (recorded in `dependency-map.md` → `GET /profile/me`, and for Doc Sync in `LOAD_ME_FIRST` CRITICAL PATTERNS):
  - a signed-in page mounts before identity is known
  - never build a request from `useAuth().user`
  - any identity-dependent control must treat `user === null` as "not yet known" and show nothing

## API Endpoints Used
No endpoint is added, removed or changed. The list above is the set of calls whose **timing** changes. Auth levels are unchanged.

## DB Tables Touched
None. **No migration. No `models.py` change.** (Checked: no requirement needs a column, index or query change.)

## Notifications Fired
None added or changed. A side effect is removed: `login()` schedules `registerWebPush()` (`AuthContext.jsx:63-67`), and the 5 profile-edit call sites called `login()`. They now call `updateUser()`, so a profile edit no longer re-posts `/notifications/web-subscribe`. Sign-in and page load still register (F-27 unchanged).

## Cross-Client Impact
Web only. No `app.json` bump. The backend is untouched, so Android 2.2.2 and the 2.2.3 build see no difference.

---

# Technical Brief

House rules for every snippet: no new `console.*` outside `import.meta.env.DEV`; no edit to `src/services/api.js`, `src/pages/InsightsPage.jsx`, `src/pages/PrivacyPage.jsx` or `src/utils/localDate.js` (Sprint 4C); no `localStorage` writes of profile data.

## Package WEB-A: identity no longer gates the page (F-69, R-01..R-05)
**Files (exclusive):**
- `book-tracker-frontend-stitch/src/context/AuthContext.jsx`
- `src/App.jsx`
- `src/pages/ProfilePage.jsx`
- `src/pages/SettingsPage.jsx`
- `src/pages/HomePage.jsx`

### A-1 · `context/AuthContext.jsx`
```jsx
import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { getToken, clearToken, cacheClear, getMyProfile, getVapidPublicKey, webSubscribe, webUnsubscribe } from '../services/api';
…
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // true only while a stored token is being checked by /profile/me. Signed-in pages no longer wait
  // for it (F-69): only /admin and /onboarding do. With no token it starts false, so "/" never
  // sends a signed-out visitor to /home.
  const [loading, setLoading] = useState(() => !!getToken());
  const answered = useRef(!getToken());   // has this load's /profile/me answered?
  const earlyPatch = useRef(null);        // profile edits saved before it answered (R-04)

  useEffect(() => {
    if (!getToken()) return;
    getMyProfile()
      .then((data) => {
        answered.current = true;
        setUser(data && earlyPatch.current ? { ...data, ...earlyPatch.current } : data);
        earlyPatch.current = null;
        registerWebPush();
      })
      .catch(() => clearToken())                      // unchanged: a failed check signs out (E-5)
      .finally(() => { answered.current = true; setLoading(false); });
  }, []);

  const login = (userData) => {
    cacheClear();                                     // F-71: nothing cached before this sign-in is served to it
    setUser(userData);
    setTimeout(registerWebPush, 500);
  };

  // A saved profile edit (name, bio, yearly_goal, profile_picture). Never creates a user object:
  // before /profile/me answers, the edit is held and laid over its answer.
  const updateUser = (patch) => {
    if (!answered.current) earlyPatch.current = { ...(earlyPatch.current || {}), ...patch };
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const logout = () => {
    const token = getToken();                          // F-03 web: capture before clearing
    clearToken();
    cacheClear();                                      // F-71: the next account in this tab must not get this one's GETs
    localStorage.removeItem(NOTE_VISIBILITY_KEY);      // E2: the next account must start at "Only me"
    setUser(null);
    unregisterWebPush(token);                          // fire-and-forget; DELETE is never cached
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}
```
- **Behaviour on each outcome:**
  - **401:** `api.js` clears the token and assigns `location.href = '/'`, then resolves `undefined`. `setUser(undefined)` then `registerWebPush()` returns at once, because there is no token. The reload lands on the login page. Same as today.
  - **5xx or network error:** `.catch` clears the token, then `loading` → false with `user` null. `PrivateRoute` navigates to `/`. Same end state as today.
  - **Success:** as today, plus any early patch.
- The old `else { setLoading(false) }` branch goes. `loading` starts false when there is no token.
- The `login` cacheClear is belt and braces. A GET sent just before sign-out can answer after `logout`'s clear and re-fill the cache. Google sign-in takes seconds, so clearing again at sign-in removes it.

### A-2 · `App.jsx`
```jsx
function FullScreenLoading() {           // today's "Loading..." markup, extracted unchanged
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <span className="text-on-surface-variant font-sans">Loading...</span>
    </div>
  )
}

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (!user && !loading) return <Navigate to="/" replace />
  // F-69: render while the stored token is still being checked. Each request the page sends carries
  // the token and is checked by the server; a 401 sends the browser to "/" (api.js). ONE return path:
  // a different element here while loading would re-mount the page and repeat every request.
  return <AppLayout>{children}</AppLayout>
}

function OnboardingRoute() {
  const { user, loading } = useAuth()
  if (loading) return <FullScreenLoading />
  if (!user) return <Navigate to="/" replace />
  return <OnboardingPage />
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <FullScreenLoading />   // is_admin comes only from this load's /profile/me, never assumed
  if (!user) return <Navigate to="/" replace />
  if (!user.is_admin) return <Navigate to="/home" replace />
  return <AppLayout>{children}</AppLayout>
}

export default function App() {
  const { user, loading } = useAuth()     // the app-wide "Loading..." gate (:74-78) is removed
  return (
    <Routes>
      <Route path="/" element={user || loading ? <Navigate to="/home" replace /> : <LoginPage />} />
      …every other route unchanged…
```
- **`loading` is true only with a stored token.** So `/` with an invalid token goes to `/home`, gets a 401, and the reload lands on the login page without the token. No loop: the reload has no token, so `loading` is false.
- **Visual changes:**
  - `OnboardingRoute` and `AdminRoute` show today's "Loading..." instead of `null`. Today the app-wide gate drew it.
  - Public pages render at once for signed-in visitors.

### A-3 · `pages/HomePage.jsx`
- `:62`: `const isOwn = currentUserId != null && (post.user?.id === currentUserId || post.user_id === currentUserId)`. While identity is unknown, no post is "own". Without the guard, a post with `user: null` would compare `undefined === undefined`.
- Nothing else. The composer `Avatar` and `handleNewPost` are null-safe. A post made in the first second shows the name "User" until reload, which is cosmetic and accepted (E-1).

### A-4 · `pages/ProfilePage.jsx`
- `:459-473`:
  ```js
  const load = () => Promise.all([
    getMyProfile(),
    getMyNotes(),
    getMyBooks(),        // was getUserBooks(user?.id): the same rows for your own id (both filter user_id = me,
                         // same ORDER BY; /userbooks/ adds only private fields), and it needs no identity (F-69)
    getMyActivity(30),
    getReadingInsights(),
  ])…
  useEffect(() => { load() }, [])   // was [user?.id]: a refetch when identity arrived would repeat 5 requests
  ```
  - Imports: add `getMyBooks`, and remove `getUserBooks` if unused.
  - The render reads only `status`, `current_page`, `book.{title,author,total_pages,cover_url}` (`:508`, `:721-728`). Both endpoints supply these.
- `:230,241` `EditBioModal`: `const { user, updateUser } = useAuth()`, and `updateUser({ name: updated.name, bio: updated.bio })`.
- `:445,496`: `const { user, updateUser, logout } = useAuth()`, and `updateUser({ profile_picture })`. `login` is no longer destructured.

### A-5 · `pages/SettingsPage.jsx`
- `:85`: `const { updateUser, logout } = useAuth()`. `user` and `login` go if unused after the three edits. Lint must not grow.
- `:170`: `updateUser({ profile_picture: url })`
- `:186`: `updateUser({ profile_picture })`
- `:208`: `updateUser({ name: updated.name, bio: updated.bio, yearly_goal: updated.yearly_goal })`

## Package WEB-B: dependent calls start with their parent (F-70, F-70b, F-70c) + identity guards on these pages
**Files (exclusive):**
- `src/pages/GroupDetailPage.jsx`
- `src/pages/BookDetailPage.jsx`
- `src/pages/UserProfilePage.jsx`

### B-1 · `pages/GroupDetailPage.jsx`
- **`:524`** (DEV-gate the log, because the parallel refusals on a private circle would otherwise print 5 warnings in production):
  ```js
  const safe = (fn, label) => fn.catch(e => { if (import.meta.env.DEV) console.warn('[Group]', label, e?.message); return null; })
  ```
- **`load`, `:526-554`:**
  ```js
  const load = async () => {
    setLoading(true)
    const id = parseInt(groupId)
    // F-70: the five sections need only the id, so they start with the circle, not after it. Each has the
    // same private-circle gate as GET /groups/{id}; if the circle is refused they are simply never shown.
    const sections = () => Promise.all([
      safe(getGroupMembers(id), 'members'),
      safe(getGroupLeaderboard(id, leaderPeriod), 'leaderboard'),
      safe(getGroupGoal(id), 'goal'),
      safe(getGroupPosts(id), 'posts'),
      safe(apiFetch(`/groups/${id}/activity`), 'activity'),
    ])
    const early = sections()
    try {
      const g = await getGroup(id)
      const pend = g?.membership_role === 'curator' ? safe(getPendingMembers(id)) : null   // curators only, as today
      const [m, lb, gl, p, act] = await (early || sections())
      setGroup(g)
      setMembers(m || [])
      setLeaderboard(lb || [])
      setGoal(gl || null)
      setPosts(p || [])
      setActivity(act || [])
      if (pend) setPending((await pend) || [])
    } catch (e) {
      toast(e.message || 'Group not found', 'error')
      navigate('/groups')
    }
    setLoading(false)
  }
  ```
  - `early` never rejects, because every element is `safe`. An abandoned `early` therefore causes no unhandled rejection.
  - `setGroup` moves after the five. The `loading` skeleton hides the page until `setLoading(false)` either way, so nothing renders differently.
  - `load()` is still re-run by `handleApprove` (`:598`), unchanged.
- **`:934`:** `isOwn={user?.id != null && post.user?.id === user.id}`.

### B-2 · `pages/BookDetailPage.jsx`
Replace the notes effect, `:128-135`:
```js
  // F-70b: notes need only the id in the URL, so they load alongside the userbook, not after it.
  // /notes/userbook/{id} is owner-only (404 otherwise); a foreign id is sent back to /library by the effect above.
  useEffect(() => {
    const id = parseInt(userbookId, 10)
    if (!id) return
    setLoadingNotes(true)
    getNotesForBook(id)
      .then(data => setNotes(data || []))
      .catch(() => {})
      .finally(() => setLoadingNotes(false))
  }, [userbookId])
```
The URL id equals `state.userbook.id` on both navigations into this page (`LibraryPage.jsx:914`, `BookPreviewModal.jsx:142`), so the Library path behaves as today.

### B-3 · `pages/UserProfilePage.jsx`
- **Effect, `:232-256`:**
  ```js
  useEffect(() => {
    if (isOwnProfile) { navigate('/profile', { replace: true }); return }

    const safe = (p) => p.catch(() => null)
    // F-70c: the content needs only the id in the URL, so it starts with the profile, not after it. Each call
    // has the same private-profile gate as /profile/{id}: a locked profile gets 403s, and they are discarded below.
    const content = () => Promise.all([
      safe(getUserBooks(userId)),
      safe(getUserNotes(userId)),
      safe(getUserActivity(userId, 30)),
      safe(getUserActivity(userId, 90)),
      safe(getUserStats(userId)),
    ])
    const early = content()

    getPublicProfile(userId).then(p => {
      setProfile(p)
      setIsFollowing(p.is_following || false)
      if (p.locked) { setLoading(false); return }     // unchanged: nothing from `early` is used
      return (early || content()).then(([b, n, a30, a90, s]) => {
        setBooks(b || [])
        setNotes(n || [])
        setActivity30(a30 || [])
        setActivity90(a90 || [])
        setStats(s || null)
      })
    }).catch(() => {}).finally(() => setLoading(false))
  }, [userId, isOwnProfile])
  ```
- **`:321`:** `if (loading || !me) {`. The skeleton stays until identity is known, so your own id never renders as someone else's profile (R-03). This costs no time: `me` arrives in parallel.
- **Own-id visit on a cold load:** the first run fetches your own public profile (harmless: your own data). When `me` arrives, `isOwnProfile` flips and the effect re-runs into `navigate('/profile')`.
- **Friend's id:** `isOwnProfile` stays false, so there is no re-run.
- **`toggleFollow`'s content load (`:301-313`)** is unchanged.

## Package QA: order tests and a production waterfall
**Files (exclusive):**
- `qa/web_4d_local.mjs` (new)
- `qa/page_perf.mjs`

### QA-1 · `qa/web_4d_local.mjs`
Same conventions as `qa/web_4a_local.mjs`:
- refuses production hosts (exit 5)
- preconditions → exit 6:
  - local API `/version` commit null
  - dev server started with `--mode localapi` (served `api.js` references `--api`)
  - review-login for reader and friend
  - Review Circle and userbooks seeded
- `PASS`/`FAIL` lines, `--only`, secret never printed
- defaults `--web http://127.0.0.1:5174 --api http://127.0.0.1:8765`
- `seedAuth(context, token)` as in 4A
- `callApi(page, name, …)`: copy the 4A helper

**Two helpers make the order observable:**
```js
// Hold a response back: the SERVER answers now (so server-side order is real), the BROWSER sees it `ms` later.
async function hold(context, test, ms) {
  await context.route(u => test(new URL(u)), async route => {
    if (route.request().method() !== 'GET') return route.continue()
    const resp = await route.fetch()
    await new Promise(r => setTimeout(r, ms))
    await route.fulfill({ response: resp })
  })
}
// Every API request: start and end in ms from navigation, method, path + search, status.
function timeline(page, t0) {
  const rows = [], open = new Map()
  page.on('request', q => { if (q.url().startsWith(API)) open.set(q, Date.now() - t0) })
  page.on('response', r => { const q = r.request(); if (open.has(q)) q.__status = r.status() })
  const end = q => { if (!open.has(q)) return; const u = new URL(q.url())
    rows.push({ m: q.method(), p: u.pathname + u.search, start: open.get(q), end: Date.now() - t0, status: q.__status }); open.delete(q) }
  page.on('requestfinished', end); page.on('requestfailed', end)
  return rows
}
```
- **The "held" call answers at T.** A call is **early** when `start ≤ T − 1000`.
- The unmodified code cannot pass this: its page calls start only after T.
- In StrictMode dev, mount effects run twice, so use the **first** occurrence of each path.
- **"No re-fire"** = no page path (the route's own paths from the call-site table) has an occurrence with `start > T`, except where noted.

**Cases.** Each Critical or Major case names its one-line mutation. Rule: the case is accepted only once the Builder has applied the mutation in a scratch copy, seen the case go FAIL, and reverted. Record each in build notes. Mutations marked (api.js) or (server) change files 4D does not ship. They are applied only in the scratch copy.

| ID | Sev | R | Setup → assertion | Mutation that must turn it red |
|---|---|---|---|---|
| L-4D-01 | Critical | R-01 | reader; hold `/profile/me` 2000 ms; open `/home` → `/notes/feed`, `/books/recommendations`, `/userbooks/`, `/users/following`, `/userbooks/friends/currently-reading` are early; the feed renders ≥ 1 post before T | M-01 `App.jsx`: first line of `App()` after `useAuth()` → `if (loading) return <FullScreenLoading />` |
| L-4D-02 | Critical | R-01 | for every row of the call-site table except `/onboarding` and `/admin`: hold `/profile/me` 2000 ms → each listed path is early; no listed path re-fires after T; no response ≥ 400 (except `/join` "already a member", when the reader is one) | M-02 `PrivateRoute`: add `if (loading) return <FullScreenLoading />`. M-03 `PrivateRoute`: `return <AppLayout key={user ? 'in' : 'pending'}>…` (re-mount at T → re-fire). M-04 `ProfilePage`: `getMyBooks()` → `getUserBooks(user?.id)` (422 + no books) |
| L-4D-03 | Critical | R-02 | no token; open `/`, then `/home` → login page visible (Google button container), final path `/`, 0 requests carrying `Authorization`, ≤ 2 document loads in 5 s | M-05 `AuthContext`: `useState(() => !!getToken())` → `useState(true)` (`/` → `/home` → 401 → reload loop) |
| L-4D-04 | Critical | R-02 | `bt_token = 'invalid.token.value'`; for each of `/`, `/home`, `/groups/{circle}`, `/join/{code}` → within 8 s: final path `/`, login visible, `localStorage.bt_token === null`, ≤ 3 document loads | M-06 (api.js, scratch only): delete `clearToken();` in `apiFetchRaw`'s 401 branch → endless reload |
| L-4D-05 | Critical | R-02 | reader; `route.fulfill({status: 500})` for `GET /profile/me` → within 6 s: final path `/`, login visible, token removed | M-07 `PrivateRoute`: delete `if (!user && !loading) return <Navigate to="/" replace />` (stays on a signed-out `/home`) |
| L-4D-06 | Critical | R-03 | friend (non-admin); hold `/profile/me` 2000 ms; open `/admin` → final path `/home`; **0** requests whose path starts `/admin/` at any time | M-08 `AdminRoute`: `if (loading) return <FullScreenLoading />` → `if (loading) return <AppLayout>{children}</AppLayout>` |
| L-4D-07 | Critical | R-03 | reader; hold `/profile/me` 2000 ms; open `/profile/{reader.id}`; sample the DOM every 100 ms → no button named Follow / Follow Back is ever visible; final path `/profile` | M-09 `UserProfilePage`: `if (loading \|\| !me)` → `if (loading)` |
| L-4D-08 | Major | R-03 | reader; hold `/profile/me` 2000 ms; `route.fulfill` `/notes/feed` with 2 stub posts: one `{user: null, user_id: 999999}`, one by the reader → before T, no post has its "more" menu; after T, only the reader's post has it | M-10 `HomePage:62`: remove `currentUserId != null && ` |
| L-4D-09 | Major | R-04 | reader; save the profile via API first; hold `/profile/me` 3000 ms; on `/settings` type name "Zed Quill" and Save before T → after T + 500 ms, the Nav avatar initials read `ZQ`; restore the profile via API | M-11 `AuthContext`: `setUser(data && earlyPatch.current ? {…} : data)` → `setUser(data)` |
| L-4D-10 | Critical | R-05 | reader opens `/library` (fills the `/userbooks/` cache); Nav → Sign out; then in page `callApi('setToken', friendToken)` and `callApi('getMyBooks')` within 10 s → the ids equal friend's `GET /userbooks/` (fetched directly), not the reader's | M-12 `AuthContext.logout`: delete `cacheClear();` |
| L-4D-11 | Critical | R-06 | reader (curator of Review Circle); hold exactly `/groups/{circle}` 2000 ms; open it → `members`, `leaderboard`, `goal`, `posts`, `activity` early; `/pending` requested ≥ 1 time and only after T. As friend (member, not curator): `/pending` never requested | M-13 `GroupDetailPage`: `const early = sections()` → `const early = null` |
| L-4D-12 | Critical | R-06 | setup: reader creates a private circle via API; friend opens `/groups/{private}`; sample every 100 ms → the circle's name is never in the DOM; within 6 s the final path is `/groups`; the 5 section responses all have status 403; teardown: delete the circle | M-14 `GroupDetailPage` catch: delete `navigate('/groups')`. M-15 (server, scratch only): delete the `raise` in `groups_router.get_members` (`:593`) → a section response is 200 |
| L-4D-13 | Major | R-07 | reader; hold `/userbooks/` 2000 ms; open `/library/book/{ub}` directly → `/notes/userbook/{ub}` early; the notes section renders after T | M-16 `BookDetailPage` notes effect: insert `if (!userbook?.id) return` as its first line |
| L-4D-14 | Major | R-08 | reader; hold `/profile/{friend}` 2000 ms; open `/profile/{friend}` → the 5 content paths are early; books render after T. Sub-case: friend sets `is_private_profile: true` via API, and the reader unfollows via API if following → reader sees the locked panel; the 4 content responses are 403; restore both | M-17 `UserProfilePage`: `const early = content()` → `const early = null`. M-18 (server, scratch only): delete the `raise` in `userbooks_router.get_user_books` (`:496`) → sub-case red |
| L-4D-15 | Major | R-10 | `node qa/web_4a_local.mjs` → 25/25; `npm run build` ✓; `npm run lint` ≤ 36 problems / 7 errors (the F-65 baseline) | any 4A regression |

Fixtures created by L-4D-09/12/14 are restored in `finally`, as 4A's harness does. All data is local (K-21).

### QA-2 · `qa/page_perf.mjs`: a waterfall, so production proves the order
- `measure()`: push `start: inflight.get(q) - navStart` and `end: Date.now() - navStart` into each `done` entry (`:94`), and return `calls: done.map(({method, path, start, end, status}) => …)`. `path` is already the pathname only: no query string, no token.
- Row: add `calls` for the **cold** run only.
- Markdown: a new section `## Waterfall (first visit)`. One row per signed-in page and profile:
  - `/profile/me` start–end
  - the earliest other call's start, excluding `/notifications/unread-count`
  - a verdict: `parallel` if that start < `/profile/me` end, else `SERIAL`
- `/admin` and `/onboarding` are expected to read `SERIAL` or `—`, and the table says so.
- The file stays read-only toward production (non-GET still aborted).

## Files NOT to touch
- `book-tracker-frontend-stitch/src/services/api.js`, `src/pages/InsightsPage.jsx`, `src/pages/PrivacyPage.jsx`, `src/utils/localDate.js`: Sprint 4C WEB.
- Everything under `app/` and `book-tracker-mobile-stitch/`.
- `context/supabase_migration.sql` (no migration).
- `src/components/Nav.jsx`: already null-safe.
- `src/pages/LoginPage.jsx`: `login()` keeps its signature.
- `AdminPage.jsx`, `OnboardingPage.jsx`: guarded by routes in `App.jsx`.

---

## Security review (identity and permissions)
1. **The gate removed was not a security control.** It decided what to draw. Every request a page sends is authenticated by the server on its own:
   - `get_current_user` → 401 for a missing, invalid or expired token, or a deleted user
   - `get_admin_user` → 403 for non-admins
   - each cross-user read runs its privacy gate (listed under depends_on)

   4D sends **no new request**, only the same requests earlier.
2. **Invalid or expired token.**
   - Each early request gets a 401. `api.js` clears the token and reloads to `/`, and the reload has no token, so it shows the login page (L-4D-04).
   - `/notes/feed` is optional-auth, so with a bad token it returns the anonymous community feed. That is public data any logged-out visitor gets, and it may show for an instant before the reload.
   - Nothing private is reachable.
3. **No identity is cached.** Nothing about the user is written to storage (ADR-001).
   - `is_admin`, the user's id and the "is this my profile?" answer come only from this page load's `/profile/me`.
   - `/admin` waits for it, and no `/admin/*` request leaves early (L-4D-06).
   - Admin-only buttons elsewhere appear only after it (HomePage `isAdmin`, UserProfilePage `me?.is_admin`), and the server re-checks every admin action.
4. **Wrong identity while pending: prevented where it matters.**
   - Your own profile by id shows a skeleton until identity is known (L-4D-07).
   - Own-post controls stay hidden until the id is known, including for authorless posts (L-4D-08). The server also enforces post ownership: note PUT/DELETE check `user_id`, and circle post DELETE returns 403 "Not allowed".
   - Circle curator and creator controls read the circle response's `membership_role` (`GroupDetailPage.jsx:521-522`), not `useAuth`.
5. **Shared browser.**
   - A reload starts with an empty memory and the token of whoever signed in last, so every response belongs to that account.
   - The one mixing path, sign-out then sign-in within 60 s in the same tab, exists **today** (F-71). It is closed by clearing the cache at sign-out and at sign-in (L-4D-10).
6. **Private circle / locked profile.** The early requests hit gates identical to the parent's (line refs in depends_on), so a refused parent means refused children. The client never renders children of a refused or locked parent. L-4D-12 and L-4D-14 assert the 403s, so a future server change that weakened a child gate would fail the harness.
7. **`/join/{code}` on an expired token.** The join POST now leaves before the identity check answers. It gets a 401 and changes nothing; with a valid token it is the same call as today.
8. **Cost.** A private-circle non-member visit and a locked-profile visit now send 5 and 4 refused requests: about 2–3 queries each, rare pages. There is no new unbounded query.
9. **Logs.** No new log line. The circle page's `safe` warning becomes DEV-only.

---

## Test strategy
- **Order is the thing proven.** Every Critical ordering case holds one response back (`hold`: the server answers now, the browser receives it later). It then asserts that the dependent requests *started* ≥ 1 s before the held answer arrived. Only the order can satisfy this, not the result. On today's code, L-4D-01/02/11/13/14 fail by construction.
- **Behaviour guards.** L-4D-03..10 and 12 protect what must not change: sign-in outcomes, admin, identity, privacy. Each has a one-line mutation proven to turn it red.
- **Existing suites.** `qa/web_4a_local.mjs` 25/25 (L-4D-15). `pytest tests -q` is not needed (no backend change), but must still pass if run.
- **Production.** R-09, below.

## Expected outcome (estimates from the 2026-09-19 production numbers)
**Model:**
- Today: `ready ≈ boot + ME + PAGE`. After: `ready ≈ boot + max(ME, PAGE)`.
- `boot` ≈ 0.3 s desktop (the waterfall's first request at 298–312 ms). `ME` ≈ 1.5–1.9 s.
- `PAGE` is the page's own chain, read from each page's "today" minus `boot + ME`, or from the waterfall where measured.
- **The saving is `min(ME, PAGE)`, plus each removed second stage.** "Ready" counts `/profile/me` itself, so no signed-in page can beat ≈ 1.9 s on desktop until F-68.
- **Phone "after"** = phone "today" minus the desktop saving. The API time dominates both.

| Page | Desktop today | Desktop after | Phone today | Phone after | Stages removed |
|---|---:|---:|---:|---:|---|
| Home `/home` | 5.40 s | ~3.7 s | 8.14 s | ~6.4 s | F-69 |
| Library | 3.11 s | ~1.9 s | 5.13 s | ~3.9 s | F-69 |
| Book detail (direct) | 4.71 s | ~2.0 s | 7.24 s | ~4.5 s | F-69 + F-70b |
| Search | 2.92 s | ~1.9 s | 4.88 s | ~3.9 s | F-69 |
| Circles `/groups` | 4.18 s | ~2.6 s | 5.74 s | ~4.2 s | F-69 |
| **Circle detail** | **6.38 s** | **~3.3 s** | **8.89 s** | **~5.8 s** | F-69 + F-70 (+ curator 3rd stage) |
| New circle | 2.90 s | ~1.9 s | 5.19 s | ~4.2 s | F-69 |
| Join via invite | 3.01 s | ~1.9 s | 4.82 s | ~3.8 s | F-69 |
| Insights | 3.19 s | ~1.9 s | 5.15 s | ~3.8 s | F-69 |
| Notifications | 3.37 s | ~2.1 s | 4.70 s | ~3.5 s | F-69 |
| My profile | 3.96 s | ~2.4 s | 6.36 s | ~4.8 s | F-69 |
| **Friend's profile** | **5.84 s** | **~2.6 s** | **7.79 s** | **~4.6 s** | F-69 + F-70c |
| Settings | 3.60 s | ~2.1 s | 5.87 s | ~4.4 s | F-69 |
| Onboarding | 1.87 s | 1.87 s | 3.64 s | 3.64 s | none (deliberate) |
| Admin (non-admin) | 4.56 s | ~4.5 s | 8.01 s | ~8.0 s | none (deliberate) |

**With F-68 as well:** `ME` drops to ~0.35 s and every `PAGE` shrinks the same way, so most signed-in pages land near 1 s on desktop.

**Production re-measure (release check, R-09):**
1. Record `GET /version` before and after the deploy.
2. After the Vercel deploy is live, run `node qa/page_perf.mjs --runs 3` from the repo root, with `.env.review` present.
3. **Pass:**
   - the `Waterfall (first visit)` table reads `parallel` for every signed-in page except `/admin` and `/onboarding`, on both profiles
   - desktop first-visit "ready" is within ±0.5 s of the "after" column, or ≥ 0.8 s faster than 2026-09-19
4. **If F-68 has shipped in between:** run `page_perf` once **before** the 4D deploy as the new baseline. The waterfall verdict is then the gate, and the ready comparison is against that baseline.
5. Commit the report as `qa/reports/page-perf-<date>.md` / `.json`.

## Deploy notes
- **No DB change. No backend change. No Android build. No env var.**
- **Order of merges.**
  - **WEB-B before WEB-A.** A's optimistic mount relies on B's guards in `UserProfilePage` (`!me` skeleton) and `GroupDetailPage` (`isOwn`). B alone is safe: with the gate still in place, `me` is always set.
  - QA merges any time. Its cases pass as their package lands.
  - Gate on `master` locally before the push: build ✓, lint ≤ 36/7, `web_4a_local` 25/25, `web_4d_local` all PASS (4C's `web_4c_local` too, if 4C is merged).
- **Release.** The PM pushes `master`. Vercel deploys the web, and Render redeploys an unchanged backend (a restart, so expect one cold start). Then run R-09.
- **Rollback.** Vercel → Deployments → promote the previous production deployment (instant), or `git revert` the merge commits and push. Nothing to undo in data.
- **Sprint 4C coordination.**
  - The file sets are disjoint. 4C WEB touches `api.js`, `InsightsPage.jsx`, `PrivacyPage.jsx`, `utils/localDate.js`, and adds `qa/web_4c_local.mjs`.
  - 4D touches none of these, and relies only on `api.js` exports that 4C does not change (`cacheClear`, `getToken`, `clearToken`).
  - Either merge order is conflict-free.
  - If both ship in one push, 4C's own ordering rules (backend first for `X-Timezone`) govern that push; 4D adds none.
  - Android: 4D has no package, so 2.2.3 is unaffected.

## Assumptions
- **A-1.** The API is served over HTTP/2, so ~8 parallel calls from one page are not capped by the browser's 6-per-host HTTP/1.1 limit. **If wrong:** on `/home` (7 calls) and the circle page (8), 1–2 calls queue, and those pages save up to one call's duration less. The R-09 waterfall shows it.
- **A-2.** The API absorbs 1–2 more concurrent requests per page load. FastAPI runs sync routes on a 40-thread pool, the SQLAlchemy pool is 5 + 10 overflow, and `/home` already runs 6 in parallel today. **If wrong:** per-call times rise, but the order holds.
- **A-3.** Vite serves one module instance of `/src/services/api.js`, so the harness's `callApi` and the app share the cache (L-4D-10). `web_4a_local.mjs` already relies on this.
- **A-4.** `GET /userbooks/` and `GET /userbooks/user/{me}` return the same rows in the same order for the caller's own id. Verified in `userbooks_router.py:299-347` vs `:478-533`: same filter and ORDER BY; `/userbooks/` adds `private_notes`, `format`, `ownership_status`, `borrowed_from` and `loaned_to` fields, and `pages_source` instead of `page_count`, none of which `ProfilePage` reads.

## Escalations (product calls, each with a recommendation)
- **E-1. The first second shows the page without identity.**
  - **What the reader sees:**
    - Until `/profile/me` answers, the nav avatar shows `?` and the Admin link is absent.
    - Own-post Edit/Delete menus appear a moment late.
    - A post written in that second shows the author "User" until reload.
  - `/admin` and `/onboarding` keep today's wait.
  - **Recommend:** accept. The alternative is a stored profile (E-3).
- **E-2. F-71 is a privacy bug found during design, fixed here** (2 lines in `AuthContext`, tested by L-4D-10). It widens 4D beyond pure speed.
  - **Recommend:** include. It sits in the file 4D already changes, and 4D's own constraint ("no flash of another user's data") requires it.
  - The triage owner should confirm or replace the proposed id F-71.
- **E-3. Keep the signed-in profile across reloads?**
  - **Not proposed.** It would only paint the avatar and name ~1.5 s sooner and could not safely unblock `/admin`. It would also create an identity cache to invalidate and defend.
  - ADR-001 records the rules it would need if wanted later.
  - **Recommend:** do not build. Revisit after F-68, which makes `/profile/me` ~0.35 s anyway.
- **E-4. Scope additions F-70b (book detail) and F-70c (friend's profile).** These are the same pattern as F-70, found in the call-site sweep: about 1.2 s and 1.6 s more saved on two of the slowest pages.
  - **Cost:** a locked-profile visit now sends 4 requests that the server refuses.
  - **Recommend:** include. They can be dropped by removing B-2/B-3's parallel parts and L-4D-13/14, with no effect on the rest.
- **E-5. A failed `/profile/me` (5xx, offline) signs the reader out.** That is today's behaviour (`AuthContext.jsx:56`), kept in 4D. After 4D the page may show for a moment before that sign-out.
  - Only a 401 should sign a reader out, and a network blip should not.
  - That is a behaviour change, so it is out of 4D's "no behaviour change" scope.
  - **Recommend:** keep as is in 4D; log it as a new triage item (proposed F-72) for a later sprint.

## Decisions
- `decisions/ADR-001-no-persisted-profile.md`: F-69 is fixed by not awaiting identity, rather than by caching identity. The rules any future profile cache must follow are in the ADR.
