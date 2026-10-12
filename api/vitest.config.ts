import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations");
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        // the real AI binding needs a Cloudflare login; tests pass a fake instead
        remoteBindings: false,
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations, ALLOWED_ORIGINS: "http://localhost:5173" },
        },
      }),
    ],
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
    },
  };
});
