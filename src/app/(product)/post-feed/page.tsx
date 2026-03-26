import { redirect } from "next/navigation";

type PostFeedPageProps = {
  searchParams: Promise<{ view?: string | string[] }>;
};

export default async function PostFeedPage({ searchParams }: PostFeedPageProps) {
  const params = await searchParams;
  const rawView = Array.isArray(params.view) ? params.view[0] : params.view;
  const view = rawView === "agent" ? "agent" : "post-feed";
  redirect(`/home?view=${view}`);
}
