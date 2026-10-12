import { CATEGORIES, type Category } from "./schema";

export interface TriageResult {
  summary: string;
  suggested_category: Category;
  model: string;
  // false when the model could not be reached or returned something unusable;
  // the UI then asks the person to pick a category themselves
  ai_available: boolean;
}

export interface AiBinding {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
}

const CATEGORY_HELP: Record<Category, string> = {
  it_access: "accounts, passwords, VPN, permissions, SSO",
  hardware: "laptops, monitors, phones, peripherals that are broken or needed",
  software: "installing, licensing or fixing an application",
  facilities: "office space, desks, building, cleaning, parking",
  hr: "leave, benefits, onboarding, policies",
  finance: "expenses, invoices, purchase orders, reimbursements",
  other: "anything that does not fit the categories above",
};

const SYSTEM_PROMPT = `You triage internal support requests at a company.
Return JSON with two fields:
- "summary": one sentence, at most 25 words, saying what the person needs.
- "category": exactly one of: ${CATEGORIES.map((c) => `${c} (${CATEGORY_HELP[c]})`).join("; ")}.
Do not invent details that are not in the request.`;

const RESPONSE_SCHEMA = {
  type: "json_schema",
  json_schema: {
    type: "object",
    properties: {
      summary: { type: "string" },
      category: { type: "string", enum: [...CATEGORIES] },
    },
    required: ["summary", "category"],
  },
};

function fallback(title: string, model: string): TriageResult {
  return { summary: title.slice(0, 200), suggested_category: "other", model, ai_available: false };
}

/** Models sometimes wrap JSON in prose or code fences; pull out the first object. */
export function extractJson(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw !== "string") return null;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function normaliseCategory(value: unknown): Category | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (CATEGORIES as readonly string[]).includes(v) ? (v as Category) : null;
}

export async function triage(ai: AiBinding, model: string, title: string, description: string): Promise<TriageResult> {
  let out: unknown;
  try {
    out = await ai.run(model, {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Title: ${title}\n\nDescription:\n${description}` },
      ],
      response_format: RESPONSE_SCHEMA,
      max_tokens: 200,
      temperature: 0.2,
    });
  } catch (err) {
    console.warn(JSON.stringify({ event: "triage_failed", error: String(err) }));
    return fallback(title, model);
  }

  const body = extractJson((out as { response?: unknown })?.response ?? out);
  const category = normaliseCategory(body?.category);
  const summary = typeof body?.summary === "string" ? body.summary.trim() : "";
  if (!category || !summary) {
    console.warn(JSON.stringify({ event: "triage_unparseable", output: JSON.stringify(out).slice(0, 500) }));
    return fallback(title, model);
  }
  return { summary: summary.slice(0, 1000), suggested_category: category, model, ai_available: true };
}
