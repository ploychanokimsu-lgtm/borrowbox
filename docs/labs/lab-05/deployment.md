# BorrowBox Deployment (Lab 5)

Status: first draft (Issue #2). Completed in later Lab 5 Issues.

## 1. Stack

| Layer | Choice |
|---|---|
| Client | React 18 + Vite, built into static files |
| Server | Node.js 24, Express 4, TypeScript |
| Database | PostgreSQL 16 with Prisma 5 (migrations in `server/prisma/migrations`) |
| Sessions | `Session` table in PostgreSQL (not server memory) |
| Uploaded files | None in Sprint 1 |

## 2. Cloud-readiness checklist (Student Guide 2.2)

- [x] Uploaded files are not saved in a local folder: Sprint 1 has no uploads.
- [x] The seed is safe for production: idempotent upserts, never resets an existing password; in production `ADMIN_PASSWORD` (and `DEMO_USER_PASSWORD` when demo data is on) must come from the environment, otherwise the seed stops.
- [x] No dev shortcuts in production: no user picker, no default password shown on the sign-in page; local default passwords are refused when `NODE_ENV=production`.
- [x] Sessions are stored in the database (`server/src/auth.ts`, `Session` model).
- [x] The server reads its port from `PORT` and listens on `0.0.0.0` (`server/src/index.ts`).
- [x] `/api/ready` returns 503 when the database cannot be reached (`server/src/app.ts`).

## 3. Environment variables

| Variable | Read by | Purpose | Secret? | Local value | Cloud value comes from |
|---|---|---|---|---|---|
| `DATABASE_URL` | server, Prisma, seed | PostgreSQL connection string | **Yes** | `server/.env` | Secret Manager `borrowbox-database-url` |
| `PORT` | server | Listening port | No | `3000` | Cloud Run (`--port 3000`) |
| `NODE_ENV` | server, seed | `production` turns on secure cookies and refuses default passwords | No | unset (development) | Cloud Run env var `production` |
| `CLIENT_ORIGIN` | server | Allowed CORS origins for a separate UI origin | No | unset (`http://localhost:5173`) | Not needed: UI and API share one origin |
| `ADMIN_PASSWORD` | seed | Password of the first custodian, set only when the account is created | **Yes** | optional | Secret Manager `borrowbox-admin-password` |
| `SEED_DEMO_DATA` | seed | Create demo accounts and sample items | No | default `true` | Migration job env var |
| `DEMO_USER_PASSWORD` | seed | Password of the demo accounts | **Yes** | optional | Secret Manager `borrowbox-demo-password` |
| `VITE_API_URL` | client (build time) | API base URL; empty means same origin | No | empty | empty (set in the Dockerfile) |

`server/.env.example` and `client/.env.example` list the same variables with
placeholder values only. `.env` is in `.gitignore`.
