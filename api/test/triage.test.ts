import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { extractJson, normaliseCategory } from "../src/triage";
import { FakeAi, api, rowCount, sample } from "./helpers";

const input = { title: sample.title, description: sample.description };

describe("POST /api/triage", () => {
  it("returns the model's summary and category", async () => {
    const ai = new FakeAi();
    const res = await api(ai)("POST", "/api/triage", input);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      summary: "Needs VPN access.",
      suggested_category: "it_access",
      model: env.AI_MODEL,
      ai_available: true,
    });
    expect(ai.calls).toHaveLength(1);
    expect(ai.calls[0].model).toBe(env.AI_MODEL);
    const messages = ai.calls[0].inputs.messages as { role: string; content: string }[];
    expect(messages[1].content).toContain(sample.description);
  });

  it("never writes to the database; saving is a separate, confirmed step", async () => {
    const before = await rowCount("requests");
    await api()("POST", "/api/triage", input);
    expect(await rowCount("requests")).toBe(before);
  });

  it("accepts JSON returned as a string with surrounding text", async () => {
    const ai = new FakeAi({ response: 'Sure! ```json\n{"summary": "Broken monitor.", "category": "Hardware"}\n```' });
    const res = await api(ai)("POST", "/api/triage", input);
    expect(res.body).toMatchObject({ summary: "Broken monitor.", suggested_category: "hardware", ai_available: true });
  });

  it.each([
    ["unknown category", { response: { summary: "x", category: "gardening" } }],
    ["missing summary", { response: { category: "hr" } }],
    ["not json", { response: "I cannot help with that." }],
    ["empty", {}],
  ])("falls back to manual triage on %s", async (_label, reply) => {
    const res = await api(new FakeAi(reply))("POST", "/api/triage", input);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ suggested_category: "other", ai_available: false, summary: sample.title });
  });

  it("falls back when the AI binding throws", async () => {
    const res = await api(new FakeAi(() => new Error("capacity exceeded")))("POST", "/api/triage", input);
    expect(res.status).toBe(200);
    expect(res.body.ai_available).toBe(false);
  });

  it("validates input before calling the model", async () => {
    const ai = new FakeAi();
    const res = await api(ai)("POST", "/api/triage", { title: "", description: "" });
    expect(res.status).toBe(400);
    expect(ai.calls).toHaveLength(0);
  });
});

describe("helpers", () => {
  it("normalises category spelling", () => {
    expect(normaliseCategory(" IT Access ")).toBe("it_access");
    expect(normaliseCategory("it-access")).toBe("it_access");
    expect(normaliseCategory("payroll")).toBeNull();
    expect(normaliseCategory(3)).toBeNull();
  });

  it("extracts the first JSON object", () => {
    expect(extractJson('noise {"a": 1} noise')).toEqual({ a: 1 });
    expect(extractJson({ a: 1 })).toEqual({ a: 1 });
    expect(extractJson("{broken")).toBeNull();
    expect(extractJson(undefined)).toBeNull();
  });
});
