import axios from 'axios';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

export class AuthService {
  static async login(otp: string) {
    // In a real app, we'd exchange OTP for a JWT via Keycloak
    const response = await axios.post(`${API_BASE_URL}/auth/login`, { otp });
    return response.data;
  }

  static async getProfile() {
    const response = await axios.get(`${API_BASE_URL}/auth/profile`);
    return response.data;
  }
}
