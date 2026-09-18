# TrackMyRead — SEO Action Plan

**Generated:** 2026-05-16
**Current Score:** 28/100
**Target after Critical fixes:** 52–58/100

---

## CRITICAL — Fix This Week

### C1. Add react-helmet-async for meta tag injection
**Files:** `index.html`, `src/main.jsx`, `src/pages/LoginPage.jsx`, `src/pages/AboutPage.jsx`
**Time:** 2 hours

```bash
npm install react-helmet-async
```

Wrap app in `<HelmetProvider>` in `main.jsx`. Then in `LoginPage.jsx`:
```jsx
import { Helmet } from 'react-helmet-async'

<Helmet>
  <title>TrackMyRead — Social Book Tracker & Reading Progress App</title>
  <meta name="description" content="Track your reading progress, share highlights, and discover books with friends. Free book tracker app — web and Android. Better than Goodreads." />
  <meta property="og:title" content="TrackMyRead — Social Book Tracker" />
  <meta property="og:description" content="Log books, track progress page by page, share highlights with friends. Free reading tracker for book lovers." />
  <meta property="og:image" content="https://www.trackmyread.com/og-image.png" />
  <meta property="og:url" content="https://www.trackmyread.com" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="canonical" href="https://www.trackmyread.com/" />
</Helmet>
```

**Expected: WhatsApp/Facebook/Twitter share previews begin working immediately.**

---

### C2. Create robots.txt
**File:** `public/robots.txt`
**Time:** 5 minutes

```
User-agent: *
Allow: /
Allow: /about
Allow: /privacy
Allow: /terms
Disallow: /home
Disallow: /library
Disallow: /search
Disallow: /profile
Disallow: /settings
Disallow: /notifications
Disallow: /groups
Disallow: /insights
Disallow: /admin
Sitemap: https://www.trackmyread.com/sitemap.xml
```

---

### C3. Create sitemap.xml
**File:** `public/sitemap.xml`
**Time:** 10 minutes

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.trackmyread.com/</loc><lastmod>2026-05-16</lastmod></url>
  <url><loc>https://www.trackmyread.com/about</loc><lastmod>2026-05-16</lastmod></url>
  <url><loc>https://www.trackmyread.com/privacy</loc><lastmod>2026-05-16</lastmod></url>
  <url><loc>https://www.trackmyread.com/terms</loc><lastmod>2026-05-16</lastmod></url>
</urlset>
```

---

### C4. Create og-image.png (1200×630)
**File:** `public/og-image.png`
**Time:** 1 hour (design)

Screenshot of the app's best UI moment — a reading feed or book detail page with progress. Include the TrackMyRead wordmark. Used by C1 above.

---

### C5. Add JSON-LD schema to landing page
**File:** `src/pages/LoginPage.jsx`
**Time:** 30 minutes

Add after the `<Helmet>` block:
```jsx
<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "TrackMyRead",
  "applicationCategory": "LifestyleApplication",
  "operatingSystem": "Web, Android",
  "url": "https://www.trackmyread.com",
  "description": "Social book tracking app. Track reading progress, share highlights, and discover books with friends. Free.",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" }
}) }} />
```

---

## HIGH — Fix Within 1 Week

### H1. Expand the landing page with keyword-rich content
**File:** `src/pages/LoginPage.jsx`
**Time:** 3 hours

The landing page currently has ~120 words of visible content. Google needs at least 400–600 words of indexable text to rank for any keyword. Add below the fold (above footer):

- **Features section** (move from About to landing) with keywords: "book tracker", "reading progress", "reading log"
- **"Why TrackMyRead"** section targeting "Goodreads alternative", "social reading app"
- **"Available on"** section mentioning Android app and web — helps with app-related searches

---

### H2. Improve About page content
**File:** `src/pages/AboutPage.jsx`
**Time:** 2 hours

Current: ~200 words, no meta tags, no keywords.

Add Helmet with:
```jsx
<Helmet>
  <title>About TrackMyRead — Social Reading App for Book Lovers</title>
  <meta name="description" content="TrackMyRead is a free social book tracking app. Track reading progress, share highlights, join reading circles. Available on web and Android." />
  <link rel="canonical" href="https://www.trackmyread.com/about" />
</Helmet>
```

Expand content to 500+ words: founder story, how it started, the reading community vision, feature list with descriptions.

---

### H3. Add landing page H2s targeting core queries
**File:** `src/pages/LoginPage.jsx`

Target keywords to work into section headings:
- "Track every book you read" → book tracker
- "See what your friends are reading" → social reading app
- "Better than Goodreads?" → Goodreads alternative (use in body, not H2)
- "Available free on Android and web" → reading tracker app

---

### H4. Submit sitemap to Google Search Console
**Action:** Manual — go to Google Search Console → Sitemaps → Submit `https://www.trackmyread.com/sitemap.xml`
**Time:** 10 minutes
**Prerequisite:** C2 + C3 deployed

---

## MEDIUM — Fix Within 30 Days

### M1. Pre-render public pages (vite-ssg)
**Time:** 1 day

The react-helmet-async fix (C1) helps social sharing but does NOT guarantee Google indexes the content. For reliable indexing:

```bash
npm install vite-ssg
```

Pre-render `/`, `/about`, `/privacy`, `/terms` at build time. App pages stay CSR (they're behind auth anyway).

This is the single highest-leverage technical change for search visibility.

---

### M2. Create a blog / content strategy
**Time:** Ongoing

TrackMyRead cannot rank organically without content. Target keywords:

| Post Title | Target Keyword | Monthly Searches (est.) |
|---|---|---|
| "Goodreads Alternative in 2026 — What's Better?" | goodreads alternative | 8,000+ |
| "Best Book Tracker Apps in 2026" | book tracker app | 5,000+ |
| "How to Track Your Reading Progress" | reading progress tracker | 2,000+ |
| "Best Apps for Reading Challenges" | reading challenge app | 1,500+ |
| "How to Build a Reading Habit" | reading habit tracker | 2,500+ |

Even 3–4 well-written posts would double organic traffic potential within 6 months.

---

### M3. Add Organization + WebSite schema
**File:** `src/pages/LoginPage.jsx`

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://www.trackmyread.com/#organization",
  "name": "TrackMyRead",
  "url": "https://www.trackmyread.com",
  "email": "trackmyread.dev@gmail.com",
  "description": "Social book tracking platform for readers.",
  "logo": { "@type": "ImageObject", "url": "https://www.trackmyread.com/og-image.png" }
}
```

---

### M4. Optimise Play Store listing
**Time:** 2 hours

Ensure Android Play Store listing contains:
- Short description: "Track books, log progress, share with friends — free"
- Long description (4,000 chars): include "book tracker", "reading tracker", "Goodreads alternative", "reading log app", "reading progress tracker", "book club app"
- Screenshots: show the feed, book detail, insights — not just the login screen
- At least 50 ratings to show social proof

---

## LOW — Backlog

| Task | Effort | Notes |
|---|---|---|
| Add FAQ schema to landing page | 1 hr | "Is TrackMyRead free?", "Is there an Android app?" etc |
| Create llms.txt | 30 min | AI citation readiness |
| Add `inLanguage: "en"` to schema | 15 min | Language signal |
| Add Apple App Store / iOS version | High | Currently Android-only; iOS users = 50%+ of market |
| Add social proof metrics to landing | 1 hr | "12,000+ readers" already in code — make it prominent |
| Press / media page | 2 hrs | Backlink magnet |

---

## Sprint Plan

### Sprint 1 — This week (4–5 hrs)
C1 (react-helmet-async) + C2 (robots.txt) + C3 (sitemap.xml) + C5 (schema) + H4 (submit sitemap to GSC)

**Score after Sprint 1: ~42/100**

### Sprint 2 — Next 2 weeks (8–10 hrs)
C4 (og-image) + H1 (landing page content) + H2 (About page) + M1 (vite-ssg prerendering)

**Score after Sprint 2: ~56/100**

### Sprint 3 — Next 30 days (ongoing)
M2 (blog — 3 posts) + M3 (schema) + M4 (Play Store)

**Score after Sprint 3: ~65/100**

---

## Expected Impact by Fix

| Fix | Expected Outcome |
|---|---|
| react-helmet-async | WhatsApp/social share previews work immediately |
| robots.txt + sitemap | Google discovers and crawls all 4 public pages |
| Schema markup | App-specific SERP features eligible |
| vite-ssg | All public pages reliably indexed with full content |
| Landing page content expansion | Begins ranking for "book tracker app", "reading tracker" |
| Blog (3 posts) | Organic traffic from long-tail reading queries |
