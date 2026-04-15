import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import {
  getGroup, getGroupMembers, getGroupLeaderboard, getGroupGoal,
  getGroupPosts, createGroupPost, deleteGroupPost,
  getPendingMembers, approveGroupMember, rejectGroupMember, removeGroupMember,
  inviteToGroup, leaveGroup, deleteGroup, updateGroup,
  setGroupBook, clearGroupBook, searchUsersForInvite, searchGoogleBooks,
  joinByInviteCode,
} from '../services/api'
import { GroupCover } from './GroupsPage'

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = (Date.now() - new Date(dateStr)) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function Avatar({ user, size = 9 }) {
  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : '?'
  return (
    <div
      className={`w-${size} h-${size} rounded-full overflow-hidden shrink-0`}
      style={{ width: `${size * 4}px`, height: `${size * 4}px` }}
    >
      {user?.profile_picture ? (
        <img src={user.profile_picture} alt={user.name} className="w-full h-full object-cover"
          onError={e => { e.target.style.display = 'none' }} />
      ) : (
        <div className="w-full h-full bg-primary flex items-center justify-center text-on-primary text-xs font-bold">
          {initials}
        </div>
      )}
    </div>
  )
}

// ─── Rank Medal ───────────────────────────────────────────────────────────────

function RankBadge({ rank }) {
  if (rank === 1) return <span className="text-lg">🥇</span>
  if (rank === 2) return <span className="text-lg">🥈</span>
  if (rank === 3) return <span className="text-lg">🥉</span>
  return (
    <span className="w-7 h-7 flex items-center justify-center rounded-full bg-surface-container text-xs font-bold text-on-surface-variant">
      {rank}
    </span>
  )
}

// ─── Post Card ────────────────────────────────────────────────────────────────

function PostCard({ post, isCurator, isOwn, onDelete }) {
  return (
    <div className="bg-surface-container-lowest rounded-2xl p-4 space-y-2">
      <div className="flex items-start gap-3">
        <Avatar user={post.user} size={9} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-bold text-sm text-on-surface">{post.user?.name}</span>
            <span className="text-[11px] text-on-surface-variant/50">{timeAgo(post.created_at)}</span>
          </div>
          {post.quote && (
            <blockquote className="font-serif italic text-primary/80 text-sm border-l-2 border-secondary/40 pl-3 my-2 leading-relaxed">
              "{post.quote}"
            </blockquote>
          )}
          <p className="text-sm text-on-surface leading-relaxed">{post.text}</p>
          {post.book && (
            <span className="inline-flex items-center gap-1 mt-2 text-[11px] font-bold uppercase tracking-wider text-secondary bg-secondary/10 px-2 py-1 rounded-full">
              <span className="material-symbols-outlined text-xs">menu_book</span>
              {post.book.title}
            </span>
          )}
        </div>
        {(isOwn || isCurator) && (
          <button
            onClick={() => onDelete(post.id)}
            className="text-on-surface-variant/40 hover:text-error transition-colors shrink-0"
          >
            <span className="material-symbols-outlined text-base">delete</span>
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Set Book Modal ───────────────────────────────────────────────────────────

function SetBookModal({ onClose, onSet }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const toast = useToast()

  const search = async (val) => {
    setQ(val)
    if (val.trim().length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const res = await searchGoogleBooks(val)
      setResults(res || [])
    } catch { setResults([]) }
    setSearching(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-surface-container-lowest rounded-3xl p-6 w-full max-w-md shadow-float space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-lg font-bold text-on-surface">Set Group Book</h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline/60 text-sm">search</span>
          <input
            value={q}
            onChange={e => search(e.target.value)}
            placeholder="Search for a book..."
            className="w-full bg-surface-container-low rounded-xl pl-9 pr-4 py-2.5 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        {searching && <p className="text-xs text-on-surface-variant/60 text-center">Searching...</p>}
        {results.length > 0 && (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {results.slice(0, 8).map(b => (
              <button
                key={b.google_books_id || b.id}
                onClick={() => onSet(b)}
                className="w-full text-left flex items-center gap-3 p-3 rounded-xl hover:bg-surface-container transition-colors"
              >
                {b.cover_url ? (
                  <img src={b.cover_url} alt={b.title} className="w-8 h-12 object-cover rounded shrink-0" />
                ) : (
                  <div className="w-8 h-12 bg-surface-container rounded shrink-0 flex items-center justify-center">
                    <span className="material-symbols-outlined text-outline/40 text-sm">menu_book</span>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-bold text-sm text-on-surface line-clamp-1">{b.title}</p>
                  <p className="text-xs text-on-surface-variant">{b.author}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Edit Group Modal ─────────────────────────────────────────────────────────

function EditGroupModal({ group, onClose, onSave }) {
  const [name, setName] = useState(group.name)
  const [description, setDescription] = useState(group.description || '')
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  const handleSave = async () => {
    if (!name.trim()) { toast('Name is required', 'error'); return }
    setSaving(true)
    try {
      await onSave({ name: name.trim(), description: description.trim() || null })
      onClose()
    } catch (e) {
      toast(e.message || 'Failed to update', 'error')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-surface-container-lowest rounded-3xl p-6 w-full max-w-md shadow-float space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-lg font-bold text-on-surface">Edit Group</h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-1">Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-surface-container-low rounded-xl px-4 py-2.5 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-surface-container-low rounded-xl px-4 py-2.5 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-bold text-on-surface-variant border border-outline-variant rounded-xl hover:bg-surface-container transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 text-sm font-bold bg-primary text-on-primary rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── New Post Modal ───────────────────────────────────────────────────────────

function NewPostModal({ onClose, onPost }) {
  const [text, setText] = useState('')
  const [quote, setQuote] = useState('')
  const [posting, setPosting] = useState(false)
  const toast = useToast()

  const handlePost = async () => {
    if (!text.trim()) { toast('Write something!', 'error'); return }
    setPosting(true)
    try {
      await onPost({ text: text.trim(), quote: quote.trim() || null })
      onClose()
    } catch (e) {
      toast(e.message || 'Failed to post', 'error')
    }
    setPosting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-surface-container-lowest rounded-3xl p-6 w-full max-w-md shadow-float space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-lg font-bold text-on-surface">Share with the Circle</h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-1">Your Thoughts</label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={3}
              placeholder="What's on your mind?"
              className="w-full bg-surface-container-low rounded-xl px-4 py-2.5 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-1">Quote <span className="font-normal normal-case">(optional)</span></label>
            <input
              value={quote}
              onChange={e => setQuote(e.target.value)}
              placeholder="A passage that moved you..."
              className="w-full bg-surface-container-low rounded-xl px-4 py-2.5 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-bold text-on-surface-variant border border-outline-variant rounded-xl hover:bg-surface-container transition-colors">
            Cancel
          </button>
          <button onClick={handlePost} disabled={posting} className="flex-1 py-2.5 text-sm font-bold bg-primary text-on-primary rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50">
            {posting ? 'Posting...' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GroupDetailPage() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()

  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [leaderPeriod, setLeaderPeriod] = useState('monthly')
  const [goal, setGoal] = useState(null)
  const [posts, setPosts] = useState([])
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(true)

  // Invite panel
  const [inviteQuery, setInviteQuery] = useState('')
  const [inviteResults, setInviteResults] = useState([])
  const [inviting, setInviting] = useState(null)

  // Modals
  const [showNewPost, setShowNewPost] = useState(false)
  const [showSetBook, setShowSetBook] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Invite link copied
  const [linkCopied, setLinkCopied] = useState(false)

  const isCurator = group?.membership_role === 'curator'
  const isMember = group?.membership_status === 'active'

  const safe = fn => fn.catch(() => null)

  const load = async () => {
    setLoading(true)
    try {
      const g = await getGroup(parseInt(groupId))
      setGroup(g)

      const [m, lb, gl, p] = await Promise.all([
        safe(getGroupMembers(parseInt(groupId))),
        safe(getGroupLeaderboard(parseInt(groupId), leaderPeriod)),
        safe(getGroupGoal(parseInt(groupId))),
        safe(getGroupPosts(parseInt(groupId))),
      ])
      setMembers(m || [])
      setLeaderboard(lb || [])
      setGoal(gl || null)
      setPosts(p || [])

      if (g?.membership_role === 'curator') {
        const pend = await safe(getPendingMembers(parseInt(groupId)))
        setPending(pend || [])
      }
    } catch (e) {
      toast(e.message || 'Group not found', 'error')
      navigate('/groups')
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [groupId])

  const loadLeaderboard = async (period) => {
    setLeaderPeriod(period)
    try {
      const lb = await getGroupLeaderboard(parseInt(groupId), period)
      setLeaderboard(lb || [])
    } catch { }
  }

  const handleInviteSearch = async (q) => {
    setInviteQuery(q)
    if (q.trim().length < 2) { setInviteResults([]); return }
    try {
      const res = await searchUsersForInvite(q)
      // Filter out existing members
      const memberIds = new Set(members.map(m => m.user_id))
      setInviteResults((res || []).filter(u => !memberIds.has(u.id)))
    } catch { setInviteResults([]) }
  }

  const handleInvite = async (targetUser) => {
    setInviting(targetUser.id)
    try {
      await inviteToGroup(parseInt(groupId), targetUser.id)
      toast(`Invited ${targetUser.name}!`, 'success')
      setInviteQuery('')
      setInviteResults([])
    } catch (e) {
      toast(e.message || 'Failed to invite', 'error')
    }
    setInviting(null)
  }

  const handleApprove = async (userId) => {
    try {
      await approveGroupMember(parseInt(groupId), userId)
      toast('Member approved!', 'success')
      setPending(prev => prev.filter(p => p.user_id !== userId))
      load()
    } catch (e) { toast(e.message || 'Failed', 'error') }
  }

  const handleReject = async (userId) => {
    try {
      await rejectGroupMember(parseInt(groupId), userId)
      setPending(prev => prev.filter(p => p.user_id !== userId))
      toast('Request declined', 'info')
    } catch (e) { toast(e.message || 'Failed', 'error') }
  }

  const handleRemoveMember = async (userId) => {
    try {
      await removeGroupMember(parseInt(groupId), userId)
      setMembers(prev => prev.filter(m => m.user_id !== userId))
      toast('Member removed', 'info')
    } catch (e) { toast(e.message || 'Failed', 'error') }
  }

  const handleLeave = async () => {
    try {
      await leaveGroup(parseInt(groupId))
      toast('You left the group', 'info')
      navigate('/groups')
    } catch (e) { toast(e.message || 'Failed to leave', 'error') }
  }

  const handleDeleteGroup = async () => {
    try {
      await deleteGroup(parseInt(groupId))
      toast('Group disbanded', 'info')
      navigate('/groups')
    } catch (e) { toast(e.message || 'Failed', 'error') }
  }

  const handlePost = async (data) => {
    const p = await createGroupPost(parseInt(groupId), data)
    setPosts(prev => [p, ...prev])
  }

  const handleDeletePost = async (postId) => {
    await deleteGroupPost(parseInt(groupId), postId)
    setPosts(prev => prev.filter(p => p.id !== postId))
  }

  const handleSetBook = async (book) => {
    // book comes from Google Books search — we need its DB id
    // We search our library first; if not found, book is added via add-to-library
    // For simplicity, use the book's DB id if it has one, otherwise handle gracefully
    try {
      // The setGroupBook endpoint expects a book_id (DB id)
      // If it's a Google Books result without a local id, we can't set it
      // We'll only allow books from local library in this MVP
      if (!book.id) {
        toast('This book is not in the library yet. Add it to your library first.', 'info')
        return
      }
      const result = await setGroupBook(parseInt(groupId), book.id)
      setGroup(prev => ({ ...prev, current_book: result }))
      toast(`Group book set to "${result.title}"`, 'success')
      setShowSetBook(false)
    } catch (e) {
      toast(e.message || 'Failed to set book', 'error')
    }
  }

  const handleClearBook = async () => {
    try {
      await clearGroupBook(parseInt(groupId))
      setGroup(prev => ({ ...prev, current_book: null }))
      toast('Group book cleared', 'info')
    } catch (e) { toast(e.message || 'Failed', 'error') }
  }

  const handleSaveEdit = async (data) => {
    const updated = await updateGroup(parseInt(groupId), data)
    setGroup(prev => ({ ...prev, ...updated }))
    toast('Group updated!', 'success')
  }

  const copyInviteLink = () => {
    const link = `${window.location.origin}/join/${group.invite_code}`
    navigator.clipboard.writeText(link).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    })
  }

  if (loading) {
    return (
      <main className="max-w-screen-xl mx-auto px-4 md:px-8 pt-8 pb-16 space-y-6">
        <div className="h-48 bg-surface-container-lowest rounded-3xl animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-24 bg-surface-container-lowest rounded-2xl animate-pulse" />)}
          </div>
          <div className="lg:col-span-4 space-y-4">
            {[1, 2].map(i => <div key={i} className="h-36 bg-surface-container-lowest rounded-2xl animate-pulse" />)}
          </div>
        </div>
      </main>
    )
  }

  if (!group) return null

  return (
    <main className="max-w-screen-xl mx-auto px-4 md:px-8 pt-8 pb-16 space-y-8">

      {/* ── Hero Header ──────────────────────────────────── */}
      <div className="relative rounded-3xl overflow-hidden">
        <GroupCover preset={group.cover_preset} className="w-full h-48 md:h-56" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute inset-0 flex flex-col justify-end p-6 md:p-8">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-1">
            {group.is_private ? 'Private Literary Circle' : 'Literary Circle'}
          </p>
          <h1 className="font-serif text-3xl md:text-5xl font-bold text-white leading-tight">
            {group.name}
          </h1>
          {group.description && (
            <p className="text-white/70 text-sm mt-2 max-w-lg line-clamp-2">{group.description}</p>
          )}
          <div className="flex items-center gap-4 mt-3 text-[11px] font-bold text-white/60 uppercase tracking-wider">
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">group</span>
              {group.member_count} Members
            </span>
            {group.is_private && (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">lock</span>
                Private
              </span>
            )}
            {isCurator && (
              <span className="flex items-center gap-1 text-secondary">
                <span className="material-symbols-outlined text-sm">star</span>
                Curator
              </span>
            )}
          </div>
        </div>

        {/* Action buttons top-right */}
        <div className="absolute top-4 right-4 flex gap-2">
          {isCurator && (
            <button
              onClick={() => setShowEdit(true)}
              className="px-3 py-1.5 text-xs font-bold bg-white/20 backdrop-blur text-white rounded-xl hover:bg-white/30 transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-sm">edit</span>
              Edit
            </button>
          )}
          <button
            onClick={() => navigate('/groups')}
            className="px-3 py-1.5 text-xs font-bold bg-white/20 backdrop-blur text-white rounded-xl hover:bg-white/30 transition-colors flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Back
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* ── Left: Leaderboard + Feed ──────────────────── */}
        <div className="lg:col-span-8 space-y-6">

          {/* Leaderboard */}
          <div className="bg-surface-container-lowest rounded-3xl p-6 space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">Rankings</p>
                <h2 className="font-serif text-xl font-bold text-on-surface">Leaderboard</h2>
              </div>
              <div className="flex bg-surface-container rounded-xl p-1">
                {['monthly', 'alltime'].map(p => (
                  <button
                    key={p}
                    onClick={() => loadLeaderboard(p)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                      leaderPeriod === p
                        ? 'bg-surface-container-lowest text-primary shadow-sm'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {p === 'monthly' ? 'This Month' : 'All Time'}
                  </button>
                ))}
              </div>
            </div>

            {leaderboard.length === 0 ? (
              <div className="text-center py-8 text-on-surface-variant/50">
                <span className="material-symbols-outlined text-4xl block mb-2">emoji_events</span>
                <p className="text-sm">No activity yet — start reading!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {leaderboard.map((row) => (
                  <div
                    key={row.user_id}
                    className={`flex items-center gap-4 p-3 rounded-2xl transition-colors ${
                      row.rank <= 3 ? 'bg-surface-container' : ''
                    } ${row.user_id === user?.id ? 'ring-1 ring-primary/20' : ''}`}
                  >
                    <RankBadge rank={row.rank} />
                    <Avatar user={row} size={10} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <p className="font-bold text-sm text-on-surface">{row.name}</p>
                        {row.user_id === user?.id && (
                          <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">You</span>
                        )}
                      </div>
                      {row.current_book && (
                        <p className="text-xs text-on-surface-variant/60 truncate">
                          Reading: <span className="italic">{row.current_book}</span>
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0 space-y-0.5">
                      <p className="text-sm font-bold text-on-surface">{row.pages_read.toLocaleString()} <span className="text-xs font-normal text-on-surface-variant">pages</span></p>
                      <p className="text-[11px] text-on-surface-variant/60">{row.books_finished} book{row.books_finished !== 1 ? 's' : ''} finished</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Group Feed */}
          <div className="bg-surface-container-lowest rounded-3xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">Discussions</p>
                <h2 className="font-serif text-xl font-bold text-on-surface">Group Activity</h2>
              </div>
              {isMember && (
                <button
                  onClick={() => setShowNewPost(true)}
                  className="btn-primary flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl font-bold"
                >
                  <span className="material-symbols-outlined text-sm">add</span>
                  Post
                </button>
              )}
            </div>

            {posts.length === 0 ? (
              <div className="text-center py-10 text-on-surface-variant/50">
                <span className="material-symbols-outlined text-4xl block mb-2">forum</span>
                <p className="text-sm font-serif">The circle is quiet for now.</p>
                {isMember && <p className="text-xs mt-1">Be the first to share a thought!</p>}
              </div>
            ) : (
              <div className="space-y-4">
                {posts.map(post => (
                  <PostCard
                    key={post.id}
                    post={post}
                    isCurator={isCurator}
                    isOwn={post.user?.id === user?.id}
                    onDelete={handleDeletePost}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Members list */}
          <div className="bg-surface-container-lowest rounded-3xl p-6 space-y-4">
            <h2 className="font-serif text-xl font-bold text-on-surface">
              Members <span className="text-on-surface-variant/40 text-sm font-sans font-normal">{group.member_count}</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {members.map(m => (
                <div key={m.user_id} className="flex items-center gap-3 p-3 rounded-xl bg-surface-container">
                  <Avatar user={m} size={9} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold text-on-surface truncate">{m.name}</p>
                      {m.role === 'curator' && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-secondary bg-secondary/10 px-1.5 py-0.5 rounded-full shrink-0">Curator</span>
                      )}
                    </div>
                    <p className="text-xs text-on-surface-variant/60">@{m.username || m.name}</p>
                  </div>
                  {isCurator && m.user_id !== user?.id && m.role !== 'curator' && (
                    <button
                      onClick={() => handleRemoveMember(m.user_id)}
                      className="text-on-surface-variant/30 hover:text-error transition-colors"
                      title="Remove member"
                    >
                      <span className="material-symbols-outlined text-base">person_remove</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right Sidebar ─────────────────────────────── */}
        <div className="lg:col-span-4 space-y-5">

          {/* Group Book */}
          <div className="bg-surface-container-lowest rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">Currently Reading</p>
                <h3 className="font-serif text-base font-bold text-on-surface">Group Book</h3>
              </div>
              {isCurator && (
                <button
                  onClick={() => setShowSetBook(true)}
                  className="text-xs font-bold text-primary hover:text-primary/70 transition-colors"
                >
                  {group.current_book ? 'Change' : 'Set Book'}
                </button>
              )}
            </div>

            {group.current_book ? (
              <div className="flex items-center gap-4">
                {group.current_book.cover_url ? (
                  <img
                    src={group.current_book.cover_url}
                    alt={group.current_book.title}
                    className="w-16 h-24 object-cover rounded-xl shrink-0 shadow-sm"
                  />
                ) : (
                  <div className="w-16 h-24 bg-surface-container rounded-xl shrink-0 flex items-center justify-center">
                    <span className="material-symbols-outlined text-outline/40 text-2xl">menu_book</span>
                  </div>
                )}
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="font-serif font-bold text-on-surface leading-snug">{group.current_book.title}</p>
                  <p className="text-xs text-on-surface-variant">{group.current_book.author}</p>
                  {isCurator && (
                    <button
                      onClick={handleClearBook}
                      className="text-[11px] text-error/60 hover:text-error transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-on-surface-variant/40">
                <span className="material-symbols-outlined text-3xl block mb-1">auto_stories</span>
                <p className="text-xs">No group book set yet</p>
              </div>
            )}
          </div>

          {/* Goal Progress */}
          {goal?.goal_pages && (
            <div className="bg-surface-container-lowest rounded-3xl p-6 space-y-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">Reading Goal</p>
                <h3 className="font-serif text-base font-bold text-on-surface capitalize">{goal.goal_period || ''} Progress</h3>
              </div>
              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-2xl font-bold font-serif text-on-surface">{goal.pages_read.toLocaleString()}</span>
                  <span className="text-xs text-on-surface-variant">of {goal.goal_pages.toLocaleString()} pages</span>
                </div>
                <div className="h-2.5 bg-surface-container rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${goal.pct}%`,
                      background: 'linear-gradient(90deg, #00464a 0%, #006064 100%)'
                    }}
                  />
                </div>
                <p className="text-xs text-on-surface-variant/60 mt-1.5 text-right">{goal.pct}% complete</p>
              </div>
            </div>
          )}

          {/* Pending Join Requests (curator only) */}
          {isCurator && pending.length > 0 && (
            <div className="bg-surface-container-lowest rounded-3xl p-6 space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="font-serif text-base font-bold text-on-surface">Pending Requests</h3>
                <span className="text-xs font-bold bg-secondary text-on-secondary rounded-full w-5 h-5 flex items-center justify-center">{pending.length}</span>
              </div>
              <div className="space-y-3">
                {pending.map(p => (
                  <div key={p.user_id} className="flex items-center gap-3">
                    <Avatar user={p} size={8} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-on-surface truncate">{p.name}</p>
                      <p className="text-[11px] text-on-surface-variant/60">@{p.username || p.name}</p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => handleReject(p.user_id)}
                        className="p-1.5 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container transition-colors"
                        title="Decline"
                      >
                        <span className="material-symbols-outlined text-base">close</span>
                      </button>
                      <button
                        onClick={() => handleApprove(p.user_id)}
                        className="p-1.5 rounded-lg bg-primary text-on-primary hover:bg-primary/90 transition-colors"
                        title="Approve"
                      >
                        <span className="material-symbols-outlined text-base">check</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Invite Friends */}
          {isMember && (
            <div className="bg-surface-container-lowest rounded-3xl p-6 space-y-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">Expand the Circle</p>
                <h3 className="font-serif text-base font-bold text-on-surface">Invite Friends</h3>
              </div>

              {/* Invite link */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 mb-1.5">Shareable Link</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-surface-container rounded-xl px-3 py-2 text-xs text-on-surface-variant/60 font-mono truncate">
                    {`/join/${group.invite_code}`}
                  </div>
                  <button
                    onClick={copyInviteLink}
                    className={`px-3 py-2 text-xs font-bold rounded-xl transition-colors shrink-0 ${
                      linkCopied ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
                    }`}
                  >
                    {linkCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Username search (curator only) */}
              {isCurator && (
                <div className="relative">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 mb-1.5">Search & Invite</p>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline/60 text-sm">search</span>
                    <input
                      value={inviteQuery}
                      onChange={e => handleInviteSearch(e.target.value)}
                      placeholder="Search by username..."
                      className="w-full bg-surface-container-low rounded-xl pl-9 pr-4 py-2.5 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    {inviteResults.length > 0 && (
                      <div className="absolute top-full mt-1 left-0 right-0 bg-surface-container-lowest rounded-xl shadow-float border border-outline-variant/15 z-10 overflow-hidden">
                        {inviteResults.slice(0, 5).map(u => (
                          <button
                            key={u.id}
                            onClick={() => handleInvite(u)}
                            disabled={inviting === u.id}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-container transition-colors flex items-center gap-2"
                          >
                            <span className="font-bold text-on-surface">{u.name}</span>
                            <span className="text-on-surface-variant/60 flex-1">@{u.username}</span>
                            <span className="text-[11px] font-bold text-primary shrink-0">
                              {inviting === u.id ? '...' : 'Invite'}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Danger zone */}
          <div className="space-y-2 pt-2">
            {isMember && !isCurator && (
              <button
                onClick={handleLeave}
                className="w-full py-2.5 text-sm font-bold text-error border border-error/20 rounded-2xl hover:bg-error/5 transition-colors"
              >
                Leave Group
              </button>
            )}
            {isCurator && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full py-2.5 text-sm font-bold text-error border border-error/20 rounded-2xl hover:bg-error/5 transition-colors"
              >
                Disband Group
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ───────────────────────────────────────── */}
      {showNewPost && (
        <NewPostModal onClose={() => setShowNewPost(false)} onPost={handlePost} />
      )}
      {showSetBook && (
        <SetBookModal onClose={() => setShowSetBook(false)} onSet={handleSetBook} />
      )}
      {showEdit && (
        <EditGroupModal group={group} onClose={() => setShowEdit(false)} onSave={handleSaveEdit} />
      )}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-surface-container-lowest rounded-3xl p-6 w-full max-w-sm shadow-float space-y-4 text-center">
            <span className="material-symbols-outlined text-4xl text-error block">warning</span>
            <h3 className="font-serif text-xl font-bold text-on-surface">Disband Group?</h3>
            <p className="text-sm text-on-surface-variant">
              This will permanently delete <strong>{group.name}</strong> and all its posts. This cannot be undone.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 text-sm font-bold border border-outline-variant rounded-xl hover:bg-surface-container transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteGroup}
                className="flex-1 py-2.5 text-sm font-bold bg-error text-on-error rounded-xl hover:bg-error/90 transition-colors"
              >
                Disband
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
