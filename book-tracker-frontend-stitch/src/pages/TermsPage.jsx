import { useNavigate } from 'react-router-dom'

export default function TermsPage() {
  const navigate = useNavigate()

  return (
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

      <h1 className="font-serif text-3xl font-bold text-on-surface mb-2">Terms of Service</h1>
      <p className="text-sm text-on-surface-variant mb-8">Last updated: May 2026</p>

      <div className="space-y-6">
        <section className="bg-surface-container-lowest rounded-3xl p-6 space-y-3">
          <h2 className="font-sans text-base font-bold text-on-surface uppercase tracking-wider">Acceptance</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            By using TrackMyRead, you agree to these terms. If you do not agree, please do not use the service.
            You must be at least 13 years old to create an account.
          </p>
        </section>

        <section className="bg-surface-container-lowest rounded-3xl p-6 space-y-3">
          <h2 className="font-sans text-base font-bold text-on-surface uppercase tracking-wider">Your account</h2>
          <ul className="space-y-2 text-sm text-on-surface-variant leading-relaxed list-disc list-inside">
            <li>You are responsible for keeping your account credentials secure</li>
            <li>You may not create accounts for others without their consent</li>
            <li>One account per person</li>
          </ul>
        </section>

        <section className="bg-surface-container-lowest rounded-3xl p-6 space-y-3">
          <h2 className="font-sans text-base font-bold text-on-surface uppercase tracking-wider">Your content</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            You own the notes, highlights, and posts you create. By posting content on TrackMyRead, you grant us
            a licence to display it to other users as part of the service. We do not claim ownership of your content.
          </p>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            You agree not to post content that is illegal, abusive, harassing, or infringes on anyone's rights.
            We may remove content that violates these terms.
          </p>
        </section>

        <section className="bg-surface-container-lowest rounded-3xl p-6 space-y-3">
          <h2 className="font-sans text-base font-bold text-on-surface uppercase tracking-wider">Book data</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            Book metadata (titles, covers, descriptions) is sourced from the Google Books API and is subject to
            Google's terms of service. Amazon affiliate links may be displayed for book purchases.
          </p>
        </section>

        <section className="bg-surface-container-lowest rounded-3xl p-6 space-y-3">
          <h2 className="font-sans text-base font-bold text-on-surface uppercase tracking-wider">Service availability</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            We aim to keep TrackMyRead available at all times but do not guarantee uninterrupted service.
            We may modify, suspend, or discontinue any part of the service with reasonable notice.
          </p>
        </section>

        <section className="bg-surface-container-lowest rounded-3xl p-6 space-y-3">
          <h2 className="font-sans text-base font-bold text-on-surface uppercase tracking-wider">Termination</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            You may delete your account at any time from Settings. We may suspend or terminate accounts that
            violate these terms.
          </p>
        </section>

        <section className="bg-surface-container-lowest rounded-3xl p-6 space-y-3">
          <h2 className="font-sans text-base font-bold text-on-surface uppercase tracking-wider">Contact</h2>
          <a href="mailto:trackmyread.dev@gmail.com" className="text-sm font-semibold text-primary hover:underline">
            trackmyread.dev@gmail.com
          </a>
        </section>
      </div>
    </main>
  )
}
