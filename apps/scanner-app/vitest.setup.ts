import { vi } from 'vitest';

// Mock AsyncStorage
const mockAsyncStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: mockAsyncStorage,
}));

// Mock expo-device
vi.mock('expo-device', () => ({
  modelName: 'Test Device',
}));

// Export for test access
export { mockAsyncStorage };
