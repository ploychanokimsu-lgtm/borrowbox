import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import type { UserRole } from "@prisma/client";
import { getPrisma } from "./prisma.js";

export const COOKIE_NAME = "borrowbox_session";
const SESSION_MS = 8 * 60 * 60 * 1000;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
}

declare module "express-serve-static-core" {
  interface Request {
    authUser?: AuthUser;
  }
}

export function fail(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// Accepts the session cookie (browser) or a Bearer token (smoke test / API clients).
function readToken(req: Request): string | null {
  const bearer = req.header("authorization");
  let token: string | undefined;
  if (bearer?.startsWith("Bearer ")) {
    token = bearer.slice(7).trim();
  } else {
    token = req.headers.cookie
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${COOKIE_NAME}=`))
      ?.slice(COOKIE_NAME.length + 1);
  }
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}

const cookieOptions = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: "lax" as const,
  path: "/api",
};

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = readToken(req);
    if (!token) return fail(res, 401, "UNAUTHENTICATED", "Sign in is required.");

    const session = await getPrisma().session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!session || session.expiresAt.getTime() <= Date.now() || !session.user.isActive) {
      res.clearCookie(COOKIE_NAME, cookieOptions);
      return fail(res, 401, "UNAUTHENTICATED", "Session expired. Sign in again.");
    }
    const { id, name, email, role } = session.user;
    req.authUser = { id, name, email, role };
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireRole(role: UserRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.authUser?.role !== role) {
      return fail(res, 403, "FORBIDDEN", `Only a ${role.toLowerCase()} can do this.`);
    }
    return next();
  };
}

export const authRouter = Router();

authRouter.post("/login", async (req, res, next) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!email || !password) {
      return fail(res, 400, "VALIDATION_ERROR", "Email and password are required.");
    }

    const user = await getPrisma().user.findUnique({ where: { email } });
    const ok = user && user.isActive && (await bcrypt.compare(password, user.passwordHash));
    if (!ok) return fail(res, 401, "INVALID_CREDENTIALS", "Email or password is incorrect.");

    const token = randomBytes(32).toString("hex");
    await getPrisma().session.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + SESSION_MS),
      },
    });
    res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: SESSION_MS });
    return res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    return next(error);
  }
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json(req.authUser);
});

authRouter.post("/logout", async (req, res, next) => {
  try {
    const token = readToken(req);
    if (token) {
      await getPrisma().session.deleteMany({ where: { tokenHash: hashToken(token) } });
    }
    res.clearCookie(COOKIE_NAME, cookieOptions);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});
