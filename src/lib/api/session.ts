import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { dbClient } from "@/lib/db";
import { userSessions, users } from "@/lib/db/schema";

export const SESSION_COOKIE_NAME = "job_discovery_session_id";
const CLERK_USER_PREFIX = "clerk:";

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

export type UserSessionContext = {
  userId: string;
  userSessionId: string;
  sessionScopeIds: string[];
  isAuthenticated: boolean;
};

export function isClerkConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
  );
}

export async function readOptionalClerkUserId() {
  if (!isClerkConfigured()) return null;
  try {
    const { auth } = await import("@clerk/nextjs/server");
    const authState = await auth();
    if (!authState || typeof authState.userId !== "string") return null;
    const trimmed = authState.userId.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

function isClerkBackedUserId(userId: string) {
  return userId.startsWith(CLERK_USER_PREFIX);
}

function toClerkBackedUserId(clerkUserId: string) {
  return `${CLERK_USER_PREFIX}${clerkUserId.trim()}`;
}

async function touchSessionAndUser(input: { sessionId: string; userId: string; now: Date }) {
  const db = dbClient();
  await db
    .update(userSessions)
    .set({ lastSeenAt: input.now })
    .where(eq(userSessions.id, input.sessionId));
  await db
    .update(users)
    .set({ lastSeenAt: input.now })
    .where(eq(users.id, input.userId));
}

async function ensureUserRecord(userId: string, now: Date) {
  const db = dbClient();
  await db
    .insert(users)
    .values({ id: userId, createdAt: now, lastSeenAt: now })
    .onConflictDoUpdate({
      target: users.id,
      set: { lastSeenAt: now },
    });
}

function setSessionCookie(cookieStore: CookieStoreLike, sessionId: string) {
  if (!cookieStore.set) return;
  cookieStore.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

async function createSessionForUser(input: {
  cookieStore: CookieStoreLike;
  userId: string;
  now: Date;
}) {
  const db = dbClient();
  const sessionId = randomUUID();
  await ensureUserRecord(input.userId, input.now);
  await db.insert(userSessions).values({
    id: sessionId,
    userId: input.userId,
    createdAt: input.now,
    lastSeenAt: input.now,
  });
  setSessionCookie(input.cookieStore, sessionId);
  return sessionId;
}

async function readSessionOwner(sessionId: string) {
  const db = dbClient();
  const rows = await db
    .select({
      id: userSessions.id,
      userId: userSessions.userId,
    })
    .from(userSessions)
    .where(eq(userSessions.id, sessionId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return row;
}

async function readSessionScopeIdsForUser(userId: string) {
  const db = dbClient();
  const rows = await db
    .select({ id: userSessions.id })
    .from(userSessions)
    .where(eq(userSessions.userId, userId));
  return rows.map((row) => row.id).filter((value) => value.trim().length > 0);
}

export async function ensureUserSessionContext(input: {
  cookieStore: CookieStoreLike;
  clerkUserId?: string | null;
}): Promise<UserSessionContext> {
  const now = new Date();
  const rawSessionId = input.cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const sessionIdFromCookie =
    typeof rawSessionId === "string" && rawSessionId.trim().length > 0
      ? rawSessionId.trim()
      : null;
  const sessionOwner = sessionIdFromCookie ? await readSessionOwner(sessionIdFromCookie) : null;
  const clerkUserId =
    typeof input.clerkUserId === "string" && input.clerkUserId.trim().length > 0
      ? input.clerkUserId.trim()
      : null;

  if (clerkUserId) {
    const userId = toClerkBackedUserId(clerkUserId);
    let userSessionId = sessionOwner?.id ?? null;
    if (!sessionOwner || sessionOwner.userId !== userId) {
      userSessionId = await createSessionForUser({
        cookieStore: input.cookieStore,
        userId,
        now,
      });
    } else {
      await touchSessionAndUser({ sessionId: sessionOwner.id, userId, now });
    }
    const sessionScopeIds = await readSessionScopeIdsForUser(userId);
    return {
      userId,
      userSessionId: userSessionId ?? sessionScopeIds[0] ?? "",
      sessionScopeIds:
        sessionScopeIds.length > 0
          ? sessionScopeIds
          : userSessionId
            ? [userSessionId]
            : [],
      isAuthenticated: true,
    };
  }

  if (sessionOwner && !isClerkBackedUserId(sessionOwner.userId)) {
    await touchSessionAndUser({
      sessionId: sessionOwner.id,
      userId: sessionOwner.userId,
      now,
    });
    return {
      userId: sessionOwner.userId,
      userSessionId: sessionOwner.id,
      sessionScopeIds: [sessionOwner.id],
      isAuthenticated: false,
    };
  }

  const anonymousUserId = randomUUID();
  const anonymousSessionId = await createSessionForUser({
    cookieStore: input.cookieStore,
    userId: anonymousUserId,
    now,
  });
  return {
    userId: anonymousUserId,
    userSessionId: anonymousSessionId,
    sessionScopeIds: [anonymousSessionId],
    isAuthenticated: false,
  };
}

export async function readUserSessionContextForSSR(input: {
  cookieStore: CookieStoreLike;
  clerkUserId?: string | null;
}): Promise<Pick<UserSessionContext, "sessionScopeIds">> {
  const rawSessionId = input.cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const sessionIdFromCookie =
    typeof rawSessionId === "string" && rawSessionId.trim().length > 0
      ? rawSessionId.trim()
      : null;
  const sessionOwner = sessionIdFromCookie ? await readSessionOwner(sessionIdFromCookie) : null;
  const clerkUserId =
    typeof input.clerkUserId === "string" && input.clerkUserId.trim().length > 0
      ? input.clerkUserId.trim()
      : null;

  if (clerkUserId) {
    const userId = toClerkBackedUserId(clerkUserId);
    const sessionScopeIds = await readSessionScopeIdsForUser(userId);
    return { sessionScopeIds };
  }

  if (sessionOwner && !isClerkBackedUserId(sessionOwner.userId)) {
    return { sessionScopeIds: [sessionOwner.id] };
  }

  return { sessionScopeIds: [] };
}
