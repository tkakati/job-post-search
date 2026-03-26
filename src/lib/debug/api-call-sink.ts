import { AsyncLocalStorage } from "node:async_hooks";

export type DebugApiCallPayload = {
  node?: string;
  api: string;
  method: string;
  /** Sanitized URL (no secrets). */
  url?: string;
  input: unknown;
  output: unknown;
};

const storage = new AsyncLocalStorage<(payload: DebugApiCallPayload) => void>();

/**
 * Runs `fn` with an AsyncLocalStorage sink so nested HTTP/LLM helpers can emit
 * debug rows without threading callbacks through the agent graph state.
 */
export function runWithDebugApiCallSink<T>(
  sink: (payload: DebugApiCallPayload) => void,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(sink, fn);
}

export function emitDebugApiCall(payload: DebugApiCallPayload): void {
  const sink = storage.getStore();
  if (sink) sink(payload);
}

export function redactApifyUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.searchParams.has("token")) {
      u.searchParams.set("token", "[redacted]");
    }
    return u.toString();
  } catch {
    return url.replace(/([?&]token=)[^&]*/gi, "$1[redacted]");
  }
}
