import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { searchCatalogue } from "@/server/catalogueSearch";
import AddBottleForm from "./AddBottleForm";

interface Params {
  searchParams: Promise<{ q?: string }>;
}

async function AddData({ searchParams }: Params) {
  // Explicit request-time marker (see note in shelf/page.tsx: next-auth's
  // auth() generates a CSRF random internally on cookie-less requests, which
  // Cache Components otherwise flags as an unstable prerender value).
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const query = (await searchParams).q ?? "";
  const hits = query === "" ? [] : await searchCatalogue(prisma, query, { limit: 20 });
  return <AddBottleForm query={query} hits={hits} />;
}

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

export default async function AddBottlePage({ searchParams }: Params) {
  // This page depends on runtime data (the census, prices, a family graph),
  // so it renders per request. A build-time prerender goes stale the moment
  // the data changes, and the CDN then serves a shell whose flight payload
  // references chunks from a build that no longer exists. The result is a page
  // that streams its content and never renders it: the reader sees
  // "Loading..." forever while the server response looks perfectly fine.
  //
  // With Cache Components enabled, connection() at the page level is what
  // makes the route request-time.
  await connection();
  return (
    <main className="page page-narrow">
      <header className="page-head">
        <p className="label">Your shelf</p>
        <h1 className="page-title">Add a bottle</h1>
        <p className="lede">
          Search the catalogue, pick the bottle, and the shelf does the rest.
        </p>
      </header>
      <div className="rule-heavy" style={{ marginTop: "2.5rem" }}>
        <Suspense fallback={<p className="loading">Loading the catalogue…</p>}>
          <AddData searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
