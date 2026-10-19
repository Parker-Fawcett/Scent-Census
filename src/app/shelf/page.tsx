import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeShelfWorth } from "@/server/marketData";
import { listCollection, type CollectionRow } from "@/server/collection";
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
    <li style={{ padding: "0.75rem 0", borderBottom: "1px solid #eee" }}>
      <strong>{row.fragrance.name}</strong>
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
      <form action={removeBottleAction}>
        <input type="hidden" name="itemId" value={row.id} />
        <button type="submit">Remove</button>
      </form>
    </li>
  );
}

async function ShelfData() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const rows = await listCollection(prisma, session.user.id);
  const summary = await computeShelfWorth(prisma, session.user.id, new Date());

  if (rows.length === 0) {
    return (
      <section>
        <h2>Your shelf is empty</h2>
        <p>
          Add a bottle and your homepage starts working from it. The shelf is
          the taste signal; there is no other onboarding step waiting for you.
        </p>
      </section>
    );
  }

  const worth = summary.totalWorthCents;
  return (
    <section>
      <h2>Worth summary</h2>      <p>
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
      <p style={{ color: "#666", fontSize: "0.9rem" }}>
        Ranges are trimmed means over live eBay asking prices, 30 day window.
        Asking prices, not sold prices.
      </p>

      <h2>Shelf</h2>
      <ul style={{ padding: 0, listStyle: "none" }}>
        {rows.map((row) => (
          <BottleCard key={row.id} row={row} summary={summary} />
        ))}
      </ul>
    </section>
  );
}

export default function ShelfPage() {
  return (
    <main style={{ maxWidth: 640, margin: "3rem auto", padding: "0 1rem" }}>
      <h1>Your shelf</h1>
      <p>
        <a href="/shelf/add">Add a bottle</a>
      </p>
      <Suspense fallback={<p>Loading your shelf...</p>}>
        <ShelfData />
      </Suspense>
    </main>
  );
}
