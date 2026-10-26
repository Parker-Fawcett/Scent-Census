"use client";

import { useState } from "react";
import { BUCKET_LABELS, BUCKET_VALUES } from "@/domain/census";
import { fragDbPhotoUrl } from "@/domain/photo";
import type { CensusBucket } from "@/domain/types";
import { cloneCensusVoteAction } from "@/app/fragrance/[slug]/censusActions";

const BUCKETS: CensusBucket[] = ["SPOT_ON", "CLOSE", "SIMILAR", "NOT_CLOSE"];

/** the short forms, for the row version of the vote row */
const SHORT_LABELS: Record<CensusBucket, string> = {
  SPOT_ON: "Spot on",
  CLOSE: "Close",
  SIMILAR: "Similar",
  SAME_FAMILY: "Family",
  NOT_CLOSE: "No",
};

export function GhostBottle({ w, h }: { w: number; h: number }) {
  return (
    <span className="ghost-bottle" aria-hidden="true">
      <svg width={w} height={h} viewBox="0 0 66 141" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax meet">
        <path d="M26 2 h14 v12 c2 6 16 13 16 35 v69 c0 15 -7 21 -23 21 s-23 -6 -23 -21 V49 c0 -22 14 -29 16 -35 z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

// the source photos are exactly 375x500 (3:4). Widths are pinned to that
// ratio so a flex parent can never squeeze a bottle out of shape.
const SIZE_PX: Record<"hero" | "pair" | "family" | "row", { h: number; w: number }> = {
  hero: { h: 196, w: 147 },
  pair: { h: 120, w: 90 },
  family: { h: 112, w: 84 },
  row: { h: 72, w: 54 },
};

/**
 * A catalogue bottle.
 *
 * The photos are shot on a white studio background. Set on the specimen
 * plate and multiplied, that white becomes the plate colour, so the bottle
 * sits in the page instead of floating on it as a cut-out. No sepia filter:
 * the plate does the work, and the bottle keeps its own colour.
 */
export function BottlePortrait({ pid, name, size }: { pid: string | null; name: string; size: "hero" | "pair" | "family" | "row" }) {
  const [failed, setFailed] = useState(false);
  const src = failed ? null : fragDbPhotoUrl(pid);
  if (src !== null) {
    return (
      <img
        src={src}
        alt={`${name} bottle`}
        decoding="async"
        // intrinsic size so the browser reserves the box before the image
        // arrives (the source photos are 375x500)
        width={375}
        height={500}
        style={{ height: SIZE_PX[size].h, width: SIZE_PX[size].w, flexShrink: 0 }}
        onError={() => setFailed(true)}
      />
    );
  }
  return <GhostBottle w={size === "hero" ? 92 : size === "pair" ? 56 : 30} h={size === "hero" ? 196 : size === "pair" ? 120 : 64} />;
}

/**
 * A bottle on its specimen plate.
 *
 * The plate is a mid-tone rectangle. A catalogue photo multiplied onto it
 * loses its white studio background and keeps its own colour, so the bottle
 * sits in the paper rather than floating on it as a cut-out.
 */
export function SpecimenPlate({ pid, name, w, h }: { pid: string | null; name: string; w: number; h: number }) {
  const [failed, setFailed] = useState(false);
  const src = failed ? null : fragDbPhotoUrl(pid);
  return (
    <div className="specimen" style={{ width: w, height: h }}>
      {src !== null ? (
        <img
          src={src}
          alt={`${name} bottle`}
          decoding="async"
          width={375}
          height={500}
          onError={() => setFailed(true)}
        />
      ) : (
        <GhostBottle w={Math.round(w * 0.42)} h={Math.round(h * 0.8)} />
      )}
    </div>
  );
}

export function VoteButtons({ slug, cloneId, targetId, current, compact }: {
  slug: string;
  cloneId: string;
  targetId: string;
  current: CensusBucket | null;
  /** the row version, for a list of candidates rather than one verdict */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <span style={{ display: "inline-flex", gap: "0.25rem", alignItems: "center" }}>
        <form action={cloneCensusVoteAction} style={{ display: "flex", gap: "0.25rem" }}>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="cloneId" value={cloneId} />
          <input type="hidden" name="targetId" value={targetId} />
          {BUCKETS.map((bucket) => (
            <button
              key={bucket}
              type="submit"
              name="bucket"
              value={bucket}
              className={`btn secondary${current === bucket ? " solid" : ""}`}
              style={{ padding: "0.2rem 0.4rem", fontSize: "0.625rem", minWidth: "2.5rem" }}
              title={`Rate this ${BUCKET_LABELS[bucket].toLowerCase()}`}
            >
              {SHORT_LABELS[bucket]}
            </button>
          ))}
        </form>
      </span>
    );
  }

  return (
    <div style={{ width: "100%" }}>
      <form action={cloneCensusVoteAction} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="cloneId" value={cloneId} />
        <input type="hidden" name="targetId" value={targetId} />
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            flexWrap: "wrap",
          }}
        >
          {BUCKETS.map((bucket) => (
            <button
              key={bucket}
              type="submit"
              name="bucket"
              value={bucket}
              className={`btn secondary${current === bucket ? " solid" : ""}`}
              style={{
                flex: "1 1 0",
                minWidth: "5rem",
                padding: "0.75rem 0.5rem",
                fontSize: "0.8125rem",
                fontWeight: current === bucket ? 600 : 400,
              }}
              title={`Rate this ${BUCKET_LABELS[bucket].toLowerCase()}`}
            >
              {BUCKET_LABELS[bucket]}
            </button>
          ))}
        </div>
      </form>
      {current !== null ? (
        <p className="fine" style={{ marginTop: "0.5rem" }}>
          Your vote: {BUCKET_LABELS[current]}
        </p>
      ) : null}
    </div>
  );
}

export function ClosenessMeter({ sampleSize, score, counts, question, sampleNote }: {
  sampleSize: number;
  score: number;
  counts: Partial<Record<CensusBucket, number>>;
  question?: string;
  sampleNote?: string;
}) {
  const maxCount = Math.max(1, ...Object.values(counts).filter((c): c is number => typeof c === "number"));
  const common = Object.entries(counts)
    .filter(([, c]) => typeof c === "number")
    .sort((a, b) => b[1] - a[1])[0]?.[0] as CensusBucket | undefined;

  return (
    <div className="meter" role="img" aria-label={sampleSize > 0 ? `Closeness score ${score} from ${sampleSize} votes` : "No votes yet"}>
      {sampleSize > 0 ? (
        <>
          <div className="meter-score">
            {score}
            <small>
              {sampleSize === 1 ? "1 vote" : `${sampleSize.toLocaleString("en-US")} votes`}
              {sampleNote ? ` · ${sampleNote}` : ""}
            </small>
          </div>
          <div className="meter-track">
            <div className="meter-fill" style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
            <div className="meter-marker" style={{ right: `${Math.max(0, Math.min(100, score))}%` }} title={`score ${score}`} />
          </div>
          <div className="meter-labels">
            {/* one label per vote option, positioned exactly where that
                bucket's score lands on the 0-100 track. Spot on (95) marks
                at 5%, close (80) at 20%, similar (60) at 40%, not close
                (10) at 90%. The marker then always sits on its label. */}
            {BUCKETS.map((bucket) => (
              <span
                key={bucket}
                style={{ left: `${100 - BUCKET_VALUES[bucket]}%` }}
              >
                {BUCKET_LABELS[bucket]}
              </span>
            ))}
          </div>
          {Object.values(counts).some((c) => typeof c === "number" && c > 0) ? (
          <div className="meter-dist">
            {BUCKETS.map((bucket) => {
              const count = counts[bucket];
              const height = count && count > 0 ? Math.max(6, Math.round((count / maxCount) * 100)) : 0;
              return (
                <div key={bucket} className={`meter-col${bucket === common && count ? " meter-col-common" : ""}`}>
                  <span className="meter-col-count">{count && count > 0 ? count : ""}</span>
                  {height > 0 ? <div className="meter-col-bar" style={{ height: `${height}%` }} /> : null}
                </div>
              );
            })}
          </div>
          ) : null}
        </>
      ) : (
        <p className="fine" style={{ maxWidth: "34rem" }}>
          No votes yet. The scale appears once people who own both bottles have
          rated this pair. The first votes are the difference between a
          question mark and a measured score.
        </p>
      )}
    </div>
  );
}
