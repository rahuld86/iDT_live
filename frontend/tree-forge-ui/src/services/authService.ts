import { apiService } from './api';

const TOKEN_KEY = 'auth_token';
const USERNAME_KEY = 'auth_username';

export interface LoginResponse {
  access_token: string;
  username: string;
  message: string;
}

export interface UserInfo {
  username: string;
}

class AuthService {
  /**
   * Login with username and password
   */
  async login(username: string, password: string): Promise<LoginResponse> {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || '/api'}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Login failed' }));
        throw new Error(error.error || 'Invalid username or password');
      }

      const data: LoginResponse = await response.json();
      
      // Store token and username
      this.setToken(data.access_token);
      this.setUsername(data.username);
      
      return data;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Login failed');
    }
  }

  /**
   * Logout - clear stored token
   */
  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USERNAME_KEY);
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  /**
   * Get stored JWT token
   */
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  /**
   * Set JWT token
   */
  setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  }

  /**
   * Get stored username
   */
  getUsername(): string | null {
    return localStorage.getItem(USERNAME_KEY);
  }

  /**
   * Set username
   */
  setUsername(username: string): void {
    localStorage.setItem(USERNAME_KEY, username);
  }

  /**
   * Get current user info from API
   */
  async getCurrentUser(): Promise<UserInfo> {
    return apiService.makeRequest<UserInfo>('/user');
  }

  /**
   * Verify token validity
   */
  async verifyToken(): Promise<boolean> {
    try {
      await apiService.makeRequest<{ valid: boolean; username: string }>('/verify');
      return true;
    } catch {
      return false;
    }
  }
}

export const authService = new AuthService();

