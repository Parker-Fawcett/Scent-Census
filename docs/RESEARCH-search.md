# Catalogue search

The rule the search follows: **you should not have to type a name exactly.**
Nobody types a name exactly. The catalogue holds 140,228 fragrances and
8,274 houses, and a visitor looking for Turathi Blue types "turathi" or
"turathi blue" or "turathi blu", and a visitor looking for Lattafa types
"lattfa" because their thumbs are faster than their spelling.

## What was wrong

The old search did three things badly:

1. **It was exact.** Candidates came from a case-insensitive substring
   match and every query word had to land somewhere in the name or the
   house name. A typo found nothing. Typing "lattfa" returned an empty
   catalogue page that told you it was probably a misspelling.
2. **It was blind to a popular scent.** The candidate set was an unordered
   `LIMIT 500` slice of the table, then the ranking ran over whatever the
   database happened to return. "turathi blue" was buried under every
   fragrance with "blue" in the name, and the right answer was often not in
   the 500 rows at all.
3. **It was a client fetch.** The page rendered an empty result set, asked
   the browser for the data, and raced. The empty state could show before
   the results arrived.

## How it works now

`src/server/catalogueSearch.ts`. Two parts: a SQL candidate pass, and a
ranking that happens in TypeScript.

### The candidate pass

One query, one round trip. Three CTEs:

- `house_hits` — the houses that match, including a word level pass so a
  typo in a house name still lands.
- `frag_hits` — the fragrances that match, with their clone counts joined
  in.
- `house_frags` — the fragrances of any house that matched, so typing a
  house name brings up that house's catalogue.

Two things make it fast, and both are about using the index:

```sql
lower(f.name) LIKE ANY ($1::text[])   -- prefix, index scan
lower(f.name) % $2                     -- trigram, index scan
```

`lower(f.name) % $2` is an index scan that takes five milliseconds.
`f.name % $2` is a sequential scan over 140,000 rows that takes two
hundred. The trigram index is on `lower(name)`, so the expression has to
match the indexed expression exactly. That one word of difference was
most of the latency.

### The ranking

`rankCandidates` is a pure function, no database in it, so it is unit
tested. The order of the tests IS the ranking:

| Kind | What it means |
|---|---|
| `exact-name` | the name is the query |
| `name-prefix` | the name starts with the query |
| `word-prefix` | a word of the name starts with a word of the query |
| `house-exact` | the house name is the query |
| `house-prefix` | the house name starts with the query |
| `name-contains` | the name contains the query |
| `house-match` | the house matched loosely |
| `close-spelling` | every word landed, but only approximately |

Two measures decide "approximately": trigram similarity, and edit distance.
They are both needed. Trigram similarity punishes short words: "clb"
against "club" scores 0.375, which is below any sensible threshold, even
though dropping one letter is exactly the typo people make. Edit distance
catches the dropped, doubled and swapped letter. Together they catch the
typos that actually happen.

The rule that every query word has to land somewhere comes first, before
any ranking. A word that lands nowhere means the candidate is not a match
at all. Without that rule "sauvage nonexistent" matched "Sauvage", because
the word-prefix test returned on the first word and never looked at the
second.

### What it does now

| Query | Before | After |
|---|---|---|
| `lattafa` | 20 results, ranked arbitrarily | the Lattafa catalogue |
| `lattfa` | nothing | the Lattafa catalogue |
| `avntus` | nothing | Aventus, with its 131 clones |
| `turathi blue` | buried under every "blue" | Turathi Blue, first |
| `clb de nut` | nothing | Club de Nuit Intense Man |
| `creed` | 20 of thousands | the Creed catalogue |

## The photos

Search results are a gallery of specimen plates, not a list of names. A
bottle you can see is a bottle you can find, which is the whole point of a
catalogue of things people recognise by sight rather than by name. Sixty
results, six across, each one a plate with the catalogue photo multiplied
onto it so the white studio background becomes the plate colour.

The clone count sits under each one in the accent colour, because that is
the number worth scanning for. It is the reason to search a catalogue of
clones rather than a catalogue of perfumes.

## Performance

| | Before | After |
|---|---|---|
| Search query | 850-2140ms | 450-770ms |
| Round trips | 1 client fetch after a full page render | 1, server side |
| Results rendered | 20, no photos | 60, with photos |

Neon is a remote database and a trivial query costs about 70ms end to end,
so the round trip count is the budget, not the query complexity.

## The bench

`scripts/test-search.ts` runs a set of queries against the real catalogue
and prints the hits and the timing. Run it after touching the search:

```
npx tsx --env-file=.env scripts/test-search.ts
```

`tests/unit/catalogueSearch.test.ts` is the contract. It covers the exact
match, the prefix, the typo in a name, the typo in a house name, the typo
in a multi-word name, the accents, and the rule that a word which lands
nowhere kills the match.

## The migration

`prisma/migrations/20261021120000_fuzzy_search` enables `pg_trgm` and adds
the two GIN indexes on `lower(name)`.

One note for whoever runs `prisma migrate deploy` next: the ledger had a
failed entry, `20261019000000_accords_and_any_position`, which was
blocking every deploy. Its effects were both present in the database (the
`accords` column with the right type and default, and `ANY` in the
`NotePosition` enum), so it was marked as applied with `prisma migrate
resolve --applied` rather than re-run.
