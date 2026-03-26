import { expect } from "vitest";

// `@testing-library/jest-dom` assumes a global `expect` (Jest-style).
// Vitest provides `expect`, but setup-file import order can matter.
const g = globalThis as unknown as { expect?: typeof expect };
g.expect = expect;

await import("@testing-library/jest-dom");

