/**
 * YouTube/Vimeo embed handling (engineering-spec §8: video is embed-only).
 * Host allow-list is enforced by the zod schema; this module normalizes URLs
 * and fetches oEmbed metadata (title/thumbnail) with a short timeout —
 * metadata failure is non-fatal (we keep the URL, retry enrichment later).
 */
export interface EmbedMeta {
  provider: "youtube" | "vimeo";
  title?: string;
  thumbnailUrl?: string;
}

export function providerFor(url: string): "youtube" | "vimeo" | null {
  const host = new URL(url).hostname.replace(/^www\./, "");
  if (host === "youtube.com" || host === "youtu.be") return "youtube";
  if (host === "vimeo.com") return "vimeo";
  return null;
}

export async function fetchEmbedMeta(url: string): Promise<EmbedMeta | null> {
  const provider = providerFor(url);
  if (!provider) return null;
  const endpoint =
    provider === "youtube"
      ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`
      : `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`;
  try {
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return { provider };
    const data = (await res.json()) as { title?: string; thumbnail_url?: string };
    const meta: EmbedMeta = { provider };
    if (data.title) meta.title = data.title;
    if (data.thumbnail_url) meta.thumbnailUrl = data.thumbnail_url;
    return meta;
  } catch {
    return { provider };
  }
}
