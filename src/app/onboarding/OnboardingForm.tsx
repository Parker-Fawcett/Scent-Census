"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { saveOnboardingAction } from "@/app/actions";
import { BUDGET_BANDS, CLONE_BANDS, FALLBACK_ACCORDS } from "@/domain/onboarding";

const LABELS = {
  ["<50"]: "Under $50",
  ["50-150"]: "$50 to $150",
  ["150-400"]: "$150 to $400",
  ["no-ceiling"]: "No ceiling",
  ["yes-happily"]: "Yes, if it smells close",
  ["original-only"]: "Originals only",
  ["only-the-good-ones"]: "Only if it's very close",
} as const;

function label(key: string): string {
  return key in LABELS ? LABELS[key as keyof typeof LABELS] : key;
}

interface Hit {
  id: string;
  name: string;
  house: string;
  year: number | null;
  cloneCount: number;
}

/**
 * Name a bottle you own, forgivingly.
 *
 * The census reasons from bottles: "Like Tobacco & Vanilla, which you own"
 * only fires when there is a bottle to name. Setup asks for one, and the
 * search behind it is the same forgiving search as the masthead, so a
 * misspelling still finds the bottle.
 */
function BottlePicker({ initial }: { initial: Hit | null }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [chosen, setChosen] = useState<Hit | null>(initial);
  const seq = useRef(0);

  useEffect(() => {
    if (chosen !== null) return;
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    const my = ++seq.current;
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=6`);
        const data: { hits?: Hit[] } = await res.json();
        if (my === seq.current) {
          setHits(Array.isArray(data.hits) ? data.hits : []);
        }
      } catch {
        if (my === seq.current) setHits([]);
      } finally {
        if (my === seq.current) setSearching(false);
      }
    }, 220);
    return () => {
      clearTimeout(handle);
    };
  }, [query, chosen]);

  if (chosen !== null) {
    return (
      <div className="bottle-picked">
        <p className="bottle-picked-name">
          {chosen.name}
          <span className="bottle-picked-meta">
            {chosen.house}
            {chosen.year !== null ? ` · ${chosen.year}` : ""}
          </span>
        </p>
        <input type="hidden" name="lovedFragranceId" value={chosen.id} />
        <button
          type="button"
          className="textlink"
          onClick={() => {
            setChosen(null);
            setQuery("");
          }}
        >
          Pick another
        </button>
      </div>
    );
  }

  return (
    <div className="bottle-search">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="e.g. sauvage, aventus, lattafa"
        aria-label="Search a bottle you own"
        autoComplete="off"
      />
      {searching ? (
        <p className="fine" aria-live="polite">
          Searching…
        </p>
      ) : null}
      {hits.length > 0 ? (
        <ul className="bottle-hits" aria-live="polite">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                className="bottle-hit"
                onClick={() => {
                  setChosen(hit);
                  setHits([]);
                }}
              >
                <span className="bottle-hit-name">{hit.name}</span>
                <span className="bottle-hit-meta">
                  {hit.house}
                  {hit.year !== null ? ` · ${hit.year}` : ""}
                  {hit.cloneCount > 0 ? ` · ${hit.cloneCount} clones` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {!searching && query.trim().length >= 2 && hits.length === 0 ? (
        <p className="fine">
          Nothing matched. Spelling is forgiven, so try fewer letters.
        </p>
      ) : null}
    </div>
  );
}

export default function OnboardingForm({
  current,
}: {
  current:
    | {
        budgetBand: string | null;
        cloneBand: string | null;
        accordPrefs: string[];
        loved: Hit | null;
      }
    | null;
}) {
  const checked = (value: string, current: string | null): boolean => current === value;
  const accordChecked = (value: string): boolean => current?.accordPrefs.includes(value) ?? false;
  const [error, onSave] = useActionState(
    async (_prev: string | null, formData: FormData) => saveOnboardingAction(formData),
    null,
  );

  return (
    <form action={onSave}>
      <fieldset className="form-group">
        <legend className="form-legend">
          Start with a bottle you own
          <span className="hint">
            The census compares a bottle to its closest clones. Name the one you
            wear, misspellings welcome.
          </span>
        </legend>
        <BottlePicker initial={current?.loved ?? null} />
      </fieldset>

      <fieldset className="form-group">
        <legend className="form-legend">
          Which families do you reach for
          <span className="hint">
            Pick up to three. These are the census&apos;s own accord names, the
            ones the family pages are built from.
          </span>
        </legend>
        <div className="form-chips">
          {FALLBACK_ACCORDS.map((accord) => (
            <label key={accord} className="form-chip">
              <input
                type="checkbox"
                name="accordPrefs"
                value={accord}
                defaultChecked={accordChecked(accord)}
              />
              <span>{accord}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="form-group">
        <legend className="form-legend">
          Would you wear a clone
          <span className="hint">
            The census ranks closeness first and shows the price next. This only
            sets how far toward the clone side to aim.
          </span>
        </legend>
        <ul className="form-options">
          {CLONE_BANDS.map((band) => (
            <li key={band}>
              <label className="form-option">
                <input
                  type="radio"
                  name="cloneBand"
                  value={band}
                  defaultChecked={checked(band, current?.cloneBand ?? null)}
                />
                <span className="form-option-text">{label(band)}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="form-group">
        <legend className="form-legend">
          What will you pay for a bottle
          <span className="hint">
            It tilts the ranking toward what you will actually pay. A much closer
            match still wins.
          </span>
        </legend>
        <ul className="form-options">
          {BUDGET_BANDS.map((band) => (
            <li key={band}>
              <label className="form-option">
                <input
                  type="radio"
                  name="budgetBand"
                  value={band}
                  defaultChecked={checked(band, current?.budgetBand ?? null)}
                />
                <span className="form-option-text">{label(band)}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn" style={{ marginTop: "2rem" }}>
        Save and see your picks
      </button>
    </form>
  );
}
