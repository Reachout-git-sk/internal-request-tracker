declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    AI_MODEL: string;
    ALLOWED_ORIGINS: string;
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}
