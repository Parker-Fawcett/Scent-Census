// Item add form validation (PRD section 7.2). Forgiving about WHICH optional
// field you skip, strict about the value when you enter one: an entered price
// is whole dollars turned into integer cents, an entered date is a real date,
// and a size is one the worth pipeline can price (30/50/100) or the explicit
// "other" escape value of 0. Fragrance existence is not validated here; that
// is a foreign key, proven at insert time.

export const KNOWN_SIZES = [30, 50, 100] as const;
type KnownSize = (typeof KNOWN_SIZES)[number];

export interface RawAddItem {
  fragranceId?: string | null;
  sizeMl?: number | null;
  pricePaidDollars?: string | number | null;
  purchasedOn?: string | null;
  sealed?: boolean | null;
}

export interface ParsedAddItem {
  fragranceId: string;
  sizeMl: number | null;
  pricePaidCents: number | null;
  purchasedOn: Date | null;
  sealed: boolean;
}

export function validateAddItem(raw: RawAddItem): ParsedAddItem {
  const fragranceId = (raw.fragranceId ?? "").trim();
  if (fragranceId === "") {
    throw new Error("add item: a fragrance id is required");
  }
  let sizeMl: number | null = null;
  if (raw.sizeMl !== undefined && raw.sizeMl !== null) {
    const size = raw.sizeMl;
    if (size === 0) {
      sizeMl = null; // "other" bottle: honest unknown rather than a fake 30ml
    } else if ((KNOWN_SIZES as readonly number[]).includes(size)) {
      sizeMl = size as KnownSize;
    } else {
      throw new Error(`add item: size must be 30, 50, 100 or the "other" escape 0 (got ${raw.sizeMl})`);
    }
  }
  let pricePaidCents: number | null = null;
  const priceRaw = raw.pricePaidDollars;
  if (priceRaw !== undefined && priceRaw !== null && String(priceRaw).trim() !== "") {
    if (typeof priceRaw === "number" && !Number.isFinite(priceRaw)) {
      throw new Error(`add item: price paid must be a dollar amount (got "${priceRaw}")`);
    }
    const parsed = Number(String(priceRaw));
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error(`add item: price paid must be a dollar amount (got "${priceRaw}")`);
    }
    const cents = Math.round(parsed * 100);
    // the column is Postgres int4 (max 2,147,483,647 cents); an overflow must
    // fail here as a form error, not at insert as a cryptic Prisma error
    if (cents > 2_147_483_647) {
      throw new Error(`add item: price paid is too large (got "${priceRaw}")`);
    }
    pricePaidCents = cents;
  }
  let purchasedOn: Date | null = null;
  const dateRaw = raw.purchasedOn;
  if (dateRaw !== undefined && dateRaw !== null && String(dateRaw).trim() !== "") {
    const parsedDate = new Date(String(dateRaw));
    if (Number.isNaN(parsedDate.getTime())) {
      throw new Error(`add item: purchase date is not a date (got "${dateRaw}")`);
    }
    purchasedOn = parsedDate;
  }
  return {
    fragranceId,
    sizeMl,
    pricePaidCents,
    purchasedOn,
    sealed: raw.sealed === true,
  };
}
