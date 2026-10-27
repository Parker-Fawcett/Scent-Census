"use client";

import { useState } from "react";
import { fragDbPhotoUrl } from "@/domain/photo";

/**
 * A small catalogue bottle that never leaves a broken image in the page.
 *
 * The source CDN answers for almost every record, but a few pids 404 and a
 * few rows have no pid at all. A row with a blank cell reads like missing
 * data; a ghost bottle reads like "no photo yet", which is what it is.
 */
export function BottleThumb({
  pid,
  name,
  className = "",
  width = 375,
  height = 500,
}: {
  pid: string | null;
  name: string;
  className?: string;
  width?: number;
  height?: number;
}) {
  const [failed, setFailed] = useState(false);
  const src = fragDbPhotoUrl(pid);

  if (src === null || failed) {
    return (
      <span className={`thumb-fallback ${className}`} aria-label={`${name}, no photo yet`}>
        <svg viewBox="0 0 66 141" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
          <path
            d="M26 2 h14 v12 c2 6 16 13 16 35 v69 c0 15 -7 21 -23 21 s-23 -6 -23 -21 V49 c0 -22 14 -29 16 -35 z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }

  return (
    <img
      className={className}
      src={src}
      alt={`${name} bottle`}
      width={width}
      height={height}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
