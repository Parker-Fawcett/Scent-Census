"use server";

// Server Actions for auth and onboarding (Next 16 docs: every Server Function
// verifies auth itself; they are reachable by direct POST, not just through
// our forms). Each returns a plain error string for form display, and NEVER
// swallows the redirect that signIn throws, which is how Auth.js reports
// success from inside an action.

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn, signOut, auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registerUser, saveOnboarding, verifyCredentials } from "@/server/users";
import { addItem } from "@/server/collection";

// Both the shelf and the picks live here, but the picks page is the one
// that answers "what next", so that is where an account opens.
const REDIRECT_AFTER = "/";

function messageFor(error: unknown): string {
  if (error instanceof AuthError) {
    if (error.type === "CredentialsSignin") {
      return "Email or password did not match an account.";
    }
    return "Could not sign you in. Try again.";
  }
  // redirects from signIn/redirect() are not failures
  throw error;
}

export async function signInAction(formData: FormData): Promise<string | null> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const user = await verifyCredentials(prisma, { email, password });
  if (!user) return "Email or password did not match an account.";
  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: REDIRECT_AFTER,
    });
  } catch (error) {
    const message = messageFor(error);
    if (message) return message;
  }
  return null;
}

export async function registerAction(formData: FormData): Promise<string | null> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  try {
    await registerUser(prisma, { email, password });
  } catch (error) {
    const cause = error instanceof Error ? error.message : "Registration failed.";
    return cause.replace(/^register: /, "");
  }
  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/onboarding",
    });
  } catch (error) {
    const message = messageFor(error);
    if (message) return "Account created. Signing in failed. Try the sign-in form.";
  }
  return null;
}

export async function saveOnboardingAction(formData: FormData): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) return "You are signed out. Sign in first.";
  const budget = formData.get("budgetBand");
  const clones = formData.get("cloneBand");
  const accords = formData.getAll("accordPrefs").map((v) => String(v));
  try {
    await saveOnboarding(prisma, session.user.id, {
      budgetBand: typeof budget === "string" && budget !== "" ? budget : null,
      cloneBand: typeof clones === "string" && clones !== "" ? clones : null,
      ...(accords.length > 0 ? { accordPrefs: accords } : {}),
    });
  } catch (error) {
    const cause = error instanceof Error ? error.message : "Saving failed.";
    return cause.replace(/^onboarding: /, "");
  }

  // A bottle named during setup becomes a shelf row. The feed reasons from
  // bottles it can name ("Like X, which you own"), so this is the single
  // sharpest signal setup can collect. It is optional, and a failure here
  // must not cost the reader the answers they just gave.
  const lovedId = String(formData.get("lovedFragranceId") ?? "");
  if (lovedId !== "") {
    try {
      const loved = await prisma.fragrance.findUnique({
        where: { id: lovedId },
        select: { id: true },
      });
      const already =
        loved === null
          ? null
          : await prisma.collectionItem.findFirst({
              where: { userId: session.user.id, fragranceId: loved.id },
              select: { id: true },
            });
      if (loved !== null && already === null) {
        await addItem(prisma, session.user.id, { fragranceId: loved.id, sizeMl: null });
      }
    } catch {
      // the answers are saved; setup must not stall on a bottle
    }
  }

  // straight into the picks, not the shelf: the reader just told the census
  // what they smell and what they like, so show what it does with that
  redirect("/");
}

/**
 * Sign out and land on the public home, where a visitor can start over.
 */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
