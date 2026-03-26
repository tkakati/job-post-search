import { describe, expect, it } from "vitest";
import { resolveLinkedinPostContext } from "../../src/lib/linkedin/repost-context";

describe("linkedin repost context resolver", () => {
  it("uses reshared post details as primary when repost contains original data", () => {
    const context = resolveLinkedinPostContext({
      isRepost: true,
      authorName: "Reposter Person",
      authorProfileUrl: "https://www.linkedin.com/in/reposter",
      text: "Reshared caption",
      url: "https://www.linkedin.com/posts/reposter-post",
      resharedPost: {
        authorName: "Original Author",
        authorProfileUrl: "https://www.linkedin.com/in/original-author",
        text: "Original hiring text",
        url: "https://www.linkedin.com/posts/original-post",
      },
    });

    expect(context.isRepost).toBe(true);
    expect(context.primaryPostUrl).toBe("https://www.linkedin.com/posts/original-post");
    expect(context.primaryAuthorName).toBe("Original Author");
    expect(context.primaryAuthorProfileUrl).toBe(
      "https://www.linkedin.com/in/original-author",
    );
    expect(context.primaryText).toBe("Original hiring text");
    expect(context.reposterAuthorName).toBe("Reposter Person");
  });

  it("falls back to top-level fields when reshared post details are missing", () => {
    const context = resolveLinkedinPostContext({
      isRepost: true,
      authorName: "Top Author",
      authorProfileUrl: "https://www.linkedin.com/in/top-author",
      text: "Top-level text",
      url: "https://www.linkedin.com/posts/top-post",
      resharedPost: {},
    });

    expect(context.isRepost).toBe(true);
    expect(context.primaryPostUrl).toBe("https://www.linkedin.com/posts/top-post");
    expect(context.primaryAuthorName).toBe("Top Author");
    expect(context.primaryAuthorProfileUrl).toBe("https://www.linkedin.com/in/top-author");
    expect(context.primaryText).toBe("Top-level text");
  });
});
