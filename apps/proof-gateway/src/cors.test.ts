import { describe, expect, it } from 'vitest';

import { corsPreflightResponse, withDevelopmentCors } from './cors.js';

describe('local dashboard CORS', () => {
  it('accepts the localhost Device API preflight without enabling credentials', () => {
    const request = new Request('https://gateway.example/auth/challenge', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:8792',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, Authorization, X-Proof-Job-Id',
      },
    });
    const response = corsPreflightResponse(request);
    expect(response?.status).toBe(204);
    expect(response?.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:8792');
    expect(response?.headers.get('Access-Control-Allow-Headers')).toBe(
      'authorization, content-type, x-proof-job-id',
    );
    expect(response?.headers.get('Access-Control-Allow-Credentials')).toBeNull();
    expect(response?.headers.get('Vary')).toBe('Origin');
  });

  it('adds the exact loopback origin to an actual response', () => {
    const request = new Request('https://gateway.example/api/v1/proof-jobs', {
      headers: { Origin: 'http://127.0.0.1:8792' },
    });
    const response = withDevelopmentCors(request, Response.json({ ok: true }));
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://127.0.0.1:8792');
    expect(response.headers.get('Vary')).toBe('Origin');
  });

  it('rejects public origins and unsupported request headers', () => {
    const publicOrigin = corsPreflightResponse(new Request('https://gateway.example/auth/session', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://attacker.example',
        'Access-Control-Request-Method': 'POST',
      },
    }));
    const unsupportedHeader = corsPreflightResponse(new Request('https://gateway.example/auth/session', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:8792',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'X-Device-Secret',
      },
    }));
    expect(publicOrigin?.status).toBe(403);
    expect(publicOrigin?.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(unsupportedHeader?.status).toBe(403);
  });
});
