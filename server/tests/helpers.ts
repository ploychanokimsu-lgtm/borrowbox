import bcrypt from "bcryptjs";
import request from "supertest";
import type { UserRole } from "@prisma/client";
import { app } from "../src/app.js";
import { getPrisma } from "../src/prisma.js";

export const prisma = getPrisma();
export const api = () => request(app);

const PASSWORD = "TestOnly-Passw0rd!";
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let counter = 0;

export function unique(prefix: string) {
  counter += 1;
  return `${prefix}-${run}-${counter}`;
}

export async function createUser(role: UserRole) {
  const email = `${unique(role.toLowerCase())}@test.borrowbox.example`;
  const user = await prisma.user.create({
    data: { email, name: `Test ${role}`, role, passwordHash: await bcrypt.hash(PASSWORD, 4) },
  });
  return { ...user, password: PASSWORD };
}

/** Signs in through the real API and returns the Cookie header value. */
export async function signIn(role: UserRole) {
  const user = await createUser(role);
  const res = await api().post("/api/auth/login").send({ email: user.email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`Login failed: ${res.status}`);
  const cookie = (res.headers["set-cookie"] as unknown as string[])[0].split(";")[0];
  return { user, cookie };
}

export async function createItem(totalQuantity: number) {
  const category = await prisma.category.upsert({
    where: { name: "Test Category" },
    update: {},
    create: { name: "Test Category" },
  });
  return prisma.item.create({
    data: {
      assetCode: unique("T").toUpperCase().slice(0, 32),
      name: unique("Test item"),
      categoryId: category.id,
      totalQuantity,
    },
  });
}

export function daysFromNow(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}
