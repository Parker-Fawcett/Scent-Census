// Vercel housekeeping: keep the newest N production deployments, delete the rest.
//
// WHY: every stored deployment keeps a function snapshot. Iterating with many
// deploys per day filled the Hobby plan's 10 GB Function Storage quota within
// a week (Vercel emailed a 100% warning on 2026-10-22). Old snapshots are not
// needed once a new deploy is live; the newest 2 cover "current" plus
// "instant rollback".
//
// Usage: npx tsx scripts/vercel-prune.ts [--keep=2]
//
// Auth: reads the Vercel CLI's stored token, so run `vercel login` once first.
// Scope: the project of the current working directory (reads .vercel/project.json).
// Safety: never deletes the newest deployment; errors 0 deletions made if the
// live deployment cannot be confirmed READY.
//
// Run weekly, or after any heavy iteration day. The usage dashboard
// (vercel.com/parker15/~/usage) shows the resulting Functions Storage number.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const keepArg = process.argv.find((a) => a.startsWith("--keep="));
const KEEP = keepArg ? parseInt(keepArg.split("=")[1], 10) : 2;

function vercelToken(): string {
  const paths = [
    join(homedir(), ".vercel", "auth.json"),
    join(homedir(), "Library", "Application Support", "com.vercel.cli", "auth.json"),
  ];
  for (const p of paths) {
    try {
      const d = JSON.parse(readFileSync(p, "utf8"));
      if (d.token) return d.token as string;
    } catch {}
  }
  throw new Error("No Vercel CLI token found. Run `vercel login` first.");
}

function projectCoords(): { teamId: string; projectId: string } {
  const cfg = JSON.parse(readFileSync(".vercel/project.json", "utf8"));
  return { teamId: (cfg as any).orgId ?? "", projectId: (cfg as any).projectId ?? "" };
}

async function api<T>(path: string, httpMethod: "GET" | "DELETE" = "GET"): Promise<T> {
  const res = await fetch(`https://api.vercel.com${path}`, {
    method: httpMethod,
    headers: { Authorization: `Bearer ${vercelToken()}` },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${httpMethod} ${path} -> ${res.status} ${JSON.stringify(body).slice(0, 120)}`);
  return body as T;
}

type Deployment = { uid: string; created: number; readyState: string };

async function main() {
  const { teamId, projectId } = projectCoords();
  if (!projectId) throw new Error("Run this from the project directory after `vercel link`.");

  const qs = new URLSearchParams({ projectId, teamId, limit: "200" });
  const list = await api<{ deployments: Deployment[] }>(`/v6/deployments?${qs}`);
  const deps = (list.deployments ?? [])
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0));

  if (!deps.length) return console.log("No deployments found. Nothing to do.");
  if (deps[0].readyState !== "READY") {
    return console.log(`Newest deployment is ${deps[0].readyState}, not READY. Aborting: nothing deleted.`);
  }

  const keep = deps.slice(0, KEEP);
  const del = deps.slice(KEEP);
  const day = (ts: number) => new Date(ts).toISOString().slice(5, 16).replace("T", " ");
  for (const d of keep) console.log(`keep  ${d.uid} ${day(d.created)} ${d.readyState}`);
  console.log(`\n${del.length} to delete (of ${deps.length} stored)`);

  let ok = 0;
  const failed: string[] = [];
  for (const d of del) {
    try {
      await api(`/v13/deployments/${d.uid}?teamId=${teamId}`, "DELETE");
      ok++;
      if (ok % 5 === 0) console.log(`  ${ok}/${del.length}...`);
    } catch (e) {
      failed.push(d.uid);
      console.log(`  FAIL ${d.uid}: ${(e as Error).message.slice(0, 100)}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log(`\ndeleted ${ok}, failed ${failed.length}.`);
  console.log("Reclaim shows up on the usage dashboard within the hour.");
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
