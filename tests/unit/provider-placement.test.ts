import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

function walk(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile() && (p.endsWith(".ts") || p.endsWith(".tsx"))) out.push(p);
  }
  return out;
}

describe("provider placement guardrails", () => {
  it("uses OpenAI only in query-generation node", () => {
    const srcRoot = path.resolve(__dirname, "../../src");
    const files = walk(srcRoot);
    const offenders = files.filter((file) => {
      const text = fs.readFileSync(file, "utf8");
      if (!text.includes("@langchain/openai") && !text.includes("ChatOpenAI")) {
        return false;
      }
      return !file.endsWith(path.join("agent", "nodes", "query-generation.ts"));
    });
    expect(offenders).toEqual([]);
  });

  it("uses Apify only in search provider implementation", () => {
    const srcRoot = path.resolve(__dirname, "../../src");
    const files = walk(srcRoot);
    const offenders = files.filter((file) => {
      const text = fs.readFileSync(file, "utf8");
      if (!text.toLowerCase().includes("apify")) return false;
      const allowed = [
        path.join("lib", "search", "providers", "apify-linkedin-content-provider.ts"),
        path.join("lib", "search", "providers", "index.ts"),
        path.join("lib", "env.ts"),
        // Search execution is explicit in the search node orchestration layer.
        path.join("features", "lead-generation", "search-node.ts"),
        path.join("lib", "agent", "nodes", "search.ts"),
        // API contracts expose Apify-related diagnostics fields.
        path.join("lib", "schemas", "contracts.ts"),
        path.join("lib", "types", "contracts.ts"),
      ];
      return !allowed.some((a) => file.endsWith(a));
    });
    expect(offenders).toEqual([]);
  });
});

