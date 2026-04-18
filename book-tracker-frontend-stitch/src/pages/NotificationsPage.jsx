import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getNotifications, markAllNotificationsRead, getVapidPublicKey, webSubscribe } from '../services/api'

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = (Date.now() - new Date(dateStr)) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

const EVENT_ICON = {
  like:             { icon: 'favorite',     cls: 'text-error',     fill: true },
  comment:          { icon: 'chat_bubble',  cls: 'text-primary',   fill: false },
  follow:           { icon: 'person_add',   cls: 'text-secondary', fill: false },
  book_completed:   { icon: 'auto_stories', cls: 'text-secondary', fill: true },
  reading_streak:   { icon: 'local_fire_department', cls: 'text-tertiary', fill: true },
  default:          { icon: 'notifications', cls: 'text-on-surface-variant', fill: false },
}

function getDestination(n) {
  const data = n.data || {}
  const actorId = data.actor_id || n.actor_id
  switch (n.event_type) {
    case 'new_follower':
    case 'post_liked':
    case 'book_completed':
    case 'book_added':
      return actorId ? `/profile/${actorId}` : null
    case 'post_commented':
      return actorId ? `/profile/${actorId}` : null
    case 'reading_streak_reminder':
      return '/insights'
    default:
      return actorId ? `/profile/${actorId}` : null
  }
}

// ─── Push Permission Banner ───────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

function PushPermissionBanner() {
  const [status, setStatus] = useState(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported'
    return Notification.permission // 'default' | 'granted' | 'denied'
  })
  const [enabling, setEnabling] = useState(false)

  if (status !== 'default') return null

  const handleEnable = async () => {
    setEnabling(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setStatus(permission); setEnabling(false); return }

      const reg = await navigator.serviceWorker.register('/sw-push.js')
      await navigator.serviceWorker.ready

      const { public_key } = await getVapidPublicKey()
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(public_key),
      })

      await webSubscribe(subscription.toJSON(), navigator.userAgent.slice(0, 120))
      setStatus('granted')
    } catch (e) {
      console.error('Push subscription failed:', e)
      setStatus(Notification.permission)
    }
    setEnabling(false)
  }

  return (
    <div className="flex items-start gap-4 p-5 bg-primary/5 border border-primary/15 rounded-2xl">
      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary">
        <span className="material-symbols-outlined text-xl">notifications_active</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-on-surface">Stay in the loop</p>
        <p className="text-sm text-on-surface-variant mt-0.5">
          Get notified when someone likes your post, follows you, or finishes a book.
        </p>
      </div>
      <button
        onClick={handleEnable}
        disabled={enabling}
        className="btn-primary px-4 py-2 text-sm rounded-xl shrink-0 disabled:opacity-60"
      >
        {enabling ? 'Enabling…' : 'Enable'}
      </button>
    </div>
  )
}

export default function NotificationsPage() {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getNotifications()
      .then(data => setNotifications(data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleMarkAll = async () => {
    try {
      await markAllNotificationsRead()
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    } catch { }
  }

  const unreadCount = notifications.filter(n => !n.is_read).length

  return (
    <main className="max-w-screen-md mx-auto px-4 md:px-8 pt-8 pb-12 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold text-primary">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-on-surface-variant mt-0.5">{unreadCount} unread</p>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAll}
            className="text-sm text-primary font-medium hover:underline transition-colors"
          >
            Mark all as read
          </button>
        )}
      </div>

      <PushPermissionBanner />

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-surface-container-lowest rounded-2xl p-5 h-16 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && notifications.length === 0 && (
        <div className="text-center py-20">
          <span className="material-symbols-outlined text-6xl text-outline/40 block mb-4">notifications_off</span>
          <p className="font-serif text-xl text-on-surface">All caught up!</p>
          <p className="text-sm text-on-surface-variant mt-1">No notifications yet.</p>
        </div>
      )}

      {!loading && notifications.length > 0 && (
        <div className="space-y-2">
          {notifications.map(n => {
            const { icon, cls, fill } = EVENT_ICON[n.event_type] || EVENT_ICON.default
            const dest = getDestination(n)
            return (
              <div
                key={n.id}
                onClick={() => {
                  if (!n.is_read) {
                    setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
                  }
                  if (dest) navigate(dest)
                }}
                className={`flex items-start gap-4 p-5 rounded-2xl transition-all ${
                  dest ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''
                } ${
                  n.is_read
                    ? 'bg-surface-container-lowest'
                    : 'bg-primary/5 border border-primary/10'
                }`}
              >
                {/* Icon */}
                <div className={`w-10 h-10 rounded-full bg-surface-container-low flex items-center justify-center shrink-0 ${cls}`}>
                  <span className="material-symbols-outlined text-base"
                    style={{ fontVariationSettings: fill ? "'FILL' 1" : "'FILL' 0" }}>
                    {icon}
                  </span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-0.5">
                  {n.title && (
                    <p className={`text-sm font-bold ${n.is_read ? 'text-on-surface-variant' : 'text-on-surface'}`}>
                      {n.title}
                    </p>
                  )}
                  <p className={`text-sm leading-relaxed ${n.is_read ? 'text-on-surface-variant/70' : 'text-on-surface'}`}>
                    {n.body}
                  </p>
                  <p className="text-xs text-on-surface-variant/60">{timeAgo(n.sent_at)}</p>
                </div>

                {/* Unread dot / nav arrow */}
                <div className="shrink-0 mt-1 flex flex-col items-center gap-1">
                  {!n.is_read && <div className="w-2 h-2 rounded-full bg-primary" />}
                  {dest && <span className="material-symbols-outlined text-sm text-on-surface-variant/30">chevron_right</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
