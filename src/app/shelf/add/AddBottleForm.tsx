"use client";

import { useActionState } from "react";
import { addBottleAction } from "./addBottleAction";
import type { CatalogueHit } from "@/server/catalogueSearch";

// Two forms, no client fetch: the GET form searches this same page
// (server-rendered results), and the POST form holds the picked bottle plus
// the bottle details. Progressive enhancement by construction.

export default function AddBottleForm({
  query,
  hits,
}: {
  query: string;
  hits: CatalogueHit[];
}) {
  const [error, onAdd] = useActionState(
    async (_prev: string | null, formData: FormData) => addBottleAction(formData),
    null,
  );
  const searching = query !== "";

  return (
    <>
      <form action="/shelf/add" method="GET">
        <label className="form-field">
          <span className="form-field-label">Find a fragrance</span>
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="e.g. sauvage"
          />
        </label>
        <button type="submit" className="btn" style={{ marginTop: "1.25rem" }}>
          Search
        </button>
      </form>

      {searching ? (
        <>
          <h2>{hits.length} results</h2>
          {hits.length === 0 ? (
            <p>
              Nothing in the catalogue yet. The catalogue opens public requests
              at launch.
            </p>
          ) : (
            <form action={onAdd}>
              <ul style={{ listStyle: "none", padding: 0 }}>
                {hits.map((hit) => (
                  <li key={hit.id} style={{ padding: "0.5rem 0" }}>
                    <label>
                      <input
                        type="radio"
                        name="fragranceId"
                        value={hit.id}
                        required
                      />{" "}
                      <strong>{hit.name}</strong> ({hit.house}
                      {hit.year !== null ? `, ${hit.year}` : ""})
                    </label>
                  </li>
                ))}
              </ul>
              <fieldset>
                <legend>Bottle size</legend>
                <label>
                  <input type="radio" name="sizeMl" value={30} /> 30ml
                </label>
                <label>
                  <input type="radio" name="sizeMl" value={50} /> 50ml
                </label>
                <label>
                  <input type="radio" name="sizeMl" value={100} /> 100ml
                </label>
                <label>
                  <input type="radio" name="sizeMl" value={0} defaultChecked /> Other /
                  not sure
                </label>
              </fieldset>
              <label>
                Price you paid (dollars, optional)
                <input
                  name="pricePaidDollars"
                  inputMode="decimal"
                  placeholder="89.50"
                />
              </label>
              <label>
                Date you got it (optional)
                <input name="purchasedOn" type="date" />
              </label>
              <label>
                <input name="sealed" type="checkbox" /> Still sealed
              </label>
              {error ? <p role="alert">{error}</p> : null}
              <button type="submit" className="btn" style={{ marginTop: "0.75rem" }}>Add to shelf</button>
            </form>
          )}
        </>
      ) : (
        <p className="sub">Nothing in the catalogue matched that. Try the house name instead.</p>
      )}
    </>
  );
}
