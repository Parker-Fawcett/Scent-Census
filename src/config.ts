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
} as const;
