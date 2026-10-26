import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { BottleThumb } from "@/components/BottleThumb";
import {
  countFamilyMembers,
  loadFamilyHouses,
  loadFamilyMembers,
  resolveFamilyName,
  type FamilyKind,
} from "@/server/families";

// The page reads the catalogue, so it renders per request.
export const instant = false;

interface Params {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const kind: FamilyKind = "note";
  const name = await resolveFamilyName(prisma, kind, slug);
  if (name === null) return { title: "Family not found" };
  return {
    title: `Fragrances with ${name}`,
    description: `Every fragrance in the catalogue built on ${name}, with the clone families the census has measured.`,
  };
}

export default async function NotePage({ params }: Params) {
  await connection();
  const { slug } = await params;
  const kind: FamilyKind = "note";
  const name = await resolveFamilyName(prisma, kind, slug);
  if (name === null) notFound();

  const [members, houses, total] = await Promise.all([
    loadFamilyMembers(prisma, kind, name, 60),
    loadFamilyHouses(prisma, kind, name, 10),
    countFamilyMembers(prisma, kind, name),
  ]);

  // The heading wants a capital letter. The vocabulary keeps the casing the
  // community used.
  const title = name.charAt(0).toUpperCase() + name.slice(1);

  return (
    <main className="page">
      <header className="page-head">
        <p className="label">Note family</p>
        <h1 className="page-title">{title}</h1>
        <p className="lede">
          {total.toLocaleString("en-US")} fragrances in the catalogue are built
          on this note. These are the ones the census knows the most about, with
          the clone families they have measured behind them.
        </p>
      </header>

      {members.length === 0 ? (
        <div className="empty" style={{ marginTop: "2.5rem" }}>
          <p className="title">No fragrances in this family yet</p>
        </div>
      ) : (
        <ul className="plate-grid" style={{ marginTop: "2rem" }}>
          {members.map((m) => {
            return (
              <li key={m.id}>
                <Link href={`/fragrance/${m.slug}`} className="plate-card">
                  <span className="plate-figure">
                    <BottleThumb pid={m.pid} name={m.name} />
                  </span>
                  <span className="plate-name">{m.name}</span>
                  <span className="plate-house">
                    {m.house}
                    {m.year !== null ? ` · ${m.year}` : ""}
                  </span>
                  <span className="plate-foot">
                    {m.cloneCount > 0 ? (
                      <span className="plate-clones">
                        {m.cloneCount} {m.cloneCount === 1 ? "clone" : "clones"}
                      </span>
                    ) : null}
                    <span className="plate-kind">
                      {m.cloneCount > 0 ? "family" : "no clones yet"}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {houses.length > 0 ? (
        <section className="rule-heavy" style={{ marginTop: "4rem" }}>
          <p className="label">The houses that build on {name}</p>
          <ul className="house-run" style={{ marginTop: "1rem" }}>
            {houses.map((house) => (
              <li key={house.slug}>
                <Link href={`/house/${house.slug}`} className="house-run-name">
                  {house.name}
                </Link>
                <span className="figure house-run-count">{house.count}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
