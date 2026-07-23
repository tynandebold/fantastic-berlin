# Fantastic Berlin

A faster, floor-first view of [Fantastic Frank Berlin](https://www.fantasticfrank.com/en/berlin/for-sale/)
for-sale listings. Same properties, surfaced the way I actually browse: highest floors first, with
euro-per-square-meter, size, rooms, neighborhood, an image, and "new since last run" flags. Sold and
reserved listings are filtered out.

## How it works

```
sitemap.xml (open)  ─┐
                     ├─▶  scraper  ─▶  data/listings.json  ─▶  site/ (static)  ─▶  GitHub Pages
for-sale index +     │   (local,        (committed)            fetches JSON
detail pages (gated) ┘    daily)
```

The source sits behind a Vercel bot challenge that blocks plain HTTP and datacenter IPs. The scraper
uses `playwright-extra` + the stealth plugin with real Chrome to clear it, which works reliably from a
home connection. So scraping runs **locally, on demand** (not in CI): you run it whenever you want to
refresh, commit the JSON, and push. A publish-only GitHub Action then deploys the static site. CI never
touches the challenged site. This place does not list many new properties, so an occasional manual run
is plenty.

Images are hotlinked from the source's Cloudinary CDN (which is open), not re-hosted.

## Project layout

```
scraper/
  parse.ts      pure parsers (floor, price, m², rooms, district) + parse.test.ts
  sitemap.ts    reads the open sitemap for URLs + images (fallback)
  browser.ts    stealth browser + checkpoint clearing
  extract.ts    pulls the facts grid off each detail page
  scrape.ts     orchestrator: index -> details -> filter -> merge -> write
data/listings.json   the snapshot (source of truth; also persists firstSeen + previousPrice)
site/                vanilla HTML/CSS/JS, reads listings.json
.github/workflows/pages.yml   publish-only Pages deploy
```

## Local development

```bash
npm install
npx playwright install chromium      # once
npm test                             # parser unit tests
npm run scrape                       # full scrape (opens a real Chrome window ~5 min)
npm run serve                        # copies data into site/ and serves at http://localhost:8799
```

Sample a few listings while iterating: `FF_LIMIT=5 npm run scrape`.
Env knobs: `FF_LIMIT` (cap detail pages), `HEADLESS=1` (try headless), `FF_CHANNEL=chromium` (bundled browser).

## Updating (manual)

Refresh whenever you feel like checking for new places:

```bash
npm run scrape                       # opens a real Chrome window, ~5 min
git add data/listings.json
git commit -m "data: refresh listings"
git push                             # the Pages Action redeploys automatically
```

### If the checkpoint will not clear

The scraper retries with backoff, but if it still fails with "checkpoint not cleared", the source has
temporarily escalated its bot challenge for your IP (usually from running it several times in a row).
Wait 15 to 30 minutes and try again. Tunable via env vars: `FF_CLEAR_TIMEOUT` (ms per attempt, default
60000) and `FF_ATTEMPTS` (default 3).

## Notes

Not affiliated with Fantastic Frank. This mirrors public listing facts for personal use at low volume
(once daily). Be a good citizen if you fork it.
