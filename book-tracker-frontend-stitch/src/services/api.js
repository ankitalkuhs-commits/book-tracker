const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const TOKEN_KEY = 'bt_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    window.location.href = '/';
    return;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(err.detail || 'Request failed');
  }

  // 204 No Content
  if (res.status === 204) return null;
  return res.json();
}

// Auth
export const googleLogin = (token) =>
  apiFetch('/auth/google', { method: 'POST', body: JSON.stringify({ token }) });

export const demoLogin = () =>
  apiFetch('/auth/demo-login', { method: 'POST' });

// Profile
export const getMyProfile = () => apiFetch('/profile/me');
export const updateMyProfile = (data) =>
  apiFetch('/profile/me', { method: 'PUT', body: JSON.stringify(data) });
export const getPublicProfile = (userId) => apiFetch(`/profile/${userId}`);

// Books
export const searchGoogleBooks = (q) => apiFetch(`/googlebooks/search?q=${encodeURIComponent(q)}`);
export const addToLibrary = (data) =>
  apiFetch('/books/add-to-library', { method: 'POST', body: JSON.stringify(data) });

// User Books
export const getMyBooks = (status = '') =>
  apiFetch(`/userbooks/${status ? `?status=${status}` : ''}`);
export const getUserBooks = (userId) => apiFetch(`/userbooks/user/${userId}`);
export const updateProgress = (userbookId, currentPage) =>
  apiFetch(`/userbooks/${userbookId}/progress`, {
    method: 'PUT',
    body: JSON.stringify({ current_page: currentPage }),
  });
export const markFinished = (userbookId) =>
  apiFetch(`/userbooks/${userbookId}/finish`, { method: 'PUT' });
export const removeFromLibrary = (userbookId) =>
  apiFetch(`/userbooks/${userbookId}`, { method: 'DELETE' });
export const getFriendReading = () => apiFetch('/userbooks/friends/currently-reading');

// Notes / Feed
export const getCommunityFeed = () => apiFetch('/notes/feed');
export const getFriendsFeed = () => apiFetch('/notes/friends-feed');
export const getMyNotes = () => apiFetch('/notes/me');
export const getNotesForBook = (userbookId) => apiFetch(`/notes/userbook/${userbookId}`);
export const createNote = (data) =>
  apiFetch('/notes/', { method: 'POST', body: JSON.stringify(data) });
export const updateNote = (noteId, data) =>
  apiFetch(`/notes/${noteId}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteNote = (noteId) =>
  apiFetch(`/notes/${noteId}`, { method: 'DELETE' });

// Likes & Comments
export const likeNote = (noteId) =>
  apiFetch(`/notes/${noteId}/like`, { method: 'POST' });
export const unlikeNote = (noteId) =>
  apiFetch(`/notes/${noteId}/like`, { method: 'DELETE' });
export const getComments = (noteId) => apiFetch(`/notes/${noteId}/comments`);
export const addComment = (noteId, text) =>
  apiFetch(`/notes/${noteId}/comments`, { method: 'POST', body: JSON.stringify({ text }) });

// Follow
export const followUser = (userId) =>
  apiFetch(`/follow/${userId}`, { method: 'POST' });
export const unfollowUser = (userId) =>
  apiFetch(`/follow/${userId}`, { method: 'DELETE' });
export const getFollowers = () => apiFetch('/follow/followers');
export const getFollowing = () => apiFetch('/follow/following');

// Users
export const searchUsers = (q) => apiFetch(`/users/search?q=${encodeURIComponent(q)}`);

// Reading Activity
export const getMyActivity = (days = 30) =>
  apiFetch(`/reading-activity/daily?days=${days}`);
export const getUserActivity = (userId, days = 30) =>
  apiFetch(`/reading-activity/user/${userId}/daily?days=${days}`);

// Notifications
export const getUnreadCount = () => apiFetch('/notifications/unread-count');
export const getNotifications = () => apiFetch('/notifications/history');
export const markAllNotificationsRead = () =>
  apiFetch('/notifications/mark-read', { method: 'POST' });

// Admin
export const getAdminStats = () => apiFetch('/admin/stats');
export const getAdminUsers = () => apiFetch('/admin/users');
export const setAdminRole = (userId) =>
  apiFetch(`/admin/set-admin/${userId}`, { method: 'POST' });
export const sendTestPush = (userId) =>
  apiFetch(`/admin/push/test/${userId}`, { method: 'POST' });
export const broadcastPush = (data) =>
  apiFetch('/admin/push/broadcast', { method: 'POST', body: JSON.stringify(data) });
