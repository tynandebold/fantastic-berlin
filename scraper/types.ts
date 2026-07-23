// Shared types for the scraper and the static site.

// Floor normalized to a sortable number while keeping the original text.
// value: EG/ground = 0, "3. OG" = 3, UG/Souterrain = -1, unknown = null.
// isTop: attic / Dachgeschoss / top-floor, which the user rates highest.
export type Floor = {
  raw: string;
  value: number | null;
  isTop: boolean;
};

export type Listing = {
  id: string; // slug from the detail URL, e.g. "suarezstrasse-12"
  url: string;
  title: string;
  status: string; // "For Sale" | "Coming Soon" (Sold/Reserved are filtered out)
  neighborhood: string | null; // Berlin district
  price: number | null; // EUR
  rooms: number | null;
  sizeSqm: number | null;
  floor: Floor;
  pricePerSqm: number | null; // computed from price / sizeSqm
  imageUrl: string | null; // one representative image (Cloudinary CDN)
  firstSeen: string; // ISO date, carried forward across runs
  lastSeen: string; // ISO date of the run that last saw it
  previousPrice: number | null; // price at the previous run, for drop detection
};

// The full file written to data/listings.json and read by the site.
export type ListingsFile = {
  generatedAt: string; // ISO timestamp of the run
  count: number;
  listings: Listing[];
};
