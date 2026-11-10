export type Role = "BORROWER" | "CUSTODIAN";
export type LoanStatus = "REQUESTED" | "BORROWED" | "RETURNED" | "REJECTED";

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface Category {
  id: number;
  name: string;
}

export interface Item {
  id: number;
  assetCode: string;
  name: string;
  description: string | null;
  category: Category;
  totalQuantity: number;
  availableQuantity: number;
}

export interface Loan {
  id: number;
  quantity: number;
  purpose: string;
  dueDate: string;
  status: LoanStatus;
  decisionNote: string | null;
  requestedAt: string;
  returnedAt: string | null;
  item: { id: number; name: string; assetCode: string };
  borrower: { id: number; name: string; email: string };
}

// Empty by default: the UI calls the API on the same origin.
const BASE = import.meta.env.VITE_API_URL ?? "";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, body?.error?.message ?? `Request failed (${res.status}).`);
  }
  return body as T;
}

const post = <T>(path: string, data?: unknown) =>
  call<T>(path, { method: "POST", body: JSON.stringify(data ?? {}) });

export const api = {
  me: () => call<User>("/api/auth/me"),
  login: (email: string, password: string) =>
    post<{ user: User }>("/api/auth/login", { email, password }),
  logout: () => post<{ ok: true }>("/api/auth/logout"),
  categories: () => call<Category[]>("/api/categories"),
  items: () => call<Item[]>("/api/items"),
  createItem: (data: {
    name: string;
    assetCode: string;
    categoryId: number;
    totalQuantity: number;
    description?: string;
  }) => post<Item>("/api/items", data),
  loans: (status?: LoanStatus) =>
    call<Loan[]>(`/api/loans${status ? `?status=${status}` : ""}`),
  requestLoan: (data: { itemId: number; quantity: number; purpose: string; dueDate: string }) =>
    post<Loan>("/api/loans", data),
  decide: (id: number, action: "approve" | "reject" | "return", note?: string) =>
    post<Loan>(`/api/loans/${id}/${action}`, note ? { note } : {}),
};
