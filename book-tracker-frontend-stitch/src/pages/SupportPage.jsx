import { useNavigate } from 'react-router-dom'
import { goBackOrHome } from '../utils/navigation'

const SUPPORT_EMAIL = 'trackmyread.dev@gmail.com'

export default function SupportPage() {
  const navigate = useNavigate()

  return (
    <main className="min-h-screen bg-surface px-4 py-8 max-w-2xl mx-auto">
      <button
        onClick={() => goBackOrHome(navigate)}
        className="flex items-center gap-2 text-sm text-on-surface-variant mb-6 hover:text-on-surface transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        Back
      </button>

      <h1 className="font-serif text-3xl font-bold text-on-surface mb-2">Support</h1>
      <p className="text-sm text-on-surface-variant mb-8">
        Something not working, or a question we have not answered here? Write to us and a person will reply.
      </p>

      <div className="space-y-6">
        <section className="bg-surface-container-lowest rounded-3xl p-6 space-y-3">
          <h2 className="font-sans text-base font-bold text-on-surface uppercase tracking-wider">Contact us</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            Email <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary font-semibold underline">{SUPPORT_EMAIL}</a>.
            We usually reply within two working days.
          </p>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            If you are reporting a problem, telling us the device you are on (iPhone, iPad, Android or the
            website) and what you were doing at the time makes it far quicker to fix.
          </p>
        </section>

        <section className="bg-surface-container-lowest rounded-3xl p-6 space-y-3">
          <h2 className="font-sans text-base font-bold text-on-surface uppercase tracking-wider">Signing in</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            TrackMyRead uses <strong className="text-on-surface">Sign in with Apple</strong> on iPhone and iPad,
            and <strong className="text-on-surface">Google Sign-In</strong> on Android and the website.
          </p>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            Those are separate identities. If your Apple ID uses a different email address from the one you
            signed up with — or you chose <strong className="text-on-surface">Hide My Email</strong> — signing in
            with Apple creates a <strong className="text-on-surface">new, empty account</strong>. Your books are
            still safe on the original account: open{' '}
            <a href="https://www.trackmyread.com" className="text-primary font-semibold underline">trackmyread.com</a>{' '}
            in a browser and sign in with the address you used before. If you would like the two joined up,
            email us and we will help.
          </p>
        </section>

        <section className="bg-surface-container-lowest rounded-3xl p-6 space-y-3">
          <h2 className="font-sans text-base font-bold text-on-surface uppercase tracking-wider">Deleting your account</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            In the app, go to <strong className="text-on-surface">Settings → Delete account</strong>. On the
            website it is in the same place. Deletion is immediate and permanent: your books, notes, highlights,
            circles and posts are removed, and we cannot restore them afterwards.
          </p>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            If you signed in with Apple, deleting your account also ends TrackMyRead's access to your Apple ID,
            so it stops appearing under Settings → your name → Sign in with Apple on your device.
          </p>
        </section>

        <section className="bg-surface-container-lowest rounded-3xl p-6 space-y-3">
          <h2 className="font-sans text-base font-bold text-on-surface uppercase tracking-wider">Your data</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            What we collect and why is set out in our{' '}
            <a href="/privacy" className="text-primary font-semibold underline">Privacy Policy</a>, and the
            terms of use are in our <a href="/terms" className="text-primary font-semibold underline">Terms</a>.
            To request a copy of your data, email us at the address above.
          </p>
        </section>
      </div>
    </main>
  )
}
