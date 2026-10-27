// Themed to the wall like every other page. Honest, no drama.
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page page-narrow">
      <header className="page-head">
        <p className="label">404</p>
        <h1 className="page-title">Nobody stocked that</h1>
      </header>
      <div className="empty" style={{ marginTop: "2rem" }}>
        <p className="sub">
          Whatever shelf this page belonged to is not there. The catalogue is
          still young, so a misspelled slug is the most likely suspect.
        </p>
        <p style={{ marginTop: "1.25rem" }}>
          <Link href="/" className="textlink">Back to the front</Link>
        </p>
      </div>
    </main>
  );
}
