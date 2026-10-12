// Fill a running API (default http://localhost:8787) with a few realistic requests.
//   node scripts/seed.mjs [baseUrl]
const base = (process.argv[2] ?? "http://localhost:8787").replace(/\/$/, "");

const requests = [
  { title: "VPN certificate expired", description: "VPN client says my certificate expired; I need the finance system today.", requester: "dana@example.com", category: "it_access", priority: "high" },
  { title: "Second monitor for new hire", description: "Priya starts Monday on the data team and needs a 27 inch monitor and a dock.", requester: "lee@example.com", category: "hardware" },
  { title: "Figma licence", description: "Need a Figma editor seat for the Q4 onboarding redesign.", requester: "sam@example.com", category: "software", priority: "low" },
  { title: "Meeting room 4B projector", description: "Projector in 4B shows no signal over HDMI from any laptop.", requester: "alex@example.com", category: "facilities" },
  { title: "Conference travel reimbursement", description: "Submitted receipts for the September conference three weeks ago, still pending.", requester: "jo@example.com", category: "finance" },
];

const post = (path, body, method = "POST") =>
  fetch(`${base}${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

const ids = [];
for (const r of requests) ids.push((await post("/api/requests", r)).id);
await post(`/api/requests/${ids[0]}`, { status: "in_progress", assignee: "it-desk@example.com", actor: "lead@example.com" }, "PATCH");
await post(`/api/requests/${ids[3]}`, { status: "resolved", assignee: "facilities@example.com", actor: "lead@example.com" }, "PATCH");
console.log(`seeded ${ids.length} requests: ${ids.join(", ")}`);
