// The single reader of environment values (STACK.md decision). Nothing outside
// this file may touch process.env; the ESLint rule enforces it. Values must
// exist at boot or the app crashes loudly, the opposite of the old repo's
// silent fallback secrets.
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment value: ${name} (keys only in .env.example, values never committed)`,
    );
  }
  return value;
}

export const env = {
  databaseUrl: requireEnv("DATABASE_URL"),
  authSecret: requireEnv("AUTH_SECRET"),
  // OAuth is optional at boot: missing keys disable the provider instead of
  // killing the app, but the one requirement (auth secret) stays loud.
  googleClientId: process.env["GOOGLE_CLIENT_ID"] ?? null,
  googleClientSecret: process.env["GOOGLE_CLIENT_SECRET"] ?? null,
  // Vercel cron authenticates with this shared secret (Hobby tier, daily).
  // Missing in dev simply disables cron endpoints.
  cronSecret: process.env["CRON_SECRET"] ?? null,
} as const;
