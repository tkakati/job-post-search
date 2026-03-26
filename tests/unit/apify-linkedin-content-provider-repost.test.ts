import { describe, expect, it } from "vitest";
import { normalizeApifyItem } from "../../src/lib/search/providers/apify-linkedin-content-provider";

describe("apify linkedin provider repost normalization", () => {
  it("normalizes reposts using original post context", () => {
    const normalized = normalizeApifyItem({
      title: "Hiring update",
      text: "Reposter caption",
      authorName: "Reposter",
      authorProfileUrl: "https://www.linkedin.com/in/reposter",
      url: "https://www.linkedin.com/posts/reposter-post",
      isRepost: true,
      resharedPost: {
        text: "Original hiring post text",
        authorName: "Original Poster",
        authorProfileUrl: "https://www.linkedin.com/in/original-poster",
        url: "https://www.linkedin.com/posts/original-post",
      },
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.url).toBe("https://www.linkedin.com/posts/original-post");
    expect(normalized?.author).toBe("Original Poster");
    expect(normalized?.fullText).toBe("Original hiring post text");
    expect(normalized?.snippet).toBe("Original hiring post text");
    expect(
      (normalized?.metadata?.postContext as { primaryAuthorName?: string } | undefined)
        ?.primaryAuthorName,
    ).toBe("Original Poster");
  });
});
