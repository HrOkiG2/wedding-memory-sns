import type { JwtPayload, AuthState, LoginResponse, ApiError } from '~/types';

const AUTH_STORAGE_KEY = 'wedding_jwt';

// Decode JWT payload (without verification - verification is done server-side)
function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

// Check if JWT is expired
function isTokenExpired(payload: JwtPayload): boolean {
  return Date.now() >= payload.exp * 1000;
}

export function useAuth() {
  const config = useRuntimeConfig();
  const authState = useState<AuthState>('auth', () => ({
    isAuthenticated: false,
    jwt: null,
    payload: null,
  }));

  // Initialize auth state from localStorage
  const initAuth = () => {
    if (import.meta.client) {
      const storedJwt = localStorage.getItem(AUTH_STORAGE_KEY);
      if (storedJwt) {
        const payload = decodeJwtPayload(storedJwt);
        if (payload && !isTokenExpired(payload)) {
          authState.value = {
            isAuthenticated: true,
            jwt: storedJwt,
            payload,
          };
        } else {
          // Clear expired token
          localStorage.removeItem(AUTH_STORAGE_KEY);
        }
      }
    }
  };

  // Login with QR token
  const login = async (token: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await $fetch<LoginResponse>(`${config.public.apiEndpoint}/auth/login`, {
        method: 'POST',
        body: { token },
      });

      const payload = decodeJwtPayload(response.token);
      if (!payload) {
        return { success: false, error: 'Invalid token received' };
      }

      // Save to localStorage
      if (import.meta.client) {
        localStorage.setItem(AUTH_STORAGE_KEY, response.token);
      }

      authState.value = {
        isAuthenticated: true,
        jwt: response.token,
        payload,
      };

      return { success: true };
    } catch (error: unknown) {
      const apiError = error as { data?: ApiError; statusCode?: number };
      if (apiError.statusCode === 429) {
        return {
          success: false,
          error: apiError.data?.message || 'リクエストが多すぎます。しばらくお待ちください。',
        };
      }
      if (apiError.statusCode === 401) {
        return { success: false, error: '無効なQRコードです' };
      }
      return { success: false, error: '接続エラーが発生しました' };
    }
  };

  // Logout
  const logout = () => {
    if (import.meta.client) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
    authState.value = {
      isAuthenticated: false,
      jwt: null,
      payload: null,
    };
  };

  // Get authorization header
  const getAuthHeader = (): Record<string, string> => {
    if (authState.value.jwt) {
      return { Authorization: `Bearer ${authState.value.jwt}` };
    }
    return {};
  };

  // Check if user can delete a photo
  const canDeletePhoto = (photoTableId: string): boolean => {
    const { payload } = authState.value;
    if (!payload) return false;
    return payload.role === 'ADMIN' || payload.tableId === photoTableId;
  };

  return {
    authState: readonly(authState),
    initAuth,
    login,
    logout,
    getAuthHeader,
    canDeletePhoto,
  };
}
