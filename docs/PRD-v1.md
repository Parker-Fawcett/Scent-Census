# Scent Census — V1 Product Spec

Name decision (2026-10-19, superseding earlier drafts): the brand is **Scent Census** (scentcensus.com/.app verified available). The working title "Fragrence" appears in the text below only as history; the reasoning is in RESEARCH-naming.md.

Status: draft for discussion. Stack choice and build plan come after this doc is agreed.
Reference repo for lessons learned: `catchandtrade/` (kept untracked; not part of this codebase).

---

## 1. One sentence

Fragrence is a personal fragrance advisor that reads your shelf: you catalog the bottles you own, tell it what you like and refuse to smell, and it shows you what to buy next within your budget.

## 2. The job v1 does

One job, no forks:

> Help a fragrance hobbyist or beginner decide what bottle to add next, based on what they already own and what they've told us they like.

Everything in v1 serves that sentence. Collection worth exists because owners ask "what is my shelf worth?" and because a collection is the fastest honest source of taste data. Product pages exist because the feed's job is to move a person to a decision about one bottle.

## 3. Why this niche wins (and why the card app couldn't)

Catalog and taste data compound on the same object. Collecting a card rack earns you nothing but a ledger; every bottle a user adds to Fragrence makes their next recommendation sharper, because a bottle is a bundle of notes, a house, a tier, a price point, and a batch identity. The catchandtrade portfolio page never fed its homepage. That's the fix.

Wedge, in order:

1. Budget + clones. Clone houses (Armaf, Lattafa, Dossier, ALT, Oil, Zara) are where the whole young-male fragrance internet lives. Most tools treat clones as afterthoughts. We treat clone-of links as first-class data: every fragrance can point at what it's "inspired by," and budget users can navigate the whole catalog through that graph.
2. YouTube reviews on product pages. The audience already decides what to buy from reviews. We surface the reviews on the page where the decision happens, and later, partner with the creators themselves for distribution.
3. Simple, honest worth. People overpay for discontinued bottles because sold-data tools are bad or absent. We can fix a slice of that with live listings ranges and staleness rules.

## 4. The user

Two, deliberately:

- **The newbie** (largest segment): owns 2 to 10 bottles, mostly designer plus a few clones, came from TikTok or YouTube, has a budget, is terrified of a $200 blind buy.
- **The shelf hoarder** (power segment): owns 30 to 150 bottles, knows the notes language, wants collection worth, wants to fill specific holes ("I have zero ambers that are not sweet").

V1 does not chase resellers, decant sellers, or perfume Oil influencers. Later.

## 5. The core loop

```
1. ONBOARD    catalog your bottles + 3 quick questions (budget, clones ok?, accords)
2. SHELF      your collection, with what it's worth today
3. FEED       homepage shows bottles tuned to your shelf + your votes
4. VOTE       like / dislike anything you see (swiping tunes the feed, always)
5. DECIDE     product page: notes, price range, worth context, YouTube reviews
6. CENSUS     rate clone closeness on a 0-100% scale: how close does it smell? (feeds the ranking)
```

The loop is the product design: each cycle, the feed gets one bit better.

## 6. What v1 refuses (write these down, then obey)

Learned from catchandtrade where every unplanned feature became a stub, a `.bak`, or a lying doc:

1. No marketplace. No listings, no orders, no escrow, no payouts. (Maybe ever; certainly not v1.)
2. No Stripe, no payments of any kind in v1.
3. No photo identification of bottles. Manual search add only.
4. No batch code decoder in v1. v2 candidate, standalone spec.
5. No friend graph, no DMs, no user-to-user anything. Following (section 7.7) is subscription to updates about fragrances, houses, and creators, not a social graph. A public shelf link is the only user-to-user social surface in v1.
6. No email digests, no push notifications.
7. No mobile app. One responsive web app.
8. No TCG-style "every SKU ever" ingestion. Catalog starts at ~2,000 curated fragrances and grows by request only.

## 7. Feature specs

### 7.1 Onboarding (target: under 3 minutes, skippable everywhere)

Flow: account creation (email or Google) → "catalog what you're already smelling" → three questions → homepage exists.

The three questions, and what they earn the recommender:

| Question | Options | Signal earned |
|---|---|---|
| Bottle budget | under $50 / $50–150 / $150–400 / no ceiling | hard filter on feed |
| Do you buy clones? | yes, happily / no, original only / only the good ones | tier weight: clone/niche/designer |
| Pick 1–3 from these accords | rendered from notes actually present on the user's shelf; fallback: fresh, sweet, woody, aromatic, gourmand, amber, floral | note affinity seed |

There is no long quiz and no "rate these 50 famous fragrances" wall. Full note affinity develops from shelf contents plus votes, which is honest because it's behavior, not a quiz.

Acceptance criteria:

- First session without adding any bottle still produces a homepage (budget + clone answer alone must be enough; the feed shows curated editor picks with that filter).
- After adding one bottle with known houses, the feed must contain at least one recommendation whose reason references that bottle's house or notes ("like Initio's Side Effect, you rated..."). Reason text is mandatory: every feed card shows why it's there.
- Every step of onboarding is skippable without freezing state.

### 7.2 Collection and worth

Add a bottle: search house → fragrance → size (30/50/100/other) → optional: price you paid, date you got it, sealed or lightly worn.

Shelf view: each bottle with its current market estimate, your cost if entered, aroma "delta". Top of page: total worth, cost basis, delta. Full collection shows a set-completion-agnostic list, never a pokedex-style chase.

Acceptance criteria:

- A bottle with no market data shows "no confident price" rather than a number. Never shows an invented estimate. (See section 8.)
- Worth range shown, not a single value, when data supports it.
- Removing a bottle updates the worth summary in the same render, no stale total.
- Collection works with zero bottles (empty states are real screens, not a blank canvas).

### 7.3 Votes: like / dislike

Two buttons on feed cards and product pages. Vote semantics go a machine-readable step past "clicks":

- A vote records: fragrance, direction, and the reason already displayed on that card, so we learn which reasons users actually accept.
- Disliking a bottle you own is allowed and handled: the shelf keeps it, and the recommender learns contrast ("you own X, so we won't recommend near-duplicates of X").
- Every vote is revisionable (tap again to un-vote).

Acceptance criteria:

- Disliking a bottle immediately changes the next feed page: another heavy-disliked-note look-alike drops to position > N or vanishes. This is a testable assertion, not a vibe.
- No fragrance appears on the feed with the same reason twice in a row for the same user.
- O(log feed depth) is irrelevant at v1 scale: a single recompute per page render is enough, and correctness beats cache cleverness.

### 7.4 The feed (the personalized homepage)

Not a grid of everything. A queue with intent per card.

Card anatomy: bottle image, house, name, one-line smell description in plain words, price range with staleness marker, and the mandatory reason line, plus tag chips: clone-of / discontinued / value pick at your budget.

Feed composition v1:

- ~70% matchable to taste profile (affinity between shelf notes and candidate notes, budget fit, tier fit).
- ~30% deliberate contrast: one house or accord family away from the shelf, framed as "different from your shelf, on purpose."
- Feed never repeats a fragrance the user owns, disliked, or declined, ever.

### 7.5 Product page

Sections, in decision order:

1. Top: name, house, concentration, first sniff line, hero image.
2. Price box: retail reference, live listings range (eBay first), staleness date, worth context ("typically $X–$Y at 100ml, rising since 2024"). If discontinued, say it plainly; that context is a growth feature, not a badge.
3. Notes pyramid: top / heart / base.
4. Clone link: "inspired by" or "first-class alternatives at your budget" if this is a clone.
5. Reviews: YouTube reviews embedded (2–4 reviewers). Creators get a simple partner flow (email to authenticate channel, curated badge) in a later phase. v1 embeds top search results on the fragrance name; actual partner pipeline is phase 2+.
6. Community smell words: how real people describe it (from votes metadata, not scraped).

Acceptance criteria:

- Page loads with 0 network calls to third-party ad/trackers; all embeds IO-locked.
- Zero YouTube reviews found is a designed state, not an error.

### 7.6 Clone census (the closeness ranking)

Every fragrance page with clones shows one thing the whole niche argues about, settled by measurement:

> Clones of this, ranked best to worst by how close they smell, according to public votes.

And on the clone's own page, the reverse link: "inspired by X, voted N% close."

How the census works:

1. **The graph says who; the votes say how close.** The `inspired_by` edge (editor-curated, with a public "suggest a clone" queue) declares which fragrances are clones of a target. Closeness ranks come only from votes. An edge without votes never displays a rank.
2. **The vote is a closeness bucket, not a free score.** When a user who has smelled a clone votes, they pick one: Spot on / Close / Similar / Same family only / Not close. Buckets map to a 0–100 closeness score (e.g. 95 / 80 / 60 / 35 / 10). Free-form percentages invite nonsense; buckets keep the census honest and comparable.
3. **Ranking math is one domain function.** Closeness score = weighted mean of bucket values with outliers trimmed, same robustness rule as the price estimator. Sample size, vote recency, and a staleness window are stored with the rollup.
4. **Minimum sample before ranking, two levels.** At 10 votes a clone enters the ranked list with a visible "low confidence (n votes)" label. At 25 votes the label drops and the rank is displayed clean. Below 10 votes, the clone shows "too few votes to rank" plus the most common bucket in words ("most voted: close"). No number, no invented position, and near-tied scores display as "statistically tied" rather than fake ordinal precision. Floor values live in config (rationale in RESEARCH-hard-parts.md).
5. **One vote per user per clone pair, revisable.** A later vote overwrites the old one; both directions (target page and clone page) read the same store.
6. **Ties and staleness.** Equal scores rank by larger sample, then by fresher votes. Stale rollups display their last-known rank with a "last updated" date, never a re-computed fake.

Where it appears:

- Target fragrance page: "Clones, best to worst by public census" list with score bars and vote counts.
- Clone product page: "Voted N% close to X (n votes)" near the price box, linked both ways.
- Feed cards: a clone card may carry its closeness score as a reason line ("voted 85% close to Aventus, $38").

Acceptance criteria:

- A target with 3 clones that have 0 votes shows all three under "no census yet," in a stable order (alphabetical), with no scores and no ordinal positions implied.
- After the 10th vote lands on one clone, exactly that clone appears ranked (low-confidence label) and the other two stay unranked; the label disappears at 25 votes.
- Changing your vote moves the rank the next time the rollup recomputes, and the displayed count never double-counts a user.
- A clone vote by a user who has never smelled the fragrance is not blocked (v1 has no way to know), but the vote UI says "only if you've smelled both," and the rollup's confidence display reflects sample size.
- Ranking function is pure: given buckets, counts, and timestamps, output is deterministic and covered by unit tests including tie and low-sample cases.

### 7.7 Follows and the update feed

You can follow three kinds of thing and get a clean update stream about them on the homepage:

| You follow | You get notified when |
|---|---|
| A fragrance | new review landed on its page, census rank unlocked (threshold rule crossed), worth band moved between staleness-fresh rollups, discontinued/revival status changes |
| A house | a new release or flanker dropped (Rasasi drops the next Hawas, you hear it that day) |
| A creator | they post to their claimed creator account: new review logged, pickup logged |

What follows are NOT: friending, messaging, likes between users, notifications about other people, or fan accounts that track somebody's YouTube channel. They are subscriptions to entity update streams, and for creators specifically, subscriptions to content the creator chose to log here.

**Creator accounts, claim-based:** fragrance creators convert their own normal account into a creator account. We invite them (email or handle outreach, with the six verified channels as the first batch); they sign up, claim a creator profile, and log their own activity (pickups, review links). Verification is a light manual check of channel identity. Creators control their page and their updates; Fragrence never runs an unofficial "fan page" that mirrors someone's YouTube feed. Reviews that surface on product pages via search remain editorial-curated embeds and are visually separate from creator-logged content.

How each signal is sourced (honesty applies here too):

1. **House drops**: detected by diffing consecutive catalog releases (FragDB refreshes ~3x/month with stable IDs). New fragrance record on a followed house = drop event. Same mechanism powers a house page ("all releases, newest first") and a "new this month" section for non-followers.
2. **Creator activity**: creator-logged only, on claimed accounts. No channel polling, no scraping, no impersonation. Each logged update carries the creator's own link back to their content.
3. **Census milestones**: generated by the rollup job family when a clone crosses the 10-vote floor or 25-vote confidence line, or the rank order changes.
4. **Worth moves**: only a band change in a fresh FragranceEstimate triggers an event; a stale estimate never emits anything.

Where updates live:

- Homepage gets a second tab ("Updates") beside the feed. Badge count on the tab, in-app only.
- Product pages, house pages, and creator pages show a follow toggle in the header.
- Each update card links to its page and states its source ("diffed from v5.18 catalog", "10 votes", "logged by Cal Cologne").

Acceptance criteria:

- Following nothing is fine: Updates tab shows the general "new this month" catalog section, not an error state.
- Un-following stops the event before the next event materialization; no notification is generated from a stream the user already left.
- Drop detection is tested as a pure diff: given two catalog release snapshots, output exactly the new records per house. No release diff past the last-seen release is double-emitted.
- Creator event materialization only emits to a creator's claimed account stream, and creator logging is unavailable to unclaimed accounts (the upgrade path is gated, so nobody can squat a channel name).
- A worth event fires at most once per user per epoch of the rollup (no re-fires when the user does not reload between two recomputes).
- Updates never contain a price claim computed from stale or invented data; band changes cite the estimate's computed_at and sample count.
- Anything the creator logged and anything auto-generated is visually distinct on the same stream.

## 8. The price honesty contract

(These rules exist because mock `Math.random()` prices shipped to production in the card app and survived three audit commits.)

1. Price data comes from named sources only: eBay listings API, retailer retail feeds. Each `PricePoint` stores its source, captured date, and bottle size, condition, and asking or sold status.
2. Estimates are computed by a single domain function: trimmed-mean over a window, minimum sample size declared (12 listings for a confident estimate, "thin data" label below, rationale in RESEARCH-hard-parts.md), range always displayed, never a lone figure.
3. Data older than the staleness window (30 days) is excluded from the estimate and the card says "no confident price," with the last-known range if we have it. We never invent a number to fill space. Plus, per the eBay license terms (see RESEARCH-hard-parts.md): we compute asking-price ranges over live listings and label them as asking prices. We never present a derived sales-rate statistic, and we never imply sold prices.
4. A `FakeMarketDataSource` exists behind the same interface for tests only, environment-gated, so demo data can never leak into production.
5. No price-adjacent copy is ever generated. Copy templates can reference ranges, never fabricate trends.

## 9. Domain model (logical, stack-agnostic)

- **User** (auth, `TasteProfile` embedded)
- **House** — name, slug, tier (DESIGNER / NICHE / CLONE / MASS_MARKET), disambiguation (e.g. "Dior", "Dossier")
- **Fragrance** — name, slug, house, concentration (EDT/EDP/Extrait/EdC/Oil), release year, discontinued, gender/classification, notes: top/heart/base (strings+families), perfumer, `inspired_by` optional self-FK (the clone-of edge), blind-buy risk score, image
- **CollectionItem** — user, fragrance, size ml, batch date (free form, decoder later), price paid, purchase date, sealed bool, denormalized current estimate (+ staleness)
- **Vote** — user, fragrance, direction (LIKE / DISLIKE / DECLINE / OWN), reason-slug (which reason line was showing), created_at
- **Note** — canonical note name, family (fresh / sweet / woody / gourmand / aromatic / amber / floral / musky / green / spice / leather / citrus / aquatic / smoky / fruity)
- **PricePoint** — fragrance, source enum, size, condition, captured_at, source listing id
- **FragranceEstimate** — rollup: low / mid / high, sample_size, computed_at, is_stale (materialized, recomputed per fragrance on schedule)
- **CloneVote** — voter, clone fragrance, target fragrance, closeness bucket (SPOT_ON / CLOSE / SIMILAR / SAME_FAMILY / NOT_CLOSE), created_at; one row per voter per pair, upsert on revote
- **CloneRollup** — clone, target, closeness score 0–100, sample_size, computed_at, is_stale; materialized from CloneVote by the same rollup job family as FragranceEstimate
- **Creator** — name, slug, platform(s) and handles, status (UNCLAIMED / INVITED / CLAIMED / VERIFIED), claimed_by_user_id (nullable), bio; the roster in section 11 is the seed invite list, but accounts are claimed by their owners, never created as fan pages
- **Follow** — user, subject (fragrance | house | creator), subject_id, created_at, last_seen_release (used to avoid double-emitting drop/review events)
- **UpdateEvent** — user, event type (DROP, NEW_REVIEW, PICKUP, CENSUS_MILESTONE, WORTH_MOVE, STATUS_CHANGE), subject, payload, occurred_at, emitted_at, source_label

## 10. Personalization algorithm v1

Fit score per candidate fragrance, deterministic and testable:

```
score = w_notes   × note-affinity match against profile
      + w_house   × house-tier fit (clone/niche/designer weight from taste answer)
      + w_budget  × budget fit (steep penalty above budget, reward for value picks)
      + w_links   × inspiration-link graph distance from owned fragrances (clone-of chains)
      − p_dislike × disliked-note overlap
      − p_owned   × owned/flanker fatigue
      + small deterministic novelty jitter (seeded, reproducible in tests)
```

- No ML in v1. The weights are constants, exposed in one config file, and reviewed "rations" style each phase.
- Golden test set: a script-owned fixture of synthetic users (e.g. clone-budget gourmand lover with 5 bottles) with asserted feed expectations. Feed tests run against these fixtures, not live data.
- The 70/30 contrast split is a test assertion, not an aesthetic choice.

## 11. Growth (the YouTube coin)

v1: reviews exist on the page (sub-7.5), and each of the six verified channels gets a followable creator page in v1 (sub-7.7): their pickups and reviews, newest first, followable by fans. Phase 2+: creator partnerships; the page credit becomes a distribution deal. Partner mechanics (channelclaim flow, badge, custom deep links) is its own spec, later. V1's job is to be a page creators want to send their comments.

**Creator roster (Parker's watch list, verified handles as of Oct 2026):**

| Creator | Platform / handle | Notes for the product |
|---|---|---|
| Cal Cologne | youtube.com/@CalCologne (~170K) | Long-form collector; big list videos |
| Gents Scents | youtube.com/gentsscents (Ash) | Long-form lists and discovery, has a second channel (@ExtraGentsScents) |
| Cuba Know | YouTube | Long-form, humor-forward, clone-space adjacent |
| FB Fragrances | youtube.com/@FBFragrances + TikTok | Shorts-first, niche-heavy, does collab editions (e.g. Hawas Sapphire FB edition) |
| Top Frag | @topfrag.official (TikTok + Shorts) | Shorts-first, budget/clone reviews |
| Fragrance Flan | youtube.com/@FragranceFlan (Ciaran Flanagan) | Shorts-first, "Yes or No" format |

Note the mix: three long-form authority channels (Cal, Gents Scents, Cuba Know) plus three shorts-first clonespace channels (FB, Top Frag, Fragrance Flan). The shorts channels' audiences are exactly the census's cold-start voters, so census seeding happens through them: creator posts or shares the clone ranking for a famous bottleneck (e.g. the Aventis-clone ladder), their audience weighs in, the page has a live public census to link back. Their content stays the distribution; our page becomes the permalink for the debate. Pending: "Noal Diaz" from the original list didn't verify under that name; need a link or correct spelling.

**Creator account plan (v1, claim-based):** we invite, creators claim, no fan pages.

1. Outreach invites go to the verified roster first (email or DM with the claim link). A claimed creator logs their own pickups and review links; the platform never mirrors their channel automatically.
2. Launch roster: minimum 3 claimed creators, ceiling 6. If only 3 claim by launch, we launch with 3 and the pages that exist stay honest.
3. Claim flow is a v1 milestone (M5) because creator follows depend on it. Deeper partner mechanics (badge tiers, revenue share) stays a later phase.
4. What the creator gets at launch: a permalink page for the clone-census debate their audience is already having, followable in-app, and their logged posts feed their followers directly.

## 12. Milestones

- **M0** DONE. Decisions: this doc approved, stack memo approved, repo named.
- **M1** DONE. Domain core red-first (staleness, price honesty, census math, search with accent folding + whitespace discipline, release diffing with duplicate-pid guard), market-source seam with deterministic fake + per-group grouping, FragDB ingest mapper proven against the real 10-row sample fixtures, Prisma schema migrated against local Postgres (dev + test via docker-compose). 64 unit tests, all gates green.
- **M2** DONE (backend). Worth pipeline proven end to end against real Postgres: shelf worth domain, capture ingestion with listing-state dedupe, live compute path. Real captures wait on eBay keys; the seam is ready. UI lands in M3.
- **M3** DONE. Auth (credentials over tested repo with merge onboarding semantics), shelf page with honest worth summary + empty states, add-bottle flow (DB-catalogue search, validated add action, owner-scoped remove via redirect-refresh), Playwright e2e on the real flows with trace-driven correctness (the remove action's empty-flight quirk is documented in code; explicit redirect = deterministic same-render refresh). 92 unit + 20 integration + 2 e2e. Post-accept fix, traced by bisect: next-auth's `auth()` generates a CSRF random (via `@auth/core` `randomString`) on every cookie-less request, which Cache Components blocks during prerendering; auth-scoped pages therefore declare `await connection()` inside their Suspense data components before calling `auth()`.
- **M4** DONE (server side closed, 2026-10-19): vote validation + the feed algorithm red-first as domains (27 unit tests), then the repositories red-first: `src/server/votes.ts` (owner-scoped revisionable votes, every bad client call dies through the domain error) and `src/server/feed.ts` (real inputs from user+shelf+votes+FeedPageState; the 140k-row corpus narrows in SQL by candidate nature: taste pool overlaps known accords or links into the shelf, contrast pool provably touches nothing known or pushed away with a stable per-user sample offset; every vote = seen so a voted card never returns; the PRD 7.3 back-to-back rule survives across pages through the FeedPageState table). Homepage is the feed surface for signed-in users: cards with honest reason lines + LIKE/DISLIKE/DECLINE/OWN buttons and a More link (server actions, explicit redirect pattern). Golden persona fixtures (novice / clone-curious / heavy push-backer) pin composition quotas, exclusion rules and reason priority as named scenarios. 144 unit + 37 integration + 2 e2e green. Next 16 lesson: searchParams is runtime data and must be awaited INSIDE the Suspense-split data component, not in the route frame.
- **M5** Product pages with YouTube embeds and price box, clone census (vote UI, rollup job, ranked list with the two confidence levels), follow toggles + update feed, and the creator claim flow (invite → claim → verified → log pickups/reviews).
- **M6** Catalog seed v1: ~2,000 fragrances (houses ~200) ingested with contract tests on cleaning, including the `inspired_by` edges for the famous clones. Ingest job emits release diffs, which is also the drop-detection source for house follows.

### 12.1 Decision change (2026-10-19): free catalog source

User decision: no paid data. The paid FragDB Core tier is deferred (not cancelled); v1 loads the **public Kaggle snapshot of the full Fragrantica corpus** ("Fragrantica Perfumes: Ratings, Notes, Votes & More" by ledecanteur, direct download, no account). Consequences, all recorded in `tests/fixtures/fragrantica-dump/SOURCE.md`: notes/accords carry community vote strengths; no inspired_by edges in the data (clone curation stays in M5; the corpus `reminds_me_of` vote counts are a recorded candidate signal); provenance is a point-in-time snapshot, so release diffs and drop detection need a fresh snapshot or a later paid refresh. House display names vary in case ("PARIS CORNER"); import canonicalizes by name slug and reuses a same-named house (House.name unique), proven by regression test. Coverage: every house in the seed list is present, including Arabiyat Prestige, Mykonos, and Velixir (the "Velixar" spelling appears in reviews; brands.csv-style resolution happens after load).
- **M7** Deploy ready; ReadMe is one short doc, kept truthful.

## 13. Decisions and open questions

Resolved:

1. **Name**: brand is **Scent Census**. The earlier working title "Fragrence" was rejected on the misspelling-sincerity research (RESEARCH-naming.md), with scentcensus.com and scentcensus.app both verified available.
2. **Catalog seed**: the famous ~300 bottles the audience actually discusses first, then broadens by request (confirmed).
3. **Creator roster**: the six verified channels above in section 11. "Noal Diaz" pending a link or spelling.

Open (propose default):

4. **Auth**: default decision is email + password AND Google on day one; both are cheap once the auth lib is picked, and forcing one excludes half the target audience. Say "just email" if you want it smaller.
5. **"Noal Diaz"**: pending correct handle.

## 14. Catchandtrade lessons, carried forward

| Old failure | New rule |
|---|---|
| Monorepo collapsed into a Next app mid-flight; docs froze each era | Single app from day one. Docs live in the repo and are updated in the same PR as the change |
| Root `package.json` named `"temp"` with leftover turbo/Expo shells | No placeholder files. If it's unused, it's deleted before merge |
| 20 files each declaring `const API_URL = ...` and 3 overlapping helpers | One canonical URL/config module on day 1, ESLint rule that bans raw env reads elsewhere |
| `generateMockPrices()` shipped real product data from `Math.random()` | Price honesty contract (section 8), enforced by tests |
| Feature-task checklists marked done for code that was later deleted | Task status lives with the code (checked-in checklist updated in the same commit), never in a stale doc |
| Playwright suite pointed at production | E2E never targets prod; integration uses test data |
| DB password committed in docs | No credentials in repo, ever; `.env.example` has keys only |
