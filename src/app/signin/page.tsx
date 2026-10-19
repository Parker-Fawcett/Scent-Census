"use client";

import { useActionState } from "react";
import { registerAction, signInAction } from "@/app/actions";

export default function SignInPage() {
  const [signInError, onSignIn] = useActionState(
    async (_prev: string | null, formData: FormData) => signInAction(formData),
    null,
  );
  const [registerError, onRegister] = useActionState(
    async (_prev: string | null, formData: FormData) => registerAction(formData),
    null,
  );

  const heading = "Scent Census";
  const intro = "Decide what bottle to add next, from your shelf and your votes.";

  return (
    <main style={{ maxWidth: 420, margin: "4rem auto", padding: "0 1rem" }}>
      <h1>{heading}</h1>
      <p>{intro}</p>

      <section style={{ marginTop: "2rem" }}>
        <h2>Sign in</h2>
        <form action={onSignIn}>
          <label>
            Email
            <input name="email" type="email" required style={{ width: "100%" }} />
          </label>
          <label>
            Password
            <input name="password" type="password" required minLength={8} style={{ width: "100%" }} />
          </label>
          {signInError ? <p role="alert">{signInError}</p> : null}
          <button type="submit" style={{ width: "100%" }}>
            Sign in
          </button>
        </form>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>New here</h2>
        <form action={onRegister}>
          <label>
            Email
            <input name="email" type="email" required style={{ width: "100%" }} />
          </label>
          <label>
            Password
            <input name="password" type="password" required minLength={8} style={{ width: "100%" }} />
          </label>
          {registerError ? <p role="alert">{registerError}</p> : null}
          <button type="submit" style={{ width: "100%" }}>
            Create account
          </button>
        </form>
      </section>
    </main>
  );
}
