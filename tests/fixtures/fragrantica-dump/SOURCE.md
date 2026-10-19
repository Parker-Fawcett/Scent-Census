# Fragrantica corpus snapshot fixtures (free path, replaces paid FragDB for M6)

Source: Kaggle dataset "Fragrantica Perfumes: Ratings, Notes, Votes & More"
by ledecanteur (https://www.kaggle.com/datasets/ledecanteur/fragrantica-perfumes),
`perfumes.jsonl`, one JSON object per perfume. Downloaded 2026-10-19
(direct download URL from the dataset's croissant metadata, no account
needed). The corpus is a scrape of www.fragrantica.com; see SCHEMA.md in the
dataset (fields documented there: accords `[name, strength 0..100]`, notes
tiered top/middle/base with weight 0..100, year nullable, perfumers,
`similar.reminds_me_of` with up/down votes).

Why this file: the agreed付费 path (FragDB $200) was overridden by decision
(2026-10-19, free path): this public snapshot covers every house in the seed
list (Lattafa, Rasasi, Afnan, Armaf, PdM, Dior, Chanel, YSL, Arabiyat
Prestige, Mykonos, Velixir, Paris Corner, Fragrance World, Xerjoff). The
driver consequences, documented here: notes/accords carry COMMUNITY vote
strengths (weights mean "these are the notes members actually smelled"), no
clone (inspired_by) edges exist in the data (curation later; the
`reminds_me_of` carousel with vote counts is a candidate signal, recorded for
future research), and provenance is a point-in-time snapshot (meta.scraped_at
per record), NOT a maintained feed.

sample-records.jsonl: thirteen REAL records, one per target house (Aventus is
absent on purpose; we take a lesser-known row per house to avoid fixtures
that double as marketing). Full file stays in gitignored `data/`; these rows
are committed as the ingest contract fixtures. Mapper tests run against these
real shapes, so the parsers are proven against reality, not invented rows.

Provenance note for the app's honesty rules: catalog facts (names, years,
notes, accords) come from a community dataset; the app should say "community
notes" where it displays them. Nothing here is invented by Scent Census.
