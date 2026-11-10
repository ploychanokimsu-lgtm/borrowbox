# BorrowBox Deployment (Lab 5)

BorrowBox (CPE 334 Team 2, theme 2: Inventory and Borrowing System) runs as one
container on Google Cloud Run with Cloud SQL for PostgreSQL. Every Pull Request
runs CI, and every merge into `main` is a release that GitHub Actions deploys.

Fill in the values marked `<...>` once the GCP project exists. They are not
secrets, but **never** paste a password, `DATABASE_URL`, or key into this file.

| Item | Value |
|---|---|
| Repository | https://github.com/ploychanokimsu-lgtm/borrowbox |
| GCP project ID | `<PROJECT_ID>` (for example `cpe334-sec<N>-team02`) |
| Region | `asia-southeast1` (Singapore) |
| Public URL | `<https://borrowbox-....a.run.app>` |

## 1. Stack and changes from the reference

We use the reference stack from the Lab 5 Starter Kit: Artifact Registry,
Cloud Run, Cloud SQL for PostgreSQL 16, Secret Manager, and GitHub Actions with
Workload Identity Federation. App: React 18 + Vite, Express 4 + TypeScript,
Prisma 5, Node.js 24.

| Change from the kit | Why |
|---|---|
| All resource names use `borrowbox` instead of `toktickit` | Our app name |
| `docker-compose.yml` runs the **root production image** (`db`, `migrate`, `app`) instead of separate `server/` and `client/` images with nginx | The local run tests exactly the image Cloud Run runs (C-03), with fewer files to maintain |
| Compose reads passwords from the root `.env` and refuses to start without them | No password in a committed file |
| Image built with `--build-arg GIT_SHA=<commit>`; the app exposes `GET /api/version` and shows the short commit in the page footer | Anyone can see which commit is running (R-08) |
| `deploy/smoke_test.py` also checks that `/api/version` equals the deployed commit (`EXPECTED_COMMIT`) | The pipeline fails if the service is not running the release it just deployed |
| CI runs on Pull Requests into `staging` **and** `main`, and also runs `npm run build` for the server | Every change is checked before it is merged into `staging` |
| `.gitattributes` forces LF line endings | Scripts written on Windows still run in Linux containers |

## 2. Environment variables

| Variable | Read by | Purpose | Secret? | Local value | Cloud value comes from |
|---|---|---|---|---|---|
| `DATABASE_URL` | server, Prisma, seed | PostgreSQL connection string | **Yes** | `server/.env` | Secret Manager `borrowbox-database-url` |
| `PORT` | server | Listening port | No | `3000` | Cloud Run (`--port 3000`) |
| `NODE_ENV` | server, seed | `production`: secure cookies, no default passwords, demo data off by default | No | unset | Dockerfile / Cloud Run env `production` |
| `TZ` | server | Time zone | No | system | Dockerfile `Asia/Bangkok` |
| `CLIENT_ORIGIN` | server | Allowed CORS origins when the UI runs on another origin | No | unset (`http://localhost:5173`) | Not needed (same origin) |
| `APP_COMMIT` | server | Commit reported by `/api/version` | No | unset (`local`) | Docker build arg `GIT_SHA` = full commit SHA |
| `ADMIN_PASSWORD` | seed | Password for the first custodian `custodian@borrowbox.example`, used only when the account is created | **Yes** | optional | Secret Manager `borrowbox-admin-password` |
| `SEED_DEMO_DATA` | seed | Create demo accounts and sample items | No | default `true` | `true` on the migration job (`deploy.sh --demo`) for Lab 6 UAT |
| `DEMO_USER_PASSWORD` | seed | Password for `borrower1@`, `borrower2@`, `custodian2@borrowbox.example` | **Yes** | optional | Secret Manager `borrowbox-demo-password` |
| `VITE_API_URL` | client build | API base URL; empty = same origin | No | empty | empty (Dockerfile) |
| `POSTGRES_USER`, `POSTGRES_DB`, `POSTGRES_PASSWORD`, `APP_PORT` | docker compose | Local database and host port | `POSTGRES_PASSWORD` yes | root `.env` | Not used in the cloud |

GitHub settings used by `deploy.yml` (environment **`demo`**, deployable only from `main`):

| Name | Kind | Value |
|---|---|---|
| `GCP_PROJECT_ID` | variable | `<PROJECT_ID>` |
| `GCP_REGION` | variable | `asia-southeast1` |
| `WIF_PROVIDER` | variable | `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github-actions/providers/github-main` |
| `WIF_SERVICE_ACCOUNT` | variable | `borrowbox-deployer@<PROJECT_ID>.iam.gserviceaccount.com` |
| `SMOKE_EMAIL` | variable (optional) | `borrower2@borrowbox.example` (a demo borrower, never the custodian admin) |
| `SMOKE_PASSWORD` | **secret** (optional) | the demo password |

`server/.env.example`, `client/.env.example` and the root `.env.example` list
every variable with placeholders only. `.env` is in `.gitignore`.

## 3. Commands

```bash
# Run the production image locally with PostgreSQL (C-03)
cp .env.example .env            # replace every change-me value
docker compose up --build       # http://localhost:3000 (APP_PORT)
docker compose restart app      # data and sessions survive (they live in PostgreSQL)
docker compose down             # keeps the postgres_data volume; add -v to wipe it

# Development without Docker for the app
cd server && cp .env.example .env && npm ci
npx prisma migrate deploy       # migrate
npm run prisma:seed             # seed (idempotent)
npm run dev                     # API on :3000
cd ../client && npm ci && npm run dev   # UI on :5173, proxies /api

# Tests (the same commands CI runs)
cd server && npm test && npm run build  # needs DATABASE_URL to a migrated test database
cd client && npm test && npm run build
bash deploy/tests/test_deploy_stub.sh && bash deploy/tests/test_release_stub.sh
python3 -m unittest discover -s deploy/tests -p 'test_smoke.py'
docker build -t borrowbox:dev .
```

New migrations: `cd server && npx prisma migrate dev --name <change>`. Keep
them **additive** (new tables or nullable columns) so an older image still
works after a rollback.

## 4. GCP resources

Created once by `deploy/deploy.sh --demo` from Cloud Shell (Student Guide Episode 5),
plus the deployer account and Workload Identity Federation (Episode 6).

| Resource | Name | Notes |
|---|---|---|
| Artifact Registry (Docker) | `borrowbox` | one image per commit: `asia-southeast1-docker.pkg.dev/<PROJECT_ID>/borrowbox/borrowbox:<sha>` |
| Cloud SQL for PostgreSQL 16 | instance `borrowbox-pg`, database `borrowbox`, user `borrowbox` | `db-f1-micro`, Enterprise edition, 10 GB, daily backup 03:00 |
| Cloud Run service | `borrowbox` | public, port 3000, min 0 / max 3 instances, 512 Mi |
| Cloud Run job | `borrowbox-migrate` | `prisma migrate deploy && npm run prisma:seed` from the same image |
| Secret Manager | `borrowbox-database-url`, `borrowbox-admin-password`, `borrowbox-demo-password` | runtime account has access to these three only |
| Service account (runtime) | `borrowbox-runner` | `roles/cloudsql.client` + per-secret `secretAccessor` |
| Service account (deploy) | `borrowbox-deployer` | used by GitHub Actions through WIF, no JSON key |
| Workload Identity pool/provider | `github-actions` / `github-main` | restricted to this repository and environment `demo` |
| Budget | alerts-only budget on the billing account | created before any resource |

## 5. Release procedure

1. Open an Issue (label `lab5`), create a branch from `staging` named
   `<type>/<issue>-<topic>`.
2. Push and open a Pull Request into `staging`. CI (`CI & Docker Build /
   test-and-docker`) must pass. The **other** team member reviews and writes a
   specific check, question or finding, then approves; the author merges.
3. Open a release Pull Request `staging -> main` titled `Release: <summary>`.
   CI runs again; the ruleset `protect-main` blocks the merge unless
   `test-and-docker` passes, the branch is up to date, and one approval exists.
4. Merging into `main` starts **Deploy demo** (`.github/workflows/deploy.yml`):
   CI again -> build and push image tagged with the full commit SHA -> run
   `borrowbox-migrate` -> update the `borrowbox` service by image digest ->
   smoke test (health, readiness, HTML, categories, running commit, optional sign-in).
5. Check the run summary (commit tag, digest, URL), then open the URL.

### How to find the commit that is running

Any one of these:

- The page footer shows `Release <short sha>`; `GET <URL>/api/version` returns the full SHA.
- Actions -> Deploy demo -> latest run -> summary lists the commit tag and digest.
- Console -> Cloud Run -> `borrowbox` -> Revisions: the serving revision's image
  ends with `@sha256:...`; Artifact Registry shows that digest tagged with the commit SHA.
- `gcloud run services describe borrowbox --region asia-southeast1 --format='value(spec.template.spec.containers[0].image)'`

### Rollback and roll forward

Actions -> Deploy demo -> Run workflow on `main`, enter the full 40-character
SHA of an earlier good release in `image_tag`. Tests, build and migration are
skipped; the service points back at that image and the smoke test checks that
commit. To roll forward, run the workflow again with the newer SHA (or empty to
redeploy the current `main`). The database is not rolled back.

## 6. Cost control

- Alerts-only budget created first; Cloud Run min instances 0, max 3.
- Cloud SQL is billed every hour it exists. Pause when idle:
  `gcloud sql instances patch borrowbox-pg --activation-policy=NEVER` and resume with
  `--activation-policy=ALWAYS` (keep it running during grading and Lab 6 UAT).
- After the course: `DRY_RUN=1 bash deploy/teardown.sh`, read it, then run it without `DRY_RUN`.

## 7. Secrets checklist

- No `.env`, password, connection string or key in the repository, image, logs or report.
- GitHub secret scanning and push protection are on (Settings -> Code security).
- If a secret leaks: change it where it is used (for example `gcloud sql users set-password`),
  add a new Secret Manager version, redeploy, and tell a TA.
