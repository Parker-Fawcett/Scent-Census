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

  const heading = "Your shelf, your votes.";
  const intro = "Track every bottle you own and rate how close each clone smells to the original. Free, email only, about a minute.";

  return (
    <main className="page page-narrow">
      <header className="page-head">
        <p className="label">Scent Census</p>
        <h1 className="page-title">{heading}</h1>
        <p className="lede">{intro}</p>
      </header>

      <section className="rule-heavy" style={{ marginTop: "3rem" }}>
        <h2 className="title" style={{ fontSize: "1.35rem", marginBottom: "1.25rem" }}>
          Sign in
        </h2>
        <form action={onSignIn}>
          <label className="form-field">
            <span className="form-field-label">Email</span>
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <label className="form-field">
            <span className="form-field-label">Password</span>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="current-password"
            />
          </label>
          {signInError ? (
            <p role="alert" className="form-error">
              {signInError}
            </p>
          ) : null}
          <button
            type="submit"
            className="btn"
            style={{ width: "100%", justifyContent: "center", marginTop: "1.75rem" }}
          >
            Sign in to your shelf
          </button>
        </form>
      </section>

      <section className="rule-heavy" style={{ marginTop: "2.5rem" }}>
        <h2 className="title" style={{ fontSize: "1.35rem", marginBottom: "0.75rem" }}>
          New here
        </h2>
        <p className="muted" style={{ fontSize: "0.85rem", margin: "0 0 0.75rem" }}>
          One account covers your shelf, your votes, and your follows. No credit
          card, no marketing emails.
        </p>
        <form action={onRegister}>
          <label className="form-field">
            <span className="form-field-label">Email</span>
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <label className="form-field">
            <span className="form-field-label">Password</span>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          {registerError ? (
            <p role="alert" className="form-error">
              {registerError}
            </p>
          ) : null}
          <button
            type="submit"
            className="btn secondary"
            style={{ width: "100%", justifyContent: "center", marginTop: "1.75rem" }}
          >
            Create an account
          </button>
        </form>
      </section>
    </main>
  );
}
