import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadAccordChips } from "@/server/families";

export const metadata: Metadata = {
  title: "Explore clone families",
  description:
    "Browse every original with a measured clone family in the index, with the census page for each one.",
};

// These pages depend on runtime data, so they render per request instead of
// being prerendered at build time. A prerendered shell goes stale the moment
// the data changes, and the CDN then serves a shell whose flight payload
// references chunks from a build that no longer exists. The result is a page
// that streams its content and never renders it: the reader sees "Loading..."
// forever while the server response looks perfectly fine.
//
// With Cache Components enabled, "instant = false" allows this route to
// block on request-time data instead of being prerendered, and connection()
// at the page level is what makes it request-time.
export const instant = false;

const PAGE_SIZE = 40;

interface Params {
  searchParams: Promise<{ page?: string }>;
}

export default async function ExplorePage({ searchParams }: Params) {
  await connection();
  const { page: rawPage } = await searchParams;
  const page = Math.max(1, Number(rawPage ?? "1") || 1);

  // The family comes from the smell-alike EDGES, not from the canon
  // relation. The canon table is the 34 hand-curated pairs; the edge table is
  // the whole measured graph, so a family here is every clone the community
  // has voted on, which is 8,500 originals rather than 16.
  const originals = await prisma.fragrance.findMany({
    where: { inspiredEdgesAsTarget: { some: {} } },
    orderBy: [{ popularityMagnitude: "desc" }, { name: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      name: true,
      slug: true,
      year: true,
      house: { select: { name: true, slug: true } },
      inspiredEdgesAsTarget: {
        select: {
          clone: { select: { name: true, slug: true } },
          upVotes: true,
          downVotes: true,
        },
      },
    },
  });

  const [total, chips] = await Promise.all([
    prisma.fragrance.count({ where: { inspiredEdgesAsTarget: { some: {} } } }),
    loadAccordChips(prisma),
  ]);
  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <main className="page">
      <header className="page-head">
        <p className="label">The index</p>
        <h1 className="page-title">Explore clone families</h1>
        <p className="lede">
          Start from a smell you can name, or pick an original and read the
          census on it.
        </p>
      </header>

      {chips.length > 0 && (
        <section className="rule-heavy" aria-label="Browse by accord">
          <p className="label">Start with a family</p>
          <div className="families-row">
            {chips.map((c) => (
              <Link key={c.slug} href={`/accord/${c.slug}`} className="families-chip">
                {c.name}
                <span className="families-chip-count">{c.count.toLocaleString("en-US")}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {originals.length === 0 ? (
        <div className="empty" style={{ marginTop: "3rem" }}>
          <p className="title">No families to show yet</p>
          <p className="sub">The census needs votes before it can list a family.</p>
        </div>
      ) : (
        <>
          <p className="fine" style={{ margin: "2.5rem 0 0.9rem" }}>
            {total.toLocaleString("en-US")} originals have a measured clone
            family in the index. Sorted by how much attention the original
            has drawn.
          </p>
          <ul className="index-list">
            {originals.map((o) => {
              const count = o.inspiredEdgesAsTarget.length;
              return (
                <li key={o.id}>
                  <div className="index-row">
                    <Link href={`/fragrance/${o.slug}`} className="index-name">
                      {o.name}
                    </Link>
                    <span className="index-figure">
                      <b>{count}</b> {count === 1 ? "clone" : "clones"}
                    </span>
                  </div>
                  <p className="fine" style={{ marginTop: "0.15rem" }}>
                    <Link href={`/house/${o.house.slug}`}>{o.house.name}</Link>
                    {o.year !== null ? ` · ${o.year}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
          {pages > 1 ? (
            <nav className="index-nav" aria-label="Pagination">
              {page > 1 ? (
                <Link href={`/explore?page=${page - 1}`}>Previous</Link>
              ) : null}
              <span className="muted">
                Page {page} of {pages}
              </span>
              {page < pages ? (
                <Link href={`/explore?page=${page + 1}`}>Next</Link>
              ) : null}
            </nav>
          ) : null}
        </>
      )}
    </main>
  );
}
