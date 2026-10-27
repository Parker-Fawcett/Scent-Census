// One row in the "Also named" list.
//
// The row carries three pieces of information: the scent family match (the
// closest thing to "how close does this smell" that we can compute), the
// voter association (when the corpus compared the pair), and a one-line
// texture note from owners' reviews. The family match is the big number.
// The vote share and texture note are supporting detail.

import Link from "next/link";
import { BottleThumb } from "@/components/BottleThumb";
import { GhostBottle } from "@/components/productBits";
import { formatClaimPrice, claimVoteShare } from "@/domain/cloneClaims";
import type { ClaimRow as ClaimData } from "@/server/cloneClaims";

const CLAIM_SOURCE: Record<ClaimData["claimType"], string> = {
  HOUSE_DECLARED: "the maker says so",
  COMMUNITY_LIST: "named in a public list",
  EDITORIAL: "named in a blog",
};

export function ClaimListRow({
  claim,
  targetName,
  size = "full",
}: {
  claim: ClaimData;
  targetName: string;
  size?: "full" | "compact";
}) {
  const price = formatClaimPrice(claim.priceCents, claim.sizeMl, claim.currency);
  const compact = size === "compact";
  const thumb = compact ? "3rem" : "4rem";
  const vote = claimVoteShare(claim);

  const name =
    claim.slug !== null ? (
      <Link href={`/fragrance/${claim.slug}`} className="index-name">
        {claim.productName}
      </Link>
    ) : (
      <a href={claim.sourceUrl} className="index-name" target="_blank" rel="nofollow noopener noreferrer">
        {claim.productName}
      </a>
    );

  return (
    <div
      className="index-row"
      style={{
        gridTemplateColumns: `${thumb} minmax(0,1fr) auto`,
        alignItems: "start",
      }}
    >
      <div className="specimen-cell" style={{ width: thumb, border: 0, padding: 0 }}>
        {claim.slug !== null ? (
          <Link href={`/fragrance/${claim.slug}`}>
            <span className="specimen-plate" style={{ marginBottom: 0 }}>
              <BottleThumb pid={claim.pid} name={claim.productName} />
            </span>
          </Link>
        ) : (
          <span className="specimen-plate" style={{ marginBottom: 0 }}>
            <GhostBottle w={compact ? 20 : 26} h={compact ? 40 : 52} />
          </span>
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        {name}
        <span className="plate-house">
          {claim.houseName} · {CLAIM_SOURCE[claim.claimType]}
          {claim.discontinued ? " · discontinued" : ""}
        </span>
        {compact ? (
          <p className="fine" style={{ marginTop: "0.2rem" }}>
            {claim.familyMatch !== null ? `${claim.familyMatch}% scent match` : "no scent data"}
            {vote !== null ? ` · ${vote.share}% of voters associated them` : ""}
          </p>
        ) : (
          <>
            <p className="fine" style={{ marginTop: "0.2rem" }}>
              {claim.familyMatch !== null ? (
                <>
                  <span className="close">{claim.familyMatch}% scent match</span>
                  {vote !== null ? (
                    <> · {vote.share}% of voters said it reminds them of {targetName}</>
                  ) : null}
                </>
              ) : (
                <>No scent data available.</>
              )}
            </p>
            {claim.textureNote !== null ? (
              <p className="fine" style={{ marginTop: "0.15rem", fontStyle: "italic" }}>
                &ldquo;{claim.textureNote}&rdquo;
              </p>
            ) : null}
          </>
        )}
      </div>
      <div style={{ textAlign: "right", minWidth: compact ? "auto" : "8rem" }}>
        {price !== null ? <p className="fine">{price}</p> : null}
        <a
          href={claim.sourceUrl}
          className="textlink fine"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          {claim.claimType === "HOUSE_DECLARED" ? "seller page" : "source"}
        </a>
      </div>
    </div>
  );
}
