// Browser setup that clears Fantastic Frank's Vercel Security Checkpoint.
// The checkpoint is a bot challenge served (with HTTP 429) on all HTML page
// routes. Plain fetch and vanilla Playwright are blocked; the stealth plugin
// with a real Chrome build clears it in ~7s. The sitemap and image CDN are open.

import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import type { Browser, BrowserContext, Page } from "playwright";

chromium.use(stealth());

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export type Session = {
  browser: Browser;
  context: BrowserContext;
  close: () => Promise<void>;
};

export async function launchSession(): Promise<Session> {
  // Headed real Chrome is the reliable combination. HEADLESS=1 opts into
  // headless (weaker against the challenge); FF_CHANNEL=chromium uses the
  // bundled build instead of installed Chrome.
  const headless = process.env.HEADLESS === "1";
  const channelEnv = process.env.FF_CHANNEL ?? "chrome";
  const channel = channelEnv === "chromium" ? undefined : channelEnv;

  const browser = await chromium.launch({
    headless,
    channel,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezoneId: "Europe/Berlin",
  });

  async function close() {
    await context.close();
    await browser.close();
  }

  return { browser, context, close };
}

// Navigate to a page route and wait for the checkpoint to clear. The challenge
// usually clears in a few seconds, but under a harder/escalated challenge it can
// take longer or need a reload, so we retry with backoff. Throws only after all
// attempts fail, so the caller can fail loudly.
export async function gotoCleared(page: Page, url: string): Promise<void> {
  const perAttemptMs = Number(process.env.FF_CLEAR_TIMEOUT ?? 60000);
  const attempts = Number(process.env.FF_ATTEMPTS ?? 3);

  for (let attempt = 1; attempt <= attempts; attempt++) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    const deadline = Date.now() + perAttemptMs;

    while (Date.now() < deadline) {
      const title = await page.title();
      const anchors = await page.locator("a").count();

      if (!/checkpoint/i.test(title) && anchors > 5) {
        return;
      }

      await page.waitForTimeout(1000);
    }

    if (attempt < attempts) {
      console.warn(`  checkpoint slow (attempt ${attempt}/${attempts}), reloading…`);
      await page.waitForTimeout(3000 * attempt);
    }
  }

  throw new Error(
    `checkpoint not cleared for ${url} after ${attempts} attempts. ` +
      `This IP may be temporarily rate-limited from earlier runs; wait ~15-30 min and retry.`,
  );
}
