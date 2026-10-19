// The M3 hero path, end to end over real HTTP against the real database:
// register -> onboarding (merge semantics on the real form) -> empty shelf ->
// search the catalogue -> add a bottle with a paid price -> shelf shows the
// honest worth summary -> remove -> empty again. No mocks anywhere; the
// catalogue rows come from the committed FragDB sample seed.

import { expect, test } from "@playwright/test";

const emailSuffix = () => `${Date.now()}-${crypto.randomUUID().slice(0, 6)}@e2e.test`;
let email: string;
const password = "correct horse battery";

test.beforeEach(() => {
  email = emailSuffix();
});

async function registerAndOnboard(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("link", { name: "Start with your email" }).click();

  const registerSection = page.locator("section", { hasText: "New here" });
  await registerSection.getByLabel("Email").fill(email);
  await registerSection.getByLabel("Password").fill(password);
  await registerSection.getByRole("button", { name: "Create account" }).click();

  // onboarding: every step skippable, but the hero path answers all three
  await expect(page).toHaveURL(/onboarding/);
  await page.getByLabel("Under $50").check();
  await page.getByLabel("Only the good ones").check();
  await page.getByLabel("woody").check();
  await page.getByRole("button", { name: "Save and see your shelf" }).click();
  await expect(page).toHaveURL(/shelf/);
}

test("register, onboard, shelf, add a bottle with honest worth, remove", async ({ page }) => {
  await registerAndOnboard(page);

  await expect(page.getByText("Your shelf is empty")).toBeVisible();

  // add: search hits the seeded FragDB sample catalogue
  await page.getByRole("link", { name: "Add a bottle" }).click();
  await page.getByPlaceholder("e.g. sauvage").fill("light blue");
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page.getByText("Light Blue")).toBeVisible();
  await page.getByLabel("Light Blue (Dolce&Gabbana, 2001)").check();
  await page.getByText("100ml").click();
  await page.getByPlaceholder("89.50").fill("89.50");
  await page.getByRole("button", { name: "Add to shelf" }).click();

  // shelf: the bottle is there, and the honesty contract is visible, not
  // invented: no price data means no price number. (Dev mode keeps the prior
  // page's search-result fragment in a hidden container, so assertions scope
  // to shelf-unique text: the card only exists here with "you paid".)
  await expect(page).toHaveURL(/shelf$/);
  await expect(page.locator("li", { hasText: "you paid $89.50" })).toBeVisible();
  await expect(page.getByText("no confident price")).toHaveCount(1);
  await expect(page.getByText("No market data for any bottle yet.")).toBeVisible();
  await expect(page.getByText("Cost basis $89.50.")).toBeVisible();
  await expect(page.getByText("No purchase prices entered yet.")).toHaveCount(0);

  // remove: the worth summary updates in the same render, no stale total
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Your shelf is empty")).toBeVisible();
  await expect(page.getByText("Cost basis")).toHaveCount(0);
});

test("skipping every onboarding field still lands on a working shelf", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Start with your email" }).click();
  const registerSection = page.locator("section", { hasText: "New here" });
  await registerSection.getByLabel("Email").fill(email);
  await registerSection.getByLabel("Password").fill(password);
  await registerSection.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/onboarding/);

  // skip everything
  await page.getByRole("button", { name: "Save and see your shelf" }).click();
  await expect(page).toHaveURL(/shelf/);
  await expect(page.getByText("Your shelf is empty")).toBeVisible();
});
