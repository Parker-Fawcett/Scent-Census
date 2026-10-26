# Monetization plan (2026-10-21)

Three revenue legs. One rule that outranks all of them:

> **The census is never for sale.** A partner pays for a click, never for a
> position. The ranking comes from votes and from measured closeness, and
> nothing in the ranking code reads a partner, a commission, or an ad slot.

This extends docs/IDENTITY.md ("when money eventually enters, it sits outside
the ranking and is labeled; the census bucket data is never for sale").

## Leg 1: retailer partnerships (built)

The two-way trade: they give us a price feed and a commission, we give them
the highest-intent traffic on the internet for this category, which is a
visitor who has already read the census and decided what they want.

**Why not eBay.** The original side of a clone comparison is a designer
bottle, and eBay is grey market and resale: a used Aventus sells for well
under retail. The copy side on eBay is full of "authenticity guaranteed"
resellers and knockoffs of knockoffs, which overstates what a clone costs.
Both ends wrong.

**Who, and how to join:**

| Partner | Network | How |
|---|---|---|
| Perfumania | Commission Junction / Sovrn | perfumania.com/pages/affiliate-program |
| FragranceNet | Rakuten Advertising | fragrancenet.com/help/affiliate_program |
| MicroPerfumes | direct | contact them, or share the feed |
| Armaf, Afnan, Lattafa, Al Wataniah | direct | clone houses, contact sales |

**Built:**
- `Partner` and `PartnerLink` tables, seeded with six partners
- `src/domain/affiliate.ts`: URL builder per network (CJ, Rakuten, Impact,
  direct), with our own click token on every link
- `src/app/api/click/[token]/route.ts`: the redirect that counts clicks
- `src/server/buyOptions.ts`: the "Where to buy" block, ordered CHEAPEST
  FIRST. That ordering is the safety: if commission ever affected the order,
  a retailer could buy a better position. Cheapest-first means the reader
  gets the best price and we cannot be accused of ranking for money.
- 45 partner links built, 56 price captures attributed to a partner
- Live outbound links, marked `rel="sponsored nofollow noopener"`

**What the reader sees**, below the ranked census and labeled:
"Prices are live asking prices captured from each retailer. We may earn a
commission if you buy through one of these links. The census ranking above is
decided by votes, and no retailer can buy a position on it."

**Not done:** applying to CJ and Rakuten. That needs our tax details and a
site with real traffic, and the affiliateIds are one column away
(`Partner.affiliateId`) when they approve us.

### Coverage, after the fix

The first version of the capture priced only the fragrances in a clone
family, which is 50 out of 140,228. The "Where to buy" block was therefore
empty on nearly every page and the affiliate links had nothing to point at.
The capture now walks the whole catalogue, because a price on a page is worth
having whether or not that scent has clones.

| | |
|---|---|
| Retailer feeds read | 8 |
| Products seen | 6,325 |
| Price points | 1,274 |
| Fragrances priced | 1,083 |
| Full capture runtime | 24 seconds |
| Incremental runtime (stale only) | 34 seconds, 2,245 skipped |

The runtime matters: the capture started at 8.6 minutes because every point
was one INSERT. Batched to 500 rows, the same capture takes 24 seconds, which
a request-based cron can afford.

**The daily schedule** lives in vercel.json:
`/api/cron/capture-prices` at 05:30, then the staleness sweep at 07:00 so a
freshly captured price is not immediately marked stale. The cron route and
the script call the same `capturePrices` function, so a price can never come
from a path the schedule misses.

**Formats that are not a bottle** are excluded: a body mist at $9.95 for
237ml is not the price of a designer EDP, and a gift set is not a bottle.
Body mists, shower gels, hair sprays, creams, candles, diffusers, discovery
kits, gift sets, samples, vials and travel sprays are all skipped, and the
remaining cheap captures are real: $14.95 for 100ml of Lattafa or Oud Elite,
which is what a clone actually costs.

## Leg 2: creator partnerships (built, needs the humans)

The swap: we send a creator a census page for their signature scent, they
send us their dupe verdict. What they get is a citable page with a measured
number on it, which is worth more to a reviewer than cash, because the
citation is the durable part.

**Built:**
- `CreatorPartnership` table: platform, where we send them, where they send
  us, what they get, revenue share
- `CreatorPickup.creatorVerdictCents` and `.creatorVerdictNote`: a creator's
  own verdict, stored separately from the community counts
- The product page now shows "Creator verdicts" with the line "One reviewer,
  one opinion. These are not census votes and they are not counted in the
  numbers above."
- A `partner` marker on a pickup whose creator sends us traffic

**The rule:** a creator verdict is one person. It is never merged into the
census score, never averaged, and never shown in the same visual language as
a vote count.

**Not done:** claiming the six creator accounts. That needs the tokens in
docs/CREATOR-INVITES.md sent one-to-one. Until a creator claims, their
verdict is a claim we cannot verify, so it does not appear.

## Leg 3: ad slots (built, deliberately constrained)

The weakest leg and the one that costs the most trust, so it is the most
constrained.

**Built:**
- `AdSlot` table: placement, copy, sponsor house, date window, impressions,
  clicks
- `src/domain/ads.ts`: `isSlotEligible` and `isSlotLive`
- `src/server/adSlots.ts`: loads a slot for a page
- The slot renders labeled "Advertisement" with a sponsored outbound link

**The rule, enforced in code at the point a slot is chosen:**

> An ad is suppressed when it promotes a fragrance that the page's own census
> ranking lists, unless that fragrance is the page's subject.

Read that carefully, because the first version of this rule was wrong. It
suppressed a slot whenever the sponsor house appeared anywhere on the page,
which blocked the single most valuable ad product a fragrance house wants:
advertising its own scent on its own scent's page. Armaf should absolutely be
able to buy "Club de Nuit Intense Man, direct from Armaf" on the Club de Nuit
Intense Man page. That is ordinary retail.

What the rule actually protects is the RANKING, not the page. If a page's
census says "Asad is a close copy of Sauvage Elixir", then an ad for Asad
sitting under that list reads as the census endorsing the ad. So:

- A house CAN advertise its own scent on that scent's own page.
- A house CANNOT advertise a scent that the page ranks.
- A generic company ad, which names no scent, is allowed anywhere: it
  cannot be mistaken for a census result.

Verified live: the CDNIM page shows the Armaf ad for CDNIM and the Lattafa ad
for Asad is suppressed; the Asad page shows the Lattafa ad for Asad and the
Armaf ad for CDNIM is suppressed.

**Ad priority**, so the most relevant ad wins rather than the newest one:
the page's own subject scent first, then a generic ad, then anything else
eligible. A house buying a page expects to be seen for the thing that page
is about.

**Why the rule lives in code and not in a policy document:** a rule in a
document is a rule someone breaks under revenue pressure. A rule in the query
is a rule nobody can break by accident.

**Why placement is by page type, never by ranking position:** a slot wedged
between two clones reads as part of the census. "page-bottom" and
"below-fold" cannot.

**The three ad shapes**, all live:

| Shape | Example | Where it runs |
|---|---|---|
| House ad for a scent | Armaf on the CDNIM page | that scent's own page only |
| House ad, no scent named | Lattafa Perfumes | any page |
| Company ad | Scent Census, in your pocket | any page |

**Not done:** selling the first slot. Two demo slots are seeded, one neutral
and one Armaf-sponsor, so the exclusion rule stays tested rather than
theoretical.

## Sequencing, honestly

Right now the site has **zero votes and no traffic**. Two things follow:

1. **The census comes first.** Every revenue leg here monetizes attention
   that only exists if the census is trusted and findable. A page with no
   votes and no prices sends nobody anywhere, so there is nothing to
   monetize yet.
2. **The price coverage is the bottleneck for leg 1.** 34 fragrances are
   priced out of a catalogue where most clone families are larger. Retailer
   feeds have to be added and the capture has to run on a schedule, or the
   "Where to buy" block is empty on most pages and the affiliate links have
   nothing to point at.

## What is deliberately not built

- No "best clone" page that a partner can buy. A ranking a partner pays for
  is not a census.
- No paid placement inside a clone row.
- No synthetic review or creator endorsement that is not disclosed.
- No sold votes, ever, at any price.
- No ad slot on a creator's own page for their own scent (that is the same
  problem as the brand exclusion, one level up).
