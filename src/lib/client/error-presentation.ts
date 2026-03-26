export type UiErrorSource = "run" | "message_generation" | "resume_parse" | "generic";

export type SummarizeUiErrorInput = {
  rawMessage?: string | null;
  source?: UiErrorSource;
  code?: string | null;
  maxChars?: number;
};

export function toSingleLine(text: string) {
  return text.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

export function truncateUiSummary(text: string, maxChars = 140) {
  if (text.length <= maxChars) return text;
  const clipped = text.slice(0, Math.max(0, maxChars - 1)).trimEnd();
  return `${clipped}...`;
}

function mapKnownErrorToSummary(input: SummarizeUiErrorInput) {
  const code = (input.code ?? "").trim().toLowerCase();
  const raw = toSingleLine((input.rawMessage ?? "").toLowerCase());

  if (
    code.includes("missing_database_url") ||
    raw.includes("database_url") ||
    raw.includes("missing database")
  ) {
    return "Search is temporarily unavailable due to server configuration.";
  }

  if (code.includes("openai_api_key") || raw.includes("openai_api_key")) {
    return "Message generation is temporarily unavailable right now.";
  }

  if (
    raw.includes("apify") ||
    raw.includes("profile_scraper") ||
    raw.includes("provider_execute_failed") ||
    raw.includes("dataset fetch failed")
  ) {
    return "Couldn't fetch posts right now. Please retry.";
  }

  if (input.source === "resume_parse") {
    return "Couldn't parse this resume. Upload a PDF or DOCX up to 5 MB.";
  }

  if (input.source === "message_generation") {
    return "Couldn't generate a message. Please retry.";
  }

  if (input.source === "run") {
    return "Run failed. Please try again.";
  }

  return null;
}

export function summarizeUiError(input: SummarizeUiErrorInput) {
  const summary =
    mapKnownErrorToSummary(input) ??
    (input.source === "message_generation"
      ? "Couldn't generate a message. Please retry."
      : input.source === "resume_parse"
        ? "Couldn't parse this resume. Upload a PDF or DOCX up to 5 MB."
        : input.source === "run"
          ? "Run failed. Please try again."
          : "Something went wrong. Please retry.");

  return truncateUiSummary(toSingleLine(summary), input.maxChars ?? 140);
}
