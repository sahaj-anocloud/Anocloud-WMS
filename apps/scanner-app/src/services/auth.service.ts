import apiClient from './api.client';

export class AuthService {
  static async login(otp: string) {
    // In a real app, we'd exchange OTP for a JWT via Keycloak
    const response = await apiClient.post('/api/v1/auth/login', { otp });
    return response.data;
  }

  static async getProfile() {
    const response = await apiClient.get('/api/v1/auth/profile');
    return response.data;
  }
}
