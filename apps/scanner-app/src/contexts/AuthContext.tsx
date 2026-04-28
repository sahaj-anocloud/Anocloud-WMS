import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, AuthState } from '../types';

interface AuthContextType extends AuthState {
  login: (user: User, token: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    token: null,
    isAuthenticated: false,
  });

  useEffect(() => {
    // Load stored auth state
    const loadAuth = async () => {
      try {
        const stored = await AsyncStorage.getItem('@wms_auth_state');
        if (stored) {
          setAuthState(JSON.parse(stored));
        }
      } catch (e) {
        console.error('Failed to load auth state', e);
      }
    };
    loadAuth();
  }, []);

  const login = async (user: User, token: string) => {
    const newState = { user, token, isAuthenticated: true };
    setAuthState(newState);
    await AsyncStorage.setItem('@wms_auth_state', JSON.stringify(newState));
  };

  const logout = async () => {
    const newState = { user: null, token: null, isAuthenticated: false };
    setAuthState(newState);
    await AsyncStorage.removeItem('@wms_auth_state');
  };

  return (
    <AuthContext.Provider value={{ ...authState, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
