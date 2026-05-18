import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { POSTS } from '../data/blog/index.js'

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function BlogListPage() {
  return (
    <>
      <Helmet>
        <title>TrackMyRead Blog — Reading Tips, App Guides &amp; Book Tracking Advice</title>
        <meta name="description" content="Reading tips, app comparisons, and book tracking guides from the TrackMyRead team. Learn how to read more, track better, and build a lasting reading habit." />
        <link rel="canonical" href="https://www.trackmyread.com/blog" />
        <meta property="og:title" content="TrackMyRead Blog — Reading Tips &amp; Book Tracker Guides" />
        <meta property="og:description" content="Guides on tracking reading habits, app comparisons, and tips to read more books." />
        <meta property="og:image" content="https://www.trackmyread.com/og-image.png" />
        <meta property="og:url" content="https://www.trackmyread.com/blog" />
        <meta property="og:type" content="website" />
      </Helmet>

      <main className="min-h-screen bg-surface px-4 py-10 max-w-3xl mx-auto">
        {/* Back to home */}
        <Link
          to="/"
          className="flex items-center gap-2 text-sm text-on-surface-variant mb-8 hover:text-on-surface transition-colors w-fit"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          TrackMyRead
        </Link>

        {/* Header */}
        <div className="mb-10">
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-on-surface mb-3">
            The TrackMyRead Blog
          </h1>
          <p className="text-on-surface-variant text-base leading-relaxed max-w-xl">
            Reading tips, app guides, and everything you need to build a better reading life.
          </p>
        </div>

        {/* Post list */}
        <div className="space-y-5">
          {POSTS.map((post) => (
            <Link
              key={post.slug}
              to={`/blog/${post.slug}`}
              className="block group"
            >
              <article className="bg-surface-container-lowest rounded-3xl p-6 space-y-3 hover:shadow-float transition-shadow duration-200">
                {/* Tag */}
                <span className="inline-block bg-secondary-container text-on-secondary-container rounded-full px-3 py-0.5 text-xs font-sans font-semibold uppercase tracking-wide">
                  {post.tag}
                </span>

                {/* Title */}
                <h2 className="font-serif text-xl font-bold text-on-surface group-hover:text-primary transition-colors leading-snug">
                  {post.title}
                </h2>

                {/* Excerpt */}
                <p className="text-sm text-on-surface-variant leading-relaxed line-clamp-2">
                  {post.excerpt}
                </p>

                {/* Footer */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-3 text-xs text-on-surface-variant">
                    <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
                    <span>·</span>
                    <span>{post.readingMinutes} min read</span>
                  </div>
                  <span className="text-xs font-semibold text-primary group-hover:underline">
                    Read article →
                  </span>
                </div>
              </article>
            </Link>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="mt-12 bg-primary rounded-3xl p-8 text-center">
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
