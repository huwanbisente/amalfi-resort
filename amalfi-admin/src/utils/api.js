/**
 * Amalfi Sanctuary API Utility
 * Provides a hardened fetch wrapper that automatically injects 
 * the Service Token for all administrative requests.
 */

const HUB_TOKEN = import.meta.env?.VITE_HUB_ADMIN_TOKEN || '';

const apiRequest = async (url, options = {}) => {
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${HUB_TOKEN}`,
        ...options.headers
    };

    const response = await fetch(url, { ...options, headers });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(errorData.error || `Request failed with status ${response.status}`);
        error.status = response.status;
        error.details = errorData;
        error.conflict = errorData.conflict || errorData.conflicting_booking || null;
        throw error;
    }

    return response.json();
};

export const api = {
    get: (url, options) => apiRequest(url, { ...options, method: 'GET' }),
    post: (url, body, options) => apiRequest(url, { ...options, method: 'POST', body: JSON.stringify(body) }),
    put: (url, body, options) => apiRequest(url, { ...options, method: 'PUT', body: JSON.stringify(body) }),
    patch: (url, body, options) => apiRequest(url, { ...options, method: 'PATCH', body: JSON.stringify(body) }),
    delete: (url, options) => apiRequest(url, { ...options, method: 'DELETE' }),
    // raw multipart upload support
    upload: async (url, formData) => {
        const response = await fetch(url, {
            method: 'POST',
            body: formData,
            headers: {
                'Authorization': `Bearer ${HUB_TOKEN}`
            }
        });
        if (!response.ok) throw new Error('Upload failed');
        return response.json();
    }
};
