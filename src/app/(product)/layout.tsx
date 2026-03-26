import { Suspense } from "react";
import { ProductHeader } from "@/app/(product)/product-header";

export default function ProductLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Suspense fallback={<div className="h-[72px] w-full" aria-hidden />}>
        <ProductHeader />
      </Suspense>

      <main className="mx-auto w-full px-4 pt-0 pb-3 sm:pt-0 sm:pb-4">
        {children}
      </main>
    </div>
  );
}
