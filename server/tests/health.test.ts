import { describe, expect, it } from "vitest";
import { api } from "./helpers.js";

describe("health", () => {
  it("GET /api/health reports ok", async () => {
    const res = await api().get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("GET /api/ready reports that the database is connected", async () => {
    const res = await api().get("/api/ready");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ready", db: "connected" });
  });

  it("GET /api/version reports the commit from APP_COMMIT", async () => {
    const before = process.env.APP_COMMIT;
    process.env.APP_COMMIT = "0123456789abcdef0123456789abcdef01234567";
    try {
      const res = await api().get("/api/version");
      expect(res.status).toBe(200);
      expect(res.body.commit).toBe("0123456789abcdef0123456789abcdef01234567");
    } finally {
      if (before === undefined) delete process.env.APP_COMMIT;
      else process.env.APP_COMMIT = before;
    }
  });

  it("unknown API routes return a JSON 404", async () => {
    const res = await api().get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("GET /api/categories lists active categories without signing in", async () => {
    const res = await api().get("/api/categories");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
