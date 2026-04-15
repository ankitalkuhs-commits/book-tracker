import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../components/Toast'
import { getMyGroups, discoverGroups, joinGroup, getMyGroupInvites, acceptGroupInvite, declineGroupInvite } from '../services/api'

// ─── Cover presets ────────────────────────────────────────────────────────────

const COVER_PRESETS = {
  teal:      { bg: 'linear-gradient(135deg, #00464a 0%, #006064 100%)', text: '#ffffff' },
  gold:      { bg: 'linear-gradient(135deg, #735c00 0%, #9c7c00 100%)', text: '#ffffff' },
  forest:    { bg: 'linear-gradient(135deg, #2d5016 0%, #4a7c28 100%)', text: '#ffffff' },
  indigo:    { bg: 'linear-gradient(135deg, #1a1a6e 0%, #3333aa 100%)', text: '#ffffff' },
  rose:      { bg: 'linear-gradient(135deg, #6e1a2d 0%, #a0273f 100%)', text: '#ffffff' },
  slate:     { bg: 'linear-gradient(135deg, #2d3748 0%, #4a5568 100%)', text: '#ffffff' },
  amber:     { bg: 'linear-gradient(135deg, #92400e 0%, #b45309 100%)', text: '#ffffff' },
  midnight:  { bg: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', text: '#ffffff' },
}

export function GroupCover({ preset = 'teal', className = '', children }) {
  const p = COVER_PRESETS[preset] || COVER_PRESETS.teal
  return (
    <div className={`flex items-center justify-center ${className}`} style={{ background: p.bg }}>
      {children || <span className="material-symbols-outlined text-white/40 text-4xl">menu_book</span>}
    </div>
  )
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = (Date.now() - new Date(dateStr)) / 1000
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ─── My Group Card ────────────────────────────────────────────────────────────

function MyGroupCard({ group, onClick }) {
  return (
    <button
      onClick={onClick}
      className="bg-surface-container-lowest rounded-2xl overflow-hidden flex gap-4 items-stretch hover:shadow-float transition-all text-left w-full"
    >
      <GroupCover preset={group.cover_preset} className="w-28 shrink-0" />
      <div className="flex-1 min-w-0 py-4 pr-4 space-y-1">
        <div className="flex items-center gap-2">
          {group.membership_role === 'curator' && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-secondary bg-secondary/10 px-2 py-0.5 rounded-full">Curator</span>
          )}
        </div>
        <p className="font-serif font-bold text-on-surface text-lg leading-snug">{group.name}</p>
        {group.current_book && (
          <p className="text-xs text-on-surface-variant">
            Currently reading: <span className="italic">{group.current_book.title}</span>
          </p>
        )}
        {!group.current_book && group.description && (
          <p className="text-xs text-on-surface-variant line-clamp-1">{group.description}</p>
        )}
        <div className="flex items-center gap-4 pt-1 text-[11px] font-bold text-on-surface-variant/60">
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
        </div>
      </div>
    </button>
  )
}

// ─── Discover Card ────────────────────────────────────────────────────────────

function DiscoverCard({ group, onJoin, joining }) {
  return (
    <div className="bg-surface-container-lowest rounded-2xl overflow-hidden flex flex-col">
      <GroupCover preset={group.cover_preset} className="h-40" />
      <div className="p-4 flex flex-col flex-1 space-y-2">
        <p className="font-serif font-bold text-on-surface text-base leading-snug">{group.name}</p>
        {group.description && (
          <p className="text-xs text-on-surface-variant leading-relaxed line-clamp-2 flex-1">{group.description}</p>
        )}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] font-bold text-on-surface-variant/60 uppercase tracking-wider">
            {(group.member_count || 0).toLocaleString()} Members
          </span>
          <button
            onClick={() => onJoin(group)}
            disabled={joining === group.id}
            className="flex items-center gap-1 text-sm font-bold text-primary hover:text-primary/80 transition-colors"
          >
            {joining === group.id ? '...' : 'Join'}
            <span className="material-symbols-outlined text-base">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Invite Card ──────────────────────────────────────────────────────────────

function InviteCard({ invite, onAccept, onDecline }) {
  return (
    <div className="bg-surface-container-lowest border border-secondary/20 rounded-2xl p-4 flex items-center gap-4">
      <GroupCover preset={invite.cover_preset} className="w-12 h-12 rounded-xl shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm text-on-surface">{invite.name}</p>
        <p className="text-xs text-on-surface-variant mt-0.5">
          Invited by {invite.invited_by_name || 'curator'}
        </p>
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={() => onDecline(invite.id)}
          className="px-3 py-1.5 text-xs font-bold text-on-surface-variant border border-outline-variant rounded-lg hover:bg-surface-container transition-colors"
        >
          Decline
        </button>
        <button
          onClick={() => onAccept(invite.id)}
          className="btn-primary px-3 py-1.5 text-xs rounded-lg"
        >
          Accept
        </button>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function GroupsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [myGroups, setMyGroups] = useState([])
  const [discover, setDiscover] = useState([])
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQ, setSearchQ] = useState('')
  const [joining, setJoining] = useState(null)

  const load = async () => {
    setLoading(true)
    const [my, disc, inv] = await Promise.all([
      getMyGroups().catch(() => []),
      discoverGroups().catch(() => []),
      getMyGroupInvites().catch(() => []),
    ])
    setMyGroups(my || [])
    setDiscover(disc || [])
    setInvites(inv || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleJoin = async (group) => {
    setJoining(group.id)
    try {
      const res = await joinGroup(group.id)
      if (res.status === 'active') {
        toast(`Joined ${group.name}!`, 'success')
        navigate(`/groups/${group.id}`)
      } else {
        toast('Join request sent — waiting for curator approval', 'info')
        setDiscover(prev => prev.filter(g => g.id !== group.id))
      }
    } catch (e) {
      toast(e.message || 'Failed to join', 'error')
    }
    setJoining(null)
  }

  const handleAccept = async (groupId) => {
    try {
      await acceptGroupInvite(groupId)
      toast('Joined group!', 'success')
      setInvites(prev => prev.filter(i => i.id !== groupId))
      load()
    } catch (e) {
      toast(e.message || 'Failed', 'error')
    }
  }

  const handleDecline = async (groupId) => {
    try {
      await declineGroupInvite(groupId)
      setInvites(prev => prev.filter(i => i.id !== groupId))
      toast('Invite declined', 'info')
    } catch (e) {
      toast(e.message || 'Failed', 'error')
    }
  }

  const filteredDiscover = searchQ.trim()
    ? discover.filter(g =>
        g.name.toLowerCase().includes(searchQ.toLowerCase()) ||
        g.description?.toLowerCase().includes(searchQ.toLowerCase())
      )
    : discover

  return (
    <main className="max-w-screen-xl mx-auto px-4 md:px-8 pt-8 pb-16 space-y-10">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-end justify-between">
        <div className="space-y-1">
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-on-surface">Literary Circles</h1>
          <p className="text-on-surface-variant text-sm max-w-lg">
            Discover niche reading communities, discuss your favourite chapters,
            and join global conversations curated for the discerning reader.
          </p>
        </div>
        <button
          onClick={() => navigate('/groups/new')}
          className="btn-primary flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold shrink-0"
        >
          <span className="material-symbols-outlined text-base">add</span>
          Create New Group
        </button>
      </div>

      {/* ── Pending invites ────────────────────────────── */}
      {invites.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-serif text-xl font-bold text-on-surface flex items-center gap-2">
            <span className="w-2 h-2 bg-secondary rounded-full inline-block"></span>
            Pending Invites
          </h2>
          <div className="space-y-3">
            {invites.map(inv => (
              <InviteCard key={inv.id} invite={inv} onAccept={handleAccept} onDecline={handleDecline} />
            ))}
          </div>
        </section>
      )}

      {/* ── Your Groups ────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="font-serif text-2xl font-bold text-on-surface">Your Groups</h2>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map(i => <div key={i} className="h-28 bg-surface-container-lowest rounded-2xl animate-pulse" />)}
          </div>
        ) : myGroups.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-2xl p-10 text-center border border-outline-variant/10">
            <span className="material-symbols-outlined text-5xl text-outline/30 block mb-3">group</span>
            <p className="font-serif text-lg text-on-surface">You haven't joined any groups yet</p>
            <p className="text-sm text-on-surface-variant mt-1">Discover groups below or create your own.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {myGroups.map(g => (
              <MyGroupCard key={g.id} group={g} onClick={() => navigate(`/groups/${g.id}`)} />
            ))}
          </div>
        )}
      </section>

      {/* ── Discover ───────────────────────────────────── */}
      <section className="space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-serif text-2xl font-bold text-on-surface">Discover Groups</h2>
            <p className="text-sm text-on-surface-variant mt-0.5">Find your next intellectual sanctuary.</p>
          </div>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline/60 text-base">search</span>
            <input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="Search groups..."
              className="bg-surface-container-low rounded-2xl pl-9 pr-4 py-2.5 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20 w-56"
            />
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
            {[1, 2, 3].map(i => <div key={i} className="h-64 bg-surface-container-lowest rounded-2xl animate-pulse" />)}
          </div>
        ) : filteredDiscover.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant">
            <span className="material-symbols-outlined text-5xl text-outline/30 block mb-3">search_off</span>
            <p className="font-serif text-lg">No groups found</p>
            <p className="text-sm mt-1">Be the first — create a new group!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
            {filteredDiscover.map(g => (
              <DiscoverCard key={g.id} group={g} onJoin={handleJoin} joining={joining} />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
