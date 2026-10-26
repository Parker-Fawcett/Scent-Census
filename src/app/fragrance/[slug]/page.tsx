// Product page (PRD section 7.5): the permalink a debate lives on.
//
// Layout (variant A, chosen 2026-10-20): the family lineup is the hero. The
// name sits above a row of the sibling bottles standing on a hairline, so the
// page reads as "this bottle, in its family" rather than a product card. The
// product photo appears only inside the family strip; the pair comparison,
// the closeness meter, the vote scale follow.
//
// The pencil silhouette remains the fallback for any fragrance without a
// catalogue photo, and the meter shows nothing until votes exist.
import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { scentFamilyMatch } from "@/domain/cloneClaims";
import { GhostBottle, ClosenessMeter, VoteButtons } from "@/components/productBits";
import { gapLabel, valueGap, valueLabel } from "@/domain/value";
import { formatPriceRead, formatSavings, readPrice, savingsRatio } from "@/domain/retailPrice";
import type { CensusBucket } from "@/domain/types";
import { floors } from "@/domain/floors";
import { estimateFromSource } from "@/domain/marketSources";
import { loadMarketSource } from "@/server/marketData";
import { listCreatorPickupsForFragrance } from "@/server/creators";
import { loadPairRollup, loadRankedClones } from "@/server/census";
import { loadBuyOptions } from "@/server/buyOptions";
import { loadAdSlot } from "@/server/adSlots";
import { loadShelfFacts } from "@/server/shelfFacts";
import { loadSimilarByAccords, slugify } from "@/server/families";
import { loadCloneTargets, loadSecondDegreeClones } from "@/server/cloneLineage";
import { loadCloneClaims } from "@/server/cloneClaims";
import { formatClaimPrice, claimSourceLabel } from "@/domain/cloneClaims";
import { BottleThumb } from "@/components/BottleThumb";
import { PROMINENCE_FLOOR } from "@/domain/prominence";
import { toggleFollowAction } from "./censusActions";

const cents = (value: number): string => `$${(value / 100).toFixed(2)}`;

// The page depends on runtime data (the census, prices, a family graph), so
// it must not be a build-time prerender. A prerendered shell goes stale the
// moment the data changes, and the CDN then serves a shell whose flight
// payload references chunks from a build that no longer exists, which is a
// page that streams its content and never renders it.
//
// With Cache Components enabled, "instant = false" is the mechanism: the
// page waits for the data and renders once, instead of prerendering a shell.
export const instant = false;

// One line of context for originals whose community agreement is unusually
// low, so a short census reads as a finding rather than missing data. The
// research behind the wording lives in docs/RESEARCH-imagination-divide.md.
const CONTESTED_ORIGINALS: Record<string, string> = {
  "fragrantica-67370":
    "Imagination splits the community like few other bottles here. Public comparison votes on its clones run unusually low and widely divided, so this page reads shorter than the clone scene's opinion of it. The vote on this site is where that argument settles.",
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const fragrance = await prisma.fragrance.findUnique({
    where: { slug },
    include: { house: true, inspiredBy: { select: { name: true } } },
  });
  if (fragrance === null) return { title: "Fragrance not found" };

  const noteBits = fragrance.noteNames.slice(0, 5).join(", ");
  const base = `${fragrance.name} by ${fragrance.house.name}`;
  const year = fragrance.year ? ` (${fragrance.year})` : "";
  // the canonical pointer is often empty for corpus clones. The strongest
  // outgoing edge is the target the census actually ranked, so metadata uses
  // the same source the page does.
  const topEdge =
    fragrance.inspiredBy === null
      ? await prisma.inspiredByEdge.findFirst({
          where: { cloneId: fragrance.id },
          orderBy: [{ upVotes: "desc" }],
          select: { target: { select: { name: true } } },
        })
      : null;
  const cloneTargetName = fragrance.inspiredBy?.name ?? topEdge?.target.name ?? null;

  if (cloneTargetName !== null) {
    return {
      title: base,
      description: `${base}${year}, measured as a clone of ${cloneTargetName}. Census votes rank how close it actually smells.`,
    };
  }
  const cloneCount = await prisma.fragrance.count({ where: { inspiredById: fragrance.id } });
  const censusLine = cloneCount > 0
    ? `The census covers ${cloneCount} clone${cloneCount === 1 ? "" : "s"} so far.`
    : "Census voting decides which clones actually smell like it.";
  const notesBit = noteBits ? ` Notes: ${noteBits}.` : "";
  return {
    title: base,
    description: `${base}${year}.${notesBit} ${censusLine}`,
  };
}

async function ProductData({ slug }: { slug: string }) {
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
  const f = fragrance!;

  // The measured lineage, not just the canonical pointer. A clone whose
  // inspiredById is empty still has outgoing edges, and those edges are what
  // the census actually ranked. Reading only the pointer lost the original
  // on pages like Inception, whose target is Marwa.
  const cloneTargets = await loadCloneTargets(prisma, f.id);
  const canonicalTarget =
    f.inspiredBy !== null
      ? cloneTargets.find((target) => target.id === f.inspiredBy!.id) ?? {
          id: f.inspiredBy.id,
          slug: f.inspiredBy.slug,
          name: f.inspiredBy.name,
          houseName: f.inspiredBy.house.name,
          year: f.inspiredBy.year,
          pid: f.inspiredBy.catalogueSourcePid,
          score: 0,
          sampleSize: 0,
          upVotes: 0,
          downVotes: 0,
          kind: "clone" as const,
          valueScore: f.inspiredBy.priceValue,
        }
      : null;
  const mainTarget =
    canonicalTarget ??
    cloneTargets.find((target) => target.kind === "clone") ??
    null;

  const rankedClones = await loadRankedClones(prisma, f.id);
  const myTargetVotes = viewerId
    ? await prisma.cloneVote.findMany({
        where: { userId: viewerId, targetId: f.id },
        select: { cloneId: true, bucket: true },
      })
    : [];
  const myVoteByClone = new Map(myTargetVotes.map((v) => [v.cloneId, v.bucket as CensusBucket]));

  const canonRollup = mainTarget !== null ? await loadPairRollup(prisma, f.id, mainTarget.id) : null;
  const myCanonVote = (
    viewerId && mainTarget !== null
      ? await prisma.cloneVote.findUnique({
          where: { userId_cloneId_targetId: { userId: viewerId, cloneId: f.id, targetId: mainTarget.id } },
        })
      : null
  )?.bucket as CensusBucket | undefined;

  const canonCountRows = mainTarget !== null
    ? await prisma.cloneVote.groupBy({
        by: ["bucket"],
        where: { cloneId: f.id, targetId: mainTarget.id },
        _count: { bucket: true },
      })
    : [];
  const canonCounts = Object.fromEntries(
    canonCountRows.map((g) => [g.bucket, g._count.bucket]),
  ) as Partial<Record<CensusBucket, number>>;

  const isFollowing = viewerId
    ? (await prisma.follow.findUnique({
        where: { userId_subjectType_subjectId: { userId: viewerId, subjectType: "FRAGRANCE", subjectId: f.id } },
      })) !== null
    : false;

  const siblingDupes = mainTarget !== null ? await loadRankedClones(prisma, mainTarget.id) : [];

  // no imported closeness numbers anywhere on this page: the verdict meter
  // stays empty until first-party census votes exist.

  const source = await loadMarketSource(prisma, [f.id]);
  const groups = estimateFromSource(source, f.id, { now: new Date() }).filter((g) => g.estimate.status !== "none");
  const videoReviews = await listCreatorPickupsForFragrance(prisma, f.id);
  // where to buy: the only commercial surface on the page, and it sits
  // below the ranked census so no partner can affect a position
  const buyOptions = await loadBuyOptions(f.id);
  // what the visitor already owns, and what that changes about this page.
  // A shelf-aware page reads differently for someone with a shelf, which is
  // the premise of the site. The census itself is identical for everyone.
  const familyForShelf = [
    ...(mainTarget !== null
      ? [{ id: mainTarget.id, name: mainTarget.name, slug: mainTarget.slug, score: 100 }]
      : []),
    { id: f.id, name: f.name, slug: f.slug, score: 100 },
    ...siblingDupes.map((c) => ({ id: c.cloneId, name: c.cloneName, slug: c.slug, score: c.score })),
  ].filter((member, index, all) => all.findIndex((m) => m.id === member.id) === index);
  const shelfFacts = await loadShelfFacts(prisma, viewerId, f.id, familyForShelf);

  // The ad slot for this page. The exclusion rule needs to know which
  // fragrances the page RANKED, because an ad for one of those would read
  // as the ranking endorsing it. The subject of the page is the exception:
  // a house advertising its own scent on its own scent's page is ordinary
  // retail, and it is the inventory houses actually want to buy.
  const rankedFragranceIds: string[] = [
    ...(mainTarget !== null ? [mainTarget.id] : []),
    ...siblingDupes.map((c) => c.cloneId),
    ...rankedClones.map((c) => c.cloneId),
  ].filter((id, index, all) => all.indexOf(id) === index);
  const adSlot = await loadAdSlot("page-bottom", {
    subjectFragranceId: f.id,
    rankedFragranceIds,
  });
  // a second slot further down, for ads that want less prominent placement
  const adSlotBelow = await loadAdSlot("below-fold", {
    subjectFragranceId: f.id,
    rankedFragranceIds,
  });

  // The shelf is one list for every page: the original first, then its
  // clones. A clone page highlights itself in the list; an original page
  // highlights itself as the leader.
  const shelf: Array<{
    id: string;
    slug: string;
    name: string;
    pid: string | null;
    sampleSize: number;
    score: number;
    // what the strip cell's number means: a computed scent match ("94%
    // scent match"), or nothing ("no note data yet")
    metric: "scent" | "none";
    role: "original" | "clone";
    valueScore: number | null;
    priceCaptures: Array<{ priceCents: number; sizeMl: number | null; capturedAt: Date }>;
  }> = [];

  if (mainTarget !== null) {
    // clone page: the original it imitates leads the shelf
    shelf.push({
      id: mainTarget.id,
      slug: mainTarget.slug,
      name: mainTarget.name,
      pid: mainTarget.pid,
      sampleSize: 0,
      score: 0,
      metric: "none",
      role: "original",
      valueScore: mainTarget.valueScore,
      priceCaptures: [],
    });
  } else {
    // original page: this fragrance leads its own shelf
    shelf.push({
      id: f.id,
      slug: f.slug,
      name: f.name,
      pid: f.catalogueSourcePid,
      sampleSize: 0,
      score: 0,
      metric: "none",
      role: "original",
      valueScore: f.priceValue,
      priceCaptures: [],
    });
  }
  // The shelf is a SHELF, not a table: it shows the original plus the
  // strongest few clones. A fragrance like Aventus has hundreds of clones,
  // so the full list lives in the census list below the shelf.
  const SHELF_LIMIT = 10;
  const clones = mainTarget !== null ? siblingDupes : rankedClones;
  const ranked = [...clones].sort((a, b) => {
    if (a.sampleSize !== b.sampleSize) return b.sampleSize - a.sampleSize;
    return b.score - a.score;
  });
  // clones and siblings are different things: a clone is another house
  // imitating this one, a sibling is the same house (Khamrah Qahwa next to
  // Khamrah, BR540 Extrait next to BR540). They are listed apart.
  // the original's own value vote, so each clone can show how much cheaper
  // it reads next to what the original costs
  const originalValue = mainTarget?.valueScore ?? f.priceValue;
  const cloneEntries = ranked.filter((c) => c.kind === "clone");
  const siblingEntries = ranked.filter((c) => c.kind === "sibling");
  // The page can be both a clone and an original. Marwa copies Imagination
  // and Inception copies Marwa. The shelf above follows the upstream family;
  // this list is the page's own clones, so Marwa keeps Inception even though
  // its lede now names Imagination as the original.
  const ownClones = rankedClones.filter((c) => c.kind === "clone");
  const peerEntries = [...ranked, ...rankedClones]
    .filter((c) => c.kind === "peer")
    .filter((entry, index, all) => all.findIndex((e) => e.cloneId === entry.cloneId) === index);

  // Compute scent family match for census clones so they can be ranked
  // alongside claims in a single list. The strip's upstream family on a
  // clone page needs the same computation against the original, since the
  // strip shows the computed scent match now instead of a vote share.
  const stripCloneIds = mainTarget !== null ? cloneEntries.map((c) => c.cloneId) : [];
  const censusCloneIds = [
    ...new Set([...ownClones.map((c) => c.cloneId), ...stripCloneIds]),
  ];
  const censusCloneData = censusCloneIds.length > 0
    ? await prisma.fragrance.findMany({
        where: { id: { in: censusCloneIds } },
        include: { notes: { include: { note: true } } },
      })
    : [];
  const censusCloneMap = new Map(censusCloneData.map((f) => [f.id, f]));
  const targetNoteNames = f.notes.map((n) => n.note.name);
  const targetAccordMap = Object.fromEntries(f.accords.map((a, i) => [a.toLowerCase(), 100 - i * 12.5]));
  // the original's own lists, so a clone page can score its whole upstream row
  const mainTargetNotes = mainTarget !== null
    ? await prisma.fragrance.findUnique({
        where: { id: mainTarget.id },
        select: { notes: { include: { note: true } }, accords: true },
      })
    : null;
  const stripTargetNoteNames = mainTargetNotes?.notes.map((n) => n.note.name) ?? [];
  const stripTargetAccordMap = Object.fromEntries(
    (mainTargetNotes?.accords ?? []).map((a, i) => [a.toLowerCase(), 100 - i * 12.5]),
  );
  const censusFamilyMatch = new Map<string, number | null>();
  const stripFamilyMatch = new Map<string, number | null>();
  for (const cloneId of censusCloneIds) {
    const cd = censusCloneMap.get(cloneId);
    if (!cd || cd.notes.length === 0) { censusFamilyMatch.set(cloneId, null); continue; }
    const cloneNoteNames = cd.notes.map((n) => n.note.name);
    const cloneAccordMap = Object.fromEntries(cd.accords.map((a, i) => [a.toLowerCase(), 100 - i * 12.5]));
    censusFamilyMatch.set(cloneId, scentFamilyMatch(targetNoteNames, targetAccordMap, cloneNoteNames, cloneAccordMap));
    if (mainTarget !== null) {
      stripFamilyMatch.set(
        cloneId,
        scentFamilyMatch(stripTargetNoteNames, stripTargetAccordMap, cloneNoteNames, cloneAccordMap),
      );
    }
  }
  // this page's own bottle against the original it copies, for the self row
  const selfFamilyMatch =
    mainTarget !== null && targetNoteNames.length > 0 && stripTargetNoteNames.length > 0
      ? scentFamilyMatch(
          stripTargetNoteNames,
          stripTargetAccordMap,
          f.notes.map((n) => n.note.name),
          targetAccordMap,
        )
      : null;

  // "Smells like this" is a fallback for a page with no measured clone.
  // When the census has a clone, the census is the better answer and the
  // accord overlap only added coincidences (Marwa and 1 Million share five
  // accords and smell nothing alike). On an empty page the fallback still
  // runs, now requiring three shared notes as well as shared accords.
  const similarByAccords =
    cloneEntries.length === 0 && ownClones.length === 0 && f.accords.length > 0
      ? await loadSimilarByAccords(prisma, f.id, f.accords, f.noteNames, 14)
      : [];
  // On a clone page the strip follows the upstream family (the original plus
  // the clones the corpus measured against it). On an original page the strip
  // is rebuilt further down from the unified clone list, from the same rows
  // and the same numbers, so the two can never disagree again.
  let restCount = 0;
  if (mainTarget !== null) {
    const shelfClones = cloneEntries.slice(0, SHELF_LIMIT);
    // the current bottle always appears in its own clone family, even when it
    // is outside the seven strongest. A clone page that hides its subject from
    // the family strip is the page losing its own original.
    if (!shelfClones.some((clone) => clone.cloneId === f.id)) {
      const self = cloneEntries.find((clone) => clone.cloneId === f.id);
      if (self !== undefined) shelfClones.push(self);
    }
    restCount = cloneEntries.length - shelfClones.length;
    for (const c of shelfClones) {
      const match = c.cloneId === f.id
        ? selfFamilyMatch
        : (stripFamilyMatch.get(c.cloneId) ?? null);
      shelf.push({
        id: c.cloneId,
        slug: c.slug,
        name: c.cloneName,
        pid: c.pid,
        sampleSize: c.sampleSize,
        score: match ?? 0,
        metric: match !== null && match > 0 ? "scent" : "none",
        role: "clone",
        valueScore: c.valueScore,
        priceCaptures: c.priceCaptures,
      });
    }
  }

  // The headline measurement: votes cast on this site, or nothing. The share
  // from public polls is deliberately not displayed as a closeness figure:
  // it tracks who voted, not how close the liquids are.
  const mainFromCensus = canonRollup !== null && canonRollup.sampleSize > 0;
  const mainSample = mainFromCensus ? canonRollup.sampleSize : 0;
  const mainScore = mainFromCensus ? canonRollup.score : 0;

  // Second in line: a clone of a clone. Inception copies Marwa, which is
  // listed in Imagination's family, so Inception belongs on Imagination's
  // page for lineage alone.
  const secondDegree = await loadSecondDegreeClones(
    prisma,
    ownClones.map((clone) => ({
      id: clone.cloneId,
      slug: clone.slug,
      name: clone.cloneName,
      score: clone.score,
    })),
    [f.id],
    6,
  );

  // Claims that the census cannot score: products sold by houses the corpus
  // does not carry, or carried with too few votes to clear the floor. A claim
  // never becomes a closeness percentage, so these rows show a note match
  // instead and say plainly that it is not a vote.
  const allClaims = await loadCloneClaims(prisma, f.id);
  const shownCloneIds = new Set<string>([
    ...ownClones.map((clone) => clone.cloneId),
    ...secondDegree.map((entry) => entry.id),
  ]);
  const outsideClaims = allClaims.filter((claim) => !shownCloneIds.has(claim.cloneId ?? ""));

  // Unified clone list. This is the single ranking the page shows: the
  // computed scent match decides until first-party votes replace it.
  type UnifiedClone = {
    id: string;
    slug: string | null;
    name: string;
    house: string;
    pid: string | null;
    // null = the corpus has no note or accord data for this bottle, which is
    // not the same fact as a computed zero
    familyMatch: number | null;
    voteShare: number | null;
    voteCount: number;
    textureNote: string | null;
    priceCents: number | null;
    sizeMl: number | null;
    currency: string | null;
    claimType: string | null;
    sourceUrl: string | null;
    inCensus: boolean;
    isThis: boolean;
  };
  const unifiedClones: UnifiedClone[] = [
    ...ownClones.map((entry) => {
      return {
        id: entry.cloneId,
        slug: entry.slug,
        name: entry.cloneName,
        house: entry.houseName,
        pid: entry.pid,
        familyMatch: censusFamilyMatch.get(entry.cloneId) ?? null,
        voteShare: entry.sampleSize > 0 ? entry.score : null,
        voteCount: entry.sampleSize,
        textureNote: null,
        priceCents: null,
        sizeMl: null,
        currency: null,
        claimType: null,
        sourceUrl: null,
        inCensus: true,
        isThis: entry.cloneId === f.id,
      };
    }),
    ...outsideClaims.map((claim) => ({
      id: claim.cloneId ?? claim.id,
      slug: claim.slug,
      name: claim.productName,
      house: claim.houseName,
      pid: claim.pid,
      familyMatch: claim.familyMatch,
      voteShare: claim.measuredUp !== null && claim.measuredDown !== null && (claim.measuredUp + claim.measuredDown) > 0
        ? Math.round((claim.measuredUp / (claim.measuredUp + claim.measuredDown)) * 100)
        : null,
      voteCount: (claim.measuredUp ?? 0) + (claim.measuredDown ?? 0),
      textureNote: claim.textureNote,
      priceCents: claim.priceCents,
      sizeMl: claim.sizeMl,
      currency: claim.currency,
      claimType: claim.claimType as string,
      sourceUrl: claim.sourceUrl,
      inCensus: false,
      isThis: false,
    })),
  ].sort((a, b) => {
    // The scent match decides, nulls (no note data) last, then the alphabet.
    return (b.familyMatch ?? -1) - (a.familyMatch ?? -1)
      || a.name.localeCompare(b.name, "en");
  });

  // On an original page the strip is the head of the one list below, same
  // order, same numbers, so the page never shows one clone twice with two
  // different scores.
  if (mainTarget === null) {
    const stripClones = unifiedClones
      .filter((c) => c.slug !== null && !c.isThis)
      .slice(0, Math.max(0, SHELF_LIMIT - shelf.length));
    restCount = Math.max(0, unifiedClones.length - stripClones.length);
    for (const c of stripClones) {
      shelf.push({
        id: c.id,
        slug: c.slug as string,
        name: c.name,
        pid: c.pid,
        sampleSize: 0,
        score: c.familyMatch ?? 0,
        metric: c.familyMatch !== null && c.familyMatch > 0 ? "scent" : "none",
        role: "clone",
        valueScore: null,
        priceCaptures: [],
      });
    }
  }

  // The census strip on a clone page is ordered by the strip cell number:
  // highest scent match nearest the original, with the original still first.
  if (mainTarget !== null) {
    const originalItem = shelf.shift();
    shelf.sort((a, b) => b.score - a.score);
    if (originalItem) shelf.unshift(originalItem);
  }
  const hasShelf = shelf.length > 1;
  const topNoteWeight =
    f.notes.length > 0 ? Math.max(...f.notes.map((n) => n.weight)) : 0;
  const shownNotes = f.notes.filter((n) => n.weight >= topNoteWeight * PROMINENCE_FLOOR);
  // A note with a weight of zero means nobody has voted this scent's
  // ingredients. The names are still the brand's own listing, so they are
  // shown, but they do not link into a family the scent is not in.
  const notesVoted = topNoteWeight > 0;

  // "Smells like this": the measured peers first, then the accord overlap
  // for anything the graph has not measured. Both are candidates for the
  // same vote, because the vote is "is this a clone of this page, and how
  // close".
  const measuredIds = new Set<string>([
    ...cloneEntries.map((c) => c.cloneId),
    ...siblingEntries.map((c) => c.cloneId),
    ...peerEntries.map((c) => c.cloneId),
  ]);
  const smellsLike: Array<{
    id: string;
    name: string;
    slug: string;
    house: string;
    year: number | null;
    pid: string | null;
    score: number;
    sampleSize: number;
    shared: number;
    sharedNotes: number;
    measured: boolean;
  }> = [
    ...peerEntries.map((c) => ({
      id: c.cloneId,
      name: c.cloneName,
      slug: c.slug,
      house: c.houseName,
      year: null,
      pid: c.pid,
      score: c.score,
      sampleSize: c.sampleSize,
      shared: 0,
      sharedNotes: 0,
      measured: true,
    })),
    ...similarByAccords
      .filter((s) => !measuredIds.has(s.id))
      .map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        house: s.house,
        year: s.year,
        pid: s.pid,
        score: 0,
        sampleSize: 0,
        shared: s.shared,
        sharedNotes: s.sharedNotes,
        measured: false,
      })),
  ].slice(0, 12);

  // where the numbers on this page come from, for the provenance list
  const closenessSource =
    mainTarget !== null
      ? mainFromCensus
        ? `${mainSample.toLocaleString("en-US")} ${mainSample === 1 ? "vote" : "votes"} cast on this site, by people who own both bottles.`
        : "No votes cast here yet. The census score appears once people who own both bottles have voted. The closeness share from public polls is deliberately left off: it tracks who voted, not how close the liquids are."
      : cloneEntries.length > 0
        ? "The ranking is the computed scent match. No votes have been cast here yet; a census vote replaces the estimate the moment people who own both bottles place one."
        : "No one has rated a clone against this one yet. The census score appears once people who own both bottles have voted.";

  const newestPrice = buyOptions.reduce<Date | null>(
    (latest, option) =>
      latest === null || option.capturedAt > latest ? option.capturedAt : latest,
    null,
  );
  const priceDate =
    newestPrice === null
      ? ""
      : newestPrice.toISOString().slice(0, 10);

  return (
    <main className="page">
      {/* ===== the head: what this page is, and what it clones ===== */}
      <header style={{ paddingTop: "3.25rem", maxWidth: "46rem" }}>
        <p className="label rise">
          <Link href={`/house/${f.house.slug}`} className="textlink">
            {f.house.name}
          </Link>
          {f.year ? ` · ${f.year}` : ""}
          {f.perfumer ? ` · ${f.perfumer}` : ""}
        </p>
        <h1 className="display rise rise-1" style={{ marginTop: "0.8rem" }}>
          {f.name}
        </h1>
        <p className="lede rise rise-2" style={{ marginTop: "1.35rem", maxWidth: "42rem" }}>
          {mainTarget !== null
            ? `${f.name} is listed as a clone of ${mainTarget.name}. The family below is ${mainTarget.name} first, then every clone the census tracks against it.`
            : unifiedClones.length > 0
              ? `The original. ${unifiedClones.length} ${unifiedClones.length === 1 ? "clone" : "clones"} in the list below, ranked by computed scent match.`
              : "Nothing in the catalogue has been measured as a clone of it yet. The census needs someone who owns both to say how close they are."}
        </p>

        {f.accords.length > 0 ? (
          <div className="rise rise-3" style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "1.6rem" }}>
            <span className="tag" style={{ alignSelf: "center", marginRight: "0.3rem" }}>
              scent family
            </span>
            {f.accords.slice(0, 8).map((a) => (
              <Link key={a} href={`/accord/${slugify(a)}`} className="chip">
                {a}
              </Link>
            ))}
          </div>
        ) : null}

        {shownNotes.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.45rem" }}>
            <span className="tag" style={{ alignSelf: "center", marginRight: "0.3rem" }}>
              notes
            </span>
            {shownNotes.slice(0, 8).map((n) =>
              notesVoted ? (
                <Link key={n.noteId} href={`/note/${slugify(n.note.name)}`} className="chip">
                  {n.note.name}
                </Link>
              ) : (
                <span key={n.noteId} className="chip">
                  {n.note.name}
                </span>
              ),
            )}
          </div>
        ) : null}

        {f.accords.length > 0 || shownNotes.length > 0 ? (
          <p className="fine" style={{ marginTop: "0.75rem", maxWidth: "38rem" }}>
            Accords are the family: how the scent reads overall. Notes are the
            materials inside it.
          </p>
        ) : null}

        {mainTarget !== null && cloneTargets.some((target) => target.kind === "clone" && target.id !== mainTarget.id) ? (
          <p className="fine" style={{ marginTop: "0.9rem", maxWidth: "38rem" }}>
            Also measured against{" "}
            {cloneTargets
              .filter((target) => target.kind === "clone" && target.id !== mainTarget.id)
              .slice(0, 3)
              .map((target, index) => (
                <span key={target.id}>
                  {index > 0 ? ", " : ""}
                  <Link href={`/fragrance/${target.slug}`} className="textlink">
                    {target.name}
                  </Link>
                </span>
              ))}
            .
          </p>
        ) : null}

        {f.inspiredBy === null ? (
          <form action={toggleFollowAction} style={{ marginTop: "1.75rem" }}>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="subjectType" value="FRAGRANCE" />
            <input type="hidden" name="subjectId" value={f.id} />
            <button type="submit" className={`btn${isFollowing ? " solid" : " secondary"}`}>
              {isFollowing ? "Following" : "Follow this scent"}
            </button>
          </form>
        ) : null}
      </header>

      {/* ===== the family, standing on a baseline ===== */}
      {hasShelf ? (
        <section className="rise rise-3" style={{ marginTop: "3.25rem" }}>
          <p className="label">
            {mainTarget !== null ? "The family it copies" : `Clones of ${f.name}`}
          </p>
          <div className="specimen-strip" style={{ marginTop: "1rem" }}>
            {shelf.map((item) => {
              const isThis = item.id === f.id;
              return (
                <Link
                  key={`${item.role}-${item.id}`}
                  href={`/fragrance/${item.slug}`}
                  className={`specimen-cell${isThis ? " is-this" : ""}`}
                >
                  <span className="specimen-plate">
                    <BottleThumb pid={item.pid} name={item.name} />
                  </span>
                  <span className="specimen-name">{item.name}</span>
                  <span className="specimen-meta">
                    {item.role === "original" ? (
                      "the original"
                    ) : isThis ? (
                      item.metric === "scent" ? (
                        <>
                          <span className="close">{item.score}%</span> scent match
                          {", this bottle"}
                        </>
                      ) : (
                        "this bottle"
                      )
                    ) : item.metric === "scent" ? (
                      <>
                        <span className="close">{item.score}%</span> scent match
                      </>
                    ) : (
                      "no note data yet"
                    )}
                  </span>
                  {item.role === "clone" && readPrice(item.priceCaptures) !== null ? (
                    <span className="specimen-meta">{formatPriceRead(readPrice(item.priceCaptures))}</span>
                  ) : null}
                </Link>
              );
            })}
          </div>
          {restCount > 0 ? (
            <p className="fine" style={{ marginTop: "0.85rem" }}>
              {restCount} more {restCount === 1 ? "clone" : "clones"} in the list
              below.
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ===== the verdict: one question, one scale, one vote row ===== */}
      {mainTarget !== null ? (
        <section className="section" style={{ maxWidth: "46rem" }}>
          <p className="label">The verdict</p>
          <p className="meter-question" style={{ marginTop: "1rem", fontSize: "1.25rem" }}>
            How close does {f.name} smell to {mainTarget.name}?
          </p>

          <div style={{ marginTop: "2rem" }}>
            <ClosenessMeter
              sampleSize={mainSample}
              score={mainScore}
              counts={canonCounts}
              sampleNote={mainFromCensus ? "from census votes" : undefined}
            />
          </div>

          <div style={{ marginTop: "1.75rem" }}>
            {viewerId !== null ? (
              <VoteButtons slug={slug} cloneId={f.id} targetId={mainTarget.id} current={myCanonVote ?? null} />
            ) : (
              <Link href="/signin" className="textlink">
                Sign in to rate how close this is
              </Link>
            )}
          </div>

          <p className="fine" style={{ marginTop: "1rem", maxWidth: "38rem" }}>
            Rate it: spot on, close, similar, or not close. One tap. The score
            is the average of all votes — spot on is 95, close is 80, similar is
            60, same family is 35, not close is 10.
          </p>

        </section>
      ) : null}

      {/* ===== the clone list: every clone, real votes first ===== */}
      {unifiedClones.length > 0 ? (
        <section className="section">
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            <p className="label">Clones of {f.name}</p>
            <p className="fine">
              {unifiedClones.length} {unifiedClones.length === 1 ? "clone" : "clones"}, ranked by scent match.
            </p>
          </div>
          <p className="fine" style={{ marginTop: "0.6rem", maxWidth: "44rem" }}>
            How to read the rows. The headline is the scent match: how much of{" "}
            {f.name}
            &rsquo;s scent families the product shares, computed from public
            note and accord lists, 50% accord overlap plus 50% note overlap. It
            is not a vote. When people who own both bottles vote here, their
            verdict replaces the estimate. No note data means the catalogue
            carries no note list for that bottle. Data as of October 2026.
          </p>
          <ul className="index-list" style={{ marginTop: "1.25rem" }}>
            {unifiedClones.map((clone) => (
              <li key={clone.id}>
                <div className="index-row" style={{ gridTemplateColumns: "4rem minmax(0,1fr) auto", alignItems: "start" }}>
                  <div className="specimen-cell" style={{ width: "4rem", border: 0, padding: 0 }}>
                    {clone.slug !== null ? (
                      <Link href={`/fragrance/${clone.slug}`}>
                        <span className="specimen-plate" style={{ marginBottom: 0 }}>
                          <BottleThumb pid={clone.pid} name={clone.name} />
                        </span>
                      </Link>
                    ) : (
                      <span className="specimen-plate" style={{ marginBottom: 0 }}>
                        <GhostBottle w={26} h={52} />
                      </span>
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    {clone.slug !== null ? (
                      <Link href={`/fragrance/${clone.slug}`} className="index-name">
                        {clone.name}
                      </Link>
                    ) : (
                      <a href={clone.sourceUrl ?? "#"} className="index-name" target="_blank" rel="nofollow noopener noreferrer">
                        {clone.name}
                      </a>
                    )}
                    <span className="plate-house">
                      {clone.house}
                    </span>
                    <p className="fine" style={{ marginTop: "0.2rem" }}>
                      {clone.familyMatch !== null ? (
                        <>
                          <span className="close">{clone.familyMatch}%</span> scent match
                        </>
                      ) : (
                        <>No note data for this pair yet.</>
                      )}
                    </p>
                    {clone.textureNote !== null ? (
                      <p className="fine" style={{ marginTop: "0.15rem", fontStyle: "italic" }}>
                        &ldquo;{clone.textureNote}&rdquo;
                        {clone.sourceUrl !== null ? (
                          <> · owner comment, {claimSourceLabel(clone.claimType ?? "", clone.sourceUrl)}</>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                  <div style={{ textAlign: "right", minWidth: "8rem" }}>
                    {clone.priceCents !== null && clone.sizeMl !== null ? (
                      <p className="fine">{formatClaimPrice(clone.priceCents, clone.sizeMl, clone.currency)}</p>
                    ) : null}
                    {clone.sourceUrl !== null ? (
                      <a href={clone.sourceUrl} className="textlink fine" target="_blank" rel="nofollow noopener noreferrer">
                        {claimSourceLabel(clone.claimType ?? "", clone.sourceUrl)}
                      </a>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ===== second in line: clones of the direct clones ===== */}
      {secondDegree.length > 0 ? (
        <section className="section" style={{ maxWidth: "56rem" }}>
          <p className="label">Second in line</p>
          <p className="fine" style={{ marginTop: "0.6rem", maxWidth: "44rem" }}>
            These copy a clone, not {f.name} directly. Listed for lineage: a
            closeness score waits on votes cast here.
          </p>
          <ul className="index-list" style={{ marginTop: "1.25rem" }}>
            {secondDegree.map((item) => (
              <li key={item.id}>
                <div className="index-row" style={{ gridTemplateColumns: "4rem minmax(0,1fr)" }}>
                  <Link
                    href={`/fragrance/${item.slug}`}
                    className="specimen-cell"
                    style={{ width: "4rem", border: 0, padding: 0 }}
                  >
                    <span className="specimen-plate" style={{ marginBottom: 0 }}>
                      <BottleThumb pid={item.pid} name={item.name} />
                    </span>
                  </Link>
                  <div style={{ minWidth: 0 }}>
                    <Link href={`/fragrance/${item.slug}`} className="index-name">
                      {item.name}
                    </Link>
                    <span className="plate-house">
                      {item.houseName}
                      {item.year !== null ? ` · ${item.year}` : ""}
                    </span>
                    <p className="fine" style={{ marginTop: "0.2rem" }}>
                      copies{" "}
                      <Link href={`/fragrance/${item.parentSlug}`} className="textlink">
                        {item.parentName}
                      </Link>
                      {", already listed in "}
                      {f.name}
                      &rsquo;s family.
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {CONTESTED_ORIGINALS[f.catalogueSourcePid ?? ""] !== undefined ? (
        <p className="fine" style={{ marginTop: "1.5rem", maxWidth: "44rem" }}>
          {CONTESTED_ORIGINALS[f.catalogueSourcePid ?? ""]}
        </p>
      ) : null}

      {/* ===== smells like this ===== */}
      {smellsLike.length > 0 ? (
        <section className="section" style={{ maxWidth: "56rem" }}>
          <p className="label">Smells like this</p>
          <p className="fine" style={{ marginTop: "0.6rem", maxWidth: "40rem" }}>
            {peerEntries.length > 0
              ? "A measured resemblance from the community. Neither is a copy of the other."
              : "These share accords and at least three of each other's strongest notes. None is a measured clone yet."}
          </p>

          <ul className="index-list" style={{ marginTop: "1.25rem" }}>
            {smellsLike.map((item) => (
              <li key={item.id}>
                <div className="index-row" style={{ gridTemplateColumns: "4rem minmax(0,1fr) auto" }}>
                  <Link href={`/fragrance/${item.slug}`} className="specimen-cell" style={{ width: "4rem", border: 0, padding: 0 }}>
                    <span className="specimen-plate" style={{ marginBottom: 0 }}>
                      <BottleThumb pid={item.pid} name={item.name} />
                    </span>
                  </Link>
                  <div style={{ minWidth: 0 }}>
                    <Link href={`/fragrance/${item.slug}`} className="index-name">
                      {item.name}
                    </Link>
                    <span className="plate-house">
                      {item.house}
                      {item.year !== null ? ` · ${item.year}` : ""}
                    </span>
                    <p className="fine" style={{ marginTop: "0.2rem" }}>
                      {item.measured
                        ? "listed as a resemblance in the community graph"
                        : `shares ${item.shared} ${item.shared === 1 ? "accord" : "accords"} and ${item.sharedNotes} ${item.sharedNotes === 1 ? "note" : "notes"}`}
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {viewerId !== null ? (
                      <VoteButtons
                        slug={slug}
                        cloneId={item.id}
                        targetId={f.id}
                        current={myVoteByClone.get(item.id) ?? null}
                        compact
                      />
                    ) : (
                      <Link href="/signin" className="textlink" style={{ fontSize: "0.8125rem" }}>
                        Rate it
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ===== where to buy: labeled, below the ranking, and the price is the
          partner's own captured asking price, never a negotiated one ===== */}
      {buyOptions.length > 0 && (
        <section className="section" style={{ maxWidth: "44rem" }}>
          <p className="label">Where to buy</p>
          <ul className="rows" style={{ marginTop: "1rem" }}>
            {buyOptions.map((option) => (
              <li key={option.url} style={{ display: "flex", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
                <a
                  href={option.url}
                  target="_blank"
                  rel="sponsored nofollow noopener"
                  className="textlink"
                >
                  {option.partnerName}
                </a>
                <span className="figure" style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                  {cents(option.priceCents)}
                  {option.sizeMl !== null ? ` at ${option.sizeMl}ml` : ""}
                </span>
              </li>
            ))}
          </ul>
          <p className="fine" style={{ marginTop: "0.9rem" }}>
            {buyOptions.some((o) => o.earns)
              ? "Prices are live asking prices captured from each retailer. We may earn a commission if you buy through one of these links. The census ranking above is decided by votes, and no retailer can buy a position on it."
              : "Prices are live asking prices captured from each retailer. The census ranking above is decided by votes, and no retailer can buy a position on it."}
          </p>
        </section>
      )}

      {/* ===== where the numbers on this page come from ===== */}
      <section className="section" style={{ maxWidth: "44rem" }}>
        <p className="label">Where these numbers come from</p>
        <ul className="rows" style={{ marginTop: "1rem" }}>
          <li>
            <strong>Closeness.</strong>{" "}
            {closenessSource}
          </li>
          <li>
            <strong>Scent family match.</strong> How much of {f.name}&rsquo;s
            scent families the product shares, computed from public note and
            accord lists. 50% accord overlap (broad families like citrus and
            woody) plus 50% note overlap (shared materials). Not a vote and not
            a memory test. A copied note list scores high here without proving
            the liquids smell alike.
          </li>
          <li>
            <strong>Texture notes.</strong> One line from owners who have worn
            both, sourced from public reviews. What they notice that no number
            captures: more citrus, less soap, more energy.
          </li>
          <li>
            <strong>Prices.</strong>{" "}
            {buyOptions.length > 0
              ? `Live asking prices captured from ${buyOptions.map((o) => o.partnerName).join(", ")} on ${priceDate}. Asking prices, not sold prices.`
              : "No retailer has a live price for this one yet."}
          </li>
          <li>
            <strong>Photos.</strong> Catalogue photos, hotlinked from the
            fragrance catalogue.
          </li>
          <li>
            <strong>Creator verdicts.</strong> One reviewer, one opinion. They
            are not census votes and they are not counted in the numbers above.
          </li>
        </ul>
        <p className="fine" style={{ marginTop: "0.9rem" }}>
          The ranking is never for sale. A house can advertise here, but it
          cannot buy a position in a census row.
        </p>
      </section>

      {/* ===== ad slots: rendered only when a partner is paying ===== */}
      {adSlot !== null ? (
        <aside className="ad" style={{ marginTop: "3rem" }}>
          <span className="ad-label">
            Advertisement{adSlot.sponsorName !== null ? ` · ${adSlot.sponsorName}` : ""}
          </span>
          <p style={{ fontWeight: 600 }}>{adSlot.headline}</p>
          <p className="sub" style={{ marginTop: "0.35rem" }}>{adSlot.body}</p>
          <a
            href={adSlot.ctaUrl}
            target="_blank"
            rel="sponsored nofollow noopener"
            className="btn"
            style={{ marginTop: "1.1rem" }}
          >
            {adSlot.ctaText}
          </a>
        </aside>
      ) : null}

      {adSlotBelow !== null ? (
        <aside className="ad" style={{ marginTop: "1.5rem" }}>
          <span className="ad-label">
            Advertisement{adSlotBelow.sponsorName !== null ? ` · ${adSlotBelow.sponsorName}` : ""}
          </span>
          <p style={{ fontWeight: 600 }}>{adSlotBelow.headline}</p>
          <p className="sub" style={{ marginTop: "0.35rem" }}>{adSlotBelow.body}</p>
          <a
            href={adSlotBelow.ctaUrl}
            target="_blank"
            rel="sponsored nofollow noopener"
            className="btn"
            style={{ marginTop: "1.1rem" }}
          >
            {adSlotBelow.ctaText}
          </a>
        </aside>
      ) : null}

      {/* ===== creator verdicts ===== */}
      {videoReviews.length > 0 ? (
        <section className="section" style={{ maxWidth: "44rem" }}>
          <p className="label">Creator verdicts</p>
          <ul style={{ marginTop: "1rem", listStyle: "none" }}>
            {videoReviews.map((r) => (
              <li key={r.id} style={{ paddingBottom: "0.6rem" }}>
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="textlink">
                  {r.title ?? r.url}
                </a>
                {" · "}
                <Link href={`/creator/${r.creatorSlug}`} className="sub">
                  {r.creatorName}
                </Link>
                {r.creatorVerdictNote !== null && (
                  <p className="fine" style={{ marginTop: "0.2rem" }}>{r.creatorVerdictNote}</p>
                )}
                {r.isPartner && <span className="tag">partner</span>}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

// The page renders in one piece, with no Suspense boundary.
//
// The reason: a Suspense boundary creates a static shell, and the CDN caches
// that shell. When the data changes the cached shell still points at the
// chunks from the build that made it, so the browser loads the current
// chunks, the flight payload does not match, and React never renders the
// streamed content. The reader sees "Loading..." forever while the server
// response looks perfectly fine.
//
// With no boundary, the whole page is one request-time render, so there is no
// shell to cache and no payload to mismatch. The page costs one query round
// trip, which the census page was doing anyway.
//
// "instant = false" (set on the root layout) is what allows this route to
// block on request-time data instead of being prerendered.
export default async function FragrancePage({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  return (
    <div className="min-h-screen bg-wall">
      <ProductData slug={slug} />
    </div>
  );
}
