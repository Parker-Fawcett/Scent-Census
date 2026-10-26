// Bottle photography addressability.
//
// Provenance (docs/RESEARCH-photos.md): the purchased FragDB CSV carries a
// main_photo field whose numeric id equals the fragrantica pid that our rows
// already hold as catalogueSourcePid ("fragrantica-485"). The photo CDN serves
// standing product shots (375x500 JPEG) by that id, verified open across a
// spread of the whole pid range (docs/RESEARCH-photos.md). Nothing here scrapes
// pages: the URL is derived from data already owned and licensed commercially.
export function fragDbPhotoUrl(pid: string | null | undefined): string | null {
  if (!pid || !pid.startsWith("fragrantica-")) return null;
  const n = Number(pid.slice("fragrantica-".length));
  return Number.isFinite(n) && n > 0
    ? `https://fimgs.net/mdimg/perfume-thumbs/375x500.${n}.jpg`
    : null;
}
