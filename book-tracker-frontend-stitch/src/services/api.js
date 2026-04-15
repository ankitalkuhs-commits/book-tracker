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
export const uploadProfilePicture = async (file) => {
  const token = getToken();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/profile/me/picture`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || 'Upload failed'); }
  return res.json();
};
export const getPublicProfile = (userId) => apiFetch(`/profile/${userId}`);

// Books
export const searchLocalBooks = (q) => apiFetch(`/books/search?q=${encodeURIComponent(q)}`);
export const getRecommendations = () => apiFetch('/books/recommendations');
export const searchGoogleBooks = (q) =>
  apiFetch(`/googlebooks/search?query=${encodeURIComponent(q)}`).then(res => {
    const items = res?.results || res || []
    return items.map(b => ({
      ...b,
      google_books_id: b.google_id || b.google_books_id,
      author: Array.isArray(b.authors) ? b.authors.join(', ') : (b.author || ''),
      isbn: b.isbn_13 || b.isbn_10 || b.isbn || null,
    }))
  });
export const addToLibrary = (data) =>
  apiFetch('/books/add-to-library', { method: 'POST', body: JSON.stringify(data) });

// User Books
export const getMyBooks = (status = '') =>
  apiFetch(`/userbooks/${status ? `?status=${status}` : ''}`);
export const getUserBooks = (userId) => apiFetch(`/userbooks/user/${userId}`);
export const updateUserBook = (userbookId, data) =>
  apiFetch(`/userbooks/${userbookId}`, { method: 'PATCH', body: JSON.stringify(data) });
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
export const getUserNotes = (userId) => apiFetch(`/notes/user/${userId}`);
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
// /users/following returns full user objects (id, name, username…); /follow/following only returns ids
export const getFollowing = () => apiFetch('/users/following');

// Users
export const searchUsers = (q) => apiFetch(`/users/search?q=${encodeURIComponent(q)}`);
export const getUserStats = (userId) => apiFetch(`/users/${userId}/stats`);

// Reading Activity — API returns { days, data: [...] }, unwrap to array
export const getMyActivity = (days = 30) =>
  apiFetch(`/reading-activity/daily?days=${days}`).then(r => r?.data || []);
export const getUserActivity = (userId, days = 30) =>
  apiFetch(`/reading-activity/user/${userId}/daily?days=${days}`).then(r => r?.data || []);
export const getReadingInsights = () => apiFetch('/reading-activity/insights');

// Notifications
export const getUnreadCount = () => apiFetch('/notifications/unread-count');
export const getNotifications = () => apiFetch('/notifications/history');
export const markAllNotificationsRead = () =>
  apiFetch('/notifications/mark-read', { method: 'POST' });
export const getVapidPublicKey = () => apiFetch('/notifications/vapid-public-key');
export const webSubscribe = (subscription, deviceInfo = 'Chrome/Web') =>
  apiFetch('/notifications/web-subscribe', {
    method: 'POST',
    body: JSON.stringify({ subscription, device_info: deviceInfo }),
  });

// Groups
export const getMyGroups = () => apiFetch('/groups/my');
export const discoverGroups = (q = '') => apiFetch(`/groups/discover${q ? `?q=${encodeURIComponent(q)}` : ''}`);
export const getGroup = (id) => apiFetch(`/groups/${id}`);
export const createGroup = (data) => apiFetch('/groups/', { method: 'POST', body: JSON.stringify(data) });
export const updateGroup = (id, data) => apiFetch(`/groups/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteGroup = (id) => apiFetch(`/groups/${id}`, { method: 'DELETE' });
export const joinGroup = (id) => apiFetch(`/groups/${id}/join`, { method: 'POST' });
export const leaveGroup = (id) => apiFetch(`/groups/${id}/leave`, { method: 'DELETE' });
export const getGroupMembers = (id) => apiFetch(`/groups/${id}/members`);
export const getPendingMembers = (id) => apiFetch(`/groups/${id}/pending`);
export const approveGroupMember = (id, userId) => apiFetch(`/groups/${id}/approve/${userId}`, { method: 'POST' });
export const rejectGroupMember = (id, userId) => apiFetch(`/groups/${id}/reject/${userId}`, { method: 'POST' });
export const removeGroupMember = (id, userId) => apiFetch(`/groups/${id}/remove/${userId}`, { method: 'DELETE' });
export const inviteToGroup = (id, userId) => apiFetch(`/groups/${id}/invite/${userId}`, { method: 'POST' });
export const joinByInviteCode = (code) => apiFetch(`/groups/join/${code}`, { method: 'POST' });
export const acceptGroupInvite = (id) => apiFetch(`/groups/${id}/accept`, { method: 'POST' });
export const declineGroupInvite = (id) => apiFetch(`/groups/${id}/decline`, { method: 'DELETE' });
export const getGroupPosts = (id) => apiFetch(`/groups/${id}/posts`);
export const createGroupPost = (id, data) => apiFetch(`/groups/${id}/posts`, { method: 'POST', body: JSON.stringify(data) });
export const deleteGroupPost = (id, postId) => apiFetch(`/groups/${id}/posts/${postId}`, { method: 'DELETE' });
export const getGroupLeaderboard = (id, period = 'monthly') => apiFetch(`/groups/${id}/leaderboard?period=${period}`);
export const getGroupGoal = (id) => apiFetch(`/groups/${id}/goal`);
export const setGroupBook = (id, book) => apiFetch(`/groups/${id}/book`, {
  method: 'PUT',
  body: JSON.stringify(
    typeof book === 'number'
      ? { book_id: book }
      : {
          book_id: book.id || null,
          google_books_id: book.google_books_id || null,
          title: book.title,
          author: book.author,
          cover_url: book.cover_url || null,
          isbn: book.isbn || null,
          total_pages: book.total_pages || null,
          description: book.description || null,
        }
  ),
});
export const clearGroupBook = (id) => apiFetch(`/groups/${id}/book`, { method: 'DELETE' });
export const getMyGroupInvites = () => apiFetch('/groups/invites/pending');
export const searchUsersForInvite = (q) => apiFetch(`/users/search?q=${encodeURIComponent(q)}`);

// Account
export const deleteAccount = () => apiFetch('/auth/delete-account/me', { method: 'POST' });

// Admin
export const getAdminStats = () => apiFetch('/admin/stats');
export const getAdminUsers = () => apiFetch('/admin/users');
export const setAdminRole = (userId) =>
  apiFetch(`/admin/set-admin/${userId}`, { method: 'POST' });
export const sendTestPush = (userId) =>
  apiFetch(`/admin/push/test/${userId}`, { method: 'POST' });
export const broadcastPush = (data) =>
  apiFetch('/admin/push/broadcast', { method: 'POST', body: JSON.stringify(data) });
export const triggerBot = () => apiFetch('/admin/bot/trigger', { method: 'POST' });
