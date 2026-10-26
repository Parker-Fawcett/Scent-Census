# The Scent Census design system: "Editorial specimen"

The direction, committed on 2026-10-21. Everything on the site serves it.

**What it is:** a reference work for fragrance. A field guide, not a
dashboard. The kind of page you would find in a good magazine about scent,
or a naturalist's catalogue: warm paper, hairline rules, a serif display
face, one sharp accent, and photographs treated as specimens rather than
as product shots.

**Why this direction and not another.** The product is a census: measured
closeness, honest counts, a ranking nobody can buy. That is an editorial
subject, not a dashboard subject. A magazine of perfumes has exactly the
right gravity for a page whose whole claim is "this is what the people who
own both bottles actually said". The data-dense direction would have made
the site feel like a pricing tool, and the warm-minimal direction would
have kept it where it started: beige, forgettable, no point of view.

**The word, in one:** catalogued.

---

## The rules this system refuses

These are not preferences. Breaking one of them is a bug.

1. **No boxes on beige.** Containers are earned. A hairline rule is the
   default separator, not a white card with a shadow.
2. **One typeface never does every job.** Fraunces for display, Instrument
   Sans for everything else. Two families, no more.
3. **The accent means "measured".** Vermilion appears on primary actions,
   links, and every number that is a measurement. It appears nowhere else.
4. **One radius.** 2px, or none. Not 8px on everything.
5. **No decorative gradients.** The paper grain is a texture, not a
   gradient, and it is there to make the page read as stock.
6. **One orchestrated entrance per page.** No bounce, no scale, no hover
   theatrics.

---

## Tokens

Semantic names, in `:root`. The Tailwind `@theme` block mirrors the palette
with literal values so Tailwind opacity modifiers still resolve.

### Surfaces

| Token | Value | Use |
|---|---|---|
| `--surface-paper` | `#f2ede1` | the page |
| `--surface-raised` | `#faf6ec` | the rare block that needs a fill |
| `--surface-sunk` | `#ece6d8` | sponsored blocks, the hero plate |

### Ink

| Token | Value | Contrast on paper |
|---|---|---|
| `--text-primary` | `#1d1a14` | 14.8:1 |
| `--text-secondary` | `#564e3f` | 7.0:1 |
| `--text-muted` | `#6b6350` | 5.1:1 (4.8:1 on sunk) |

### Rules and accent

| Token | Value | Use |
|---|---|---|
| `--rule-hairline` | `#d5cab4` | between rows |
| `--rule-strong` | `#b4a78b` | the heavy top rule, field underlines |
| `--accent-ink` | `#b32c16` | links, primary actions, measured figures |
| `--accent-bright` | `#d4451f` | focus rings, hover on the accent |
| `--plate` | `#d7cab0` | the specimen plate |
| `--wood` | `#6a4e31` | the 4px rule under the masthead |

The vermilion is the mark a grader leaves on a page. It is why the site does
not look like every other Next.js template: nobody's clone census is
vermilion on warm paper.

### Type

| Role | Face | Size | Tracking |
|---|---|---|---|
| display | Fraunces 500 | `clamp(2.25rem, 4vw, 3.5rem)` | -0.03em |
| title | Fraunces 500 | `clamp(1.6rem, 2.6vw, 2.25rem)` | -0.02em |
| lede | Instrument Sans 400 | 1.0625rem, line 1.62 | 0 |
| body | Instrument Sans 400 | 1rem, line 1.6 | 0 |
| label | Instrument Sans 600 | 0.6875rem, uppercase | 0.18em |
| figure | either, tabular | 0.8125rem to 2.75rem | 0 |

Three sizes plus a label, committed. Figures use `font-variant-numeric:
tabular-nums` so a ledger lines up in a column.

---

## The specimen plate

The one idea the whole visual system runs on.

Catalogue photographs are shot on a white studio background. Laid on a
mid-tone plate and multiplied, that white becomes the plate colour, so the
bottle sits in the paper instead of floating on it as a cut-out. This is
the answer to "clip art, white, on a beige background" without needing an
image pipeline.

```css
.specimen-plate {
  display: block;          /* never inline: an inline span ignores width
                               and aspect-ratio, and the plate background
                               then paints as a sliver beside the photo */
  width: 100%;
  aspect-ratio: 3 / 4;
  background: var(--plate);
  border: 1px solid var(--rule-strong);
  overflow: hidden;
}
.specimen-plate img {
  mix-blend-mode: multiply;
  width: 100%; height: 100%;
  object-fit: contain;
}
```

`display: block` is load-bearing. Without it the plate is an inline box,
`width: 100%` and `aspect-ratio` are ignored, and the photo paints on top
of a sliver of background instead of onto the plate.

---

## Components

| Class | What it is |
|---|---|
| `.masthead` | logo, ruled search field, nav. A 4px wood rule under it. |
| `.page` | the frame. 68rem max, 96px section breaks inside. |
| `.page-head` | label, title, lede. The head of every page. |
| `.display` / `.title` / `.lede` / `.label` | the type roles |
| `.figure` | tabular numerals |
| `.textlink` | a link in the accent |
| `.btn` / `.btn.secondary` / `.quiet` | buttons. Vermilion, outlined, quiet. |
| `.specimen-plate` | the plate above |
| `.specimen-strip` | a shelf of plates standing on a 2px baseline |
| `.specimen-cell` | one bottle in the strip. 7.75rem wide. |
| `.census-rows` / `.census-row` | the census ledger |
| `.meter` | the closeness scale |
| `.index-list` / `.index-row` | a printed index of names and figures |
| `.data-band` | the three-figure band |
| `.house-run` | a run of house links, set like a line of type |
| `.card` | the rare block with a heavy top rule |
| `.empty` | the designed empty state |
| `.ad` | a sponsored block. Deliberately not editorial. |
| `.rise` | the one entrance, with `-1` to `-5` delays |

---

## Motion

One orchestrated entrance per page: a 520ms rise with a 60ms stagger,
`cubic-bezier(0.2, 0.7, 0.3, 1)`, applied to the hero elements and the
specimen strip. Everything else stays still. Hover states are a 150ms
colour change.

`prefers-reduced-motion: reduce` turns the entrance off and drops every
transition to 1ms.

---

## The audit that produced this

The previous design was "Variant J, the collection wall": a beige wall, a
photograph of a wooden shelf, white cards, Geist everywhere, and no
accent. Run against the anti-slop checklist it scored eight hits, and
against the sterile-minimalism detector it failed on four of seven signs:
no display face, no accent, no motion, and centered text blocks on
whitespace.

The checklist is explicit that three or more hits means stop patching and
re-commit. So this was a rewrite, not a reskin.

### The bar, re-run

| Item | Result |
|---|---|
| 1. Committed direction | Editorial specimen, applied on every page |
| 2. Typography named and paired | Fraunces + Instrument Sans, three sizes |
| 3. One accent, meaningfully used | Vermilion on actions, links, measurements |
| 4. Layout rhythm | 8px scale, 96-140px section breaks, 8-24px gaps |
| 5. Focal point and hierarchy | One focal point per page, verified by squint |
| 6. Motion with purpose | One entrance, one purpose |
| 7. Real content and assets | Real catalogue photos, real counts, no placeholders |
| 8. States all designed | Empty, loading, error, focus, disabled |
| 9. Accessibility floor | 0 contrast failures, verified in the browser |
| 10. Nothing on the checklist | 0 hits |

---

## The contrast audit, and how to re-run it

Three elements on the home page were 4.14:1, under the 4.5 floor: the
muted ink was `#736a57` on the sunk surface `#e9e2d2`. Fixed by dropping
the muted ink to `#6b6350` and lifting the sunk surface to `#ece6d8`.

Lighthouse confirms accessibility 1.0 on the home page, the product page,
the index page, the house page and the sign-in page. The audit that found
the three failures was a script that walks every text node, resolves the
real composited background, and computes the ratio. Lighthouse alone would
have told me there was a problem, not where it was.
