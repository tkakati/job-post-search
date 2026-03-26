import { describe, expect, it } from "vitest";
import { buildLeadCardsFromLeads } from "../../src/lib/agent/formatters/build-lead-cards";

describe("build lead cards repost context", () => {
  it("prefers primary post context for post author and post URL", () => {
    const cards = buildLeadCardsFromLeads({
      selectedLeads: [
        {
          identityKey: "lead-1",
          canonicalUrl: "https://www.linkedin.com/posts/reposter-post",
          sourceType: "linkedin-content",
          titleOrRole: "Product Manager",
          roleLocationKey: "product manager::seattle",
          author: "Reposter",
          sourceMetadataJson: {
            sourceQuery: "hiring product manager seattle",
            postContext: {
              isRepost: true,
              primaryPostUrl: "https://www.linkedin.com/posts/original-post",
              primaryAuthorName: "Original Author",
              primaryAuthorProfileUrl: "https://www.linkedin.com/in/original-author",
            },
          },
        },
      ],
      leadProvenance: [
        {
          identityKey: "lead-1",
          sources: ["fresh_search"],
        },
      ],
      maxLeads: 20,
    });

    expect(cards).toHaveLength(1);
    expect(cards[0]?.postUrl).toBe("https://www.linkedin.com/posts/original-post");
    expect(cards[0]?.postAuthor).toBe("Original Author");
    expect(cards[0]?.postAuthorUrl).toBe("https://www.linkedin.com/in/original-author");
  });

  it("falls back to lead fields when post context is absent", () => {
    const cards = buildLeadCardsFromLeads({
      selectedLeads: [
        {
          identityKey: "lead-2",
          canonicalUrl: "https://www.linkedin.com/posts/fallback-post",
          sourceType: "linkedin-content",
          titleOrRole: "Product Manager",
          roleLocationKey: "product manager::seattle",
          author: "Fallback Author",
        },
      ],
      leadProvenance: [
        {
          identityKey: "lead-2",
          sources: ["fresh_search"],
        },
      ],
      maxLeads: 20,
    });

    expect(cards).toHaveLength(1);
    expect(cards[0]?.postUrl).toBe("https://www.linkedin.com/posts/fallback-post");
    expect(cards[0]?.postAuthor).toBe("Fallback Author");
  });

  it("dedupes near-duplicate leads and keeps the most recent post", () => {
    const cards = buildLeadCardsFromLeads({
      selectedLeads: [
        {
          identityKey: "lead-3-old",
          canonicalUrl: "https://www.linkedin.com/posts/old-variant",
          sourceType: "linkedin-content",
          titleOrRole: "Senior Product Manager",
          roleLocationKey: "senior product manager::seattle",
          author: "Alex Smith",
          fullText: "My team is hiring a senior product manager in Seattle and SF.",
          postedAt: "2026-03-01T00:00:00.000Z",
          sourceMetadataJson: {
            postContext: {
              primaryAuthorName: "Alex Smith",
              primaryAuthorProfileUrl: "https://www.linkedin.com/in/alex-smith",
              primaryPostUrl: "https://www.linkedin.com/posts/old-variant",
            },
            extraction: {
              role: "Senior Product Manager",
            },
          },
        },
        {
          identityKey: "lead-3-new",
          canonicalUrl: "https://www.linkedin.com/posts/new-variant",
          sourceType: "linkedin-content",
          titleOrRole: "Senior Product Manager",
          roleLocationKey: "senior product manager::seattle",
          author: "Alex Smith",
          fullText: "My team is hiring senior product manager in Seattle or SF.",
          postedAt: "2026-03-03T00:00:00.000Z",
          sourceMetadataJson: {
            postContext: {
              primaryAuthorName: "Alex Smith",
              primaryAuthorProfileUrl: "https://www.linkedin.com/in/alex-smith",
              primaryPostUrl: "https://www.linkedin.com/posts/new-variant",
            },
            extraction: {
              role: "Senior Product Manager",
            },
          },
        },
      ],
      leadProvenance: [
        {
          identityKey: "lead-3-old",
          sources: ["retrieval"],
        },
        {
          identityKey: "lead-3-new",
          sources: ["fresh_search"],
        },
      ],
      maxLeads: 20,
    });

    expect(cards).toHaveLength(1);
    expect(cards[0]?.canonicalUrl).toBe("https://www.linkedin.com/posts/new-variant");
    expect(cards[0]?.sourceBadge).toBe("both");
  });
});
