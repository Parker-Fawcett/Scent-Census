import Link from "next/link";

export default function Home() {
  return (
    <main style={{ maxWidth: 560, margin: "4rem auto", padding: "0 1rem" }}>
      <h1>Scent Census</h1>
      <p>
        Decide what bottle to add next. Your shelf is the signal, your votes
        are the census, and every price you see says where it came from.
      </p>
      <p>
        <Link href="/signin">Start with your email</Link>
      </p>
    </main>
  );
}
