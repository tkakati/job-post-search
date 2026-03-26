"use client";

import { DebugTabClient } from "@/components/job-discovery/debug-tab-client";
import { useProductViewMode } from "@/app/(product)/view-mode-context";

export function HomeClient() {
  const { mode } = useProductViewMode();
  return <DebugTabClient mode={mode} />;
}
