# InvoiceLite

A small invoicing app for freelancers and small teams. Express API + vanilla JS frontend, with a JSON file as the datastore (no external database needed).

## Requirements

- Node.js 20+

## Setup

```bash
npm install
npm start        # serves the app at http://localhost:4000
```

`npm run dev` runs with file watching.

The datastore lives at `data/db.json` and is created from `data/seed.json` on first run. Delete `data/db.json` to reset to seed data.

## Tests

```bash
npm test
```

Tests use Vitest + Supertest and run against a temporary datastore — they never touch `data/db.json`.

## Structure

```
src/
  server.js   # entry point
  app.js      # express app + routes
  store.js    # data access (JSON file store)
public/       # frontend (vanilla JS, no build step)
data/         # seed data + local datastore
test/         # API tests
```

## Your assignment

See [ASSIGNMENT.md](ASSIGNMENT.md) and the three tickets in [TICKETS.md](TICKETS.md) (also filed as GitHub issues on this repo).
