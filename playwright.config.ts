import { defineConfig } from "@playwright/test";

// E2E never targets prod (STACK.md rule). The webServer here is a throwaway
// dev server (next dev) on port 3100 pointed at the docker TEST database;
// the same DB the integration tests use, migrated by `npm run test:e2e`
// before Playwright boots the server. Fail loud offline: docker must be up.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3100",
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
  },
  expect: { timeout: 15_000 },
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: "postgresql://scent:scent-test@localhost:5545/scent_test",
      TEST_DATABASE_URL: "postgresql://scent:scent-test@localhost:5545/scent_test",
      AUTH_SECRET: "e2e-only-secret-not-for-prod",
    },
  },
});
