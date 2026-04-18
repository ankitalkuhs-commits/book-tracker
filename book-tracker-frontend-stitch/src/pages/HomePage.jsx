import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import {
  getCommunityFeed, getFriendsFeed, createNote,
  likeNote, unlikeNote, getComments, addComment,
  getFriendReading, getFollowing, searchUsers, getMyBooks,
  getRecommendations, addToLibrary, updateNote, deleteNote,
} from '../services/api'

// ─── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = (Date.now() - new Date(dateStr)) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function Avatar({ user, size = 10 }) {
  const initials = user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'
  return user?.profile_picture ? (
    <img
      src={user.profile_picture}
      alt={user.name}
      className={`w-${size} h-${size} rounded-full object-cover`}
      onError={e => { e.target.style.display = 'none' }}
    />
  ) : (
    <div className={`w-${size} h-${size} rounded-full bg-primary flex items-center justify-center text-on-primary text-xs font-bold font-sans shrink-0`}>
      {initials}
    </div>
  )
}

// ─── Post Card ───────────────────────────────────────────────────────────────

function PostCard({ post, currentUserId, onLikeToggle, onDelete, onEdit }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [loadingComments, setLoadingComments] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(post.text || '')
  const [saving, setSaving] = useState(false)

  const isOwn = post.user?.id === currentUserId || post.user_id === currentUserId
  const isEdited = post.updated_at && post.updated_at !== post.created_at
  const book = post.book
  const coverUrl = book?.cover_url

  const handleDelete = async () => {
    setShowMenu(false)
    if (!window.confirm('Delete this post?')) return
    try {
      await deleteNote(post.id)
      onDelete(post.id)
    } catch (e) {
      toast(e.message || 'Failed to delete', 'error')
    }
  }

  const handleSaveEdit = async () => {
    if (!editText.trim()) return
    setSaving(true)
    try {
      const updated = await updateNote(post.id, { text: editText.trim() })
      onEdit(post.id, updated)
      setEditing(false)
    } catch (e) {
      toast(e.message || 'Failed to save', 'error')
    }
    setSaving(false)
  }

  const toggleComments = async () => {
    if (!showComments && comments.length === 0) {
      setLoadingComments(true)
      try {
        const data = await getComments(post.id)
        setComments(data || [])
      } catch { }
      setLoadingComments(false)
    }
    setShowComments(v => !v)
  }

  const submitComment = async (e) => {
    e.preventDefault()
    if (!commentText.trim()) return
    try {
      const c = await addComment(post.id, commentText.trim())
      setComments(prev => [...prev, c])
      setCommentText('')
    } catch (e) {
      toast(e.message || 'Failed to post comment', 'error')
    }
  }

  return (
    <article className="bg-surface-container-lowest rounded-3xl p-6 md:p-8 flex flex-col md:flex-row gap-6 md:gap-8 transition-all hover:shadow-[0_20px_50px_-20px_rgba(0,70,74,0.1)]">
      {/* Book cover */}
      {book && (
        <div className="w-full md:w-28 shrink-0">
          <div className="aspect-[2/3] rounded-xl overflow-hidden shadow-xl shadow-on-surface/5 bg-surface-container-high">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt={book.title}
                className="w-full h-full object-cover"
                onError={e => { e.target.parentElement.style.display = 'none' }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="material-symbols-outlined text-4xl text-outline">menu_book</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-grow space-y-4 min-w-0">
        {/* Header */}
        <div className="flex justify-between items-start">
          <button
            className="flex items-center space-x-3 hover:opacity-80 transition-opacity"
            onClick={() => navigate(`/profile/${post.user?.id || post.user_id}`)}
          >
            <Avatar user={post.user} size={10} />
            <div className="text-left">
              <h4 className="font-bold text-on-surface text-sm">{post.user?.name || 'User'}</h4>
              <p className="text-xs text-on-surface-variant/60">
                {timeAgo(post.created_at)}
                {isEdited && <span className="ml-1 italic">· Edited</span>}
              </p>
            </div>
          </button>

          {isOwn && (
            <div className="relative">
              <button
                onClick={() => setShowMenu(v => !v)}
                className="text-on-surface-variant hover:text-on-surface transition-colors p-1 rounded-lg hover:bg-surface-container"
              >
                <span className="material-symbols-outlined text-lg">more_horiz</span>
              </button>
              {showMenu && (
                <div className="absolute right-0 top-8 bg-surface-container-lowest rounded-2xl shadow-float border border-outline-variant/15 z-10 min-w-[130px] overflow-hidden">
                  <button
                    onClick={() => { setShowMenu(false); setEditing(true) }}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-on-surface hover:bg-surface-container transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">edit</span>
                    Edit
                  </button>
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-error hover:bg-error/5 transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">delete</span>
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Book title */}
        {book && (
          <p className="text-xs font-bold text-secondary uppercase tracking-widest">
            {book.title}
          </p>
        )}

        {/* Note text / inline edit */}
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={editText}
              onChange={e => setEditText(e.target.value)}
              rows={3}
              className="w-full bg-surface-container-low rounded-xl p-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none border-none"
            />
            <div className="flex gap-2">
              <button onClick={handleSaveEdit} disabled={saving} className="btn-primary px-4 py-1.5 text-xs rounded-lg">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => { setEditing(false); setEditText(post.text || '') }} className="px-4 py-1.5 text-xs rounded-lg border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container transition-colors">
                Cancel
              </button>
            </div>
          </div>
        ) : post.text ? (
          <p className="text-on-surface leading-relaxed font-sans">{post.text}</p>
        ) : null}

        {/* Quote */}
        {post.quote && (
          <div className="bg-surface-container-low p-4 rounded-2xl border-l-4 border-secondary/40 italic text-on-surface-variant font-serif text-sm">
            "{post.quote}"
          </div>
        )}

        {/* Image */}
        {post.image_url && (
          <img
            src={post.image_url}
            alt="Post"
            className="rounded-2xl max-h-64 object-cover w-full"
            onError={e => { e.target.parentElement.style.display = 'none' }}
          />
        )}

        {/* Actions */}
        <div className="flex items-center space-x-5 pt-2">
          <button
            className={`flex items-center space-x-1.5 transition-colors ${post.liked_by_me ? 'text-error' : 'text-on-surface-variant hover:text-error'}`}
            onClick={() => onLikeToggle(post)}
          >
            <span className="material-symbols-outlined text-xl"
              style={{ fontVariationSettings: post.liked_by_me ? "'FILL' 1" : "'FILL' 0" }}>
              favorite
            </span>
            <span className="text-sm font-bold">{post.likes_count || 0}</span>
          </button>

          <button
            className="flex items-center space-x-1.5 text-on-surface-variant hover:text-primary transition-colors"
            onClick={toggleComments}
          >
            <span className="material-symbols-outlined text-xl">chat_bubble</span>
            <span className="text-sm font-bold">{post.comments_count || 0}</span>
          </button>
        </div>

        {/* Comments section */}
        {showComments && (
          <div className="space-y-3 pt-2 border-t border-outline-variant/15">
            {loadingComments && <p className="text-xs text-on-surface-variant">Loading...</p>}
            {comments.map(c => (
              <div key={c.id} className="flex gap-2 text-sm">
                <Avatar user={c.user} size={7} />
                <div className="bg-surface-container-low rounded-xl px-3 py-2 flex-1 min-w-0">
                  <span className="font-bold text-on-surface text-xs">{c.user?.name} </span>
                  <span className="text-on-surface-variant">{c.text}</span>
                </div>
              </div>
            ))}
            <form onSubmit={submitComment} className="flex gap-2 mt-2">
              <input
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                placeholder="Add a comment..."
                className="flex-1 bg-surface-container-low rounded-xl px-3 py-2 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <button type="submit" className="btn-primary px-4 py-2 text-xs rounded-xl">Post</button>
            </form>
          </div>
        )}
      </div>
    </article>
  )
}

// ─── Post Composer ────────────────────────────────────────────────────────────

function PostComposer({ user, onPost }) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [quote, setQuote] = useState('')
  const [emotion, setEmotion] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [myBooks, setMyBooks] = useState([])
  const [selectedBook, setSelectedBook] = useState(null)
  const [showBookPicker, setShowBookPicker] = useState(false)

  useEffect(() => {
    getMyBooks('reading').then(data => setMyBooks(data || [])).catch(() => {})
  }, [])

  const handleSubmit = async () => {
    if (!text.trim()) return
    setSubmitting(true)
    try {
      const note = await createNote({
        text,
        quote: quote || null,
        emotion: emotion || null,
        is_public: true,
        userbook_id: selectedBook?.id || null,
      })
      onPost({ ...note, book: selectedBook?.book || null })
      setText('')
      setQuote('')
      setEmotion('')
      setSelectedBook(null)
      toast('Reflection posted!', 'success')
    } catch (e) {
      toast(e.message || 'Failed to post', 'error')
    }
    setSubmitting(false)
  }

  return (
    <section className="bg-surface-container-lowest rounded-2xl p-6 shadow-[0_32px_64px_-16px_rgba(27,28,25,0.04)]">
      <div className="flex items-start space-x-4">
        <div className="shrink-0"><Avatar user={user} size={11} /></div>
        <div className="flex-grow space-y-3">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            className="w-full bg-surface-container-low rounded-xl p-4 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[100px] resize-none text-base font-sans border-none"
            placeholder="What are your thoughts on your current read?"
          />

          {/* Book picker */}
          {myBooks.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowBookPicker(v => !v)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors ${
                  selectedBook
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                <span className="material-symbols-outlined text-base">menu_book</span>
                {selectedBook ? selectedBook.book?.title : 'Tag a book (optional)'}
                {selectedBook && (
                  <span
                    className="material-symbols-outlined text-sm ml-1 text-on-surface-variant hover:text-error"
                    onClick={e => { e.stopPropagation(); setSelectedBook(null) }}
                  >close</span>
                )}
              </button>
              {showBookPicker && (
                <div className="absolute top-full left-0 mt-1 z-20 bg-surface-container-lowest rounded-2xl shadow-float border border-outline-variant/15 overflow-hidden w-64">
                  {myBooks.map(ub => (
                    <button
                      key={ub.id}
                      onClick={() => { setSelectedBook(ub); setShowBookPicker(false) }}
                      className="w-full text-left px-4 py-3 text-sm hover:bg-surface-container-low transition-colors flex items-center gap-3"
                    >
                      <span className="material-symbols-outlined text-base text-secondary">auto_stories</span>
                      <span className="truncate font-medium text-on-surface">{ub.book?.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline/60 text-base">format_quote</span>
              <input
                value={quote}
                onChange={e => setQuote(e.target.value)}
                className="w-full bg-surface-container-low rounded-xl pl-9 pr-4 py-2.5 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Add a striking quote..."
              />
            </div>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline/60 text-base">mood</span>
              <input
                value={emotion}
                onChange={e => setEmotion(e.target.value)}
                className="w-full bg-surface-container-low rounded-xl pl-9 pr-4 py-2.5 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Current mood or emotion..."
              />
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <button
              onClick={handleSubmit}
              disabled={submitting || !text.trim()}
              className="btn-primary px-7 py-2.5 text-sm font-bold rounded-xl disabled:opacity-50"
            >
              {submitting ? 'Posting...' : 'Post Reflection'}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Recommendations Shelf ────────────────────────────────────────────────────

const REASON_LABEL = {
  friends_reading: 'Friend is reading',
  friends_loved:   'Friend loved it',
  author_affinity: 'From an author you like',
}

function RecommendationsShelf() {
  const toast = useToast()
  const [recs, setRecs] = useState([])
  const [adding, setAdding] = useState(null)

  useEffect(() => {
    getRecommendations().then(setRecs).catch(() => {})
  }, [])

  if (!recs.length) return null

  const handleAdd = async (book) => {
    setAdding(book.id)
    try {
      await addToLibrary({
        title: book.title, author: book.author,
        cover_url: book.cover_url, total_pages: book.total_pages,
        description: book.description, status: 'to-read',
      })
      toast(`"${book.title}" added to library`, 'success')
      setRecs(prev => prev.filter(r => r.id !== book.id))
    } catch (e) {
      toast(e.message || 'Already in library', 'info')
    }
    setAdding(null)
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl font-bold text-on-surface">For You</h2>
        <span className="text-xs text-on-surface-variant/50 font-medium">Based on your network</span>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
        {recs.slice(0, 8).map(book => (
          <div key={book.id} className="shrink-0 w-28 space-y-2 group">
            <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-surface-container-high shadow-md group-hover:shadow-xl transition-shadow">
              {book.cover_url ? (
                <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="material-symbols-outlined text-2xl text-outline/40">menu_book</span>
                </div>
              )}
              <button
                onClick={() => handleAdd(book)}
                disabled={adding === book.id}
                className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              >
                <span className="text-white text-[10px] font-bold text-center px-2">
                  {adding === book.id ? '...' : '+ Add to Library'}
                </span>
              </button>
            </div>
            <p className="text-xs font-bold text-on-surface line-clamp-2 leading-snug">{book.title}</p>
            <p className="text-[10px] text-secondary font-medium">{REASON_LABEL[book.reason] || ''}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function Sidebar() {
  const navigate = useNavigate()
  const [following, setFollowing] = useState([])
  const [friendReading, setFriendReading] = useState([])
  const [userSearch, setUserSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])

  useEffect(() => {
    getFollowing().then(setFollowing).catch(() => {})
    getFriendReading().then(setFriendReading).catch(() => {})
  }, [])

  useEffect(() => {
    if (!userSearch.trim()) { setSearchResults([]); return }
    const t = setTimeout(() => {
      searchUsers(userSearch).then(setSearchResults).catch(() => {})
    }, 400)
    return () => clearTimeout(t)
  }, [userSearch])

  return (
    <aside className="hidden lg:flex col-span-4 flex-col space-y-6">
      {/* Search users */}
      <section className="bg-surface-container-low rounded-3xl p-6 space-y-4">
        <h3 className="text-lg font-bold text-primary font-serif">Find Curators</h3>
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline/60 text-base">search</span>
          <input
            value={userSearch}
            onChange={e => setUserSearch(e.target.value)}
            placeholder="Search by username..."
            className="w-full bg-surface-container-lowest rounded-xl pl-9 pr-4 py-2.5 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        {searchResults.length > 0 && (
          <div className="space-y-2">
            {searchResults.slice(0, 5).map(u => (
              <button
                key={u.id}
                onClick={() => navigate(`/profile/${u.id}`)}
                className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-surface-container transition-colors text-left"
              >
                <Avatar user={u} size={8} />
                <div>
                  <p className="text-sm font-bold text-on-surface">{u.name}</p>
                  <p className="text-xs text-on-surface-variant">@{u.username}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Following list */}
      {following.length > 0 && (
        <section className="bg-surface-container-low rounded-3xl p-6 space-y-4">
          <h3 className="text-lg font-bold text-primary font-serif">Your Friends</h3>
          <div className="space-y-3">
            {following.slice(0, 5).map(u => (
              <button
                key={u.id}
                onClick={() => navigate(`/profile/${u.id}`)}
                className="w-full flex items-center justify-between group"
              >
                <div className="flex items-center space-x-3">
                  <Avatar user={u} size={9} />
                  <span className="text-sm font-medium text-on-surface group-hover:text-primary transition-colors">
                    {u.name}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Friends currently reading */}
      {friendReading.length > 0 && (
        <section className="bg-surface-container rounded-3xl p-6 space-y-4">
          <h3 className="text-lg font-bold text-primary font-serif">Currently Reading</h3>
          <div className="grid grid-cols-2 gap-3">
            {friendReading.slice(0, 4).map(item => (
              <div key={item.id} className="space-y-1.5 group cursor-pointer">
                <div className="aspect-[2/3] rounded-lg overflow-hidden shadow-md group-hover:shadow-xl transition-shadow relative bg-surface-container-high">
                  {item.book?.cover_url ? (
                    <img
                      src={item.book.cover_url}
                      alt={item.book.title}
                      className="w-full h-full object-cover"
                      onError={e => { e.target.parentElement.style.display = 'none' }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="material-symbols-outlined text-2xl text-outline">menu_book</span>
                    </div>
                  )}
                  {/* Progress bar */}
                  {item.book?.total_pages && item.current_page && (
                    <div className="absolute bottom-0 left-0 w-full h-1 bg-surface-container-highest">
                      <div
                        className="h-full bg-secondary"
                        style={{ width: `${Math.min(100, Math.round((item.current_page / item.book.total_pages) * 100))}%` }}
                      />
                    </div>
                  )}
                </div>
                <p className="text-xs font-bold truncate">{item.book?.title}</p>
                <p className="text-[10px] text-on-surface-variant/60">{item.user?.name}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </aside>
  )
}

// ─── Main HomePage ────────────────────────────────────────────────────────────

export default function HomePage() {
  const { user } = useAuth()
  const toast = useToast()
  const [activeTab, setActiveTab] = useState('community')
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchFeed = async (tab) => {
    setLoading(true)
    setError(null)
    try {
      const data = tab === 'community' ? await getCommunityFeed() : await getFriendsFeed()
      setPosts(data || [])
    } catch {
      setError('Failed to load feed.')
    }
    setLoading(false)
  }

  useEffect(() => { fetchFeed(activeTab) }, [activeTab])

  const handleLikeToggle = async (post) => {
    try {
      if (post.liked_by_me) {
        await unlikeNote(post.id)
      } else {
        await likeNote(post.id)
      }
      setPosts(prev => prev.map(p =>
        p.id === post.id
          ? { ...p, liked_by_me: !p.liked_by_me, likes_count: p.likes_count + (p.liked_by_me ? -1 : 1) }
          : p
      ))
    } catch { }
  }

  const handleNewPost = (note) => {
    setPosts(prev => [{ ...note, user, likes_count: 0, comments_count: 0, liked_by_me: false }, ...prev])
  }

  const handleDeletePost = (postId) => {
    setPosts(prev => prev.filter(p => p.id !== postId))
  }

  const handleEditPost = (postId, updated) => {
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, ...updated } : p))
  }

  return (
    <main className="pb-12 max-w-screen-2xl mx-auto px-4 md:px-8 lg:px-12 pt-8 grid grid-cols-12 gap-8">
      {/* Left spacer */}
      <div className="hidden lg:block col-span-1" />

      {/* Center feed */}
      <div className="col-span-12 lg:col-span-7 space-y-8">
        <PostComposer user={user} onPost={handleNewPost} />

        <RecommendationsShelf />

        {/* Feed tabs */}
        <div className="flex items-center space-x-8 border-b border-outline-variant/15">
          {['community', 'friends'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-4 text-base font-sans transition-colors capitalize ${
                activeTab === tab
                  ? 'text-primary font-bold border-b-2 border-primary'
                  : 'text-on-surface-variant/60 font-medium hover:text-on-surface'
              }`}
            >
              {tab === 'community' ? 'Community' : 'Friends'}
            </button>
          ))}
        </div>

        {/* Feed content */}
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-surface-container-lowest rounded-3xl p-8 h-40 animate-pulse" />
            ))}
          </div>
        )}

        {error && (
          <div className="text-center py-12 text-on-surface-variant">
            <span className="material-symbols-outlined text-4xl block mb-2">error</span>
            {error}
          </div>
        )}

        {!loading && !error && posts.length === 0 && (
          <div className="text-center py-16 text-on-surface-variant">
            <span className="material-symbols-outlined text-5xl block mb-3 text-outline">menu_book</span>
            <p className="font-serif text-lg text-on-surface">No posts yet.</p>
            <p className="text-sm mt-1">
              {activeTab === 'friends' ? 'Follow some readers to see their posts here.' : 'Be the first to share a reflection!'}
            </p>
          </div>
        )}

        {!loading && !error && posts.map(post => (
          <PostCard
            key={post.id}
            post={post}
            currentUserId={user?.id}
            onLikeToggle={handleLikeToggle}
            onDelete={handleDeletePost}
            onEdit={handleEditPost}
          />
        ))}
      </div>

      {/* Sidebar */}
      <Sidebar />
    </main>
  )
}
