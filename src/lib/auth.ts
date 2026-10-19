// Next 16 + next-auth v5 (AGENTS.md: not the Next from training data; wired
// per node_modules/next/dist/docs). The DB truth lives in src/server/users.ts
// (tested); this file is only the Auth.js configuration over it.

import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { env } from "@/config";
import { prisma } from "@/lib/prisma";
import { verifyCredentials } from "@/server/users";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & { id: string };
  }
}

// The shelf, votes, and worth are all user-scoped; the id must survive the
// JWT round trip for Server Actions to scope every query.
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  trustHost: true,
  secret: env.authSecret,
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  callbacks: {
    jwt: ({ token, user }) => {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session: ({ session, token }) => {
      session.user.id = token.sub ?? "";
      return session;
    },
  },
  providers: [
    ...(env.googleClientId && env.googleClientSecret
      ? [
          Google({
            clientId: env.googleClientId,
            clientSecret: env.googleClientSecret,
          }),
        ]
      : []),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = typeof credentials.email === "string" ? credentials.email : "";
        const password = typeof credentials.password === "string" ? credentials.password : "";
        if (!email || !password) return null;
        const user = await verifyCredentials(prisma, { email, password });
        return user ?? null;
      },
    }),
  ],
});
