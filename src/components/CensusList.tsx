"use client";

import { useState } from "react";
import { CensusRow, type CensusRowData } from "@/components/CensusRow";

/**
 * The census list.
 *
 * A famous scent can have a hundred clones, and a hundred full rows made the
 * page 21,000 pixels tall. So the list shows the ones a reader is likely to
 * act on first, and the rest sit behind an explicit control. The count is
 * always visible, because "there are 129 clones" is itself the answer for
 * someone whose scent is famously copied.
 */
export function CensusList({
  rows,
  initial = 12,
  signedIn = false,
}: {
  rows: CensusRowData[];
  initial?: number;
  signedIn?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  if (rows.length === 0) return null;

  // "the ones a reader acts on first": the ones with a measurement, and
  // among those the closest. Unvoted clones go to the tail.
  const measured = rows.filter((r) => r.sampleSize > 0);
  const unmeasured = rows.filter((r) => r.sampleSize === 0);
  const ordered = [...measured, ...unmeasured];

  const head = expanded || showAll ? ordered : ordered.slice(0, initial);
  const hidden = ordered.length - head.length;

  return (
    <div>
      <ul className="census-rows">
        {head.map((row) => (
          <CensusRow key={row.cloneId} row={row} />
        ))}
      </ul>
      <div style={{ marginTop: "1.25rem", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "1rem" }}>
        {hidden > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="btn secondary"
          >
            Show {hidden} more {hidden === 1 ? "clone" : "clones"}
          </button>
        ) : null}
        <span className="fine">
          {ordered.length} {ordered.length === 1 ? "clone" : "clones"} in the
          census
        </span>
        {/* one way into the vote flow, not one per row */}
        {signedIn ? null : (
          <a href="/signin" className="textlink" style={{ marginLeft: "auto", fontSize: "0.8125rem" }}>
            Sign in to rate a clone
          </a>
        )}
      </div>
      {expanded && unmeasured.length > 0 ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="detail-toggle"
          style={{ marginTop: "0.9rem", fontSize: "0.75rem", color: "var(--text-muted)", textDecoration: "underline", textUnderlineOffset: "3px", background: "none", border: 0, padding: 0, cursor: "pointer", fontFamily: "inherit" }}
        >
          {showAll
            ? "hide the ones with no votes yet"
            : `show the ${unmeasured.length} with no votes yet`}
        </button>
      ) : null}
    </div>
  );
}
