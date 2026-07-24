# Altitude

A faster, floor-first view of Berlin for-sale listings from two agencies:
[Fantastic Frank](https://www.fantasticfrank.com/en/berlin/for-sale/) and
[Next Estate](https://www.next-estate.de/en/buy/). Same properties, surfaced the way I actually
browse: highest floors first, with euro-per-square-meter, size, rooms, neighborhood, an image, a
source tag, and "new since last run" flags. Sold and reserved listings are filtered out. Filter by
source to see one agency at a time.

## How it works

```
Fantastic Frank  ─▶  scrape.ts    (Playwright + stealth, LOCAL) ─┐
                                                                 ├─▶  data/listings.json  ─▶  site/  ─▶  GitHub Pages
Next Estate      ─▶  ne-scrape.ts (plain fetch, no browser)     ─┘     (committed)          (static)     (publish-only CI)
```

Both scrapers write into **one** `data/listings.json`. Each run does a **per-source merge**: it
rebuilds only its own source's rows and keeps the other source's rows untouched (rows are partitioned
by URL host), so the two are fully independent. Every listing carries a `source` field.

The two sources need very different handling:

- **Fantastic Frank** sits behind a Vercel bot challenge that blocks plain HTTP and datacenter IPs.
  Its scraper uses `playwright-extra` + the stealth plugin with real Chrome to clear it, which only
  works reliably from a home connection. So it runs **locally, on demand** (never in CI).
- **Next Estate** is a plain server-rendered WordPress site with no bot challenge, so its scraper is
  just `fetch` + an HTML parser — fast, no browser. It reads the `/en/buy/` index for the whole
  catalog and fetches each detail page only for its floor level.

A publish-only GitHub Action deploys the static site whenever `data/listings.json` or `site/` changes.
CI never scrapes. Images are hotlinked from each source's CDN, not re-hosted.

## Project layout

```
scraper/
  types.ts       shared Listing type (incl. `source`)
  parse.ts       pure parsers (floor, price, m², rooms, district) + parse.test.ts
  store.ts       shared per-source merge + floor-first sort + write
  browser.ts     Fantastic Frank: stealth browser + checkpoint clearing
  extract.ts     Fantastic Frank: pulls the facts grid off each detail page
  scrape.ts      Fantastic Frank orchestrator
  ne-extract.ts  Next Estate: parses index cards + detail facts + ne-extract.test.ts
  ne-scrape.ts   Next Estate orchestrator
data/listings.json   the snapshot (source of truth; also persists firstSeen + previousPrice)
site/                vanilla HTML/CSS/JS, reads listings.json
.github/workflows/pages.yml   publish-only Pages deploy
```

## Local development

```bash
npm install
npx playwright install chromium      # once (Fantastic Frank only)
npm test                             # parser unit tests

npm run scrape:ne                    # Next Estate — fast, plain fetch (~1 min)
npm run scrape:ff                    # Fantastic Frank — opens a real Chrome window (~5 min)
npm run scrape                       # both (Next Estate first, then Fantastic Frank)

npm run serve                        # copies data into site/ and serves at http://localhost:8799
```

Sample a few listings while iterating: `NE_LIMIT=5 npm run scrape:ne`, `FF_LIMIT=5 npm run scrape:ff`.
Env knobs: `NE_LIMIT` / `FF_LIMIT` (cap listings), and for Fantastic Frank `HEADLESS=1`,
`FF_CHANNEL=chromium`, `FF_CLEAR_TIMEOUT`, `FF_ATTEMPTS`.

## Updating (manual)

Refresh whenever you feel like checking for new places, then commit and push:

```bash
npm run scrape:ne                    # or `npm run scrape` for both
git add data/listings.json
git commit -m "data: refresh listings"
git push                             # the Pages Action redeploys automatically
```

Next Estate is cheap to refresh (no browser). Fantastic Frank is the slow one and can be run less often.

### If the Fantastic Frank checkpoint will not clear

The scraper retries with backoff, but if it still fails with "checkpoint not cleared", the source has
temporarily escalated its bot challenge for your IP (usually from running it several times in a row).
Wait 15 to 30 minutes and try again.

## Notes

Not affiliated with either agency. This mirrors public listing facts for personal use at low volume.
Be a good citizen if you fork it.
