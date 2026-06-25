const ADMIN_API_BASE = '/api/v1/admin';
const ADMIN_TOKEN_KEY = 'amalfi_admin_token';

const canUseStorage = () => typeof window !== 'undefined' && !!window.localStorage;

export const getAdminToken = () => {
  if (!canUseStorage()) return '';
  return window.localStorage.getItem(ADMIN_TOKEN_KEY) || '';
};

export const setAdminToken = (token) => {
  if (!canUseStorage()) return;
  const normalized = String(token || '').trim();
  if (!normalized) return;
  window.localStorage.setItem(ADMIN_TOKEN_KEY, normalized);
};

export const clearAdminToken = () => {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(ADMIN_TOKEN_KEY);
};

export const adminFetch = async (path, options = {}) => {
  const token = getAdminToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (options.body && !headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(`${ADMIN_API_BASE}${path}`, {
    ...options,
    headers,
  });
};
