import { PrismaClient } from "@prisma/client";

// Lazy singleton: created on first use so routes that never touch the
// database (for example /api/health) have no database side effects.
let client: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!client) client = new PrismaClient();
  return client;
}
