import { createHash } from "crypto";

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
]);

export function canonicalizeLeadUrl(inputUrl: string) {
  try {
    const url = new URL(inputUrl);
    url.hash = "";
    url.host = url.host.toLowerCase();
    url.protocol = url.protocol.toLowerCase();

    // Remove common tracking params.
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }

    // Normalize trailing slash except root.
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }

    return url.toString();
  } catch {
    // Fallback if URL parsing fails.
    return inputUrl.trim();
  }
}

function normalizeLoose(value?: string | null) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function leadIdentityKey(input: {
  canonicalUrl: string;
  titleOrRole?: string | null;
  company?: string | null;
  location?: string | null;
}) {
  const base = [
    canonicalizeLeadUrl(input.canonicalUrl),
    normalizeLoose(input.titleOrRole),
    normalizeLoose(input.company),
    normalizeLoose(input.location),
  ].join("|");

  return createHash("sha256").update(base).digest("hex");
}

export function canonicalLeadIdentity(input: {
  url: string;
  titleOrRole?: string | null;
  company?: string | null;
  location?: string | null;
}) {
  const canonicalUrl = canonicalizeLeadUrl(input.url);
  const identityKey = leadIdentityKey({
    canonicalUrl,
    titleOrRole: input.titleOrRole,
    company: input.company,
    location: input.location,
  });
  return { canonicalUrl, identityKey };
}

