// DOM extraction (runs in the page). Kept separate from parsing: this pulls raw
// strings off the page, parse.ts normalizes them.
//
// The evaluate bodies are passed as STRINGS on purpose: tsx/esbuild's keepNames
// transform injects a __name helper into serialized functions, which is undefined
// in the browser context ("__name is not defined"). Strings are sent verbatim.

import type { Page } from "playwright";

export type RawDetail = {
  title: string;
  ogImage: string | null;
  description: string | null;
  // Labelled facts grid: { Status, "Property Type", Area, Price, Rooms,
  // Bathrooms, Size, Floor, "Construction year", ... }.
  facts: Record<string, string>;
};

// Property detail URLs shown on the for-sale index (the active set).
export async function extractActiveUrls(page: Page): Promise<string[]> {
  const urls = await page.evaluate(`
    Array.from(new Set(
      Array.from(document.querySelectorAll("a[href*='/berlin/property/']"))
        .map(a => a.href.replace(/[#?].*$/, ""))
    ))
  `);

  return urls as string[];
}

export async function extractDetail(page: Page): Promise<RawDetail> {
  const raw = await page.evaluate(`
    (function () {
      var text = function (el) { return (el && el.textContent ? el.textContent.trim() : ""); };
      var facts = {};

      var labels = Array.from(document.querySelectorAll(".col-span-2"));
      for (var i = 0; i < labels.length; i++) {
        var key = text(labels[i]);
        var value = text(labels[i].nextElementSibling);
        if (key && value && key.length < 40) { facts[key] = value; }
      }

      var meta = function (sel) {
        var el = document.querySelector(sel);
        return el ? (el.getAttribute("content") || "").trim() : null;
      };

      return {
        title: document.title,
        ogImage: meta("meta[property='og:image']"),
        description: meta("meta[name='description']") || meta("meta[property='og:description']"),
        facts: facts
      };
    })()
  `);

  return raw as RawDetail;
}
