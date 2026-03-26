import { describe, expect, it } from "vitest";
import {
  chooseMostRecent,
  dedupeRedundantLeads,
  isRedundantPostPair,
  type RedundancyComparable,
} from "../../src/lib/leads/redundancy";

function makeComparable(input: {
  posterProfileUrl?: string | null;
  posterName?: string | null;
  role?: string | null;
  fullText?: string | null;
  postedAt?: string | null;
  fetchedAt?: string | null;
}): RedundancyComparable {
  return {
    sourceMetadataJson: {
      postContext: {
        primaryAuthorProfileUrl: input.posterProfileUrl ?? null,
        primaryAuthorName: input.posterName ?? null,
      },
      extraction: {
        role: input.role ?? null,
      },
    },
    postAuthor: input.posterName ?? null,
    titleOrRole: input.role ?? null,
    fullText: input.fullText ?? null,
    postedAt: input.postedAt ?? null,
    fetchedAt: input.fetchedAt ?? null,
  };
}

describe("runtime redundancy dedupe", () => {
  it("dedupes same poster + same role + near-duplicate text", () => {
    const first = makeComparable({
      posterProfileUrl: "https://www.linkedin.com/in/alice",
      posterName: "Alice",
      role: "Senior Product Manager",
      fullText: "My team is hiring a senior product manager in Seattle and SF.",
      postedAt: "2026-03-10T00:00:00.000Z",
    });
    const second = makeComparable({
      posterProfileUrl: "https://www.linkedin.com/in/alice",
      posterName: "Alice",
      role: "Senior Product Manager",
      fullText: "My team is hiring senior product manager in Seattle or SF.",
      postedAt: "2026-03-11T00:00:00.000Z",
    });

    expect(isRedundantPostPair(first, second)).toBe(true);

    const result = dedupeRedundantLeads({
      items: [{ id: "first", ...first }, { id: "second", ...second }],
      toComparable: (item) => item,
    });

    expect(result.deduped).toHaveLength(1);
    expect(result.droppedCount).toBe(1);
    expect(result.deduped[0]?.id).toBe("second");
  });

  it("keeps rows when text similarity is low", () => {
    const first = makeComparable({
      posterProfileUrl: "https://www.linkedin.com/in/alice",
      posterName: "Alice",
      role: "Senior Product Manager",
      fullText: "Hiring product manager for AI platform strategy and roadmap.",
    });
    const second = makeComparable({
      posterProfileUrl: "https://www.linkedin.com/in/alice",
      posterName: "Alice",
      role: "Senior Product Manager",
      fullText: "Looking for onsite program manager focused on hardware operations.",
    });

    const result = dedupeRedundantLeads({
      items: [{ id: "first", ...first }, { id: "second", ...second }],
      toComparable: (item) => item,
    });

    expect(result.deduped).toHaveLength(2);
    expect(result.droppedCount).toBe(0);
  });

  it("keeps rows when posters differ even if role/text are similar", () => {
    const first = makeComparable({
      posterProfileUrl: "https://www.linkedin.com/in/alice",
      posterName: "Alice",
      role: "Senior Product Manager",
      fullText: "My team is hiring a senior product manager in Seattle and SF.",
    });
    const second = makeComparable({
      posterProfileUrl: "https://www.linkedin.com/in/bob",
      posterName: "Bob",
      role: "Senior Product Manager",
      fullText: "My team is hiring a senior product manager in Seattle and SF.",
    });

    const result = dedupeRedundantLeads({
      items: [{ id: "first", ...first }, { id: "second", ...second }],
      toComparable: (item) => item,
    });

    expect(result.deduped).toHaveLength(2);
  });

  it("does not dedupe when poster identity is missing", () => {
    const first = makeComparable({
      posterProfileUrl: null,
      posterName: null,
      role: "Senior Product Manager",
      fullText: "My team is hiring a senior product manager in Seattle and SF.",
    });
    const second = makeComparable({
      posterProfileUrl: null,
      posterName: null,
      role: "Senior Product Manager",
      fullText: "My team is hiring a senior product manager in Seattle and SF.",
    });

    const result = dedupeRedundantLeads({
      items: [{ id: "first", ...first }, { id: "second", ...second }],
      toComparable: (item) => item,
    });

    expect(result.deduped).toHaveLength(2);
    expect(result.droppedCount).toBe(0);
  });

  it("chooseMostRecent uses postedAt first and fetchedAt fallback", () => {
    const oldPosted = makeComparable({
      posterProfileUrl: "https://www.linkedin.com/in/alice",
      role: "PM",
      fullText: "hiring product manager",
      postedAt: "2026-02-01T00:00:00.000Z",
      fetchedAt: "2026-03-15T00:00:00.000Z",
    });
    const newPosted = makeComparable({
      posterProfileUrl: "https://www.linkedin.com/in/alice",
      role: "PM",
      fullText: "hiring product manager",
      postedAt: "2026-03-01T00:00:00.000Z",
      fetchedAt: "2026-03-02T00:00:00.000Z",
    });
    const winnerByPosted = chooseMostRecent(oldPosted, newPosted);
    expect(winnerByPosted).toBe(newPosted);

    const noPostedOldFetched = makeComparable({
      posterProfileUrl: "https://www.linkedin.com/in/alice",
      role: "PM",
      fullText: "hiring product manager",
      postedAt: null,
      fetchedAt: "2026-03-01T00:00:00.000Z",
    });
    const noPostedNewFetched = makeComparable({
      posterProfileUrl: "https://www.linkedin.com/in/alice",
      role: "PM",
      fullText: "hiring product manager",
      postedAt: null,
      fetchedAt: "2026-03-10T00:00:00.000Z",
    });
    const winnerByFetched = chooseMostRecent(noPostedOldFetched, noPostedNewFetched);
    expect(winnerByFetched).toBe(noPostedNewFetched);
  });
});
