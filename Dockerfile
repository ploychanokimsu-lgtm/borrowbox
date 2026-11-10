# ##############################################################################
# BorrowBox - production image (adapted from the CPE 334 Lab 5 starter kit)
# ##############################################################################
# One image holds the Express API and the built React app and serves both on
# port 3000. Cloud Run, CI and docker-compose.yml all build this file.
#
#   Stage 1  client-builder : builds the React app (Vite)
#   Stage 2  server-builder : compiles the API (TypeScript) and Prisma client
#   Stage 3  production     : runtime only, runs as the non-root `node` user
#
# No secret is baked into the image: DATABASE_URL and passwords are injected at
# run time (Secret Manager on Cloud Run, .env locally). prisma/ is copied into
# the runtime image because the migration job runs from this same image.
# ##############################################################################

# ---- Stage 1: client ---------------------------------------------------------
FROM node:24-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
# Empty API URL: the UI calls /api on its own origin (same container).
ENV VITE_API_URL=""
RUN npm run build

# ---- Stage 2: server ---------------------------------------------------------
FROM node:24-alpine AS server-builder
WORKDIR /app/server
# Prisma engines need openssl on alpine.
RUN apk add --no-cache openssl
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npx prisma generate && npm run build && npm prune --omit=dev

# ---- Stage 3: runtime --------------------------------------------------------
FROM node:24-alpine AS production
WORKDIR /app/server
RUN apk add --no-cache openssl

COPY --from=server-builder /app/server/package*.json ./
COPY --from=server-builder /app/server/node_modules ./node_modules
COPY --from=server-builder /app/server/dist ./dist
COPY --from=server-builder /app/server/prisma ./prisma
COPY --from=server-builder /app/server/docker-entrypoint.sh ./docker-entrypoint.sh
COPY --from=client-builder /app/client/dist /app/client/dist
RUN chmod +x ./docker-entrypoint.sh

ENV NODE_ENV=production
ENV TZ=Asia/Bangkok
# Commit this image was built from (deploy.yml passes the full SHA). Shown by
# GET /api/version and in the page footer so anyone can see what is running.
ARG GIT_SHA=local
ENV APP_COMMIT=${GIT_SHA}
# Must match `--port 3000` in deploy/deploy.sh.
ENV PORT=3000
EXPOSE 3000

USER node

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
