import { redirect } from "next/navigation";

export default function PostsFeedPage() {
  redirect("/debug?view=post-feed");
}
