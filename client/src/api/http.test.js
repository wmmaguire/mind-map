import { apiRequest, ApiError, getApiErrorMessage, isNetworkError } from './http';

describe('apiRequest', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns JSON on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({ ok: true, files: [] }),
    });

    const data = await apiRequest('/api/files');
    expect(data.files).toEqual([]);
  });

  it('throws ApiError with server message on 4xx JSON body', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () =>
        JSON.stringify({ error: 'Bad', details: 'Missing field', code: 'X' }),
    });

    let err;
    try {
      await apiRequest('/api/x', { method: 'POST', json: {} });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toContain('Missing field');
    expect(err.status).toBe(400);
    expect(err.code).toBe('X');
  });

  it('maps fetch failure to ApiError with status 0', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(apiRequest('/api/files')).rejects.toThrow(ApiError);
    try {
      await apiRequest('/api/files');
    } catch (e) {
      expect(isNetworkError(e)).toBe(true);
      expect(getApiErrorMessage(e)).toMatch(/Cannot reach the API server/);
    }
  });
});
