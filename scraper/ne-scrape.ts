// next-estate.de scraper. Plain fetch + HTML parse — the site is a server-
// rendered WordPress site with no bot challenge, so no browser is needed. Reads
// the /en/buy/ index for the whole catalog (which already carries price, rooms,
// size, district and an image), then fetches each detail page only for its
// "Floor Level", and merges into the shared data/listings.json.
// Run: npm run scrape:ne   (NE_LIMIT=5 to sample)

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { parseIndexCards, parseDetailFacts, type IndexCard } from "./ne-extract.js";
import { parseFloor, pricePerSqm } from "./parse.js";
import { loadPreviousByUrl, mergeAndWrite } from "./store.js";
import type { Listing } from "./types.js";

const INDEX_URL = "https://www.next-estate.de/en/buy/";
const HOST = "www.next-estate.de";
const OUT_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../data/listings.json");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchHtml(url: string, attempts = 3): Promise<string> {
  let lastErr: unknown;

  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": UA, "accept-language": "en" },
        redirect: "follow",
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      return await res.text();
    } catch (err) {
      lastErr = err;
      await sleep(1000 * i);
    }
  }

  throw new Error(`fetch failed for ${url}: ${(lastErr as Error)?.message}`);
}

function toListing(
  card: IndexCard,
  floorRaw: string | null,
  prev: Listing | undefined,
  today: string,
): Listing {
  const floor = parseFloor(floorRaw);

  return {
    id: card.id,
    url: card.url,
    source: "nextestate",
    title: card.title || card.id,
    // Reserved/sold units are removed from /en/buy/, so presence == active.
    status: "For Sale",
    neighborhood: card.neighborhood,
    price: card.price,
    rooms: card.rooms,
    sizeSqm: card.sizeSqm,
    floor,
    pricePerSqm: pricePerSqm(card.price, card.sizeSqm),
    imageUrl: card.imageUrl,
    firstSeen: prev?.firstSeen ?? today,
    lastSeen: today,
    previousPrice: prev?.price ?? null,
  };
}

async function main() {
  const limit = process.env.NE_LIMIT ? Number(process.env.NE_LIMIT) : Infinity;
  const today = new Date().toISOString().slice(0, 10);
  const previous = loadPreviousByUrl(OUT_PATH);

  console.log(`[ne] index: ${INDEX_URL}`);

  const cards = parseIndexCards(await fetchHtml(INDEX_URL)).slice(0, limit);

  console.log(`[ne] ${cards.length} listings on the index`);

  const listings: Listing[] = [];

  for (const [i, card] of cards.entries()) {
    let floorRaw: string | null = null;

    // Only the floor needs the detail page; a failed fetch just leaves floor
    // unknown (sorts last) rather than dropping an otherwise-complete listing.
    try {
      const facts = parseDetailFacts(await fetchHtml(card.url));
      floorRaw = facts["Floor Level"] ?? null;
    } catch (err) {
      console.warn(`  [${i + 1}/${cards.length}] detail failed ${card.url}: ${(err as Error).message}`);
    }

    const listing = toListing(card, floorRaw, previous.get(card.url), today);
    listings.push(listing);

    console.log(
      `  [${i + 1}/${cards.length}] ${listing.id} — floor=${listing.floor.raw || "?"} ` +
        `€${listing.price ?? "?"} ${listing.sizeSqm ?? "?"}m² ${listing.neighborhood ?? "?"}`,
    );

    // Politeness delay between detail fetches.
    await sleep(600);
  }

  const { total, mine, others } = mergeAndWrite({
    source: "nextestate",
    host: HOST,
    fresh: listings,
    outPath: OUT_PATH,
  });

  console.log(
    `[ne] wrote ${mine} next-estate listings; ${others} other-source rows preserved; ` +
      `${total} total in ${OUT_PATH}`,
  );
}

main().catch((err) => {
  console.error("[ne] FATAL:", err.message);
  process.exit(1);
});
