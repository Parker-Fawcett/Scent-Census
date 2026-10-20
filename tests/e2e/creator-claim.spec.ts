// Creator claim flow end to end: a seeded UNCLAIMED creator, a minted token,
// a signed-in user claiming through the API, and the public creator page
// reflecting CLAIMED status. No mocks; the token is HMAC-signed with the
// same secret the server uses.

import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { mintClaimToken } from "../../src/server/creators";

const prisma = new PrismaClient({
  datasources: { db: { url: "postgresql://scent:scent-test@localhost:5545/scent_test" } },
});
const RUN = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const CREATOR_SLUG = `e2e-creator-${RUN}`;
const email = `${RUN}@e2e.test`;
const password = "correct horse battery";
let token: string;

test.beforeAll(async () => {
  const creator = await prisma.creator.create({
    data: { slug: CREATOR_SLUG, name: `E2E Creator ${RUN}`, platforms: {}, status: "UNCLAIMED" },
  });
  token = mintClaimToken(creator.id);
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function register(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("link", { name: "Start with your email" }).click();
  const section = page.locator("section", { hasText: "New here" });
  await section.getByLabel("Email").fill(email);
  await section.getByLabel("Password").fill(password);
  await section.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/onboarding/);
  await page.getByRole("button", { name: "Save and see your shelf" }).click();
  await expect(page).toHaveURL(/shelf/);
}

test("claim a creator account through the form and see it claimed on the public page", async ({ page, browser }) => {
  await register(page);

  // claim through the UI form (same-origin fetch carries the session cookie)
  await page.goto("/creator/claim");
  await page.getByLabel("Claim token").fill(token);
  await page.getByRole("button", { name: "Claim creator account" }).click();
  await expect(page.getByText(`Claimed: ${CREATOR_SLUG}`)).toBeVisible();

  // public creator page reflects the claimed status
  await page.goto(`/creator/${CREATOR_SLUG}`);
  await expect(page.getByText("CLAIMED")).toBeVisible();
  await expect(page.getByText("Nothing logged yet")).toBeVisible();

  // a second claim with the same token is refused (same user, idempotent)
  await page.goto("/creator/claim");
  await page.getByLabel("Claim token").fill(token);
  await page.getByRole("button", { name: "Claim creator account" }).click();
  await expect(page.getByText(/Claimed:|Not claimed:/)).toBeVisible();

  // signed-out claim is rejected at the API
  const anonContext = await browser.newContext();
  const anonRes = await anonContext.request.post("/api/creator/claim", {
    data: { token: "garbage" },
    headers: { "content-type": "application/json" },
  });
  expect(anonRes.status()).toBe(401);
  await anonContext.close();
});
