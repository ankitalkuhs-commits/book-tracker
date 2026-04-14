import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { getPublicProfile, getUserBooks, getUserActivity, followUser, unfollowUser, getFollowing } from '../services/api'

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = (Date.now() - new Date(dateStr)) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function ActivityChart({ data }) {
  if (!data || data.length === 0) return null
  const bars = data.slice(-30)
  const max = Math.max(...bars.map(d => d.pages_read || 0), 1)
  const barW = 100 / bars.length
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="w-full h-16">
      {bars.map((d, i) => {
        const h = ((d.pages_read || 0) / max) * 36
        return (
          <rect key={i} x={i * barW + 0.3} y={40 - h} width={barW - 0.6} height={h} rx="1"
            className="fill-primary/30" />
        )
      })}
    </svg>
  )
}

function BookCover({ book }) {
  const [broken, setBroken] = useState(false)
  return (
    <div className="aspect-[2/3] rounded-lg overflow-hidden bg-surface-container-high flex items-center justify-center">
      {book?.cover_url && !broken
        ? <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" onError={() => setBroken(true)} />
        : <span className="material-symbols-outlined text-2xl text-outline/40">menu_book</span>
      }
    </div>
  )
}

export default function UserProfilePage() {
  const { userId } = useParams()
  const { user: me } = useAuth()
  const [profile, setProfile] = useState(null)
  const [books, setBooks] = useState([])
  const [activity, setActivity] = useState([])
  const [isFollowing, setIsFollowing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [followLoading, setFollowLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('books')

  const toast = useToast()
  const isOwnProfile = me?.id?.toString() === userId?.toString()

  useEffect(() => {
    const uid = userId
    Promise.all([
      getPublicProfile(uid),
      getUserBooks(uid),
      getUserActivity(uid, 30),
      getFollowing(),
    ]).then(([p, b, a, following]) => {
      setProfile(p)
      setBooks(b || [])
      setActivity(a || [])
      const followingIds = (following || []).map(u => u.id?.toString())
      setIsFollowing(followingIds.includes(uid?.toString()))
    }).catch(() => {}).finally(() => setLoading(false))
  }, [userId])

  const toggleFollow = async () => {
    setFollowLoading(true)
    try {
      if (isFollowing) {
        await unfollowUser(userId)
        setIsFollowing(false)
        setProfile(p => ({ ...p, followers_count: (p?.followers_count || 1) - 1 }))
        toast('Unfollowed', 'info')
      } else {
        await followUser(userId)
        setIsFollowing(true)
        setProfile(p => ({ ...p, followers_count: (p?.followers_count || 0) + 1 }))
        toast(`Following ${profile?.name || 'user'}`, 'success')
      }
    } catch (e) {
      toast(e.message || 'Failed', 'error')
    }
    setFollowLoading(false)
  }

  if (loading) {
    return (
      <main className="max-w-screen-lg mx-auto px-4 md:px-8 pt-8 pb-12 space-y-6">
        <div className="h-40 bg-surface-container-lowest rounded-3xl animate-pulse" />
      </main>
    )
  }

  if (!profile) {
    return (
      <main className="max-w-screen-lg mx-auto px-4 md:px-8 pt-20 pb-12 text-center">
        <span className="material-symbols-outlined text-6xl text-outline/40 block mb-4">person_off</span>
        <p className="font-serif text-xl text-on-surface">User not found</p>
      </main>
    )
  }

  const initials = profile.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'
  const stats = profile.stats
  const reading = books.filter(b => b.status === 'reading')
  const finished = books.filter(b => b.status === 'finished')

  return (
    <main className="max-w-screen-lg mx-auto px-4 md:px-8 pt-8 pb-12 space-y-8">
      {/* Header */}
      <section className="bg-surface-container-lowest rounded-3xl p-8 flex flex-col md:flex-row gap-6 items-start">
        <div className="w-20 h-20 shrink-0 rounded-full overflow-hidden border-4 border-primary-fixed-dim bg-primary flex items-center justify-center">
          {profile.profile_picture ? (
            <img src={profile.profile_picture} alt={profile.name} className="w-full h-full object-cover"
              onError={e => { e.target.style.display = 'none' }} />
          ) : (
            <span className="text-on-primary text-2xl font-bold font-sans">{initials}</span>
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <h1 className="font-serif text-2xl font-bold text-primary">{profile.name}</h1>
          {profile.username && <p className="text-sm text-on-surface-variant">@{profile.username}</p>}
          {profile.bio && <p className="text-sm text-on-surface leading-relaxed max-w-lg">{profile.bio}</p>}
          <div className="flex items-center gap-6 pt-1 text-sm text-on-surface-variant">
            <span><strong className="text-on-surface">{profile.followers_count || 0}</strong> followers</span>
            <span><strong className="text-on-surface">{profile.following_count || 0}</strong> following</span>
          </div>
        </div>

        {!isOwnProfile && (
          <button
            onClick={toggleFollow}
            disabled={followLoading}
            className={`shrink-0 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
              isFollowing
                ? 'bg-surface-container border border-outline-variant text-on-surface hover:bg-error-container/30 hover:text-error hover:border-error/30'
                : 'btn-primary'
            }`}
          >
            {followLoading ? '...' : isFollowing ? 'Following' : 'Follow'}
          </button>
        )}
      </section>

      {/* Activity chart */}
      {activity.length > 0 && (
        <section className="bg-surface-container-lowest rounded-3xl p-6 space-y-3">
          <h2 className="font-serif text-base font-bold text-primary">30-Day Reading Pulse</h2>
          <ActivityChart data={activity} />
        </section>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total Books', value: stats.total_books },
            { label: 'Reading', value: stats.reading },
            { label: 'Finished', value: stats.finished },
          ].map(({ label, value }) => (
            <div key={label} className="bg-surface-container-lowest rounded-2xl p-4 text-center">
              <p className="text-2xl font-bold font-serif text-primary">{value}</p>
              <p className="text-xs text-on-surface-variant mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-outline-variant/15 flex gap-1">
        {[
          { id: 'books', label: `Books (${books.length})` },
          { id: 'reading', label: `Reading (${reading.length})` },
          { id: 'finished', label: `Finished (${finished.length})` },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-3 px-4 text-sm font-sans transition-colors ${
              activeTab === tab.id
                ? 'text-primary font-bold border-b-2 border-primary'
                : 'text-on-surface-variant/60 font-medium hover:text-on-surface'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Book grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
        {(() => {
          const list = activeTab === 'books' ? books : activeTab === 'reading' ? reading : finished
          if (list.length === 0) {
            return <p className="col-span-full text-center text-on-surface-variant py-12">Nothing here yet.</p>
          }
          return list.map(ub => (
            <div key={ub.id} className="space-y-2">
              <BookCover book={ub.book} />
              <p className="text-xs font-bold text-on-surface truncate">{ub.book?.title}</p>
              <p className="text-[10px] text-on-surface-variant/60 truncate">{ub.book?.author}</p>
            </div>
          ))
        })()}
      </div>
    </main>
  )
}
