"use client";

import { useActionState } from "react";
import { saveOnboardingAction } from "@/app/actions";
import { BUDGET_BANDS, CLONE_BANDS, FALLBACK_ACCORDS } from "@/domain/onboarding";

const LABELS = {
  ["<50"]: "Under $50",
  ["50-150"]: "$50 to $150",
  ["150-400"]: "$150 to $400",
  ["no-ceiling"]: "No ceiling",
  ["yes-happily"]: "Yes, happily",
  ["original-only"]: "No, original only",
  ["only-the-good-ones"]: "Only the good ones",
} as const;

function label(key: string): string {
  return key in LABELS ? LABELS[key as keyof typeof LABELS] : key;
}

export default function OnboardingForm({
  current,
}: {
  current: { budgetBand: string | null; cloneBand: string | null; accordPrefs: string[] } | null;
}) {
  const checked = (value: string, current: string | null): boolean => current === value;
  const accordChecked = (value: string): boolean => current?.accordPrefs.includes(value) ?? false;
  const [error, onSave] = useActionState(
    async (_prev: string | null, formData: FormData) => saveOnboardingAction(formData),
    null,
  );

  return (
    <form action={onSave}>
      <fieldset>
        <legend>Bottle budget</legend>
        {BUDGET_BANDS.map((band) => (
          <label key={band} style={{ display: "block" }}>
            <input type="radio" name="budgetBand" value={band} defaultChecked={checked(band, current?.budgetBand ?? null)} />
            {label(band)}
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Do you buy clones</legend>
        {CLONE_BANDS.map((band) => (
          <label key={band} style={{ display: "block" }}>
            <input type="radio" name="cloneBand" value={band} defaultChecked={checked(band, current?.cloneBand ?? null)} />
            {label(band)}
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Pick 1 to 3 accords</legend>
        {FALLBACK_ACCORDS.map((accord) => (
          <label key={accord} style={{ display: "inline-block", marginRight: "0.75rem" }}>
            <input type="checkbox" name="accordPrefs" value={accord} defaultChecked={accordChecked(accord)} />
            {accord}
          </label>
        ))}
      </fieldset>

      {error ? <p role="alert">{error}</p> : null}
      <button type="submit">Save and see your shelf</button>
    </form>
  );
}
