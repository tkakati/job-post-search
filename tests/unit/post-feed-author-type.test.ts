import { describe, expect, it } from "vitest";
import { formatAuthorType } from "../../src/lib/post-feed/formatters";

describe("post feed author type classifier", () => {
  it("classifies recruiter when hiring phrase + recruiter designation are present", () => {
    const label = formatAuthorType({
      sourceMetadataJson: {
        extraction: {
          authorLatestPositionTitle: "Senior Recruiter",
        },
      },
      fullText: "My team is hiring for a Product Manager role.",
    });
    expect(label).toBe("Recruiter");
  });

  it("classifies hiring manager when hiring phrase + manager designation are present", () => {
    const label = formatAuthorType({
      sourceMetadataJson: {
        extraction: {
          authorLatestPositionTitle: "Engineering Manager",
        },
      },
      fullText: "We are opening applications for multiple PM roles.",
    });
    expect(label).toBe("Hiring Manager");
  });

  it("returns unknown when hiring phrase is absent", () => {
    const label = formatAuthorType({
      sourceMetadataJson: {
        extraction: {
          authorLatestPositionTitle: "Talent Acquisition Partner",
          authorTypeGuess: "recruiter",
        },
      },
      fullText: "Sharing thoughts on career growth this quarter.",
    });
    expect(label).toBe("Unknown");
  });

  it("uses LLM fallback when phrase exists and designation is weak", () => {
    const label = formatAuthorType({
      sourceMetadataJson: {
        extraction: {
          authorLatestPositionTitle: "People Ops",
          authorTypeGuess: "recruiter",
        },
      },
      fullText: "We're hiring for two product roles this month.",
    });
    expect(label).toBe("Recruiter");
  });

  it("can infer designation from headline/about when latest position is missing", () => {
    const label = formatAuthorType({
      sourceMetadataJson: {
        extraction: {
          authorHeadline: "Talent Acquisition Specialist",
          authorAbout: "I help teams hire great product talent.",
        },
      },
      fullText: "Looking for a strong PM to join our team.",
    });
    expect(label).toBe("Recruiter");
  });
});
