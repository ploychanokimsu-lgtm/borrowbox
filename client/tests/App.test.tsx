import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App, ReleaseFooter } from "../src/App";

type Route = (url: string, init?: RequestInit) => { status: number; body: unknown } | undefined;

function mockFetch(route: Route) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const hit = route(url, init) ?? { status: 404, body: { error: { message: "not mocked" } } };
    return new Response(JSON.stringify(hit.body), { status: hit.status });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const camera = {
  id: 1,
  assetCode: "CAM-001",
  name: "Canon EOS R50 Camera",
  description: null,
  category: { id: 2, name: "Camera" },
  totalQuantity: 3,
  availableQuantity: 0,
};
const mic = { ...camera, id: 2, assetCode: "AUD-001", name: "Wireless Microphone Set", availableQuantity: 4 };

afterEach(() => vi.unstubAllGlobals());

describe("App", () => {
  it("shows the sign-in form when there is no session", async () => {
    mockFetch((url) => (url.endsWith("/api/auth/me") ? { status: 401, body: {} } : undefined));
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByText(/password:/i)).not.toBeInTheDocument();
  });

  it("shows the server's error message when sign-in fails", async () => {
    mockFetch((url) => {
      if (url.endsWith("/api/auth/me")) return { status: 401, body: {} };
      if (url.endsWith("/api/auth/login"))
        return { status: 401, body: { error: { message: "Email or password is incorrect." } } };
    });
    render(<App />);
    await userEvent.type(await screen.findByLabelText("Email"), "a@b.example");
    await userEvent.type(screen.getByLabelText("Password"), "nope");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Email or password is incorrect.");
  });

  it("lets a borrower see the catalogue and disables items with no stock", async () => {
    mockFetch((url) => {
      if (url.endsWith("/api/auth/me"))
        return { status: 200, body: { id: 5, name: "Ploy", email: "p@x.example", role: "BORROWER" } };
      if (url.endsWith("/api/items")) return { status: 200, body: [camera, mic] };
      if (url.endsWith("/api/loans")) return { status: 200, body: [] };
    });
    render(<App />);
    expect(await screen.findByText("Wireless Microphone Set")).toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: "Borrow" });
    expect(buttons[0]).toBeDisabled(); // camera: 0 available
    expect(buttons[1]).toBeEnabled();
    expect(screen.getByText("0 / 3")).toBeInTheDocument();
  });

  it("shows pending requests with approve and reject actions for a custodian", async () => {
    const loan = {
      id: 9,
      quantity: 1,
      purpose: "Club video",
      dueDate: "2026-11-20T10:00:00.000Z",
      status: "REQUESTED",
      decisionNote: null,
      requestedAt: "2026-11-10T10:00:00.000Z",
      returnedAt: null,
      item: { id: 2, name: "Wireless Microphone Set", assetCode: "AUD-001" },
      borrower: { id: 5, name: "Ploy", email: "p@x.example" },
    };
    mockFetch((url) => {
      if (url.endsWith("/api/auth/me"))
        return { status: 200, body: { id: 1, name: "Head Custodian", email: "c@x.example", role: "CUSTODIAN" } };
      if (url.endsWith("/api/items")) return { status: 200, body: [mic] };
      if (url.endsWith("/api/loans")) return { status: 200, body: [loan] };
      if (url.endsWith("/api/categories")) return { status: 200, body: [{ id: 2, name: "Camera" }] };
    });
    render(<App />);
    expect(await screen.findByText("Pending requests (1)")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
    expect(screen.getByText("Ploy")).toBeInTheDocument();
  });

  it("shows the short commit of the running release in the footer", async () => {
    mockFetch((url) =>
      url.endsWith("/api/version")
        ? { status: 200, body: { commit: "e4f5a6b0123456789abcdef0123456789abcdef0" } }
        : undefined
    );
    render(<ReleaseFooter />);
    const code = await screen.findByText("e4f5a6b");
    expect(code).toHaveAttribute("title", "e4f5a6b0123456789abcdef0123456789abcdef0");
  });
});
