import type { CreateRequestInput, UpdateRequestInput } from "./schema";

export interface RequestRow {
  id: number;
  title: string;
  description: string;
  requester: string;
  category: string;
  priority: string;
  status: string;
  assignee: string | null;
  summary: string | null;
  ai_summary: string | null;
  ai_category: string | null;
  ai_model: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventRow {
  id: number;
  request_id: number;
  kind: string;
  detail: string | null;
  actor: string;
  created_at: string;
}

export async function listRequests(db: D1Database, f: { status?: string; category?: string; limit: number }) {
  const where: string[] = [];
  const args: unknown[] = [];
  if (f.status) {
    where.push("status = ?");
    args.push(f.status);
  }
  if (f.category) {
    where.push("category = ?");
    args.push(f.category);
  }
  const sql = `SELECT * FROM requests ${where.length ? "WHERE " + where.join(" AND ") : ""}
               ORDER BY created_at DESC, id DESC LIMIT ?`;
  const { results } = await db.prepare(sql).bind(...args, f.limit).all<RequestRow>();
  return results;
}

export async function getRequest(db: D1Database, id: number) {
  const row = await db.prepare("SELECT * FROM requests WHERE id = ?").bind(id).first<RequestRow>();
  if (!row) return null;
  const { results: events } = await db
    .prepare("SELECT * FROM request_events WHERE request_id = ? ORDER BY id")
    .bind(id)
    .all<EventRow>();
  return { ...row, events };
}

export async function createRequest(db: D1Database, input: CreateRequestInput) {
  const row = await db
    .prepare(
      `INSERT INTO requests (title, description, requester, category, priority, summary, ai_summary, ai_category, ai_model)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    )
    .bind(
      input.title,
      input.description,
      input.requester,
      input.category,
      input.priority,
      input.summary ?? null,
      input.ai?.summary ?? null,
      input.ai?.category ?? null,
      input.ai?.model ?? null,
    )
    .first<RequestRow>();
  if (!row) throw new Error("insert returned no row");

  let detail = `category=${input.category}`;
  if (input.ai) detail += input.ai.category === input.category ? " (accepted AI suggestion)" : ` (AI suggested ${input.ai.category})`;
  await addEvent(db, row.id, "created", detail, input.requester);
  return row;
}

export async function updateRequest(db: D1Database, id: number, input: UpdateRequestInput) {
  const current = await db.prepare("SELECT * FROM requests WHERE id = ?").bind(id).first<RequestRow>();
  if (!current) return null;

  const sets: string[] = [];
  const args: unknown[] = [];
  const events: [string, string][] = [];
  const fields = ["status", "assignee", "category", "priority"] as const;
  for (const field of fields) {
    const next = input[field];
    if (next === undefined || next === current[field]) continue;
    sets.push(`${field} = ?`);
    args.push(next);
    events.push([`${field}_changed`, `${current[field] ?? "none"} -> ${next ?? "none"}`]);
  }
  if (!sets.length) return { ...current, changed: false };

  const update = db
    .prepare(`UPDATE requests SET ${sets.join(", ")}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`)
    .bind(...args, id);
  const inserts = events.map(([kind, detail]) =>
    db.prepare("INSERT INTO request_events (request_id, kind, detail, actor) VALUES (?, ?, ?, ?)").bind(id, kind, detail, input.actor),
  );
  // one batch = one transaction, so the row and its audit trail never disagree
  await db.batch([update, ...inserts]);
  const row = await db.prepare("SELECT * FROM requests WHERE id = ?").bind(id).first<RequestRow>();
  return { ...row!, changed: true };
}

export async function addEvent(db: D1Database, requestId: number, kind: string, detail: string, actor: string) {
  await db
    .prepare("INSERT INTO request_events (request_id, kind, detail, actor) VALUES (?, ?, ?, ?)")
    .bind(requestId, kind, detail, actor)
    .run();
}

export async function stats(db: D1Database) {
  const byStatus = await db.prepare("SELECT status, count(*) AS n FROM requests GROUP BY status").all<{ status: string; n: number }>();
  const ai = await db
    .prepare(
      `SELECT count(*) AS triaged,
              sum(CASE WHEN ai_category = category THEN 1 ELSE 0 END) AS accepted
       FROM requests WHERE ai_category IS NOT NULL`,
    )
    .first<{ triaged: number; accepted: number | null }>();
  return {
    by_status: Object.fromEntries(byStatus.results.map((r) => [r.status, r.n])),
    ai_triaged: ai?.triaged ?? 0,
    ai_category_accepted: ai?.accepted ?? 0,
  };
}
