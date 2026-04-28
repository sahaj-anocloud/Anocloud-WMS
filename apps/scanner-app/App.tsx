import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { AppNavigator } from './src/navigation/AppNavigator';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/contexts/AuthContext';
import { initializeSslPinning } from 'react-native-ssl-public-key-pinning';
import { Platform } from 'react-native';

export default function App() {
  useEffect(() => {
    // Task 19: Security hardening - TLS 1.2+ certificate pinning
    // Only run this on native platforms as it throws on web
    if (Platform.OS !== 'web') {
      initializeSslPinning({
        'api.sumosave.com': {
          includeSubdomains: true,
          publicKeyHashes: [
            'sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
            'sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=', // Backup key
          ],
        },
      });
    }
  }, []);
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <AppNavigator />
        </NavigationContainer>
      </AuthProvider>
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
