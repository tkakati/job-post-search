type LogLevel = "debug" | "info" | "warn" | "error";

type LogPayload = Record<string, unknown>;

function safePayload(payload?: LogPayload) {
  if (!payload) return {};
  try {
    return JSON.parse(JSON.stringify(payload)) as LogPayload;
  } catch {
    return { note: "payload_not_serializable" };
  }
}

function write(level: LogLevel, message: string, payload?: LogPayload) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...safePayload(payload),
  };
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug(message: string, payload?: LogPayload) {
    write("debug", message, payload);
  },
  info(message: string, payload?: LogPayload) {
    write("info", message, payload);
  },
  warn(message: string, payload?: LogPayload) {
    write("warn", message, payload);
  },
  error(message: string, payload?: LogPayload) {
    write("error", message, payload);
  },
};

