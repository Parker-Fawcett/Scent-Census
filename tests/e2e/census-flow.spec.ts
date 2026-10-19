// The M5 census path, end to end over real HTTP: a curated clone edge
// seeds a census universe, a registered user votes a closeness bucket from
// the public product page, the page shows their revisionable vote plus the
// honest community state (one vote, unranked), and the clone's own page
// shows the same pair from the other side. No mocks; the fragrance rows and
// the inspiredBy edge are real inserts, the census math is the production
// rollup path.

import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: { db: { url: "postgresql://scent:scent-test@localhost:5545/scent_test" } },
});
const RUN = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const TARGET_SLUG = `e2e-census-target-${RUN}`;
const CLONE_SLUG = `e2e-census-clone-${RUN}`;
const email = `${RUN}@e2e.test`;
const password = "correct horse battery";

test.beforeAll(async () => {
  const house = await prisma.house.create({
    data: { name: `Census E2E House ${RUN}`, slug: `census-e2e-house-${RUN}`, tier: "DESIGNER" },
  });
  const target = await prisma.fragrance.create({
    data: { name: `Census E2E Original ${RUN}`, slug: TARGET_SLUG, houseId: house.id, year: 2015, accords: [] },
  });
  const clone = await prisma.fragrance.create({
    data: { name: `Census E2E Clone ${RUN}`, slug: CLONE_SLUG, houseId: house.id, year: 2024, accords: [] },
  });
  await prisma.fragrance.update({ where: { id: clone.id }, data: { inspiredById: target.id } });
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function registerAndOnboard(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("link", { name: "Start with your email" }).click();
  const registerSection = page.locator("section", { hasText: "New here" });
  await registerSection.getByLabel("Email").fill(email);
  await registerSection.getByLabel("Password").fill(password);
  await registerSection.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/onboarding/);
  // every onboarding field stays skippable through the census
  await page.getByRole("button", { name: "Save and see your shelf" }).click();
  await expect(page).toHaveURL(/shelf/);
}

test("product page census: vote from the target page, revise it, see it from the clone page", async ({ page }) => {
  await registerAndOnboard(page);

  // target page: the curated clone is in the census universe as unranked
  await page.goto(`/fragrance/${TARGET_SLUG}`);
  await expect(page.getByRole("heading", { name: `Census E2E Original ${RUN}` })).toBeVisible();
  const cloneRow = page.locator("li", { hasText: `Census E2E Clone ${RUN}` });
  await expect(cloneRow.getByText("Unranked")).toBeVisible();
  await expect(cloneRow.getByText("0 votes", { exact: false })).toBeVisible();

  // vote CLOSE for the clone on the target page: the page records it and
  // renders the community state honestly (a single vote stays unranked)
  await cloneRow.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByText(`Your vote: Close`)).toBeVisible();
  await expect(cloneRow.getByText("1 vote", { exact: false })).toBeVisible();

  // revise: SPOT_ON replaces the earlier bucket instead of appending
  await cloneRow.getByRole("button", { name: "Spot on", exact: true }).click();
  await expect(page.getByText(`Your vote: Spot on`)).toBeVisible();

  // clone page: the same pair from the inspiration side, one canon target
  await page.goto(`/fragrance/${CLONE_SLUG}`);
  const pairCard = page.locator("section", { hasText: "Inspired by" });
  await expect(pairCard.getByText(`Census E2E Original ${RUN}`)).toBeVisible();
  await expect(pairCard.getByText(`Your vote: Spot on`)).toBeVisible();

  // unknown slugs hit the not-found UI. The 200 status is a streaming side
  // effect: the shell commits before the Suspense-boundary slug lookup can
  // call notFound(), so the truth lives in the rendered content, not the
  // online status line
  await page.goto(`/fragrance/no-such-fragrance-${RUN}`);
  await expect(page.getByText(/could not be found/)).toBeVisible();
});
