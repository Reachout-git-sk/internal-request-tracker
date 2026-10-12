import { applyD1Migrations, env } from "cloudflare:test";

// runs before each test file; applyD1Migrations skips ones already applied
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
