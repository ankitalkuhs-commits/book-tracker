import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../components/Toast'
import { createGroup, searchUsersForInvite } from '../services/api'
import { GroupCover } from './GroupsPage'

const COVER_PRESETS = [
  { id: 'teal',     label: 'Teal' },
  { id: 'gold',     label: 'Gold' },
  { id: 'forest',   label: 'Forest' },
  { id: 'indigo',   label: 'Indigo' },
  { id: 'rose',     label: 'Rose' },
  { id: 'slate',    label: 'Slate' },
  { id: 'amber',    label: 'Amber' },
  { id: 'midnight', label: 'Midnight' },
]

export default function CreateGroupPage() {
  const navigate = useNavigate()
  const toast = useToast()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [coverPreset, setCoverPreset] = useState('teal')
  const [goalPages, setGoalPages] = useState('')
  const [goalPeriod, setGoalPeriod] = useState('monthly')

  // Invite members
  const [inviteQuery, setInviteQuery] = useState('')
  const [inviteResults, setInviteResults] = useState([])
  const [invitedUsers, setInvitedUsers] = useState([])
  const [searching, setSearching] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const searchUsers = async (q) => {
    setInviteQuery(q)
    if (q.trim().length < 2) { setInviteResults([]); return }
    setSearching(true)
    try {
      const res = await searchUsersForInvite(q)
      setInviteResults(res || [])
    } catch { setInviteResults([]) }
    setSearching(false)
  }

  const addInvite = (user) => {
    if (!invitedUsers.find(u => u.id === user.id)) {
      setInvitedUsers(prev => [...prev, user])
    }
    setInviteQuery('')
    setInviteResults([])
  }

  const removeInvite = (userId) => {
    setInvitedUsers(prev => prev.filter(u => u.id !== userId))
  }

  const handleSubmit = async () => {
    if (!name.trim()) { toast('Group name is required', 'error'); return }
    setSubmitting(true)
    try {
      const group = await createGroup({
        name: name.trim(),
        description: description.trim() || null,
        is_private: isPrivate,
        cover_preset: coverPreset,
        goal_pages: goalPages ? parseInt(goalPages) : null,
        goal_period: goalPages ? goalPeriod : null,
        invite_user_ids: invitedUsers.map(u => u.id),
      })
      toast(`"${group.name}" created!`, 'success')
      navigate(`/groups/${group.id}`)
    } catch (e) {
      toast(e.message || 'Failed to create group', 'error')
    }
    setSubmitting(false)
  }

  return (
    <main className="max-w-screen-lg mx-auto px-4 md:px-8 pt-8 pb-16">
      {/* Header */}
      <div className="mb-8 space-y-1">
        <p className="text-xs font-bold uppercase tracking-widest text-secondary">Groups</p>
        <h1 className="font-serif text-4xl md:text-5xl font-bold text-primary leading-tight">
          Create a New Group
        </h1>
        <p className="text-on-surface-variant text-sm max-w-md mt-2">
          Start a reading group, invite friends, and read together.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* ── Left: Form ────────────────────────────────── */}
        <div className="lg:col-span-7 space-y-6">

          {/* Cover preset picker */}
          <div className="bg-surface-container-lowest rounded-3xl p-6 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-secondary">Cover</h2>
            <div className="grid grid-cols-4 gap-3">
              {COVER_PRESETS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setCoverPreset(p.id)}
                  className={`relative rounded-xl overflow-hidden h-14 transition-all ${
                    coverPreset === p.id ? 'ring-2 ring-primary ring-offset-2' : ''
                  }`}
                >
                  <GroupCover preset={p.id} className="w-full h-full" />
                  {coverPreset === p.id && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="material-symbols-outlined text-white text-lg">check</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
            {/* Preview */}
            <GroupCover preset={coverPreset} className="w-full h-24 rounded-2xl">
              <p className="text-white font-serif font-bold text-lg px-4 text-center line-clamp-1">
                {name || 'Your Group Name'}
              </p>
            </GroupCover>
          </div>

          {/* Name + Description */}
          <div className="bg-surface-container-lowest rounded-3xl p-6 space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-secondary">Group Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Classic Fiction Club"
                className="w-full bg-transparent border-none focus:outline-none font-serif text-2xl text-on-surface placeholder:text-on-surface-variant/40 italic"
              />
            </div>
            <div className="border-t border-outline-variant/15 pt-5 space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-secondary">Description</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What's this group about? What are you reading together?"
                rows={5}
                className="w-full bg-surface-container-low rounded-xl px-4 py-3 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none text-on-surface"
              />
            </div>
          </div>

          {/* Privacy */}
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setIsPrivate(false)}
              className={`rounded-2xl p-5 text-left border-2 transition-all ${
                !isPrivate ? 'border-primary bg-primary/5' : 'border-outline-variant/20 bg-surface-container-lowest'
              }`}
            >
              <span className="material-symbols-outlined text-2xl text-primary mb-2 block">public</span>
              <p className="font-bold text-on-surface">Public</p>
              <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                Anyone can find and request to join this group.
              </p>
              <div className={`mt-4 py-2 text-center text-sm font-bold rounded-xl border ${
                !isPrivate ? 'bg-primary text-on-primary border-primary' : 'border-outline-variant text-on-surface-variant'
              }`}>
                {!isPrivate ? 'Selected Public' : 'Select Public'}
              </div>
            </button>

            <button
              onClick={() => setIsPrivate(true)}
              className={`rounded-2xl p-5 text-left border-2 transition-all ${
                isPrivate ? 'border-primary bg-primary/5' : 'border-outline-variant/20 bg-surface-container-lowest'
              }`}
            >
              <span className="material-symbols-outlined text-2xl text-primary mb-2 block">lock</span>
              <p className="font-bold text-on-surface">Private</p>
              <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                Hidden from search. Members join via invitation or invite link only.
              </p>
              <div className={`mt-4 py-2 text-center text-sm font-bold rounded-xl border ${
                isPrivate ? 'bg-primary text-on-primary border-primary' : 'border-outline-variant text-on-surface-variant'
              }`}>
                {isPrivate ? 'Selected Private' : 'Select Private'}
              </div>
            </button>
          </div>

          {/* Reading Goal */}
          <div className="bg-surface-container-lowest rounded-3xl p-6 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-secondary">Reading Goal <span className="text-on-surface-variant/50 normal-case text-xs font-normal">(optional)</span></h2>
            <div className="flex gap-3 items-center">
              <div className="flex-1">
                <input
                  type="number"
                  value={goalPages}
                  onChange={e => setGoalPages(e.target.value)}
                  placeholder="e.g. 50000"
                  min="1"
                  className="w-full bg-surface-container-low rounded-xl px-4 py-2.5 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <p className="text-xs text-on-surface-variant/60 mt-1 ml-1">pages to read together</p>
              </div>
              <div className="flex bg-surface-container rounded-xl p-1 shrink-0">
                {['monthly', 'yearly'].map(p => (
                  <button
                    key={p}
                    onClick={() => setGoalPeriod(p)}
                    className={`px-4 py-2 rounded-lg text-sm font-bold capitalize transition-all ${
                      goalPeriod === p
                        ? 'bg-surface-container-lowest text-primary shadow-sm'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: Gather the Circle + CTA ────────────── */}
        <div className="lg:col-span-5 space-y-5">

          {/* Invite panel */}
          <div className="bg-surface-container-lowest rounded-3xl p-6 space-y-4">
            <h2 className="font-serif text-xl font-bold text-on-surface">Invite Members</h2>

            {/* Search */}
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline/60 text-sm">search</span>
              <input
                value={inviteQuery}
                onChange={e => searchUsers(e.target.value)}
                placeholder="Search by username..."
                className="w-full bg-surface-container-low rounded-xl pl-9 pr-4 py-2.5 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {inviteResults.length > 0 && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-surface-container-lowest rounded-xl shadow-float border border-outline-variant/15 z-10 overflow-hidden">
                  {inviteResults.slice(0, 5).map(u => (
                    <button
                      key={u.id}
                      onClick={() => addInvite(u)}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-container transition-colors flex items-center gap-2"
                    >
                      <span className="font-bold text-on-surface">{u.name}</span>
                      <span className="text-on-surface-variant/60">@{u.username}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Invited chips */}
            {invitedUsers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {invitedUsers.map(u => (
                  <span key={u.id} className="flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-bold px-3 py-1.5 rounded-full">
                    @{u.username || u.name}
                    <button onClick={() => removeInvite(u.id)} className="hover:text-error transition-colors">
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Share links (shown after creation — placeholder) */}
            <div className="border-t border-outline-variant/15 pt-4 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50">Or Share Access Link</p>
              <div className="bg-surface-container rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-on-surface-variant/60 italic">
                <span className="material-symbols-outlined text-base">link</span>
                Invite link generated after creation
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="bg-primary rounded-3xl p-6 space-y-3">
            <h3 className="font-serif text-xl font-bold text-on-primary">Ready to go?</h3>
            <p className="text-sm text-on-primary/70 leading-relaxed">
              You'll be the admin of this group.
            </p>
            <button
              onClick={handleSubmit}
              disabled={submitting || !name.trim()}
              className="w-full bg-surface-container-lowest text-primary font-bold py-3.5 rounded-2xl text-sm hover:bg-surface-container transition-colors disabled:opacity-50 mt-2"
            >
              {submitting ? 'Creating...' : 'Create Group'}
            </button>
          </div>

          <button
            onClick={() => navigate('/groups')}
            className="w-full text-center text-sm text-on-surface-variant hover:text-on-surface transition-colors py-2"
          >
            Cancel
          </button>
        </div>
      </div>
    </main>
  )
}
