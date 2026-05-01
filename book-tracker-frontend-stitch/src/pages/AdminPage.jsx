import { useState, useEffect } from 'react'
import { getAdminStats, getAdminUsers, sendTestPush, broadcastPush, setAdminRole, triggerBot, getAdminNotes, getAdminComments, adminDeleteNote, adminDeleteComment } from '../services/api'

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-surface-container-lowest rounded-2xl p-5 space-y-1">
      <p className="text-2xl font-bold font-serif text-primary">{value?.toLocaleString() ?? '—'}</p>
      <p className="text-sm font-medium text-on-surface">{label}</p>
      {sub && <p className="text-xs text-on-surface-variant">{sub}</p>}
    </div>
  )
}

export default function AdminPage() {
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

  // Push broadcast state
  const [bTitle, setBTitle] = useState('')
  const [bBody, setBBody] = useState('')
  const [broadcasting, setBroadcasting] = useState(false)
  const [broadcastResult, setBroadcastResult] = useState(null)

  // Test push state
  const [testUserId, setTestUserId] = useState('')
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState(null)

  // Bot trigger
  const [botLoading, setBotLoading] = useState(false)
  const [botResult, setBotResult] = useState(null)

  // Content moderation
  const [notes, setNotes]               = useState([])
  const [comments, setComments]         = useState([])
  const [contentLoading, setContentLoading] = useState(false)
  const [contentLoaded, setContentLoaded]   = useState(false)
  const [deletingNote, setDeletingNote]     = useState(null)
  const [deletingComment, setDeletingComment] = useState(null)
  const [contentSearch, setContentSearch]   = useState('')

  // Make admin
  const [makingAdmin, setMakingAdmin] = useState(null)

  // User search/sort
  const [userSearch, setUserSearch] = useState('')
  const [userSort, setUserSort] = useState('joined_desc')

  useEffect(() => {
    Promise.all([
      getAdminStats(),
      getAdminUsers(),
    ]).then(([s, u]) => {
      setStats(s)
      setUsers(u || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handleBroadcast = async (e) => {
    e.preventDefault()
    if (!bTitle.trim() || !bBody.trim()) return
    setBroadcasting(true)
    setBroadcastResult(null)
    try {
      const res = await broadcastPush({ title: bTitle.trim(), body: bBody.trim() })
      setBroadcastResult({ ok: true, msg: res.message })
      setBTitle('')
      setBBody('')
    } catch (e) {
      setBroadcastResult({ ok: false, msg: e.message })
    }
    setBroadcasting(false)
  }

  const handleMakeAdmin = async (userId) => {
    setMakingAdmin(userId)
    try {
      await setAdminRole(userId)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_admin: true } : u))
    } catch { }
    setMakingAdmin(null)
  }

  const handleBotTrigger = async () => {
    setBotLoading(true)
    setBotResult(null)
    try {
      const res = await triggerBot()
      setBotResult({ ok: true, msg: res.message || 'Bot triggered!' })
    } catch (e) {
      setBotResult({ ok: false, msg: e.message })
    }
    setBotLoading(false)
  }

  const handleTestPush = async () => {
    if (!testUserId.trim()) return
    setTestLoading(true)
    setTestResult(null)
    try {
      const res = await sendTestPush(parseInt(testUserId, 10))
      setTestResult({ ok: true, msg: res.message })
    } catch (e) {
      setTestResult({ ok: false, msg: e.message })
    }
    setTestLoading(false)
  }

  const loadContent = async () => {
    if (contentLoaded) return
    setContentLoading(true)
    try {
      const [n, c] = await Promise.all([getAdminNotes(), getAdminComments()])
      setNotes(n || [])
      setComments(c || [])
      setContentLoaded(true)
    } catch { }
    setContentLoading(false)
  }

  const handleDeleteNote = async (id) => {
    if (!window.confirm('Delete this post and all its likes/comments?')) return
    setDeletingNote(id)
    try {
      await adminDeleteNote(id)
      setNotes(prev => prev.filter(n => n.id !== id))
      setComments(prev => prev.filter(c => c.note_id !== id))
    } catch { }
    setDeletingNote(null)
  }

  const handleDeleteComment = async (id) => {
    if (!window.confirm('Delete this comment?')) return
    setDeletingComment(id)
    try {
      await adminDeleteComment(id)
      setComments(prev => prev.filter(c => c.id !== id))
    } catch { }
    setDeletingComment(null)
  }

  const TABS = ['overview', 'users', 'content', 'push']

  return (
    <main className="max-w-screen-xl mx-auto px-4 md:px-8 pt-8 pb-12 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-primary text-2xl">admin_panel_settings</span>
        <h1 className="font-serif text-3xl font-bold text-primary">Admin Dashboard</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-outline-variant/15">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); if (tab === 'content') loadContent() }}
            className={`pb-3 px-4 text-sm font-sans capitalize transition-colors ${
              activeTab === tab
                ? 'text-primary font-bold border-b-2 border-primary'
                : 'text-on-surface-variant/60 hover:text-on-surface'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-surface-container-lowest rounded-2xl p-5 h-20 animate-pulse" />
          ))}
        </div>
      )}

      {/* Overview */}
      {!loading && activeTab === 'overview' && stats && (
        <div className="space-y-6">
          {/* Users */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-3">Users</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              <StatCard label="Total Users" value={stats.total_users} />
              <StatCard label="New This Week" value={stats.new_users_this_week} />
              <StatCard label="New This Month" value={stats.new_users_this_month} />
            </div>
          </div>

          {/* Books */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-3">Library</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              <StatCard label="Books in DB" value={stats.total_books} />
              <StatCard label="Library Entries" value={stats.total_userbooks} />
              <StatCard label="Currently Reading" value={stats.books_being_read} />
              <StatCard label="Completed" value={stats.books_completed} />
            </div>
          </div>

          {/* Social */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-3">Social</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              <StatCard label="Notes" value={stats.total_notes} />
              <StatCard label="Likes" value={stats.total_likes} />
              <StatCard label="Comments" value={stats.total_comments} />
              <StatCard label="Follows" value={stats.total_follows} />
            </div>
          </div>
        </div>
      )}

      {/* Users tab */}
      {!loading && activeTab === 'users' && (
        <div className="space-y-4">
          {/* Search + Sort bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline/50 text-base">search</span>
              <input
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                placeholder="Search by name or email..."
                className="w-full bg-surface-container-low rounded-xl pl-10 pr-4 py-2.5 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <select
              value={userSort}
              onChange={e => setUserSort(e.target.value)}
              className="bg-surface-container-low rounded-xl px-4 py-2.5 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="joined_desc">Newest first</option>
              <option value="joined_asc">Oldest first</option>
              <option value="name_asc">Name A→Z</option>
              <option value="books_desc">Most books</option>
              <option value="followers_desc">Most followers</option>
            </select>
          </div>

          {(() => {
            const q = userSearch.toLowerCase()
            const filtered = users.filter(u =>
              !q || (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)
            )
            const sorted = [...filtered].sort((a, b) => {
              if (userSort === 'joined_asc') return new Date(a.created_at) - new Date(b.created_at)
              if (userSort === 'name_asc') return (a.name || '').localeCompare(b.name || '')
              if (userSort === 'books_desc') return (b.books_count || 0) - (a.books_count || 0)
              if (userSort === 'followers_desc') return (b.followers_count || 0) - (a.followers_count || 0)
              return new Date(b.created_at) - new Date(a.created_at) // joined_desc
            })
            return (
              <>
                <p className="text-sm text-on-surface-variant">
                  {sorted.length} of {users.length} users
                </p>
                <div className="bg-surface-container-lowest rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-outline-variant/15">
                          {['Name', 'Email', 'Books', 'Followers', 'Admin', 'Joined', ''].map(h => (
                            <th key={h} className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map(u => (
                    <tr key={u.id} className="border-b border-outline-variant/10 hover:bg-surface-container-low transition-colors">
                      <td className="px-5 py-3">
                        <div>
                          <p className="font-medium text-on-surface">{u.name || '—'}</p>
                          {u.username && <p className="text-xs text-on-surface-variant">@{u.username}</p>}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-on-surface-variant">{u.email}</td>
                      <td className="px-5 py-3 font-bold text-on-surface">{u.books_count}</td>
                      <td className="px-5 py-3 text-on-surface-variant">{u.followers_count}</td>
                      <td className="px-5 py-3">
                        {u.is_admin ? (
                          <span className="text-xs font-bold px-2 py-0.5 bg-primary/10 text-primary rounded-full">Admin</span>
                        ) : (
                          <span className="text-xs text-on-surface-variant/40">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-on-surface-variant text-xs">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-5 py-3">
                        {!u.is_admin && (
                          <button
                            onClick={() => handleMakeAdmin(u.id)}
                            disabled={makingAdmin === u.id}
                            className="text-xs font-bold text-primary hover:text-primary/70 transition-colors whitespace-nowrap"
                          >
                            {makingAdmin === u.id ? '...' : 'Make Admin'}
                          </button>
                        )}
                      </td>
                        </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )
          })()}
        </div>
      )}

      {/* Content moderation tab */}
      {activeTab === 'content' && (
        <div className="space-y-6">
          {/* Search */}
          <div className="relative max-w-sm">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline/50 text-base">search</span>
            <input
              value={contentSearch}
              onChange={e => setContentSearch(e.target.value)}
              placeholder="Filter by user or text…"
              className="w-full bg-surface-container-low rounded-xl pl-10 pr-4 py-2.5 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {contentLoading && (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-surface-container-lowest rounded-2xl h-16 animate-pulse" />
              ))}
            </div>
          )}

          {/* Posts (Notes) */}
          {!contentLoading && (
            <section className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                Posts ({notes.length})
              </h2>
              <div className="bg-surface-container-lowest rounded-2xl overflow-hidden divide-y divide-outline-variant/10">
                {notes
                  .filter(n => {
                    const q = contentSearch.toLowerCase()
                    return !q ||
                      (n.text || '').toLowerCase().includes(q) ||
                      (n.quote || '').toLowerCase().includes(q) ||
                      (n.user_name || '').toLowerCase().includes(q)
                  })
                  .map(n => (
                    <div key={n.id} className="flex items-start gap-4 px-5 py-3 hover:bg-surface-container-low transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-on-surface">{n.user_name || `User #${n.user_id}`}</span>
                          {n.emotion && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">{n.emotion}</span>
                          )}
                          {!n.is_public && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant">private</span>
                          )}
                          <span className="text-xs text-on-surface-variant/50">{new Date(n.created_at).toLocaleDateString()}</span>
                          <span className="text-xs text-on-surface-variant/40">♥ {n.likes_count} · 💬 {n.comments_count}</span>
                        </div>
                        {n.quote && (
                          <p className="text-xs italic text-on-surface-variant mt-0.5 truncate">"{n.quote}"</p>
                        )}
                        {n.text && (
                          <p className="text-sm text-on-surface mt-0.5 line-clamp-2">{n.text}</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteNote(n.id)}
                        disabled={deletingNote === n.id}
                        className="shrink-0 flex items-center gap-1 text-xs font-medium text-error/70 hover:text-error transition-colors disabled:opacity-40 px-2 py-1 rounded-lg hover:bg-error/5"
                      >
                        <span className="material-symbols-outlined text-base">delete</span>
                        {deletingNote === n.id ? '…' : 'Delete'}
                      </button>
                    </div>
                  ))
                }
                {notes.length === 0 && (
                  <p className="px-5 py-6 text-sm text-on-surface-variant text-center">No posts yet.</p>
                )}
              </div>
            </section>
          )}

          {/* Comments */}
          {!contentLoading && (
            <section className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                Comments ({comments.length})
              </h2>
              <div className="bg-surface-container-lowest rounded-2xl overflow-hidden divide-y divide-outline-variant/10">
                {comments
                  .filter(c => {
                    const q = contentSearch.toLowerCase()
                    return !q ||
                      (c.text || '').toLowerCase().includes(q) ||
                      (c.user_name || '').toLowerCase().includes(q)
                  })
                  .map(c => (
                    <div key={c.id} className="flex items-start gap-4 px-5 py-3 hover:bg-surface-container-low transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-on-surface">{c.user_name || `User #${c.user_id}`}</span>
                          <span className="text-xs text-on-surface-variant/40">on post #{c.note_id}</span>
                          <span className="text-xs text-on-surface-variant/50">{new Date(c.created_at).toLocaleDateString()}</span>
                        </div>
                        <p className="text-sm text-on-surface mt-0.5 line-clamp-2">{c.text}</p>
                      </div>
                      <button
                        onClick={() => handleDeleteComment(c.id)}
                        disabled={deletingComment === c.id}
                        className="shrink-0 flex items-center gap-1 text-xs font-medium text-error/70 hover:text-error transition-colors disabled:opacity-40 px-2 py-1 rounded-lg hover:bg-error/5"
                      >
                        <span className="material-symbols-outlined text-base">delete</span>
                        {deletingComment === c.id ? '…' : 'Delete'}
                      </button>
                    </div>
                  ))
                }
                {comments.length === 0 && (
                  <p className="px-5 py-6 text-sm text-on-surface-variant text-center">No comments yet.</p>
                )}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Push tab */}
      {!loading && activeTab === 'push' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Bot trigger */}
          <section className="bg-surface-container-lowest rounded-3xl p-6 space-y-4 md:col-span-2">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="font-serif text-lg font-bold text-primary">Editorial Bot</h2>
                <p className="text-sm text-on-surface-variant">Manually trigger the editorial bot to post community content.</p>
              </div>
              <button
                onClick={handleBotTrigger}
                disabled={botLoading}
                className="btn-primary px-6 py-2.5 text-sm rounded-xl"
              >
                {botLoading ? 'Triggering...' : 'Trigger Bot'}
              </button>
            </div>
            {botResult && (
              <p className={`text-sm ${botResult.ok ? 'text-secondary' : 'text-error'}`}>
                {botResult.msg}
              </p>
            )}
          </section>
          {/* Broadcast */}
          <section className="bg-surface-container-lowest rounded-3xl p-6 space-y-4">
            <h2 className="font-serif text-lg font-bold text-primary">Broadcast Push</h2>
            <p className="text-sm text-on-surface-variant">Send a notification to all registered devices.</p>
            <form onSubmit={handleBroadcast} className="space-y-3">
              <input
                value={bTitle}
                onChange={e => setBTitle(e.target.value)}
                placeholder="Notification title"
                required
                className="w-full bg-surface-container-low rounded-xl px-4 py-2.5 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <textarea
                value={bBody}
                onChange={e => setBBody(e.target.value)}
                placeholder="Notification body"
                required
                rows={3}
                className="w-full bg-surface-container-low rounded-xl px-4 py-2.5 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              />
              <button
                type="submit"
                disabled={broadcasting}
                className="btn-primary px-6 py-2.5 text-sm rounded-xl w-full"
              >
                {broadcasting ? 'Sending...' : 'Send Broadcast'}
              </button>
              {broadcastResult && (
                <p className={`text-sm ${broadcastResult.ok ? 'text-secondary' : 'text-error'}`}>
                  {broadcastResult.msg}
                </p>
              )}
            </form>
          </section>

          {/* Test push */}
          <section className="bg-surface-container-lowest rounded-3xl p-6 space-y-4">
            <h2 className="font-serif text-lg font-bold text-primary">Test Push</h2>
            <p className="text-sm text-on-surface-variant">Send a test notification to a specific user by ID.</p>
            <div className="flex gap-3">
              <input
                type="number"
                value={testUserId}
                onChange={e => setTestUserId(e.target.value)}
                placeholder="User ID"
                className="flex-1 bg-surface-container-low rounded-xl px-4 py-2.5 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <button
                onClick={handleTestPush}
                disabled={testLoading || !testUserId.trim()}
                className="btn-primary px-5 py-2.5 text-sm rounded-xl shrink-0"
              >
                {testLoading ? '...' : 'Send'}
              </button>
            </div>
            {/* Quick-pick from users */}
            {users.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-on-surface-variant font-medium">Quick pick:</p>
                <div className="flex flex-wrap gap-2">
                  {users.slice(0, 8).map(u => (
                    <button
                      key={u.id}
                      onClick={() => setTestUserId(String(u.id))}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        testUserId === String(u.id)
                          ? 'bg-primary text-on-primary border-primary'
                          : 'border-outline-variant text-on-surface-variant hover:border-primary/40'
                      }`}
                    >
                      {u.name || u.email.split('@')[0]} #{u.id}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {testResult && (
              <p className={`text-sm ${testResult.ok ? 'text-secondary' : 'text-error'}`}>
                {testResult.msg}
              </p>
            )}
          </section>
        </div>
      )}
    </main>
  )
}
