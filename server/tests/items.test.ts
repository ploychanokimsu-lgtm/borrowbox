import { describe, expect, it } from "vitest";
import { api, createItem, prisma, signIn, unique } from "./helpers.js";

describe("items", () => {
  it("lists items with their available quantity", async () => {
    const { cookie } = await signIn("BORROWER");
    const item = await createItem(4);

    const res = await api().get("/api/items").set("Cookie", cookie);
    expect(res.status).toBe(200);
    const listed = res.body.find((i: { id: number }) => i.id === item.id);
    expect(listed).toMatchObject({ totalQuantity: 4, availableQuantity: 4 });
  });

  it("lets a custodian add an item", async () => {
    const { cookie } = await signIn("CUSTODIAN");
    const category = await prisma.category.upsert({
      where: { name: "Test Category" },
      update: {},
      create: { name: "Test Category" },
    });
    const assetCode = unique("new").slice(0, 32);

    const res = await api()
      .post("/api/items")
      .set("Cookie", cookie)
      .send({ name: "Tripod", assetCode, categoryId: category.id, totalQuantity: 2 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "Tripod", assetCode: assetCode.toUpperCase(), availableQuantity: 2 });

    const duplicate = await api()
      .post("/api/items")
      .set("Cookie", cookie)
      .send({ name: "Tripod", assetCode, categoryId: category.id, totalQuantity: 1 });
    expect(duplicate.status).toBe(409);
  });

  it("rejects an item with an invalid quantity", async () => {
    const { cookie } = await signIn("CUSTODIAN");
    const res = await api()
      .post("/api/items")
      .set("Cookie", cookie)
      .send({ name: "Bad", assetCode: unique("bad").slice(0, 32), categoryId: 1, totalQuantity: 0 });
    expect(res.status).toBe(400);
  });

  it("does not let a borrower add items (access restriction)", async () => {
    const { cookie } = await signIn("BORROWER");
    const res = await api()
      .post("/api/items")
      .set("Cookie", cookie)
      .send({ name: "Sneaky", assetCode: "SNEAKY", categoryId: 1, totalQuantity: 1 });
    expect(res.status).toBe(403);
  });
});
