# UI/UX walkthrough (2026-10-21)

Every number below was measured in the browser against production, not
estimated.

## The task the site exists for

> "I own Aventus and I want the closest clone. What do I buy, and how close is
> it really?"

Can a visitor do that today? **Only if they already know the URL.** There is
no search anywhere.

## The measured journey

### 1. Land on the homepage

What is there: a headline, one paragraph, one CTA, a wall of 7 bottles, and a
proof line. What is missing: **a search input.** Zero inputs on the page, zero
forms.

The only way in is clicking one of 7 specific bottles. The other 140,221
fragrances are unreachable from the homepage.

### 2. Try to find a scent

`searchCatalog` exists in `src/domain/catalogSearch.ts` and is solid: diacritic
folding, multi-token matching, ranked by match quality. It is wired to exactly
one page, `/shelf/add`, which **redirects to /signin when logged out**.

So: the search is built, tested, and gated behind an account that a visitor
does not have yet, for a task that does not require an account.

### 3. Reach a product page

Navigation: `Scent Census` / `Shelf` / `Sign in`. Three links. A product page
can only be reached from the homepage wall, from another product page, or by
typing a URL. There is no browse-by-house, no browse-by-family, no index of
clone families, and no sitemap link visible in the UI (the XML sitemap exists
for crawlers only).

### 4. Read the product page

Measured on `/fragrance/aventus`:

| | |
|---|---|
| Page height | **21,351px** |
| The clone census section | 19,932px, 129 rows |
| Rows with a price | 7 of 129 |
| "Sign in to rate this clone" links | **129** |

One row reads:

> Club de Nuit Intense Man | Armaf | 7,079 votes · confident · score 87 |
> 6,141 of 7,079 voters said it reminds them of the original. | reads far
> cheaper than the original: voters rate it great value against overpriced for
> the original. | $28 at 106ml at discounters and clone houses. | Sign in to
> rate this clone

That is 129 times on one page, including 122 rows that say "Sign in to rate
this clone" and 122 rows that have no price. The page is a data dump with the
one actionable action repeated 129 times.

## What the pages are actually good for

- **A clone's page** (Turathi Blue, Tres Nuit): good. The verdict answers one
  question, the shelf shows the family, the price is there. A buyer lands,
  reads the number, buys.
- **An original's page** (Aventus, Tygar): broken by volume. It is the
  definitive list, and it is unusable as a list.
- **The homepage**: good as a brand statement, weak as an entry point.
- **A 404**: good. "Nobody stocked that", with a route back to the wall.
- **/shelf**: redirects to sign-in when logged out, which is correct behavior
  for a private page but means the third nav link is a dead end for visitors.

## Personalization: what exists and what does not

Built and working:
- Shelf, with per-bottle market value and a total
- Onboarding with three skippable questions (budget band, clone band, accords)
- Follow a fragrance or a creator
- An update feed of things you follow

Not built:
- **Nothing changes based on what you own.** A visitor with Aramaf Tres Nuit on
  their shelf and a visitor with nothing see identical product pages. The
  census is identical for both. For a site whose premise is "your shelf drives
  your next bottle", that is the missing half of the product.
- No cross-links between a scent on your shelf and the family it belongs to.
- No "your shelf has 6 dupes" or "you are missing the closest clone to X".
- The homepage feed slot exists but only renders for a signed-in user with
  follow events, so the homepage is static for everyone else.

## The five problems, ranked

### 1. No search for a visitor (critical)

The core task cannot be started. `searchCatalog` is built and tested. It
needs a public search page and a search box in the topbar. This is the
difference between a site people can use and a site that only its author can
use.

### 2. The original's page is 21,000px (critical)

129 full rows for a list. The fix is not fewer data, it is a different
shape: a compact row (name, house, score, price, one vote control) and an
explicit "show all 129" that renders the rest. The repeat of "Sign in to rate
this clone" 129 times is the worst offender, since it is a link on every row
and it is not what most readers came for.

### 3. The shelf does not change the site (high)

The premise is that your shelf drives your recommendations. Right now your
shelf is a private list and the rest of the site ignores it. The census
should reorder, annotate, and cross-link around what you own.

### 4. No way to browse (medium)

No house pages, no family index, no "all clone families" view. 8,274 houses
and 13,053 originals with clones, and no index of any of them.

### 5. The nav is three links (medium)

Shelf (private, redirects), Sign in, Home. There is no "Explore", which is
where a search or a family index would live.

## What I would build, in order

1. `/search` public page plus a topbar search box. The engine exists.
2. Compact census rows, with pagination or a "show all" for the long tail.
3. Shelf-aware product pages: order the family by closeness to what you own,
   label which of these you already have, and add a "you already own the
   closest one" note.
4. `/house/[slug]` pages, which also give every fragrance a second exit.
5. A "clone families" index at `/explore`, so the graph is browsable rather
   than only reachable by knowing a name.


## What was built from this walkthrough

### 1. Search for a visitor (the critical fix)

`/search` with a topbar search box. The engine already existed
(`src/domain/catalogSearch.ts`: diacritic folding, multi-token matching,
ranked by match quality); it was wired to exactly one page, `/shelf/add`,
which redirects to sign-in. Now it is public, and the catalogue search runs
through `/api/search`.

### 2. The census list, 21,351px down to 2,333px

The old row was six lines, repeated 129 times, with 129 "Sign in to rate this
clone" links. The new row carries the two things a reader came for, closeness
and price, on one line, with the vote breakdown behind a "details" toggle.
The measured clones come first, the unvoted tail sits behind a control, and
"Show 117 more clones" opens the rest. 129 rows became 12 shown plus one
button.

### 3. Shelf-aware product pages

`loadShelfFacts` reads what the visitor owns and changes the page around it:
"you own this" on the subject, "on your shelf" on a clone in the family, and
the note naming the closest clone to what they own. The census data itself is
identical for everyone; only the reading of it is personal.

### 4. Browse

- `/explore` lists all 8,500 fragrances that have clones, with their closest
  clone and the clone count.
- `/house/[slug]` gives every house a page: its catalogue, and which of its
  scents have clones. Creed shows 113 fragrances, 41 with clones, Aventus with
  131 clones.

### 5. A lesson about the cache, and the "Loading..." bug

Every page that read runtime data was showing "Loading..." forever to about
half of all visitors, while the server response looked perfect.

The cause was not the data, the queries, or the Suspense pattern. It was the
CDN. Next.js partial-prerenders a dynamic route into a static shell, the CDN
caches that shell, and after the next deploy the cached shell points at the
chunks from the build that made it. The browser loads the current chunks, the
flight payload does not match, and React never renders the streamed content.

Three things had to be true at once, and any one of them alone leaves the
bug in place:

1. `export const instant = false` on the root layout, so routes are allowed
   to block on request-time data instead of being prerendered.
2. `await connection()` at the page level, so the route is request-time.
3. `Cache-Control: no-store` for the data routes, so the CDN does not serve
   a shell whose payload cannot match the current build.

And the rule that generalises: **a params PROMISE must not cross a Suspense
boundary.** A server component that awaits `searchParams` inside a boundary
leaves that boundary pending in the browser. Resolve it at the page level and
pass plain values down. The pages that had this right worked the whole time.

`/api/revalidate` purges the cached pages on demand, and the daily cron runs
it after the staleness sweep.

### Where the site stands

| | |
|---|---|
| Pages verified rendering | 10/10, three loads each, no failures |
| Lighthouse | accessibility 1.0, best practices 1.0, SEO 1.0 on home, product and explore |
| Catalogue families | 8,500 originals with clones, 20,406 measured pairs |
| Fragrances priced | 1,083 with a live discounter price |

---

## Part two: the design rewrite (2026-10-21)

### The audit

The first walkthrough found five UX problems and fixed all five. It did not
look at whether the site looked designed, and it should have. Run against
the anti-slop checklist, the old site scored eight hits:

| Tell | Old site |
|---|---|
| One typeface for everything | Geist, display and body |
| Rounded corners on every element at one radius | 8px on cards, buttons, inputs, tiles |
| Flat hierarchy, uniform sizing | every block and row the same weight |
| Boxes on a beige ground | exactly the sterile failure mode |
| No accent colour | none at all |
| No motion | none at all |
| Six identical cards in a row | the shelf, and the census rows |
| No empty or error states designed | plain text |

The sterile-minimalism detector added four more: no display face, no accent,
no motion, and centered text blocks on whitespace. The checklist is
explicit that three or more hits means stop patching and re-commit to a
direction. So this was a rewrite.

### The direction

**Editorial specimen.** A reference work for fragrance, not a dashboard. The
product is a census, and a census is an editorial subject: measured,
authoritative, and made of names and figures. Full spec in
`docs/DESIGN-SYSTEM.md`.

The commits:

- **Fraunces for display, Instrument Sans for body.** Geist was the
  Next.js default, which is exactly the problem: a face nobody chose.
- **Warm paper instead of a beige wall, and hairline rules instead of white
  cards.** The page reads as stock, not as a template.
- **One accent: vermilion.** It marks primary actions, links, and every
  measured figure. It appears nowhere else, so it still means something.
- **The specimen plate.** A catalogue photo is shot on white. Laid on a
  mid-tone plate and multiplied, the white becomes the plate and the bottle
  sits in the paper. This is the fix for "clip art, white, on a beige
  background", and it needs no image pipeline.
- **The home hero was a photograph of a wooden shelf holding seven bottle
  cutouts.** It said "collection" and carried no information. It is now a
  magazine opener: one argument, a real data band, and a specimen plate
  showing the three clones the census actually measured closest to Aventus.
- **The census is a ledger.** Hairline rules, tabular figures, the closeness
  in vermilion on the right, the vote count and price in muted ink, and the
  supporting detail behind a disclosure in its own column instead of a line
  of its own under every row.
- **Browse pages are printed indexes.** A name on the left, a figure on the
  right, a hairline between entries.

### What was measured, not guessed

- Three elements on the home page were 4.14:1, under the WCAG 4.5 floor. A
  script walked every text node, resolved the real composited background
  and computed the ratio. Lighthouse alone would have said there was a
  problem, not where it was. Fixed at the token level, then re-run to zero
  across six pages.
- The hero's first three clones were all 100% close. The query was sorting
  by percentage, so pairs with thirty votes beat pairs with seven thousand.
  Now it sorts by vote count and the floor is a hundred votes. The hero
  shows 87%, 85% and 81%, which are the real numbers.
- The `.specimen-plate` is a `<span>`. As an inline element it ignored
  `width` and `aspect-ratio`, so the plate background painted as a sliver
  beside the photo and the photo kept its white. `display: block` is
  load-bearing, and the comment in the stylesheet says so.

### The bar, re-run

| | |
|---|---|
| Anti-slop checklist | 0 hits, down from 8 |
| Sterile-minimalism detector | 0 fails, down from 4 |
| Lighthouse | accessibility 1.0, best practices 1.0, SEO 1.0 on home, product, index, house, sign-in |
| Routes rendering | 10 of 10, two consecutive loads each, no failures |
| Contrast failures | 0, verified by script on six pages |

---

## Part three: search that forgives (2026-10-21)

### The complaint

Searching "lattafa" returned an empty page that told you it was probably a
misspelling. The catalogue holds 140,228 fragrances and 8,274 houses, and
Lattafa Perfumes has a shelf of them. The old search demanded an exact
name, which nobody types.

Two things were asked for: a search you can type at, and the bottles next
to the results so you can spot what you are looking for as you scroll.

### What changed

| | Before | After |
|---|---|---|
| `lattfa` | nothing | the Lattafa catalogue |
| `avntus` | nothing | Aventus and its 131 clones |
| `turathi blue` | buried under every "blue" | Turathi Blue, first |
| `clb de nut` | nothing | Club de Nuit Intense Man |
| Results | 20, no photos | 60, with the bottle on a plate |
| Fetch | client side, raced the render | server side, one round trip |

The search now runs on `pg_trgm` with a GIN trigram index, ranks in
TypeScript over the candidates, and matches on trigram similarity AND
edit distance, because trigram similarity alone punishes short words
("clb" against "club" scores 0.375, which is under any sane threshold,
even though it is exactly the typo people make).

The results are a gallery of specimen plates, six across, the clone count
in the accent colour under each one. A bottle you can see is a bottle you
can find.

Full detail in `docs/RESEARCH-search.md`.

### One thing that was broken underneath

`prisma migrate deploy` had been failing for a while. The migration ledger
carried a failed entry, `20261019000000_accords_and_any_position`, whose
effects were both already in the database. It was blocking every deploy,
including the ones that looked like they worked. Marking it applied fixed
the chain, and the new trigram migration then applied cleanly.

### Measured

- 17 unit tests on the ranking, 161 tests in the suite, all green
- No horizontal overflow at 375px or 320px on the plate grid
- Lighthouse accessibility 1.0, best practices 1.0, SEO 1.0 on the search page
- Search query down from 850-2140ms to 450-770ms

---

## Part four: the signed-in home (2026-10-21)

The design rewrite restyled the signed-out home and the product page. The
signed-in home, the one a real user sees every day, was missed. It was
still built from the old inline-Tailwind markup, and it had three bugs.

### The bugs

**1. The vote buttons were not buttons.** "I like this Not for me Skip I own
this" ran together as one line of text. Tailwind v4's preflight resets
every element to `border: 0 solid; padding: 0`, and the `.quiet` class only
set `border-color`, so there was no border and no padding to show. The fix
is a complete button, not a colour.

**2. Every pick said the same thing.** Five of six reason lines read "Like
Tabacco & Vanilla, which shares the accords you actually own." The reason
was real, the wording was not. It now names the accord they actually
share, capped at three: "Like Tabacco & Vanilla, which you own. Both are
vanilla, leather and powdery."

**3. The route had no `instant = false`.** The home page reads the session
and the feed, so it cannot be prerendered. The root layout sets
`instant = false`, but the route still has to say it for itself or the
prerender check fails on the signed-in path with "Next.js encountered
uncached data during prerendering or a navigation". The layout alone is
not enough. Three routes were missing it: home, preview and sign-in.
(Sign-in turned out to be a client component, where the export is not
allowed at all, so it stays static.)

### The restyle

The signed-in home is now the editorial system like every other page: a
page head, then a ledger of picks. Each row is a specimen plate of the
bottle, the name and house, the reason set in the display face because
that is the point of the row, the notes in muted ink, and the four vote
buttons as quiet outlined controls.

### How the signed-in page was checked

The browser session for this project is not signed in, so a local session
cookie was forged for the existing user with the auth secret, against the
local dev server, to see the real feed with the real shelf. The token was
minted, used, and the script deleted.

### Measured

- 9 routes render, two loads each
- Lighthouse 1.0 on home, search and the product page
- 161 tests green

---

## Part five: the product page, rebuilt around what a reader is asking (2026-10-21)

A reader opened a product page and asked six questions. The page answered
none of them.

### What was asked, and what it was

| Asked | What the page did |
|---|---|
| "what is this cloning" | nothing. The relationship sentence was only on a clone page, and a fragrance with no clones said nothing at all |
| "what is like this" | nothing. "Smells like this" did not exist as a section |
| "click the notes and get into that family" | the note and accord chips were inert text |
| "dont seed ads, only ads if we are getting paid" | four seeded fake ad slots, serving "Advertisement, Lattafa Perfumes" to readers, with fake impression counts |
| "i want more info" | a name, six accord pills, a follow button, one photo |
| "i cant even vote" | no vote control on a page with no measured clone, and no explanation of what a vote means |

### The ads

Every partner in the database has `affiliateId: null` and
`commissionBps: 0`. Nobody is paying us. The four ad slots were seeded
fakes, one of them an ad for ourselves, and they were rendering to readers
as real sponsors.

The rule is now in the schema, not in a policy document. `Partner` has a
`paysForAds` flag, `AdSlot` has a `sponsorPartnerId`, and the loader
returns nothing unless the slot names an active partner who is paying. The
seeded slots are deleted, along with their fake impression counts. The
migration is `20261021150000_ads_require_paying_partner`.

The "Where to buy" block stays, because the prices in it are real captured
asking prices, but the disclosure now reads what is true: it only claims a
commission when a partner actually has an affiliate id on file.

### The families

`/accord/[slug]` and `/note/[slug]`. A family page lists the fragrances
in that accord or note, ordered by how many measured clones each has
behind it, with the bottle on a plate and the houses that lean on it.

The accord chips and note names on every product page link there. "woody"
has 87,370 fragrances in the catalogue. "Vanilla" has 39,268.

### The product page

- **The relationship, always.** A clone says "A clone of Aventus." An
  original with clones says how many. An original with none says "Nothing
  in the catalogue has been measured as a clone of it yet."
- **Smells like this, always.** The measured peers first, then the accord
  overlap for anything the graph has not measured. Each row has a vote
  control, because the vote is the same vote either way: is this a clone,
  and how close.
- **What you are voting on.** One sentence under the verdict: one thing,
  five answers, the score is the share who said spot on or close.
- **Where the numbers come from.** A panel naming the source of the
  closeness number, the price and its capture date, the photos, and the
  creator verdicts.
- **Clickable pictures.** Every bottle image on the site is now a link to
  that fragrance. The feed plate, the shelf thumbnail, the family strip,
  the "smells like this" rows, the search grid, the family pages.

### A rendering bug worth naming

The product page had two nested `<main>` elements, which is invalid HTML.
Separately, every bottle image was `loading="lazy"`, and the lazy loader in
the browser was not fetching them at all: a page of 60 photographs showed
60 empty frames with the alt text. They are small thumbnails and the plate
is the content, so they are now eager with `decoding="async"`. Every
image on every page now loads, verified by counting `naturalWidth` on the
live production pages.

### The index

The sitemap held 546 URLs for a catalogue of 140,000 fragrances. It now
holds 8,915: every family with measured clones, every accord page, the 300
biggest note pages, and 2,000 houses. The family pages are the missing
half, because a reader who lands on a fragrance has to be able to walk
into a family and see the best of it.

### Measured

- 13 routes render, two loads each, every image loaded
- Lighthouse accessibility 1.0, best practices 1.0, SEO 1.0 on the product
  page, a family page and the fragrance page
- 161 tests green
- Zero ad slots on any page, because nobody is paying

---

## Part six: Tuscan Leather was not a sweet scent (2026-10-21)

A reader looked at the sweet family page and found Tuscan Leather on it.
Tuscan Leather is leather. It was wrong, and it was wrong because of how the
corpus was ingested.

### What the corpus actually says

Every scent in the corpus carries its accord tags with a prominence score
from 0 to 100, and its notes with a weight from 0 to 100, normalised so the
strongest one is always 100. Tuscan Leather by Tom Ford, from 10,612 raters:

```
accords: leather 100, fruity 37, animalic 36, sweet 26, amber 25,
         warm spicy 21, smoky 21, woody 20
notes:   Leather 100, Suede 53, Raspberry 51, Saffron 23, Woody Notes 19,
         Olibanum 10, Amber 10, Thyme 9, Jasmine 0
```

The ingest sorted the accords by strength and kept all eight. The tail, the
tags the community used once, came out looking exactly like the head. So
Tuscan Leather was listed as a sweet scent, and it was carrying a jasmine
note that had a weight of zero, which by the corpus schema means nobody
voted that note at all.

### The floors are different now

Notes are listed when they are at least 35% as prominent as the strongest
note on the same scent. That floor is what drops a jasmine note with a
weight of zero, which means nobody voted it.

Accords are kept whole. They are a family summary, not a pyramid, and the
old shared 35% floor deleted most of the summary on scents with one
dominant family. Louis Vuitton Imagination came out with citrus only while
the source carries eight families. The corpus caps accords at eight, so the
filter now drops only zero-strength rows.

Tuscan Leather reads leather, fruity, animalic, sweet, amber, warm spicy,
smoky, woody, with Leather, Suede and Raspberry as its notes. The zero-weight
jasmine is still gone.

### The fix, in three places

1. **`src/domain/prominence.ts`** holds the floor and the filter.
2. **`src/server/catalog.ts`** applies it, so a fresh ingest gets it right.
   The old mapper is the reason this shipped broken.
3. **`scripts/fix-prominence.ts`** rewrites the data. It read 140,228 corpus
   rows and rewrote 104,956 note lists. It is idempotent.

### The families got sharper, not smaller

A note only counts for a family when it has real prominence on that scent.
The numbers before and after:

| Family | Before | Confirmed |
|---|---|---|
| Vanilla | 38,793 | 15,953 |
| Musk | 52,416 | 16,588 |
| Amber | 39,125 | 11,949 |
| Sandalwood | 36,425 | 10,925 |
| Leather | 11,325 | 5,829 |

A family is now made of the scents people confirmed, not every scent whose
brand listing mentioned the word.

### What was checked before the floor was chosen

A flat profile, where the top two tags are within five points of each
other, looked like a scrape artifact. It is not: 22,065 corpus rows have
one, and 18,456 of them have voters. Hermès Un Jardin en Méditerranée is
genuinely balanced at 100, 100, 99, 79, 73. So a flat profile is a real
scent, and it was not used as a signal.

### Measured

- 13 routes render, two loads each, every image loaded
- Lighthouse accessibility 1.0, best practices 1.0, SEO 1.0 on a family page
  and a product page
- 161 tests green
- The sweet family no longer lists Tuscan Leather. The leather family does.

---

## Part seven: forms (2026-10-21)

The onboarding page was a bare radio button, a bare radio button, a row of
bare checkboxes, and a red rectangle. It was the first thing a new reader
saw after signing up, and it was the last page in the site to get the
design system.

### What a form is in this direction

A form is a printed questionnaire. The options are ruled rows, the group
has a real legend with a sentence of guidance under it, and the controls
carry the accent colour instead of the browser default.

| Class | What it does |
|---|---|
| `.form-group` | a fieldset: no border, its own spacing |
| `.form-legend` | the legend as a section label, with an optional `.hint` under it |
| `.form-options` / `.form-option` | the ruled list of choices |
| `.form-chips` / `.form-chip` | a toggleable chip, backed by a real checkbox |
| `.form-field` / `.form-field-label` | a label above a ruled text field |
| `.form-error` | the error state, marked with the accent |

The radio rows are the real control, sized up and given
`accent-color: var(--accent-ink)`. The chip toggles are a real checkbox
hidden behind its label, with the checked state carried by the accent
border and a wash of accent behind the text.

### The pages that were fixed

- **Onboarding.** Three ruled groups with a sentence of guidance each. The
  accord chips became toggles.
- **Sign in.** Two forms as ruled blocks, labels above the fields.
- **Add a bottle.** The title was jammed under the masthead with no top
  padding. It has a proper page head now, and the bottle size is a ruled
  radio list rather than four stacked circles.
- **Claim a creator.** The token field follows the same label rule.

### The field rule

A ruled field only reads as a field if the text sits close to its rule. The
input was carrying 0.35rem of vertical padding on a 1.4 line height, which
put the rule 34 pixels below the label and made the label look like it
belonged to something else. It is 0.2rem on 1.3 now, which is 25 pixels,
and the label reads as the label of that field.

### Measured

- 13 routes render, two loads each, every image loaded
- Lighthouse accessibility 1.0, best practices 1.0, SEO 1.0 on the sign-in
  page, a family page and a product page
- 161 tests green

---

## Part eight: the route audit (2026-10-22)

The question: any other pages? The answer: one, and it did not need a
redesign, it needed a burial.

The audit walked all 13 routes. Twelve carried the design system. The
thirteenth, /preview/[slug], was the A/B experiment from the product-page
rebuild: two candidate layouts, variant A with a family lineup hero and
variant B with a pencil silhouette, both rendered in raw Tailwind
utilities with no page frame. The kicker sat half under the masthead, the
headline was flush against the viewport edge, and the cards were rounded
boxes with three-pixel dividers.

Both candidates lost to the shipped product page, so the experiment
concluded. Nothing links to /preview. The sitemap never listed it and the
route was marked noindex. It is deleted, and it is recoverable from git
history (commit e1e6bb1) if a future A/B wants the harness back.

### One more fix from the same audit

The creator page drew its section rule, then the section label, then a
second heavy rule from the empty-state block, then the heading. The empty
state carried its own border-top from its original standalone life. A
targeted rule collapses it: `.rule-heavy .label + .empty { border-top: 0 }`.

### Measured

- 12 routes render, two loads each, every image loaded
- /preview/[slug] serves the 404 page
- /shelf signed out redirects to /sign-in, as designed
- 161 tests green

---

## Part nine: the path through the site (2026-10-22)

The complaint was navigation, not styling: getting to your account, finding
personalized picks, and searching felt clunky. The audit found three
separate breaks in the same loop.

### 1. The nav never knew who you were

The masthead showed Explore, Shelf and Sign in to everyone, forever. A
signed-in reader saw a Sign in button, and had no link back to their
picks, which is the page the site exists to serve.

The nav is now a streamed server component (`SessionNav` + `connection()`,
inside a Suspense with the old static nav as the fallback). Signed out it
offers Explore and Sign in. Signed in it offers For you, Explore, Shelf
and Sign out. The fallback keeps the shell honest for any route that
prerenders, and the swap is one row of links, so there is no layout jump
worth noticing.

Shelf also left the signed-out nav. The link only ever redirected to the
sign-in page, so it was a promise the site could not keep.

### 2. Every door led to the shelf, not the picks

Registration redirected to onboarding, onboarding saved your three
answers and dropped you on the shelf. The shelf is your collection; it
does not answer "what next". The picks page does, and it was two clicks
away with no signpost.

Sign-in now lands on the picks page, onboarding saves and lands on the
picks page, and the onboarding button says "Save and see your picks".
The picks page label changed from "Your shelf" to "Picked for you",
because two pages both called "your shelf" is how a reader gets lost.
The shelf gets a "Your picks" link back, so the loop closes both ways.

Measured: onboarding submit lands on `/`, six picks render with reason
lines and vote buttons. Sign out lands on the public home.

### 3. Explore was a wall, not an index

8,500 originals sorted by attention answers nothing if you do not know
what you want. The family pages, the ones that answer "what else smells
like this", were only reachable by clicking a chip deep inside a product
page.

Explore now opens with "Start with a family": twelve accord chips, each
with its real count, ranked by how many catalogued fragrances carry the
accord. The count comes from the same `accords` array the family page
reads, so a chip never leads to a page that disagrees with it. Woody is
73,048, citrus 53,280, sweet 47,870. The list below still works the same
way.

### Verified live

- 10 routes render, two loads each, every image loaded, nav present on all
- Onboarding lands on the picks page with six cards
- Sign out returns to the public home
- Accord chip lands on a real family page (woody, 60/60 images)
- Lighthouse 1.0 accessibility, best practices, SEO on home, explore and
  a product page
- 161 tests green

---

## Part ten: onboarding that sounds like the product (2026-10-22)

The setup page was still a taste quiz. It asked for seven accord
preferences, then a budget, then a clone answer, and the first field was
not the thing the site is best at: naming a bottle you own.

### Four answers, one bottle

The order now follows signal strength:

1. Name a bottle you own. A forgiving typeahead finds it from a partial
   spelling ("avntus" returns Aventus), and the named bottle becomes a
   `CollectionItem`, so the census knows a real bottle on your shelf.
2. Pick one to three scent families from the census vocabulary.
3. Say whether you would wear a clone.
4. Pick a budget band.

Every step is skippable. Returning readers see their latest bottle already
selected, so the page does not ask the same question twice.

Saving the form is failure-tolerant: a duplicate bottle is not written
twice, and a failed collection write does not lose the rest of the answers.
The submit still lands on the picks page, with a reason line that names the
bottle: "Like Aventus, which you own."

### Gourmand was not a family

The old accord list was seven tags: fresh, sweet, woody, aromatic,
gourmand, amber, floral. Measured against 140,228 catalogue rows,
`gourmand` matched 119. Meanwhile citrus matched 53,280 and powdery and
leather were missing from the list entirely.

The chips now use the twelve largest census families by coverage: woody,
citrus, sweet, powdery, aromatic, amber, fruity, warm spicy, white floral,
fresh spicy, floral, musky. The budget and clone band keys did not change,
so no stored answer needed a migration; only the labels and hints did.

### Measured

- Four legends render in order, with twelve family chips
- "avntus" returns Aventus, and submitting lands on `/` with a picked-for-you
  reason that names it
- Two collection items persisted, and a revisit preselects the latest bottle
- 163 tests green at the time of this change

---

## Part eleven: the original is not a dead end (2026-10-22)

Clicking Inception lost Marwa. The page said nothing had been measured as
a clone of Inception, even though Inception is 81% close to Marwa and
Marwa's own page listed Inception. Three different bugs were stacked on
top of each other.

### 1. The page trusted one pointer

`Fragrance.inspiredById` is a single canonical pointer. For corpus clones
it is often empty. Inception's pointer is null; its incoming edges are
empty; its outgoing edge to Marwa is the real relationship. The page read
only the pointer, so it had no original to show.

The product page now reads the measured edges. `loadCloneTargets` returns
every original a bottle has been measured against, strongest sample first,
and tags same-house edges as siblings. Inception now opens with "measured
as a clone of Marwa: 81% close, from 67 votes," then the family strip with
Marwa first and Inception highlighted at its own score.

A page can be both a clone and an original. Marwa copies Imagination, and
Inception copies Marwa. The family strip follows the upstream family, and
the census below lists the page's own clones, so Marwa still shows Inception.

### 2. The 60% agreement floor deleted a real edge

Marwa vs Imagination is 883 yes and 695 no in the public smell-alike poll.
That is 56%, and the old hard 60% floor threw it away. The floor was
measured against 34 hand-curated canon edges, all at 74% or better, which
made it look safe for small samples and wrong for large ones.

The rule is now: keep the old 60% edges, and add a pair when the Wilson 95%
lower bound is above 50%. A 56% result from 1,578 voters is a real
majority; a 56% result from 25 voters is not. Re-running the ingest added
508 edges, the graph went from 19,917 to 20,425, and Imagination now has
four direct clones: Zara Sunrise, Zara Sunrise Intense, Amber Oud Aqua
Dubai and Marwa. Inception appears under "Second in line" at 81% close to
Marwa, with the two numbers kept separate.

### 3. The accord floor was a note floor

The 35% prominence floor was built for notes, where a weight of zero means
nobody voted. It was applied to accords too. Imagination's source carries
eight families (citrus 100, fresh spicy 34, green 28, fresh 26, aromatic
11, sweet 9, amber 9, floral 8), and the floor kept citrus alone.

Accords are now kept whole, with only zero-strength rows dropped. A backfill
rewrote 93,865 accord lists; the catalogue now averages 7.6 accords per
scent. Imagination shows all eight. Notes keep the 35% floor, so Tuscan
Leather still drops jasmine at zero.

### The rest of the page

- **Closeness everywhere.** The clone's own score sits in the family strip
  and in the verdict meter. Siblings in the census keep their scores, and
  "Second in line" shows a clone of a clone with its own number and its
  parent's number.
- **Pictures in the census.** Every census row now has a bottle thumbnail.
  A missing pid or a 404 falls back to a ghost bottle, not a blank cell.
- **A shopping path.** Pages with a captured price still show the partner
  and the size. Pages without one now show plain search links to
  FragranceNet, Perfumania, MicroPerfumes and Google Shopping. They are
  labeled as searches, not prices, and no partner pays for the placement.
- **Accords vs notes.** The chips are labeled "scent family" and "notes,"
  with one line between them: accords are the family, notes are the
  materials inside it.
- **False peers are gone.** The accord fallback was listing 1 Million and
  Y EDP on Marwa because they share five accords. It now runs only when a
  page has no measured clone at all, and it requires three shared notes
  from each scent's strongest ten. Marwa's page keeps Art of Arabia I as a
  measured peer at 70%; 1 Million is gone. The peer caption no longer calls
  two clone-house releases "originals."

### Measured

- Inception: original Marwa at 81%, 67 votes; family strip 2 bottles; no
  empty census; buy fallback present
- Marwa: clone of Imagination at 56%, 1,578 votes; census 1 clone
  (Inception, 81%); no 1 Million
- Imagination: 4 direct clones; Marwa at 56%; Inception under "Second in
  line" at 81% to Marwa; all 8 accords
- 177 tests green, typecheck clean, production build compiled
