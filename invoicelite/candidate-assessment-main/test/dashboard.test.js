import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let store;
let createApp;

beforeAll(async () => {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'invoicelite-dash-test-'));
  store = await import('../src/store.js');
  ({ createApp } = await import('../src/app.js'));
});

beforeEach(() => {
  store.resetFromSeed();
});

describe('GET /api/dashboard', () => {
  it('sums outstanding balances across clients', async () => {
    const app = createApp();
    const res = await request(app).get('/api/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.totalOutstanding).toBe(1950.5);
    expect(res.body.openInvoices).toBe(3);
    expect(res.body.paidInvoices).toBe(2);
  });

  it('reflects newly created invoices', async () => {
    const app = createApp();
    await request(app)
      .post('/api/invoices')
      .send({
        clientId: 'c-karta',
        items: [{ description: 'Rush job', quantity: 1, unitPrice: 500 }],
      });
    const res = await request(app).get('/api/dashboard');
    expect(res.body.totalOutstanding).toBe(2450.5);
    expect(res.body.openInvoices).toBe(4);
  });

  it('reflects a payment immediately, even with the cache primed', async () => {
    const app = createApp();
    const before = await request(app).get('/api/dashboard');
    const meridianBefore = before.body.clients.find((c) => c.id === 'c-meridian');
    expect(meridianBefore.outstandingBalance).toBe(1200);

    await request(app).post('/api/invoices/inv-0001/pay');

    const after = await request(app).get('/api/dashboard');
    const meridianAfter = after.body.clients.find((c) => c.id === 'c-meridian');
    expect(meridianAfter.outstandingBalance).toBe(0);
  });
});
