# The clone graph: 48,745 measured pairs (2026-10-20)

The wedge is "which clone actually smells like the real thing". That needs a
graph connecting every fragrance to its clones. We had 34 hand-curated pairs.
Now we have 48,745, and they carry real vote counts.

## Where the data was hiding

The catalogue came from the corpus snapshot at
`data/kaggle-fragrantica/ledecanteur/perfumes.jsonl` (555MB, 140,228 rows).
The ingest script (`scripts/ingest-fragrantica.ts`) read `name`, `brand`,
`year`, `accords`, `notes`, `perfumers`, `picture` and dropped the rest.

The dropped field was the whole point:

```jsonc
"similar": {
  "reminds_me_of": [ { "id": 34696, "up_votes": 6141, "down_votes": 938 } ],
  "also_liked":    [ { "id": 51037 } ]   // algorithmic, no votes
}
```

`reminds_me_of` is the community's "does this remind you of that" vote, with
counts on both sides. That is a measured clone graph, not an editorial one.

## The two problems in the data

**1. The relation is symmetric.** A reminds me of B, and B reminds me of A,
both carrying identical vote counts. Every pair appears twice, and the raw
data does not say which side is the original.

**2. Direction has to be inferred.** A census page needs to know whether
CDNIM is the clone and Aventus the original, not the other way round.

## Clones vs flankers (the Qahwa correction)

The first ingest called every cross-house pair a clone. That was wrong, and a
reader caught it: **Lattafa Khamrah Qahwa is not a clone of Khamrah, it is a
flanker** of Lattafa's own Khamrah.

The tell is the house. A clone comes from a DIFFERENT house imitating this
one. A same-house pair is always a flanker, a concentration variant, or a
sibling release:

- Lattafa Khamrah Qahwa -> Lattafa Khamrah (flanker)
- MFK Baccarat Rouge 540 Extrait -> MFK Baccarat Rouge 540 (concentration)
- Chanel Coco Mademoiselle EDT -> Chanel Coco Mademoiselle (concentration)
- Dior Sauvage EDP -> Dior Sauvage (concentration)

The ground truth is exact on this: **all 34 hand-curated canon edges are
cross-house and 0 are same-house.** So the rule is not a guess.

7,844 of the 48,745 edges (16%) are same-house, and every one of the top
same-house pairs is a flanker or a variant. Those are now ingested with
`source: corpus-smell-alike-sibling` and shown in their own "From the same
house" section, never in the clone census.

## The direction rule (and the bug it hid)

### What the source actually contains

The relation is SYMMETRIC. A page for fragrance A lists B in
`reminds_me_of` with `up_votes`/`down_votes`, and B's page lists A with the
SAME vote counts. The vote count is a property of the PAIR, not of the
direction.

That means **the source carries no direction information at all**. Whichever
side we call "the clone" is a decision we have to make, and the first version
of the rule got it wrong on real cases.

### The first rule, and why it looked right

The first rule used house tier (CLONE house vs not), then year (the newer
release is the copy). It scored 34/34 against the hand-curated canon edges.

That 34/34 was misleading. All 34 canon edges are CROSS-HOUSE with one side a
known clone house, so the tier rule decided every one of them and the year
rule was never tested. 37,622 loaded edges are cross-house where NEITHER
house is a known clone house, and there the year rule was firing on its own.

The bug it produced: **Givenchy Amarige (1991, a famous fragrance) was filed
as the clone of ALREHAB PERFUMES Susan (2021, obscure)**, with 334 votes
attached to the wrong direction. Year said 2021 > 1991, so Amarige became the
copy.

### The second bug: two originals are not a clone pair

A reader pointed out that Sospiro Vibrato is an ORIGINAL, not a clone, and
that Afnan Turathi Blue is a Tygar clone. Research confirmed both:

- Sospiro Vibrato retails around $195 and has its own clones (Regent,
  Philos Messenger, Bujairami Vibration).
- Afnan Turathi Blue is a documented 78-95% Tygar dupe.

The page was showing Tygar as a clone of Vibrato. The cause: Vibrato and Tygar
are two independent designer originals that happen to smell alike, and the
rule had no way to express "these resemble each other without either being
the copy of the other".

### The final rule

1. Different house tiers (one side a house that makes copies): the
   clone-house side is the copy. Decided 4,428 edges.
2. Otherwise, if BOTH sides read as expensive originals, the pair is a PEER
   pair, not a clone relation. Decided 2,986 edges.
3. Otherwise PRICE PERCEPTION decides. A copy is a fragrance people think is
   CHEAP, so the copy has the HIGHER `price_value` score (1 = way
   overpriced, 5 = great value). Decided 33,413 edges.
4. Otherwise popularity, then year. Decided 74 edges.
5. Otherwise the pair is kept in both directions. Currently 0 edges.

The peer rule is the key addition. The corpus carries a community vote on
how overpriced each fragrance is, and a designer original reads expensive:

| Fragrance | price_value | reading |
|---|---|---|
| Bvlgari Tygar | 1.73 | designer original |
| Sospiro Vibrato | 2.41 | designer original |
| Afnan Turathi Blue | 4.31 | cheap copy |
| Creed Aventus | 1.69 | designer original |
| Armaf CDNIM | 4.32 | cheap copy |

Both sides under 2.6 means both are originals, so the pair is a peer pair.
Verified against ground truth: ZERO of the 34 hand-curated canon edges are
both-designer-priced, so the peer rule never hides a real clone.

Price perception scored 34/34 on the canon edges, better than popularity's
30/34, which is why it is checked before popularity.

### What the three cases look like now

- **Tygar** (original): Turathi Blue 84%, Al Qiam Silver 82%, Sceptre
  Bronzite 87%.
- **Vibrato** (original): clones Regent 87%, Philos Messenger 89%, Turathi
  Blue 80%, Kajal III 75%. Tygar is listed under "Also smells like this"
  with the other peers, never as a copy.
- **Turathi Blue** (a Tygar clone): its own family under Tygar, with the
  verdict showing 84% from 1,895 votes.

### Why popularity is now only a tiebreak

Popularity was the first fix and it was wrong for a second reason: it
measures fame, not originality. CDNIM (125,277) is more popular than Aventus
(125,148), and popular clones exist. Price perception measures what people
pay, which is the actual difference between an original and a copy.

### Post-fix validation

- 34/34 canon edges still correct.
- Zero same-house edges misfiled as clones.
- The Amarige case is fixed: `Susan -> Amarige up=334`, Amarige as original.
- `scripts/audit-clone-coverage.ts` shows the "unexplained" dropped pairs
  went from 19 (Aventus) to 0, meaning every dropped pair is now accounted
  for by the vote floor or a same-house sibling.
- 1,479 of 40,901 clone edges (3.6%) have the copy more popular than the
  original, which is legitimate: some copies really are the more famous
  fragrance.

`scripts/verify-smell-alike-direction.ts` re-checks the rules on every run
and exits non-zero on a mismatch, so the rule cannot silently drift again.

## What got loaded

| Metric | Value |
|---|---|
| Edges loaded (after vote floors) | 20,406 |
| True clones (different house) | 14,764 |
| Same-house siblings (flankers, versions) | 4,914 |
| Peer pairs (two originals that smell alike) | 728 |
| Distinct originals with at least one clone | 8,130 |
| Edges with 100+ up-votes | 4,321 |
| Top pair | Armaf CDNIM -> Creed Aventus, 6,141 up / 938 down (87%, 7,079 votes) |

Coverage on famous originals (from `scripts/audit-clone-coverage.ts`):

| Original | Clones known |
|---|---|
| Baccarat Rouge 540 | 273 |
| Aventus | 225 |
| La Vie Est Belle | 160 |
| Coco Mademoiselle | 119 |
| Sauvage | 110 |
| Invictus | 101 |
| Fahrenheit | 79 |
| Bleu de Chanel | 71 |
| Acqua di Gio | 65 |
| Silver Mountain Water | 56 |
| CK One | 56 |
| Bleu de Chanel EDP | 44 |
| Versace Pour Homme | 41 |
| Dior Homme | 39 |
| Polo Blue | 23 |

Every one of those numbers is a real count of distinct clones the community
has voted on, not an estimate.

Vote floors, validated against the 34 hand-curated canon edges:

1. At least 25 total votes per pair.
2. At least 15 up-votes per pair.
3. **A real community majority.** A pair where more people voted "no, these
   do not remind me of each other" than "yes" is a rejected resemblance, not
   a clone relation. The original rule was a hard 60% share. It kept every
   canon edge (all 34 sit at 74% or better), but it also deleted real pairs
   with large samples. Marwa vs Louis Vuitton Imagination is 883 yes and 695
   no, a 56% share from 1,578 voters, and the 60% cut threw it away. The
   added test is the Wilson 95% lower bound: the pair has to show that the
   majority is statistically real. A 56% result from 25 voters still fails,
   because that is a coin flip. See `src/domain/cloneGraph.ts`.

Floor 3 was added after a spot check found 17,102 of 40,901 edges (42%) had
more NO votes than YES, and they were being presented as clone relationships.
The worst offenders were the highest-vote edges:

| Pair | Yes | No |
|---|---|---|
| Burberry Her vs Baccarat Rouge 540 | 2,032 | 2,550 |
| Mancera Cedrat Boise vs Creed Aventus | 1,600 | 2,539 |
| La Vie Est Belle vs Viktor&Rolf Flowerbomb | 1,893 | 2,136 |
| Lattafa Khamrah vs By Kilian Angels' Share | 1,284 | 2,446 |

The Khamrah row is a good example of why the floor matters: the community
mostly says Khamrah does NOT smell like Angels' Share, and the page was
listing it as a clone relationship anyway.

With all three floors the graph holds 20,406 edges: 14,764 clones, 4,914
same-house siblings, 728 peer pairs. All 34 hand-curated edges survive, and
zero edges remain where more people voted no than yes.

## The niche ones the wedge is made of

These were the examples that proved the data was worth finding:

- **Ex Nihilo Blue Talisman** (2023): 24 clones. MAISON ASRAR Legacy 87%
  close, Blue Talisman Extrait 79%, Afnan Turathi Electric 76%, Lattafa Art
  Of Universe 65%.
- **Parfums de Marly Greenley** (2020): 16 clones. French Avenue Aether 94%,
  Lattafa Sherif 92%, Rue Broca Nexa Immortal 61%.
- **Lattafa Khamrah**: 10 clones. Khamrah Qahwa 92% close, Teriaq Intense 34%
  (most people do NOT think it smells like Teriaq, which is the correct
  answer and exactly the kind of disagreement a census should show).
- **Dior Bois Talisman** (2025): reminds of By the Fireplace 75%.

## How the UI uses it

- The verdict on a clone page now shows a real score and a real sample size
  ("87 score from 7,079 votes"), sourced and labeled as community
  smell-alike votes rather than pretending to be our own census.
- The shelf shows the original plus the 8 strongest clones, each labeled with
  its measured closeness percentage.
- The census list shows every clone in the family with the vote breakdown
  ("6,141 of 7,079 voters said it reminds them of the original"). Aventus
  has 206 entries; the shelf caps at 8 and says "198 more clones in the
  census list below".
- `RankedClone.source` distinguishes `live-census` (our own votes, which
  always win when present) from `smell-alike-votes`.

## What is still missing

- The graph is one-directional per pair, so a fragrance that is both a clone
  and a target appears in two families. That is correct, not a bug.
- 6,237 pairs have ambiguous direction and are stored both ways.
- The seeded community-consensus values are now mostly redundant: the
  smell-alike votes are measured and dated. They can be dropped for any pair
  that has real votes.
- `also_like` is algorithmic with no votes, so it is not ingested. Right call.


## Retail prices: the price people actually pay (2026-10-20)

The price gap between a copy and its original is the last piece of the
wedge, and eBay is the wrong source for it:

- the ORIGINAL side of a clone comparison is a designer bottle, and eBay is
  grey market and resale. A used Aventus sells for well under retail.
- the COPY side on eBay is full of "authenticity guaranteed" resellers and
  knockoffs of knockoffs, which would systematically overstate what a clone
  costs.

What a buyer actually pays comes from two places, and both are captured:

1. **Discunter retail.** Perfumania and MicroPerfumes expose clean Shopify
   feeds with SIZED variants for both designer originals and clone houses.
   Their handles reduce cleanly to our slugs
   ("absolu-aventus-edp-retail-bottle" -> "absolu-aventus"), and Perfumania's
   titles reduce to the scent name plus marketing words.
2. **Clone house retail.** armaf.com, afnan.com, lattafa-usa.com and
   alwataniah.com sell direct, and their feeds are the authoritative price
   for the copy.

### The size rule

Clone houses standardize on 100ml (3.4oz), and that is the standard
comparison size, so every capture prefers a 100ml variant. The fallback is
the closest size to 100ml, then the largest bottle. A product whose only
variants are samples or travel sprays is skipped entirely: a 2ml sample is
not a price comparison, it is a sample. Sizes are snapped to real bottle
sizes, so 3.4oz reads as 100ml and 3.6oz as 106ml.

### The matcher

Two mechanisms, tried in order:

1. **The handle**, which has to reduce to a catalogue slug EXACTLY. This is
   what keeps "Aventus Cologne" from pricing "Aventus", and
   "Yacht Man Aventus Cologne" from pricing anything.
2. **The title**, for the retailers whose handles are untidy. The title's
   scent part has to EQUAL a catalogue scent part.

An earlier title-only matcher produced real errors in testing: Creed Aventus
priced at $11.95 (that listing was "Yacht Man Aventus Cologne") and
"Absolu Aventus" pricing plain "Aventus". The handle matcher fixed both.

### What the numbers look like

| Fragrance | Price | Size | Source |
|---|---|---|---|
| Creed Green Irish Tweed | $399.95 | 100ml | Perfumania |
| Creed Aventus | $285.00 | 50ml | MicroPerfumes |
| Armaf Club de Nuit Intense Man | $45.00 | 3.6oz | Armaf |
| Lattafa Fakhar Black | $44.99 | 100ml | Lattafa |
| Armaf Tres Nuit | $45.00 | 3.4oz | Armaf |
| Afnan Turathi Blue | $30.95 | 3.4oz | Perfumania |

### Honest limits

- Coverage is 34 fragrances so far, because the two discounter catalogues
  hold 3,734 products between them and the clone house feeds hold another
  984. The reachable clone family is far larger than that, so most pages
  will show "no confident price" for now. More retailers have to be added.
- These are ASKING prices at a named source, never sold prices.
- Every price is shown with its size, because a price without a size is not
  a price anyone can act on.
