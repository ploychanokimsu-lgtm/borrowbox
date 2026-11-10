#!/bin/sh
set -e

# Container entrypoint. It only hands control to CMD (`node dist/index.js`)
# with exec, so the app is PID 1 and receives SIGTERM from Cloud Run.
# Migrations do NOT run here: they run in the separate Cloud Run job
# borrowbox-migrate (and the `migrate` service in docker-compose.yml).
exec "$@"
