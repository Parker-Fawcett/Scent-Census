// The single Prisma entry point (STACK.md decision: one client, one place).
// createPrismaClient takes an explicit URL so tests can point at the docker
// test database without touching process.env; the default `prisma` export is
// configured from src/config.ts, which crashed-at-boot is the loud failure.
// Tests use ONLY createPrismaClient; app code uses ONLY the default export.

import { PrismaClient } from "@prisma/client";
import { env } from "@/config";

export type PrismaInstance = PrismaClient;

export function createPrismaClient(databaseUrl: string): PrismaInstance {
  return new PrismaClient({ datasources: { db: { url: databaseUrl } } });
}

export const prisma = new PrismaClient({
  datasources: { db: { url: env.databaseUrl } },
});
