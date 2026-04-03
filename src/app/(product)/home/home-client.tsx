"use client";

import * as React from "react";
import type { ComponentProps } from "react";
import { DebugTabClient } from "@/components/job-discovery/debug-tab-client";
import { AnalyticsTabClient } from "@/components/analytics/analytics-tab-client";
import { useProductViewMode } from "@/app/(product)/view-mode-context";

type DebugTabClientProps = ComponentProps<typeof DebugTabClient>;

export function HomeClient({
  initialSavedFeedItems = [],
}: {
  initialSavedFeedItems?: DebugTabClientProps["initialSavedFeedItems"];
}) {
  const { mode } = useProductViewMode();
  const [lastDebugMode, setLastDebugMode] = React.useState<"agent" | "post-feed">(
    mode === "agent" ? "agent" : "post-feed",
  );

  React.useEffect(() => {
    if (mode === "analytics") return;
    setLastDebugMode(mode === "agent" ? "agent" : "post-feed");
  }, [mode]);

  return (
    <>
      <div className={mode === "analytics" ? "hidden" : "block"}>
        <DebugTabClient mode={lastDebugMode} initialSavedFeedItems={initialSavedFeedItems} />
      </div>
      <div className={mode === "analytics" ? "block" : "hidden"}>
        <AnalyticsTabClient isActive={mode === "analytics"} />
      </div>
    </>
  );
}
