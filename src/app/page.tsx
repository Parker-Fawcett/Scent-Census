import Link from "next/link";

const primaryButton = {
  display: "inline-block",
  padding: "0.6rem 1.2rem",
  background: "#111",
  color: "#fff",
  borderRadius: 8,
  textDecoration: "none",
  fontWeight: 600,
} as const;

export default function Home() {
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
