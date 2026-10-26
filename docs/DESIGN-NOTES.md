# Design Notes — Scent Census

> **SUPERSEDED (2026-10-21) as the live design spec.**
> The locked direction below, "Variant J, the collection wall", was audited
> against the anti-slop checklist and scored eight hits. It also failed the
> sterile-minimalism detector on four of seven signs: one typeface for
> everything, no accent colour, no motion, and centered text blocks on
> whitespace. The live direction is now **"Editorial specimen"** and the spec
> lives in `docs/DESIGN-SYSTEM.md`.
>
> The **Asset provenance** section below is still live and still binding. The
> product photographs are still hotlinked fimgs.net shots, not owned, and the
> specimen plate treatment changes how they look, not where they come from.
> The wooden shelf cutouts and the bottle cutouts it describes were deleted
> from `public/` when the literal shelf hero was replaced; nothing referenced
> them.

Locked direction: **Variant J "the collection wall"** (2026-10-20), chosen
after A/B mock iteration against the FB Fragrances room reference.
Supersedes the earlier dark cinematic `#0c0c0c` + muted gold direction.

The reference vibe: warm, bright, comfy, wood, realistic. Explicitly NOT cold
dark mode. Not many gradients. No grain overlays.

## Tokens (implemented in `src/app/globals.css`)

- **Wall**: `--wall: #e9dcc6`, one warm plaster tone for the entire site. The
  topbar is transparent on it. Soft daylight falls from the top via a single
  fixed radial highlight (`--wall-light`) — the only gradient allowed.
- **Type**: Geist everywhere (`--font-geist-sans` via `next/font`). No Anton,
  no Fraunces. Ink scale: `--ink #2a241c`, `--ink-soft #6d6357`,
  `--ink-faint #a2968a`.
- **Cards**: `--paper #ffffff` with hairline `--line #e3dcd1` borders. Contrast
  comes from white cards on the wall, never from palette flips.
- **Wood**: photographed oak grain (public domain, Wikimedia Commons,
  `public/shelf/wood.jpg` + rotated `wood-v.jpg`). Frame posts = `wood-v`,
  planks = `wood` with three different grain slices per tier so boards read as
  cut from stock. Tint overlays are flat color grades, not gradients.
- **Accents**: confidence chips are solid dark, never colored. Ghost "from
  census" slots are faint bottle silhouettes (9% ink), no dashed boxes.
- **Green: banned.** Earlier random hits of green are gone. The eucalyptus
  sprig is a photographed cutout (toppng, keyed clean), acceptable as muted
  life object; do not add green UI accents.

## Shelf rules

- Site background = shelf compartments. The unit is furniture bolted to the
  same wall the whole site is painted; ambient shading inside compartments is
  minimal (5–7% ink at top/floor lines).
- Bottles are real product photo cutouts with transparent backgrounds, seated
  flush on plank lines, with small contact-shadow ellipses under each base.
  Upright bottles only; nothing leans on nothing (physics).
- Depth: back-row bottles are smaller (perspective), slightly dimmed
  (`brightness .95 saturate .88`), positioned in open pockets at `left/right
  44px`, never perfectly hiding behind front-row bottles.
- Shelf story: front rows = collection, back rows + ghost silhouettes = what
  the census suggests next. The thing fills as votes land.

## Asset provenance

- Wood textures: Wikimedia Commons, public domain — shippable.
- Bottle cutouts (wall, 7): scraped retailer CDN / stock previews.
- Product photos (every other surface, 140k): fimgs.net product shots derived
  from the catalogue's pid pointer (docs/RESEARCH-photos.md). Hotlinked, not
  owned. Rectangular white-background tiles, not transparent cutouts.
  **Mock-only.** Production needs licensed photography.
- Eucalyptus branch cutout REMOVED from the wall (2026-10-21): a bare stem
  never got a believable grounding (no container, shadow read as floating),
  so it was the one element pulling toward clip art. It also carried the
  same licensing liability. Tier three is now an empty shelf with one
  penciled ghost slot.
- Real product IDs used: Creed Aventus, Rasasi Hawas Ice, Lattafa Khamrah,
  Armaf CDNIM, Armaf CDNIM LE Parfum, Afnan Supremacy Silver, Afnan
  Supremacy Not Only Intense.

## Applied

- `/` signed-out landing: hero + shelf live (mock markup ported, classes in
  `globals.css`).
- Landing copy locked 2026-10-21 after a "no UVP / weak CTA / clip art"
  review passed: h1 asks the product's question directly ("Which clone
  actually smells like the real thing?"), sub states the mechanism (votes
  from people who own both bottles), primary CTA is "Start your shelf" with
  the honest micro line ("Free. Email only. About a minute."). The old
  OAuth-keys apology line is gone from the landing; auth state lives only
  on the sign-in page.
- Ghost slots restyled as 1.5px outlines (was filled blobs), matching the
  "penciled reservation" intent instead of reading as clip art.
- Remaining pages to convert: fragrance product page, sign-in, signed-in
  shelf, creator pages.

## Product pages, photo-first rebuild (2026-10-20)

User verdict on the old fragrance page: "so boring." The rebuild keeps every
honesty rule and adds picture density:

- Hero split panel: bottle portrait on the wall tint beside name/house/chips.
  Photos exist for exactly seven fragrances (the homepage cutouts, PHOTOS map
  in the page file); every other page renders the penciled ghost silhouette
  instead of a fake photo. The pencil IS the admission that a photo is missing.
- ClosenessMeter: 0-100 ruler with a marker at the measured score plus the
  vote distribution as columns, one column per bucket. Zero votes renders an
  empty ruler and the "first votes" ask. Never shows a score with no votes.
  Lives in its own boxed panel with a question line naming the measured pair
  ("How close does X smell like Y?"). Lesson from the first ship: a full-width
  axis under the two bottles made their x positions read as scores, and the
  original appeared "less close to itself than its clone." The instrument is
  boxed and captioned so the axis measures exactly one pair and says which.
- The family under [original]: census siblings stand on a wood plank strip
  (homepage shelf materials, compact). Photos where the shelf owns them,
  ghosts elsewhere, current bottle ringed. Replaces the old text list.
- Census rows (target side) carry small bottle thumbs before the text.
- Product page max width 900+ (prod-page) so a full family fits in one view.
- Vote buttons upgraded to the connected census-scale instrument style.
- Licensing status: wall cutouts are still scraped provenance. Product photos
  across the catalogue are hotlinked fimgs.net assets derived from data we
  already own; not licensed imagery, and the host is external. See
  docs/RESEARCH-photos.md before any marketing or enterprise use.

## Product page, variant A layout (2026-10-20)

Chosen by the user over variant B (pencil-primary). Layout rules:

- The FAMILY LINEUP IS THE HERO. On a clone page the page opens with the
  name, then the sibling bottles standing in a row on a hairline, each with
  its vote count. The product photo appears only inside that strip.
- On an original with no family (most of the catalogue), the header is the
  name, a small photo beside it, accords as pills, and the notes below.
  No photo-less pages: every fragrance renders a picture or a pencil.
- The pair comparison, the closeness meter, the vote scale, and the seeded
  consensus follow the hero, not before it.
- Notes print once per page. A duplicate notes block existed in the first
  build of this layout and was removed.
- Image geometry is pinned: the source photos are 375x500 (3:4), so every
  rendered size carries an exact width/height pair (54x72, 84x112, 90x120,
  147x196). A flex parent was squeezing the census thumbs to 48px wide
  (ratio broken, Lighthouse image-aspect-ratio audit) until the width was
  pinned rather than left to auto.
- Lighthouse on a product page: accessibility 1.0, best practices 1.0, SEO
  0.83 (the meta description is delivered via streaming metadata, so the
  audit of the initial shell reports it missing; the streamed document
  carries it, verified by curl).

## The layering bug (2026-10-20, product page cleanup)

The product page looked chaotic: content flush left, no spacing, everything
stacked. Root cause was NOT the layout. It was CSS layers.

Tailwind v4 puts its utilities in `@layer utilities`. Any UNLAYERED rule
outranks every layer, regardless of specificity. The old hand-rolled reset in
globals.css was unlayered:

    * { box-sizing: border-box; padding: 0; margin: 0; }

That silently killed every margin and padding utility on the page: `mx-auto`,
`px-6`, `py-12`, every `mb-*`. The content never centered and never spaced.
The same trap applies to the legacy `button` and `a` element rules, which
overrode Tailwind's button classes.

Fixes applied:
- Removed the `*` reset entirely. Tailwind's preflight does the same reset
  inside `@layer base`, where utilities can override it.
- Wrapped the legacy design system in `@layer components { ... }` so
  utilities win over it. The layer is balanced (brace depth 0).
- Cleaned 32 stray `filter: none` declarations left by an earlier bulk edit.

Rule for the future: any new global CSS goes INSIDE @layer components, never
bare at the top of the file.

## Product page structure (final)

1. Name + house/year kicker, then ONE shelf: the original first (labeled
   "the original"), then every clone the census tracks. The bottle you are
   reading is labeled "this bottle". A clone page and an original page use
   the same shelf, so nothing appears twice.
2. THE VERDICT: one question ("How close does X smell like Y?"), one scale,
   one vote row. No box, no duplicate pair section.
3. Seeded baseline: labeled, sourced, dated, and explicitly "not a vote".
4. Notes (once per page).
5. The clone census (originals only): ranked list with vote rows.
6. Market price and video reviews as footnotes.

Bottle count per page dropped from 7 (with duplicates) to 5 distinct ones.

## Random-page spot check (2026-10-20, after the layout fix)

12 random pages verified: 5 random clones, 4 random parentless originals,
3 random originals with clones. Results: every page centered at 768px with
48px top padding, zero broken images, correct h1, correct section set, shelf
present exactly where a family exists (5 on Aventus, 4 on the Y EDP family,
2 on Eilish, 0 on parentless originals).

Two issues found and fixed in this pass:
- The shelf showed "0 votes" for every clone, which told the reader nothing
  the census list did not already say. It now shows the seeded consensus
  ("Close - 74"), so the shelf and the list carry different information.
- The census rows repeated the name and photo already on the shelf. Rows are
  now text-only: name, house, vote state, seeded consensus, vote buttons.
- Page width was ragged (max-w-4xl shell, max-w-2xl list). Now one width
  (max-w-3xl) for the whole page.

Known remaining: the meta-description audit on product pages is a streaming
artifact (the description is in the streamed document, verified by curl).

## The "Loading forever" bug and its three-part fix (2026-10-21)

Symptom: about half of all page loads showed "Loading..." forever on every
data page (product, house, creator, explore, search, home), while the server
response contained the full rendered content and no error appeared in the
browser console.

Cause: Next.js partial-prerenders a dynamic route into a static shell, the
CDN caches that shell, and after the next deploy the cached shell's flight
payload references chunks from the build that made it. The browser loads the
current chunks, the payload does not match, and React never renders the
streamed content. The proof was a client chunk (`2k_9z7pvbmot0.js`, holding
CensusList) that appeared in the build output but not in the HTML's script
tags.

Three things were required together:

1. `export const instant = false` on the ROOT LAYOUT, so routes may block
   on request-time data instead of being prerendered.
2. `await connection()` at the page level, so the route is request-time.
3. `Cache-Control: no-store` on the data routes, so no shell is cached.

Generalised rule, learned the hard way: **a params PROMISE must not cross a
Suspense boundary.** A server component that awaits `searchParams` inside a
boundary leaves that boundary pending in the browser. Resolve it at the page
level and pass plain values down. Pages that already did this right (creator,
fragrance, shelf) were the ones that worked.

Also: `export const dynamic = "force-dynamic"` is rejected when Cache
Components is on, and `export const ensureStatic = false` means "do not require
static", not "make it dynamic". The working combination is `instant = false`
plus `connection()`.
