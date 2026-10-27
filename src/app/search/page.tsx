import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { BottleThumb } from "@/components/BottleThumb";
import { MATCH_LABELS, searchCatalogue } from "@/server/catalogueSearch";

// The page depends on the query string, so it blocks rather than streams.
// With Cache Components enabled, "instant = false" is the way to say that:
// the page waits for the query and renders once, instead of streaming a
// shell that the reader would stare at while it resolves.
export const instant = false;

export const metadata: Metadata = {
  title: "Search the catalogue",
  description:
    "Search 140,000 fragrances to open a census: the clones tracked for that scent, and the votes cast on them.",
};

interface Params {
  searchParams: Promise<{ q?: string }>;
}

export default async function SearchPage({ searchParams }: Params) {
  // This page depends on runtime data, so it renders per request. A
  // prerendered shell goes stale the moment the data changes, and the CDN
  // then serves a shell whose flight payload references chunks from a build
  // that no longer exists. The result is a page that streams its content and
  // never renders it: the reader sees "Loading..." forever while the server
  // response looks perfectly fine.
  //
  // With Cache Components enabled, connection() at the page level is what
  // makes the route request-time.
  await connection();
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  // The results are rendered on the server, not fetched from the browser.
  // A client fetch meant the page could sit on an empty result set while
  // the request was in flight, and it meant a second round trip for data
  // the server already had.
  const hits = query === "" ? [] : await searchCatalogue(prisma, query, { limit: 60 });

  return (
    <main className="page">
      <header className="page-head">
        <p className="label">The catalogue</p>
        <h1 className="page-title">Search</h1>
        <p className="lede">
          140,228 fragrances across 8,274 houses. Search a scent to open its
          census: the clones tracked for that scent, and the votes cast on
          them.
        </p>
      </header>

      <form action="/search" method="get" style={{ margin: "2.25rem 0 0" }}>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end" }}>
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Aventus, Creed, Turathi Blue"
            aria-label="Search the catalogue"
            autoFocus={query === ""}
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn">
            Search
          </button>
        </div>
      </form>

      {query === "" ? (
        <div className="empty" style={{ marginTop: "2.5rem" }}>
          <p className="title">Type a fragrance or a house</p>
          <p className="sub">
            You do not have to get it exact. “lattfa” still finds Lattafa, and
            “turathi blue” still finds Turathi Blue. A search for a house name
            brings up that house’s catalogue.
          </p>
        </div>
      ) : hits.length === 0 ? (
        <div className="empty" style={{ marginTop: "2.5rem" }}>
          <p className="title">Nothing in the catalogue matches {query}</p>
          <p className="sub">
            The catalogue holds 140,228 fragrances, so a misspelling is the
            likely cause. Try the house name instead, like “Creed” or “Aventus”.
          </p>
        </div>
      ) : (
        <>
          <p className="fine" style={{ margin: "2.5rem 0 0" }}>
            {hits.length} {hits.length === 1 ? "result" : "results"} for {query}.
          </p>
          <ul className="plate-grid">
            {hits.map((hit) => {
              return (
                <li key={hit.id}>
                  <Link href={`/fragrance/${hit.slug}`} className="plate-card">
                    <span className="plate-figure">
                      <BottleThumb pid={hit.pid} name={hit.name} />
                    </span>
                    <span className="plate-name">{hit.name}</span>
                    <span className="plate-house">
                      {hit.house}
                      {hit.year !== null ? ` · ${hit.year}` : ""}
                    </span>
                    <span className="plate-foot">
                      {hit.cloneCount > 0 ? (
                        <span className="plate-clones">
                          {hit.cloneCount} {hit.cloneCount === 1 ? "clone" : "clones"}
                        </span>
                      ) : null}
                      <span className="plate-kind">{MATCH_LABELS[hit.matchKind]}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </main>
  );
}
