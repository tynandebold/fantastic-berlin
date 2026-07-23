// Pure parsers for the messy text on Fantastic Frank listings.
// No DOM, no network, no side effects, so they are easy to unit test.
// The scraper pulls raw strings from the page and hands them to these.

import type { Floor } from "./types.js";

// Berlin districts we recognize, matched case-insensitively against free text
// (title, address, or URL slug). Ordered longest-first so multi-word names win.
const BERLIN_DISTRICTS = [
  "Prenzlauer Berg",
  "Charlottenburg",
  "Friedrichshain",
  "Wilmersdorf",
  "Schoeneberg",
  "Schöneberg",
  "Lichtenberg",
  "Zehlendorf",
  "Reinickendorf",
  "Tempelhof",
  "Neukoelln",
  "Neukölln",
  "Kreuzberg",
  "Wedding",
  "Moabit",
  "Steglitz",
  "Nikolassee",
  "Grunewald",
  "Dahlem",
  "Pankow",
  "Mitte",
  "Treptow",
  "Koepenick",
  "Köpenick",
  "Spandau",
  "Marzahn",
  "Weissensee",
  "Weißensee",
  "Friedenau",
  "Wannsee",
];

// Parse a European-formatted number: "495.000", "1.200.000,50", "72,5".
// German uses "." for thousands and "," for decimals; we normalize both.
function parseEuroNumber(input: string): number | null {
  const cleaned = input.replace(/[^\d.,]/g, "");

  if (!cleaned) {
    return null;
  }

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  let normalized = cleaned;

  if (hasComma && hasDot) {
    // Both present: the last separator is the decimal one.
    normalized =
      cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
  } else if (hasComma) {
    // Comma only: decimal if it looks like "72,5", else thousands "1,200".
    const parts = cleaned.split(",");

    normalized =
      parts.length === 2 && parts[1].length <= 2
        ? cleaned.replace(",", ".")
        : cleaned.replace(/,/g, "");
  } else if (hasDot) {
    // Dot only: thousands if it looks like "495.000", else decimal "72.5".
    const parts = cleaned.split(".");

    normalized =
      parts.length === 2 && parts[1].length <= 2 ? cleaned : cleaned.replace(/\./g, "");
  }

  const value = Number(normalized);

  return Number.isFinite(value) ? value : null;
}

// "€ 495.000", "495.000 €", "EUR 1.200.000", "Price on request" -> number | null
export function parsePrice(raw: string | null | undefined): number | null {
  if (!raw) {
    return null;
  }

  const value = parseEuroNumber(raw);

  // Guard against grabbing a stray small number (e.g. room count) as a price.
  if (value === null || value < 1000) {
    return null;
  }

  return value;
}

// "72 m²", "72,5 m²", "72 sqm", "72 kvm" -> number | null
export function parseSize(raw: string | null | undefined): number | null {
  if (!raw) {
    return null;
  }

  const match = raw.match(/([\d.,]+)\s*(?:m²|m2|sqm|kvm|qm)/i);

  const target = match ? match[1] : raw;

  const value = parseEuroNumber(target);

  if (value === null || value <= 0) {
    return null;
  }

  return value;
}

// "3 Zimmer", "3,5 rooms", "3 Zi.", "3" -> number | null
export function parseRooms(raw: string | null | undefined): number | null {
  if (!raw) {
    return null;
  }

  const match = raw.match(/([\d]+(?:[.,]\d+)?)\s*(?:zimmer|rooms?|zi\.?|rum)?/i);

  if (!match) {
    return null;
  }

  const value = parseEuroNumber(match[1]);

  if (value === null || value <= 0 || value > 40) {
    return null;
  }

  return value;
}

// The hard one. Normalize German + English floor descriptions to a number.
// Examples: "EG" -> 0, "3. OG" -> 3, "Ground floor" -> 0, "2nd floor" -> 2,
// "DG"/"Dachgeschoss" -> {value:null, isTop:true}, "UG" -> -1.
export function parseFloor(raw: string | null | undefined): Floor {
  const text = (raw ?? "").trim();

  if (!text) {
    return { raw: "", value: null, isTop: false };
  }

  const lower = text.toLowerCase();

  // Attic / top floor: highly desirable. Keep the number too when stated
  // ("5th ... attic floor") so higher attics sort above lower ones.
  if (/\bdg\b|dachgeschoss|attic|penthouse|top floor|top-floor/.test(lower)) {
    const num = lower.match(/(\d+)\s*(?:st|nd|rd|th|\.|\s*og)/);

    return { raw: text, value: num ? Number(num[1]) : null, isTop: true };
  }

  // Basement / below ground.
  if (/\bug\b|untergeschoss|souterrain|basement|garden level|gartengeschoss/.test(lower)) {
    return { raw: text, value: -1, isTop: false };
  }

  // Ground floor. Hochparterre (raised ground) treated as 0 as well.
  if (/\beg\b|erdgeschoss|hochparterre|ground\s*floor|ground\s*level|\bgf\b/.test(lower)) {
    return { raw: text, value: 0, isTop: false };
  }

  // "3. OG", "3.OG", "3 OG", "3. Obergeschoss", "3. Etage", "3. Stock".
  const deMatch = lower.match(/(\d+)\s*\.?\s*(?:og|obergeschoss|etage|stock|geschoss)/);

  if (deMatch) {
    return { raw: text, value: Number(deMatch[1]), isTop: false };
  }

  // "3rd floor", "2nd floor", "1st floor", "floor 4".
  const enMatch = lower.match(/(?:(\d+)(?:st|nd|rd|th)?\s*floor|floor\s*(\d+))/);

  if (enMatch) {
    const num = enMatch[1] ?? enMatch[2];

    return { raw: text, value: Number(num), isTop: false };
  }

  // Fantastic Frank's own format: "4th, front building", "1st, side wing".
  const ordinal = lower.match(/^\s*(\d+)\s*(?:st|nd|rd|th)\b/);

  if (ordinal) {
    return { raw: text, value: Number(ordinal[1]), isTop: false };
  }

  // Leading integer as a last resort ("3", "3.", "4, rear building").
  const bare = lower.match(/^\s*(\d+)\b/);

  if (bare) {
    return { raw: text, value: Number(bare[1]), isTop: false };
  }

  return { raw: text, value: null, isTop: false };
}

// price / sizeSqm, rounded to a whole euro. null if either input is missing.
export function pricePerSqm(price: number | null, sizeSqm: number | null): number | null {
  if (!price || !sizeSqm) {
    return null;
  }

  return Math.round(price / sizeSqm);
}

// Find a known Berlin district in free text (title, address, or slug).
export function parseNeighborhood(...sources: (string | null | undefined)[]): string | null {
  const haystack = sources.filter(Boolean).join(" ").toLowerCase();

  if (!haystack) {
    return null;
  }

  for (const district of BERLIN_DISTRICTS) {
    if (haystack.includes(district.toLowerCase())) {
      return district;
    }
  }

  return null;
}

// "https://.../en/berlin/property/suarezstrasse-12/" -> "suarezstrasse-12"
export function slugFromUrl(url: string): string {
  const trimmed = url.replace(/\/+$/, "");
  const parts = trimmed.split("/");

  return parts[parts.length - 1] || trimmed;
}
