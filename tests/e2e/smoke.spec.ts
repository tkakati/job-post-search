import { test, expect } from "@playwright/test";

test("main job discovery UX smoke flow", async ({ page }) => {
  await page.route("**/api/history?limit=5", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: { items: [] },
      }),
    });
  });
  await page.route("**/api/search-runs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          runId: 123,
          status: "completed",
          pollAfterMs: null,
          result: null,
        },
      }),
    });
  });
  await page.route("**/api/search-runs/123", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          runId: 123,
          status: "completed",
          pollAfterMs: null,
          result: {
            runId: 123,
            status: "completed",
            stopReason: "sufficient_new_leads",
            iterationsUsed: 2,
            summary: "Found 1 new lead.",
            totalCounts: { retrieved: 1, generated: 1, merged: 1, newForUser: 1 },
            sourceBreakdown: { retrieved: 0, fresh: 1, both: 0 },
            debug: {
              plannerMode: "explore_heavy",
              retrievalRan: true,
              freshSearchRan: true,
              numExploreQueries: 2,
              iterationCount: 2,
              stopReason: "sufficient_new_leads",
              countBreakdowns: {
                retrieved: 1,
                generated: 1,
                merged: 1,
                newForUser: 1,
              },
            },
            leads: [
              {
                leadId: 1,
                title: "Frontend Engineer",
                company: "Acme",
                location: "Remote",
                canonicalUrl: "https://example.com/jobs/1",
                url: "https://example.com/jobs/1",
                snippet: "Hiring now",
                sourceType: "linkedin-content",
                sourceBadge: "fresh",
                provenanceSources: ["fresh_search"],
                postedAt: new Date().toISOString(),
                isNewForUser: true,
                newBadge: "new",
                qualityBadge: "high",
              },
            ],
            updatedAt: new Date().toISOString(),
          },
        },
      }),
    });
  });

  await page.goto("/job-discovery");
  await expect(page.getByRole("heading", { name: /Discover high-signal/i })).toBeVisible();

  await page.getByLabel("Role").fill("Frontend Engineer");
  await page.getByLabel("Location").fill("Remote");
  await page.getByRole("button", { name: /Find New Hiring Leads/i }).click();

  await expect(page).toHaveURL(/\/job-discovery\/runs\/123/);
  await expect(page.getByText(/Found 1 new lead/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Open Lead/i })).toBeVisible();
});

