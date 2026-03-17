// Mock for @react-native-async-storage/async-storage
const store = {};

const AsyncStorage = {
  getItem: jest.fn((key) => Promise.resolve(store[key] || null)),
  setItem: jest.fn((key, value) => { store[key] = value; return Promise.resolve(); }),
  removeItem: jest.fn((key) => { delete store[key]; return Promise.resolve(); }),
  clear: jest.fn(() => { Object.keys(store).forEach(k => delete store[k]); return Promise.resolve(); }),
  getAllKeys: jest.fn(() => Promise.resolve(Object.keys(store))),
  multiGet: jest.fn((keys) => Promise.resolve(keys.map(k => [k, store[k] || null]))),
};

export default AsyncStorage;
