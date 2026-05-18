import { Link, useParams, Navigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { getPostBySlug, POSTS } from '../data/blog/index.js'

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function SectionCard({ section }) {
  return (
    <section id={section.id} className="bg-surface-container-lowest rounded-3xl p-6 space-y-3">
      <h2 className="font-sans text-base font-bold text-on-surface uppercase tracking-wider">
        {section.heading}
      </h2>

      {section.type === 'text' && section.body?.map((para, i) => (
        <p
          key={i}
          className="text-sm text-on-surface-variant leading-relaxed"
          dangerouslySetInnerHTML={{ __html: para }}
        />
      ))}

      {section.type === 'list' && (
        <ul className="space-y-2.5">
          {section.items?.map((item, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-on-surface-variant leading-relaxed">
              <span className="text-primary mt-0.5 shrink-0 font-bold">✓</span>
              <span dangerouslySetInnerHTML={{ __html: item }} />
            </li>
          ))}
        </ul>
      )}

      {section.cta && (
        <Link
          to={section.cta.href}
          className="inline-block mt-1 text-sm font-semibold text-primary hover:underline"
        >
          {section.cta.text} →
        </Link>
      )}
    </section>
  )
}

function RelatedPosts({ slugs }) {
  const posts = slugs.map(getPostBySlug).filter(Boolean)
  if (!posts.length) return null

  return (
    <div className="mt-10">
      <h2 className="font-sans text-sm font-bold text-on-surface uppercase tracking-wider mb-4">
        Related Articles
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {posts.map((post) => (
          <Link
            key={post.slug}
            to={`/blog/${post.slug}`}
            className="block group bg-surface-container-lowest rounded-2xl p-5 space-y-1.5 hover:shadow-float transition-shadow duration-200"
          >
            <span className="inline-block bg-secondary-container text-on-secondary-container rounded-full px-2.5 py-0.5 text-xs font-sans font-semibold uppercase tracking-wide">
              {post.tag}
            </span>
            <h3 className="font-serif text-base font-bold text-on-surface group-hover:text-primary transition-colors leading-snug">
              {post.title}
            </h3>
            <p className="text-xs text-on-surface-variant">{post.readingMinutes} min read</p>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default function BlogPostPage() {
  const { slug } = useParams()
  const post = getPostBySlug(slug)

  if (!post) return <Navigate to="/blog" replace />

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author: {
      '@type': 'Organization',
      name: 'TrackMyRead',
      url: 'https://www.trackmyread.com',
    },
    publisher: {
      '@type': 'Organization',
      name: 'TrackMyRead',
      url: 'https://www.trackmyread.com',
      logo: { '@type': 'ImageObject', url: 'https://www.trackmyread.com/favicon.svg' },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': post.canonical },
    image: post.ogImage,
  }

  return (
    <>
      <Helmet>
        <title>{post.title} — TrackMyRead</title>
        <meta name="description" content={post.description} />
        <link rel="canonical" href={post.canonical} />
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={post.description} />
        <meta property="og:image" content={post.ogImage} />
        <meta property="og:url" content={post.canonical} />
        <meta property="og:type" content="article" />
        <meta property="og:site_name" content="TrackMyRead" />
        <meta property="article:published_time" content={post.publishedAt} />
        <meta property="article:modified_time" content={post.updatedAt} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={post.title} />
        <meta name="twitter:description" content={post.description} />
        <meta name="twitter:image" content={post.ogImage} />
        <script type="application/ld+json">{JSON.stringify(articleSchema)}</script>
      </Helmet>

      <main className="min-h-screen bg-surface px-4 py-10 max-w-3xl mx-auto">
        {/* Breadcrumb */}
        <Link
          to="/blog"
          className="flex items-center gap-2 text-sm text-on-surface-variant mb-8 hover:text-on-surface transition-colors w-fit"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          All articles
        </Link>

        {/* Article header */}
        <header className="mb-8">
          <span className="inline-block bg-secondary-container text-on-secondary-container rounded-full px-3 py-0.5 text-xs font-sans font-semibold uppercase tracking-wide mb-3">
            {post.tag}
          </span>
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-on-surface leading-tight mb-3">
            {post.title}
          </h1>
          <div className="flex items-center gap-3 text-xs text-on-surface-variant">
            <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
            <span>·</span>
            <span>{post.readingMinutes} min read</span>
          </div>
        </header>

        {/* Sections */}
        <div className="space-y-5">
          {post.sections.map((section) => (
            <SectionCard key={section.id} section={section} />
          ))}
        </div>

        {/* Related posts */}
        <RelatedPosts slugs={post.relatedSlugs ?? []} />

        {/* Bottom CTA */}
        <div className="mt-10 bg-primary rounded-3xl p-8 text-center">
          <h2 className="font-serif text-2xl font-bold text-on-primary mb-2">
            Ready to track your reading?
          </h2>
          <p className="text-on-primary/80 text-sm mb-5">
            Join 12,000+ readers on TrackMyRead — free on web and Android.
          </p>
          <Link
            to="/"
            className="inline-block bg-on-primary text-primary font-sans font-semibold px-6 py-3 rounded-full text-sm hover:opacity-90 transition-opacity"
          >
            Get started free →
          </Link>
        </div>
      </main>
    </>
  )
}
