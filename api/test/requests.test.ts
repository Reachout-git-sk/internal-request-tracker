import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { api, rowCount, sample } from "./helpers";

beforeEach(async () => {
  await env.DB.batch([env.DB.prepare("DELETE FROM request_events"), env.DB.prepare("DELETE FROM requests")]);
});

describe("POST /api/requests", () => {
  it("creates a request and an audit event", async () => {
    const call = api();
    const res = await call("POST", "/api/requests", sample);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: sample.title, status: "open", priority: "medium", category: "it_access" });
    expect(res.body.ai_category).toBeNull();

    const detail = await call("GET", `/api/requests/${res.body.id}`);
    expect(detail.body.events).toHaveLength(1);
    expect(detail.body.events[0]).toMatchObject({ kind: "created", actor: sample.requester });
  });

  it("records AI provenance and whether the suggestion was kept", async () => {
    const call = api();
    const accepted = await call("POST", "/api/requests", {
      ...sample,
      summary: "Needs VPN access.",
      ai: { summary: "Needs VPN access.", category: "it_access", model: "m" },
    });
    const overridden = await call("POST", "/api/requests", {
      ...sample,
      category: "software",
      ai: { summary: "Needs VPN access.", category: "it_access", model: "m" },
    });

    expect(accepted.body).toMatchObject({ ai_category: "it_access", ai_model: "m", summary: "Needs VPN access." });
    const e1 = (await call("GET", `/api/requests/${accepted.body.id}`)).body.events[0];
    const e2 = (await call("GET", `/api/requests/${overridden.body.id}`)).body.events[0];
    expect(e1.detail).toContain("accepted AI suggestion");
    expect(e2.detail).toContain("AI suggested it_access");

    const stats = await call("GET", "/api/stats");
    expect(stats.body).toMatchObject({ ai_triaged: 2, ai_category_accepted: 1 });
  });

  it.each([
    [{ ...sample, title: "" }, "title"],
    [{ ...sample, requester: "not-an-email" }, "requester"],
    [{ ...sample, category: "gardening" }, "category"],
    [{ ...sample, priority: "urgent" }, "priority"],
    [{ ...sample, description: "x".repeat(5001) }, "description"],
  ])("rejects invalid input %#", async (body, field) => {
    const res = await api()("POST", "/api/requests", body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_failed");
    expect(res.body.issues.map((i: { path: string }) => i.path)).toContain(field);
    expect(await rowCount("requests")).toBe(0);
  });

  it("trims whitespace", async () => {
    const res = await api()("POST", "/api/requests", { ...sample, title: "  Laptop fan noisy  " });
    expect(res.body.title).toBe("Laptop fan noisy");
  });
});

describe("GET /api/requests", () => {
  it("lists newest first and filters by status and category", async () => {
    const call = api();
    const a = await call("POST", "/api/requests", { ...sample, title: "A" });
    await call("POST", "/api/requests", { ...sample, title: "B", category: "hardware" });
    await call("PATCH", `/api/requests/${a.body.id}`, { status: "resolved", actor: "it@example.com" });

    const all = await call("GET", "/api/requests");
    expect(all.body.requests.map((r: { title: string }) => r.title)).toEqual(["B", "A"]);

    const open = await call("GET", "/api/requests?status=open");
    expect(open.body.requests.map((r: { title: string }) => r.title)).toEqual(["B"]);

    const hw = await call("GET", "/api/requests?category=hardware");
    expect(hw.body.requests).toHaveLength(1);
  });

  it("rejects bad filters", async () => {
    expect((await api()("GET", "/api/requests?status=lost")).status).toBe(400);
    expect((await api()("GET", "/api/requests?limit=1000")).status).toBe(400);
  });
});

describe("GET /api/requests/:id", () => {
  it("404s for unknown ids and 400s for bad ids", async () => {
    expect((await api()("GET", "/api/requests/999")).status).toBe(404);
    expect((await api()("GET", "/api/requests/abc")).status).toBe(400);
  });
});

describe("PATCH /api/requests/:id", () => {
  it("updates fields and writes one audit event per change", async () => {
    const call = api();
    const created = await call("POST", "/api/requests", sample);
    const res = await call("PATCH", `/api/requests/${created.body.id}`, {
      status: "in_progress",
      assignee: "it@example.com",
      actor: "lead@example.com",
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "in_progress", assignee: "it@example.com", changed: true });

    const events = (await call("GET", `/api/requests/${created.body.id}`)).body.events;
    expect(events.map((e: { kind: string }) => e.kind)).toEqual(["created", "status_changed", "assignee_changed"]);
    expect(events[1]).toMatchObject({ detail: "open -> in_progress", actor: "lead@example.com" });
  });

  it("does not log anything when values are unchanged", async () => {
    const call = api();
    const created = await call("POST", "/api/requests", sample);
    const res = await call("PATCH", `/api/requests/${created.body.id}`, { status: "open", actor: "lead@example.com" });
    expect(res.body.changed).toBe(false);
    expect(await rowCount("request_events")).toBe(1);
  });

  it("requires an actor and at least one field", async () => {
    const call = api();
    const created = await call("POST", "/api/requests", sample);
    expect((await call("PATCH", `/api/requests/${created.body.id}`, { status: "closed" })).status).toBe(400);
    expect((await call("PATCH", `/api/requests/${created.body.id}`, { actor: "lead@example.com" })).status).toBe(400);
  });

  it("404s for a missing request", async () => {
    const res = await api()("PATCH", "/api/requests/4242", { status: "closed", actor: "lead@example.com" });
    expect(res.status).toBe(404);
  });
});

describe("CORS", () => {
  it("allows the configured origin only", async () => {
    const call = api();
    const ok = await call("GET", "/api/health", undefined, { origin: "http://localhost:5173" });
    const bad = await call("GET", "/api/health", undefined, { origin: "https://evil.example" });
    expect(ok.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
  });
});
