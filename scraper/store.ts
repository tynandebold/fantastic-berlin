// Shared persistence for the combined listings file. Both scrapers (Fantastic
// Frank and next-estate) write into one data/listings.json, but each run only
// rebuilds its OWN source's rows and keeps the other source's rows verbatim.
// Rows are partitioned by URL host, so this works even on a file written before
// the `source` field existed.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { isNonBerlin } from "./parse.js";
import type { Listing, ListingsFile, Source } from "./types.js";

// Floor first (the whole point): isTop, then higher number, then unknowns last.
export function sortListings(list: Listing[]): Listing[] {
  const rank = (l: Listing) => (l.floor.isTop ? 1000 + (l.floor.value ?? 0) : l.floor.value ?? -1000);

  return [...list].sort((a, b) => rank(b) - rank(a));
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function loadListings(outPath: string): Listing[] {
  try {
    const parsed = JSON.parse(readFileSync(outPath, "utf8")) as ListingsFile;

    return parsed.listings ?? [];
  } catch {
    return [];
  }
}

// Previous run's rows keyed by URL, for carrying firstSeen forward and detecting
// price drops. URLs are unique across sources (different hosts), so a single map
// serves both scrapers without collisions.
export function loadPreviousByUrl(outPath: string): Map<string, Listing> {
  return new Map(loadListings(outPath).map((l) => [l.url, l]));
}

export type MergeArgs = {
  source: Source;
  host: string; // this source's URL host, e.g. "www.next-estate.de"
  fresh: Listing[]; // this run's listings for this source (firstSeen already set)
  outPath: string;
};

// Merge this run's `fresh` rows for one source into the shared file, keeping the
// other source's rows untouched, then sort and write.
export function mergeAndWrite({ source, host, fresh, outPath }: MergeArgs): {
  total: number;
  mine: number;
  others: number;
} {
  const existing = loadListings(outPath);
  const others = existing.filter((l) => hostOf(l.url) !== host);
  const minePrevCount = existing.length - others.length;

  // Guards scoped to THIS source, so a healthy other source can neither mask nor
  // be masked by a broken run here.
  if (fresh.length === 0) {
    throw new Error(`[${source}] scraped 0 listings — aborting (file left unchanged)`);
  }

  if (minePrevCount > 0 && fresh.length < minePrevCount * 0.5) {
    throw new Error(
      `[${source}] count dropped from ${minePrevCount} to ${fresh.length} (>50%) — aborting as suspicious`,
    );
  }

  // Berlin-only invariant, enforced at the single write point so both sources
  // (and any already-persisted rows) stay in Berlin.
  const listings = sortListings([...others, ...fresh].filter((l) => !isNonBerlin(l.neighborhood)));

  const out: ListingsFile = {
    generatedAt: new Date().toISOString(),
    count: listings.length,
    listings,
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(out, null, 2));

  return { total: listings.length, mine: fresh.length, others: others.length };
}
