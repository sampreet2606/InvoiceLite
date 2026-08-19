import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let app;
let store;

beforeAll(async () => {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'invoicelite-dup-test-'));
  store = await import('../src/store.js');
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

beforeEach(() => {
  store.resetFromSeed();
});

describe('Ticket 3 investigation: server has no duplicate-submission protection', () => {
  // This is a known, documented residual risk (see NOTES.md) — not fixed here, since adding
  // server-side idempotency keys is a bigger design change than this ticket calls for. The
  // client-side fixes below remove the only realistic way this currently gets triggered.
  it('creates two separate invoices when the identical create request is submitted twice', async () => {
    const payload = {
      clientId: 'c-karta',
      items: [{ description: 'Rush job', quantity: 1, unitPrice: 500 }],
    };
    const resA = await request(app).post('/api/invoices').send(payload);
    const resB = await request(app).post('/api/invoices').send(payload);

    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
    expect(resA.body.id).not.toBe(resB.body.id);

    const invoices = store
      .listInvoices({ clientId: 'c-karta' })
      .filter((i) => i.items[0].description === 'Rush job');
    expect(invoices).toHaveLength(2);
  });
});

describe('Ticket 3 fix: apiFetch only retries safe (GET) requests', () => {
  // Mirrors public/app.js's apiFetch algorithm exactly (post-fix), using a mocked global.fetch
  // so we can deterministically simulate a client-side timeout without depending on real
  // network/server timing. Keep this in sync with public/app.js if that logic changes.
  async function simulateApiFetch(path, options = {}, attempt = 0) {
    const method = (options.method || 'GET').toUpperCase();
    try {
      const res = await fetch(path, options);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      return await res.json();
    } catch (err) {
      if (method === 'GET' && attempt < 2 && (err.name === 'TimeoutError' || err.name === 'TypeError')) {
        return simulateApiFetch(path, options, attempt + 1);
      }
      throw err;
    }
  }

  function stubFetchTimeoutThenSuccess(calls) {
    const timeoutError = Object.assign(new Error('The operation timed out.'), { name: 'TimeoutError' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, options) => {
        calls.push({ url, body: options.body });
        if (calls.length === 1) {
          // Simulate the first attempt exceeding the client's own 2s timeout, even though
          // (per the ticket's report) the server may still be processing/have processed it.
          throw timeoutError;
        }
        return new Response(JSON.stringify({ id: 'whatever', status: 'open' }), { status: 201 });
      })
    );
  }

  it('does NOT resend a POST request after a client-side timeout', async () => {
    const calls = [];
    stubFetchTimeoutThenSuccess(calls);

    await expect(
      simulateApiFetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: 'c-karta', items: [{ description: 'x', quantity: 1, unitPrice: 1 }] }),
      })
    ).rejects.toThrow();

    // Only one attempt was made — no silent resubmission of a non-idempotent request.
    expect(calls).toHaveLength(1);

    vi.unstubAllGlobals();
  });

  it('still retries a GET request after a client-side timeout (unchanged resilience behavior)', async () => {
    const calls = [];
    stubFetchTimeoutThenSuccess(calls);

    const result = await simulateApiFetch('/api/dashboard');

    expect(result).toEqual({ id: 'whatever', status: 'open' });
    expect(calls).toHaveLength(2);

    vi.unstubAllGlobals();
  });
});
