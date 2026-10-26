# Photo research: how to cover 140,228 fragrances (2026-10-20)

The short version: we do not need to scrape anything. The photos were
already in the data we bought.

## The discovery

`tests/fixtures/fragdb-samples/fragrances.csv` (the 10-record FragDB sample) has
a `main_photo` column whose value is a full URL:

```
https://fimgs.net/mdimg/perfume-thumbs/375x500.485.jpg
```

The number before `.jpg` equals the FragDB pid exactly (485 -> Light Blue).
Our database stores that pid as `Fragrance.catalogueSourcePid` in the form
`fragrantica-485` for every one of the 140,228 rows. So the URL for any
fragrance is derivable from a field we already own, with no pages scraped
and no new data purchased.

## Coverage

- 140,228 / 140,228 rows carry a non-null `catalogueSourcePid` (100%).
- Pattern: `https://fimgs.net/mdimg/perfume-thumbs/375x500.{pid}.jpg`
- Probe: 10 GETs across the whole pid spread (1, 485, 3,000, 14,982, 31,861,
  40,000, 80,000, 120,000, 140,227, 142,000) all returned 200 image/jpeg,
  13k-29k bytes. No 404s in the sample.
- Referrer test: with our production referrer and with no referrer, both 200.
  Hotlinking from the live site works today.

## What this replaces

- The seven scraped retailer cutouts on the homepage wall stay as they are
  (transparent cutouts, no background). They are the premium look.
- Every other surface (product hero, pair card, family lineup, census rows)
  now renders the fimgs product shot. Professional studio-style 375x500
  standing photos, consistent angle across the catalogue.

## What this does NOT solve

1. Image rights. fimgs.net hosts Fragrantica's product imagery, and FragDB
   sells the URLs as part of its commercial license. Our $200 purchase
   carries commercial use of the data, but the photos themselves are brand/
   Fragrantica assets. Hotlinking references them; downloading and hosting
   copies is a stronger claim. We are doing the weaker thing (hotlinking)
   which is the common practice for this category, and we should revisit
   before any marketing push or enterprise use.
2. Host fragility. If fimgs changes its path scheme or blocks our domain,
   every image breaks at once. Mitigation: the pencil silhouette is still
   the fallback (fragDbPhotoUrl returns null when there is no pid), so a
   broken CDN degrades to the designed placeholder instead of broken images.
3. Storage. 140k x ~20KB = ~2.8GB. Self-hosting on Neon/Vercel Blob is
   cheap and would remove host fragility. Not done yet.
4. "Professional" cutouts. These are rectangular product photos on a white
   background, not transparent cutouts. They look like a catalogue tile,
   which is what the user asked for, but they will not sit on the warm wall
   the way the seven cutouts do. Keeping the cutouts for the wall and the
   tiles everywhere else is the current compromise.

## Why not scrape Fragrantica HTML?

Because we would be re-deriving data we already own, slower, and against
their ToS and Cloudflare. The CSV approach skips the HTML layer entirely.

## Next steps (not done)

- Decide whether to download + self-host (2.8GB, removes host fragility and
  the IP question one step).
- Creator-contributed photos for the census families where a brand photo is
  wrong or missing: upload pipeline, moderation queue, provenance labels.
- Keep the pencil silhouette as the honest fallback. Never fabricate a photo.

## Sources

- FragDB fragrance-database README (2026-10-19 v5.19, 142,676 rows,
  "Photos: 633,541")
- fragdb.net Data API: basic level returns "the photo" for $0.005/record
- tests/fixtures/fragdb-samples/fragrances.csv (10-record sample)
- scripts/ingest contract tests on FragDB CSV
EOF
echo written