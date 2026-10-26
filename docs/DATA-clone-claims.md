# Clone claims: the bottles the census cannot score

The census only knows a pair when people have compared it. A dupe house can
sell a bottle for years and never appear in the catalogue, which means the
product page says nothing about it. Silence reads as "no clone exists", and
that is the wrong answer.

Claims fix that without inventing a score. A claim is a public statement that
a product copies an original, stored with the place we read it and the date.
It never becomes a percentage in the census.

## The number that matters most

The primary number on each row is the **scent family match**: 50% accord cosine
(broad family overlap) plus 50% note Jaccard (material overlap). This is the
closest thing to "how close does this smell" that we can compute from public
data.

It is not a vote. It is not a memory test. It is a materials-and-families
comparison. A seller who copies the note list scores 100% here without proving
the liquids smell alike. The number tells you whether the broad families and
materials overlap, not whether the wearing experience matches.

For Hectic against Imagination: 90% scent family match. The families are
nearly identical. But the owners who have both say "more citrus, less soap,
more energy." The number captures the first. The texture note captures the
second. Neither is the whole truth.

## Three numbers, three questions

| Number | Question | Source | Can it rank a clone? |
| --- | --- | --- | --- |
| Scent family match | Do they share the same materials and scent families? | Public note and accord lists | Yes |
| Voter association | Of the people who compared these two, how many said one reminds them of the other? | Census votes and the smell-alike corpus | Yes |
| Texture note | What do owners notice when they wear both? | Sourced from reviews | No |

Mixing them is the failure mode. The page shows all three on one row, each
labeled, and lets the reader decide which matters.

## The rejected pairs

Some claims carry a fourth fact: the corpus already voted on the pair and the
pair lost. `scripts/ingest-smell-alike.ts` only stores pairs that clear the
agreement floor, so a 35 percent pair has no `InspiredByEdge` row. Treating that
as "never compared" would hide a measured rejection, which is the opposite of
the point.

The claim keeps the raw counts in `measuredUp` and `measuredDown`. The row prints
the vote share and the words "below the census floor". It never prints a vote
share and a note match on the same row: the vote is the stronger evidence, and
showing both invites the reader to average two different units.

This is how the market's second and fourth favourite Imagination clones appear
on the page with 36 percent and 34 percent, rather than disappearing because
they failed a floor.

## Why note match exists

A product with no votes still has a public note list. Comparing it to the
original's list answers a narrow, checkable question: did this seller build the
bottle from the same materials? It also fails loudly in useful places.

- Montagne Imaginary publishes all ten of Imagination's notes. Note match 100.
- ALT Reality publishes eight, drops black tea and guaiac wood, adds musk. Note
  match 82.
- French Avenue Essence de Blanc publishes mint, petitgrain and marine notes.
  Note match 34, while the community votes it at 90% on another page.

That last row is the point. A low note match does not mean a bad clone. It means
the published material list is different, and the reader should look at both.

### The formula

```
recall    = sum(weight of shared notes) / sum(weight of all original notes)
precision = shared notes / claim notes
noteMatch = floor(100 * harmonic mean(recall, precision))
```

Weights come from the original's community votes, with a floor of 1 so a note
nobody voted still counts as listed. Notes are canonicalized first: origin
adjectives are dropped (`Calabrian bergamot` becomes `bergamot`), and a short
alias table folds `frankincense` into `olibanum`, `ambrox` into `ambroxan`, and
`black tea` into `tea`. The canonicalizer lives in
`src/domain/cloneClaims.ts` and is covered by
`tests/unit/cloneClaims.test.ts`.

The harmonic mean matters. Recall alone rewards a seller who lists the whole
pyramid plus twenty invented notes. Precision alone punishes a seller who lists
only the four notes that matter. The score floors instead of rounds, so a
product missing one note cannot show 100.

## The dataset

One JSON file per original, in `data/clones/`. The filename is the slug.

```jsonc
{
  "target": { "brand": "Louis Vuitton", "name": "Imagination", "catalogueSourcePid": 67370 },
  "updated": "2026-10-22",
  "claims": [
    {
      "productName": "Imaginary",
      "houseName": "Montagne Parfums",
      "claimType": "HOUSE_DECLARED",
      "sourceLabel": "Montagne Parfums product page, \"Inspired by Louis Vuitton Imagination\"",
      "sourceUrl": "https://www.montagneparfums.com/fragrance/imaginary-...",
      "verifiedOn": "2026-10-22",
      "notes": ["Citron", "Calabrian Bergamot", "Sicilian Orange"],
      "priceCents": 5000,
      "sizeMl": 50,
      "currency": "USD"
    }
  ]
}
```

`claimType` is one of:

- `HOUSE_DECLARED`: the seller says "inspired by" on its own listing. Strongest.
- `COMMUNITY_LIST`: a forum thread or subreddit names the product. No seller claim.
- `EDITORIAL`: a blog or video names it.

### Sourcing rules

1. Read the page. Do not infer a note list from a review or a search snippet.
2. Record the URL you actually opened and the date you opened it.
3. Prices are the cheapest size the seller sells, in the seller's currency, with
   the size attached. No eBay, no third-party marketplace listings.
4. Leave `notes` empty when the seller does not publish a pyramid. The ingester
   falls back to the catalogue pyramid if the product is in our data.
5. Never put a similarity percentage in `claimedSimilarity` unless the source
   states it. It is quoted, never parsed.

## Ingest

```sh
npx tsx --env-file=.env scripts/ingest-clone-claims.ts data/clones/louis-vuitton-imagination.json
npx tsx --env-file=.env scripts/ingest-clone-claims.ts data/clones/louis-vuitton-imagination.json --dry-run
```

The script resolves the target by `catalogueSourcePid`, then tries to resolve
each claim to a catalogue fragrance by house and product name. It also scans the
corpus snapshot once for the target id, which recovers the raw vote counts for
pairs the graph dropped for being below the floor. Override the snapshot path
with `--corpus=/path/to/perfumes.jsonl`; the default is
`data/kaggle-fragrantica/ledecanteur/perfumes.jsonl`, about five seconds for the
530MB file.

Resolution sets the row's status:

- `MEASURED`: an `InspiredByEdge` exists for the pair.
- `UNMEASURED`: the product is in the catalogue, with no passing edge.
- `OUTSIDE_CATALOGUE`: we do not carry the product at all.

`measuredUp` and `measuredDown` are set independently of that status, so an
`UNMEASURED` row can still show a real vote share.

Upserts are keyed on `(targetId, houseName, productName)`, so rerunning is safe
and editing a price updates the row instead of adding a duplicate.

## Adding the next original

1. Find the target's `catalogueSourcePid` in the `Fragrance` table.
2. Collect claims from three places: dupe house product pages that name the
   original, the Fragrantica club threads, and the ranking videos that list
   products by name. Skip any list that does not name products you can find.
3. Write `data/clones/<name>.json` with the rules above.
4. Run the ingester and check the dry run line by line. A note match of 0 usually
   means a house or product did not resolve, not that the clone is bad.
5. Deploy. The page reads claims at request time, so no revalidation is needed
   for product pages.

## Rendering

`src/server/cloneClaims.ts` loads claims for one target and sorts them: pairs
with votes first, highest share first, then unscored rows by note match, then
cheapest. The page hides any claim whose product is already in the census, and
the section only renders when at least one claim is left.

Each row shows the product, the house and how the claim was made ("the maker says
so", "named by the community", "named by a blog"), the strongest evidence
available (vote share or note match), the price with its size, and a link to the
source. Products in the catalogue link to their own page. Products outside it get
a ghost bottle, because we have no photo to show and a stock image would be a
lie.

## What this does not do

- It does not rank claims against measured clones. There is no shared unit.
- It does not let a below-floor pair into the ranked census. The claim carries
  the vote share for display; `InspiredByEdge` still holds only pairs that clear
  the floor.
- It does not count as a census vote. First-party votes still start at zero.
- It does not prove a product smells like the original. It proves the seller
  publishes a similar material list, which is a claim about marketing.
- It does not cover products whose seller publishes nothing and that no
  community list names. Those stay invisible until someone votes on them.
