import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_FILE = path.join(__dirname, '..', 'data', 'seed.json');

function dataDir() {
  return process.env.DATA_DIR || path.join(__dirname, '..', 'data');
}

function dbFile() {
  return path.join(dataDir(), 'db.json');
}

let db = null;

function load() {
  if (db) return db;
  if (fs.existsSync(dbFile())) {
    db = JSON.parse(fs.readFileSync(dbFile(), 'utf8'));
  } else {
    db = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
    flush();
  }
  return db;
}

function flush() {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(dbFile(), JSON.stringify(db, null, 2));
}

export function resetFromSeed() {
  db = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  flush();
}

export function listClients() {
  return load().clients;
}

export function getClient(id) {
  return load().clients.find((c) => c.id === id);
}

export function listInvoices({ status, clientId } = {}) {
  let invoices = load().invoices;
  if (status) invoices = invoices.filter((i) => i.status === status);
  if (clientId) invoices = invoices.filter((i) => i.clientId === clientId);
  return invoices;
}

export function getInvoice(id) {
  return load().invoices.find((i) => i.id === id);
}

export function createInvoice({ clientId, items, dueDate }) {
  const data = load();
  const client = data.clients.find((c) => c.id === clientId);
  if (!client) {
    throw Object.assign(new Error('client not found'), { statusCode: 404 });
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw Object.assign(new Error('at least one line item is required'), { statusCode: 400 });
  }
  for (const item of items) {
    if (!item.description || typeof item.quantity !== 'number' || typeof item.unitPrice !== 'number') {
      throw Object.assign(new Error('each item needs description, quantity and unitPrice'), { statusCode: 400 });
    }
    if (item.quantity <= 0 || item.unitPrice < 0) {
      throw Object.assign(new Error('quantity must be positive and unitPrice cannot be negative'), { statusCode: 400 });
    }
  }
  const total = round2(items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0));
  const invoice = {
    id: crypto.randomUUID(),
    number: nextInvoiceNumber(data),
    clientId,
    items,
    total,
    status: 'open',
    issuedAt: new Date().toISOString(),
    dueDate: dueDate || null,
    paidAt: null,
  };
  data.invoices.push(invoice);
  client.outstandingBalance = round2(client.outstandingBalance + total);
  flush();
  return invoice;
}

export function markInvoicePaid(id) {
  const data = load();
  const invoice = data.invoices.find((i) => i.id === id);
  if (!invoice) {
    throw Object.assign(new Error('invoice not found'), { statusCode: 404 });
  }
  if (invoice.status === 'paid') {
    throw Object.assign(new Error('invoice is already paid'), { statusCode: 409 });
  }
  invoice.status = 'paid';
  invoice.paidAt = new Date().toISOString();
  flush();
  return invoice;
}

function nextInvoiceNumber(data) {
  const max = data.invoices.reduce((m, i) => {
    const n = parseInt(i.number.replace('INV-', ''), 10);
    return Number.isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return `INV-${String(max + 1).padStart(4, '0')}`;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
