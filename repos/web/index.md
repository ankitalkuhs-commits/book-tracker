---
repo: web
path: book-tracker-frontend-stitch/
purpose: React web app + public marketing/blog pages
tech: React 19, Vite 8, TailwindCSS 3, react-router 7, react-i18next, react-helmet-async
deploy: Vercel → https://www.trackmyread.com, auto-deploys from master; build must be `npm run build:ssg` (runs scripts/generate-ssg.mjs)
last_verified: 2026-09-12
---

## Entry Points
| File | Purpose |
|---|---|
| src/main.jsx | Providers (Auth, Google OAuth, Helmet, i18n) |
| src/App.jsx | Routes; PrivateRoute / AdminRoute wrappers; AppTour gate via ONBOARDING_KEY |
| src/services/api.js | ALL API calls; 60s in-memory GET cache with stale-while-revalidate; 401 → clearToken + redirect |
| src/context/AuthContext.jsx | user state, web-push subscribe |
| src/pages/*.jsx | One file per route |
| src/data/blog/*.js | Blog posts (SEO) |
| public/ | robots.txt, sitemap.xml, llms.txt, sw-push.js |

## Called By
- End users (browser) · crawlers (SSG output)

## Health (2026-09-12)
- `og:image` points at /og-image.png which does not exist in public/
- `/search` route exists but is out of Nav
- Dead export: `demoLogin` (no backend route)
