# Page load times — 2026-09-21

`https://www.trackmyread.com` against API `https://book-tracker-sg.onrender.com` serving `90b0c27`. 3 loads per page per profile. The first load has an empty cache and later loads reuse it. The API was woken before measuring, which took 0.23 s (includes any Render cold start).

**ready** means the page's data has arrived: the API has been idle for 1 s after load. In this single-page app that is when the content actually appears.
**LCP**: good ≤ 2.5 s, ⚠️ ≤ 4 s, 🔴 > 4 s. **ready**: ⚠️ > 3 s, 🔴 > 6 s.

## Desktop — no throttling

| page | ready (first visit) | ready (return) | LCP | FCP | TTFB | API calls | slowest API call | notes |
|---|---:|---:|---:|---:|---:|---:|---|---|
| Landing `/` | 0.32 s | 0.17 s | 0.56 s | 0.56 s | 0.10 s | 0 | — |  |
| About `/about` | 0.27 s | 0.15 s | 0.38 s | 0.38 s | 0.11 s | 0 | — |  |
| Privacy `/privacy` | 0.37 s | 0.19 s | 0.44 s | 0.44 s | 0.15 s | 0 | — |  |
| Terms `/terms` | 0.41 s | 0.22 s | 0.47 s | 0.47 s | 0.12 s | 0 | — |  |
| Blog index `/blog` | 0.38 s | 0.25 s | 0.48 s | 0.48 s | 0.15 s | 0 | — |  |
| Blog post `/blog/goodreads-alternative` | 0.33 s | 0.19 s | 0.45 s | 0.45 s | 0.13 s | 0 | — |  |
| 404 `/this-page-does-not-exist` | 0.33 s | 0.22 s | 0.57 s | 0.44 s | 0.13 s | 0 | — | redirected to / |
| Home feed `/home` | 1.10 s | 0.56 s | 1.39 s | 0.70 s | 0.11 s | 7 | `GET /notes/feed` 0.48 s |  |
| Library `/library` | 0.56 s | 0.36 s | 0.40 s | 0.40 s | 0.13 s | 4 | `GET /profile/me` 0.17 s |  |
| Book detail `/library/book/856` | 0.66 s | 0.35 s | 0.73 s | 0.45 s | 0.14 s | 4 | `GET /notes/userbook/856` 0.21 s |  |
| Search `/search` | 0.59 s | 0.32 s | 0.43 s | 0.43 s | 0.12 s | 2 | `GET /profile/me` 0.16 s |  |
| Circles `/groups` | 0.87 s | 0.36 s | 0.63 s | 0.63 s | 0.12 s | 6 | `GET /groups/discover` 0.21 s |  |
| Circle detail `/groups/7` | 0.60 s | 1.34 s | 0.71 s | 0.34 s | 0.11 s | 9 | `GET /groups/7/members` 0.26 s |  |
| New circle `/groups/new` | 2.00 s | 0.38 s | 1.84 s | 1.84 s | 0.12 s | 2 | `GET /profile/me` 0.17 s |  |
| Join via invite `/join/…` | 0.55 s | 0.27 s | 0.40 s | 0.37 s | 0.13 s | 3 | `GET /notifications/unread-count` 0.17 s | 1 write(s) blocked |
| Insights `/insights` | 0.52 s | 0.31 s | 0.59 s | 0.36 s | 0.10 s | 3 | `GET /reading-activity/insights` 0.16 s |  |
| Notifications `/notifications` | 0.61 s | 0.31 s | 0.41 s | 0.41 s | 0.15 s | 3 | `GET /profile/me` 0.19 s |  |
| My profile `/profile` | 0.63 s | 0.30 s | 0.70 s | 0.35 s | 0.13 s | 7 | `GET /notes/me` 0.27 s |  |
| Friend's profile `/profile/111` | 0.60 s | 0.34 s | 0.66 s | 0.31 s | 0.09 s | 8 | `GET /notes/user/111` 0.29 s |  |
| Settings `/settings` | 0.61 s | 0.34 s | 0.48 s | 0.48 s | 0.13 s | 4 | `GET /notifications/unread-count` 0.14 s |  |
| Onboarding `/onboarding` | 0.51 s | 0.26 s | 0.58 s | 0.34 s | 0.12 s | 1 | `GET /profile/me` 0.17 s |  |
| Admin (non-admin user) `/admin` | 0.74 s | 0.48 s | 1.31 s | 0.34 s | 0.11 s | 7 | `GET /books/recommendations` 0.20 s | redirected to /home |

## Mobile — slow 4G, 4× CPU slowdown

| page | ready (first visit) | ready (return) | LCP | FCP | TTFB | API calls | slowest API call | notes |
|---|---:|---:|---:|---:|---:|---:|---|---|
| Landing `/` | 1.86 s | 1.61 s | 2.27 s | 2.27 s | 0.12 s | 0 | — |  |
| About `/about` | 1.75 s | 1.66 s | 2.15 s | 2.15 s | 0.13 s | 0 | — |  |
| Privacy `/privacy` | 1.78 s | 1.82 s | 2.13 s | 2.13 s | 0.11 s | 0 | — |  |
| Terms `/terms` | 1.80 s | 1.66 s | 2.19 s | 2.19 s | 0.11 s | 0 | — |  |
| Blog index `/blog` | 1.74 s | 1.60 s | 2.11 s | 2.11 s | 0.10 s | 0 | — |  |
| Blog post `/blog/goodreads-alternative` | 1.73 s | 1.64 s | 2.10 s | 2.10 s | 0.11 s | 0 | — |  |
| 404 `/this-page-does-not-exist` | 1.74 s | 1.65 s | 2.22 s | 2.22 s | 0.10 s | 0 | — | redirected to / |
| Home feed `/home` | 2.82 s | 2.67 s | 3.43 s ⚠️ | 2.32 s | 0.12 s | 7 | `GET /notes/feed` 0.46 s |  |
| Library `/library` | 2.37 s | 2.24 s | 2.03 s | 2.03 s | 0.12 s | 4 | `GET /notifications/unread-count` 0.32 s |  |
| Book detail `/library/book/856` | 2.46 s | 2.24 s | 2.10 s | 2.10 s | 0.10 s | 4 | `GET /profile/me` 0.33 s |  |
| Search `/search` | 2.57 s | 2.33 s | 2.25 s | 2.25 s | 0.13 s | 2 | `GET /notifications/unread-count` 0.30 s |  |
| Circles `/groups` | 2.61 s | 2.30 s | 2.18 s | 2.18 s | 0.19 s | 6 | `GET /groups/discover` 0.35 s |  |
| Circle detail `/groups/7` | 2.54 s | 2.40 s | 3.07 s ⚠️ | 2.01 s | 0.13 s | 9 | `GET /groups/7/leaderboard` 0.34 s |  |
| New circle `/groups/new` | 2.64 s | 2.29 s | 2.34 s | 2.34 s | 0.13 s | 2 | `GET /profile/me` 0.27 s |  |
| Join via invite `/join/…` | 2.52 s | 2.20 s | 2.35 s | 2.16 s | 0.15 s | 3 | `GET /profile/me` 0.31 s | 1 write(s) blocked |
| Insights `/insights` | 2.78 s | 2.19 s | 2.80 s ⚠️ | 2.10 s | 0.14 s | 3 | `GET /notifications/unread-count` 0.62 s |  |
| Notifications `/notifications` | 2.57 s | 2.33 s | 2.29 s | 2.29 s | 0.14 s | 3 | `GET /profile/me` 0.26 s |  |
| My profile `/profile` | 2.39 s | 2.30 s | 2.91 s ⚠️ | 2.05 s | 0.10 s | 7 | `GET /profile/me` 0.30 s |  |
| Friend's profile `/profile/111` | 2.63 s | 2.45 s | 3.09 s ⚠️ | 2.18 s | 0.16 s | 8 | `GET /reading-activity/user/111/daily` 0.38 s |  |
| Settings `/settings` | 2.77 s | 2.48 s | 2.36 s | 2.36 s | 0.10 s | 4 | `GET /profile/me` 0.35 s |  |
| Onboarding `/onboarding` | 2.17 s | 2.01 s | 2.51 s ⚠️ | 1.92 s | 0.16 s | 1 | `GET /profile/me` 0.24 s |  |
| Admin (non-admin user) `/admin` | 3.09 s ⚠️ | 3.83 s ⚠️ | 3.72 s ⚠️ | 2.01 s | 0.15 s | 7 | `GET /notes/feed` 0.32 s | redirected to /home |

## Waterfall (first visit)

Note: `/admin` and `/onboarding` are expected to read `SERIAL` / `—` (own gates, never parallel).

| page | profile | profile/me | first own call | verdict | profile/me total | profile/me queries |
|---|---|---:|---:|---|---:|---:|
| Home feed `/home` | desktop | 619–955 ms | 616 ms | parallel | 87.08 ms | 5 |
| Library `/library` | desktop | 395–564 ms | 395 ms | parallel | 23.964 ms | 5 |
| Book detail `/library/book/856` | desktop | 459–664 ms | 457 ms | parallel | 19.666 ms | 5 |
| Search `/search` | desktop | 429–591 ms | — | parallel (nav) | 18.497 ms | 5 |
| Circles `/groups` | desktop | 669–859 ms | 646 ms | parallel | 27.055 ms | 5 |
| Circle detail `/groups/7` | desktop | 345–605 ms | 341 ms | parallel | 139.346 ms | 5 |
| New circle `/groups/new` | desktop | 1835–2003 ms | — | parallel (nav) | 20.826 ms | 5 |
| Join via invite `/join/…` | desktop | 371–545 ms | 369 ms | parallel | 18.298 ms | 5 |
| Insights `/insights` | desktop | 365–523 ms | 364 ms | parallel | 20.593 ms | 5 |
| Notifications `/notifications` | desktop | 414–608 ms | 414 ms | parallel | 21.867 ms | 5 |
| My profile `/profile` | desktop | 352–549 ms | 353 ms | parallel | 21.142 ms | 5 |
| Friend's profile `/profile/111` | desktop | 314–509 ms | 308 ms | parallel | 23.575 ms | 5 |
| Settings `/settings` | desktop | 472–611 ms | 473 ms | parallel | 17.74 ms | 5 |
| Onboarding `/onboarding` | desktop | 346–511 ms | — | — | 18.121 ms | 5 |
| Admin (non-admin user) `/admin` | desktop | 340–521 ms | 538 ms | SERIAL | 20.17 ms | 5 |
| Home feed `/home` | mobile | 2362–2650 ms | 2357 ms | parallel | 22.247 ms | 5 |
| Library `/library` | mobile | 2052–2366 ms | 2051 ms | parallel | 21.68 ms | 5 |
| Book detail `/library/book/856` | mobile | 2125–2459 ms | 2124 ms | parallel | 19.958 ms | 5 |
| Search `/search` | mobile | 2272–2544 ms | — | parallel (nav) | 23.875 ms | 5 |
| Circles `/groups` | mobile | 2267–2612 ms | 2265 ms | parallel | 29.392 ms | 5 |
| Circle detail `/groups/7` | mobile | 2047–2336 ms | 2044 ms | parallel | 22.046 ms | 5 |
| New circle `/groups/new` | mobile | 2365–2639 ms | — | parallel (nav) | 18.374 ms | 5 |
| Join via invite `/join/…` | mobile | 2215–2525 ms | 2214 ms | parallel | 19.98 ms | 5 |
| Insights `/insights` | mobile | 2158–2429 ms | 2158 ms | parallel | 20.406 ms | 5 |
| Notifications `/notifications` | mobile | 2308–2572 ms | 2308 ms | parallel | 19.336 ms | 5 |
| My profile `/profile` | mobile | 2092–2390 ms | 2092 ms | parallel | 33.077 ms | 5 |
| Friend's profile `/profile/111` | mobile | 2257–2569 ms | 2251 ms | parallel | 23.373 ms | 5 |
| Settings `/settings` | mobile | 2415–2765 ms | 2415 ms | parallel | 17.586 ms | 5 |
| Onboarding `/onboarding` | mobile | 1925–2170 ms | — | — | 19.7 ms | 5 |
| Admin (non-admin user) `/admin` | mobile | 2015–2256 ms | 2769 ms | SERIAL | 20.258 ms | 5 |


## Three rounds: where the time went (2026-09-21, after the move to Singapore)

Same pages, same profiles, same method each time.

| | start (Oregon, pre-4D) | after Sprint 4D | + Singapore (now) |
|---|---:|---:|---:|
| desktop, 15 signed-in pages | 58.99 s | 45.92 s | **11.16 s** |
| desktop mean per page | 3.93 s | 3.06 s | **0.74 s** |
| mobile, 15 signed-in pages | 91.56 s | 77.79 s | **38.94 s** |
| mobile mean per page | 6.10 s | 5.19 s | **2.60 s** |

**81% faster on desktop, 57% on a throttled phone**, against where this started.

| page | start | after 4D | now |
|---|---:|---:|---:|
| Circle detail | 6.38 s | 3.92 s | **0.60 s** |
| Friend's profile | 5.84 s | 3.25 s | **0.60 s** |
| Home feed | 5.40 s | 5.99 s | **1.10 s** |
| Book detail | 4.71 s | 2.33 s | **0.66 s** |
| Admin | 4.56 s | 5.05 s | **0.74 s** |
| Notifications | 3.37 s | 2.00 s | **0.61 s** |

**The two pages 4D made worse are fixed by the move.** Home went 5.40 → 5.99 s under 4D because its seven parallel calls contended for a 5-connection pool in front of a database 200 ms away; with the database 3 ms away that contention disappears: **1.10 s**. Admin likewise, 5.05 → 0.74 s. The two changes were complementary, and neither alone would have got here.

**Still worth doing:** Sprint 4E cuts the query counts (recommendations 12 → 4, feed 8 → 3). Each query now costs ~3 ms rather than ~200 ms, so 4E is no longer the headline — but `/home` still makes 40 queries across its calls, and on a phone the remaining 2.6 s is mostly network and rendering rather than the database.

**Mobile note:** the phone profile is throttled to slow 4G with a 4× CPU penalty, so ~1.8 s of its 2.6 s is downloading and parsing the app itself — which is why the remaining gap is a bundle-size question (the Vite build still warns about a chunk over 500 kB), not a database one.
