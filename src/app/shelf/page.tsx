import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeShelfWorth } from "@/server/marketData";
import { listCollection, type CollectionRow } from "@/server/collection";
import { BottleThumb } from "@/components/BottleThumb";
import type { ShelfSummary } from "@/domain/worth";
import { removeBottleAction } from "./removeAction";

const cents = (value: number): string => `$${(value / 100).toFixed(2)}`;

function BottleCard({ row, summary }: { row: CollectionRow; summary: ShelfSummary }) {
  const bottle = summary.bottles.find((b) => b.itemId === row.id);
  const rented =
    row.purchasedOn !== null
      ? row.purchasedOn.toISOString().slice(0, 10)
      : null;

  return (
    <li>
      <div className="shelf-row">
        <Link
          href={`/fragrance/${row.fragrance.slug}`}
          className="census-thumb"
          aria-label={row.fragrance.name}
        >
          <BottleThumb pid={row.fragrance.catalogueSourcePid} name={row.fragrance.name} />
        </Link>
        <div style={{ minWidth: 0 }}>
          <strong><Link href={`/fragrance/${row.fragrance.slug}`}>{row.fragrance.name}</Link></strong>
          {" · "}
          {row.fragrance.house.name}
          {row.sizeMl !== null ? ` · ${row.sizeMl}ml` : ""}
          <div>
            {bottle && bottle.midCents !== null ? (
              <>
                {bottle.status === "thin" ? "thin data: " : ""}
                asking {cents(bottle.lowCents ?? 0)} to {cents(bottle.highCents ?? 0)} (eBay asks)
              </>
            ) : (
              "no confident price"
            )}
            {row.pricePaidCents !== null ? (
              <>
                {" · you paid "}
                {cents(row.pricePaidCents)}
                {rented ? ` on ${rented}` : ""}
              </>
            ) : null}
          </div>
          <form action={removeBottleAction} style={{ marginTop: "0.35rem" }}>
            <input type="hidden" name="itemId" value={row.id} />
            <button type="submit" className="quiet">Remove</button>
          </form>
        </div>
      </div>
    </li>
  );
}

async function ShelfData() {
  // Explicit request-time marker (Cache Components "dynamic" pattern).
  // Why it is needed: every auth() call runs next-auth's internal init(),
  // which generates a fresh CSRF token via crypto random when the request
  // carries no csrf cookie (first visit, prerender passes). Random values
  // before any dynamic access are blocked during prerendering, so the
  // component must declare itself request-time with connection() first.
  // Empirically confirmed by bisecting the dev insight
  // "unstable value crypto.getRandomValues()" down to
  // @auth/core/lib/.../csrf-token.js -> randomString().
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const rows = await listCollection(prisma, session.user.id);
  const summary = await computeShelfWorth(prisma, session.user.id, new Date());

  if (rows.length === 0) {
    return (
      <div className="empty" style={{ marginTop: "2rem" }}>
        <p className="title">Your shelf is empty</p>
        <p className="sub">
          Add one bottle and the homepage starts earning its keep. The shelf is
          the entire taste signal here, so there is no questionnaire waiting
          behind another click. Small sizes count. Partials count. Guilty
          pleasure bottles count too.
        </p>
        <p className="fine" style={{ marginTop: "0.75rem" }}>
          Rough estimates of what you paid are welcome.
        </p>
      </div>
    );
  }

  const worth = summary.totalWorthCents;
  return (
    <>
      <section className="rule-heavy">
        <p className="label">Worth summary</p>
        <p style={{ marginTop: "0.75rem" }}>
          {worth !== null ? (
            <>
              Estimated worth {summary.bottlesWithMarket} of {summary.bottlesTotal} bottles
              with market data: {cents(worth.low)} to {cents(worth.high)} (mid{" "}
              {cents(worth.mid)}){" "}
            </>
          ) : (
            <>No market data for any bottle yet. </>
          )}
          {summary.costBasisCents !== null ? (
            <>Cost basis {cents(summary.costBasisCents)}. </>
          ) : (
            <>No purchase prices entered yet. </>
          )}
          {summary.deltaCents !== null ? <>Delta {cents(summary.deltaCents)} (mid worth minus what you paid)</> : null}
        </p>
        <p className="fine" style={{ marginTop: "0.75rem" }}>
          Ranges are trimmed means over live asking prices, 30 day window.
          Asking prices, not sold prices.
        </p>
      </section>

      <section className="rule-heavy" style={{ marginTop: "3rem" }}>
        <p className="label">Shelf</p>
        <ul className="index-list" style={{ marginTop: "1rem" }}>
          {rows.map((row) => (
            <BottleCard key={row.id} row={row} summary={summary} />
          ))}
        </ul>
      </section>
    </>
  );
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

export default async function ShelfPage() {
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
    <main className="page">
      <header className="page-head">
        <p className="label">Your collection</p>
        <h1 className="page-title">Your shelf</h1>
        <p className="lede" style={{ marginTop: "1rem" }}>
          Every bottle you own, and what it is worth against live asking
          prices.
        </p>
        <p style={{ marginTop: "1.5rem", display: "flex", gap: "1.25rem", alignItems: "center" }}>
          <a href="/shelf/add" className="btn secondary">Add a bottle</a>
          <Link href="/" className="textlink">Your picks</Link>
        </p>
      </header>
      <div style={{ marginTop: "2.5rem" }}>
      <Suspense fallback={<p className="loading">Loading your shelf…</p>}>
        <ShelfData />
      </Suspense>
      </div>
    </main>
  );
}
