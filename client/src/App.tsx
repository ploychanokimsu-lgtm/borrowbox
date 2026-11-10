import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type Category, type Item, type Loan, type User } from "./api";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function StatusBadge({ status }: { status: Loan["status"] }) {
  return <span className={`badge badge-${status.toLowerCase()}`}>{status}</span>;
}

function Message({ error, ok }: { error?: string | null; ok?: string | null }) {
  if (error) return <p className="alert alert-error" role="alert">{error}</p>;
  if (ok) return <p className="alert alert-ok" role="status">{ok}</p>;
  return null;
}

// ---------------------------------------------------------------- Login
export function LoginForm({ onSignedIn }: { onSignedIn: (user: User) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await api.login(email, password);
      onSignedIn(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card login" onSubmit={submit}>
      <h2>Sign in</h2>
      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
      </label>
      <label>
        Password
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
      </label>
      <Message error={error} />
      <button type="submit" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
    </form>
  );
}

// ---------------------------------------------------------------- Shared
function ItemTable({ items, onPick }: { items: Item[]; onPick?: (item: Item) => void }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Code</th>
          <th>Item</th>
          <th>Category</th>
          <th className="num">Available</th>
          {onPick && <th />}
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td><code>{item.assetCode}</code></td>
            <td>{item.name}</td>
            <td>{item.category.name}</td>
            <td className="num">{item.availableQuantity} / {item.totalQuantity}</td>
            {onPick && (
              <td>
                <button className="small" disabled={item.availableQuantity === 0} onClick={() => onPick(item)}>
                  Borrow
                </button>
              </td>
            )}
          </tr>
        ))}
        {items.length === 0 && (
          <tr><td colSpan={5} className="muted">No items yet.</td></tr>
        )}
      </tbody>
    </table>
  );
}

function LoanTable({
  loans,
  showBorrower,
  actions,
}: {
  loans: Loan[];
  showBorrower?: boolean;
  actions?: (loan: Loan) => React.ReactNode;
}) {
  return (
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Item</th>
          {showBorrower && <th>Borrower</th>}
          <th className="num">Qty</th>
          <th>Due</th>
          <th>Status</th>
          {actions && <th />}
        </tr>
      </thead>
      <tbody>
        {loans.map((loan) => (
          <tr key={loan.id}>
            <td>{loan.id}</td>
            <td>{loan.item.name}<div className="muted small-text">{loan.purpose}</div></td>
            {showBorrower && <td>{loan.borrower.name}</td>}
            <td className="num">{loan.quantity}</td>
            <td>{fmtDate(loan.dueDate)}</td>
            <td>
              <StatusBadge status={loan.status} />
              {loan.decisionNote && <div className="muted small-text">{loan.decisionNote}</div>}
            </td>
            {actions && <td className="actions">{actions(loan)}</td>}
          </tr>
        ))}
        {loans.length === 0 && (
          <tr><td colSpan={7} className="muted">Nothing here.</td></tr>
        )}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------- Borrower
function BorrowerView() {
  const [items, setItems] = useState<Item[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [picked, setPicked] = useState<Item | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [purpose, setPurpose] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [i, l] = await Promise.all([api.items(), api.loans()]);
    setItems(i);
    setLoans(l);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!picked) return;
    setError(null);
    setOk(null);
    try {
      await api.requestLoan({
        itemId: picked.id,
        quantity,
        purpose,
        dueDate: new Date(`${dueDate}T17:00:00`).toISOString(),
      });
      setOk(`Request for ${picked.name} sent to the custodian.`);
      setPicked(null);
      setPurpose("");
      setQuantity(1);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send the request.");
    }
  }

  return (
    <>
      <section className="card">
        <h2>Equipment catalogue</h2>
        <ItemTable items={items} onPick={(item) => { setPicked(item); setOk(null); setError(null); }} />
      </section>

      {picked && (
        <section className="card">
          <h2>Borrow {picked.name}</h2>
          <form className="grid-form" onSubmit={submit}>
            <label>
              Quantity
              <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} required />
            </label>
            <label>
              Return by
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
            </label>
            <label className="wide">
              Purpose
              <input value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={300} required />
            </label>
            <div className="wide row">
              <button type="submit">Send request</button>
              <button type="button" className="secondary" onClick={() => setPicked(null)}>Cancel</button>
            </div>
          </form>
        </section>
      )}
      <Message error={error} ok={ok} />

      <section className="card">
        <h2>My loans</h2>
        <LoanTable loans={loans} />
      </section>
    </>
  );
}

// ---------------------------------------------------------------- Custodian
function CustodianView() {
  const [items, setItems] = useState<Item[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({ name: "", assetCode: "", categoryId: "", totalQuantity: 1 });
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [i, l, c] = await Promise.all([api.items(), api.loans(), api.categories()]);
    setItems(i);
    setLoans(l);
    setCategories(c);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  async function act(loan: Loan, action: "approve" | "reject" | "return") {
    setError(null);
    setOk(null);
    try {
      await api.decide(loan.id, action);
      setOk(`Loan #${loan.id}: ${action} done.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    }
  }

  async function addItem(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    try {
      const item = await api.createItem({ ...form, categoryId: Number(form.categoryId) });
      setOk(`Added ${item.name}.`);
      setForm({ name: "", assetCode: "", categoryId: "", totalQuantity: 1 });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the item.");
    }
  }

  const pending = loans.filter((l) => l.status === "REQUESTED");
  const active = loans.filter((l) => l.status === "BORROWED");
  const history = loans.filter((l) => l.status === "RETURNED" || l.status === "REJECTED");

  return (
    <>
      <Message error={error} ok={ok} />
      <section className="card">
        <h2>Pending requests ({pending.length})</h2>
        <LoanTable
          loans={pending}
          showBorrower
          actions={(loan) => (
            <>
              <button className="small" onClick={() => act(loan, "approve")}>Approve</button>
              <button className="small secondary" onClick={() => act(loan, "reject")}>Reject</button>
            </>
          )}
        />
      </section>
      <section className="card">
        <h2>On loan ({active.length})</h2>
        <LoanTable
          loans={active}
          showBorrower
          actions={(loan) => <button className="small" onClick={() => act(loan, "return")}>Mark returned</button>}
        />
      </section>
      <section className="card">
        <h2>Inventory</h2>
        <ItemTable items={items} />
        <h3>Add item</h3>
        <form className="grid-form" onSubmit={addItem}>
          <label>
            Name
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={120} />
          </label>
          <label>
            Asset code
            <input value={form.assetCode} onChange={(e) => setForm({ ...form, assetCode: e.target.value })} required maxLength={32} />
          </label>
          <label>
            Category
            <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} required>
              <option value="">Choose...</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>
            Quantity
            <input type="number" min={1} max={1000} value={form.totalQuantity}
              onChange={(e) => setForm({ ...form, totalQuantity: Number(e.target.value) })} required />
          </label>
          <div className="wide"><button type="submit">Add item</button></div>
        </form>
      </section>
      <section className="card">
        <h2>History</h2>
        <LoanTable loans={history} showBorrower />
      </section>
    </>
  );
}

// ---------------------------------------------------------------- Footer
/** Shows which commit is running, so testers can report the exact release. */
export function ReleaseFooter() {
  const [commit, setCommit] = useState<string | null>(null);
  useEffect(() => {
    api.version().then((v) => setCommit(v.commit)).catch(() => setCommit(null));
  }, []);
  return (
    <footer className="footer">
      BorrowBox Sprint 1
      {commit && (
        <>
          {" "}&middot; Release <code title={commit}>{/^[0-9a-f]{40}$/.test(commit) ? commit.slice(0, 7) : commit}</code>
        </>
      )}
    </footer>
  );
}

// ---------------------------------------------------------------- App
export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    api.me().then(setUser).catch(() => setUser(null)).finally(() => setChecked(true));
  }, []);

  async function logout() {
    await api.logout().catch(() => undefined);
    setUser(null);
  }

  return (
    <div className="page">
      <header className="topbar">
        <h1>BorrowBox</h1>
        <span className="tagline">Inventory and Borrowing System</span>
        {user && (
          <div className="who">
            <span>{user.name} <em>({user.role === "CUSTODIAN" ? "Custodian" : "Borrower"})</em></span>
            <button className="small secondary" onClick={logout}>Sign out</button>
          </div>
        )}
      </header>
      <main>
        {!checked ? (
          <p className="muted">Loading...</p>
        ) : !user ? (
          <LoginForm onSignedIn={setUser} />
        ) : user.role === "CUSTODIAN" ? (
          <CustodianView />
        ) : (
          <BorrowerView />
        )}
      </main>
      <ReleaseFooter />
    </div>
  );
}
