# BorrowBox: Inventory and Borrowing System

CPE 334 Group Project, Team 2, Theme 2 (Inventory and Borrowing System).

BorrowBox lets a department lend shared equipment. **Borrowers** browse the
catalogue and request items; **Custodians** approve or reject requests, record
returns, and add items. The available quantity of an item is its total quantity
minus the units that are currently out on loan.

## Sprint 1 scope

| Role | What they can do |
|---|---|
| Borrower | Sign in, browse the catalogue with live availability, request a loan (quantity, purpose, due date), see own loans and their status |
| Custodian | Sign in, see pending requests and approve or reject them, mark loans returned, add items, see loan history |

Business rules:

- A borrower cannot request more units than are available (`409 INSUFFICIENT_STOCK`).
- Approval checks stock again, so two requests cannot both take the last unit.
- The due date must be in the future and at most 30 days ahead (`422 INVALID_DUE_DATE`).
- Only custodians can approve, reject, return, or add items (`403 FORBIDDEN`).
- Status moves only `REQUESTED -> BORROWED -> RETURNED` or `REQUESTED -> REJECTED`.

## Stack

React 18 + Vite (client), Express 4 + TypeScript (server), PostgreSQL 16 with
Prisma 5. Sessions are stored in the database. Tests use Vitest and Supertest.

## Run locally

Requirements: Node.js 24 and PostgreSQL 16 (or Docker).

```bash
# 1. Database (any PostgreSQL 16 works; this one uses Docker)
docker run -d --name borrowbox-db -e POSTGRES_USER=borrowbox \
  -e POSTGRES_PASSWORD=borrowbox -e POSTGRES_DB=borrowbox -p 5432:5432 postgres:16-alpine

# 2. API on http://localhost:3000
cd server
cp .env.example .env
npm install
npx prisma migrate deploy
npm run prisma:seed
npm run dev

# 3. Web app on http://localhost:5173 (proxies /api to :3000)
cd ../client
npm install
npm run dev
```

## Tests

```bash
cd server && npm test   # needs DATABASE_URL pointing at a migrated database
cd client && npm test
```

## Docker and deployment (Lab 5)

```bash
cp .env.example .env      # replace every change-me value
docker compose up --build # http://localhost:3000
```

Cloud Run deployment, environment variables, GCP resources and the release
procedure: [docs/labs/lab-05/deployment.md](docs/labs/lab-05/deployment.md).
