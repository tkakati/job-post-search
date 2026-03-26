import type { SearchExecutionProvider } from "@/lib/search/provider";
import { env } from "@/lib/env";
import { linkedinContentMvpProvider } from "@/lib/search/providers/linkedin-content-mvp-provider";
import { apifyLinkedinContentProvider } from "@/lib/search/providers/apify-linkedin-content-provider";

export type SearchProviderConfig = {
  provider?: "linkedin-content-mvp" | "apify-linkedin-content";
};

export function getSearchProvider(
  config?: SearchProviderConfig,
): SearchExecutionProvider {
  const provider = config?.provider ?? env.SEARCH_PROVIDER;
  switch (provider) {
    case "apify-linkedin-content":
      return apifyLinkedinContentProvider;
    case "linkedin-content-mvp":
    default:
      return linkedinContentMvpProvider;
  }
}

