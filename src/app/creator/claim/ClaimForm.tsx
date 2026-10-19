"use client";

import { useState } from "react";

export default function ClaimForm() {
  const [result, setResult] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setResult(null);
    const form = e.currentTarget;
    const token = (form.elements.namedItem("token") as HTMLInputElement).value;
    const res = await fetch("/api/creator/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    setResult(data.claimed ? `Claimed: ${data.creatorSlug}` : `Not claimed: ${data.reason}`);
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 480 }}>
      <label>
        Claim token
        <input name="token" type="text" required style={{ width: "100%" }} />
      </label>
      <button type="submit" disabled={pending}>{pending ? "Claiming..." : "Claim creator account"}</button>
      {result ? <p>{result}</p> : null}
    </form>
  );
}
