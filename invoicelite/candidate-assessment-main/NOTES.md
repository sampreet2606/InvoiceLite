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
- With more time, I'd replace the denormalized `client.outstandingBalance` field with a value computed on demand from non-voided/unpaid invoices (or add a startup consistency check). A manually incremented/decremented running total is exactly the kind of field that silently drifts whenever a new code path forgets to update it — this ticket is one instance of that class of bug, and a computed value would remove the possibility entirely. I didn't do this now since it's a bigger change than the ticket calls for and there was no evidence of other drift beyond the reported case.

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

## Ticket 3 — Investigation: Occasional duplicate invoices

### Prompts used

**Prompt 1:**
> Let's move on to Ticket 3 now that Ticket 1 and 2 are done. Before jumping into code, analyze the problem properly — check whether any unit tests already cover this area, and if not, build them first so we know exactly what "correct" behavior looks like. Use those tests to pin down the exact issue. Explain the issue to me first; once I say go ahead, then fix it.

**Prompt 2:**
> Please go ahead and fix it.

### My understanding of the ticket

Support reported that some users end up with 2–3 identical invoices after clicking **Create** once. It's not reproducible on demand, which points toward a timing/race condition rather than a deterministic logic bug — so this ticket needed investigation and judgment, not just a one-line fix.

### Investigation

No tests existed for this scenario, so I wrote `test/duplicate-invoices.test.js` first to pin down concrete, provable mechanisms rather than guessing:

1. **Server has zero duplicate-submission protection.** Sending the identical `POST /api/invoices` payload twice back-to-back succeeds both times and creates two separate invoices with different IDs — deterministic and 100% reproducible. There's no idempotency key, debounce, or "was this just submitted" check anywhere in `store.js`/`app.js`.
2. **The client's own `apiFetch` retry logic resubmits non-idempotent requests.** I mirrored `apiFetch`'s exact retry algorithm from `public/app.js` in a test, using a mocked `fetch` to deterministically simulate a client-side timeout. Confirmed: when a request appears to time out (`TimeoutError`/`TypeError`), `apiFetch` silently re-fires **the identical POST body** — it doesn't distinguish safe-to-retry `GET`s from unsafe-to-retry `POST`s.
3. **No submit-guard in the UI.** `handleInvoiceSubmit` never disabled the Create button, so a double-click (or a slow UI thread) could fire a second real POST independent of any network issue.

Putting it together: under real-world conditions (slow network, brief server load, mobile hiccups), a `POST /api/invoices` can exceed the client's hardcoded 2-second timeout even though the server received and is processing it fine. `apiFetch` then assumes failure and resends the same request up to 2 more times, and the server — having no idea these are "the same" logical request — happily creates 2–3 real invoices. This matches every detail in the report: occasional, timing-dependent, and not reproducible on demand.

I checked one more suspect before ruling it out: `openInvoiceModal()` re-adds a `'submit'` listener on the form every time the modal opens, without ever removing the old one. This looked like a plausible "N listeners → N submits" bug, but since `handleInvoiceSubmit` is passed as the same stable function reference each time (not a new closure), the DOM spec dedupes identical `(type, listener, options)` registrations automatically — so this is **not** actually a bug in any real browser, and I left it alone.

### What I changed and why

- **`public/app.js`** — `apiFetch` now only auto-retries `GET` requests; `POST`/`PATCH`/`DELETE` are never silently resubmitted after a client-side timeout. This directly removes the retry-caused-duplicate mechanism while preserving the original resilience intent for read requests.
- **`public/app.js`** — `handleInvoiceSubmit` now disables the Create button for the duration of the request and ignores re-entrant submits while one is already in flight, closing the double-click window.
- **Judgment call — deliberately NOT fixed in code:** server-side idempotency keys (client generates a request ID, server persists and rejects duplicates). This would fully close the residual risk (something could still theoretically resend the exact request at the HTTP layer, e.g. a corporate proxy retry), but it's a bigger design change — new client-generated IDs, server-side dedup storage/expiry — than a focused ticket-level fix should include. I documented this as a "would improve with more time" item instead of implementing it now, since the two client-side fixes remove the only realistic way this bug is currently triggered.

### How I tested it

- Wrote `test/duplicate-invoices.test.js` first, with two failing/characterizing tests proving both mechanisms above, before touching any implementation code.
- After the fix, rewrote the client-retry test into a proper regression test asserting `apiFetch` makes exactly one attempt for a timed-out `POST` (no retry), and added a companion test proving `GET` retry behavior is unchanged/preserved.
- Kept the server-side "no idempotency guard" test as a documented, intentionally-still-failing-the-ideal-case test — it passes today (2 invoices created) precisely to document the residual risk called out above, not because it's desired behavior.
- Ran the full suite (`npm test`) after the fix — 25/25 passing, no regressions across all three tickets.
- Manually verified in the browser: rapid-clicked **Create** several times and confirmed only one invoice is created per logical submission.

### Things I noticed / was uncertain about

- I could not directly unit-test the real `public/app.js` `apiFetch` function (it's a classic, non-module `<script>`, so nothing is `export`ed and Node can't import it in isolation). I mirrored the algorithm verbatim in the test file instead and left a comment noting it must be kept in sync — a more robust long-term setup would convert `public/app.js` to an ES module (`<script type="module">`) so real production code could be imported and tested directly, but that felt like more refactoring than this ticket warranted.
- I'm intentionally leaving server-side idempotency protection out of scope for now (see above) — flagging this as the main thing I'd revisit with more time, especially if InvoiceLite is used over unreliable networks in production.
