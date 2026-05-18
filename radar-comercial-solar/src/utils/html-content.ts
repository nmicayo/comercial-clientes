export const stripHtml = (html: string): string =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();

export const decodeHtmlEntities = (value: string): string =>
  value
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

export const summarizeText = (text: string, limit = 420): string => {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.slice(0, limit);
};

const decodeCfEmail = (encoded: string): string | null => {
  try {
    const key = parseInt(encoded.slice(0, 2), 16);
    let result = "";
    for (let i = 2; i < encoded.length; i += 2) {
      result += String.fromCharCode(parseInt(encoded.slice(i, i + 2), 16) ^ key);
    }
    return result.includes("@") ? result : null;
  } catch {
    return null;
  }
};

export const extractEmailsFromHtml = (html: string): string[] => {
  const found: string[] = [];

  // Cloudflare obfuscated emails: data-cfemail="hex"
  for (const m of html.matchAll(/data-cfemail=["']([0-9a-f]+)["']/gi)) {
    const decoded = decodeCfEmail(m[1]);
    if (decoded) found.push(decoded);
  }

  // mailto: href attributes (lost after stripHtml)
  for (const m of html.matchAll(/href=["']mailto:([^"'?&\s]+)/gi)) {
    if (m[1]) found.push(m[1].trim());
  }

  // Plain text emails in the raw HTML
  for (const m of html.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
    found.push(m[0]);
  }

  return [...new Set(found)];
};

export const extractEmails = (text: string): string[] =>
  [...new Set(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [])];

export const extractPhones = (text: string): string[] =>
  // Handles: (11) 9 8550-2094 | (11) 98550-2094 | +55 11 98550-2094 | 8550-2094
  [...new Set(text.match(/(?:\+55\s?)?(?:\(?\d{2}\)?\s?)?(?:9\s?)?\d{4}[-\s]?\d{4}/g) ?? [])];

export const extractCityState = (text: string): { city?: string; state?: string } => {
  const patterns = [
    /\b([A-ZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ][A-Za-zÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇáàâãéèêíìîóòôõúùûç\s]+?)\s*[\/-]\s*([A-Z]{2})\b/,
    /\b([A-ZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ][A-Za-zÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇáàâãéèêíìîóòôõúùûç\s]+?),\s*([A-Z]{2})\b/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match) {
      return {
        city: match[1]?.trim(),
        state: match[2]?.trim()
      };
    }
  }

  return {};
};

export const extractAnchorHrefs = (html: string): Array<{ href: string; text: string }> => {
  const items: Array<{ href: string; text: string }> = [];
  const anchorPattern = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const href = decodeHtmlEntities(match[1] ?? "").trim();
    const text = stripHtml(match[2] ?? "");

    if (!href) {
      continue;
    }

    items.push({ href, text });
  }

  return items;
};
