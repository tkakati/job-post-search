import type { Lead } from "@/lib/agent/types";
import type { SearchInput, SearchProvider } from "@/lib/search/searchProvider";

function hashToInt(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h;
}

function pseudoRandom(seed: number) {
  // Simple LCG for deterministic "randomness"
  let x = seed % 2147483647;
  if (x <= 0) x += 2147483646;
  x = (x * 16807) % 2147483647;
  return (x - 1) / 2147483646;
}

/**
 * MVP fallback provider to keep the app runnable while you wire real integrations.
 * It is deterministic per (role, location, query, recencyDays).
 */
export const mockSearchProvider: SearchProvider = {
  async search(input: SearchInput): Promise<Omit<Lead, "id">[]> {
    const { role, location, recencyDays, query, userId } = input;
    const baseSeed = hashToInt(`${role}::${location}::${query}::${recencyDays}::${userId}`);

    const leads: Omit<Lead, "id">[] = [];
    const now = Date.now();
    const count = 12;

    for (let i = 0; i < count; i++) {
      const r = pseudoRandom(baseSeed + i);
      const ageDays = Math.floor(r * recencyDays);

      const title = `${role} (${i + 1}) - ${query.slice(0, 18).trim()}`;
      const company = `Company ${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(
        65 + ((i + 5) % 26),
      )}`;

      const urlSeed = hashToInt(`${role}::${location}::${title}::${company}::${query}`);
      const url = `https://example.com/jobs/${urlSeed}`;

      leads.push({
        role,
        location,
        title,
        company,
        url,
        description: `Mock lead for ${role} in ${location} matching query "${query}".`,
        source: "mock-search-provider",
        sourceMetadata: { provider: "mock", queryUsed: query, leadIndex: i },
        createdAt: new Date(now - ageDays * 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    return leads;
  },
};

