import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toggleFollowAction } from "@/app/fragrance/[slug]/censusActions";
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

  return (
    <section>
      <h1>{creator.name}</h1>
      <p style={{ color: "#555" }}>
        {creator.status}
        {creator.claimedBy?.name ? ` · claimed by ${creator.claimedBy.name}` : " · unclaimed"}
      </p>
      {creator.bio ? <p>{creator.bio}</p> : null}
      <form action={toggleFollowAction} style={{ margin: "0.5rem 0" }}>
        <input type="hidden" name="slug" value={creator.slug} />
        <input type="hidden" name="subjectType" value="CREATOR" />
        <input type="hidden" name="subjectId" value={creator.id} />
        <button type="submit" style={{ padding: "0.25rem 0.5rem", fontSize: "0.85rem" }}>
          {isFollowing ? "Following" : "Follow"}
        </button>
      </form>

      <h2>Pickups and reviews</h2>
      {pickups.length === 0 ? (
        <p>Nothing logged yet. A verified creator posts their own review and pickup links here; nothing is mirrored.</p>
      ) : (
        <ul style={{ padding: 0, listStyle: "none" }}>
          {pickups.map((p) => (
            <li key={p.id} style={{ padding: "0.5rem 0", borderBottom: "1px solid #eee" }}>
              <a href={p.url} target="_blank" rel="noopener noreferrer">{p.title ?? p.url}</a>
              {" · "}
              <Link href={`/fragrance/${p.fragrance.slug}`}>{p.fragrance.name}</Link>
              {" · "}
              <span style={{ color: "#777", fontSize: "0.8rem" }}>{p.kind} · {p.createdAt.toISOString().slice(0, 10)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function CreatorPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <main style={{ maxWidth: 640, margin: "3rem auto", padding: "0 1rem" }}>
      <Suspense fallback={<p>Loading the creator...</p>}>
        <CreatorDataWrapper params={params} />
      </Suspense>
    </main>
  );
}

async function CreatorDataWrapper({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await connection();
  return <CreatorData slug={slug} />;
}
