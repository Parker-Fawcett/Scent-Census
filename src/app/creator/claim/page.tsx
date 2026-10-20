import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { claimCreatorAction } from "./actions";

export const metadata: Metadata = { title: "Claim a creator account" };

interface Params {
  searchParams: Promise<{ claimed?: string; error?: string }>;
}

export default async function ClaimPage({ searchParams }: Params) {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <ClaimContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ClaimContent({ searchParams }: Params) {
  await connection();
  const params = await searchParams;
  return (
    <main style={{ maxWidth: 560, margin: "3rem auto", padding: "0 1rem" }}>
      <h1>Claim a creator account</h1>
      <p>
        Creator accounts are claim-based: we invite, you claim. Paste the token from your invite; no fan pages are ever created.
      </p>
      {params.claimed ? <p>Claimed: {params.claimed}</p> : null}
      {params.error ? <p>Not claimed: {params.error}</p> : null}
      <form action={claimCreatorAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <label>
          Claim token
          <input name="token" type="text" required style={{ width: "100%" }} />
        </label>
        <button type="submit">Claim creator account</button>
      </form>
    </main>
  );
}
