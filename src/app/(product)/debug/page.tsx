import { DebugTabClient } from "@/components/job-discovery/debug-tab-client";

type DebugPageProps = {
  searchParams: Promise<{ view?: string | string[] }>;
};

export default async function DebugPage({ searchParams }: DebugPageProps) {
  const params = await searchParams;
  const rawView = Array.isArray(params.view) ? params.view[0] : params.view;
  const mode = rawView === "post-feed" ? "post-feed" : "agent";
  return <DebugTabClient mode={mode} />;
}
