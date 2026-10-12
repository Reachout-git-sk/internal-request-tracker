import { useCallback, useEffect, useState } from "react";

import { api, CATEGORIES, CATEGORY_LABELS, STATUSES, type RequestRow, type Stats } from "./api";
import { NewRequestForm } from "./NewRequestForm";
import { RequestDetail } from "./RequestDetail";

function useStoredEmail() {
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem("tracker.email") ?? "";
    } catch {
      return "";
    }
  });
  const save = (v: string) => {
    setEmail(v);
    try {
      localStorage.setItem("tracker.email", v);
    } catch {
      /* private mode */
    }
  };
  return [email, save] as const;
}

export default function App() {
  const [email, setEmail] = useStoredEmail();
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [list, s] = await Promise.all([api.list({ status, category }), api.stats()]);
      setRequests(list.requests);
      setStats(s);
      setError(null);
    } catch {
      setError("Cannot reach the API.");
    }
  }, [status, category]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const open = stats?.by_status.open ?? 0;
  const inProgress = stats?.by_status.in_progress ?? 0;
  const acceptRate = stats && stats.ai_triaged ? Math.round((100 * stats.ai_category_accepted) / stats.ai_triaged) : null;

  return (
    <div className="app">
      <header>
        <h1>Request Tracker</h1>
        <label className="whoami">
          You are
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        </label>
      </header>

      <section className="tiles" aria-label="Summary">
        <div><span>{open}</span>open</div>
        <div><span>{inProgress}</span>in progress</div>
        <div><span>{acceptRate === null ? "--" : `${acceptRate}%`}</span>AI categories kept</div>
      </section>

      {error && <p className="error" role="alert">{error}</p>}

      <main>
        <div className="left">
          <NewRequestForm requester={email} onCreated={(r) => { setSelected(r.id); refresh(); }} />
        </div>

        <div className="right">
          <div className="filters">
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
              <option value="">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
            <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
              <option value="">All categories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </div>

          <table>
            <thead>
              <tr><th>#</th><th>Title</th><th>Category</th><th>Status</th><th>Assignee</th></tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} onClick={() => setSelected(r.id)} className={r.id === selected ? "selected" : ""}>
                  <td>{r.id}</td>
                  <td>{r.title}</td>
                  <td>{CATEGORY_LABELS[r.category]}</td>
                  <td><span className={`pill ${r.status}`}>{r.status.replace("_", " ")}</span></td>
                  <td>{r.assignee ?? "-"}</td>
                </tr>
              ))}
              {!requests.length && <tr><td colSpan={5} className="empty">No requests yet.</td></tr>}
            </tbody>
          </table>

          {selected && <RequestDetail key={selected} id={selected} actor={email || "unknown@company.com"} onChanged={refresh} />}
        </div>
      </main>
    </div>
  );
}
