// Users repository: credentials registration, login verification, and
// onboarding persistence (PRD section 7.1). Registration routes duplicity
// through an honest error, never a silent upsert that could be mistaken for
// an account takeover; onboarding saves MERGE, because the spec says a
// skipped step must never freeze state.

import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
import { validateOnboarding, type RawOnboarding } from "@/domain/onboarding";
import type { PrismaInstance } from "@/lib/prisma";

const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;
// bcrypt digests only the first 72 BYTES and silently drops the rest, so an
// 80-character password would carry decorative tail characters the user
// believes protect them. Refuse above the digest window instead.
const MAX_PASSWORD_BYTES = 72;
// pragmatic email shape: one @, a non-empty local part, and a dot-separated
// domain at the end. Deliverability is not checked; that is the mail layer's
// job when creator invites get sent.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// a real bcrypt hash of an unrelated password, generated once on first use,
// so an unknown email still runs one full compare and the response times stop
// leaking "is this email registered" (registration duplicity is routed as an
// honest error anyway, but the login endpoint serves strangers)
let dummyHash: string | null = null;
async function getDummyHash(): Promise<string> {
  if (dummyHash === null) dummyHash = await bcrypt.hash("scent-census-unknown-user", BCRYPT_ROUNDS);
  return dummyHash;
}

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
  if (!EMAIL_SHAPE.test(normalized)) {
    throw new Error(`register: not an email address (${normalized})`);
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`register: password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (Buffer.byteLength(input.password, "utf8") > MAX_PASSWORD_BYTES) {
    throw new Error(
      `register: password must be at most ${MAX_PASSWORD_BYTES} bytes; bcrypt silently truncates longer ones`,
    );
  }
  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (existing) throw new Error(`register: email already registered (${normalized})`);

  try {
    return await prisma.user.create({
      data: {
        email: normalized,
        passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
      },
    });
  } catch (error) {
    // two concurrent registrations can both pass the findUnique above; the
    // unique constraint is the real arbiter, so a collision reads as the
    // honest "already registered" rather than a 500
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new Error(`register: email already registered (${normalized})`);
    }
    throw error;
  }
}

export async function verifyCredentials(
  prisma: PrismaInstance,
  input: RegisterInput,
): Promise<User | null> {
  const normalized = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user?.passwordHash) {
    // burn roughly the same time as a real compare so an unknown email does
    // not answer measurably faster than a wrong password
    await bcrypt.compare(input.password, await getDummyHash());
    return null;
  }
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
