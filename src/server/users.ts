// Users repository: credentials registration, login verification, and
// onboarding persistence (PRD section 7.1). Registration routes duplicity
// through an honest error, never a silent upsert that could be mistaken for
// an account takeover; onboarding saves MERGE, because the spec says a
// skipped step must never freeze state.

import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
import { validateOnboarding, type RawOnboarding } from "@/domain/onboarding";
import type { PrismaInstance } from "@/lib/prisma";

const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

export interface RegisterInput {
  email: string;
  password: string;
}

export async function registerUser(
  prisma: PrismaInstance,
  input: RegisterInput,
): Promise<User> {
  const normalized = input.email.trim().toLowerCase();
  if (normalized.length === 0) throw new Error("register: email is required");
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`register: password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (existing) throw new Error(`register: email already registered (${normalized})`);

  return prisma.user.create({
    data: {
      email: normalized,
      passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
    },
  });
}

export async function verifyCredentials(
  prisma: PrismaInstance,
  input: RegisterInput,
): Promise<User | null> {
  const normalized = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user?.passwordHash) return null;
  const ok = await bcrypt.compare(input.password, user.passwordHash);
  return ok ? user : null;
}

export async function saveOnboarding(
  prisma: PrismaInstance,
  userId: string,
  raw: RawOnboarding,
): Promise<User> {
  const parsed = validateOnboarding(raw);
  // merge semantics: a field left null/undefined keeps its previous value,
  // so a resubmitted partial form never erases an earlier answer
  return prisma.user.update({
    where: { id: userId },
    data: {
      ...(parsed.budgetBand !== null ? { budgetBand: parsed.budgetBand } : {}),
      ...(parsed.cloneBand !== null ? { cloneBand: parsed.cloneBand } : {}),
      ...(parsed.accordPrefs.length > 0 ? { accordPrefs: parsed.accordPrefs } : {}),
    },
  });
}
