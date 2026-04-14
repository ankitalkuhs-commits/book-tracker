import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { googleLogin, demoLogin, setToken } from '../services/api'
import { GoogleLogin } from '@react-oauth/google'

const HERO_IMAGE = 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=800&q=80'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleGoogleCredential = async (credentialResponse) => {
    try {
      const data = await googleLogin(credentialResponse.credential)
      setToken(data.access_token)
      login(data.user)
      navigate('/home')
    } catch (err) {
      console.error('Google login failed:', err)
      alert('Sign in failed. Please try again.')
    }
  }

  const handleDemoLogin = async () => {
    try {
      const data = await demoLogin()
      setToken(data.access_token)
      login(data.user)
      navigate('/home')
    } catch (err) {
      console.error('Demo login failed:', err)
      alert('Demo login failed. Please try again.')
    }
  }

  return (
    <div
      className="font-sans text-on-surface h-screen flex flex-col overflow-hidden selection:bg-secondary-container selection:text-on-secondary-container"
      style={{
        backgroundColor: '#fbf9f4',
        backgroundImage: 'radial-gradient(#dbdad5 0.5px, transparent 0.5px)',
        backgroundSize: '24px 24px',
      }}
    >
      {/* Header */}
      <header className="shrink-0 glass shadow-zen z-50">
        <div className="flex justify-between items-center h-16 px-8 md:px-12 max-w-screen-2xl mx-auto">
          <div className="text-xl font-bold font-serif text-primary tracking-tight">
            TrackMyRead
          </div>
        </div>
      </header>

      {/* Main — fills remaining height */}
      <main className="flex-1 flex items-center justify-center px-6 py-4 overflow-hidden">
        <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">

          {/* Left: Text & CTA */}
          <div className="lg:col-span-5 order-2 lg:order-1 flex flex-col items-start">
            <h1 className="font-serif text-3xl md:text-4xl lg:text-5xl text-primary font-bold leading-[1.1] mb-3 tracking-tight">
              Track your reading.{' '}
              <span className="italic text-secondary font-normal">Share your journey.</span>
            </h1>
            <p className="text-sm md:text-base text-on-surface-variant leading-relaxed mb-6 max-w-md">
              The social home for book lovers. Log progress, share highlights, and discover
              your next favorite read with friends.
            </p>

            <div className="flex flex-col gap-4 w-full sm:w-auto">
              {/* Custom teal Google Sign In button — overlays the hidden GoogleLogin */}
              <div className="relative">
                {/* Invisible real GoogleLogin for OAuth flow */}
                <div className="opacity-0 absolute inset-0 z-10 overflow-hidden">
                  <GoogleLogin
                    onSuccess={handleGoogleCredential}
                    onError={() => alert('Google Sign In failed. Please try again.')}
                    width="400"
                  />
                </div>
                {/* Visible styled button */}
                <button className="btn-primary px-7 py-3.5 text-base flex items-center justify-center gap-3 shadow-lg w-full sm:w-auto pointer-events-none">
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Sign in with Google
                </button>
              </div>

              {/* Demo Account */}
              <button
                onClick={handleDemoLogin}
                className="text-tertiary font-bold hover:text-on-surface transition-colors flex items-center gap-1 group"
              >
                Try Demo Account
                <span className="material-symbols-outlined text-sm transition-transform group-hover:translate-x-1">
                  arrow_forward
                </span>
              </button>
            </div>

            {/* Trust Badge */}
            <div className="mt-5 flex items-center gap-3 py-2.5 px-4 bg-surface-container-low rounded-full">
              <div className="flex -space-x-2">
                {['A', 'B', 'C'].map((l) => (
                  <div key={l} className="w-7 h-7 rounded-full border-2 border-surface bg-surface-container-highest flex items-center justify-center text-xs text-on-surface-variant font-bold">
                    {l}
                  </div>
                ))}
              </div>
              <span className="text-sm text-on-surface-variant font-medium">
                Joined by 12,000+ curators
              </span>
            </div>
          </div>

          {/* Right: Hero Image */}
          <div className="lg:col-span-7 order-1 lg:order-2 relative">
            <div className="relative z-10 w-full aspect-[4/3] lg:aspect-[4/3] overflow-hidden rounded-[2rem] shadow-[0_32px_64px_-16px_rgba(0,70,74,0.15)]">
              <img
                src={HERO_IMAGE}
                alt="Stack of books"
                className="w-full h-full object-cover"
                onError={(e) => { e.target.parentElement.classList.add('bg-surface-container') }}
              />

              {/* Glassmorphism quote card */}
              <div className="absolute bottom-6 right-6 bg-surface/60 backdrop-blur-2xl p-5 rounded-2xl shadow-xl border border-white/20 max-w-[200px]">
                <span className="material-symbols-outlined text-secondary text-2xl mb-2 block">format_quote</span>
                <p className="font-serif text-primary text-sm leading-snug italic">
                  A reader lives a thousand lives before he dies.
                </p>
                <p className="text-[10px] mt-2 text-on-surface-variant font-medium text-right">
                  — George R.R. Martin
                </p>
              </div>
            </div>

            {/* Decorative blobs */}
            <div className="absolute -top-8 -left-8 w-48 h-48 bg-secondary-container/20 rounded-full blur-3xl -z-10" />
            <div className="absolute -bottom-8 -right-8 w-64 h-64 bg-primary-fixed/30 rounded-full blur-3xl -z-10" />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="shrink-0 py-5 bg-surface-container-low font-sans text-xs tracking-wide"
        style={{ borderTop: '1px solid rgba(190,200,201,0.15)' }}>
        <div className="flex flex-col md:flex-row justify-between items-center px-8 md:px-12 max-w-screen-2xl mx-auto gap-3 md:gap-0">
          <span className="font-serif italic text-primary">TrackMyRead</span>
          <nav className="flex gap-6">
            {['About', 'Privacy', 'Terms'].map((link) => (
              <a key={link} href="#" className="text-on-surface/40 hover:text-primary transition-colors">
                {link}
              </a>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  )
}
