// Pure parsers for next-estate.de listing HTML. No network: the scraper fetches
// the pages and hands the HTML strings here. next-estate is a plain, server-
// rendered WordPress site (no bot challenge), so fetch + node-html-parser is all
// we need — no browser. The index page already carries every catalog field
// (url, district, title, rooms, size, price, image); only "Floor Level" lives on
// the detail page.

import { parse } from "node-html-parser";

import { parsePrice, parseRooms, parseSize } from "./parse.js";

export type IndexCard = {
  url: string; // canonical detail URL (with trailing slash)
  id: string; // numeric id from the URL, e.g. "21147"
  neighborhood: string | null; // Berlin district, from the card address
  title: string;
  rooms: number | null;
  sizeSqm: number | null;
  price: number | null;
  imageUrl: string | null;
};

// node-html-parser leaves entities like "&#038;" / "&amp;" encoded in attribute
// values, which matters for image URLs. Decode the few we actually see.
function decodeEntities(s: string): string {
  return s
    .replace(/&#0*38;/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&#8203;/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// next-estate 301s a detail URL without a trailing slash, so normalize it.
export function normalizeListingUrl(href: string): string {
  const clean = href.split("#")[0].split("?")[0];

  return clean.endsWith("/") ? clean : clean + "/";
}

function idFromUrl(url: string): string {
  const m = url.match(/\/buy\/(\d+)\//);

  return m ? m[1] : url;
}

// Classify a `.propertyParameter` value by content rather than position:
// "5 rooms" -> rooms, "150m²" -> size, "1.995.000" -> price.
function applyParam(text: string, card: IndexCard): void {
  const t = text.trim();

  if (/room/i.test(t)) {
    card.rooms = parseRooms(t);

    return;
  }

  if (/m²|m2|sqm|\dm/i.test(t)) {
    card.sizeSqm = parseSize(t);

    return;
  }

  card.price = parsePrice(t);
}

// The eager first gallery image has a populated `src`; later ones use `data-lazy`.
function firstImage(el: ReturnType<typeof parse>): string | null {
  const img = el.querySelector(".item_img_slider .ratio img");

  if (!img) {
    return null;
  }

  const raw = img.getAttribute("src") || img.getAttribute("data-lazy") || "";
  const url = decodeEntities(raw);

  return url || null;
}

// Parse every `.item_preview` card on the /en/buy/ index into a catalog row.
export function parseIndexCards(html: string): IndexCard[] {
  const root = parse(html);
  const cards: IndexCard[] = [];

  for (const el of root.querySelectorAll(".item_preview")) {
    const href = el.querySelector("a.item_preview__link")?.getAttribute("href");

    // Only real, numeric-id listings (skip neighborhood-guide links etc.).
    if (!href || !/\/en\/buy\/\d+\//.test(href)) {
      continue;
    }

    const url = normalizeListingUrl(href);
    const addr = el.querySelector(".address")?.text ?? "";
    const neighborhood = addr.includes(",")
      ? decodeEntities(addr.split(",").slice(1).join(",")) || null
      : null;

    const card: IndexCard = {
      url,
      id: idFromUrl(url),
      neighborhood,
      title: decodeEntities(el.querySelector(".item__title")?.text ?? ""),
      rooms: null,
      sizeSqm: null,
      price: null,
      imageUrl: firstImage(el),
    };

    for (const p of el.querySelectorAll(".propertyParameters .propertyParameter p")) {
      applyParam(p.text, card);
    }

    cards.push(card);
  }

  return cards;
}

// Detail page facts list: { "Floor Level": "5", "District": "...", ... }.
export function parseDetailFacts(html: string): Record<string, string> {
  const root = parse(html);
  const facts: Record<string, string> = {};

  for (const li of root.querySelectorAll(".list-group-item")) {
    const key = li.querySelector(".key")?.text?.trim();
    const value = li.querySelector(".value")?.text ?? "";

    if (key) {
      facts[key] = decodeEntities(value);
    }
  }

  return facts;
}
