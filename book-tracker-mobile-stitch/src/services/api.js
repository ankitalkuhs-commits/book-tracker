// API Service - Connects mobile app to Stitch backend
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { isAuthExpiredError, isRetryableRequest } from './httpPolicy';

// Stitch backend
const API_BASE_URL = 'https://book-tracker-stitch.onrender.com';

const DEFAULT_TIMEOUT = 30000;
const COLD_START_TIMEOUT = 45000;
let coldStart = true;                       // true until the first successful response
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: DEFAULT_TIMEOUT,
  headers: { 'Content-Type': 'application/json' },
});

// Automatically add auth token to all requests
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('bt_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    if (coldStart && config.timeout === DEFAULT_TIMEOUT) config.timeout = COLD_START_TIMEOUT;
    return config;
  },
  (error) => Promise.reject(error)
);

// Session-expiry notification (F-11): App.js registers the handler that
// resets state and shows Login once, even though every parallel preload
// request can 401 at the same time.
let authExpiredHandler = null;
let authExpiredNotified = false;
export const setAuthExpiredHandler = (fn) => { authExpiredHandler = fn; };

// Cold-start retry (F-31) + session-expiry (F-11), in that order.
api.interceptors.response.use(
  (response) => { coldStart = false; return response; },
  async (error) => {
    if (isRetryableRequest(error)) {   // src/services/httpPolicy.js (T-22)
      const cfg = error.config;
      cfg.__retried = true;
      cfg.timeout = DEFAULT_TIMEOUT;
      await sleep(2000);
      return api(cfg);
    }
    if (isAuthExpiredError(error)) {   // src/services/httpPolicy.js (T-22)
      await AsyncStorage.removeItem('bt_token');
      if (!authExpiredNotified) { authExpiredNotified = true; authExpiredHandler?.(); }
    }
    return Promise.reject(error);
  }
);

// Warm-up ping (F-31): fire-and-forget from LoginScreen to wake a sleeping
// Render instance before the Google account picker / login round-trip.
export const warmUp = () => api.get('/version', { timeout: COLD_START_TIMEOUT, skipAuthExpired: true }).then(() => true).catch(() => false);

// Note composer visibility (F-17): the single AsyncStorage key every note
// composer reads/writes. Web uses the same key name in localStorage.
export const NOTE_VISIBILITY_KEY = 'bt_note_visibility';

// Auth API
export const authAPI = {
  googleLogin: async (idToken) => {
    const response = await api.post('/auth/google', { token: idToken });
    return response.data;
  },
  saveToken: async (token) => { authExpiredNotified = false; await AsyncStorage.setItem('bt_token', token); },
  getToken: async () => AsyncStorage.getItem('bt_token'),
  logout: async () => { await AsyncStorage.removeItem('bt_token'); },
  isLoggedIn: async () => !!(await AsyncStorage.getItem('bt_token')),
};

// Books API
export const booksAPI = {
  getAll: async () => (await api.get('/books/')).data,
  search: async (query, { genre, orderBy, startIndex } = {}) => {
    const params = new URLSearchParams({ query });
    if (genre && genre !== 'all') params.append('genre', genre);
    if (orderBy && orderBy !== 'relevance') params.append('order_by', orderBy);
    if (startIndex) params.append('start_index', startIndex);
    const response = await api.get(`/api/googlebooks/search?${params.toString()}`);
    // Return full response so callers can read has_more + next_start_index
    return response.data;
  },
  getGoogleBookDetails: async (googleBooksId) => (await api.get(`/api/googlebooks/book/${googleBooksId}`)).data,
  addToLibrary: async (bookData) => (await api.post('/books/add-to-library', bookData)).data,
  getRecommendations: async () => (await api.get('/books/recommendations')).data,
};

// UserBooks API
export const userbooksAPI = {
  getMyBooks: async () => (await api.get('/userbooks/')).data,
  getUserBooks: async (userId) => (await api.get(`/userbooks/user/${userId}`)).data,
  addBook: async (bookData) => (await api.post('/userbooks/', bookData)).data,
  updateProgress: async (userbookId, progressData) => (await api.put(`/userbooks/${userbookId}/progress`, progressData)).data,
  patchUserbook: async (userbookId, fields) => (await api.patch(`/userbooks/${userbookId}`, fields)).data,
  finishBook: async (userbookId) => (await api.post(`/userbooks/${userbookId}/finish`)).data,
  deleteBook: async (userbookId) => (await api.delete(`/userbooks/${userbookId}`)).data,
  getFriendsReading: async (limit = 10) => (await api.get(`/userbooks/friends/currently-reading?limit=${limit}`)).data,
};

// Notes API
export const notesAPI = {
  getFriendsFeed: async (limit = 50) => (await api.get(`/notes/friends-feed?limit=${limit}`)).data,
  getCommunityFeed: async (limit = 50) => (await api.get(`/notes/feed?limit=${limit}`)).data,
  likePost: async (noteId) => (await api.post(`/notes/${noteId}/like`)).data,
  unlikePost: async (noteId) => (await api.delete(`/notes/${noteId}/like`)).data,
  getComments: async (noteId) => (await api.get(`/notes/${noteId}/comments`)).data,
  addComment: async (noteId, text) => (await api.post(`/notes/${noteId}/comments`, { text })).data,
  getMyNotes: async () => (await api.get('/notes/me')).data,
  getNotesForBook: async (userbookId) => (await api.get(`/notes/userbook/${userbookId}`)).data,
  createNote: async (noteData) => (await api.post('/notes/', noteData)).data,
  updateNote: async (noteId, noteData) => (await api.put(`/notes/${noteId}`, noteData)).data,
  deleteNote: async (noteId) => (await api.delete(`/notes/${noteId}`)).data,
  adminDeleteComment: async (commentId) => (await api.delete(`/admin/content/comment/${commentId}`)).data,
  adminDeleteNote: async (noteId) => (await api.delete(`/admin/content/note/${noteId}`)).data,
  uploadImage: async (uri) => {
    const formData = new FormData();
    formData.append('file', { uri, type: 'image/jpeg', name: 'photo.jpg' });
    return (await api.post('/notes/upload-image', formData, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
  },
};

// User API
export const userAPI = {
  getProfile: async () => (await api.get('/profile/me')).data,
  getUser: async (userId) => (await api.get(`/users/${userId}`)).data,
  getUserStats: async (userId) => (await api.get(`/users/${userId}/stats`)).data,
  getUserNotes: async (userId) => (await api.get(`/notes/user/${userId}`)).data,
  updateProfile: async (profileData) => (await api.put('/profile/me', profileData)).data,
  searchUsers: async (query) => (await api.get(`/users/search?q=${encodeURIComponent(query)}`)).data,
  followUser: async (userId) => (await api.post(`/follow/${userId}`)).data,
  unfollowUser: async (userId) => (await api.delete(`/follow/${userId}`)).data,
  getFollowing: async () => (await api.get('/users/following')).data,
  registerPushToken: async (pushToken) => (await api.post('/push-tokens/', { token: pushToken })).data,
  deregisterPushToken: async () => (await api.delete('/push-tokens/', { timeout: 10000, skipAuthExpired: true })).data,
};

// Notifications API
export const notificationsAPI = {
  getUnreadCount: async () => (await api.get('/notifications/unread-count')).data,
  getHistory: async () => (await api.get('/notifications/history')).data,
  markAllRead: async () => (await api.post('/notifications/mark-read')).data,
  markRead: async (id) => (await api.post(`/notifications/${id}/read`)).data,
  getPrefs: async () => (await api.get('/notifications/prefs')).data,
  updatePrefs: async (prefs) => (await api.patch('/notifications/prefs', prefs)).data,
};

// Groups API
export const groupsAPI = {
  getMyGroups: async () => (await api.get('/groups/my')).data,
  getMyPendingGroups: async () => (await api.get('/groups/my/pending')).data,
  discoverGroups: async (q = '') => {
    const url = q ? `/groups/discover?q=${encodeURIComponent(q)}` : '/groups/discover';
    return (await api.get(url)).data;
  },
  getGroup: async (id) => (await api.get(`/groups/${id}`)).data,
  getGroupActivity: async (id) => (await api.get(`/groups/${id}/activity`)).data,
  deleteGroup: async (id) => { await api.delete(`/groups/${id}`); },
  getGroupGoal: async (id) => (await api.get(`/groups/${id}/goal`)).data,
  createGroup: async (data) => (await api.post('/groups/', data)).data,
  joinGroup: async (id) => (await api.post(`/groups/${id}/join`)).data,
  joinByInviteCode: async (code) => (await api.post(`/groups/join/${code}`)).data,
  leaveGroup: async (id) => (await api.delete(`/groups/${id}/leave`)).data,
  getGroupPosts: async (id) => (await api.get(`/groups/${id}/posts`)).data,
  createGroupPost: async (id, data) => (await api.post(`/groups/${id}/posts`, data)).data,
  getGroupMembers: async (id) => (await api.get(`/groups/${id}/members`)).data,
  getLeaderboard: async (id, period = 'monthly') => (await api.get(`/groups/${id}/leaderboard?period=${period}`)).data,
  inviteToGroup: async (id, userId) => (await api.post(`/groups/${id}/invite/${userId}`)).data,
  getMyInvites: async () => (await api.get('/groups/invites/pending')).data,
  getPendingMembers: async (id) => (await api.get(`/groups/${id}/pending`)).data,
  approveGroupMember: async (id, userId) => (await api.post(`/groups/${id}/approve/${userId}`)).data,
  rejectGroupMember: async (id, userId) => (await api.post(`/groups/${id}/reject/${userId}`)).data,
  removeGroupMember: async (id, userId) => (await api.delete(`/groups/${id}/remove/${userId}`)).data,
  setGroupBook: async (id, book) => (await api.put(`/groups/${id}/book`, typeof book === 'number'
    ? { book_id: book }
    : { google_books_id: book.google_id || null, title: book.title, author: book.authors?.join(', ') || book.author, cover_url: book.cover_url || null, total_pages: book.total_pages || null }
  )).data,
  clearGroupBook: async (id) => (await api.delete(`/groups/${id}/book`)).data,
  deleteGroupPost: async (groupId, postId) => (await api.delete(`/groups/${groupId}/posts/${postId}`)).data,
  uploadGroupPostImage: async (uri) => {
    const formData = new FormData();
    formData.append('file', { uri, type: 'image/jpeg', name: 'photo.jpg' });
    return (await api.post('/notes/upload-image', formData, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
  },
};

// Profile / Settings API
export const profileAPI = {
  getMe: async () => (await api.get('/profile/me')).data,
  getPublicProfile: async (userId) => (await api.get(`/profile/${userId}`)).data,
  updateMe: async (data) => (await api.put('/profile/me', data)).data,

  uploadPicture: async (uri) => {
    const formData = new FormData();
    formData.append('file', { uri, type: 'image/jpeg', name: 'photo.jpg' });
    return (await api.post('/profile/me/picture', formData, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
  },
  deleteAccount: async () => (await api.post('/auth/delete-account/me')).data,
};

// Reading Activity & Insights API
export const activityAPI = {
  getMyActivity: async (days = 30) => {
    const r = await api.get(`/reading-activity/daily?days=${days}`);
    return r.data?.data || [];
  },
  getUserActivity: async (userId, days = 30) => {
    const r = await api.get(`/reading-activity/user/${userId}/daily?days=${days}`);
    return r.data?.data || [];
  },
  getInsights: async () => (await api.get('/reading-activity/insights')).data,
};

// Import API
export const importAPI = {
  importGoodreads: async (fileUri, fileName) => {
    const formData = new FormData();
    // Send as octet-stream — backend validates by column structure, not MIME type
    formData.append('file', { uri: fileUri, type: 'application/octet-stream', name: fileName || 'goodreads_library_export.csv' });
    return (await api.post('/import/goodreads', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,  // large libraries can take a while
    })).data;
  },
  getCoversStatus: async () => (await api.get('/import/covers-status')).data,
  fixCoversBatch: async (book_ids) => (await api.post('/import/fix-covers-batch', { book_ids })).data,
};

export default api;
