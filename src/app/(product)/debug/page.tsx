import { redirect } from "next/navigation";

type DebugPageProps = {
  searchParams: Promise<{ view?: string | string[] }>;
};

export default async function DebugPage({ searchParams }: DebugPageProps) {
  const params = await searchParams;
  const rawView = Array.isArray(params.view) ? params.view[0] : params.view;
  const view = rawView === "agent" ? "agent" : "post-feed";
  redirect(`/posts-feed?view=${view}`);
}
