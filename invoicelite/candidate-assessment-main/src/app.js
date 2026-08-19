import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as store from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Dashboard aggregates get requested on every page focus, so keep a short-lived
// cache to avoid recomputing on each hit.
const DASHBOARD_CACHE_MS = 30_000;

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  let dashboardCache = null;
  let dashboardCachedAt = 0;

  app.get('/api/clients', (req, res) => {
    res.json(store.listClients());
  });

  app.get('/api/invoices', (req, res) => {
    const { status, clientId } = req.query;
    res.json(store.listInvoices({ status, clientId }));
  });

  app.get('/api/invoices/:id', (req, res, next) => {
    const invoice = store.getInvoice(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'invoice not found' });
    res.json(invoice);
  });

  app.post('/api/invoices', (req, res, next) => {
    try {
      const { clientId, items, dueDate } = req.body;
      const invoice = store.createInvoice({ clientId, items, dueDate });
      dashboardCache = null;
      res.status(201).json(invoice);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/invoices/:id/pay', (req, res, next) => {
    try {
      const invoice = store.markInvoicePaid(req.params.id);
      res.json(invoice);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/dashboard', (req, res) => {
    const now = Date.now();
    if (dashboardCache && now - dashboardCachedAt < DASHBOARD_CACHE_MS) {
      return res.json(dashboardCache);
    }
    const clients = store.listClients();
    const invoices = store.listInvoices();
    const payload = {
      totalOutstanding: round2(clients.reduce((sum, c) => sum + c.outstandingBalance, 0)),
      openInvoices: invoices.filter((i) => i.status === 'open').length,
      paidInvoices: invoices.filter((i) => i.status === 'paid').length,
      clients: clients.map((c) => ({
        id: c.id,
        name: c.name,
        outstandingBalance: c.outstandingBalance,
      })),
    };
    dashboardCache = payload;
    dashboardCachedAt = now;
    res.json(payload);
  });

  app.use((err, req, res, next) => {
    res.status(err.statusCode || 500).json({ error: err.message });
  });

  return app;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
