import Link from "next/link";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildFeedPage } from "@/server/feed";
import { listUpdateEventsForUser } from "@/server/follows";
import { scentFamilyMatch } from "@/domain/cloneClaims";
import { BottleThumb } from "@/components/BottleThumb";
import { morePicksAction, voteAction } from "./feedActions";

// searchParams is runtime data in Next 16: the raw promise rides THROUGH
// the Suspense boundary, and the data component awaits it inside.
// No Suspense boundary here either. A boundary creates a static shell that
// the CDN caches, and a cached shell points at the chunks from the build
// that made it. After a deploy React loads the current chunks, the flight
// payload does not match, and the page never renders: the reader sees
// "Loading..." forever while the server response looks perfect.
// The page reads the session and the feed, so it renders per request. A
// prerendered shell goes stale the moment the data changes, and the CDN
// then serves a shell whose flight payload references chunks from a build
// that no longer exists. The result is a page that streams its content and
// never renders it: the reader sees "Loading..." forever while the server
// response looks perfectly fine.
//
// With Cache Components enabled, "instant = false" is what allows the route
// to block on request-time data instead of being prerendered. The root
// layout sets it too, but the route has to say it for itself or the
// prerender check fails on the signed-in path.
export const instant = false;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  return (
    <>
      <UpdatesData />
      <HomeContent searchParams={searchParams} />
    </>
  );
}

// Why Connection: auth() triggers next-auth's CSRF random on every
// cookie-less prerender, which Cache Components blocks (bisected in M3). The
// split data component + connection() keeps the prerender honest.
async function UpdatesData() {
  await connection();
  const session = await auth();
  if (!session?.user?.id) return null;
  const events = await listUpdateEventsForUser(prisma, session.user.id, 12);
  if (events.length === 0) return null;
  const fragranceIds = events
    .filter((e) => e.subjectType === "FRAGRANCE")
    .map((e) => e.subjectId);
  const frags = fragranceIds.length > 0
    ? await prisma.fragrance.findMany({ where: { id: { in: fragranceIds } }, select: { id: true, name: true, slug: true } })
    : [];
  const byId = new Map(frags.map((f) => [f.id, f]));
  return (
    <main className="page">
      <section className="card section">
        <h2 className="title" style={{ marginBottom: "0.75rem" }}>
          Updates
        </h2>
        <ul className="rows">
          {events.map((event) => {
            const frag = event.subjectType === "FRAGRANCE" ? byId.get(event.subjectId) : null;
            return (
              <li key={event.id}>
                <strong>{event.type.replace(/_/g, " ").toLowerCase()}</strong>
                {" · "}
                {frag ? <Link href={`/fragrance/${frag.slug}`}>{frag.name}</Link> : event.subjectId}
                {" · "}
                <span className="fine">{event.occurredAt.toISOString().slice(0, 10)} · {event.sourceLabel}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}

async function HomeContent({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await connection();
  const requested = Number((await searchParams).page ?? "1");
  const page = Number.isInteger(requested) && requested > 0 ? requested : 1;
  const session = await auth();
  if (!session?.user?.id) {
    return <SignedOut />;
  }

  const { cards } = await buildFeedPage(prisma, session.user.id, { pageSize: 6 });

  return (
    <main className="page">
      <header className="page-head">
        <p className="label">Picked for you</p>
        <h1 className="page-title">Your next bottle</h1>
        <p className="lede">
          What should you add next? Vote honestly, and the census learns.
        </p>
      </header>

      {cards.length === 0 ? (
        <div className="empty" style={{ marginTop: "2.5rem" }}>
          <p className="title">The feed ran dry</p>
          <p className="sub">
            Add a bottle to your shelf, or reset onboarding, and the census gets
            sharper about what to suggest next.
          </p>
        </div>
      ) : (
        <ul className="feed-list">
          {cards.map((card) => {
            return (
              <li key={card.candidate.fragranceId} className="feed-row">
                <Link
                  href={`/fragrance/${card.candidate.fragranceSlug}`}
                  className="feed-plate"
                  aria-label={`${card.candidate.name} by ${card.candidate.house.name}`}
                >
                  <BottleThumb
                    pid={card.candidate.catalogueSourcePid ?? null}
                    name={card.candidate.name}
                  />
                </Link>
                <div>
                  <div className="feed-head">
                    <Link href={`/fragrance/${card.candidate.fragranceSlug}`} className="feed-name">
                      {card.candidate.name}
                    </Link>
                    <span className="feed-house">
                      {card.candidate.house.name}
                      {card.candidate.year ? ` · ${card.candidate.year}` : ""}
                    </span>
                  </div>
                  <p className="feed-reason">{card.reasonLine}</p>
                  {card.candidate.noteNames.length > 0 ? (
                    <p className="feed-notes">
                      notes: {card.candidate.noteNames.slice(0, 4).join(", ")} ·{" "}
                      {card.slot === "contrast" ? "deliberate contrast" : "on your wavelength"}
                    </p>
                  ) : null}
                  <form action={voteAction} className="feed-votes">
                    <input type="hidden" name="fragranceId" value={card.candidate.fragranceId} />
                    <input type="hidden" name="reasonSlug" value={card.reasonSlug} />
                    <input type="hidden" name="page" value={page} />
                    <button type="submit" name="direction" value="LIKE" className="quiet">
                      I like this
                    </button>
                    <button type="submit" name="direction" value="DISLIKE" className="quiet">
                      Not for me
                    </button>
                    <button type="submit" name="direction" value="DECLINE" className="quiet">
                      Skip
                    </button>
                    <button type="submit" name="direction" value="OWN" className="quiet">
                      I own this
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {cards.length > 0 ? (
        <div style={{ marginTop: "2rem", display: "flex", gap: "1rem", alignItems: "center" }}>
          <form action={morePicksAction} style={{ display: "inline" }}>
            <input type="hidden" name="page" value={page} />
            <button type="submit" className="btn">
              More picks
            </button>
          </form>
          <Link href="/shelf" className="textlink">
            My shelf
          </Link>
        </div>
      ) : null}
    </main>
  );
}

/**
 * The signed-out home.
 *
 * The old hero was a photograph of a wooden shelf with seven bottle cutouts
 * pasted into it. It said "collection" but it carried no information, and
 * every element on it was the same size. The hero now does the job of a
 * magazine opener: one argument, one real number set, and a specimen plate
 * showing the actual closest clone of a famous scent, measured by the census
 * rather than chosen by a designer.
 */
async function SignedOut() {
  // honest breadth numbers straight from the catalogue: the proof has to be
  // the real count, never invented marketing
  const [fragCount, houseCount, edgeCount, familyCount, anchor, mostCopied] = await Promise.all([
    prisma.fragrance.count(),
    prisma.house.count(),
    prisma.inspiredByEdge.count(),
    prisma.fragrance.count({ where: { inspiredEdgesAsTarget: { some: {} } } }),
    prisma.fragrance.findUnique({
      where: { slug: "aventus" },
      select: {
        id: true,
        name: true,
        house: { select: { name: true } },
        notes: { include: { note: true } },
        accords: true,
      },
    }),
    // the houses that make the most clones: per house of the clone side, the
    // number of distinct originals its bottles have been measured against
    prisma.$queryRawUnsafe<Array<{ name: string; slug: string; originals: bigint }>>(
      `SELECT h.name, h.slug, COUNT(DISTINCT e."targetId") AS originals
       FROM "InspiredByEdge" e
       JOIN "Fragrance" c ON c.id = e."cloneId"
       JOIN "House" h ON h.id = c."houseId"
       GROUP BY h.id, h.name, h.slug
       ORDER BY originals DESC
       LIMIT 8`,
    ),
  ]);

  // The strongest scent matches for the anchor scent, computed the same way
  // the census pages compute it: public note and accord lists. Public poll
  // shares deliberately do not appear on this site, so the hero shows the
  // same number kind the product pages show.
  const anchors = anchor
    ? await prisma.inspiredByEdge.findMany({
        where: { targetId: anchor.id },
        include: {
          clone: {
            select: {
              name: true,
              slug: true,
              catalogueSourcePid: true,
              house: { select: { name: true } },
              notes: { include: { note: true } },
              accords: true,
            },
          },
        },
      })
    : [];

  const anchorNoteNames = anchor?.notes.map((n) => n.note.name) ?? [];
  const anchorAccordMap = Object.fromEntries(
    (anchor?.accords ?? []).map((a, i) => [a.toLowerCase(), 100 - i * 12.5]),
  );
  const plates = anchors
    .map((edge) => {
      if (anchor === null || anchorNoteNames.length === 0 || edge.clone.notes.length === 0) return null;
      const cloneNoteNames = edge.clone.notes.map((n) => n.note.name);
      const cloneAccordMap = Object.fromEntries(
        edge.clone.accords.map((a, i) => [a.toLowerCase(), 100 - i * 12.5]),
      );
      return {
        name: edge.clone.name,
        slug: edge.clone.slug,
        house: edge.clone.house.name,
        pid: edge.clone.catalogueSourcePid,
        score: scentFamilyMatch(anchorNoteNames, anchorAccordMap, cloneNoteNames, cloneAccordMap),
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null && p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="label rise">The clone census</p>
          <h1 className="display rise rise-1" style={{ marginTop: "0.9rem" }}>
            Which clone actually smells like the real thing?
          </h1>
          <p className="lede rise rise-2" style={{ marginTop: "1.5rem" }}>
            Marketing copy says close enough. The census asks people who own both
            bottles and ranks the answer. Add your shelf, vote honestly, and
            the next bottle gets easier to pick.
          </p>
          <div className="rise rise-3" style={{ marginTop: "2.25rem", display: "flex", gap: "1.25rem", alignItems: "center", flexWrap: "wrap" }}>
            <Link href="/signin" className="btn">
              Start your shelf
            </Link>
            <Link href="/explore" className="textlink">
              Browse {familyCount.toLocaleString("en-US")} families
            </Link>
          </div>
          <p className="fine rise rise-4" style={{ marginTop: "1.1rem" }}>
            Free. Email only. About a minute.
          </p>
        </div>

        {plates.length > 0 && anchor ? (
          <figure className="hero-plate rise rise-4" style={{ margin: 0 }}>
            <p className="label" style={{ marginBottom: "0.9rem" }}>
              {anchor.name}, {anchor.house.name}
            </p>
            <div className="specimen-strip" style={{ borderBottom: 0 }}>
              {plates.map((plate) => (
                <Link key={plate.slug} href={`/fragrance/${plate.slug}`} className="specimen-cell">
                  <span className="specimen-plate specimen">
                    <BottleThumb pid={plate.pid} name={plate.name} />
                  </span>
                  <span className="specimen-name">{plate.name}</span>
                  <span className="specimen-meta">
                    <span className="close">{plate.score}%</span> scent match
                  </span>
                  <span className="specimen-meta specimen-house">{plate.house}</span>
                </Link>
              ))}
            </div>
            <figcaption className="caption">
              The three strongest computed scent matches for {anchor.name}, from
              public note and accord lists. Not a vote; census votes take over
              as people who own both bottles answer.
            </figcaption>
          </figure>
        ) : null}
      </section>

      {/* honest breadth proof, straight from the catalogue, no marketing */}
      <section className="data-band rise rise-5" aria-label="Census coverage">
        <div>
          <span className="data-figure">{fragCount.toLocaleString("en-US")}</span>
          <span className="data-caption">fragrances in the catalogue</span>
        </div>
        <div>
          <span className="data-figure">{familyCount.toLocaleString("en-US")}</span>
          <span className="data-caption">originals with a measured clone</span>
        </div>
        <div>
          <span className="data-figure">{edgeCount.toLocaleString("en-US")}</span>
          <span className="data-caption">clone pairs mapped from public communities</span>
        </div>
      </section>
      <p className="fine" style={{ marginTop: "1rem" }}>
        {houseCount.toLocaleString("en-US")} houses. The first census votes are
        yours to place.
      </p>

      {mostCopied.length > 0 ? (
        <section className="rule-heavy" style={{ marginTop: "4.5rem" }}>
          <p className="label">The houses that make the most clones</p>
          <p className="fine" style={{ maxWidth: "38rem", marginBottom: "0.75rem" }}>
            Counted by how many different originals each house's bottles have
            been measured as smell-alikes for. The big clone houses show up
            here, not the original brands being copied.
          </p>
          <ul className="house-run">
            {mostCopied.map((house) => (
              <li key={house.slug}>
                <Link href={`/house/${house.slug}`} className="house-run-name">
                  {house.name}
                </Link>
                <span className="figure house-run-count">
                  {house.originals.toLocaleString("en-US")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
