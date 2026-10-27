import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import OnboardingForm from "./OnboardingForm";

async function OnboardingData() {
  // Explicit request-time marker: see note in shelf/page.tsx.
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const [user, lastBottle] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { budgetBand: true, cloneBand: true, accordPrefs: true },
    }),
    // a returning reader should see the bottle setup already knows about,
    // not an empty field next to a shelf that has one
    prisma.collectionItem.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        fragrance: {
          select: { id: true, name: true, year: true, house: { select: { name: true } } },
        },
      },
    }),
  ]);
  const loved =
    lastBottle === null
      ? null
      : {
          id: lastBottle.fragrance.id,
          name: lastBottle.fragrance.name,
          house: lastBottle.fragrance.house.name,
          year: lastBottle.fragrance.year,
          cloneCount: 0,
        };
  return (
    <OnboardingForm
      current={{
        budgetBand: user.budgetBand,
        cloneBand: user.cloneBand,
        accordPrefs: user.accordPrefs,
        loved,
      }}
    />
  );
}

// These pages depend on runtime data (the census, prices, a family graph),
// so they render per request instead of being prerendered at build time. A
// prerendered shell goes stale the moment the data changes, and the CDN then
// serves a shell whose flight payload references chunks from a build that no
// longer exists. The result is a page that streams its content and never
// renders it: the reader sees "Loading..." forever while the server response
// looks perfectly fine.
//
// With Cache Components enabled, "instant = false" allows this route to
// block on request-time data instead of being prerendered, and connection()
// at the page level is what makes it request-time.
export const instant = false;

export default async function OnboardingPage() {
  // This page depends on runtime data (the census, prices, a family graph),
  // so it renders per request. A build-time prerender goes stale the moment
  // the data changes, and the CDN then serves a shell whose flight payload
  // references chunks from a build that no longer exists. The result is a page
  // that streams its content and never renders it: the reader sees
  // "Loading..." forever while the server response looks perfectly fine.
  //
  // With Cache Components enabled, connection() at the page level is what
  // makes the route request-time.
  await connection();
  return (
    <main className="page page-narrow">
      <header className="page-head">
        <p className="label">Setup</p>
        <h1 className="page-title">Four answers, one bottle</h1>
        <p className="lede">
          The census gets sharper with every bottle it can name. Answer what you
          feel like answering, skip the rest, change it later.
        </p>
      </header>
      <div className="rule-heavy" style={{ marginTop: "2.5rem" }}>
        <Suspense fallback={<p className="loading">Loading…</p>}>
          <OnboardingData />
        </Suspense>
      </div>
    </main>
  );
}
