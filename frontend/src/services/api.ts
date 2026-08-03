const API_BASE_URL = 'http://localhost:4000/api';

interface RequestOptions extends RequestInit {
  token?: string;
}

class ApiClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  setTokens(access: string, refresh: string) {
    this.accessToken = access;
    this.refreshToken = refresh;
    localStorage.setItem('dockops_access', access);
    localStorage.setItem('dockops_refresh', refresh);
  }

  loadTokens() {
    this.accessToken = localStorage.getItem('dockops_access');
    this.refreshToken = localStorage.getItem('dockops_refresh');
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem('dockops_access');
    localStorage.removeItem('dockops_refresh');
  }

  getRefreshToken() {
    return this.refreshToken;
  }

  async request(path: string, options: RequestOptions = {}): Promise<any> {
    this.loadTokens();

    const headers = new Headers(options.headers || {});
    if (this.accessToken) {
      headers.set('Authorization', `Bearer ${this.accessToken}`);
    }
    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    const config: RequestInit = {
      ...options,
      headers,
    };

    let response = await fetch(`${API_BASE_URL}${path}`, config);

    // If 403 or 401, try to refresh token
    if ((response.status === 401 || response.status === 403) && this.refreshToken) {
      try {
        console.log('[API Client] Token expired. Attempting refresh...');
        const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: this.refreshToken }),
        });

        if (refreshResponse.ok) {
          const data = await refreshResponse.json();
          this.setTokens(data.accessToken, data.refreshToken);

          // Retry the original request with new token
          headers.set('Authorization', `Bearer ${data.accessToken}`);
          config.headers = headers;
          response = await fetch(`${API_BASE_URL}${path}`, config);
        } else {
          // Refresh failed
          this.clearTokens();
          window.dispatchEvent(new Event('auth-logout'));
        }
      } catch (err) {
        this.clearTokens();
        window.dispatchEvent(new Event('auth-logout'));
      }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Request failed with status ${response.status}`);
    }

    return response.json();
  }

  get(path: string, options?: RequestOptions) {
    return this.request(path, { ...options, method: 'GET' });
  }

  post(path: string, body?: any, options?: RequestOptions) {
    return this.request(path, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  patch(path: string, body?: any, options?: RequestOptions) {
    return this.request(path, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  delete(path: string, options?: RequestOptions) {
    return this.request(path, { ...options, method: 'DELETE' });
  }
}

export const api = new ApiClient();
export default api;
