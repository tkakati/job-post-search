"use client";

import * as React from "react";
import { SignIn, useAuth } from "@clerk/nextjs";

export function ProductAuthOverlay() {
  const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  const { isLoaded, isSignedIn } = useAuth();
  const [isGuestBypassed, setIsGuestBypassed] = React.useState(false);

  if (!clerkEnabled || isGuestBypassed || (isLoaded && isSignedIn)) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      {isLoaded ? (
        <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card/95 p-4 shadow-lg">
          <div className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">Sign in to personalize your feed</h2>
            <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
              <li>Save posts across runs and role/location combinations</li>
              <li>Keep your hidden posts hidden in future runs</li>
              <li>Get a durable feed tied to your account</li>
            </ul>
          </div>
          <SignIn
            routing="hash"
            forceRedirectUrl="/home?view=post-feed"
            fallbackRedirectUrl="/home?view=post-feed"
            signUpForceRedirectUrl="/home?view=post-feed"
            signUpFallbackRedirectUrl="/home?view=post-feed"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setIsGuestBypassed(true)}
              className="inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Continue as guest
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-border bg-card px-4 py-2 text-sm text-muted-foreground">
          Loading sign-in...
        </div>
      )}
    </div>
  );
}
