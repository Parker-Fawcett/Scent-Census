import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import OnboardingForm from "./OnboardingForm";

async function OnboardingData() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { budgetBand: true, cloneBand: true, accordPrefs: true },
  });
  return <OnboardingForm current={{ budgetBand: user.budgetBand, cloneBand: user.cloneBand, accordPrefs: user.accordPrefs }} />;
}

export default function OnboardingPage() {
  return (
    <main style={{ maxWidth: 560, margin: "3rem auto", padding: "0 1rem" }}>
      <h1>Three questions, not a quiz</h1>
      <p>
        Every step is skippable. Answer what you feel like answering and change
        it later.
      </p>
      <Suspense fallback={<p>Loading...</p>}>
        <OnboardingData />
      </Suspense>
    </main>
  );
}
