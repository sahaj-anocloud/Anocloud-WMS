/**
 * Centralized API Client
 * 
 * This module provides a single axios instance with automatic JWT token injection
 * and device ID headers for all API requests.
 * 
 * Features:
 * - Configurable base URL from EXPO_PUBLIC_API_URL environment variable
 * - Automatic JWT token retrieval from AsyncStorage and injection into Authorization header
 * - Device ID header injection using expo-device
 * - 401 error handling (token expiration)
 * - Consistent timeout and headers across all requests
 */

import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

// Create axios instance with base configuration
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: inject JWT token and device ID
apiClient.interceptors.request.use(
  async (config) => {
    try {
      // Retrieve JWT token from AsyncStorage
      const authStateJson = await AsyncStorage.getItem('@wms_auth_state');
      if (authStateJson) {
        const authState = JSON.parse(authStateJson);
        if (authState.token) {
          config.headers.Authorization = `Bearer ${authState.token}`;
        }
      }

      // Add device ID header
      const deviceId = Device.modelName || 'unknown-device';
      config.headers['x-device-id'] = deviceId;
    } catch (error) {
      console.error('Failed to retrieve auth token or device ID:', error);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401 errors (token expiration)
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid - clear auth state
      try {
        await AsyncStorage.removeItem('@wms_auth_state');
        console.log('Auth token expired or invalid - cleared auth state');
      } catch (clearError) {
        console.error('Failed to clear auth state:', clearError);
      }
      // Note: Navigation to login screen should be handled by the app's navigation logic
    }
    return Promise.reject(error);
  }
);

export default apiClient;
