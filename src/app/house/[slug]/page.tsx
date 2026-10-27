import Link from "next/link";
import type { Metadata } from "next";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";

interface Params {
  params: Promise<{ slug: string }>;
}

async function houseData(slug: string) {
  const house = await prisma.house.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      tier: true,
      fragrances: {
        orderBy: { popularityMagnitude: { sort: "desc", nulls: "last" } },
        take: 60,
        select: {
          id: true,
          name: true,
          slug: true,
          year: true,
          inspiredById: true,
          inspiredEdgesAsTarget: { select: { cloneId: true } },
        },
      },
    },
  });
  if (house === null) return null;
  const total = await prisma.fragrance.count({ where: { houseId: house.id } });
  return { house, total };
}

// The page depends on runtime data (the census, prices, a family graph), so
// it must not be a build-time prerender. A prerendered shell goes stale the
// moment the data changes, and the CDN then serves a shell whose flight
// payload references chunks from a build that no longer exists, which is a
// page that streams its content and never renders it.
//
// With Cache Components enabled, "instant = false" is the mechanism: the
// page waits for the data and renders once, instead of prerendering a shell.
export const instant = false;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const house = await prisma.house.findUnique({
    where: { slug },
    select: { name: true },
  });
  if (house === null) return { title: "House not found" };
  return {
    title: `${house.name} fragrances`,
    description: `Every ${house.name} fragrance in the Scent Census, with the clones tracked for each one.`,
  };
}

// The page reads the slug at the PAGE level, which makes the route fully
// dynamic (build output shows ƒ, not ◐). A page that reads params inside
// the Suspense boundary stays a partial prerender, and the CDN then serves
// a prerendered shell whose flight payload references chunks from a build
// that no longer exists: the page streams its content and never renders it,
// so the reader sees "Loading the house..." forever.
export default async function HousePage({ params }: Params) {
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
  const { slug } = await params;
  return (
    <main className="page">
      <HouseContent slug={slug} />
    </main>
  );
}

async function HouseContent({ slug }: { slug: string }) {
  const data = await houseData(slug);
  if (data === null) {
    return (
      <div className="card">
        <h1 className="page-title">No such house</h1>
        <p className="muted" style={{ marginTop: "0.6rem" }}>
          We do not have a house by that name. Try searching the catalogue.
        </p>
      </div>
    );
  }
  const { house, total } = data;
  const withClones = house.fragrances.filter((f) => f.inspiredEdgesAsTarget.length > 0);

  return (
    <>
      <header className="page-head">
        <p className="label">{house.tier === "CLONE" ? "Clone house" : "House"}</p>
        <h1 className="page-title">{house.name}</h1>
        <p className="lede">
          {total.toLocaleString("en-US")} fragrances in the catalogue.
          {withClones.length > 0
            ? ` ${withClones.length} of the ${house.fragrances.length} shown have clones tracked in the index.`
            : ""}
        </p>
      </header>

      {withClones.length > 0 ? (
        <section className="rule-heavy" style={{ marginTop: "3rem" }}>
          <p className="label">Has clones</p>
          <ul className="index-list" style={{ marginTop: "1rem" }}>
            {withClones.map((f) => (
              <li key={f.id}>
                <div className="index-row">
                  <Link href={`/fragrance/${f.slug}`} className="index-name">
                    {f.name}
                  </Link>
                  <span className="index-figure">
                    <b>{f.inspiredEdgesAsTarget.length}</b>{" "}
                    {f.inspiredEdgesAsTarget.length === 1 ? "clone" : "clones"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rule-heavy" style={{ marginTop: "3.5rem" }}>
        <p className="label">All fragrances</p>
        <ul className="index-list" style={{ marginTop: "1rem" }}>
          {house.fragrances.map((f) => (
            <li key={f.id}>
              <div className="index-row">
                <Link href={`/fragrance/${f.slug}`} className="index-name">
                  {f.name}
                </Link>
                <span className="index-figure figure">{f.year ?? ""}</span>
              </div>
            </li>
          ))}
        </ul>
        {total > house.fragrances.length ? (
          <p className="fine" style={{ marginTop: "1rem" }}>
            Showing the {house.fragrances.length} most talked about.{" "}
            <Link href={`/search?q=${encodeURIComponent(house.name)}`} className="textlink">
              Search the rest
            </Link>
            .
          </p>
        ) : null}
      </section>
    </>
  );
}
