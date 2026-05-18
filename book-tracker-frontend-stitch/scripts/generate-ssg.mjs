/**
 * Post-build SSG script: generate route-specific index.html files in dist/
 *
 * Run after `vite build`:   node scripts/generate-ssg.mjs
 * Or via:                   npm run build:ssg
 *
 * Each public route gets its own dist/<route>/index.html with:
 *   - Correct <title>, <meta description>, OG tags, canonical in <head>
 *   - Static SEO content inside <div id="root"> for crawlers without JS
 *   - All React app scripts intact so JS users get the full SPA
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { POSTS } from '../src/data/blog/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, '../dist')

if (!fs.existsSync(distDir)) {
  console.error('dist/ not found — run `vite build` first.')
  process.exit(1)
}

const BASE_HTML = fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8')

function injectHead(html, { title, description, canonical, ogTitle, ogDescription, ogType }) {
  // Replace static <title>
  let out = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
  // Inject meta tags before </head>
  const tags = [
    `<meta name="description" content="${description}">`,
    `<link rel="canonical" href="${canonical}">`,
    `<meta property="og:title" content="${ogTitle}">`,
    `<meta property="og:description" content="${ogDescription}">`,
    `<meta property="og:image" content="https://www.trackmyread.com/og-image.png">`,
    `<meta property="og:url" content="${canonical}">`,
    `<meta property="og:type" content="${ogType ?? 'website'}">`,
    `<meta property="og:site_name" content="TrackMyRead">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${ogTitle}">`,
    `<meta name="twitter:description" content="${ogDescription}">`,
    `<meta name="twitter:image" content="https://www.trackmyread.com/og-image.png">`,
  ].join('\n  ')
  return out.replace('</head>', `  ${tags}\n</head>`)
}

function injectBody(html, staticContent) {
  return html.replace('<div id="root"></div>', `<div id="root">${staticContent}</div>`)
}

/** Serialize a post's sections array into static HTML for non-JS crawlers */
function sectionsToHtml(sections) {
  return sections.map((s) => {
    const contentHtml = s.type === 'list'
      ? `<ul>${(s.items ?? []).map((i) => `<li>${i}</li>`).join('')}</ul>`
      : (s.body ?? []).map((p) => `<p>${p}</p>`).join('')
    const ctaHtml = s.cta ? `<p><a href="${s.cta.href}">${s.cta.text}</a></p>` : ''
    return `<section><h2>${s.heading}</h2>${contentHtml}${ctaHtml}</section>`
  }).join('\n')
}

const ROUTES = [
  {
    outputPath: null, // updates dist/index.html in place
    title: 'TrackMyRead — Social Book Tracker & Reading Progress App',
    description: 'Track your reading progress, share highlights, and discover books with friends. Free book tracker app for book lovers — web and Android. A better Goodreads alternative.',
    canonical: 'https://www.trackmyread.com/',
    ogTitle: 'TrackMyRead — Social Book Tracker',
    ogDescription: 'Log books, track reading progress page by page, share highlights with friends. Free reading tracker for book lovers.',
    body: `<div style="font-family:sans-serif;max-width:800px;margin:0 auto;padding:2rem">
      <h1>TrackMyRead — Social Book Tracker &amp; Reading Progress App</h1>
      <p>Track your reading progress, share highlights, and discover books with friends. Free book tracker app for book lovers — web and Android. A better Goodreads alternative.</p>
      <h2>Track every book you read</h2>
      <p>Log reading progress page by page. Write highlights and notes. See your yearly reading insights — pages read, books finished, reading streaks.</p>
      <ul>
        <li>Page-by-page progress tracking with automatic reading speed</li>
        <li>Reading log and history with dates, ratings, and notes</li>
        <li>Yearly insights — pages read, books finished, streaks</li>
        <li>Import your Goodreads library in one click</li>
      </ul>
      <h2>Your reading life, shared</h2>
      <p>The social reading app for book lovers. Follow friends, see what they are reading, share your favourite highlights, and join reading circles with shared goals. A free, modern alternative to Goodreads.</p>
      <p>Joined by 12,000+ readers. Free on web and Android.</p>
    </div>`,
  },
  {
    outputPath: 'about',
    title: 'About TrackMyRead — Social Reading App for Book Lovers',
    description: 'TrackMyRead is a free social book tracking app. Track reading progress page by page, share highlights, join reading circles. Available free on web and Android.',
    canonical: 'https://www.trackmyread.com/about',
    ogTitle: 'About TrackMyRead — Social Reading App',
    ogDescription: 'Free social book tracking app. Track progress, share highlights, join reading circles. Web and Android.',
    body: `<div style="font-family:sans-serif;max-width:800px;margin:0 auto;padding:2rem">
      <h1>About TrackMyRead</h1>
      <p>TrackMyRead is a free social book tracking platform for readers who want to do more than just log books. Track your reading progress page by page, write highlights and notes, discover what your friends are reading, and join reading circles with people who share your taste.</p>
      <h2>Features</h2>
      <ul>
        <li>Track books across To Read, Reading, and Finished</li>
        <li>Log reading progress page by page with reading speed stats</li>
        <li>Write highlights, notes, and reviews</li>
        <li>Follow friends and see what they are reading</li>
        <li>Join reading circles (groups) with shared goals</li>
        <li>Yearly insights — pages read, books finished, reading streaks</li>
        <li>Import your Goodreads library in one click</li>
      </ul>
      <p>Available free on web and Android. Contact: trackmyread.dev@gmail.com</p>
    </div>`,
  },
  {
    outputPath: 'privacy',
    title: 'Privacy Policy — TrackMyRead',
    description: 'Privacy policy for TrackMyRead — the free social book tracking app for web and Android.',
    canonical: 'https://www.trackmyread.com/privacy',
    ogTitle: 'Privacy Policy — TrackMyRead',
    ogDescription: 'Privacy policy for TrackMyRead.',
    body: `<div style="font-family:sans-serif;max-width:800px;margin:0 auto;padding:2rem">
      <h1>Privacy Policy</h1>
      <p>Privacy policy for TrackMyRead — the social book tracking app.</p>
    </div>`,
  },
  {
    outputPath: 'terms',
    title: 'Terms of Service — TrackMyRead',
    description: 'Terms of service for TrackMyRead — the free social book tracking app for web and Android.',
    canonical: 'https://www.trackmyread.com/terms',
    ogTitle: 'Terms of Service — TrackMyRead',
    ogDescription: 'Terms of service for TrackMyRead.',
    body: `<div style="font-family:sans-serif;max-width:800px;margin:0 auto;padding:2rem">
      <h1>Terms of Service</h1>
      <p>Terms of service for TrackMyRead — the social book tracking app.</p>
    </div>`,
  },
  // Blog list page
  {
    outputPath: 'blog',
    title: 'TrackMyRead Blog — Reading Tips, App Guides & Book Tracking Advice',
    description: 'Reading tips, app comparisons, and book tracking guides from the TrackMyRead team. Learn how to read more, track better, and build a lasting reading habit.',
    canonical: 'https://www.trackmyread.com/blog',
    ogTitle: 'TrackMyRead Blog — Reading Tips & Book Tracker Guides',
    ogDescription: 'Guides on tracking reading habits, app comparisons, and tips to read more books.',
    body: `<div style="font-family:sans-serif;max-width:800px;margin:0 auto;padding:2rem">
      <h1>TrackMyRead Blog</h1>
      <p>Reading tips, app comparisons, and book tracking guides.</p>
      <ul>
        ${POSTS.map((p) => `<li><a href="/blog/${p.slug}">${p.title}</a> — ${p.excerpt}</li>`).join('\n        ')}
      </ul>
    </div>`,
  },
  // One entry per blog post — generated dynamically from POSTS data
  ...POSTS.map((post) => ({
    outputPath: `blog/${post.slug}`,
    title: `${post.title} — TrackMyRead`,
    description: post.description,
    canonical: post.canonical,
    ogTitle: post.title,
    ogDescription: post.description,
    ogType: 'article',
    body: `<div style="font-family:sans-serif;max-width:800px;margin:0 auto;padding:2rem">
      <h1>${post.title}</h1>
      <p><time datetime="${post.publishedAt}">${post.publishedAt}</time> · ${post.readingMinutes} min read</p>
      ${sectionsToHtml(post.sections)}
    </div>`,
  })),
]

for (const route of ROUTES) {
  let html = injectHead(BASE_HTML, route)
  html = injectBody(html, route.body)

  if (route.outputPath === null) {
    fs.writeFileSync(path.join(distDir, 'index.html'), html)
    console.log('✓  dist/index.html — updated meta tags + static body')
  } else {
    const routeDir = path.join(distDir, route.outputPath)
    fs.mkdirSync(routeDir, { recursive: true })
    fs.writeFileSync(path.join(routeDir, 'index.html'), html)
    console.log(`✓  dist/${route.outputPath}/index.html — generated`)
  }
}

console.log('\nSSG complete. Deploy dist/ to Vercel.')
