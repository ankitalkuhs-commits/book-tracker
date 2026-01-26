// API Service - Connects mobile app to your FastAPI backend
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

// Your backend URL
// For development: Use your deployed backend OR local IP
const API_BASE_URL = 'https://book-tracker-backend-0hiz.onrender.com';
// For testing locally: Uncomment and use your PC's local IP
// const API_BASE_URL = 'http://192.168.1.10:8000'; // Replace with your IP from ipconfig

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
    const token = await AsyncStorage.getItem('token');
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
      AsyncStorage.removeItem('token');
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
    await AsyncStorage.setItem('token', token);
  },
  
  // Get current token
  getToken: async () => {
    return await AsyncStorage.getItem('token');
  },
  
  // Logout
  logout: async () => {
    await AsyncStorage.removeItem('token');
  },
  
  // Check if user is logged in
  isLoggedIn: async () => {
    const token = await AsyncStorage.getItem('token');
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
    const response = await api.get(`/api/googlebooks/search?q=${encodeURIComponent(query)}`);
    return response.data;
  },
  
  // Get book details from Google Books
  getGoogleBookDetails: async (googleBooksId) => {
    const response = await api.get(`/api/googlebooks/book/${googleBooksId}`);
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
  
  // Add book to library
  addBook: async (bookData) => {
    const response = await api.post('/userbooks/', bookData);
    return response.data;
  },
  
  // Update reading progress
  updateProgress: async (userbookId, currentPage) => {
    const response = await api.put(`/userbooks/${userbookId}/progress`, {
      current_page: currentPage,
    });
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
};

// Notes API (for community feed)
export const notesAPI = {
  // Get feed (friend activities)
  getFeed: async () => {
    const response = await api.get('/notes/feed');
    return response.data;
  },
  
  // Get my notes
  getMyNotes: async () => {
    const response = await api.get('/notes/me');
    return response.data;
  },
  
  // Create note
  createNote: async (noteData) => {
    const response = await api.post('/notes/', noteData);
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
    
    const response = await api.post('/uploads/notes/', formData, {
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
    const response = await api.get('/users/me');
    return response.data;
  },
  
  // Register push notification token
  registerPushToken: async (pushToken) => {
    const response = await api.post('/users/push-token', { token: pushToken });
    return response.data;
  },
};

export default api;
