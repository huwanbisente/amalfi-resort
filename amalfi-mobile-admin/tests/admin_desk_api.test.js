import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../src/utils/api.js';

function okResponse(body = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => body
  };
}

function errorResponse(status, body = {}) {
  return {
    ok: false,
    status,
    json: async () => body
  };
}

describe('Admin Desk API client', () => {
  it('blocks requests when the Admin Desk token is missing', async () => {
    const fetchImpl = vi.fn();
    const api = createApiClient({ token: '', fetchImpl });

    await expect(api.get('/api/v1/admin/ledger')).rejects.toThrow('Admin Desk token is missing');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('attaches auth headers and JSON bodies to Hub requests', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({ saved: true }));
    const api = createApiClient({ token: 'desk-token', fetchImpl });

    await expect(api.post('/api/v1/admin/verify', { booking_ref: 'RES-1' })).resolves.toEqual({ saved: true });
    expect(fetchImpl).toHaveBeenCalledWith('/api/v1/admin/verify', {
      method: 'POST',
      body: JSON.stringify({ booking_ref: 'RES-1' }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer desk-token'
      }
    });
  });

  it('surfaces Hub JSON error messages and falls back to status text', async () => {
    const apiWithMessage = createApiClient({
      token: 'desk-token',
      fetchImpl: vi.fn().mockResolvedValue(errorResponse(400, { error: 'Bad booking' }))
    });
    await expect(apiWithMessage.patch('/broken', {})).rejects.toThrow('Bad booking');

    const apiWithStatus = createApiClient({
      token: 'desk-token',
      fetchImpl: vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => { throw new Error('not json'); }
      })
    });
    await expect(apiWithStatus.get('/offline')).rejects.toThrow('Request failed with status 502');
  });
});
