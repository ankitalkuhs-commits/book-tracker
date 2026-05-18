import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'

export default function AboutPage() {
  const navigate = useNavigate()

  return (
    <>
    <Helmet>
      <title>About TrackMyRead — Social Reading App for Book Lovers</title>
      <meta name="description" content="TrackMyRead is a free social book tracking app. Track reading progress page by page, share highlights, join reading circles. Available free on web and Android." />
      <link rel="canonical" href="https://www.trackmyread.com/about" />
    </Helmet>
    <main className="min-h-screen bg-surface px-4 py-8 max-w-2xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm text-on-surface-variant mb-6 hover:text-on-surface transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        Back
      </button>

      <h1 className="font-serif text-3xl font-bold text-on-surface mb-2">About TrackMyRead</h1>
      <p className="text-sm text-on-surface-variant mb-8">Your social reading companion</p>

      <div className="space-y-6">
        <section className="bg-surface-container-lowest rounded-3xl p-6 space-y-3">
          <h2 className="font-sans text-base font-bold text-on-surface uppercase tracking-wider">What is TrackMyRead?</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            TrackMyRead is a social book tracking platform for readers who want to do more than just log books.
            Track your reading progress page by page, write highlights and notes, discover what your friends are reading,
            and join reading circles with people who share your taste.
          </p>
        </section>

        <section className="bg-surface-container-lowest rounded-3xl p-6 space-y-3">
          <h2 className="font-sans text-base font-bold text-on-surface uppercase tracking-wider">Features</h2>
          <ul className="space-y-2">
            {[
              '📚 Track books across To Read, Reading, and Finished',
              '📖 Log progress page by page with reading speed stats',
              '✍️ Write highlights, notes, and reviews',
              '👥 Follow friends and see what they\'re reading',
              '🔵 Join reading circles (groups) with shared goals',
              '📊 Yearly insights — pages read, books finished, streaks',
              '📥 Import your Goodreads library in one click',
            ].map((f) => (
              <li key={f} className="text-sm text-on-surface-variant leading-relaxed">{f}</li>
            ))}
          </ul>
        </section>

        <section className="bg-surface-container-lowest rounded-3xl p-6 space-y-3">
          <h2 className="font-sans text-base font-bold text-on-surface uppercase tracking-wider">Contact</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            Have a question, found a bug, or want to suggest a feature?
          </p>
          <a
            href="mailto:trackmyread.dev@gmail.com"
            className="inline-block text-sm font-semibold text-primary hover:underline"
          >
            trackmyread.dev@gmail.com
          </a>
        </section>

        <section className="bg-surface-container-lowest rounded-3xl p-6 space-y-2">
          <h2 className="font-sans text-base font-bold text-on-surface uppercase tracking-wider">Legal</h2>
          <div className="space-y-2">
            <button onClick={() => navigate('/privacy')} className="block text-sm font-semibold text-primary hover:underline text-left">
              Privacy Policy →
            </button>
            <button onClick={() => navigate('/terms')} className="block text-sm font-semibold text-primary hover:underline text-left">
              Terms of Service →
            </button>
          </div>
        </section>

        <p className="text-center text-xs text-on-surface-variant pb-4">
          TrackMyRead · Version 2.1.3 · Made for readers
        </p>
      </div>
    </main>
    </>
  )
}
