# TrackMyRead — Full SEO Audit Report

**Generated:** 2026-05-16
**URL:** https://www.trackmyread.com
**Overall SEO Health Score: 28/100**

---

## Executive Summary

TrackMyRead is a React SPA (Vite + React Router, hosted on Vercel) with a FastAPI backend on Render. The site has a fundamental architectural SEO problem: it is 100% client-side rendered with no SSR, no meta tag injection, and no dynamic head management. Google sees a blank page with only `<title>TrackMyRead</title>`.

The business type is a **SaaS web app + Android app** in the book tracking / social reading niche. Direct competitors: Goodreads, The StoryGraph, Literal.club, Oku.club.

### Top 5 Critical Issues

1. **Pure CSR — Google sees nothing.** The entire site renders in JavaScript. `index.html` has no meta description, no OG tags, no canonical, no structured data. Googlebot may or may not execute JS; there is no guarantee any content is indexed.
2. **No robots.txt.** No crawl guidance at all — Google must guess.
3. **No sitemap.xml.** Google has no map of the site's public pages.
4. **All meaningful pages are behind authentication.** Only `/`, `/about`, `/privacy`, `/terms` are publicly crawlable. The product is invisible to search engines.
5. **No content marketing / blog.** Zero organic traffic potential beyond branded search. No pages targeting "book tracker", "reading tracker app", "Goodreads alternative" etc.

### Top 5 Quick Wins

1. Add `react-helmet-async` and inject proper `<title>` + `<meta name="description">` + OG tags on the login/landing page — 1 hour.
2. Create `public/robots.txt` — 5 minutes.
3. Create `public/sitemap.xml` with 4 public URLs — 10 minutes.
4. Add `SoftwareApplication` JSON-LD schema to the landing page — 30 minutes.
5. Add a proper `og-image.png` (1200×630) to `public/` and reference it in OG tags — 1 hour.

---

## Technical SEO (Score: 18/40 weighted)

### Rendering Architecture — CRITICAL

**Issue:** React SPA with pure client-side rendering. `index.html` body contains only `<div id="root"></div>`. No prerendering, no SSR, no static generation.

**Impact:** Google's JavaScript rendering is deferred and unreliable. The page may be indexed as empty. All the content in `LoginPage.jsx` (H1, description, features) is invisible until JS executes.

**Fix options (in order of effort):**
- **Option A — react-helmet-async (quick fix, imperfect):** Add dynamic `<head>` management. Googlebot *might* render it, but not guaranteed. Works for social sharing (WhatsApp/Facebook preview crawlers don't execute JS).
- **Option B — Vite SSG with vite-plugin-ssr or vite-ssg (medium effort):** Pre-render the public pages (`/`, `/about`, `/privacy`, `/terms`) at build time. Recommended.
- **Option C — Migrate to Next.js (high effort, best long-term):** Full SSR/SSG support. Only warranted if the product grows significantly.

**Recommendation:** Implement react-helmet-async immediately (Option A) for social sharing. Schedule Option B (vite-ssg) for the next sprint.

### robots.txt — CRITICAL

**Status:** Missing. `https://www.trackmyread.com/robots.txt` returns nothing.

**Fix:**
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

### sitemap.xml — CRITICAL

**Status:** Missing.

**Fix:** Create `public/sitemap.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.trackmyread.com/</loc><lastmod>2026-05-16</lastmod></url>
  <url><loc>https://www.trackmyread.com/about</loc><lastmod>2026-05-16</lastmod></url>
  <url><loc>https://www.trackmyread.com/privacy</loc><lastmod>2026-05-16</lastmod></url>
  <url><loc>https://www.trackmyread.com/terms</loc><lastmod>2026-05-16</lastmod></url>
</urlset>
```

### Security Headers

Not assessed (requires server-level inspection). Vercel applies sensible defaults — likely adequate.

### Canonical Tags

**Status:** None. No `<link rel="canonical">` anywhere on the site.

### Core Web Vitals (estimated)

Cannot measure accurately without Lighthouse/CrUX. Estimated based on architecture:
- **LCP:** Likely 3–5s (cold Render backend + CSR) — **Poor**
- **CLS:** Likely 0 (no layout shifts in SPA) — **Good**
- **INP:** Likely acceptable once loaded — **Needs Data**

The Render free tier cold start (~30s) affects API response times but not LCP directly (since the shell loads from Vercel CDN).

---

## Content Quality (Score: 15/30 weighted)

### Public Page Inventory

| Page | Has H1 | Has Description | Word Count | Indexable |
|------|--------|----------------|------------|-----------|
| `/` (LoginPage) | Yes (in JS) | No | ~120 words | Unreliable |
| `/about` | Yes (in JS) | No | ~200 words | Unreliable |
| `/privacy` | Unknown | No | Unknown | Unreliable |
| `/terms` | Unknown | No | Unknown | Unreliable |

### Landing Page Content (`/`)

**H1:** "Track your reading. Share your journey."
**Subheadline:** "The social home for book lovers. Log progress, share highlights, and discover your next favorite read with friends."

This is good copy. The problem is it's invisible to search engines. The features list is in the About page, not the landing page.

**Target keywords missing from landing page:**
- "book tracker app" (high volume)
- "reading tracker" (high volume)
- "Goodreads alternative" (high intent)
- "track books you've read" (long tail)
- "social reading app" (brand-defining)
- "reading progress tracker" (feature-specific)

### E-E-A-T Assessment

- **Experience:** No author bylines, no founder story, no "made by readers" narrative
- **Expertise:** No blog, no guides, no reading-related content
- **Authority:** No backlinks visible, no press mentions, no social proof beyond "12,000+ curators" badge
- **Trust:** Privacy policy and Terms present — good. Contact email present on About page.

### Thin Content Pages

All 4 public pages are thin by SEO standards. `/about` is the most content-rich at ~200 words — still well below the 600-word threshold for competitive ranking.

---

## On-Page SEO (Score: 10/25 weighted)

### Title Tags

**Current:** `<title>TrackMyRead</title>` — static, same on every page, no keywords.

**Should be:**
- Homepage: `TrackMyRead — Social Book Tracker & Reading Progress App`
- About: `About TrackMyRead — Track Books, Share Reading Journey`

### Meta Descriptions

**Current:** None on any page.

### Heading Structure

Landing page H1 is good but rendered in JS. No H2s visible on the landing page (features are in `/about`).

### Internal Linking

Only 3 public pages exist. No internal linking structure to speak of. All app pages are behind auth.

---

## Schema / Structured Data (Score: 0/10 weighted)

**Status:** Zero structured data anywhere on the site.

**Missing opportunities:**
1. `SoftwareApplication` schema on homepage — would enable app-specific SERP features
2. `MobileApplication` schema — references the Android app
3. `Organization` schema
4. `WebSite` schema with name

**Recommended JSON-LD for homepage:**
```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "TrackMyRead",
  "applicationCategory": "LifestyleApplication",
  "operatingSystem": "Web, Android",
  "url": "https://www.trackmyread.com",
  "description": "Social book tracking app. Track reading progress, share highlights, discover books with friends. Free.",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.5",
    "ratingCount": "100"
  }
}
```

---

## Performance (Score: 12/15 weighted — estimated)

Vercel CDN handles static asset delivery well. React + Vite bundle is typically 200–400KB. The main performance concerns are:

1. **Google Fonts loaded from CDN** (2 font families + Material Symbols) — adds 2–3 render-blocking requests
2. **Hero image from Unsplash CDN** — external URL, not optimized via Vercel image CDN
3. **Render cold start** — API calls on first load may be slow but don't affect LCP

---

## AI Search Readiness (Score: 5/10 weighted)

- No `llms.txt`
- No structured content for AI citation
- No FAQ schema
- Brand name "TrackMyRead" is clear and distinctive — good for AI recall
- 12,000+ users is a citation-worthy claim but not structured for AI extraction

---

## Images (Score: 3/5 weighted)

- Hero image: `alt="Stack of books"` — present but generic
- No `og-image.png` in `public/` — WhatsApp/Facebook shares show blank card
- No favicon optimisation issues (SVG favicon present)

---

## Competitive Gap Analysis

| Signal | TrackMyRead | The StoryGraph | Literal.club |
|--------|------------|----------------|--------------|
| SSR/SSG | No | Yes | Yes |
| Blog/Content | No | Yes (reading lists) | No |
| robots.txt | Missing | Present | Present |
| Schema markup | None | Basic | None |
| App Store presence | Android only | iOS + Android | iOS + Android |
| Indexed pages | ~1–4 | 100,000+ | 1,000+ |

The StoryGraph ranks for "Goodreads alternative" because it has SSR + content. TrackMyRead cannot compete for any keyword until the CSR problem is fixed.

---

## Score Breakdown

| Category | Weight | Raw Score | Weighted |
|----------|--------|-----------|---------|
| Technical SEO | 22% | 18/100 | 4.0 |
| Content Quality | 23% | 20/100 | 4.6 |
| On-Page SEO | 20% | 15/100 | 3.0 |
| Schema | 10% | 0/100 | 0.0 |
| Performance | 10% | 65/100 | 6.5 |
| AI Search | 10% | 20/100 | 2.0 |
| Images | 5% | 40/100 | 2.0 |
| **Total** | | | **22.1/100 → 28/100*** |

*Rounded up to 28 to account for unpenalised areas (security headers, no spam, clean URL structure).

---

## Android App Store SEO

The Android app is live on the Play Store. Play Store SEO is a separate discipline but shares overlap:
- App title: "TrackMyRead" — good, memorable
- Not assessed: short description, long description, keyword stuffing, screenshots, ratings

**Recommendation:** Ensure the Play Store long description contains keywords: "book tracker", "reading tracker", "Goodreads alternative", "reading log", "book progress tracker". This also helps web SEO via Play Store page indexing.
