import { z } from "zod";

export const CATEGORIES = ["it_access", "hardware", "software", "facilities", "hr", "finance", "other"] as const;
export const PRIORITIES = ["low", "medium", "high"] as const;
export const STATUSES = ["open", "in_progress", "resolved", "closed"] as const;

export type Category = (typeof CATEGORIES)[number];
export type Status = (typeof STATUSES)[number];

const text = (max: number) => z.string().trim().min(1).max(max);

export const triageInput = z.object({
  title: text(200),
  description: text(5000),
});

export const createRequestInput = z.object({
  title: text(200),
  description: text(5000),
  requester: z.string().trim().email(),
  category: z.enum(CATEGORIES),
  priority: z.enum(PRIORITIES).default("medium"),
  // the summary the person saw and kept (possibly edited)
  summary: z.string().trim().max(1000).optional(),
  // provenance of the AI suggestion, if triage was run
  ai: z
    .object({
      summary: z.string().max(1000),
      category: z.enum(CATEGORIES),
      model: z.string().max(200),
    })
    .optional(),
});

export const updateRequestInput = z
  .object({
    status: z.enum(STATUSES).optional(),
    assignee: z.string().trim().email().nullable().optional(),
    category: z.enum(CATEGORIES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    actor: z.string().trim().email(),
  })
  .refine(
    (v) => v.status !== undefined || v.assignee !== undefined || v.category !== undefined || v.priority !== undefined,
    { message: "nothing to update" },
  );

export const listQuery = z.object({
  status: z.enum(STATUSES).optional(),
  category: z.enum(CATEGORIES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateRequestInput = z.infer<typeof createRequestInput>;
export type UpdateRequestInput = z.infer<typeof updateRequestInput>;
