let clients = [];

// Wrap fetch so transient network hiccups don't surface as errors in the UI.
// Only GET requests are safe to auto-retry — retrying a POST/PATCH/DELETE after
// a client-side timeout risks resubmitting a request the server already received.
async function apiFetch(path, options = {}, attempt = 0) {
  const method = (options.method || 'GET').toUpperCase();
  try {
    const res = await fetch(path, { ...options, signal: AbortSignal.timeout(2000) });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed (${res.status})`);
    }
    return await res.json();
  } catch (err) {
    if (method === 'GET' && attempt < 2 && (err.name === 'TimeoutError' || err.name === 'TypeError')) {
      return apiFetch(path, options, attempt + 1);
    }
    throw err;
  }
}

function formatMoney(n) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function clientName(id) {
  const client = clients.find((c) => c.id === id);
  return client ? client.name : id;
}

async function loadDashboard() {
  const data = await apiFetch('/api/dashboard');
  document.getElementById('stat-outstanding').textContent = formatMoney(data.totalOutstanding);
  document.getElementById('stat-open').textContent = data.openInvoices;
  document.getElementById('stat-paid').textContent = data.paidInvoices;
  const tbody = document.querySelector('#clients-table tbody');
  tbody.innerHTML = '';
  for (const client of data.clients) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${client.name}</td><td class="num">${formatMoney(client.outstandingBalance)}</td>`;
    tbody.appendChild(tr);
  }
}

async function loadInvoices() {
  const status = document.getElementById('status-filter').value;
  const query = status ? `?status=${status}` : '';
  const invoices = await apiFetch(`/api/invoices${query}`);
  const tbody = document.querySelector('#invoices-table tbody');
  tbody.innerHTML = '';
  for (const invoice of invoices) {
    const tr = document.createElement('tr');
    const actions = [];
    if (invoice.status === 'open') {
      actions.push(`<button class="pay-btn" data-id="${invoice.id}">Mark paid</button>`);
      actions.push(`<button class="void-btn" data-id="${invoice.id}">Void</button>`);
    }
    const statusBadge = invoice.status === 'voided'
      ? `<span class="badge badge-voided" title="${invoice.voidReason || ''}">voided</span>`
      : `<span class="badge badge-${invoice.status}">${invoice.status}</span>`;
    tr.innerHTML = `
      <td>${invoice.number}</td>
      <td>${clientName(invoice.clientId)}</td>
      <td class="num">${formatMoney(invoice.total)}</td>
      <td>${statusBadge}</td>
      <td>${invoice.dueDate || '—'}</td>
      <td>${actions.join(' ')}</td>`;
    tbody.appendChild(tr);
  }
}

async function handleInvoiceSubmit(event) {
  event.preventDefault();
  const submitButton = event.target.querySelector('button[type="submit"]');
  if (submitButton.disabled) return; // already submitting, ignore duplicate clicks
  const payload = {
    clientId: document.getElementById('form-client').value,
    items: [
      {
        description: document.getElementById('form-description').value,
        quantity: Number(document.getElementById('form-quantity').value),
        unitPrice: Number(document.getElementById('form-unit-price').value),
      },
    ],
    dueDate: document.getElementById('form-due-date').value || null,
  };
  submitButton.disabled = true;
  try {
    await apiFetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    closeInvoiceModal();
    await Promise.all([loadInvoices(), loadDashboard()]);
    showTab('invoices');
  } catch (err) {
    alert(err.message);
  } finally {
    submitButton.disabled = false;
  }
}

function openInvoiceModal() {
  const select = document.getElementById('form-client');
  select.innerHTML = clients
    .map((c) => `<option value="${c.id}">${c.name}</option>`)
    .join('');
  document.getElementById('invoice-form').reset();
  document.getElementById('invoice-modal').classList.remove('hidden');
  document.getElementById('invoice-form').addEventListener('submit', handleInvoiceSubmit);
}

function closeInvoiceModal() {
  document.getElementById('invoice-modal').classList.add('hidden');
}

function showTab(name) {
  document.getElementById('dashboard-view').classList.toggle('hidden', name !== 'dashboard');
  document.getElementById('invoices-view').classList.toggle('hidden', name !== 'invoices');
  document.getElementById('tab-dashboard').classList.toggle('active', name === 'dashboard');
  document.getElementById('tab-invoices').classList.toggle('active', name === 'invoices');
}

async function init() {
  clients = await apiFetch('/api/clients');

  document.getElementById('tab-dashboard').addEventListener('click', () => {
    showTab('dashboard');
    loadDashboard();
  });
  document.getElementById('tab-invoices').addEventListener('click', () => {
    showTab('invoices');
    loadInvoices();
  });
  document.getElementById('new-invoice-btn').addEventListener('click', openInvoiceModal);
  document.getElementById('cancel-invoice-btn').addEventListener('click', closeInvoiceModal);
  document.getElementById('status-filter').addEventListener('change', loadInvoices);
  document.querySelector('#invoices-table tbody').addEventListener('click', async (event) => {
    const payButton = event.target.closest('.pay-btn');
    const voidButton = event.target.closest('.void-btn');
    if (payButton) {
      try {
        await apiFetch(`/api/invoices/${payButton.dataset.id}/pay`, { method: 'POST' });
        await Promise.all([loadInvoices(), loadDashboard()]);
      } catch (err) {
        alert(err.message);
      }
      return;
    }
    if (voidButton) {
      const reason = prompt('Reason for voiding this invoice:');
      if (reason === null) return;
      if (!reason.trim()) {
        alert('A reason is required to void an invoice.');
        return;
      }
      try {
        await apiFetch(`/api/invoices/${voidButton.dataset.id}/void`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
        });
        await Promise.all([loadInvoices(), loadDashboard()]);
      } catch (err) {
        alert(err.message);
      }
    }
  });

  await Promise.all([loadDashboard(), loadInvoices()]);
}

init();
