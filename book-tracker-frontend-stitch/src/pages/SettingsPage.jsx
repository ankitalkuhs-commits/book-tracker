import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { getMyProfile, updateMyProfile, uploadProfilePicture, deleteAccount, getNotificationPrefs, updateNotificationPrefs, importGoodreads } from '../services/api'

// Illustrated preset avatars via DiceBear adventurer style — synced with mobile
const AVATAR_SEEDS = ['Aneka','Buster','Callie','Destiny','Emery','Felix','Gracie','Harley','Iris','Jasper','Kali','Lexi']
const AVATAR_BGS   = ['c8e6f5','dcc8f0','c8e6c9','f5dcc8','f5c8c8','c8ddf5','e8c8f5','f5f0c8','c8f0e8','f0c8d8','d8f0c8','c8d8f0']
const PRESET_AVATARS = AVATAR_SEEDS.map((seed, i) => ({
  id: seed,
  url: `https://api.dicebear.com/9.x/adventurer/png?seed=${seed}&size=200&backgroundColor=${AVATAR_BGS[i]}`,
}))

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
  const [isPrivate, setIsPrivate] = useState(false)
  const [savingPrivacy, setSavingPrivacy] = useState(false)
  const [notifPrefs, setNotifPrefs] = useState({
    new_follower: true,
    post_liked: true,
    post_commented: true,
    book_completed: true,
    reading_streak_reminder: true,
  })
  const [savingPref, setSavingPref] = useState(null) // key of pref currently saving

  // Goodreads import
  const csvInputRef = useRef()
  const [importFile, setImportFile]     = useState(null)   // File object
  const [importing, setImporting]       = useState(false)
  const [importResult, setImportResult] = useState(null)   // { imported, skipped, failed, total }
  const [importError, setImportError]   = useState(null)
  const [dragging, setDragging]         = useState(false)

  useEffect(() => {
    getMyProfile().then(p => {
      setName(p.name || '')
      setBio(p.bio || '')
      setYearlyGoal(p.yearly_goal || '')
      setIsPrivate(p.is_private_profile || false)
    }).catch(() => {})
    getNotificationPrefs().then(p => setNotifPrefs(prev => ({ ...prev, ...p }))).catch(() => {})
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

  const handleNotifPref = async (key, val) => {
    setNotifPrefs(prev => ({ ...prev, [key]: val }))
    setSavingPref(key)
    try {
      const updated = { ...notifPrefs, [key]: val }
      await updateNotificationPrefs(updated)
    } catch (e) {
      setNotifPrefs(prev => ({ ...prev, [key]: !val }))
      toast(e.message || 'Failed to update preference', 'error')
    }
    setSavingPref(null)
  }

  const handlePrivacyToggle = async (val) => {
    setIsPrivate(val)
    setSavingPrivacy(true)
    try {
      await updateMyProfile({ is_private_profile: val })
      toast(val ? 'Profile set to private' : 'Profile set to public', 'success')
    } catch (e) {
      setIsPrivate(!val)
      toast(e.message || 'Failed to update privacy', 'error')
    }
    setSavingPrivacy(false)
  }

  const handleCsvSelect = (file) => {
    if (!file) return
    const name = file.name.toLowerCase()
    const mime = file.type.toLowerCase()
    const looksLikeCsv = name.endsWith('.csv') || mime.includes('csv') || mime.includes('excel') || mime.includes('spreadsheet')
    if (!looksLikeCsv) {
      setImportError('Please select the .csv file exported from Goodreads.')
      return
    }
    setImportFile(file)
    setImportResult(null)
    setImportError(null)
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    handleCsvSelect(file)
  }, [])

  const handleDragOver = (e) => { e.preventDefault(); setDragging(true) }
  const handleDragLeave = () => setDragging(false)

  const handleImport = async () => {
    if (!importFile) return
    setImporting(true)
    setImportError(null)
    setImportResult(null)
    try {
      const result = await importGoodreads(importFile)
      setImportResult(result)
      setImportFile(null)
      if (result.imported > 0) {
        toast(`${result.imported} books imported from Goodreads!`, 'success')
      }
    } catch (e) {
      setImportError(e.message || 'Import failed. Please try again.')
    }
    setImporting(false)
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

      {/* Privacy section */}
      <section className="bg-surface-container-lowest rounded-3xl p-8 space-y-5">
        <h2 className="font-sans text-base font-bold text-on-surface uppercase tracking-wider">Privacy</h2>

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-on-surface">Private Profile</p>
            <p className="text-sm text-on-surface-variant mt-0.5 leading-relaxed">
              Only your followers can see your library and notes. Your name and avatar remain visible.
            </p>
          </div>
          <button
            type="button"
            disabled={savingPrivacy}
            onClick={() => handlePrivacyToggle(!isPrivate)}
            className={`relative shrink-0 w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-60 ${
              isPrivate ? 'bg-primary' : 'bg-outline-variant'
            }`}
            aria-label="Toggle private profile"
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
              isPrivate ? 'translate-x-6' : 'translate-x-0'
            }`} />
          </button>
        </div>

        {isPrivate && (
          <div className="flex items-center gap-2 text-xs text-on-surface-variant bg-surface-container-low rounded-xl px-4 py-3">
            <span className="material-symbols-outlined text-sm text-secondary">lock</span>
            Your profile is private. Non-followers see a locked view.
          </div>
        )}
      </section>

      {/* Notifications section */}
      <section className="bg-surface-container-lowest rounded-3xl p-8 space-y-5">
        <h2 className="font-sans text-base font-bold text-on-surface uppercase tracking-wider">Notifications</h2>

        {[
          { key: 'new_follower',             label: 'New followers',         desc: 'When someone starts following you' },
          { key: 'post_liked',               label: 'Likes',                 desc: 'When someone likes your post' },
          { key: 'post_commented',           label: 'Comments',              desc: 'When someone comments on your post' },
          { key: 'book_completed',           label: 'Friend activity',       desc: 'When friends add or finish books' },
          { key: 'reading_streak_reminder',  label: 'Streak reminders',      desc: 'Daily reminder to keep your reading streak' },
          { key: 'group_invite',             label: 'Circle invites',        desc: 'When someone invites you to join a Circle' },
          { key: 'group_join_request',       label: 'Join requests',         desc: 'When someone requests to join your Circle (curators only)' },
        ].map(({ key, label, desc }) => (
          <div key={key} className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-on-surface">{label}</p>
              <p className="text-sm text-on-surface-variant mt-0.5">{desc}</p>
            </div>
            <button
              type="button"
              disabled={savingPref === key}
              onClick={() => handleNotifPref(key, !notifPrefs[key])}
              className={`relative shrink-0 w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-60 ${
                notifPrefs[key] ? 'bg-primary' : 'bg-outline-variant'
              }`}
              aria-label={`Toggle ${label}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                notifPrefs[key] ? 'translate-x-6' : 'translate-x-0'
              }`} />
            </button>
          </div>
        ))}
      </section>

      {/* ── Import Your Library ── */}
      <section className="bg-surface-container-lowest rounded-3xl overflow-hidden">

        {/* Header */}
        <div className="px-8 pt-8 pb-5 border-b border-outline-variant/15">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-secondary/10 flex items-center justify-center shrink-0 mt-0.5">
              <span className="material-symbols-outlined text-secondary text-xl">download</span>
            </div>
            <div>
              <h2 className="font-sans text-base font-bold text-on-surface uppercase tracking-wider">Import Your Library</h2>
              <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">
                Bring your entire Goodreads reading history into TrackMyRead — books, status, star ratings, and reviews.
              </p>
            </div>
          </div>
        </div>

        {/* Step-by-step guide */}
        <div className="px-8 py-6 border-b border-outline-variant/15">
          <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-4">How to export from Goodreads</p>
          <ol className="space-y-3">
            {[
              {
                n: '1',
                text: 'Open the Goodreads Import & Export page (you\'ll need to be signed in)',
                icon: 'open_in_new',
                link: 'https://www.goodreads.com/review/import',
                linkLabel: 'Go to Goodreads Import & Export →',
              },
              {
                n: '2',
                text: 'Scroll down to the "Export Library" section',
                icon: 'manage_accounts',
              },
              {
                n: '3',
                text: 'Click "Export Library" — Goodreads will prepare your file',
                icon: 'table_rows',
              },
              {
                n: '4',
                text: 'Goodreads generates your file — click "Your export from…" to download the .csv',
                icon: 'download',
              },
              {
                n: '5',
                text: 'Upload that file below. Your books, ratings, and reviews all come across.',
                icon: 'upload_file',
              },
            ].map(step => (
              <li key={step.n} className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {step.n}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-on-surface leading-relaxed">{step.text}</p>
                  {step.link && (
                    <a
                      href={step.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline mt-1"
                    >
                      <span className="material-symbols-outlined text-sm">open_in_new</span>
                      {step.linkLabel}
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ol>

          {/* Visual tip showing what to look for */}
          <div className="mt-4 flex items-start gap-2 bg-secondary/8 rounded-2xl px-4 py-3">
            <span className="material-symbols-outlined text-secondary text-base shrink-0 mt-0.5">lightbulb</span>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              <span className="font-semibold text-on-surface">Tip:</span> The exported file is named something like{' '}
              <code className="bg-surface-container-high px-1.5 py-0.5 rounded text-xs font-mono">goodreads_library_export.csv</code>.
              Make sure you download the file, not just open it.
            </p>
          </div>
        </div>

        {/* Upload zone */}
        <div className="px-8 py-6">
          {!importResult ? (
            <>
              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => !importFile && csvInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-2xl transition-all cursor-pointer ${
                  dragging
                    ? 'border-primary bg-primary/5 scale-[1.01]'
                    : importFile
                    ? 'border-secondary/50 bg-secondary/5 cursor-default'
                    : 'border-outline-variant hover:border-primary/50 hover:bg-surface-container-low'
                }`}
              >
                <div className="flex flex-col items-center justify-center gap-2 py-8 px-6 text-center">
                  {importFile ? (
                    <>
                      <span className="material-symbols-outlined text-4xl text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>description</span>
                      <p className="font-semibold text-sm text-on-surface">{importFile.name}</p>
                      <p className="text-xs text-on-surface-variant">{(importFile.size / 1024).toFixed(1)} KB · CSV file</p>
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setImportFile(null); setImportError(null) }}
                        className="text-xs text-on-surface-variant hover:text-error transition-colors mt-1"
                      >
                        Remove file
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-4xl text-outline-variant">upload_file</span>
                      <div>
                        <p className="font-semibold text-sm text-on-surface">Drop your Goodreads CSV here</p>
                        <p className="text-xs text-on-surface-variant mt-1">or click to browse your files</p>
                      </div>
                      <p className="text-xs text-outline-variant">.csv files only</p>
                    </>
                  )}
                </div>
              </div>

              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={e => handleCsvSelect(e.target.files?.[0])}
              />

              {/* Error */}
              {importError && (
                <div className="flex items-start gap-2 mt-3 text-sm text-error bg-error/8 rounded-xl px-4 py-3">
                  <span className="material-symbols-outlined text-base shrink-0 mt-0.5">error</span>
                  {importError}
                </div>
              )}

              {/* Import button */}
              {importFile && (
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={importing}
                  className="w-full mt-4 btn-primary py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {importing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Importing your library…
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-base">upload</span>
                      Import from Goodreads
                    </>
                  )}
                </button>
              )}
              {importing && (
                <p className="text-xs text-center text-on-surface-variant mt-2">
                  This may take a minute for large collections — please don't close this tab.
                </p>
              )}
            </>
          ) : (
            /* ── Result card ── */
            <div className="animate-fadeInUp">
              <div className="text-center mb-5">
                <span className="text-5xl">{importResult.imported > 0 ? '🎉' : '📋'}</span>
                <h3 className="font-serif text-xl font-bold text-on-surface mt-3">Import Complete</h3>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="bg-surface-container-low rounded-2xl p-4 text-center">
                  <p className="text-2xl font-bold text-primary">{importResult.imported}</p>
                  <p className="text-xs text-on-surface-variant mt-1 font-medium">Imported</p>
                </div>
                <div className="bg-surface-container-low rounded-2xl p-4 text-center">
                  <p className="text-2xl font-bold text-on-surface-variant">{importResult.skipped}</p>
                  <p className="text-xs text-on-surface-variant mt-1 font-medium">Already in library</p>
                </div>
                <div className="bg-surface-container-low rounded-2xl p-4 text-center">
                  <p className={`text-2xl font-bold ${importResult.failed > 0 ? 'text-error' : 'text-on-surface-variant'}`}>
                    {importResult.failed}
                  </p>
                  <p className="text-xs text-on-surface-variant mt-1 font-medium">Errors</p>
                </div>
              </div>

              {importResult.imported > 0 && (
                <p className="text-sm text-on-surface-variant text-center leading-relaxed mb-4">
                  Your Goodreads library is now in TrackMyRead. Ratings and reviews have been saved too.
                  Head to your <a href="/library" className="text-primary font-medium hover:underline">Library</a> to see everything.
                </p>
              )}
              {importResult.imported === 0 && importResult.skipped > 0 && (
                <p className="text-sm text-on-surface-variant text-center leading-relaxed mb-4">
                  All books were already in your library — nothing new to import.
                </p>
              )}

              <button
                type="button"
                onClick={() => { setImportResult(null); setImportError(null) }}
                className="w-full py-2.5 rounded-xl border border-outline-variant text-sm font-medium text-on-surface-variant hover:bg-surface-container transition-colors"
              >
                Import another file
              </button>
            </div>
          )}
        </div>
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
