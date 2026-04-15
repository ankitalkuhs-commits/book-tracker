import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useEffect, useState } from 'react'
import { getUnreadCount } from '../services/api'

const NAV_ITEMS = [
  { to: '/home', label: 'Home' },
  { to: '/library', label: 'Library' },
  { to: '/search', label: 'Search' },
  { to: '/groups', label: 'Circles' },
  { to: '/notifications', label: 'Notifications' },
]

export default function Nav() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [unread, setUnread] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    getUnreadCount()
      .then((data) => setUnread(data?.unread || 0))
      .catch(() => {})
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  return (
    <nav className="glass shadow-zen fixed top-0 w-full z-50">
      <div className="flex justify-between items-center h-16 px-6 md:px-12 max-w-screen-2xl mx-auto">

        {/* Logo */}
        <NavLink to="/home" className="text-xl font-bold font-serif text-primary tracking-tight shrink-0">
          TrackMyRead
        </NavLink>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center space-x-6 font-serif text-base tracking-tight">
          {NAV_ITEMS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                isActive
                  ? 'text-primary border-b-2 border-primary pb-0.5 font-bold'
                  : 'text-on-surface/50 hover:text-primary transition-colors duration-200'
              }
            >
              {label === 'Notifications' && unread > 0 ? (
                <span className="relative">
                  Notifications
                  <span className="absolute -top-2 -right-4 bg-error text-on-error text-[10px] font-bold font-sans rounded-full w-4 h-4 flex items-center justify-center">
                    {unread > 9 ? '9+' : unread}
                  </span>
                </span>
              ) : label}
            </NavLink>
          ))}
        </div>

        {/* Right: admin + avatar */}
        <div className="flex items-center space-x-3">
          {user?.is_admin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `px-4 py-1.5 rounded-xl text-sm font-sans font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-surface-container-highest text-primary'
                    : 'text-on-surface/50 hover:bg-surface-container-low'
                }`
              }
            >
              Admin
            </NavLink>
          )}

          {/* Avatar + dropdown */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="w-9 h-9 rounded-full overflow-hidden border-2 border-primary-fixed-dim hover:scale-95 transition-transform focus:outline-none"
            >
              {user?.profile_picture ? (
                <img
                  src={user.profile_picture}
                  alt={user.name}
                  className="w-full h-full object-cover"
                  onError={(e) => { e.target.style.display = 'none' }}
                />
              ) : (
                <div className="w-full h-full bg-primary flex items-center justify-center text-on-primary text-xs font-bold font-sans">
                  {initials}
                </div>
              )}
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-surface-container-lowest rounded-xl shadow-float border border-outline-variant/15 py-1 font-sans text-sm">
                <NavLink
                  to="/profile"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2.5 text-on-surface hover:bg-surface-container-low transition-colors"
                >
                  <span className="material-symbols-outlined text-base">person</span>
                  Profile
                </NavLink>
                <NavLink
                  to="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2.5 text-on-surface hover:bg-surface-container-low transition-colors"
                >
                  <span className="material-symbols-outlined text-base">settings</span>
                  Settings
                </NavLink>
                <div className="border-t border-outline-variant/15 mt-1 pt-1">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-error hover:bg-error-container/30 transition-colors"
                  >
                    <span className="material-symbols-outlined text-base">logout</span>
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-1.5 rounded-lg hover:bg-surface-container-low transition-colors"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className="material-symbols-outlined text-on-surface">menu</span>
          </button>
        </div>
      </div>

      {/* Mobile dropdown nav */}
      {menuOpen && (
        <div className="md:hidden bg-surface-container-lowest border-t border-outline-variant/15 px-6 py-4 space-y-1 font-sans">
          {NAV_ITEMS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-surface-container text-primary font-bold'
                    : 'text-on-surface/70 hover:bg-surface-container-low'
                }`
              }
            >
              <span>{label}</span>
              {label === 'Notifications' && unread > 0 && (
                <span className="bg-error text-on-error text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </NavLink>
          ))}
          {user?.is_admin && (
            <NavLink
              to="/admin"
              onClick={() => setMenuOpen(false)}
              className="flex items-center px-3 py-2.5 rounded-xl text-sm font-medium text-on-surface/70 hover:bg-surface-container-low transition-colors"
            >
              Admin
            </NavLink>
          )}
          <div className="border-t border-outline-variant/15 pt-2 mt-2">
            <NavLink to="/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-on-surface/70 hover:bg-surface-container-low">
              <span className="material-symbols-outlined text-base">person</span> Profile
            </NavLink>
            <NavLink to="/settings" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-on-surface/70 hover:bg-surface-container-low">
              <span className="material-symbols-outlined text-base">settings</span> Settings
            </NavLink>
            <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-error hover:bg-error-container/30">
              <span className="material-symbols-outlined text-base">logout</span> Sign out
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
