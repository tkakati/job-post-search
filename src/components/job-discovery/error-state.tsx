import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function ErrorState({
  title = "Something went wrong",
  message,
}: {
  title?: string;
  message: string;
}) {
  return (
    <Card className="border-destructive/30 bg-destructive/5 p-6">
      <h3 className="text-lg font-semibold text-destructive">{title}</h3>
      <p className="mt-2 text-sm text-destructive/90">{message}</p>
      <div className="mt-4 flex gap-2">
        <Button asChild variant="secondary">
          <Link href="/job-discovery">Try another search</Link>
        </Button>
      </div>
    </Card>
  );
}

