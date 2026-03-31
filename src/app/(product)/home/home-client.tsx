"use client";

import type { ComponentProps } from "react";
import { DebugTabClient } from "@/components/job-discovery/debug-tab-client";
import { useProductViewMode } from "@/app/(product)/view-mode-context";

type DebugTabClientProps = ComponentProps<typeof DebugTabClient>;

export function HomeClient({
  initialSavedFeedItems = [],
}: {
  initialSavedFeedItems?: DebugTabClientProps["initialSavedFeedItems"];
}) {
  const { mode } = useProductViewMode();
  return <DebugTabClient mode={mode} initialSavedFeedItems={initialSavedFeedItems} />;
}
