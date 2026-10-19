import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildFeedPage } from "@/server/feed";
import { voteAction } from "./feedActions";

const primaryButton = {
  display: "inline-block",
  padding: "0.6rem 1.2rem",
  background: "#111",
  color: "#fff",
  borderRadius: 8,
  textDecoration: "none",
  fontWeight: 600,
} as const;

const voteButton = {
  padding: "0.4rem 0.7rem",
  border: "1px solid #ddd",
  background: "#fff",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: "0.85rem",
} as const;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const page = Number((await searchParams).page ?? "1");
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  return (
    <Suspense fallback={<main style={{ maxWidth: 720, margin: "3rem auto", padding: "0 1rem" }}>Loading your feed...</main>}>
      <HomeContent page={safePage} />
    </Suspense>
  );
}

// Why Connection: auth() triggers next-auth's CSRF random on every
// cookie-less prerender, which Cache Components blocks (bisected in M3). The
// split data component + connection() keeps the prerender honest.
async function HomeContent({ page }: { page: number }) {
  await connection();
  const session = await auth();
  if (!session?.user?.id) {
    return <SignedOut />;
  }

  const { cards } = await buildFeedPage(prisma, session.user.id, { pageSize: 6 });

  return (
    <main style={{ maxWidth: 720, margin: "3rem auto", padding: "0 1rem" }}>
      <h1>Scent Census</h1>
      <p style={{ color: "#555" }}>
        What bottle should you add next? Vote honestly; the census learns.
      </p>
      {cards.length === 0 ? (
        <p>
          The feed ran dry: add a bottle to your shelf or reset onboarding, and
          the census gets smarter about you.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {cards.map((card) => (
            <li
              key={card.candidate.fragranceId}
              style={{ padding: "0.9rem 0", borderBottom: "1px solid #eee" }}
            >
              <strong>{card.candidate.name}</strong>
              {" · "}
              <span style={{ color: "#555" }}>{card.candidate.house.name}</span>
              {card.candidate.year ? ` · ${card.candidate.year}` : ""}
              {card.candidate.noteNames.length > 0 ? (
                <div style={{ color: "#666", fontSize: "0.85rem" }}>
                  notes: {card.candidate.noteNames.slice(0, 4).join(", ")}
                  {" · "}
                  {card.slot === "contrast" ? "deliberate contrast" : "on your wavelength"}
                </div>
              ) : null}
              <p style={{ margin: "0.35rem 0" }}>{card.reasonLine}</p>
              <form action={voteAction} style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                <input type="hidden" name="fragranceId" value={card.candidate.fragranceId} />
                <input type="hidden" name="reasonSlug" value={card.reasonSlug} />
                <input type="hidden" name="page" value={page} />
                <button type="submit" name="direction" value="LIKE" style={voteButton}>
                  I like this
                </button>
                <button type="submit" name="direction" value="DISLIKE" style={voteButton}>
                  Not for me
                </button>
                <button type="submit" name="direction" value="DECLINE" style={voteButton}>
                  Skip
                </button>
                <button type="submit" name="direction" value="OWN" style={voteButton}>
                  I own this
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      {cards.length > 0 ? (
        <p style={{ marginTop: "1.25rem" }}>
          <Link href={`/?page=${page + 1}`} style={primaryButton}>
            More picks
          </Link>
          {" "}
          <Link href="/shelf" style={{ ...primaryButton, background: "#f5f5f5", color: "#111" }}>
            My shelf
          </Link>
        </p>
      ) : null}
    </main>
  );
}

function SignedOut() {
  return (
    <main style={{ maxWidth: 560, margin: "4rem auto", padding: "0 1rem" }}>
      <h1>Scent Census</h1>
      <p>
        Decide what bottle to add next. Your shelf is the signal, your votes
        are the census, and every price you see says where it came from.
      </p>
      <p style={{ marginTop: "1.5rem" }}>
        <Link href="/signin" style={primaryButton}>
          Start with your email
        </Link>
      </p>
      <p style={{ color: "#666", fontSize: "0.9rem" }}>Email + password only for now; Google sign-in comes with real OAuth keys.</p>
    </main>
  );
}
