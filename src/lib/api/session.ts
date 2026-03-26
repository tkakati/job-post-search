import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import { dbClient } from "@/lib/db";
import { userSessions, users } from "@/lib/db/schema";

export const SESSION_COOKIE_NAME = "job_discovery_session_id";

type CookieStoreLike = {
  get(name: string): { value: string } | undefined;
  set?: (
    name: string,
    value: string,
    options?: {
      httpOnly?: boolean;
      sameSite?: "lax" | "strict" | "none";
      secure?: boolean;
      path?: string;
      maxAge?: number;
    },
  ) => void;
};

export async function ensureAnonymousSession(cookieStore: CookieStoreLike) {
  const db = dbClient();
  const now = new Date();
  let sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionId) {
    await db
      .update(userSessions)
      .set({ lastSeenAt: now })
      .where(eq(userSessions.id, sessionId));
    await db
      .update(users)
      .set({ lastSeenAt: now })
      .where(
        eq(
          users.id,
          sql`(select user_id from user_sessions where id = ${sessionId} limit 1)`,
        ),
      );
    return sessionId;
  }

  const userId = randomUUID();
  sessionId = randomUUID();
  await db.insert(users).values({ id: userId, createdAt: now, lastSeenAt: now });
  await db.insert(userSessions).values({
    id: sessionId,
    userId,
    createdAt: now,
    lastSeenAt: now,
  });

  if (cookieStore.set) {
    cookieStore.set(SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return sessionId;
}

