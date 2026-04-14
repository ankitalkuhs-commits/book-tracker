import { useGoogleLogin } from '@react-oauth/google'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { googleLogin, demoLogin, setToken } from '../services/api'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleGoogleSuccess = async (tokenResponse) => {
    try {
      // Google returns an access_token, we need to get the id_token
      // Use the credential flow instead
    } catch (err) {
      console.error('Login failed:', err)
    }
  }

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

  // Use the credential-based Google login (id_token flow)
  // This requires GoogleOAuthProvider wrapping the app (done in main.jsx)
  const initGoogleLogin = () => {
    // Trigger Google's one-tap / popup via the rendered button
    window.google?.accounts.id.prompt()
  }

  return (
    <div
      className="font-sans text-on-surface min-h-screen flex flex-col selection:bg-secondary-container selection:text-on-secondary-container"
      style={{
        backgroundColor: '#fbf9f4',
        backgroundImage: 'radial-gradient(#dbdad5 0.5px, transparent 0.5px)',
        backgroundSize: '24px 24px',
        backgroundAttachment: 'fixed',
      }}
    >
      {/* Header */}
      <header className="fixed top-0 w-full z-50 glass shadow-zen">
        <div className="flex justify-between items-center h-20 px-8 md:px-12 max-w-screen-2xl mx-auto">
          <div className="text-2xl font-bold font-serif text-primary tracking-tight">
            TrackMyRead
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-grow flex flex-col items-center justify-center pt-32 pb-20 px-6">
        <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-24 items-center">

          {/* Left: Text & CTA */}
          <div className="lg:col-span-5 order-2 lg:order-1 flex flex-col items-start">
            <h1 className="font-serif text-5xl md:text-6xl lg:text-7xl text-primary font-bold leading-[1.1] mb-6 tracking-tight">
              Track your reading.{' '}
              <span className="italic text-secondary font-normal">Share your journey.</span>
            </h1>
            <p className="text-lg md:text-xl text-on-surface-variant leading-relaxed mb-10 max-w-md">
              The social home for book lovers. Log progress, share highlights, and discover
              your next favorite read with friends.
            </p>

            <div className="flex flex-col gap-6 w-full sm:w-auto">
              {/* Google Sign In — renders the real Google button via @react-oauth/google */}
              <GoogleSignInButton onCredential={handleGoogleCredential} />

              {/* Demo Account */}
              <button
                onClick={handleDemoLogin}
                className="text-tertiary font-bold text-center sm:text-left hover:text-on-surface transition-colors flex items-center justify-center sm:justify-start gap-1 group"
              >
                Try Demo Account
                <span className="material-symbols-outlined text-sm transition-transform group-hover:translate-x-1">
                  arrow_forward
                </span>
              </button>
            </div>

            {/* Trust Badge */}
            <div className="mt-16 flex items-center gap-4 py-3 px-5 bg-surface-container-low rounded-full">
              <div className="flex -space-x-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="w-8 h-8 rounded-full border-2 border-surface bg-surface-container-highest flex items-center justify-center text-xs text-on-surface-variant font-bold"
                  >
                    {String.fromCharCode(64 + i)}
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
            <div className="relative z-10 w-full aspect-square overflow-hidden rounded-[2rem] shadow-[0_32px_64px_-16px_rgba(0,70,74,0.15)]">
              {/* Placeholder gradient — replace with real image if desired */}
              <div className="w-full h-full bg-gradient-to-br from-surface-container to-surface-container-high flex items-center justify-center">
                <span className="material-symbols-outlined text-[8rem] text-primary/20">menu_book</span>
              </div>

              {/* Glassmorphism card overlay */}
              <div className="absolute bottom-8 right-8 bg-surface/40 backdrop-blur-2xl p-6 rounded-2xl shadow-xl border border-white/20 max-w-[200px]">
                <p className="text-xs font-bold text-secondary uppercase tracking-widest mb-2">
                  Now Reading
                </p>
                <p className="font-serif text-primary font-bold text-lg leading-tight">
                  The Midnight Library
                </p>
                <div className="mt-4 h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
                  <div className="h-full w-[65%] bg-secondary shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]" />
                </div>
                <p className="text-[10px] mt-2 text-on-surface-variant font-medium text-right">
                  65% complete
                </p>
              </div>
            </div>

            {/* Decorative blobs */}
            <div className="absolute -top-12 -left-12 w-64 h-64 bg-secondary-container/20 rounded-full blur-3xl -z-10" />
            <div className="absolute -bottom-12 -right-12 w-80 h-80 bg-primary-fixed/30 rounded-full blur-3xl -z-10" />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-12 mt-auto bg-surface-container-low font-sans text-sm tracking-wide"
        style={{ borderTop: '1px solid rgba(190,200,201,0.15)' }}>
        <div className="flex flex-col md:flex-row justify-between items-center px-8 md:px-12 max-w-screen-2xl mx-auto gap-6 md:gap-0">
          <div className="flex flex-col items-center md:items-start gap-2">
            <span className="font-serif italic text-primary text-lg">TrackMyRead</span>
            <span className="text-on-surface/40">© 2024 TrackMyRead. The Digital Curator.</span>
          </div>
          <nav className="flex gap-8">
            {['About', 'Privacy', 'Terms', 'Editorial Guidelines'].map((link) => (
              <a key={link} href="#" className="text-on-surface/40 hover:text-primary transition-colors duration-300">
                {link}
              </a>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  )
}

// Separate component for Google Sign-In using @react-oauth/google credential flow
import { GoogleLogin } from '@react-oauth/google'

function GoogleSignInButton({ onCredential }) {
  return (
    <div className="w-full sm:w-auto">
      <GoogleLogin
        onSuccess={onCredential}
        onError={() => alert('Google Sign In failed. Please try again.')}
        useOneTap={false}
        render={(renderProps) => (
          <button
            onClick={renderProps.onClick}
            disabled={renderProps.disabled}
            className="btn-primary px-8 py-4 text-lg flex items-center justify-center gap-3 shadow-lg hover:shadow-xl transition-all duration-300 w-full sm:w-auto"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </button>
        )}
      />
    </div>
  )
}
