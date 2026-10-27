import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { claimCreatorAction } from "./actions";

// These pages depend on runtime data (the census, prices, a family graph),
// so they render per request instead of being prerendered at build time. A
// prerendered shell goes stale the moment the data changes, and the CDN then
// serves a shell whose flight payload references chunks from a build that no
// longer exists. The result is a page that streams its content and never
// renders it: the reader sees "Loading..." forever while the server response
// looks perfectly fine.
//
// With Cache Components enabled, "instant = false" allows this route to
// block on request-time data instead of being prerendered, and connection()
// at the page level is what makes it request-time.
export const instant = false;

export const metadata: Metadata = { title: "Claim a creator account" };

interface Params {
  searchParams: Promise<{ claimed?: string; error?: string }>;
}

export default async function ClaimPage({ searchParams }: Params) {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <ClaimContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ClaimContent({ searchParams }: Params) {
  await connection();
  const params = await searchParams;
  return (
    <main className="page page-narrow">
      <header className="page-head">
        <p className="label">Creator</p>
        <h1 className="page-title">Claim a creator account</h1>
        <p className="lede">
          Creator accounts are claim-based: we invite, you claim. Paste the
          token from your invite. No fan pages are ever created.
        </p>
      </header>
      <div className="rule-heavy" style={{ marginTop: "2.5rem" }}>
        {params.claimed ? <p>Claimed: {params.claimed}</p> : null}
        {params.error ? <p>Not claimed: {params.error}</p> : null}
        <form action={claimCreatorAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", alignItems: "flex-start" }}>
          <label className="form-field" style={{ width: "100%" }}>
            <span className="form-field-label">Claim token</span>
            <input name="token" type="text" required />
          </label>
          <button type="submit" className="btn" style={{ marginTop: "0.5rem" }}>
            Claim creator account
          </button>
        </form>
      </div>
    </main>
  );
}
