// Product page (PRD section 7.5): the permalink a debate lives on. One
// fragrance, three honest blocks: the census (community votes with measured
// buckets and sample sizes, never an editorial score), the market data in
// every fresh group that exists (asking prices, never invented), and video
// reviews only from creator-logged links someday (nothing scraped, nothing
 // mirrored). The census read is public; voting needs an account.

import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BUCKET_LABELS, RANK_LEVEL_LABELS } from "@/domain/census";
import type { CensusBucket } from "@/domain/types";
import { floors } from "@/domain/floors";
import { estimateFromSource } from "@/domain/marketSources";
import { loadMarketSource } from "@/server/marketData";
import { loadPairRollup, loadRankedClones } from "@/server/census";
import { clearCloneVoteAction, cloneCensusVoteAction, toggleFollowAction } from "./censusActions";

const cents = (value: number): string => `$${(value / 100).toFixed(2)}`;

const BUCKETS: CensusBucket[] = ["SPOT_ON", "CLOSE", "SIMILAR", "SAME_FAMILY", "NOT_CLOSE"];

const buttonStyle = { padding: "0.25rem 0.5rem", fontSize: "0.8rem" } as const;

function VoteButtons({ slug, cloneId, targetId, current }: {
  slug: string;
  cloneId: string;
  targetId: string;
  current: CensusBucket | null;
}) {
  return (
    <span style={{ display: "inline-flex", gap: "0.3rem", flexWrap: "wrap", alignItems: "center" }}>
      <form action={cloneCensusVoteAction} style={{ display: "inline-flex", gap: "0.3rem", flexWrap: "wrap" }}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="cloneId" value={cloneId} />
        <input type="hidden" name="targetId" value={targetId} />
        {BUCKETS.map((bucket) => (
          <button
            key={bucket}
            type="submit"
            name="bucket"
            value={bucket}
            style={{
              ...buttonStyle,
              background: current === bucket ? "#222" : "#f0f0f0",
              color: current === bucket ? "#fff" : "#111",
            }}
          >
            {BUCKET_LABELS[bucket]}
          </button>
        ))}
      </form>
      {current !== null ? (
        <>
          <span style={{ fontSize: "0.85rem" }}>Your vote: {BUCKET_LABELS[current]}</span>
          <form action={clearCloneVoteAction} style={{ display: "inline" }}>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="cloneId" value={cloneId} />
            <input type="hidden" name="targetId" value={targetId} />
            <button type="submit" style={{ ...buttonStyle, background: "none", color: "#888" }}>
              Clear my vote
            </button>
          </form>
        </>
      ) : null}
    </span>
  );
}

function RollupLine({ rollup }: { rollup: { sampleSize: number; score: number; rankLevel?: string; mostCommon?: string | null } }) {
  const sampleSize = rollup.sampleSize;
  const rankLevel = (rollup.rankLevel ?? (sampleSize >= floors.census.confidentVotes ? "confident" : sampleSize >= floors.census.lowConfidenceVotes ? "low" : "none")) as "none" | "low" | "confident";
  const mostCommon = (rollup.mostCommon ?? null) as CensusBucket | null;
  return (
    <>
      <span>{sampleSize === 1 ? "1 vote" : `${sampleSize} votes`}</span>
      {" · "}
      <span>{RANK_LEVEL_LABELS[rankLevel]}</span>
      {mostCommon !== null && rankLevel !== "none" ? (
        <span>
          {" · "}most common: {BUCKET_LABELS[mostCommon].toLowerCase()} · score {rollup.score}
        </span>
      ) : null}
    </>
  );
}

async function ProductData({ params }: { params: Promise<{ slug: string }> }) {
  // request-time marker before auth(), the Cache Components lesson from M3:
  // next-auth generates a CSRF random on cookie-less requests
  await connection();
  const { slug } = await params;
  const session = await auth();
  const viewerId = session?.user?.id ?? null;

  const fragrance = await prisma.fragrance.findUnique({
    where: { slug },
    include: {
      house: true,
      inspiredBy: { include: { house: true } },
      notes: { include: { note: true }, orderBy: { weight: "desc" } },
    },
  });
  if (fragrance === null) notFound();

  // census viewed FROM this fragrance as an original: the ranked clone list
  const rankedClones = await loadRankedClones(prisma, fragrance.id);
  const myTargetVotes = viewerId
    ? await prisma.cloneVote.findMany({
        where: { userId: viewerId, targetId: fragrance.id },
        select: { cloneId: true, bucket: true },
      })
    : [];
  const myVoteByClone = new Map(myTargetVotes.map((v) => [v.cloneId, v.bucket]));

  // census viewed FROM this fragrance as a clone: its canon pair plus any
  // community pairs beyond the canon
  const canonRollup =
    fragrance.inspiredById !== null ? await loadPairRollup(prisma, fragrance.id, fragrance.inspiredById) : null;
  const myCanonVote = (
    viewerId && fragrance.inspiredById !== null
      ? await prisma.cloneVote.findUnique({
          where: { userId_cloneId_targetId: { userId: viewerId, cloneId: fragrance.id, targetId: fragrance.inspiredById } },
        })
      : null
  )?.bucket as CensusBucket | undefined;

  const isFollowing = viewerId
    ? (await prisma.follow.findUnique({
        where: { userId_subjectType_subjectId: { userId: viewerId, subjectType: "FRAGRANCE", subjectId: fragrance.id } },
      })) !== null
    : false;

  // market data: every fresh (source, size) group, no blending ever (PRD 8)
  const source = await loadMarketSource(prisma, [fragrance.id]);
  const groups = estimateFromSource(source, fragrance.id, { now: new Date() }).filter((g) => g.estimate.status !== "none");

  return (
    <section>
      <h2>{fragrance.name}</h2>
      <p style={{ color: "#555" }}>
        {fragrance.house.name}
        {fragrance.year ? ` · ${fragrance.year}` : ""}
        {fragrance.perfumer ? ` · ${fragrance.perfumer}` : ""}
      </p>
      <form action={toggleFollowAction} style={{ margin: "0.5rem 0" }}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="subjectType" value="FRAGRANCE" />
        <input type="hidden" name="subjectId" value={fragrance.id} />
        <button type="submit" style={{ padding: "0.25rem 0.5rem", fontSize: "0.85rem" }}>
          {isFollowing ? "Following" : "Follow"}
        </button>
      </form>
      {fragrance.accords.length > 0 ? (
        <p style={{ fontSize: "0.85rem", color: "#666" }}>accords: {fragrance.accords.join(", ")}</p>
      ) : null}
      {fragrance.notes.length > 0 ? (
        <p style={{ fontSize: "0.85rem", color: "#666" }}>
          notes: {[...new Set(fragrance.notes.map((n) => n.note.name))].join(", ")}
        </p>
      ) : null}

      {/* inspired by: clone side of the pair */}
      {fragrance.inspiredBy !== null ? (
        <section>
          <h3>Inspired by</h3>
          <ul style={{ padding: 0, listStyle: "none" }}>
            <li style={{ padding: "0.5rem 0", borderBottom: "1px solid #eee" }}>
              <Link href={`/fragrance/${fragrance.inspiredBy.slug}`}>{fragrance.inspiredBy.name}</Link>
              {" · "}
              <Link href={`/fragrance/${fragrance.house.slug}`} style={{ color: "#555" }}>
                {fragrance.inspiredBy.house.name}
              </Link>
              {canonRollup !== null ? (
                <div style={{ margin: "0.3rem 0" }}>
                  <RollupLine rollup={canonRollup} />
                </div>
              ) : null}
              <div style={{ margin: "0.3rem 0" }}>
                {viewerId !== null ? (
                  <VoteButtons
                    slug={slug}
                    cloneId={fragrance.id}
                    targetId={fragrance.inspiredBy.id}
                    current={myCanonVote ?? null}
                  />
                ) : (
                  <Link href="/signin" style={{ fontSize: "0.85rem" }}>Sign in to rate how close this is</Link>
                )}
              </div>
            </li>
          </ul>
          {/* a famous clone often carries a second well-known comparison; the
              census ranks it from community votes, not editorials */}
          <OtherClonePairs cloneId={fragrance.id} slug={slug} canonTargetId={fragrance.inspiredById} viewerId={viewerId} />
        </section>
      ) : null}

      {/* census: target side, the ranked list with both confidence levels */}
      <section>
        <h3>The clone census for this fragrance</h3>
        {rankedClones.length === 0 ? (
          <p>No one has weighed in yet. Curated clones appear here, then the community ranks them.</p>
        ) : (
          <ul style={{ padding: 0, listStyle: "none" }}>
            {rankedClones.map((entry) => (
              <li key={entry.cloneId} style={{ padding: "0.5rem 0", borderBottom: "1px solid #eee" }}>
                <Link href={`/fragrance/${entry.slug}`}>{entry.cloneName}</Link>
                {" · "}
                <span style={{ color: "#555" }}>{entry.houseName}</span>
                <div style={{ margin: "0.3rem 0", fontSize: "0.9rem" }}>
                  <RollupLine rollup={entry} />
                </div>
                <div style={{ margin: "0.3rem 0" }}>
                  {viewerId !== null ? (
                    <VoteButtons
                      slug={slug}
                      cloneId={entry.cloneId}
                      targetId={fragrance.id}
                      current={myVoteByClone.get(entry.cloneId) ?? null}
                    />
                  ) : (
                    <Link href="/signin" style={{ fontSize: "0.85rem" }}>Sign in to rate how close this is</Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p style={{ fontSize: "0.85rem", color: "#777", maxWidth: "45ch" }}>
          Ranks use measured votes only: a clone needs {floors.census.lowConfidenceVotes} votes to
          enter the list at low confidence and {floors.census.confidentVotes} votes before the
          low-confidence label drops. Scores inside {floors.census.tieBand} points display as
          statistically tied.
        </p>
      </section>

      {/* worth: honest regardless of data state */}
      <section>
        <h3>Market price</h3>
        {groups.length === 0 ? (
          <p>No market data yet. Nothing is estimated until a capture exists.</p>
        ) : (
          <ul style={{ padding: 0, listStyle: "none" }}>
            {groups.map((group) => (
              <li key={`${group.source}-${group.sizeMl ?? "other"}`}>
                {group.sizeMl !== null ? `${group.sizeMl}ml` : "size not listed"}
                {" · "}
                {group.estimate.status === "thin" ? "thin data: " : ""}
                {cents(group.estimate.lowCents ?? 0)} to {cents(group.estimate.highCents ?? 0)}
                {" (mid "}
                {cents(group.estimate.midCents ?? 0)}
                {") from "}
                {group.estimate.sampleSize} {group.estimate.sampleSize === 1 ? "listing" : "listings"}
              </li>
            ))}
          </ul>
        )}
        <p style={{ fontSize: "0.85rem", color: "#777" }}>
          {floors.worth.source === "EBAY_ASKING" ? "Asking prices, not sold prices, inside a 30 day window." : ""}
        </p>
      </section>

      <section>
        <h3>Video reviews</h3>
        <p>No creator-logged reviews yet. Videos appear here only when a verified creator posts the link; nothing is mirrored or scraped from channels.</p>
      </section>
    </section>
  );
}

async function OtherClonePairs({ cloneId, slug, canonTargetId, viewerId }: {
  cloneId: string;
  slug: string;
  canonTargetId: string | null;
  viewerId: string | null;
}) {
  if (canonTargetId === null) return null;
  const community = await prisma.cloneRollup.findMany({
    where: { cloneId, NOT: { targetId: canonTargetId } },
    include: { target: { select: { name: true, slug: true } } },
  });
  if (community.length === 0) return null;
  const myVotes = viewerId
    ? await prisma.cloneVote.findMany({
        where: { userId: viewerId, cloneId },
        select: { targetId: true, bucket: true },
      })
    : [];
  const byTarget = new Map(myVotes.map((v) => [v.targetId, v.bucket]));
  return (
    <div style={{ marginTop: "0.5rem" }}>
      <p style={{ fontSize: "0.85rem", color: "#666" }}>Also compared by the community:</p>
      <ul style={{ padding: 0, listStyle: "none" }}>
        {community.map((row) => (
          <li key={row.targetId} style={{ padding: "0.35rem 0", borderBottom: "1px solid #eee" }}>
            <Link href={`/fragrance/${row.target.slug}`}>{row.target.name}</Link>
            {" · "}
            <RollupLine rollup={row} />
            <div style={{ margin: "0.3rem 0" }}>
              {viewerId !== null ? (
                <VoteButtons slug={slug} cloneId={cloneId} targetId={row.targetId} current={byTarget.get(row.targetId) ?? null} />
              ) : (
                <Link href="/signin" style={{ fontSize: "0.85rem" }}>Sign in to rate how close this is</Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// RollupLine reads CloneRollup rows directly too; shape compatibility
export default function FragrancePage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <main style={{ maxWidth: 640, margin: "3rem auto", padding: "0 1rem" }}>
      <Suspense fallback={<p>Loading the fragrance...</p>}>
        <ProductData params={params} />
      </Suspense>
    </main>
  );
}
