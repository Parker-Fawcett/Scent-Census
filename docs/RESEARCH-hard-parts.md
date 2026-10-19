# Hard Parts Research — Fragrence

Research memo backing PRD section 12. Each unknown below is now researched with sources and a recommended path. Dated 2026-10-19.

---

## Hard part 1: the catalog seed

**Question:** is there usable, licensed fragrance data, or do we scrape?

### The find: FragDB

The DIY answer would have been scraping Fragrantica. Someone already did exactly that, sells the result, refreshed three times a month, openly.

`github.com/FragDB/fragrance-database` / fragdb.net, v5.18 (refreshed 2026-10-08):

- 141,541 fragrances, 8,384 brands, 3,154 perfumers, 2,615 notes, 92 accords
- Notes pyramid stored relationally as `note_id, opacity, weight`; brand renames and merges keep stable IDs; schema stable since v5.4
- 5.3M user reviews in companion parquet (separate paid tier), 25,780 editorial articles
- Sample data free, MIT licensed; full database is a commercial license

Pricing that matters to us (from README, 2026-10):

| Option | Cost | What we get |
|---|---|---|
| One-time CSV core | $200 | All 141k fragrances, pyramids, accords, brands |
| One-time full (CSV + parquet UGC) | $400 | Adds reviews/articles parquet |
| Metered API | 1 unit = $0.0025; full record = 4 units = $0.01 | Minimum top-up $100 (40,000 units), min spend $100 per 180 days, batch 100 ids/call, 50k charged records/day |

**Our actual need is ~2,000 to ~3,000 records at full detail.** Via API that is 8,000 to 12,000 units = $20 to $30 against the $100 minimum. Via files it's a flat $200 with everyone included forever. Files win on simplicity; safety net is the free 10-record samples for writing the parser.

### What I recommend

**Buy the $200 CSV core.** Build the ingest against free samples red-first, buy when the contract tests pass. Delete "scrape Fragrantica" from the plan entirely: FragDB already carries the crawl cost, the decoy/spider-blocking arms race is theirs, and their changelog shows exactly the kind of data hygiene (retired note IDs, brand merges, URL normalization) we would have to build ourselves.

### Risks to verify before purchase (M1 checklist)

1. License terms: confirm the commercial license covers displaying pyramids/accords inside a consumer web app. Their use-case table lists "E-commerce, mobile apps, collection managers" as CSV-core uses, which reads like yes, but read LICENSE and legal pages before money moves.
2. Images: FragDB photo URLs point at the source's CDN (`fimgs.net`). We must not hotlink those. Decision for later: brand press images only, or product renders. The database is worth it for notes data even with no images at v1 (feed cards can use accord color blocks, to design).
3. Primary key style: FragDB uses Fragrantica pids; our `Fragrance` schema gets its own slugs and stores the source pid in a separate column for refresh joins.

---

## Hard part 2: price plumbing

**Question:** can we show real price intel without sold-data access?

### What the research says

eBay, the main source in catchandtrade's PRD, turns out to be a gate with two doors:

- **Free tier exists and is permanent:** 5,000 API calls/day, no time limit. Growth tier (25,000/day) needs an application. So the PRD's 5,000-call/day budget assumption survives contact with reality.
- **Sold prices are locked.** Marketplace Insights API (historical sold items) is restricted to high-tier partners in practice (Terapeak et al.). Community threads + developer docs confirm regular applications don't get it. The old Finding API, which people scraped sold prices from, is deprecated/retired.
- **A contract trap:** eBay's Buy API license agreement contains a "hands off" clause restricting apps that derive sales or activity rates from listings data. Whatever we build must compute ranges over asking prices of live listings and present them as asking-price ranges, not as market statistics.

Second door: **Vinted has no public data API**, deprecated years ago, Cloudflare on front. The internal `/svc-catalogue` endpoint responds to browser-fingerprint requests, meaning: residential proxies, session cookies, constant maintenance, and no project-entity permission to rely on. Third-party scrapers (Apify actors etc.) sell per-run access if we ever need a sample.

Third door: **retail anchor via affiliate feeds.** FragranceNet's affiliate program provides approved partners with product data feeds and reporting. That gives us (a) a stable retail price reference, and (b) the first revenue-ready integration, which is a nice property: the same integration is data source at v1 and money at the phase after v1.

### What I recommend

V1 pipeline: eBay Browse API for live listings (asking price, labeled "asking", `size` and `condition` stored per point) + FragranceNet feed as the retail anchor. Affiliates: FragranceNet first (feed + program), Amazon tag second, Notino/Jomashop when international traffic exists. No Vinted in v1. No sold prices anywhere in v1, and no invented trends: section 8 of the PRD gets one clarifying line, "asking price ranges, never sold-price analytics" (see PRD patch).

### Verify before build (M2 checklist)

1. Read the actual eBay API License Agreement clause and write the display copy accordingly (a one-hour read that prevents a takedown).
2. Apply for eBay keys early; approval latency is a schedule variable, not a code variable.
3. FragranceNet affiliate application in parallel; feed format unknown until approved.

---

## Hard part 3: census cold start

**Question:** can the closeness ranking get votes fast enough, and who already does this?

### Competitive check

There are players, none with our accountability model:

- **fragindex.com/clones** — inspired-by alternatives "ranked by similarity, notes, performance, and community data" (direct feature overlap; site was rate-limiting me, needs a closer look at how transparent its method is)
- **thesnifftest.co.uk** — UK clone comparison, community-rated
- **scentclones.com** — a "Master Fragrance Clone Spreadsheet" claiming 310+ verified clones with a self-authored testing protocol
- **AltScent.app** — top-5 alternatives ranked by scent similarity

Nobody leads with declared sample sizes and revote mechanics. The census's moat is the same trick as the price pipeline: counts and staleness shown, no editorial score. (To verify at build time: whether FragDB's full-level records include related-fragrance edges that compress clone-edge curation to minutes.)

### The consensus source already exists

It just isn't ours: r/fragranceclones has a pinned "FRAGRANCE CLONE LISTS & LINKS" mega-thread with exactly the edge data (what smells like what, and community skepticism about bad clones, e.g. an Oud for Greatness clone that "smells like copper pennies"). Use it and community posts as **editorial input for curating `inspired_by` edges**, not as data we ingest. Reddit's API is a dollar-metered trap; it informs editors, it never loads into the rollup.

### Cold start plan (fits the creator list we verified)

1. Seed census on ~50 famous bottleneck targets (the Aventus/Sauvage/Baccarat Rouge tier), 3 to 6 best-known clones each, edges pre-curated from community lists.
2. Every clone page and target page stores the vote prompt in place ("only if you smelled both"): the highest-intent census voters are people already deciding between clones.
3. Shorts creators (Top Frag, Fragrance Flan, FB Fragrances) drive vote bursts: one creator post per bottleneck, their audience votes, our page becomes the live rank they can link. Long-form creators (Cal Cologne, Gents Scents, Cuba Know) anchor "all clones of X" list pages later.
4. Unranked states are first-class ("be among the first to vote"), per the PRD's 25-vote rule. No fake ordinal positions while numbers are below threshold.
5. Do not scrape YouTube polls or Reddit threads into the rollup. Editors read them; the census only counts its own votes.

### Verify (M5 checklist)

1. Pull fragindex.com's method apart: if their ranking is claimed but unprovable, that is our pitch line; if it's principled, we are three votes behind, which changes plan 1 above.
2. Confirm with FragDB whether `full`-level records include sibling/clone edges worth ingesting as starting edges.
3. "Noal Diaz" creator spelling still pending from the user, excluded until verified.

---

## Net effect on the plan

The three hard parts compress from "unknown, probably months" to "solved paths with two purchases (FragDB $200, eBay keys free) and three verification reads." That is exactly the kind of risk profile M0 wants to close, because it changes the stack memo: we know we need a real DB from day one (Postgres), a batch ingest script, a scheduled rollup job, and an eBay client, and none of that is exotic. Nothing here blocks the stack memo.

---

## Addendum: numbers and their bases (recalibration pass, 2026-10-19)

Every number the spec picked that was guesswork now has either a real source or explicit math behind it. Numbers stay in config, never in code.

### Audience sizes for census bursts

| Source | Verified figure | Source |
|---|---|---|
| r/fragranceclones | ~270K–312K members (mid/late 2026 crawls differ by tracker) | Reddit stat trackers |
| Gents Scents (YouTube) | ~630K subs, ~3.0M views/30 days | youtubers.me stats page |
| Cal Cologne (YouTube) | ~170K subs | channel about page |
| Gents Scents clone-ranking content | "20 Fragrance World Clones RANKED" video: 68K views | YouTube, observed in search |
| Top Frag (TikTok/Shorts) | videos range 3K–256K views (e.g. Khamrah video 256K) | TikTok, observed in search |
| Fragrance Flan | small and growing (confirmed a 1,000-sub milestone reel; shorts format) | reel + channel search |

**Base rate assumption, labeled as assumption:** votes per creator-prompted vote ≈ 0.05%–0.5% of views (in-comment polls historically convert low; quarter of a percent is the planning number). A 68K-view burst channel then yields ~35–340 votes per target when the vote link is per-pair and pinned. Ranges, not promises; measured once the census is live and the ratio recalibrated.

### Census vote floor: 25 was wrong for launch, split it

Statistical basis (5 buckets mapping to 95/80/60/35/10):

- SD of a realistic mixed bucket distribution on one clone pair: ~18 points
- 95% CI half-width of the mean ≈ 1.96 × SD / √n: at n=10 it is ±11 points; at n=25 it is ±7

That means two clones whose true closeness differs by 25+ points separate cleanly at n=25, and at n=10 the average clone resolves "close vs similar vs not" correctly but close ties do not. So:

| Rule | Value | Display |
|---|---|---|
| Appears in ranked list | n ≥ 10 | rank shown, labeled "low confidence (n votes)" |
| Confident rank | n ≥ 25 | no confidence label |
| Tie note | scores within ~10 points | "statistically tied, more votes will separate" |

**Decision changed:** launch floor is 10 votes with a low-confidence label (was 25 with nothing shown). Full confidence unchanged at 25. The floor lives in one config value. Sensitivity regime: for 40 bottleneck targets × ~4 clones each, 1,600 votes gets the whole initial ladder floor-crossed across a launch month at observed base rates; the top 15 targets × their top clone is ~200+ votes which one good short achieves.

### Price estimator sample size: 55 was wrong, 12 with a thin-data category

Famous fragrances typically carry dozens to hundreds of active eBay listings per size; long-tail carries fewer. Trimmed mean behavior at n=12 (trimming top and bottom ~10%) is stable enough for a range display, and the range display is mandatory anyway. Below 12: "thin data" label, last-known range if any, "no confident price" if never fresh. The old 55 was a fiction; 12 is the planning floor, also config.

### Catalog, roster, staleness: kept

- Famous-300 seed: kept (covers the catalogs named in r/fragranceclones lists and the ranking videos we verified, e.g. "20 Fragrance World clones ranked").
- Creator roster: ceiling 6 (the verified channels), launch minimum 3, per the creator-account plan in the PRD.
- Staleness window 30 days: kept and now justified by FragDB's ~3x/month refresh; 30 days tolerates one missed cycle.
- Feed 70/30 taste/contrast split and the recommendation weights: initialized as defaults, reviewed against golden fixtures in M4; no research layer pretends to validate them before votes exist.
