export function createApiClient({ token, fetchImpl = fetch } = {}) {
  async function apiRequest(url, options = {}) {
    if (!token) {
      throw new Error('Admin Desk token is missing. Set VITE_HUB_ADMIN_TOKEN before using this app.');
    }

    const response = await fetchImpl(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(options.headers || {})
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Request failed with status ${response.status}`);
    }

    return response.json();
  }

  return {
    get: (url, options) => apiRequest(url, { ...options, method: 'GET' }),
    post: (url, body, options) => apiRequest(url, { ...options, method: 'POST', body: JSON.stringify(body) }),
    patch: (url, body, options) => apiRequest(url, { ...options, method: 'PATCH', body: JSON.stringify(body) })
  };
}

const HUB_TOKEN = import.meta.env.VITE_HUB_ADMIN_TOKEN;

export const api = createApiClient({ token: HUB_TOKEN });
