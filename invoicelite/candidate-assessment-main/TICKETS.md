# Tickets

These are the three tickets handed to you by the previous engineer. They are also filed as GitHub issues on this repo — work from whichever you prefer.

---

## Ticket 1 — Bug: Dashboard outstanding balance doesn't update after a payment

**Reported by:** support

A user marked INV-0001 (Meridian Labs, $1,200) as paid, but the dashboard still shows Meridian's outstanding balance as $1,200 — even the next day, after multiple refreshes.

We think the 30-second dashboard cache in `app.js` isn't being invalidated when a payment comes in. It probably just needs to be cleared in the pay endpoint the same way the create endpoint does it.

Please fix, and add or update tests where useful.

> Note from the team: the ticket's suggested cause is a guess by support, not a diagnosis. Verify the root cause yourself before changing code.

---

## Ticket 2 — Feature: Void an invoice

**Reported by:** operations

Ops occasionally raises an invoice by mistake and currently has no way to take it back out of circulation. We need the ability to void an invoice:

- Voiding requires a **reason** (free text, required).
- A voided invoice must **not** count toward the client's outstanding balance or the dashboard totals.
- Voided invoices stay visible in the invoice list, clearly marked as voided, with the reason accessible.
- A **paid** invoice cannot be voided, and a **voided** invoice cannot be marked paid.

Follow the existing patterns in the codebase. Avoid unnecessary refactoring — existing behavior must keep working.

---

## Ticket 3 — Investigation: Occasional duplicate invoices

**Reported by:** support

> "A few users report that after clicking Create on a new invoice, they sometimes end up with two or even three identical copies in the list. It doesn't happen every time and we haven't been able to reproduce it on demand. Please investigate and fix if appropriate."

This is intentionally all the information we have. Investigate, determine the likely cause (there may be more than one contributing factor), and decide what should change. If you believe some part should *not* be fixed in code, say so in your notes and explain what you'd do instead.
