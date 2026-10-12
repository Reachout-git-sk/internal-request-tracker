import { env } from "cloudflare:test";

import app from "../src/index";
import type { AiBinding } from "../src/triage";

export class FakeAi implements AiBinding {
  calls: { model: string; inputs: Record<string, unknown> }[] = [];
  constructor(private reply: unknown | (() => unknown) = { response: { summary: "Needs VPN access.", category: "it_access" } }) {}

  async run(model: string, inputs: Record<string, unknown>) {
    this.calls.push({ model, inputs });
    const r = typeof this.reply === "function" ? (this.reply as () => unknown)() : this.reply;
    if (r instanceof Error) throw r;
    return r;
  }
}

export function api(ai: AiBinding = new FakeAi()) {
  const testEnv = { ...env, AI: ai };
  return async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await app.request(
      path,
      {
        method,
        headers: { "content-type": "application/json", ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      testEnv,
    );
    const text = await res.text();
    return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
  };
}

export const sample = {
  title: "Cannot connect to VPN",
  description: "Since this morning the VPN client says my certificate expired. I need it for the finance system.",
  requester: "dana@example.com",
  category: "it_access",
};

export async function rowCount(table: string) {
  const r = await env.DB.prepare(`SELECT count(*) AS n FROM ${table}`).first<{ n: number }>();
  return r!.n;
}
