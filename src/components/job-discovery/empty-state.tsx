import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function EmptyState({
  title,
  message,
  suggestion,
}: {
  title: string;
  message: string;
  suggestion?: string;
}) {
  return (
    <Card className="border-border/70 p-8 text-center">
      <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">{message}</p>
      {suggestion ? (
        <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">{suggestion}</p>
      ) : null}
      <div className="mt-5">
        <Button asChild>
          <Link href="/job-discovery">Start a new search</Link>
        </Button>
      </div>
    </Card>
  );
}

