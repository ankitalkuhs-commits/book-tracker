import { useNavigate } from 'react-router-dom'

export default function PrivacyPage() {
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

      <h1 className="font-serif text-3xl font-bold text-on-surface mb-2">Privacy Policy</h1>
      <p className="text-sm text-on-surface-variant mb-8">Last updated: May 2026</p>

      <div className="space-y-6">
        <section className="bg-surface-container-lowest rounded-3xl p-6 space-y-3">
          <h2 className="font-sans text-base font-bold text-on-surface uppercase tracking-wider">What we collect</h2>
          <ul className="space-y-2 text-sm text-on-surface-variant leading-relaxed list-disc list-inside">
            <li><strong className="text-on-surface">Account info</strong> — your name, email, and profile picture from Google Sign-In</li>
            <li><strong className="text-on-surface">Reading data</strong> — books you add, progress, notes, and highlights you create</li>
            <li><strong className="text-on-surface">Social data</strong> — followers, following, group memberships, and posts</li>
            <li><strong className="text-on-surface">Device tokens</strong> — for push notifications (Android/web)</li>
          </ul>
        </section>

        <section className="bg-surface-container-lowest rounded-3xl p-6 space-y-3">
          <h2 className="font-sans text-base font-bold text-on-surface uppercase tracking-wider">How we use it</h2>
          <ul className="space-y-2 text-sm text-on-surface-variant leading-relaxed list-disc list-inside">
            <li>To provide and improve the TrackMyRead service</li>
            <li>To show your reading activity to people you follow (if your profile is public)</li>
            <li>To send push notifications you have opted into</li>
            <li>To generate your reading insights and statistics</li>
          </ul>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            We do <strong className="text-on-surface">not</strong> sell your data to third parties. We do not use your reading data for advertising.
          </p>
        </section>

        <section className="bg-surface-container-lowest rounded-3xl p-6 space-y-3">
          <h2 className="font-sans text-base font-bold text-on-surface uppercase tracking-wider">Private profiles</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            You can set your profile to private in Settings. When private, your library, notes, and reading activity
            are only visible to people you approve as followers. Your username and profile picture remain visible.
          </p>
        </section>

        <section className="bg-surface-container-lowest rounded-3xl p-6 space-y-3">
          <h2 className="font-sans text-base font-bold text-on-surface uppercase tracking-wider">Data storage</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            Your data is stored on secure servers (Supabase PostgreSQL). We retain your data for as long as your
            account is active. You can request deletion at any time.
          </p>
        </section>

        <section className="bg-surface-container-lowest rounded-3xl p-6 space-y-3">
          <h2 className="font-sans text-base font-bold text-on-surface uppercase tracking-wider">Delete your account</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            You can permanently delete your account and all associated data from Settings → Delete Account.
            Deletion is irreversible and removes all your books, notes, and profile data within 30 days.
          </p>
        </section>

        <section className="bg-surface-container-lowest rounded-3xl p-6 space-y-3">
          <h2 className="font-sans text-base font-bold text-on-surface uppercase tracking-wider">Contact</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            For privacy questions or data requests, contact us at:
          </p>
          <a href="mailto:trackmyread.dev@gmail.com" className="text-sm font-semibold text-primary hover:underline">
            trackmyread.dev@gmail.com
          </a>
        </section>
      </div>
    </main>
  )
}
