// API Service - Connects mobile app to your FastAPI backend
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

// Stitch backend (Phase 2)
const API_BASE_URL = 'https://book-tracker-stitch.onrender.com';
// For local dev: 'http://<your-ip>:8000'

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Automatically add auth token to all requests
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('bt_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid - clear it
      AsyncStorage.removeItem('bt_token');
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  // Google OAuth login
  googleLogin: async (idToken) => {
    const response = await api.post('/auth/google', { id_token: idToken });
    return response.data;
  },
  
  // Save token after login
  saveToken: async (token) => {
    await AsyncStorage.setItem('bt_token', token);
  },
  
  // Get current token
  getToken: async () => {
    return await AsyncStorage.getItem('bt_token');
  },
  
  // Logout
  logout: async () => {
    await AsyncStorage.removeItem('bt_token');
  },
  
  // Check if user is logged in
  isLoggedIn: async () => {
    const token = await AsyncStorage.getItem('bt_token');
    return !!token;
  },
};

// Books API
export const booksAPI = {
  // Get all books
  getAll: async () => {
    const response = await api.get('/books/');
    return response.data;
  },
  
  // Search Google Books
  search: async (query) => {
    const response = await api.get(`/api/googlebooks/search?query=${encodeURIComponent(query)}`);
    // Backend returns { results: [...], total_items: ... }
    // We just need the results array
    return response.data.results || [];
  },
  
  // Get book details from Google Books
  getGoogleBookDetails: async (googleBooksId) => {
    const response = await api.get(`/api/googlebooks/book/${googleBooksId}`);
    return response.data;
  },
  
  // Add book from Google Books to user's library
  addToLibrary: async (bookData) => {
    const response = await api.post('/books/add-to-library', bookData);
    return response.data;
  },
};

// UserBooks API (user's reading list)
export const userbooksAPI = {
  // Get my books
  getMyBooks: async () => {
    const response = await api.get('/userbooks/');
    return response.data;
  },
  
  // Get another user's books
  getUserBooks: async (userId) => {
    const response = await api.get(`/userbooks/user/${userId}`);
    return response.data;
  },
  
  // Add book to library
  addBook: async (bookData) => {
    const response = await api.post('/userbooks/', bookData);
    return response.data;
  },
  
  // Update reading progress
  updateProgress: async (userbookId, progressData) => {
    const response = await api.put(`/userbooks/${userbookId}/progress`, progressData);
    return response.data;
  },
  
  // Mark book as finished
  finishBook: async (userbookId, rating = null) => {
    const response = await api.put(`/userbooks/${userbookId}/finish`, {
      rating,
    });
    return response.data;
  },
  
  // Delete book from library
  deleteBook: async (userbookId) => {
    const response = await api.delete(`/userbooks/${userbookId}`);
    return response.data;
  },

  // Get what friends are currently reading
  getFriendsReading: async (limit = 10) => {
    const response = await api.get(`/userbooks/friends/currently-reading?limit=${limit}`);
    return response.data;
  },
};

// Notes API (for community feed)
export const notesAPI = {
  // Get friends feed (from users you follow)
  getFriendsFeed: async (limit = 50) => {
    const response = await api.get(`/notes/friends-feed?limit=${limit}`);
    return response.data;
  },

  // Get community feed (all public posts)
  getCommunityFeed: async (limit = 50) => {
    const response = await api.get(`/notes/feed?limit=${limit}`);
    return response.data;
  },

  // Like a post
  likePost: async (noteId) => {
    const response = await api.post(`/notes/${noteId}/like`);
    return response.data;
  },

  // Unlike a post
  unlikePost: async (noteId) => {
    const response = await api.delete(`/notes/${noteId}/like`);
    return response.data;
  },

  // Get comments for a post
  getComments: async (noteId) => {
    const response = await api.get(`/notes/${noteId}/comments`);
    return response.data;
  },

  // Add comment to a post
  addComment: async (noteId, text) => {
    const response = await api.post(`/notes/${noteId}/comments`, { text });
    return response.data;
  },
  
  // Delete comment (not implemented yet in backend)
  // deleteComment: async (commentId) => {
  //   const response = await api.delete(`/comments/${commentId}`);
  //   return response.data;
  // },
  
  // Get my notes
  getMyNotes: async () => {
    const response = await api.get('/notes/me');
    return response.data;
  },

  // Get notes for specific userbook
  getNotesForBook: async (userbookId) => {
    const response = await api.get(`/notes/userbook/${userbookId}`);
    return response.data;
  },
  
  // Create note
  createNote: async (noteData) => {
    const response = await api.post('/notes/', noteData);
    return response.data;
  },

  // Update note
  updateNote: async (noteId, noteData) => {
    const response = await api.put(`/notes/${noteId}`, noteData);
    return response.data;
  },

  // Delete note
  deleteNote: async (noteId) => {
    const response = await api.delete(`/notes/${noteId}`);
    return response.data;
  },
  
  // Upload image for note
  uploadImage: async (uri) => {
    const formData = new FormData();
    formData.append('file', {
      uri,
      type: 'image/jpeg',
      name: 'photo.jpg',
    });
    
    const response = await api.post('/notes/upload-image', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};

// User API
export const userAPI = {
  // Get current user profile
  getProfile: async () => {
    const response = await api.get('/profile/me');
    return response.data;
  },
  
  // Get another user's stats
  getUserStats: async (userId) => {
    const response = await api.get(`/users/${userId}/stats`);
    return response.data;
  },
  
  // Update user profile
  updateProfile: async (profileData) => {
    const response = await api.put('/profile/me', profileData);
    return response.data;
  },

  // Search users
  searchUsers: async (query) => {
    const response = await api.get(`/users/search?q=${encodeURIComponent(query)}`);
    return response.data;
  },

  // Follow user
  followUser: async (userId) => {
    const response = await api.post(`/follow/${userId}`);
    return response.data;
  },

  // Unfollow user
  unfollowUser: async (userId) => {
    const response = await api.delete(`/follow/${userId}`);
    return response.data;
  },

  // Get following list
  getFollowing: async () => {
    const response = await api.get('/users/following');
    return response.data;
  },
  
  // Register push notification token
  registerPushToken: async (pushToken) => {
    const response = await api.post('/users/push-token', { token: pushToken });
    return response.data;
  },
};

// Notifications API
export const notificationsAPI = {
  getUnreadCount: async () => {
    const response = await api.get('/notifications/unread-count');
    return response.data;
  },

  getHistory: async () => {
    const response = await api.get('/notifications/history');
    return response.data;
  },

  markAllRead: async () => {
    const response = await api.post('/notifications/mark-read');
    return response.data;
  },

  getPrefs: async () => {
    const response = await api.get('/notifications/prefs');
    return response.data;
  },

  updatePrefs: async (prefs) => {
    const response = await api.patch('/notifications/prefs', prefs);
    return response.data;
  },
};

// Groups API
export const groupsAPI = {
  getMyGroups: async () => {
    const response = await api.get('/groups/my');
    return response.data;
  },

  discoverGroups: async (q = '') => {
    const url = q ? `/groups/discover?q=${encodeURIComponent(q)}` : '/groups/discover';
    const response = await api.get(url);
    return response.data;
  },

  getGroup: async (id) => {
    const response = await api.get(`/groups/${id}`);
    return response.data;
  },

  createGroup: async (data) => {
    const response = await api.post('/groups/', data);
    return response.data;
  },

  joinGroup: async (id) => {
    const response = await api.post(`/groups/${id}/join`);
    return response.data;
  },

  joinByInviteCode: async (code) => {
    const response = await api.post(`/groups/join/${code}`);
    return response.data;
  },

  leaveGroup: async (id) => {
    const response = await api.delete(`/groups/${id}/leave`);
    return response.data;
  },

  getGroupPosts: async (id) => {
    const response = await api.get(`/groups/${id}/posts`);
    return response.data;
  },

  createGroupPost: async (id, data) => {
    const response = await api.post(`/groups/${id}/posts`, data);
    return response.data;
  },

  getGroupMembers: async (id) => {
    const response = await api.get(`/groups/${id}/members`);
    return response.data;
  },

  getLeaderboard: async (id, period = 'monthly') => {
    const response = await api.get(`/groups/${id}/leaderboard?period=${period}`);
    return response.data;
  },

  getGroupActivity: async (id) => {
    const response = await api.get(`/groups/${id}/activity`);
    return response.data;
  },

  deleteGroupPost: async (groupId, postId) => {
    const response = await api.delete(`/groups/${groupId}/posts/${postId}`);
    return response.data;
  },

  getMyInvites: async () => {
    const response = await api.get('/groups/invites/pending');
    return response.data;
  },
};

// Profile / Settings API
export const profileAPI = {
  getMe: async () => {
    const response = await api.get('/profile/me');
    return response.data;
  },

  updateMe: async (data) => {
    const response = await api.put('/profile/me', data);
    return response.data;
  },

  uploadPicture: async (uri) => {
    const formData = new FormData();
    formData.append('file', { uri, type: 'image/jpeg', name: 'photo.jpg' });
    const response = await api.post('/profile/me/picture', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  deleteAccount: async () => {
    const response = await api.post('/auth/delete-account/me');
    return response.data;
  },
};

export default api;
