import { describe, expect, it } from "vitest";
import { api, createItem, daysFromNow, signIn } from "./helpers.js";

async function available(cookie: string, itemId: number) {
  const res = await api().get("/api/items").set("Cookie", cookie);
  return res.body.find((i: { id: number }) => i.id === itemId).availableQuantity as number;
}

function requestLoan(cookie: string, itemId: number, quantity: number, dueDate = daysFromNow(7)) {
  return api()
    .post("/api/loans")
    .set("Cookie", cookie)
    .send({ itemId, quantity, purpose: "Lab demo", dueDate });
}

describe("loan workflow", () => {
  it("request -> approve -> return updates availability", async () => {
    const borrower = await signIn("BORROWER");
    const custodian = await signIn("CUSTODIAN");
    const item = await createItem(3);

    const created = await requestLoan(borrower.cookie, item.id, 2);
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("REQUESTED");
    // A request alone does not reserve stock.
    expect(await available(borrower.cookie, item.id)).toBe(3);

    const approved = await api()
      .post(`/api/loans/${created.body.id}/approve`)
      .set("Cookie", custodian.cookie)
      .send({ note: "Pick up at room 1" });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("BORROWED");
    expect(await available(borrower.cookie, item.id)).toBe(1);

    const returned = await api()
      .post(`/api/loans/${created.body.id}/return`)
      .set("Cookie", custodian.cookie);
    expect(returned.status).toBe(200);
    expect(returned.body.status).toBe("RETURNED");
    expect(returned.body.returnedAt).toBeTruthy();
    expect(await available(borrower.cookie, item.id)).toBe(3);
  });

  it("rejects a request for more units than are available (business rule)", async () => {
    const borrower = await signIn("BORROWER");
    const item = await createItem(1);

    const res = await requestLoan(borrower.cookie, item.id, 2);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INSUFFICIENT_STOCK");
  });

  it("does not approve a request when stock ran out after it was made", async () => {
    const b1 = await signIn("BORROWER");
    const b2 = await signIn("BORROWER");
    const custodian = await signIn("CUSTODIAN");
    const item = await createItem(1);

    const first = await requestLoan(b1.cookie, item.id, 1);
    const second = await requestLoan(b2.cookie, item.id, 1);
    await api().post(`/api/loans/${first.body.id}/approve`).set("Cookie", custodian.cookie);

    const res = await api().post(`/api/loans/${second.body.id}/approve`).set("Cookie", custodian.cookie);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INSUFFICIENT_STOCK");
  });

  it("rejects due dates in the past or more than 30 days ahead", async () => {
    const borrower = await signIn("BORROWER");
    const item = await createItem(1);
    expect((await requestLoan(borrower.cookie, item.id, 1, daysFromNow(-1))).status).toBe(422);
    expect((await requestLoan(borrower.cookie, item.id, 1, daysFromNow(31))).status).toBe(422);
  });

  it("only lets a custodian approve, and only from REQUESTED", async () => {
    const borrower = await signIn("BORROWER");
    const custodian = await signIn("CUSTODIAN");
    const item = await createItem(2);
    const loan = await requestLoan(borrower.cookie, item.id, 1);

    const self = await api().post(`/api/loans/${loan.body.id}/approve`).set("Cookie", borrower.cookie);
    expect(self.status).toBe(403);

    const rejected = await api()
      .post(`/api/loans/${loan.body.id}/reject`)
      .set("Cookie", custodian.cookie)
      .send({ note: "Not for personal use" });
    expect(rejected.body.status).toBe("REJECTED");

    const again = await api().post(`/api/loans/${loan.body.id}/approve`).set("Cookie", custodian.cookie);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("INVALID_STATUS");
  });

  it("shows borrowers only their own loans; custodians see all", async () => {
    const b1 = await signIn("BORROWER");
    const b2 = await signIn("BORROWER");
    const custodian = await signIn("CUSTODIAN");
    const item = await createItem(5);
    const mine = await requestLoan(b1.cookie, item.id, 1);
    const theirs = await requestLoan(b2.cookie, item.id, 1);

    const b1List = await api().get("/api/loans").set("Cookie", b1.cookie);
    const ids = b1List.body.map((l: { id: number }) => l.id);
    expect(ids).toContain(mine.body.id);
    expect(ids).not.toContain(theirs.body.id);

    const all = await api().get("/api/loans?status=REQUESTED").set("Cookie", custodian.cookie);
    const allIds = all.body.map((l: { id: number }) => l.id);
    expect(allIds).toEqual(expect.arrayContaining([mine.body.id, theirs.body.id]));
  });

  it("does not let a custodian create a loan request", async () => {
    const custodian = await signIn("CUSTODIAN");
    const item = await createItem(1);
    expect((await requestLoan(custodian.cookie, item.id, 1)).status).toBe(403);
  });
});
