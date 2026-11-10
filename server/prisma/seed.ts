// Idempotent seed: safe to run on every deploy. It never deletes data and
// never resets a password that already exists.
import bcrypt from "bcryptjs";
import { PrismaClient, type UserRole } from "@prisma/client";

const prisma = new PrismaClient();

const CATEGORIES = ["Audio", "Camera", "Computer", "Lab Equipment", "Projector"];

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "LocalCustodian1!";
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD ?? "LocalDemo1!";
const SEED_DEMO = (process.env.SEED_DEMO_DATA ?? "true") === "true";

async function ensureUser(email: string, name: string, role: UserRole, password: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  return prisma.user.create({
    data: { email, name, role, passwordHash: await bcrypt.hash(password, 12) },
  });
}

async function main() {
  for (const name of CATEGORIES) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
  }

  // First custodian (the "administrator" of the inventory).
  const custodian = await ensureUser(
    "custodian@borrowbox.example",
    "Head Custodian",
    "CUSTODIAN",
    ADMIN_PASSWORD
  );

  if (SEED_DEMO) {
    await ensureUser("custodian2@borrowbox.example", "Demo Custodian", "CUSTODIAN", DEMO_PASSWORD);
    await ensureUser("borrower1@borrowbox.example", "Demo Borrower One", "BORROWER", DEMO_PASSWORD);
    await ensureUser("borrower2@borrowbox.example", "Demo Borrower Two", "BORROWER", DEMO_PASSWORD);

    const byName = new Map(
      (await prisma.category.findMany()).map((c) => [c.name, c.id] as const)
    );
    const items = [
      { assetCode: "CAM-001", name: "Canon EOS R50 Camera", category: "Camera", qty: 3 },
      { assetCode: "PRJ-001", name: "Epson Portable Projector", category: "Projector", qty: 2 },
      { assetCode: "AUD-001", name: "Wireless Microphone Set", category: "Audio", qty: 4 },
      { assetCode: "CMP-001", name: "Dell Latitude Laptop", category: "Computer", qty: 5 },
      { assetCode: "LAB-001", name: "Digital Multimeter", category: "Lab Equipment", qty: 10 },
    ];
    for (const item of items) {
      await prisma.item.upsert({
        where: { assetCode: item.assetCode },
        update: {},
        create: {
          assetCode: item.assetCode,
          name: item.name,
          categoryId: byName.get(item.category)!,
          totalQuantity: item.qty,
          createdById: custodian.id,
        },
      });
    }
  }

  console.log(`Seed complete (demo data: ${SEED_DEMO ? "on" : "off"}).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
