// Stage 1 of the pipeline: the sitemap is served WITHOUT the Vercel checkpoint,
// so we get the full set of Berlin property URLs, one image each, and lastmod
// dates cheaply and politely (a single request), no browser required.

import { slugFromUrl, parseNeighborhood } from "./parse.js";

const SITEMAP_URL = "https://www.fantasticfrank.com/sitemap.xml";

export type SitemapEntry = {
  url: string;
  slug: string;
  imageUrl: string | null;
  lastmod: string | null;
  neighborhood: string | null;
};

// Pull the <url> blocks that point at Berlin property detail pages and read the
// first <image:loc> and <lastmod> from each. Kept as string parsing (no XML dep)
// because the sitemap is large and the shape is stable and simple.
export function parseBerlinProperties(xml: string): SitemapEntry[] {
  const entries: SitemapEntry[] = [];
  const blocks = xml.split("<url>");

  for (const block of blocks) {
    const locMatch = block.match(/<loc>\s*([^<]*en\/berlin\/property\/[^<]*?)\s*<\/loc>/);

    if (!locMatch) {
      continue;
    }

    const url = locMatch[1].trim();
    const imageMatch = block.match(/<image:loc>\s*([^<]+?)\s*<\/image:loc>/);
    const lastmodMatch = block.match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/);
    const slug = slugFromUrl(url);

    entries.push({
      url,
      slug,
      imageUrl: imageMatch ? imageMatch[1].trim() : null,
      lastmod: lastmodMatch ? lastmodMatch[1].trim() : null,
      neighborhood: parseNeighborhood(slug),
    });
  }

  return entries;
}

export async function fetchSitemap(): Promise<string> {
  const res = await fetch(SITEMAP_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
  });

  if (!res.ok) {
    throw new Error(`sitemap fetch failed: HTTP ${res.status}`);
  }

  return res.text();
}
