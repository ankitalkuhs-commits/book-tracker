// API Service - Connects mobile app to Stitch backend
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

// Stitch backend
const API_BASE_URL = 'https://book-tracker-stitch.onrender.com';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// Automatically add auth token to all requests
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('bt_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle 401 globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) AsyncStorage.removeItem('bt_token');
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  googleLogin: async (idToken) => {
    const response = await api.post('/auth/google', { token: idToken });
    return response.data;
  },
  saveToken: async (token) => { await AsyncStorage.setItem('bt_token', token); },
  getToken: async () => AsyncStorage.getItem('bt_token'),
  logout: async () => { await AsyncStorage.removeItem('bt_token'); },
  isLoggedIn: async () => !!(await AsyncStorage.getItem('bt_token')),
};

// Books API
export const booksAPI = {
  getAll: async () => (await api.get('/books/')).data,
  search: async (query) => {
    const response = await api.get(`/api/googlebooks/search?query=${encodeURIComponent(query)}`);
    return response.data.results || [];
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
};

// Notifications API
export const notificationsAPI = {
  getUnreadCount: async () => (await api.get('/notifications/unread-count')).data,
  getHistory: async () => (await api.get('/notifications/history')).data,
  markAllRead: async () => (await api.post('/notifications/mark-read')).data,
  getPrefs: async () => (await api.get('/notifications/prefs')).data,
  updatePrefs: async (prefs) => (await api.patch('/notifications/prefs', prefs)).data,
};

// Groups API
export const groupsAPI = {
  getMyGroups: async () => (await api.get('/groups/my')).data,
  discoverGroups: async (q = '') => {
    const url = q ? `/groups/discover?q=${encodeURIComponent(q)}` : '/groups/discover';
    return (await api.get(url)).data;
  },
  getGroup: async (id) => (await api.get(`/groups/${id}`)).data,
  getGroupActivity: async (id) => (await api.get(`/groups/${id}/activity`)).data,
  createGroup: async (data) => (await api.post('/groups/', data)).data,
  joinGroup: async (id) => (await api.post(`/groups/${id}/join`)).data,
  joinByInviteCode: async (code) => (await api.post(`/groups/join/${code}`)).data,
  leaveGroup: async (id) => (await api.delete(`/groups/${id}/leave`)).data,
  getGroupPosts: async (id) => (await api.get(`/groups/${id}/posts`)).data,
  createGroupPost: async (id, data) => (await api.post(`/groups/${id}/posts`, data)).data,
  getGroupMembers: async (id) => (await api.get(`/groups/${id}/members`)).data,
  getLeaderboard: async (id, period = 'monthly') => (await api.get(`/groups/${id}/leaderboard?period=${period}`)).data,
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

export default api;
