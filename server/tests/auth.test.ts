import { describe, expect, it } from "vitest";
import { api, createUser, prisma, signIn } from "./helpers.js";

describe("authentication", () => {
  it("signs in with a correct password and stores the session in the database", async () => {
    const user = await createUser("BORROWER");
    const res = await api()
      .post("/api/auth/login")
      .send({ email: user.email.toUpperCase(), password: user.password });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: user.email, role: "BORROWER" });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.headers["set-cookie"][0]).toMatch(/borrowbox_session=[a-f0-9]{64}; .*HttpOnly/);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
  });

  it("rejects a wrong password with 401", async () => {
    const user = await createUser("BORROWER");
    const res = await api()
      .post("/api/auth/login")
      .send({ email: user.email, password: "Wrong-Passw0rd!" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("returns the signed-in user from /api/auth/me and ends the session on logout", async () => {
    const { user, cookie } = await signIn("CUSTODIAN");

    const me = await api().get("/api/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ id: user.id, role: "CUSTODIAN" });

    const logout = await api().post("/api/auth/logout").set("Cookie", cookie);
    expect(logout.status).toBe(200);

    const after = await api().get("/api/auth/me").set("Cookie", cookie);
    expect(after.status).toBe(401);
  });

  it("accepts a Bearer token as well as the cookie", async () => {
    const user = await createUser("BORROWER");
    const login = await api()
      .post("/api/auth/login")
      .send({ email: user.email, password: user.password });
    const me = await api().get("/api/auth/me").set("Authorization", `Bearer ${login.body.token}`);
    expect(me.status).toBe(200);
  });

  it("blocks protected routes without a session", async () => {
    const res = await api().get("/api/items");
    expect(res.status).toBe(401);
  });
});
