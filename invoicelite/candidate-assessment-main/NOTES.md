# NOTES.md

Notes on my approach, including the prompts used with my AI coding assistant and the reasoning behind each change.

---

## Ticket 1 — Dashboard outstanding balance doesn't update after a payment

### Prompts used

**Prompt 1:**
> Hi, First, explain the entire codebase, and then we’ll start working on the tickets one by one. Do not make any changes until the entire codebase has been explained and I explicitly ask you to start working on the tickets.You need to go through the entire candidate assessment, including `ASSIGNMENT.md`. Please read `ASSIGNMENT.md` before starting, as it contains the full instructions.After understanding the codebase and instructions, go through the three tickets described in `TICKETS.md`.Do not assume that the ticket’s suggested diagnosis is correct. Investigate the issues yourself and use your own judgment.


**Prompt 2:**
> Go through the files and do the necessary setup to run the project. (Followed up with the actual terminal errors encountered: `npm i` run from the wrong folder, `npm start` / `npm run dev` failing with "Missing script".)

**Prompt 3:**
> Let's start resolving the tickets one by one — let's focus on Ticket 1 first. Act as a senior developer: find the root cause, and tell me how I can reproduce the issue in the UI. Run the unit test cases to check whether the issue exists. If you find the issue, let me know, and only make code changes after my confirmation.

**Prompt 4:**
> Yes, fix it.

**Prompt 5 (after manual UI testing):**
> Since I already marked the invoice as paid before the fix was applied, the dashboard still shows $1,200 even though the invoice tab shows it as paid.

### My understanding of the ticket

Support reported that after marking `INV-0001` (Meridian Labs, $1,200) as paid, the dashboard kept showing Meridian's outstanding balance as $1,200 — even the next day, after multiple refreshes. The ticket guessed the cause was the 30-second dashboard cache in `app.js` not being cleared on payment.

### Investigation / root cause

Before changing anything, I:
1. Set up the project correctly (the initial `npm install`/`npm start` failures were caused by running the commands from the parent `invoicelite/` folder instead of `invoicelite/candidate-assessment-main/`, which is where `package.json` actually lives).
2. Ran the existing test suite as a baseline — all 10 tests passed, which confirmed the existing tests didn't cover the "pay an invoice, then check the dashboard" scenario at all.
3. Wrote a small, throwaway Node script (deleted afterward) that called `store.markInvoicePaid()` directly and recomputed the dashboard totals from a **brand-new** app instance with **no cache involved whatsoever**. Result: `client.outstandingBalance` for Meridian was still `1200` after payment, even with caching completely out of the picture.

This proved the ticket's guess was **wrong** (or at least incomplete): the real bug is in `src/store.js`. `markInvoicePaid()` only updates `invoice.status` and `invoice.paidAt` — it never adjusts `client.outstandingBalance`, which is a denormalized field that's only ever *incremented* (in `createInvoice()`) and never decremented anywhere. The dashboard's cache was showing a **correctly cached view of an already-incorrect number**.

There was a second, smaller bug too: `POST /api/invoices/:id/pay` in `src/app.js` never cleared `dashboardCache`, unlike the create route. This wouldn't explain a wrong value "even the next day," but it would add up to 30 seconds of extra staleness on top of the real bug.

### What I changed and why

1. **`src/store.js`** — `markInvoicePaid()` now decrements `client.outstandingBalance` by the invoice's total when the invoice transitions to `paid`. This fixes the actual root cause.
2. **`src/app.js`** — `POST /api/invoices/:id/pay` now also clears `dashboardCache` (matching the existing pattern in the create route), so the dashboard is guaranteed to reflect a payment immediately rather than waiting up to 30 seconds.
3. **Tests added:**
   - `test/dashboard.test.js` — asserts the dashboard reflects a payment immediately (cache primed first, then paid, then re-fetched), confirming both the balance fix and the cache-clear fix.
   - `test/invoices.test.js` — asserts the client's `outstandingBalance` drops by the exact invoice total after paying.

### How I tested it

- Ran `npm test` before the fix (baseline, 10/10 passing but scenario uncovered) and after (12/12 passing, including the 2 new tests).
- Reproduced the bug manually in the UI first: marked INV-0001 paid, confirmed the dashboard still showed $1,200 for Meridian.
- After the fix, manually re-verified in the browser: dashboard now shows $0 for Meridian immediately after marking the invoice paid, with no refresh delay.

### Things I noticed / was uncertain about

- My first manual UI test happened *before* the code fix was applied, so my local `data/db.json` had already persisted the incorrect state (invoice marked paid, balance never decremented). Since that file is a flat JSON snapshot, the code fix alone couldn't repair already-corrupted data on disk — I had to delete `data/db.json` so it would regenerate cleanly from `data/seed.json` (this only affects local dev data; the automated tests always run against an isolated temp `DATA_DIR` and were never affected).
- I decided to fix both the balance bug (root cause) and the missing cache invalidation (contributing/secondary issue) rather than just one, since the ticket explicitly asked to verify root cause but a caller could still see up to 30s of staleness from the cache bug alone in other scenarios.

---

## Ticket 2 — Void an invoice

### Prompt used

> Let's move on to Ticket 2 now that Ticket 1 is done. Before jumping into code, analyze the problem properly — check whether any unit tests already cover this area, and if not, build them first so we know exactly what "correct" behavior looks like. Use those tests to pin down the exact issue, and only then start fixing it.

### My understanding of the ticket

Unlike Ticket 1, this isn't a bug — it's a brand-new feature. Ops needs a way to void an invoice raised by mistake, with these rules:
- Voiding requires a non-empty reason.
- A voided invoice must stop counting toward the client's outstanding balance and the dashboard totals.
- Voided invoices stay visible in the invoice list, clearly marked, with the reason accessible.
- A paid invoice can't be voided; a voided invoice can't be marked paid.

### Investigation

I searched the codebase for any existing "void" logic or tests — there were none. So "the exact issue" here was simply that the feature didn't exist at all. Following a TDD-style approach, I wrote `test/void.test.js` first, covering every rule in the ticket (reason required, blank reason rejected, balance/dashboard exclusion, visibility in the list, guarding paid↔voided transitions in both directions, voiding twice, unknown invoice). I ran it against the unmodified code first — 9 of 10 failed (mostly 404s, since the route didn't exist), confirming the feature was genuinely missing before I wrote any implementation code.

### What I changed and why

- **`src/store.js`**:
  - Added `voidInvoice(id, reason)` — validates the reason is a non-empty string, rejects voiding an already-paid or already-voided invoice (409), otherwise decrements `client.outstandingBalance` by the invoice total (mirroring the pattern used in `markInvoicePaid`) and sets `status: 'voided'`, `voidedAt`, `voidReason`.
  - Added a guard in `markInvoicePaid()` so a voided invoice can't be marked paid (409).
  - Added `voidedAt: null` / `voidReason: null` defaults in `createInvoice()` for consistency with the existing `paidAt: null` pattern.
- **`src/app.js`**: added `POST /api/invoices/:id/void` following the same pattern as the existing `/pay` route (try/catch → `next(err)`, clears `dashboardCache` on success).
- **`public/app.js` / `index.html` / `styles.css`**: invoice rows now show a **Void** button alongside **Mark paid** for open invoices only; voided invoices get a distinct badge (strikethrough style) with the reason shown as a tooltip (`title` attribute); added a "Voided" option to the status filter dropdown so ops can filter down to just voided invoices. Reason capture uses a simple `window.prompt()` — consistent with the existing minimal, no-build-step frontend style (errors are already surfaced via `alert()`), rather than introducing a new modal component for a single text field.
- No changes to `openInvoices`/`paidInvoices` dashboard counting logic were needed — since those are computed by filtering on `status`, a `voided` invoice naturally falls out of both buckets automatically.

### How I tested it

- Wrote `test/void.test.js` (10 tests) before implementing, confirmed they failed against the unmodified code, then implemented until all 10 passed.
- Ran the full suite (`npm test`) — 22/22 passing, no regressions in Ticket 1's tests or the original suite.
- Manually verified in the browser: voided an open invoice, confirmed the badge/reason/tooltip, confirmed the dashboard's total outstanding and open count updated immediately, confirmed the pay/void buttons disappear once an invoice is voided, and confirmed voided invoices remain visible via the "Voided" filter.

### Things I noticed / was uncertain about

- The ticket doesn't say whether an already-voided invoice can be voided again. I treated a second void attempt as a 409 conflict, consistent with how `markInvoicePaid` already guards against double-paying — this felt like the safer, more consistent default.
- I used a native `prompt()` for capturing the void reason rather than building a new modal, to stay consistent with the app's existing "no build step, minimal UI" philosophy and avoid unnecessary refactoring. With more time/design input, a proper modal (matching the existing "New Invoice" modal) would be a nicer UX, especially for longer reasons.

---

