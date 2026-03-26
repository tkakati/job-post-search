import type {
  ProviderQueryInput,
  ProviderRawResult,
  SearchExecutionProvider,
} from "@/lib/search/provider";
import { recencyPreferenceToDays } from "@/lib/utils/recency";

function hashToInt(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h;
}

function pseudoRandom(seed: number) {
  let x = seed % 2147483647;
  if (x <= 0) x += 2147483646;
  x = (x * 16807) % 2147483647;
  return (x - 1) / 2147483646;
}

/**
 * LinkedIn-oriented MVP provider.
 * For now this is deterministic synthetic data based on input URL/query,
 * but keeps a provider contract that can be swapped with real integrations.
 */
export const linkedinContentMvpProvider: SearchExecutionProvider = {
  name: "linkedin-content-mvp",
  async execute(input: ProviderQueryInput): Promise<ProviderRawResult[]> {
    const seed = hashToInt(
      `${input.queryText}::${input.sourceUrl}::${input.roleLocationKey}::${input.iterationNumber}`,
    );
    const count = 5;
    const now = Date.now();
    const recencyDays = recencyPreferenceToDays(input.recencyPreference);

    return Array.from({ length: count }, (_, i) => {
      const r = pseudoRandom(seed + i);
      const ageDays = Math.max(1, Math.floor(r * Math.max(1, recencyDays)));
      const postDate = new Date(now - ageDays * 24 * 60 * 60 * 1000).toISOString();
      const canonical = `https://www.linkedin.com/posts/company-${Math.abs(seed % 9999)}-${i + 1}`;
      return {
        url: canonical,
        titleOrRole: `${input.role} hiring update`,
        company: `Company ${String.fromCharCode(65 + (i % 26))}`,
        location: input.location,
        author: "linkedin-user",
        snippet: `Query match: ${input.queryText}`,
        fullText: null,
        postedAt: postDate,
        qualityScore: 0.45 + r * 0.45,
        relevanceScore: 0.45 + r * 0.45,
        hiringIntentScore: 0.35 + r * 0.5,
        metadata: {
          provider: "linkedin-content-mvp",
          sourceUrl: input.sourceUrl,
          queryText: input.queryText,
          index: i,
        },
      };
    });
  },
};

