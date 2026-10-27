"use client";

import { useState } from "react";
import Link from "next/link";
import { BottleThumb } from "@/components/BottleThumb";
import { BUCKET_LABELS } from "@/domain/census";
import { VoteButtons } from "@/components/productBits";
import { gapLabel, valueGap, valueLabel } from "@/domain/value";
import { formatPriceRead, formatSavings, readPrice, savingsRatio } from "@/domain/retailPrice";
import type { CensusBucket } from "@/domain/types";

export interface CensusRowData {
  cloneId: string;
  slug: string;
  cloneName: string;
  houseName: string;
  /** the catalogue photo pointer, so every census row shows a bottle */
  pid: string | null;
  score: number;
  sampleSize: number;
  rankLevel: string;
  source: "live-census" | "smell-alike-votes";
  upVotes: number | null;
  downVotes: number | null;
  valueScore: number | null;
  originalValueScore: number | null;
  priceCaptures: Array<{ priceCents: number; sizeMl: number | null; capturedAt: Date }>;
  originalPriceCaptures: Array<{ priceCents: number; sizeMl: number | null; capturedAt: Date }>;
  isThis: boolean;
  /** the visitor already owns this one */
  owned: boolean;
  seedBucket: string | null;
  seedScore: number | null;
  seedConfidence: string | null;
  /** voting props for inline voting */
  slugForVote?: string;
  targetIdForVote?: string | null;
  currentVote?: CensusBucket | null;
  signedIn?: boolean;
}

/**
 * One clone in the census.
 *
 * The census is a table of measurements, so it is set as one: a hairline
 * rule between rows, the closeness figure in the accent colour, the vote
 * count and the price in muted ink, and the supporting detail behind a
 * disclosure. The old row was six lines long and repeated a hundred times
 * per page, which is how a famous scent turned into a 21,000 pixel scroll.
 */
export function CensusRow({ row }: { row: CensusRowData }) {
  const [open, setOpen] = useState(false);

  const price = readPrice(row.priceCaptures);
  const originalPrice = readPrice(row.originalPriceCaptures);
  const ratio = savingsRatio(price?.cheapestCents ?? null, originalPrice?.cheapestCents ?? null);
  const gap = valueGap(row.valueScore, row.originalValueScore);

  return (
    <li className="census-row">
      <Link
        href={`/fragrance/${row.slug}`}
        className="census-thumb"
        aria-label={`${row.cloneName} bottle`}
      >
        <BottleThumb pid={row.pid} name={row.cloneName} />
      </Link>
      <div style={{ minWidth: 0 }}>
        <Link href={`/fragrance/${row.slug}`} className="name">
          {row.cloneName}
        </Link>{" "}
        <span className="house">{row.houseName}</span>{" "}
        {row.isThis ? (
          <span className="tag accent">this bottle</span>
        ) : row.owned ? (
          <span className="tag">on your shelf</span>
        ) : null}
      </div>

      <div className="measure">
        {row.sampleSize === 0 ? (
          <span className="votes">no votes yet</span>
        ) : (
          <span className="votes">
            {row.sampleSize.toLocaleString("en-US")}{" "}
            {row.sampleSize === 1 ? "vote" : "votes"} on record
          </span>
        )}
        {price !== null ? (
          <span className="price">
            {formatPriceRead(price)}
            {ratio !== null ? ` (${formatSavings(ratio)})` : ""}
          </span>
        ) : null}
      </div>

      {row.sampleSize > 0 || row.seedBucket !== null || gap !== null ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="detail-toggle"
        >
          {open ? "less" : "details"}
        </button>
      ) : null}

      {row.signedIn && row.slugForVote && row.targetIdForVote ? (
        <div style={{ gridColumn: "1 / -1", marginTop: "0.5rem" }}>
          <VoteButtons
            slug={row.slugForVote}
            cloneId={row.cloneId}
            targetId={row.targetIdForVote}
            current={row.currentVote ?? null}
            compact
          />
        </div>
      ) : null}

      {open ? (
        <div className="detail">
          {row.source === "smell-alike-votes" && row.sampleSize > 0 ? (
            <p>
              {row.upVotes?.toLocaleString("en-US")} of{" "}
              {row.sampleSize.toLocaleString("en-US")} voters said it reminds
              them of the original.
            </p>
          ) : null}
          {row.seedBucket !== null ? (
            <p>
              Seeded consensus: {BUCKET_LABELS[row.seedBucket as CensusBucket]} ·
              score {row.seedScore} ({row.seedConfidence}). Not a vote.
            </p>
          ) : null}
          {gap !== null ? (
            <p>
              {gapLabel(gap)}: voters rate it {valueLabel(row.valueScore!)} against{" "}
              {valueLabel(row.originalValueScore!)} for the original.
            </p>
          ) : null}
          {price !== null ? (
            <p>
              {formatPriceRead(price)}
              {originalPrice !== null
                ? ` against ${formatPriceRead(originalPrice)} for the original`
                : " at discounters and clone houses"}
              {ratio !== null ? `, so ${formatSavings(ratio)}` : ""}.
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
