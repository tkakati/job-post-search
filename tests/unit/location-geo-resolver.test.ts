import { describe, expect, it } from "vitest";
import { hasLocationAlias, resolveLocation } from "../../src/lib/location/geo";

describe("geo resolver", () => {
  it("resolves NYC alias to New York coordinates", () => {
    const resolved = resolveLocation("NYC");
    expect(resolved?.city).toBe("New York");
    expect(resolved?.country).toBe("United States");
    expect(resolved?.lat).not.toBeNull();
    expect(resolved?.lon).not.toBeNull();
  });

  it("uses state hints to disambiguate city candidates", () => {
    const resolved = resolveLocation("New York, NY");
    expect(resolved?.city).toBe("New York");
    expect(resolved?.state).toBe("New York");
  });

  it("resolves non-US cities from bootstrap index", () => {
    const resolved = resolveLocation("Berlin, Germany");
    expect(resolved?.city).toBe("Berlin");
    expect(resolved?.country).toBe("Germany");
    expect(resolved?.lat).not.toBeNull();
  });

  it("detects alias usage", () => {
    expect(hasLocationAlias("NYC")).toBe(true);
    expect(hasLocationAlias("Seattle")).toBe(false);
  });
});
