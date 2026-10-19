// M3 integration: account creation and onboarding persistence. Auth lives at
// the DB layer first (real hashing, real uniqueness), so the Next.js surface
// builimin in src/lib/auth.ts stays a thin config over tested functions.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaInstance } from "@/lib/prisma";
import { registerUser, saveOnboarding, verifyCredentials } from "@/server/users";

const TEST_URL = process.env.TEST_DATABASE_URL;
if (!TEST_URL) {
  throw new Error("TEST_DATABASE_URL not set; export it to run integration tests");
}

let prisma: PrismaInstance;

beforeAll(() => {
  prisma = createPrismaClient(TEST_URL);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const email = () => `${crypto.randomUUID()}@test.local`;

describe("registerUser", () => {
  it("creates a credentials user with a bcrypt hash that verifies", async () => {
    const user = await registerUser(prisma, { email: email(), password: "correct horse battery" });
    const hash = user.passwordHash;
    if (!hash) throw new Error("credentials user must carry a password hash");
    expect(hash.includes("correct horse")).toBe(false);
  });

  it("rejects duplicate emails loud, whatever the casing", async () => {
    const shared = email();
    await registerUser(prisma, { email: shared, password: "correct horse battery" });
    await expect(
      registerUser(prisma, { email: shared.toUpperCase(), password: "correct horse battery" }),
    ).rejects.toThrow(/already/i);
  });

  it("refuses weak and empty passwords", async () => {
    await expect(
      registerUser(prisma, { email: email(), password: "short" }),
    ).rejects.toThrow(/8 characters/i);
    await expect(
      registerUser(prisma, { email: email(), password: "" }),
    ).rejects.toThrow(/8 characters/i);
  });

  it("refuses passwords longer than 72 bytes, instead of bcrypt silently truncating them", async () => {
    // bcrypt only digests the first 72 bytes; accepting an 80-character
    // password would make character 73..80 decorative and the user misled
    const long = "a".repeat(73);
    await expect(
      registerUser(prisma, { email: email(), password: long }),
    ).rejects.toThrow(/72/i);
  });

  it("refuses strings that are not email-shaped", async () => {
    await expect(
      registerUser(prisma, { email: "not-an-email", password: "correct horse battery" }),
    ).rejects.toThrow(/email/i);
    await expect(
      registerUser(prisma, { email: "a@b@x", password: "correct horse battery" }),
    ).rejects.toThrow(/email/i);
    await expect(
      registerUser(prisma, { email: "@test.local", password: "correct horse battery" }),
    ).rejects.toThrow(/email/i);
  });
});

describe("verifyCredentials", () => {
  it("returns the user for the right password and null otherwise", async () => {
    const address = email();
    await registerUser(prisma, { email: address, password: "correct horse battery" });
    expect(await verifyCredentials(prisma, { email: address, password: "correct horse battery" })).toBeTruthy();
    expect(await verifyCredentials(prisma, { email: address, password: "wrong" })).toBeNull();
    expect(await verifyCredentials(prisma, { email: "nobody@x.test", password: "whatever" })).toBeNull();
  });
});

describe("saveOnboarding", () => {
  it("persists the three answers", async () => {
    const user = await registerUser(prisma, { email: email(), password: "correct horse battery" });
    await saveOnboarding(prisma, user.id, {
      budgetBand: "50-150",
      cloneBand: "only-the-good-ones",
      accordPrefs: ["fresh", "woody"],
    });
    const saved = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(saved.budgetBand).toBe("50-150");
    expect(saved.cloneBand).toBe("only-the-good-ones");
    expect(saved.accordPrefs).toEqual(["fresh", "woody"]);
  });

  it("merges: skipping a field on re-save keeps the earlier answer", async () => {
    const user = await registerUser(prisma, { email: email(), password: "correct horse battery" });
    await saveOnboarding(prisma, user.id, {
      budgetBand: "150-400",
      cloneBand: "original-only",
      accordPrefs: ["amber"],
    });
    await saveOnboarding(prisma, user.id, { budgetBand: "no-ceiling", cloneBand: null, accordPrefs: undefined });
    const saved = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(saved.budgetBand).toBe("no-ceiling");
    expect(saved.cloneBand).toBe("original-only");
    expect(saved.accordPrefs).toEqual(["amber"]);
  });
});
