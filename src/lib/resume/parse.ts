import mammoth from "mammoth";
import pdfParse from "pdf-parse/lib/pdf-parse.js";

export type ResumeParseResult = {
  rawText: string;
  inferredName: string | null;
};

const MAX_PARSED_RESUME_CHARS = 12000;

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}...`;
}

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function looksLikeNameLine(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  if (normalized.length > 64) return false;
  if (/\d/.test(normalized)) return false;
  if (/@|https?:\/\//i.test(normalized)) return false;
  if (/resume|curriculum vitae|cv/i.test(normalized)) return false;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length < 2 || tokens.length > 4) return false;
  return tokens.every((token) => /^[a-zA-Z.'-]+$/.test(token));
}

function inferNameFromResumeText(rawText: string): string | null {
  const lines = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);
  for (const line of lines) {
    if (!looksLikeNameLine(line)) continue;
    return toTitleCase(line);
  }
  return null;
}

function inferNameFromFileName(fileName: string): string | null {
  const base = fileName.replace(/\.[^.]+$/, "").trim();
  if (!base) return null;
  const normalized = base
    .replace(/[_-]+/g, " ")
    .replace(/\b(resume|cv|curriculum vitae)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!looksLikeNameLine(normalized)) return null;
  return toTitleCase(normalized);
}

export function inferNameFromResume(rawText: string, fileName?: string | null): string | null {
  return (
    inferNameFromResumeText(rawText) ??
    (fileName ? inferNameFromFileName(fileName) : null)
  );
}

export async function parseResumeBuffer(input: {
  fileName: string;
  mimeType: string;
  fileBuffer: Buffer;
}): Promise<ResumeParseResult> {
  const mime = input.mimeType.toLowerCase();
  const fileName = input.fileName.toLowerCase();
  const isPdf = mime === "application/pdf" || fileName.endsWith(".pdf");
  const isDocx =
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    fileName.endsWith(".docx");

  if (!isPdf && !isDocx) {
    throw new Error("Unsupported resume format. Upload a PDF or DOCX file.");
  }

  let rawText = "";
  if (isPdf) {
    const parsed = await pdfParse(input.fileBuffer);
    rawText = typeof parsed.text === "string" ? parsed.text : "";
  } else {
    const parsed = await mammoth.extractRawText({ buffer: input.fileBuffer });
    rawText = typeof parsed.value === "string" ? parsed.value : "";
  }

  const normalized = normalizeWhitespace(rawText);
  if (!normalized) {
    throw new Error("Could not extract text from this resume.");
  }

  const bounded = truncateText(normalized, MAX_PARSED_RESUME_CHARS);
  const inferredName = inferNameFromResume(bounded, input.fileName);
  return {
    rawText: bounded,
    inferredName,
  };
}
