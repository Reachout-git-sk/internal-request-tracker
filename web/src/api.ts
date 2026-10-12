export const CATEGORY_LABELS: Record<string, string> = {
  it_access: "IT access",
  hardware: "Hardware",
  software: "Software",
  facilities: "Facilities",
  hr: "HR",
  finance: "Finance",
  other: "Other",
};
export const CATEGORIES = Object.keys(CATEGORY_LABELS);
export const STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
export const PRIORITIES = ["low", "medium", "high"] as const;

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
  created_at: string;
  updated_at: string;
}

export interface RequestEvent {
  id: number;
  kind: string;
  detail: string | null;
  actor: string;
  created_at: string;
}

export interface Triage {
  summary: string;
  suggested_category: string;
  model: string;
  ai_available: boolean;
}

export interface Stats {
  by_status: Record<string, number>;
  ai_triaged: number;
  ai_category_accepted: number;
}

const BASE = (import.meta.env.VITE_API_URL ?? "http://localhost:8787").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`request failed with ${status}`);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export const api = {
  list: (q: { status?: string; category?: string }) => {
    const params = new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][]);
    return call<{ requests: RequestRow[] }>("GET", `/api/requests?${params}`);
  },
  get: (id: number) => call<RequestRow & { events: RequestEvent[] }>("GET", `/api/requests/${id}`),
  triage: (title: string, description: string) => call<Triage>("POST", "/api/triage", { title, description }),
  create: (body: Record<string, unknown>) => call<RequestRow>("POST", "/api/requests", body),
  update: (id: number, body: Record<string, unknown>) => call<RequestRow>("PATCH", `/api/requests/${id}`, body),
  stats: () => call<Stats>("GET", "/api/stats"),
};
