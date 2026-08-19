import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let app;
let store;

beforeAll(async () => {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'invoicelite-void-test-'));
  store = await import('../src/store.js');
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

beforeEach(() => {
  store.resetFromSeed();
});

describe('POST /api/invoices/:id/void', () => {
  it('requires a non-empty reason', async () => {
    const res = await request(app).post('/api/invoices/inv-0003/void').send({});
    expect(res.status).toBe(400);
  });

  it('rejects a blank/whitespace-only reason', async () => {
    const res = await request(app).post('/api/invoices/inv-0003/void').send({ reason: '   ' });
    expect(res.status).toBe(400);
  });

  it('voids an open invoice and stores the reason', async () => {
    const res = await request(app)
      .post('/api/invoices/inv-0003/void')
      .send({ reason: 'raised by mistake' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('voided');
    expect(res.body.voidReason).toBe('raised by mistake');
    expect(res.body.voidedAt).toBeTruthy();
  });

  it('removes the invoice total from the client outstanding balance', async () => {
    expect(store.getClient('c-bluefern').outstandingBalance).toBe(750.5);
    await request(app).post('/api/invoices/inv-0003/void').send({ reason: 'mistake' });
    expect(store.getClient('c-bluefern').outstandingBalance).toBe(300);
  });

  it('excludes voided invoices from the dashboard totals', async () => {
    await request(app).post('/api/invoices/inv-0003/void').send({ reason: 'mistake' });
    const res = await request(app).get('/api/dashboard');
    expect(res.body.totalOutstanding).toBe(1500);
    expect(res.body.openInvoices).toBe(2);
  });

  it('keeps voided invoices visible in the invoice list', async () => {
    await request(app).post('/api/invoices/inv-0003/void').send({ reason: 'mistake' });
    const res = await request(app).get('/api/invoices');
    const voided = res.body.find((i) => i.id === 'inv-0003');
    expect(voided).toBeTruthy();
    expect(voided.status).toBe('voided');
    expect(voided.voidReason).toBe('mistake');
  });

  it('rejects voiding an already-paid invoice', async () => {
    const res = await request(app).post('/api/invoices/inv-0002/void').send({ reason: 'mistake' });
    expect(res.status).toBe(409);
  });

  it('rejects voiding an invoice that is already voided', async () => {
    await request(app).post('/api/invoices/inv-0003/void').send({ reason: 'mistake' });
    const res = await request(app).post('/api/invoices/inv-0003/void').send({ reason: 'again' });
    expect(res.status).toBe(409);
  });

  it('rejects voiding an unknown invoice', async () => {
    const res = await request(app).post('/api/invoices/nope/void').send({ reason: 'mistake' });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/invoices/:id/pay on a voided invoice', () => {
  it('rejects marking a voided invoice as paid', async () => {
    await request(app).post('/api/invoices/inv-0003/void').send({ reason: 'mistake' });
    const res = await request(app).post('/api/invoices/inv-0003/pay');
    expect(res.status).toBe(409);
  });
});
