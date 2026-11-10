import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { authRouter } from "./auth.js";
import { categoriesRouter, itemsRouter, loansRouter } from "./inventory.js";
import { getPrisma } from "./prisma.js";

export const app = express();

const allowedOrigins = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: "100kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Which commit is running (APP_COMMIT is set in the image by deploy.yml).
app.get("/api/version", (_req, res) => {
  res.json({ commit: process.env.APP_COMMIT || "local" });
});

// Readiness: 503 when the database cannot be reached. The deploy smoke test
// calls this after every release.
app.get("/api/ready", async (_req, res) => {
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    res.json({ status: "ready", db: "connected" });
  } catch {
    res.status(503).json({ status: "not_ready", db: "disconnected" });
  }
});

app.use("/api/auth", authRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/items", itemsRouter);
app.use("/api/loans", loansRouter);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found." } });
});

// In the production container the built React app sits in /app/client/dist and
// is served by this server, so UI and API share one origin and one port.
const CLIENT_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");
if (existsSync(path.join(CLIENT_DIST, "index.html"))) {
  app.use(express.static(CLIENT_DIST, { index: false, maxAge: "1h" }));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(CLIENT_DIST, "index.html"));
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
});
