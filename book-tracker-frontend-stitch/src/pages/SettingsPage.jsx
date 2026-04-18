import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { getMyProfile, updateMyProfile, uploadProfilePicture, deleteAccount } from '../services/api'

// Illustrated preset avatars via DiceBear adventurer style
const PRESET_AVATARS = [
  { id: 'sage',     url: 'https://api.dicebear.com/9.x/adventurer/svg?seed=sage&backgroundColor=b6e3f4' },
  { id: 'luna',     url: 'https://api.dicebear.com/9.x/adventurer/svg?seed=luna&backgroundColor=c0aede' },
  { id: 'felix',    url: 'https://api.dicebear.com/9.x/adventurer/svg?seed=felix&backgroundColor=d1d4f9' },
  { id: 'nova',     url: 'https://api.dicebear.com/9.x/adventurer/svg?seed=nova&backgroundColor=ffdfbf' },
  { id: 'arlo',     url: 'https://api.dicebear.com/9.x/adventurer/svg?seed=arlo&backgroundColor=ffd5dc' },
  { id: 'quinn',    url: 'https://api.dicebear.com/9.x/adventurer/svg?seed=quinn&backgroundColor=b6e3f4' },
  { id: 'ember',    url: 'https://api.dicebear.com/9.x/adventurer/svg?seed=ember&backgroundColor=c0aede' },
  { id: 'river',    url: 'https://api.dicebear.com/9.x/adventurer/svg?seed=river&backgroundColor=d1f9e0' },
  { id: 'blake',    url: 'https://api.dicebear.com/9.x/adventurer/svg?seed=blake&backgroundColor=ffeaad' },
  { id: 'cedar',    url: 'https://api.dicebear.com/9.x/adventurer/svg?seed=cedar&backgroundColor=e0d5f9' },
  { id: 'haven',    url: 'https://api.dicebear.com/9.x/adventurer/svg?seed=haven&backgroundColor=d1f9f4' },
  { id: 'lyric',    url: 'https://api.dicebear.com/9.x/adventurer/svg?seed=lyric&backgroundColor=f9d5d5' },
]

function AvatarPickerModal({ current, onSelect, onClose }) {
  const [selected, setSelected] = useState(current)
  const [applying, setApplying] = useState(false)

  const handleApply = async () => {
    if (!selected || selected === current) { onClose(); return }
    setApplying(true)
    await onSelect(selected)
    setApplying(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface-container-lowest rounded-3xl w-full max-w-sm shadow-float overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h3 className="font-serif text-xl font-bold text-on-surface">Choose Avatar</h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Avatar grid */}
        <div className="px-6 pb-6">
          <div className="grid grid-cols-4 gap-3 mb-6">
            {PRESET_AVATARS.map(av => (
              <button
                key={av.id}
                type="button"
                onClick={() => setSelected(av.url)}
                className={`relative w-full aspect-square rounded-2xl overflow-hidden border-3 transition-all focus:outline-none ${
                  selected === av.url
                    ? 'border-primary scale-105 shadow-md'
                    : 'border-transparent hover:border-primary/40 hover:scale-102'
                }`}
                style={{ borderWidth: selected === av.url ? 3 : 2 }}
              >
                <img src={av.url} alt={av.id} className="w-full h-full object-cover" loading="lazy" />
                {selected === av.url && (
                  <div className="absolute inset-0 bg-primary/10 flex items-end justify-end p-1">
                    <span className="material-symbols-outlined text-sm text-primary bg-surface rounded-full p-0.5 leading-none" style={{ fontVariationSettings: "'FILL' 1", fontSize: '14px' }}>check_circle</span>
                  </div>
                )}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleApply}
            disabled={applying || !selected || selected === current}
            className="w-full btn-primary py-3 text-sm font-bold rounded-xl disabled:opacity-50 transition-opacity"
          >
            {applying ? 'Applying...' : 'Use This Avatar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const { user, login, logout } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const avatarInputRef = useRef()

  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [yearlyGoal, setYearlyGoal] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    getMyProfile().then(p => {
      setName(p.name || '')
      setBio(p.bio || '')
      setYearlyGoal(p.yearly_goal || '')
    }).catch(() => {})
  }, [])

  const handlePresetSelect = async (url) => {
    setUploadingAvatar(true)
    try {
      await updateMyProfile({ profile_picture: url })
      login({ ...user, profile_picture: url })
      setAvatarPreview(url)
      toast('Avatar updated!', 'success')
    } catch (e) {
      toast(e.message || 'Failed to update avatar', 'error')
    }
    setUploadingAvatar(false)
  }

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarPreview(URL.createObjectURL(file))
    setUploadingAvatar(true)
    try {
      const { profile_picture } = await uploadProfilePicture(file)
      login({ ...user, profile_picture })
      toast('Profile picture updated!', 'success')
    } catch (e) {
      toast(e.message || 'Upload failed', 'error')
      setAvatarPreview(null)
    }
    setUploadingAvatar(false)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const payload = {
        name: name.trim(),
        bio: bio.trim() || null,
        yearly_goal: yearlyGoal ? parseInt(yearlyGoal, 10) : null,
      }
      const updated = await updateMyProfile(payload)
      login({ ...user, name: updated.name, bio: updated.bio, yearly_goal: updated.yearly_goal })
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

  const currentPicture = avatarPreview || user?.profile_picture
  const initials = user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'

  return (
    <main className="max-w-screen-sm mx-auto px-4 md:px-8 pt-8 pb-12 space-y-8">
      <h1 className="font-serif text-3xl font-bold text-primary">Settings</h1>

      {/* Profile section */}
      <section className="bg-surface-container-lowest rounded-3xl p-8 space-y-6">
        <h2 className="font-sans text-base font-bold text-on-surface uppercase tracking-wider">Profile</h2>

        {/* Avatar */}
        <div className="flex items-center gap-5">
          <div className="relative shrink-0">
            <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-primary-fixed-dim bg-primary flex items-center justify-center">
              {currentPicture ? (
                <img src={currentPicture} alt={user?.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-on-primary text-2xl font-bold">{initials}</span>
              )}
            </div>
            {uploadingAvatar && (
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-on-surface truncate">{user?.name}</p>
            <p className="text-sm text-on-surface-variant truncate">{user?.email}</p>
            <div className="flex items-center gap-3 mt-2">
              <button
                type="button"
                onClick={() => setShowAvatarPicker(true)}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">face</span>
                Choose avatar
              </button>
              <span className="text-outline-variant text-xs">·</span>
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="flex items-center gap-1 text-xs font-medium text-on-surface-variant hover:text-on-surface transition-colors"
              >
                <span className="material-symbols-outlined text-sm">upload</span>
                Upload photo
              </button>
            </div>
          </div>
        </div>
        <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />

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

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-on-surface-variant">
              Yearly Reading Goal
              <span className="text-xs text-on-surface-variant/50 ml-2">books per year</span>
            </label>
            <input
              type="number"
              min="1"
              max="365"
              value={yearlyGoal}
              onChange={e => setYearlyGoal(e.target.value)}
              placeholder="e.g. 24"
              className="w-32 bg-surface-container-low rounded-xl px-4 py-3 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
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

      {/* Avatar picker modal */}
      {showAvatarPicker && (
        <AvatarPickerModal
          current={currentPicture}
          onSelect={handlePresetSelect}
          onClose={() => setShowAvatarPicker(false)}
        />
      )}

      {/* Delete confirmation modal */}
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
