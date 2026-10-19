import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { searchCatalogInDb } from "@/server/catalog";
import AddBottleForm from "./AddBottleForm";

interface Params {
  searchParams: Promise<{ q?: string }>;
}

async function AddData({ searchParams }: Params) {
  // Explicit request-time marker (see note in shelf/page.tsx: next-auth's
  // auth() generates a CSRF random internally on cookie-less requests, which
  // Cache Components otherwise flags as an unstable prerender value).
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const query = (await searchParams).q ?? "";
  const hits = query === "" ? [] : await searchCatalogInDb(prisma, query);
  return <AddBottleForm query={query} hits={hits} />;
}

export default function AddBottlePage({ searchParams }: Params) {
  return (
    <main style={{ maxWidth: 560, margin: "3rem auto", padding: "0 1rem" }}>
      <h1>Add a bottle</h1>
      <Suspense fallback={<p>Loading the catalogue...</p>}>
        <AddData searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
