import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Nav from './components/Nav'
import AppTour from './components/AppTour'

import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'
import LibraryPage from './pages/LibraryPage'
import SearchPage from './pages/SearchPage'
import ProfilePage from './pages/ProfilePage'
import UserProfilePage from './pages/UserProfilePage'
import NotificationsPage from './pages/NotificationsPage'
import SettingsPage from './pages/SettingsPage'
import AdminPage from './pages/AdminPage'
import GroupsPage from './pages/GroupsPage'
import CreateGroupPage from './pages/CreateGroupPage'
import GroupDetailPage from './pages/GroupDetailPage'
import JoinGroupPage from './pages/JoinGroupPage'
import InsightsPage from './pages/InsightsPage'
import OnboardingPage, { ONBOARDING_KEY } from './pages/OnboardingPage'
import BookDetailPage from './pages/BookDetailPage'
import AboutPage from './pages/AboutPage'
import PrivacyPage from './pages/PrivacyPage'
import TermsPage from './pages/TermsPage'
import BlogListPage from './pages/BlogListPage'
import BlogPostPage from './pages/BlogPostPage'

// Wraps all logged-in pages with the Nav bar + in-app tour for new users
function AppLayout({ children }) {
  const [showTour, setShowTour] = useState(
    () => !localStorage.getItem(ONBOARDING_KEY)
  )

  return (
    <div className="min-h-screen bg-surface">
      <Nav />
      <div className="pt-16">{children}</div>
      {showTour && <AppTour onDone={() => setShowTour(false)} />}
    </div>
  )
}

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <span className="text-on-surface-variant font-sans">Loading...</span>
    </div>
  )
  if (!user) return <Navigate to="/" replace />
  return <AppLayout>{children}</AppLayout>
}

function OnboardingRoute() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/" replace />
  // /onboarding now only used if someone navigates there manually (e.g. "take tour again")
  return <OnboardingPage />
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/" replace />
  if (!user.is_admin) return <Navigate to="/home" replace />
  return <AppLayout>{children}</AppLayout>
}

export default function App() {
  const { user, loading } = useAuth()

  if (loading) return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <span className="text-on-surface-variant font-sans">Loading...</span>
    </div>
  )

  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to="/home" replace /> : <LoginPage />} />
      <Route path="/onboarding" element={<OnboardingRoute />} />
      <Route path="/home" element={<PrivateRoute><HomePage /></PrivateRoute>} />
      <Route path="/library" element={<PrivateRoute><LibraryPage /></PrivateRoute>} />
      <Route path="/library/book/:userbookId" element={<PrivateRoute><BookDetailPage /></PrivateRoute>} />
      <Route path="/search" element={<PrivateRoute><SearchPage /></PrivateRoute>} />
      <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
      <Route path="/profile/:userId" element={<PrivateRoute><UserProfilePage /></PrivateRoute>} />
      <Route path="/notifications" element={<PrivateRoute><NotificationsPage /></PrivateRoute>} />
      <Route path="/settings" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
      <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
      <Route path="/groups" element={<PrivateRoute><GroupsPage /></PrivateRoute>} />
      <Route path="/groups/new" element={<PrivateRoute><CreateGroupPage /></PrivateRoute>} />
      <Route path="/groups/:groupId" element={<PrivateRoute><GroupDetailPage /></PrivateRoute>} />
      <Route path="/join/:inviteCode" element={<PrivateRoute><JoinGroupPage /></PrivateRoute>} />
      <Route path="/insights" element={<PrivateRoute><InsightsPage /></PrivateRoute>} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/blog" element={<BlogListPage />} />
      <Route path="/blog/:slug" element={<BlogPostPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
