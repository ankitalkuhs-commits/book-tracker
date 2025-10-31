// API Configuration
// Centralized API URL configuration to avoid hardcoding throughout the app

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

export const API_ENDPOINTS = {
  // Auth
  login: `${API_BASE_URL}/auth/login`,
  signup: `${API_BASE_URL}/auth/signup`,
  
  // Notes
  notes: `${API_BASE_URL}/notes/`,
  notesFeed: `${API_BASE_URL}/notes/feed`,
  myNotes: `${API_BASE_URL}/notes/me`,
  notesForUserbook: (userbookId) => `${API_BASE_URL}/notes/userbook/${userbookId}`,
  
  // Books
  books: `${API_BASE_URL}/books/`,
  addBookToLibrary: `${API_BASE_URL}/books/add-to-library`,
  
  // UserBooks
  userbooks: `${API_BASE_URL}/userbooks/`,
  userbookProgress: (id) => `${API_BASE_URL}/userbooks/${id}/progress`,
  userbookFinish: (id) => `${API_BASE_URL}/userbooks/${id}/finish`,
  
  // Google Books
  googleBooksSearch: `${API_BASE_URL}/api/googlebooks/search`,
  googleBookDetails: (id) => `${API_BASE_URL}/api/googlebooks/book/${id}`,
};

export default API_BASE_URL;
