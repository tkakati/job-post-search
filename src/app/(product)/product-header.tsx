"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export function ProductHeader() {
  const lastYRef = React.useRef(0);
  const rafRef = React.useRef<number | null>(null);
  const latestYRef = React.useRef(0);
  const headerOffsetRef = React.useRef(0);
  const headerRef = React.useRef<HTMLElement | null>(null);
  const [headerOffsetPx, setHeaderOffsetPx] = React.useState(0);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeView: "post-feed" | "agent" = React.useMemo(() => {
    const view = searchParams?.get("view");
    if (pathname === "/posts-feed") return "post-feed";
    if (pathname === "/home") return view === "agent" ? "agent" : "post-feed";
    return view === "agent" ? "agent" : "post-feed";
  }, [pathname, searchParams]);

  React.useEffect(() => {
    const processScrollFrame = () => {
      const y = Math.max(0, latestYRef.current);
      const delta = y - lastYRef.current;
      const headerHeight = Math.max(0, headerRef.current?.offsetHeight ?? 0);
      let nextOffset = headerOffsetRef.current;

      if (y <= 8) {
        nextOffset = 0;
      } else if (delta > 0) {
        nextOffset = Math.min(headerHeight, nextOffset + delta);
      } else if (delta < 0) {
        nextOffset = Math.max(0, nextOffset + delta);
      }

      headerOffsetRef.current = nextOffset;
      setHeaderOffsetPx(nextOffset);
      lastYRef.current = y;
      rafRef.current = null;
    };

    const onScroll = () => {
      latestYRef.current = window.scrollY;
      if (rafRef.current == null) {
        rafRef.current = window.requestAnimationFrame(processScrollFrame);
      }
    };

    latestYRef.current = window.scrollY;
    lastYRef.current = window.scrollY;
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return (
    <header
      ref={headerRef}
      className={cn(
        "sticky top-0 z-20 border-b border-[var(--intent-muted-border)] bg-[var(--section-nav-bg)]/95 shadow-[0_6px_16px_-14px_rgba(15,23,42,0.35)] backdrop-blur-md will-change-transform",
      )}
      style={{ transform: `translateY(-${headerOffsetPx}px)` }}
    >
      <div className="relative mx-auto flex w-full items-center px-4 py-2">
        <Link
          href="/home?view=post-feed"
          className="group flex items-center gap-2.5 leading-tight"
        >
          <Image
            src="/brand/hirefeed-logo.svg"
            alt="HireFeed logo"
            width={68}
            height={68}
            className="h-12 w-12 shrink-0 sm:h-14 sm:w-14"
            priority
          />
          <div>
            <div className="text-xl font-semibold tracking-tight text-foreground transition-colors duration-200 group-hover:text-[var(--intent-primary)] sm:text-2xl">
              HireFeed
            </div>
            <div className="text-xs text-muted-foreground/90 sm:text-sm">
              Find hiring posts. Not job listings.
            </div>
          </div>
        </Link>

        <nav className="absolute left-1/2 -translate-x-1/2">
          <div
            role="tablist"
            aria-label="View mode"
            className="relative grid h-10 grid-cols-2 items-center rounded-full border border-[var(--intent-muted-border)] bg-muted p-1"
          >
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute bottom-1 left-1 top-1 w-[calc(50%-0.25rem)] rounded-full border border-black bg-black shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-transform duration-300 ease-out",
                activeView === "agent"
                  ? "translate-x-[calc(100%+0.25rem)]"
                  : "translate-x-0",
              )}
            />
            <Link
              href="/home?view=post-feed"
              role="tab"
              aria-selected={activeView === "post-feed"}
              className={cn(
                "relative z-10 flex h-8 min-w-[112px] items-center justify-center rounded-full px-4 text-sm font-medium transition-colors duration-200",
                activeView === "post-feed"
                  ? "text-white"
                  : "text-muted-foreground hover:bg-background hover:text-foreground",
              )}
            >
              Post Feed
            </Link>
            <Link
              href="/home?view=agent"
              role="tab"
              aria-selected={activeView === "agent"}
              className={cn(
                "relative z-10 flex h-8 min-w-[112px] items-center justify-center rounded-full px-4 text-sm font-medium transition-colors duration-200",
                activeView === "agent"
                  ? "text-white"
                  : "text-muted-foreground hover:bg-background hover:text-foreground",
              )}
            >
              Agent View
            </Link>
          </div>
        </nav>

        <div className="ml-auto w-[220px]" aria-hidden />
      </div>
    </header>
  );
}
