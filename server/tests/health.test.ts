import { describe, expect, it } from "vitest";
import { api } from "./helpers.js";

describe("health", () => {
  it("GET /api/health reports ok", async () => {
    const res = await api().get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
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
