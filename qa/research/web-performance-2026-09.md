# Web Performance Research Brief — TrackMyRead

Date compiled: 2026-09-20. Where a source's own page carries a date, it is noted as "as of <date>" — pricing and platform limits change and should be re-verified before acting on them.

Stack recap: React 19 + Vite SPA (Vercel) · FastAPI + SQLModel/SQLAlchemy 1.4 (Render free tier) · Supabase Postgres · Expo/React Native Android app · users mostly in India.

---

## 1. Targets: Core Web Vitals and API response budgets

**Core Web Vitals ("good" thresholds, measured at the 75th percentile of real-user data over a rolling 28-day window):**
- LCP (Largest Contentful Paint): good ≤ 2.5s, poor > 4s.
- INP (Interaction to Next Paint): good ≤ 200ms, poor > 500ms. INP replaced FID as the responsiveness metric in March 2024.
- CLS (Cumulative Layout Shift): good ≤ 0.1, poor > 0.25.
- Source: [How Core Web Vitals thresholds were defined — web.dev](https://web.dev/articles/defining-core-web-vitals-thresholds)

**TTFB (not itself a Core Web Vital, but gates LCP):** web.dev's own guidance: most sites should aim for TTFB ≤ 0.8s; above 1.8s is poor. A high TTFB doesn't necessarily mean the backend is slow — redirects and connection setup count too.
Source: [Time to First Byte — web.dev](https://web.dev/articles/ttfb)

**API response-time budgets (industry convention, not a Google standard — multiple secondary sources converge on similar numbers, cited here as industry practice rather than a single canonical source):**
- Simple CRUD endpoint: under 200ms is considered good.
- Endpoints with joins/aggregation: under 500ms.
- Search/reporting endpoints: under 1s.
- Rule of thumb: keep p50 well under 500ms; p95 is the "worst tolerable" bound — a service can look fine on average while 1 in 20 requests (p95) is far worse. This matters directly for TrackMyRead: your own measurements are essentially p50-style single measurements, and the "12 queries → 2.75s" case is already past the "search/reporting" budget for what should be a normal page.
- Source: [What's a Good API Response Time? — Nurbak](https://nurbak.com/en/blog/api-response-time/), [Understanding API Percentiles — Clobbr](https://clobbr.app/blog/understanding-api-percentiles)
- Caveat: these are aggregator/blog sources, not a primary standards body — I could not find an official Google or W3C number for backend API budgets specifically (Google's own guidance stops at TTFB, above).

**Load time vs. drop-off (credible, frequently-cited primary studies):**
- Amazon (2009, widely cited): every 100ms of added latency cost ~1% of sales.
- Walmart: a 100ms improvement in load time increased incremental revenue ~1%; 1s less load time correlated with ~2% more conversions.
- Portent's own conversion-rate analysis: ~40% conversion at 1s load, dropping to ~34% at 2s, leveling off around 29% at 3s, and lowest at 6s.
- 53% of mobile users abandon a page that takes more than 3 seconds to load (commonly attributed to a Google/SOASTA/DoubleClick mobile study).
- Source: [Site speed and conversion rate — Portent](https://portent.com/blog/analytics/research-site-speed-hurting-everyones-revenue.htm), [Page load time and conversion — Pingdom](https://www.pingdom.com/blog/how-does-page-load-time-affect-your-conversion-rate/)

**Relevance to TrackMyRead:** your signed-in pages (3–6.5s desktop, 3.6–9s throttled mobile) are well outside "good" LCP (>4s = poor) for most of that range, and outside the load-time bands where the above studies show meaningful abandonment. This is a strong candidate for your biggest user-facing loss.

---

## 2. Render free tier

**Spin-down / cold start (Render's own docs, current as of this session):**
- "Render spins down a Free web service that goes 15 minutes without receiving any inbound traffic" (HTTP requests and WebSocket messages both count as traffic).
- Spin-up "takes about one minute"; Render shows a loading page to the browser while this happens.
- Source: [Deploy for Free — Render Docs](https://render.com/docs/free)
- Secondary sources report the free-tier idle window was previously 30 minutes and was tightened to 15 minutes at some point in 2026 — I could not independently verify the change date on Render's own docs, so treat that history as unconfirmed.

**CPU/RAM limits and paid tiers (secondary sources; Render's own free-tier doc page does not state numeric CPU/RAM limits):**
- Free web service instance: 512 MB RAM, 0.1 CPU (no spin-down avoidance).
- Starter: $7/mo, 512 MB RAM, 0.5 CPU — no spin-down.
- Standard: $25/mo, 2 GB RAM, 1 CPU.
- Pro Ultra: $450/mo, 32 GB RAM, 8 CPU (top of the standard tier ladder; larger custom instances by sales quote).
- Any paid compute plan removes the free-tier spin-down behavior.
- Source: [Render Compute Plans — Render Docs](https://render.com/docs/compute-plans), and secondary aggregation via [srvrlss.io Render pricing](https://www.srvrlss.io/provider/render/) — **cross-check the current price before committing budget**, since Render changed its plan structure on April 23, 2026 per one secondary source, and pricing pages are exactly the kind of content that goes stale.

**Keep-alive pinging:**
- There is no officially supported way to keep a free service warm continuously; Render's supported answer to avoid cold starts is to move to a paid instance.
- An external uptime ping (e.g., every 10 minutes) will prevent the 15-minute idle spin-down in practice, but Render does not document or endorse this as reliable.
- Free tier includes 750 hours/month of runtime (≈31.25 days) — enough to run one free service 24/7 without hitting the hours cap, if you have only one free service.
- Source: [Render community discussion on spin-down](https://github.com/orgs/community/discussions/197645) — this is community commentary, not an official Render statement; treat the "no official support" framing as Render's implicit position (documented spin-down behavior) rather than a quoted policy.

**Regions (Render's own docs):** Oregon (USA), Ohio (USA), Virginia (USA), Frankfurt (Germany), Singapore. No India/South Asia region exists on Render as of this check.
Source: [Regions — Render Docs](https://render.com/docs/regions)

---

## 3. Supabase

**Regions (Supabase's own docs):** includes South Asia (Mumbai) — `ap-south-1` — alongside US West/East, Canada, five EU regions, Southeast Asia (Singapore), Northeast Asia (Tokyo, Seoul), Oceania (Sydney), South America (São Paulo).
Source: [Available regions — Supabase Docs](https://supabase.com/docs/guides/platform/regions)

**Same-region guidance:** Supabase's own docs advise choosing "the location closest to your users for the best performance," and separately note that for Edge Functions, running in the same region as the database gives better performance for database-heavy operations by minimizing round trips.
Source: [Available regions — Supabase Docs](https://supabase.com/docs/guides/platform/regions), [Regional Invocations — Supabase Docs](https://supabase.com/docs/guides/functions/regional-invocation)

**The regional mismatch specific to TrackMyRead:** Render has no Mumbai region — its closest region to India-based users is Singapore. If Supabase is set to `ap-south-1` (Mumbai) and Render is anywhere in the US or Frankfurt, every query crosses an ocean; even Render-Singapore-to-Supabase-Mumbai is still a genuine cross-region hop (roughly the same order of distance as Singapore–Mumbai flight distance, ~2,900 miles). I could not find a Render-published or Supabase-published exact ms figure for Singapore↔Mumbai; secondary community reports on comparable cross-region Postgres calls range widely (150–450ms) depending on connection reuse and pooling, so treat any specific number as a rough order-of-magnitude, not a guarantee — measure it directly with a Server-Timing header (see §7) rather than trusting a published average.
Source: [AWS Inter-Region Latency notes — dev.to](https://dev.to/aws-builders/looking-at-aws-inter-region-latency-through-distance-34eh) (general pattern only, no confirmed Mumbai–Singapore figure found)

**Practical implication:** given neither platform offers a shared India region, the two realistic options are (a) Render in Singapore + Supabase in Mumbai (closest available pairing, still cross-region), or (b) move the database closer to wherever Render actually runs today. Given your measured "180ms per query" penalty, confirming Render's current region and moving both services to the same region (Singapore appears to be the best mutually-available option) should be the first thing you test — before touching pooling or code.

**Supavisor / PgBouncer / direct connection (Supabase's own docs):**
- Every Supabase project has a built-in Connection Pooler (Supavisor).
- **Transaction mode** (port 6543): connection returned to the pool after each transaction; does not support session-level state (`SET`, `LISTEN/NOTIFY`, session-scoped temp tables, advisory locks) or prepared statements by default. Recommended for serverless/edge — "anything that scales horizontally."
- **Session mode**: pooler grants an exclusive underlying connection per client; supports prepared statements; can queue connections.
- **Direct connection**: no pooler overhead, one Postgres connection per client; best for **persistent backends — long-running containers/VMs** (this is FastAPI on Render). Supabase's docs state explicitly: "on a persistent backend, such as a long-running container or VM, an application-side pooler is enough on its own" — i.e., let SQLAlchemy's own pool manage connections and connect directly (or via session-mode pooler if you need IPv4 and Supavisor doesn't give you a static IPv4 otherwise), rather than routing a long-lived server through the transaction-mode pooler meant for serverless.
- Source: [Connection pooling and limits — Supabase Docs](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits)

**SQLAlchemy settings per mode:**
- Direct connection / session pooler (long-running FastAPI process): use SQLAlchemy's normal `QueuePool` with `pool_pre_ping=True` and a `pool_recycle` shorter than Supabase's server-side idle/connection timeout, plus modest `pool_size`/`max_overflow` (a commonly cited small-app baseline is `pool_size=5, max_overflow=10, pool_timeout=30, pool_recycle=180, pool_pre_ping=True`).
- Transaction-mode pooler (if ever used from a long-running process, or from serverless functions): use `NullPool` (open/close a fresh logical connection per checkout, letting Supavisor manage the real connection) and disable prepared statements — for asyncpg, pass `connect_args={"statement_cache_size": 0}` (and optionally a randomized `prepared_statement_name_func`) because transaction-mode pooling does not support named prepared statements reliably.
- Source: [Connection Pooling — SQLAlchemy 2.0 Docs](https://docs.sqlalchemy.org/en/20/core/pooling.html), [asyncpg + PgBouncer prepared statement issue — SQLAlchemy GitHub discussion](https://github.com/sqlalchemy/sqlalchemy/discussions/10246), [Supavisor and Connection Terminology — Supabase Docs](https://supabase.com/docs/guides/troubleshooting/supavisor-and-connection-terminology-explained-9pr_ZO)

---

## 4. SQLAlchemy / FastAPI cost per request

- **`pool_pre_ping=True`**: issues a lightweight `SELECT 1`-style check on each checkout before handing the connection to your code, adding a small extra round trip per checkout — but it is cheap relative to a full new-connection cost, and its purpose is precisely to avoid handing back a connection the server has silently dropped. Recommended to pair with `pool_recycle` set below the server/pooler's own idle timeout.
  Source: [Connection Pooling — SQLAlchemy 2.0 Docs](https://docs.sqlalchemy.org/en/20/core/pooling.html)
- **New connection per request (no pooling):** a full TCP handshake + TLS negotiation + Postgres SCRAM authentication commonly costs 20–100ms even same-region, and this is paid on *every* request if there's no pool reuse. Secondary sources estimate this can cost 20–100 seconds of *cumulative* latency per second of traffic once you're above ~1,000 RPS — not your scale, but the per-request tax (tens of ms) is real at any scale and stacks with your existing 180ms-per-query problem.
  Source: [Serverless Killed Your Connection Pool — dev.to](https://dev.to/devopsdaily/serverless-killed-your-connection-pool-8m4)
- **Sync endpoints in FastAPI's threadpool:** a `def` (non-`async def`) route runs via Starlette's `run_in_threadpool`, backed by a `ThreadPoolExecutor` (default size ≈ CPU count × 5, though FastAPI/Starlette caps it in practice). If all threads are busy, further sync requests queue rather than run — on a 0.1-vCPU free instance this pool is small and can become a bottleneck under even light concurrency. This is a genuine cost specifically because Render's free tier gives you so little CPU.
  Source: [FastAPI GitHub discussion on threadpool sizing](https://github.com/fastapi/fastapi/discussions/8690)
- **Per-request "touch last_active" writes:** I could not find a primary source quantifying this specific pattern, so treat this as reasoned inference rather than a cited fact: an unconditional write on every request adds at minimum one extra round trip (network + WAL flush) per request, competes for the same small connection pool as your read queries, and — if unbatched — turns into steady write load on a database you're also paying "per query" latency for. Common mitigation patterns (debounce to once per N minutes per user, or fire-and-forget outside the request/response critical path) are standard practice, but I did not find a benchmark specific to this pattern to cite.

**Recommended pool settings for a small FastAPI app on managed Postgres (secondary-source convergence, not a single canonical spec):** small `pool_size` (5–10), modest `max_overflow` (5–10), `pool_timeout` ~30s so requests fail fast rather than hang, `pool_recycle` set below whatever idle-connection timeout Supabase/Supavisor enforces, and `pool_pre_ping=True`.
Source: [AlloyDB + SQLAlchemy connection pooling — dev.to](https://dev.to/humzakt/alloydb-sqlalchemy-connection-pooling-strategies-that-actually-work-in-production-5809) (AlloyDB-specific numbers, cited here as an illustrative pattern, not a Supabase-verified baseline)

---

## 5. Request waterfalls in React SPAs

- **The waterfall problem:** in a fetch-on-render pattern (e.g., `useEffect` fetching after mount, nested per-component), each level of the component tree renders, then fetches, then renders its children, who then fetch — turning what could be parallel requests into a serial staircase. This is exactly the shape described in your context: every signed-in page waits for `GET /profile/me` before starting its own calls.
  Source: [Understanding and Preventing Fetch Waterfalls in React — newline](https://www.newline.co/@RichardBray/understanding-and-preventing-fetch-waterfalls-in-react--95297892)
- **React Router's fix:** Data Router / loaders (introduced in React Router 6.4) decouple data-fetching from component rendering — loaders run before the route renders, and loaders for sibling/nested routes run in parallel rather than sequentially, which "eliminates render + fetch chains." Within a single loader, use `Promise.all()` to fire independent fetches concurrently rather than awaiting them one at a time.
  Source: [React Router docs / Remix blog on lazy loading and data routers](https://remix.run/blog/lazy-loading-routes)
- **Caveat on "gating on the user object":** React Router's own loaders execute in parallel across the route tree, which cuts the other way from your current problem — because parent and child loaders run concurrently, a child loader cannot simply read the parent's already-fetched user object; each protected loader needs its own auth check (e.g., a `requireLoggedIn()` guard) rather than relying on a shared upstream fetch. This means "not gating routes on the user object" in the loader model means duplicating a **cheap** auth check per loader, not silently trusting a shared blocking `/profile/me` call — the actual fix for your waterfall is to make the current-user fetch non-blocking/cached (see next point), not to remove the check.
  Source: [React Router GitHub discussion on centralized auth in loaders](https://github.com/remix-run/react-router/discussions/13730)
- **TanStack Query / SWR pattern:** cache the current-user query with a `staleTime` so subsequent page loads serve cached data instantly while revalidating in the background (stale-while-revalidate) — this removes `/profile/me` from the critical path for anything but the very first load in a session. Prefetching (`queryClient.prefetchQuery`) lets you kick off a query before the component that needs it even mounts.
  Source: [Prefetching — TanStack Query Docs](https://tanstack.com/query/v4/docs/framework/react/guides/prefetching), [Important Defaults — TanStack Query Docs](https://tanstack.com/query/v4/docs/react/guides/important-defaults)

**Direct implication for TrackMyRead:** the "every page waits for `/profile/me` first" pattern is the textbook waterfall case both sets of docs describe fixing. Caching that call (TanStack Query/SWR with a sensible `staleTime`, e.g., a few minutes) so it's read from cache on every page after the first, and parallelizing each page's own fetches with `Promise.all` instead of sequential `await`s, are the two changes these sources converge on.

---

## 6. Bundle size

- Vite's chunk-size warning fires at 500 kB (post-minification, pre-gzip) per output file — not fatal, but "a performance smell." The three standard fixes Vite's own guidance points to: dynamic `import()` for code-splitting, `build.rollupOptions.output.manualChunks` for deliberate vendor grouping, or (only as a last resort) raising `build.chunkSizeWarningLimit` to silence rather than fix it.
  Source: [Vite chunk size warning discussion — vitejs/vite GitHub](https://github.com/vitejs/vite/discussions/9440)
- Route-based code splitting with `React.lazy` + `Suspense` is described as "almost always the best place to start" because each route becomes its own chunk, so only the active route's JS ships on first load — everything else is deferred until navigation.
  Source: [Route-based code splitting with React — Everyday Frontend](https://cathalmacdonnacha.com/route-based-code-splitting-with-react)
- **LCP/mobile impact:** I could not find a controlled, citable benchmark giving a specific "typical LCP gain in ms" for React.lazy route-splitting specifically — the sources found cite the general mobile abandonment stat (53% of mobile users abandon a page taking over 3s to load, commonly attributed to a Google/SOASTA study) as the motivation, not a measured before/after LCP delta for this specific technique. Treat "how much LCP improves" as something to measure on your own build (Lighthouse/WebPageTest before and after), not something a source will quantify generically — the gain depends entirely on how much of your >500 kB chunk is actually needed for the first paint.

---

## 7. Other things a performance review of this stack should check

- **HTTP compression:** Vercel applies Brotli/Gzip automatically based on the client's `Accept-Encoding` (Brotli preferred when supported — reported as ~14% smaller JS, ~21% smaller HTML, ~17% smaller CSS vs Gzip). On the FastAPI side, Render does not do this for you — add `GZipMiddleware` (or a Brotli middleware) explicitly, since your API responses are not behind Vercel's CDN.
  Source: [Vercel CDN Compression Docs](https://vercel.com/docs/how-vercel-cdn-works/compression), [FastAPI GZipMiddleware — dev.to](https://dev.to/gealber/gzip-middleware-recipe-for-fastapi-4b14)
- **CDN caching of public pages:** your public pages already load in ~0.3s, consistent with Vercel's CDN serving them from cache; confirm `Cache-Control`/`s-maxage`/`stale-while-revalidate` headers are set deliberately (Vercel documents `s-maxage` for CDN TTL and `stale-while-revalidate` for background refresh) rather than relying on defaults, so this stays fast as content changes.
  Source: [Cache-Control headers — Vercel Docs](https://vercel.com/docs/caching/cache-control-headers)
- **Server-Timing header:** a standard, low-effort diagnostic — add named timings (`db;dur=180`, `auth;dur=40`, etc.) to FastAPI responses so the exact TTFB breakdown (connection setup vs. query time vs. app logic) is visible directly in Chrome DevTools' Network panel, rather than guessing from aggregate numbers. This is the concrete way to confirm whether the "180ms per query" is connection overhead, region latency, or query execution time.
  Source: [Server-Timing header — MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Server-Timing)
- **HTTP keep-alive between Vercel and Render:** not addressed by a primary source found in this research — worth checking directly (e.g., whether your frontend fetch client reuses connections, and whether Render terminates idle keep-alive connections) rather than assuming based on other findings here.
- **Render cold-start compounding with region latency:** these two problems stack — a request arriving after 15 minutes idle pays both the ~1-minute spin-up *and* the cross-region query penalty on the very first real query after wake-up. Worth confirming in testing which of these dominates your worst-case 9s mobile figure.
- **Mobile-specific:** the Android RN/Expo app almost certainly talks to the same FastAPI backend and would inherit the same 180ms-per-query and cold-start penalties; nothing in the sources above is web-specific to those two root causes, so the region/pooling fixes benefit the mobile app equally, while the bundle-size and React-Router-waterfall fixes are web-only.

---

## Checklist for this app (most impactful first)

1. `[infra]` **Confirm Render's current region and co-locate it with Supabase.** Neither platform has an India region; Render's closest is Singapore, Supabase has Mumbai (`ap-south-1`). Pick the same region for both (Render Singapore is the best mutually-available option) — this directly attacks the "180ms per query" / cross-region hypothesis, which is likely the single biggest fixable cost on every signed-in page. [Render regions](https://render.com/docs/regions), [Supabase regions](https://supabase.com/docs/guides/platform/regions)
2. `[infra]` **Move off Render's free tier for the API**, or explicitly accept the 15-min-idle spin-down + ~1-minute cold start as a known cost. A paid instance (Starter, $7/mo as of this check — reverify) removes both the spin-down and gives 0.5 CPU instead of 0.1 CPU, which also fixes threadpool starvation under the sync-endpoint model. [Render free tier docs](https://render.com/docs/free)
3. `[backend]` **Batch/parallelize per-request SQL.** At ~180ms/query, a page issuing 12 queries pays ~2.2s just in query round trips; reducing query count (joins, eager loading, batching) or running independent queries concurrently has a bigger, more controllable payoff than any single connection-pool tweak.
4. `[backend]` **Fix connection handling for a long-running FastAPI process:** use a direct connection or session-mode pooler (not the transaction-mode pooler meant for serverless), with SQLAlchemy `QueuePool`, `pool_pre_ping=True`, and `pool_recycle` below Supabase's idle timeout — Supabase's own docs say an application-side pool is sufficient for a persistent backend like this. [Supabase pooling docs](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits)
5. `[web]` **Stop gating every page on a blocking `GET /profile/me`.** Cache the current user with TanStack Query/SWR (stale-while-revalidate, a multi-minute `staleTime`) so it's read from cache after the first load, and fire each page's own data calls in parallel (`Promise.all`) instead of after the profile call resolves. This is the direct fix for the waterfall you already measured. [TanStack Query prefetching](https://tanstack.com/query/v4/docs/framework/react/guides/prefetching)
6. `[backend]` **Add a `Server-Timing` header to API responses** before making further changes, so you can measure — rather than guess — how much of each request is connection setup vs. query time vs. app logic, and re-verify after each fix above. [MDN Server-Timing](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Server-Timing)
7. `[web]` **Route-split the >500 kB chunk with `React.lazy` + `Suspense`** so the initial bundle only ships what the first route needs; measure the actual LCP delta on your own build rather than assuming a generic number, especially on the throttled-mobile profile you're already testing with.
8. `[backend]` **Move or debounce any per-request "touch last_active" write** off the request's critical path (e.g., update at most once per few minutes per user, or fire-and-forget) so it doesn't compete for the same small connection pool as your read queries on every page load.
9. `[backend]` **Add response compression (`GZipMiddleware` or Brotli) on the FastAPI side** — Vercel already compresses your frontend assets, but your API responses are not behind that CDN and need this set explicitly.
10. `[mobile]` **Re-test the Android app against the same fixes.** It hits the same backend and inherits the same region/cold-start/query-count problems; there's no mobile-specific root cause found in this research, so items 1–4 and 8–9 should be validated on-device once shipped, not assumed fixed.
