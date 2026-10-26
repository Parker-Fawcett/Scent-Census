import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

// The layout streams the session nav per request, so this route renders at
// request time like every other page on the site. Keeping the same pattern
// here avoids a prerendered shell whose flight payload references chunks
// from a build that no longer exists.
export const instant = false;

export const metadata: Metadata = {
  title: "For fragrance creators",
  description:
    "Creator accounts on the Scent Census: a claimed page, named citations on every census entry your reviews cover, and rules that keep the numbers honest.",
};

async function CreatorsContent() {
  await connection();
  return (
    <>
      <header className="page-head">
        <p className="label">Creator</p>
        <h1 className="page-title">For fragrance creators</h1>
        <p className="lede">
          This site counts bottles, not followers. If you review clones,
          the numbers here are the ones your audience asks for: what share
          of real owners called the pair close. Your reviews become
          checkable, and your name sits on them.
        </p>
      </header>

      <section className="rule-heavy" style={{ marginTop: "2.5rem" }}>
        <p className="label">Claim your page</p>
        <p style={{ marginTop: "0.75rem", maxWidth: "38rem" }}>
          Creator accounts are claim-based. We invite, you claim. The invite
          is a signed one-time token, sent to you privately. Sign in with an
          email, paste the token, and your creator page flips to claimed on
          the spot. Route locked: nobody else can take your name in the
          roster after that.
        </p>
        <p className="fine" style={{ marginTop: "0.6rem", maxWidth: "38rem" }}>
          Got a token already?{" "}
          <Link href="/creator/claim" className="textlink">
            Claim it here
          </Link>
          . No token yet? Keep reading; the invite list opens in waves.
        </p>
      </section>

      <section className="rule-heavy" style={{ marginTop: "2.5rem" }}>
        <p className="label">What a claim gets you</p>
        <ul style={{ marginTop: "0.75rem", maxWidth: "38rem", listStyle: "disc", paddingLeft: "1.25rem" }}>
          <li style={{ paddingBottom: "0.4rem" }}>
            A public page with your name, your pickups, and your verdicts.
            People follow it from inside the census.
          </li>
          <li style={{ paddingBottom: "0.4rem" }}>
            Named citations. When your review covers a bottle in the
            catalogue, that bottle&rsquo;s census page links your review with
            your name and your own closeness call, next to the numbers.
          </li>
          <li>
            Contact you can defend in the comments. Every claim on this site
            carries a labeled link to where it came from.
          </li>
        </ul>
      </section>

      <section className="rule-heavy" style={{ marginTop: "2.5rem" }}>
        <p className="label">The standing rules</p>
        <ul style={{ marginTop: "0.75rem", maxWidth: "38rem", listStyle: "disc", paddingLeft: "1.25rem" }}>
          <li style={{ paddingBottom: "0.4rem" }}>
            No fan pages. Your page exists only because you claimed it, and a
            creator who never accepts the invite stays uncited. The roster
            only unlocks what you already published in the wild.
          </li>
          <li style={{ paddingBottom: "0.4rem" }}>
            No paid ranking. No one, you or a house, can buy a higher share
            or a better spot on a list. The numbers move only when votes
            move.
          </li>
          <li>
            Sponsorship is labeled. If a review ever runs as part of a paid
            arrangement with this site, it carries a visible partner tag.
            Paid content looks paid.
          </li>
        </ul>
      </section>

      <section className="rule-heavy" style={{ marginTop: "2.5rem" }}>
        <p className="label">About money</p>
        <p style={{ marginTop: "0.75rem", maxWidth: "38rem" }}>
          The shop links on census pages earn nothing today. If that changes
          with affiliate partnerships, the written terms land here first,
          before the links do.
        </p>
      </section>

      <section className="rule-heavy" style={{ marginTop: "2.5rem" }}>
        <p className="label">When the platform strikes the sentence</p>
        <p style={{ marginTop: "0.75rem", maxWidth: "38rem" }}>
          The crackdown on clone talk is documented. German courts ruled
          against dupe sellers, the top civil court settled the principle in
          April 2025, and further rulings landed through October 2026. TikTok
          blocked its biggest clone hashtag, #designerdupe. The one line a
          clone review stands on, &ldquo;this smells like that,&rdquo; is the
          line most at risk of disappearing.
        </p>
        <p style={{ marginTop: "0.75rem", maxWidth: "38rem" }}>
          That is a creator problem before it is anyone else&rsquo;s. The
          review is yours, but the comparison inside it lives on a platform
          that can pull the sentence on a report. This site records the
          verdict with a date and a labeled source, and no platform owns the
          record. A clip can go down. The receipt stays here.
        </p>
      </section>

      <section className="rule-heavy" style={{ marginTop: "2.5rem" }}>
        <p className="label">Why we built it this way</p>
        <p style={{ marginTop: "0.75rem", maxWidth: "38rem" }}>
          Clone reviews stress-test a promise: does this bottle actually
          smell like the original? Most of the internet answers with ad
          scroll. The census answers with the share of people who owned both
          bottles and said yes. Creators are the ones whose calls get quoted;
          a named, checkable citation is worth more than an anonymous one.
          That is the whole deal.
        </p>
      </section>
    </>
  );
}

export default function CreatorsPage() {
  return (
    <main className="page page-narrow">
      <CreatorsContent />
    </main>
  );
}
