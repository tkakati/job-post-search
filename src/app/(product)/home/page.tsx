import { DebugTabClient } from "@/components/job-discovery/debug-tab-client";

type HomePageProps = {
  searchParams: Promise<{ view?: string | string[] }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const rawView = Array.isArray(params.view) ? params.view[0] : params.view;
  const mode = rawView === "agent" ? "agent" : "post-feed";
  return <DebugTabClient mode={mode} />;
}
