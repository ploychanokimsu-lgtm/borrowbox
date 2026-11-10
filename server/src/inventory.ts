import { Router } from "express";
import { LoanStatus, Prisma } from "@prisma/client";
import { fail, requireAuth, requireRole } from "./auth.js";
import { getPrisma } from "./prisma.js";

const MAX_LOAN_DAYS = 30;

type Tx = Prisma.TransactionClient;

/** Units of an item currently out on loan (approved but not yet returned). */
async function borrowedUnits(db: Tx, itemId: number): Promise<number> {
  const agg = await db.loan.aggregate({
    where: { itemId, status: LoanStatus.BORROWED },
    _sum: { quantity: true },
  });
  return agg._sum.quantity ?? 0;
}

function positiveInt(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : null;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
}

const loanInclude = {
  item: { select: { id: true, name: true, assetCode: true } },
  borrower: { select: { id: true, name: true, email: true } },
} as const;

// ------------------------------------------------------------------
// Categories (public: the smoke test reads this after every deploy)
// ------------------------------------------------------------------
export const categoriesRouter = Router();

categoriesRouter.get("/", async (_req, res, next) => {
  try {
    const categories = await getPrisma().category.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    res.json(categories);
  } catch (error) {
    next(error);
  }
});

// ------------------------------------------------------------------
// Items
// ------------------------------------------------------------------
export const itemsRouter = Router();
itemsRouter.use(requireAuth);

itemsRouter.get("/", async (_req, res, next) => {
  try {
    const db = getPrisma();
    const items = await db.item.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: { category: { select: { id: true, name: true } } },
    });
    const borrowed = await db.loan.groupBy({
      by: ["itemId"],
      where: { status: LoanStatus.BORROWED },
      _sum: { quantity: true },
    });
    const out = new Map(borrowed.map((b) => [b.itemId, b._sum.quantity ?? 0]));
    res.json(
      items.map((item) => ({
        id: item.id,
        assetCode: item.assetCode,
        name: item.name,
        description: item.description,
        category: item.category,
        totalQuantity: item.totalQuantity,
        availableQuantity: item.totalQuantity - (out.get(item.id) ?? 0),
      }))
    );
  } catch (error) {
    next(error);
  }
});

itemsRouter.post("/", requireRole("CUSTODIAN"), async (req, res, next) => {
  try {
    const name = text(req.body?.name, 120);
    const assetCode = text(req.body?.assetCode, 32)?.toUpperCase() ?? null;
    const categoryId = positiveInt(req.body?.categoryId);
    const totalQuantity = positiveInt(req.body?.totalQuantity);
    const description =
      req.body?.description === undefined || req.body?.description === ""
        ? null
        : text(req.body.description, 500);

    if (!name || !assetCode || !categoryId || !totalQuantity || totalQuantity > 1000) {
      return fail(
        res,
        400,
        "VALIDATION_ERROR",
        "Name, asset code, category and a quantity from 1 to 1000 are required."
      );
    }
    const db = getPrisma();
    const category = await db.category.findFirst({ where: { id: categoryId, isActive: true } });
    if (!category) return fail(res, 400, "VALIDATION_ERROR", "Category does not exist.");

    try {
      const item = await db.item.create({
        data: { name, assetCode, description, categoryId, totalQuantity, createdById: req.authUser!.id },
        include: { category: { select: { id: true, name: true } } },
      });
      return res.status(201).json({ ...item, availableQuantity: item.totalQuantity });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return fail(res, 409, "DUPLICATE_ASSET_CODE", "An item with this asset code already exists.");
      }
      throw error;
    }
  } catch (error) {
    return next(error);
  }
});

// ------------------------------------------------------------------
// Loans
// ------------------------------------------------------------------
export const loansRouter = Router();
loansRouter.use(requireAuth);

// Borrower: my loans. Custodian: every loan, optionally filtered by status.
loansRouter.get("/", async (req, res, next) => {
  try {
    const user = req.authUser!;
    const status =
      typeof req.query.status === "string" && req.query.status in LoanStatus
        ? (req.query.status as LoanStatus)
        : undefined;
    const loans = await getPrisma().loan.findMany({
      where: {
        ...(user.role === "BORROWER" ? { borrowerId: user.id } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
      include: loanInclude,
      take: 200,
    });
    res.json(loans);
  } catch (error) {
    next(error);
  }
});

loansRouter.post("/", requireRole("BORROWER"), async (req, res, next) => {
  try {
    const itemId = positiveInt(req.body?.itemId);
    const quantity = positiveInt(req.body?.quantity);
    const purpose = text(req.body?.purpose, 300);
    const dueDate = typeof req.body?.dueDate === "string" ? new Date(req.body.dueDate) : null;

    if (!itemId || !quantity || !purpose || !dueDate || Number.isNaN(dueDate.getTime())) {
      return fail(res, 400, "VALIDATION_ERROR", "Item, quantity, purpose and due date are required.");
    }
    const now = Date.now();
    if (dueDate.getTime() <= now || dueDate.getTime() > now + MAX_LOAN_DAYS * 86_400_000) {
      return fail(
        res,
        422,
        "INVALID_DUE_DATE",
        `Due date must be in the future and at most ${MAX_LOAN_DAYS} days from today.`
      );
    }

    const db = getPrisma();
    const item = await db.item.findFirst({ where: { id: itemId, isActive: true } });
    if (!item) return fail(res, 404, "ITEM_NOT_FOUND", "Item not found.");

    const available = item.totalQuantity - (await borrowedUnits(db, item.id));
    if (quantity > available) {
      return fail(
        res,
        409,
        "INSUFFICIENT_STOCK",
        `Only ${available} unit(s) of ${item.name} are available.`
      );
    }

    const loan = await db.loan.create({
      data: { itemId, borrowerId: req.authUser!.id, quantity, purpose, dueDate },
      include: loanInclude,
    });
    return res.status(201).json(loan);
  } catch (error) {
    return next(error);
  }
});

type Decision = "approve" | "reject" | "return";

const transitions: Record<Decision, { from: LoanStatus; to: LoanStatus }> = {
  approve: { from: LoanStatus.REQUESTED, to: LoanStatus.BORROWED },
  reject: { from: LoanStatus.REQUESTED, to: LoanStatus.REJECTED },
  return: { from: LoanStatus.BORROWED, to: LoanStatus.RETURNED },
};

for (const action of Object.keys(transitions) as Decision[]) {
  loansRouter.post(`/:id/${action}`, requireRole("CUSTODIAN"), async (req, res, next) => {
    try {
      const id = positiveInt(req.params.id);
      if (!id) return fail(res, 404, "LOAN_NOT_FOUND", "Loan not found.");
      const note =
        req.body?.note === undefined || req.body?.note === "" ? null : text(req.body.note, 300);
      const { from, to } = transitions[action];

      const result = await getPrisma().$transaction(
        async (tx) => {
          const loan = await tx.loan.findUnique({ where: { id }, include: { item: true } });
          if (!loan) return { error: [404, "LOAN_NOT_FOUND", "Loan not found."] as const };
          if (loan.status !== from) {
            return {
              error: [
                409,
                "INVALID_STATUS",
                `Cannot ${action} a loan that is ${loan.status.toLowerCase()}.`,
              ] as const,
            };
          }
          if (action === "approve") {
            const available = loan.item.totalQuantity - (await borrowedUnits(tx, loan.itemId));
            if (loan.quantity > available) {
              return {
                error: [
                  409,
                  "INSUFFICIENT_STOCK",
                  `Only ${available} unit(s) of ${loan.item.name} are available.`,
                ] as const,
              };
            }
          }
          const now = new Date();
          const updated = await tx.loan.update({
            where: { id },
            data: {
              status: to,
              ...(action === "return"
                ? { returnedAt: now }
                : { decidedAt: now, decidedById: req.authUser!.id, decisionNote: note }),
            },
            include: loanInclude,
          });
          return { loan: updated };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );

      if ("error" in result && result.error) {
        const [status, code, message] = result.error;
        return fail(res, status, code, message);
      }
      return res.json(result.loan!);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        return fail(res, 409, "CONFLICT", "Another change happened at the same time. Try again.");
      }
      return next(error);
    }
  });
}
