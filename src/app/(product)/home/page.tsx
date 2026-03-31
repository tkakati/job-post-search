import { cookies } from "next/headers";
import { HomeClient } from "@/app/(product)/home/home-client";
import { getSavedPostFeed } from "@/lib/api/search-runs";
import { readOptionalClerkUserId, readUserSessionContextForSSR } from "@/lib/api/session";

export default async function HomePage() {
  const cookieStore = await cookies();
  const clerkUserId = await readOptionalClerkUserId();
  const session = await readUserSessionContextForSSR({
    cookieStore,
    clerkUserId,
  });

  let initialSavedFeedItems: Awaited<ReturnType<typeof getSavedPostFeed>>["items"] = [];
  if (session.sessionScopeIds.length > 0) {
    try {
      const savedFeed = await getSavedPostFeed({
        sessionScopeIds: session.sessionScopeIds,
        limit: 300,
      });
      initialSavedFeedItems = savedFeed.items;
    } catch {
      initialSavedFeedItems = [];
    }
  }

  return <HomeClient initialSavedFeedItems={initialSavedFeedItems} />;
}
