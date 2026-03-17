/**
 * Tests for the API service layer.
 * Mocks axios to avoid real network calls.
 */
import axios from 'axios';

// We test the API module with axios mocked
jest.mock('axios');

// Re-import after mock is set up
let authAPI, booksAPI, userbooksAPI, notesAPI, userAPI;

beforeEach(async () => {
  jest.resetModules();
  jest.clearAllMocks();

  // Provide a mock axios instance
  const mockAxiosInstance = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  };
  axios.create.mockReturnValue(mockAxiosInstance);

  const apiModule = await import('../services/api');
  authAPI = apiModule.authAPI;
  booksAPI = apiModule.booksAPI;
  userbooksAPI = apiModule.userbooksAPI;
  notesAPI = apiModule.notesAPI;
  userAPI = apiModule.userAPI;
});

// ─── authAPI ─────────────────────────────────────────────────────────────────

describe('authAPI', () => {
  test('isLoggedIn returns true when token exists', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    AsyncStorage.getItem.mockResolvedValue('mytoken123');
    const result = await authAPI.isLoggedIn();
    expect(result).toBe(true);
  });

  test('isLoggedIn returns false when no token', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    AsyncStorage.getItem.mockResolvedValue(null);
    const result = await authAPI.isLoggedIn();
    expect(result).toBe(false);
  });

  test('logout removes the token from storage', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    await authAPI.logout();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('token');
  });
});

// ─── notesAPI ─────────────────────────────────────────────────────────────────

describe('notesAPI.getCommunityFeed', () => {
  test('calls GET /notes/feed and returns data', async () => {
    const apiModule = await import('../services/api');
    const mockGet = axios.create().get;
    mockGet.mockResolvedValue({ data: [{ id: 1, text: 'Hello' }] });

    const result = await apiModule.notesAPI.getCommunityFeed();
    expect(mockGet).toHaveBeenCalledWith('/notes/feed?limit=50');
    expect(result).toEqual([{ id: 1, text: 'Hello' }]);
  });
});

describe('notesAPI.deleteNote', () => {
  test('calls DELETE /notes/:id', async () => {
    const apiModule = await import('../services/api');
    const mockDelete = axios.create().delete;
    mockDelete.mockResolvedValue({ data: { message: 'Note deleted successfully' } });

    const result = await apiModule.notesAPI.deleteNote(42);
    expect(mockDelete).toHaveBeenCalledWith('/notes/42');
    expect(result.message).toBe('Note deleted successfully');
  });
});

describe('notesAPI.updateNote', () => {
  test('calls PUT /notes/:id with payload', async () => {
    const apiModule = await import('../services/api');
    const mockPut = axios.create().put;
    mockPut.mockResolvedValue({ data: { id: 5, text: 'Updated', updated_at: '2026-03-14T12:00:00Z' } });

    const result = await apiModule.notesAPI.updateNote(5, { text: 'Updated' });
    expect(mockPut).toHaveBeenCalledWith('/notes/5', { text: 'Updated' });
    expect(result.updated_at).toBe('2026-03-14T12:00:00Z');
  });
});

// ─── userbooksAPI ─────────────────────────────────────────────────────────────

describe('userbooksAPI.updateProgress', () => {
  test('calls PUT /userbooks/:id/progress', async () => {
    const apiModule = await import('../services/api');
    const mockPut = axios.create().put;
    mockPut.mockResolvedValue({ data: { id: 3, current_page: 150 } });

    const result = await apiModule.userbooksAPI.updateProgress(3, { current_page: 150 });
    expect(mockPut).toHaveBeenCalledWith('/userbooks/3/progress', { current_page: 150 });
    expect(result.current_page).toBe(150);
  });
});

describe('userbooksAPI.finishBook', () => {
  test('calls PUT /userbooks/:id/finish with rating', async () => {
    const apiModule = await import('../services/api');
    const mockPut = axios.create().put;
    mockPut.mockResolvedValue({ data: { id: 3, status: 'finished' } });

    await apiModule.userbooksAPI.finishBook(3, 5);
    expect(mockPut).toHaveBeenCalledWith('/userbooks/3/finish', { rating: 5 });
  });

  test('sends null rating when omitted', async () => {
    const apiModule = await import('../services/api');
    const mockPut = axios.create().put;
    mockPut.mockResolvedValue({ data: {} });

    await apiModule.userbooksAPI.finishBook(3);
    expect(mockPut).toHaveBeenCalledWith('/userbooks/3/finish', { rating: null });
  });
});

// ─── userAPI ──────────────────────────────────────────────────────────────────

describe('userAPI.updateProfile', () => {
  test('calls PUT /profile/me with bio', async () => {
    const apiModule = await import('../services/api');
    const mockPut = axios.create().put;
    mockPut.mockResolvedValue({ data: { bio: 'I love books' } });

    const result = await apiModule.userAPI.updateProfile({ bio: 'I love books' });
    expect(mockPut).toHaveBeenCalledWith('/profile/me', { bio: 'I love books' });
    expect(result.bio).toBe('I love books');
  });
});

describe('userAPI.searchUsers', () => {
  test('encodes query and calls GET /users/search', async () => {
    const apiModule = await import('../services/api');
    const mockGet = axios.create().get;
    mockGet.mockResolvedValue({ data: [{ id: 1, name: 'Alice' }] });

    await apiModule.userAPI.searchUsers('ali ce');
    expect(mockGet).toHaveBeenCalledWith('/users/search?q=ali%20ce');
  });
});
