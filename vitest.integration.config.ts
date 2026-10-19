import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Integration tests only: they migrate and write against the docker test DB
// (docker-compose.yml db-test, TEST_DATABASE_URL). Never pointed at prod; the
// default `npm test` stays unit-only and dependency-free.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
  },
});
