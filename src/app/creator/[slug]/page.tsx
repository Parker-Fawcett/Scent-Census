import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toggleFollowAction } from "@/app/fragrance/[slug]/censusActions";
import { logCreatorPickupAction } from "./creatorActions";

// The page depends on runtime data (the census, prices, a family graph), so
// it must not be a build-time prerender. A prerendered shell goes stale the
// moment the data changes, and the CDN then serves a shell whose flight
// payload references chunks from a build that no longer exists, which is a
// page that streams its content and never renders it.
//
// With Cache Components enabled, "instant = false" is the mechanism: the
// page waits for the data and renders once, instead of prerendering a shell.
export const instant = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const creator = await prisma.creator.findUnique({
    where: { slug },
    select: { name: true, status: true },
  });
  if (creator === null) return { title: "Creator not found" };
  return {
    title: creator.name,
    description:
      creator.status === "CLAIMED"
        ? `${creator.name} on the Scent Census: their own pickup and review log, vote bursts included.`
        : `${creator.name} is a verified creator in the Scent Census roster. Their pickups and vote bursts land here.`,
  };
}

async function CreatorData({ slug }: { slug: string }) {
  await connection();
  const creator = await prisma.creator.findUnique({
    where: { slug },
    include: { claimedBy: { select: { id: true, name: true } } },
  });
  if (creator === null) notFound();

  const pickups = await prisma.creatorPickup.findMany({
    where: { creatorId: creator.id },
    orderBy: { createdAt: "desc" },
    include: { fragrance: { select: { name: true, slug: true } } },
  });

  const session = await auth();
  const isFollowing = session?.user?.id
    ? (await prisma.follow.findUnique({
        where: { userId_subjectType_subjectId: { userId: session.user.id, subjectType: "CREATOR", subjectId: creator.id } },
      })) !== null
    : false;
  const isOwner = session?.user?.id === creator.claimedBy?.id;

  return (
    <>
      <header className="page-head">
        <p className="label">Creator</p>
        <h1 className="page-title">{creator.name}</h1>
        <p className="lede">
          {creator.status === "CLAIMED"
            ? `Claimed by ${creator.claimedBy?.name ?? "a verified account"}.`
            : "Listed in the roster. Nobody has claimed this account yet."}
        </p>
        {creator.bio ? <p className="sub" style={{ marginTop: "1rem" }}>{creator.bio}</p> : null}
        <form action={toggleFollowAction} style={{ marginTop: "1.5rem" }}>
          <input type="hidden" name="slug" value={creator.slug} />
          <input type="hidden" name="subjectType" value="CREATOR" />
          <input type="hidden" name="subjectId" value={creator.id} />
          <button type="submit" className={`btn${isFollowing ? " solid" : " secondary"}`}>
            {isFollowing ? "Following" : "Follow this creator"}
          </button>
        </form>
      </header>

      <section className="rule-heavy" style={{ marginTop: "3.5rem" }}>
        <p className="label">Pickups and reviews</p>
        {pickups.length === 0 ? (
          <div className="empty" style={{ marginTop: "1rem" }}>
            <p className="title">Nothing logged yet</p>
            <p className="sub">
              A verified creator posts their own review and pickup links here.
              Nothing is mirrored, and nothing here counts as a census vote.
            </p>
          </div>
        ) : (
          <ul className="index-list" style={{ marginTop: "1rem" }}>
            {pickups.map((p) => (
              <li key={p.id}>
                <div className="index-row">
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="index-name">
                    {p.title ?? p.url}
                  </a>
                  <span className="index-figure">
                    {p.kind} ·{" "}
                    {p.createdAt.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <p className="fine" style={{ marginTop: "0.1rem" }}>
                  <Link href={`/fragrance/${p.fragrance.slug}`}>{p.fragrance.name}</Link>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isOwner && (
        <section className="rule-heavy" style={{ marginTop: "3.5rem" }}>
          <form action={logCreatorPickupAction} style={{ marginTop: "1rem" }}>
            <p className="label">Log a pickup or review</p>
            <input type="hidden" name="creatorId" value={creator.id} />
            <input type="hidden" name="creatorSlug" value={creator.slug} />
            <p className="label" style={{ marginTop: "1rem" }}>
              Fragrance slug
            </p>
            <input
              name="fragranceSlug"
              placeholder="e.g. aventus"
              required
              style={{ width: "100%", marginBottom: "0.75rem" }}
            />
            <p className="label">Link to your review or pickup</p>
            <input
              name="url"
              placeholder="https://..."
              required
              style={{ width: "100%", marginBottom: "0.75rem" }}
            />
            <p className="label">Title (optional)</p>
            <input name="title" style={{ width: "100%", marginBottom: "0.75rem" }} />
            <p className="label">Kind</p>
            <label style={{ marginRight: "1rem" }}>
              <input type="radio" name="kind" value="review" defaultChecked /> review
            </label>
            <label>
              <input type="radio" name="kind" value="pickup" /> pickup
            </label>
            <button type="submit" className="btn" style={{ marginTop: "1rem" }}>
              Log it
            </button>
          </form>
        </section>
      )}
    </>
  );
}

// The page reads the slug at the PAGE level, which makes the route fully
// dynamic (build output shows ƒ, not ◐). A page that reads params inside
// the Suspense boundary stays a partial prerender, and the CDN then serves
// a prerendered shell whose flight payload references chunks from a build
// that no longer exists: the page streams its content and never renders it,
// so the reader sees "Loading the creator..." forever.
//
// The page renders in one piece, with no Suspense boundary. A boundary
// creates a static shell, and the CDN caches that shell; after a deploy the
// cached shell points at the chunks from the build that made it, so React
// loads the current chunks, the flight payload does not match, and the page
// never renders. The reader sees "Loading..." forever while the server
// response looks perfect.
export default async function CreatorPage({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  return (
    <main className="page">
      <CreatorData slug={slug} />
    </main>
  );
}

