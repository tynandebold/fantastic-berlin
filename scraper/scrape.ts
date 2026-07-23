// Orchestrator: for-sale index -> active URLs -> each detail page -> parse ->
// filter out Sold/Reserved -> merge with the previous run -> write listings.json.
// Run: npm run scrape   (FF_LIMIT=5 to sample, HEADLESS=1 to try headless)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { launchSession, gotoCleared } from "./browser.js";
import { extractActiveUrls, extractDetail, type RawDetail } from "./extract.js";
import { fetchSitemap, parseBerlinProperties } from "./sitemap.js";
import {
  parsePrice,
  parseSize,
  parseRooms,
  parseFloor,
  parseNeighborhood,
  pricePerSqm,
  slugFromUrl,
} from "./parse.js";
import type { Listing, ListingsFile } from "./types.js";

const INDEX_URL = "https://www.fantasticfrank.com/en/berlin/for-sale/";
const OUT_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../data/listings.json");

// Statuses the user does not want to see.
const EXCLUDED = new Set(["sold", "reserved"]);

function normalizeStatus(raw: string | undefined): string {
  const s = (raw ?? "").toLowerCase();

  if (s.includes("for sale")) {
    return "For Sale";
  }

  if (s.includes("coming soon")) {
    return "Coming Soon";
  }

  if (s.includes("reserved")) {
    return "Reserved";
  }

  if (s.includes("sold")) {
    return "Sold";
  }

  return raw?.trim() || "Unknown";
}

// document.title is "Street, District – 173 m² | Status | Fantastic Frank".
// Keep "Street, District", drop the size suffix and the trailing segments.
function cleanTitle(title: string, slug: string): string {
  const firstSegment = title.split("|")[0] ?? title;
  const withoutSize = firstSegment.replace(/[–-]\s*\d[\d.,]*\s*m².*$/i, "").trim();

  return withoutSize || slug;
}

function toListing(
  url: string,
  raw: RawDetail,
  imageFallback: string | null,
  prev: Listing | undefined,
  today: string,
): Listing {
  const facts = raw.facts;
  const slug = slugFromUrl(url);

  const status = normalizeStatus(facts["Status"] ?? raw.title);
  const price = parsePrice(facts["Price"]);
  const sizeSqm = parseSize(facts["Size"]);
  const rooms = parseRooms(facts["Rooms"]);
  const floor = parseFloor(facts["Floor"]);
  const neighborhood = facts["Area"]?.trim() || parseNeighborhood(raw.title, slug);
  const title = cleanTitle(raw.title, slug);
  const imageUrl = raw.ogImage ?? imageFallback;

  return {
    id: slug,
    url,
    title,
    status,
    neighborhood: neighborhood || null,
    price,
    rooms,
    sizeSqm,
    floor,
    pricePerSqm: pricePerSqm(price, sizeSqm),
    imageUrl,
    firstSeen: prev?.firstSeen ?? today,
    lastSeen: today,
    previousPrice: prev?.price ?? null,
  };
}

// Floor first (the whole point): isTop, then higher number, then unknowns last.
function sortListings(list: Listing[]): Listing[] {
  const rank = (l: Listing) => (l.floor.isTop ? 1000 + (l.floor.value ?? 0) : l.floor.value ?? -1000);

  return [...list].sort((a, b) => rank(b) - rank(a));
}

function loadPrevious(): Map<string, Listing> {
  try {
    const parsed = JSON.parse(readFileSync(OUT_PATH, "utf8")) as ListingsFile;

    return new Map(parsed.listings.map((l) => [l.url, l]));
  } catch {
    return new Map();
  }
}

async function main() {
  const limit = process.env.FF_LIMIT ? Number(process.env.FF_LIMIT) : Infinity;
  const today = new Date().toISOString().slice(0, 10);
  const previous = loadPrevious();

  // Sitemap gives a url -> image fallback (open, no checkpoint).
  const imageByUrl = new Map<string, string | null>();

  try {
    const entries = parseBerlinProperties(await fetchSitemap());

    for (const e of entries) {
      imageByUrl.set(e.url, e.imageUrl);
    }

    console.log(`[scrape] sitemap: ${entries.length} Berlin properties`);
  } catch (err) {
    console.warn(`[scrape] sitemap fetch failed (continuing): ${(err as Error).message}`);
  }

  const session = await launchSession();
  const page = await session.context.newPage();

  const kept: Listing[] = [];
  let excludedCount = 0;

  try {
    console.log(`[scrape] index: ${INDEX_URL}`);
    await gotoCleared(page, INDEX_URL);
    await page.waitForTimeout(3000);
    await page.mouse.wheel(0, 8000);
    await page.waitForTimeout(1500);

    const urls = (await extractActiveUrls(page)).slice(0, limit);

    console.log(`[scrape] ${urls.length} active listings to visit`);

    for (const [i, url] of urls.entries()) {
      try {
        await gotoCleared(page, url);
        await page.waitForTimeout(500);

        const raw = await extractDetail(page);
        const listing = toListing(url, raw, imageByUrl.get(url) ?? null, previous.get(url), today);

        if (EXCLUDED.has(listing.status.toLowerCase())) {
          excludedCount++;
          console.log(`  [${i + 1}/${urls.length}] skip (${listing.status}) ${listing.id}`);
        } else {
          kept.push(listing);
          console.log(
            `  [${i + 1}/${urls.length}] ${listing.id} — floor=${listing.floor.raw || "?"} ` +
              `€${listing.price ?? "?"} ${listing.sizeSqm ?? "?"}m² [${listing.status}]`,
          );
        }
      } catch (err) {
        console.warn(`  [${i + 1}/${urls.length}] FAILED ${url}: ${(err as Error).message}`);
      }

      // Politeness delay between detail pages.
      await page.waitForTimeout(1500);
    }
  } finally {
    await session.close();
  }

  // Sanity guards: fail loudly rather than publish a broken/empty site.
  if (kept.length === 0) {
    throw new Error("scraped 0 listings — aborting (site left unchanged)");
  }

  if (previous.size > 0 && kept.length < previous.size * 0.5) {
    throw new Error(
      `listing count dropped from ${previous.size} to ${kept.length} (>50%) — aborting as suspicious`,
    );
  }

  const out: ListingsFile = {
    generatedAt: new Date().toISOString(),
    count: kept.length,
    listings: sortListings(kept),
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));

  console.log(
    `[scrape] wrote ${kept.length} listings (${excludedCount} excluded) to ${OUT_PATH}`,
  );
}

main().catch((err) => {
  console.error("[scrape] FATAL:", err.message);
  process.exit(1);
});
