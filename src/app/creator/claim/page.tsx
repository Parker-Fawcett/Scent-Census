import type { Metadata } from "next";
import { connection } from "next/server";
import ClaimForm from "./ClaimForm";

export const metadata: Metadata = { title: "Claim a creator account" };

export default async function ClaimPage() {
  await connection();
  return (
    <main style={{ maxWidth: 560, margin: "3rem auto", padding: "0 1rem" }}>
      <h1>Claim a creator account</h1>
      <p>
        Creator accounts are claim-based: we invite, you claim. Paste the token from your invite; no fan pages are ever created.
      </p>
      <ClaimForm />
    </main>
  );
}
