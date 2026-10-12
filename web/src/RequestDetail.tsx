import { useEffect, useState } from "react";

import { api, CATEGORY_LABELS, STATUSES, type RequestEvent, type RequestRow } from "./api";

interface Props {
  id: number;
  actor: string;
  onChanged: () => void;
}

export function RequestDetail({ id, actor, onChanged }: Props) {
  const [row, setRow] = useState<(RequestRow & { events: RequestEvent[] }) | null>(null);
  const [assignee, setAssignee] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api.get(id).then((r) => {
      setRow(r);
      setAssignee(r.assignee ?? "");
    });

  useEffect(() => {
    load().catch(() => setError("Could not load request."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function update(body: Record<string, unknown>) {
    setError(null);
    try {
      await api.update(id, { ...body, actor });
      await load();
      onChanged();
    } catch {
      setError("Update failed.");
    }
  }

  if (!row) return <div className="card">{error ?? "Loading..."}</div>;

  return (
    <div className="card detail">
      <h2>
        #{row.id} {row.title}
      </h2>
      <p className="meta">
        {row.requester} · {CATEGORY_LABELS[row.category]} · {row.priority} priority
      </p>
      {row.summary && <p className="summary">{row.summary}</p>}
      <p className="description">{row.description}</p>

      <div className="row">
        <label>
          Status
          <select value={row.status} onChange={(e) => update({ status: e.target.value })}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          Assignee
          <input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="name@company.com" />
        </label>
        <button type="button" onClick={() => update({ assignee: assignee.trim() || null })}>
          Assign
        </button>
      </div>
      {error && <p className="error">{error}</p>}

      <h3>History</h3>
      <ol className="events">
        {row.events.map((e) => (
          <li key={e.id}>
            <time>{new Date(e.created_at).toLocaleString()}</time> <b>{e.kind.replace("_", " ")}</b> {e.detail} <span>by {e.actor}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
