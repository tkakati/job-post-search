import { NextResponse } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";

const clerkEnabled = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
);

const proxy = clerkEnabled
  ? clerkMiddleware(() => {
      // Optional auth mode: no route protection, just Clerk context wiring.
    })
  : () => NextResponse.next();

export default proxy;

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/"],
};
