import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  onDismiss,
}: {
  title?: string;
  message: string;
  onRetry?: (() => void) | null;
  onDismiss?: (() => void) | null;
}) {
  return (
    <Card className="border-destructive/30 bg-destructive/5 p-6">
      <h3 className="text-lg font-semibold text-destructive">{title}</h3>
      <p className="mt-2 truncate text-sm text-destructive/90" title={message}>
        {message}
      </p>
      <div className="mt-4 flex gap-2">
        {onRetry ? (
          <Button type="button" variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
        {onDismiss ? (
          <Button type="button" variant="ghost" onClick={onDismiss}>
            Dismiss
          </Button>
        ) : null}
        {!onRetry && !onDismiss ? (
          <Button asChild variant="secondary">
            <Link href="/job-discovery">Try another search</Link>
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
