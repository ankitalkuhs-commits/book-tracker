import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { getMyProfile, updateMyProfile, deleteAccount } from '../services/api'

export default function SettingsPage() {
  const { user, login, logout } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    getMyProfile().then(p => {
      setName(p.name || '')
      setBio(p.bio || '')
    }).catch(() => {})
  }, [])

  const handleSave = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const updated = await updateMyProfile({ name: name.trim(), bio: bio.trim() || null })
      login({ ...user, name: updated.name, bio: updated.bio })
      toast('Profile saved!', 'success')
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      toast(e.message || 'Failed to save', 'error')
      setError(e.message || 'Failed to save')
    }
    setSaving(false)
  }

  const handleSignOut = () => {
    logout()
    navigate('/')
  }

  const handleDeleteAccount = async () => {
    setDeleting(true)
    try {
      await deleteAccount()
      logout()
      navigate('/')
    } catch (e) {
      toast(e.message || 'Failed to delete account', 'error')
    }
    setDeleting(false)
  }

  const initials = user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'

  return (
    <main className="max-w-screen-sm mx-auto px-4 md:px-8 pt-8 pb-12 space-y-8">
      <h1 className="font-serif text-3xl font-bold text-primary">Settings</h1>

      {/* Profile section */}
      <section className="bg-surface-container-lowest rounded-3xl p-8 space-y-6">
        <h2 className="font-sans text-base font-bold text-on-surface uppercase tracking-wider">Profile</h2>

        {/* Avatar preview */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full overflow-hidden border-4 border-primary-fixed-dim bg-primary flex items-center justify-center shrink-0">
            {user?.profile_picture ? (
              <img src={user.profile_picture} alt={user.name} className="w-full h-full object-cover"
                onError={e => { e.target.style.display = 'none' }} />
            ) : (
              <span className="text-on-primary text-xl font-bold font-sans">{initials}</span>
            )}
          </div>
          <div>
            <p className="font-bold text-on-surface">{user?.name}</p>
            <p className="text-sm text-on-surface-variant">{user?.email}</p>
            <p className="text-xs text-on-surface-variant/60 mt-0.5">
              Avatar is synced from your Google account
            </p>
          </div>
        </div>

        {/* Edit form */}
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-on-surface-variant">Display Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your name"
              className="w-full bg-surface-container-low rounded-xl px-4 py-3 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-on-surface-variant">Bio</label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="A little about you and your reading life..."
              rows={3}
              className="w-full bg-surface-container-low rounded-xl px-4 py-3 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="btn-primary px-6 py-2.5 text-sm rounded-xl disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            {saved && (
              <span className="flex items-center gap-1.5 text-sm text-secondary font-medium">
                <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                Saved!
              </span>
            )}
            {error && <span className="text-sm text-error">{error}</span>}
          </div>
        </form>
      </section>

      {/* Account section */}
      <section className="bg-surface-container-lowest rounded-3xl p-8 space-y-4">
        <h2 className="font-sans text-base font-bold text-on-surface uppercase tracking-wider">Account</h2>

        <div className="space-y-3">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-on-surface">Email</p>
              <p className="text-sm text-on-surface-variant">{user?.email}</p>
            </div>
          </div>

          <div className="border-t border-outline-variant/15 pt-4 space-y-3">
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 text-sm text-error font-medium hover:text-error/80 transition-colors"
            >
              <span className="material-symbols-outlined text-base">logout</span>
              Sign out
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 text-sm text-error/60 hover:text-error transition-colors"
            >
              <span className="material-symbols-outlined text-base">delete_forever</span>
              Delete account
            </button>
          </div>
        </div>
      </section>

      {/* Delete account confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-surface-container-lowest rounded-3xl p-6 w-full max-w-sm shadow-float space-y-4 text-center">
            <span className="material-symbols-outlined text-4xl text-error block">warning</span>
            <h3 className="font-serif text-xl font-bold text-on-surface">Delete Account?</h3>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              This will permanently delete your account, library, notes, and all data. This cannot be undone.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 text-sm font-bold border border-outline-variant rounded-xl hover:bg-surface-container transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="flex-1 py-2.5 text-sm font-bold bg-error text-on-error rounded-xl hover:bg-error/90 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* About */}
      <section className="bg-surface-container-lowest rounded-3xl p-8 space-y-3">
        <h2 className="font-sans text-base font-bold text-on-surface uppercase tracking-wider">About</h2>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          TrackMyRead — your social reading companion. Log progress, share highlights, and discover your next favorite read.
        </p>
      </section>
    </main>
  )
}
