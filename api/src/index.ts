import { zValidator } from "@hono/zod-validator";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";

import * as db from "./db";
import { CATEGORIES, createRequestInput, listQuery, triageInput, updateRequestInput } from "./schema";
import { triage, type AiBinding } from "./triage";

export interface Env {
  DB: D1Database;
  AI: AiBinding;
  AI_MODEL: string;
  ALLOWED_ORIGINS: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use("*", logger());
app.use("/api/*", async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return cors({ origin: (origin) => (allowed.includes(origin) ? origin : null) })(c, next);
});

// zod errors -> 400 with field messages instead of the default plain text
const onInvalid = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }, c: Context) => {
  if (!result.success && result.error) {
    const issues = result.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message }));
    return c.json({ error: "validation_failed", issues }, 400);
  }
};

const idParam = (raw: string) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new HTTPException(400, { message: "invalid id" });
  return id;
};

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/categories", (c) => c.json({ categories: CATEGORIES }));

// Suggest a summary and category. Nothing is written here: the person reviews
// the suggestion in the form and only POST /api/requests saves anything.
app.post("/api/triage", zValidator("json", triageInput, onInvalid), async (c) => {
  const { title, description } = c.req.valid("json");
  const started = Date.now();
  const result = await triage(c.env.AI, c.env.AI_MODEL, title, description);
  console.log(JSON.stringify({ event: "triage", ms: Date.now() - started, ai_available: result.ai_available, category: result.suggested_category }));
  return c.json(result);
});

app.get("/api/requests", zValidator("query", listQuery, onInvalid), async (c) => {
  const q = c.req.valid("query");
  return c.json({ requests: await db.listRequests(c.env.DB, q) });
});

app.get("/api/requests/:id", async (c) => {
  const row = await db.getRequest(c.env.DB, idParam(c.req.param("id")));
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json(row);
});

app.post("/api/requests", zValidator("json", createRequestInput, onInvalid), async (c) => {
  const row = await db.createRequest(c.env.DB, c.req.valid("json"));
  return c.json(row, 201);
});

app.patch("/api/requests/:id", zValidator("json", updateRequestInput, onInvalid), async (c) => {
  const row = await db.updateRequest(c.env.DB, idParam(c.req.param("id")), c.req.valid("json"));
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json(row);
});

app.get("/api/stats", async (c) => c.json(await db.stats(c.env.DB)));

app.notFound((c) => c.json({ error: "not_found" }, 404));

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(JSON.stringify({ event: "unhandled", error: String(err) }));
  return c.json({ error: "internal_error" }, 500);
});

export default app;
