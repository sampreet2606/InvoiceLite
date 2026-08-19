import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let app;
let store;

beforeAll(async () => {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'invoicelite-test-'));
  store = await import('../src/store.js');
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

beforeEach(() => {
  store.resetFromSeed();
});

describe('GET /api/invoices', () => {
  it('returns all seeded invoices', async () => {
    const res = await request(app).get('/api/invoices');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(5);
  });

  it('filters by status', async () => {
    const res = await request(app).get('/api/invoices?status=open');
    expect(res.status).toBe(200);
    expect(res.body.every((i) => i.status === 'open')).toBe(true);
    expect(res.body).toHaveLength(3);
  });

  it('filters by client', async () => {
    const res = await request(app).get('/api/invoices?clientId=c-meridian');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});

describe('POST /api/invoices', () => {
  it('creates an invoice with a computed total and sequential number', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .send({
        clientId: 'c-karta',
        items: [{ description: 'Support retainer', quantity: 3, unitPrice: 150.25 }],
        dueDate: '2026-09-30',
      });
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(450.75);
    expect(res.body.number).toBe('INV-0006');
    expect(res.body.status).toBe('open');
  });

  it('rejects an unknown client', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .send({ clientId: 'nope', items: [{ description: 'x', quantity: 1, unitPrice: 1 }] });
    expect(res.status).toBe(404);
  });

  it('rejects empty line items', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .send({ clientId: 'c-karta', items: [] });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/invoices/:id/pay', () => {
  it('marks an open invoice as paid', async () => {
    const res = await request(app).post('/api/invoices/inv-0001/pay');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('paid');
    expect(res.body.paidAt).toBeTruthy();
  });

  it('rejects paying an already-paid invoice', async () => {
    const res = await request(app).post('/api/invoices/inv-0002/pay');
    expect(res.status).toBe(409);
  });
});
