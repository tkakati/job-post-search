import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";

import { env } from "@/lib/env";
import { buildMessageGenerationPrompt } from "@/lib/llm/message-generation-prompt";
import {
  buildDeterministicMessageFallback,
  normalizeGeneratedMessageLayout,
} from "@/lib/llm/message-output-normalizer";

const GenerateMessageInputSchema = z.object({
  roleTitle: z.string().min(1).max(200),
  company: z.string().trim().nullable().optional(),
  locations: z.array(z.string().trim().min(1)).default([]),
  workMode: z.string().trim().nullable().optional(),
  employmentType: z.string().trim().nullable().optional(),
  postText: z.string().trim().nullable().optional(),
  authorName: z.string().trim().nullable().optional(),
  authorHeadline: z.string().trim().nullable().optional(),
  authorCompany: z.string().trim().nullable().optional(),
  authorType: z.enum(["Hiring Manager", "Recruiter", "Unknown"]).nullable().optional(),
  postUrl: z.string().url().nullable().optional(),
  userRoleFitContext: z.string().trim().nullable().optional(),
  previousMessage: z.string().trim().nullable().optional(),
  userInstruction: z.string().trim().nullable().optional(),
  resumeRawText: z.string().trim().max(20000).nullable().optional(),
  senderName: z.string().trim().max(120).nullable().optional(),
  tone: z.enum(["neutral", "warm", "direct"]).nullable().optional(),
  length: z.enum(["short", "medium"]).nullable().optional(),
});

function stripWrappingFences(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:text|md|markdown)?\s*/i, "").replace(/\s*```$/, "");
}

function stripLongDashes(value: string) {
  return value
    .replace(/\s*[—–]\s*/g, " - ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function allowsMetricsFromInstruction(instruction: string | null | undefined) {
  if (!instruction) return false;
  return /\b(add|include|mention|use|with)\b.*\b(metric|metrics|number|numbers|stat|stats|quant|percentage|%)\b/i.test(
    instruction,
  );
}

function validateGeneratedMessage(message: string, userInstruction: string | null | undefined) {
  const reasons: string[] = [];
  const normalized = message.replace(/\r/g, "").trim();
  if (!normalized) {
    reasons.push("Message is empty.");
    return { isValid: false, reasons };
  }

  const lines = normalized.split("\n").map((line) => line.trim());
  const greetingIdx = lines.findIndex((line) => line.length > 0);
  if (greetingIdx < 0 || !/^hi\b.+,\s*$/i.test(lines[greetingIdx])) {
    reasons.push("Greeting must be the first non-empty line and start with 'Hi ...,'");
  }

  const bestIdx = lines.findIndex((line) => /^best,\s*$/i.test(line));
  if (bestIdx < 0) {
    reasons.push("Sign-off line 'Best,' is missing.");
  }
  if (bestIdx >= 0 && bestIdx <= greetingIdx) {
    reasons.push("Sign-off must appear after body paragraphs.");
  }
  if (bestIdx >= 0) {
    const senderLine = lines.slice(bestIdx + 1).find((line) => line.length > 0) ?? "";
    if (!senderLine) reasons.push("Sender name line is missing after 'Best,'.");
  }

  let bodyParagraphCount = 0;
  if (greetingIdx >= 0 && bestIdx > greetingIdx) {
    const bodyBlock = lines
      .slice(greetingIdx + 1, bestIdx)
      .join("\n")
      .trim();
    bodyParagraphCount = bodyBlock
      .split(/\n\s*\n+/)
      .map((paragraph) => paragraph.trim())
      .filter((paragraph) => paragraph.length > 0).length;
  }
  if (bodyParagraphCount !== 2) {
    reasons.push("Body must contain exactly 2 paragraphs.");
  }

  const lowered = normalized.toLowerCase();
  const bannedOpenings = [
    "hope you're doing well",
    "i came across your post",
    "i love what you're doing",
  ];
  for (const banned of bannedOpenings) {
    if (lowered.includes(banned)) {
      reasons.push(`Contains banned phrase: "${banned}"`);
    }
  }

  const boastfulPattern =
    /\b(world[- ]class|best[- ]in[- ]class|rockstar|ninja|thought leader|industry-leading|at scale|serving)\b/i;
  if (boastfulPattern.test(normalized)) {
    reasons.push("Contains boastful language.");
  }

  const metricsAllowed = allowsMetricsFromInstruction(userInstruction);
  const numericPattern =
    /(?:\b\d[\d,.\-]*(?:%|k|m|b)?\b|~\s*\d+|\b\d+\s*(?:million|billion|users?|customers?|x)\b)/i;
  if (!metricsAllowed && numericPattern.test(normalized)) {
    reasons.push("Contains numeric metrics without explicit user request.");
  }

  if (/[—–]/.test(normalized)) {
    reasons.push("Contains long dashes (em/en dash).");
  }

  return {
    isValid: reasons.length === 0,
    reasons,
  };
}

function buildCorrectionInstruction(
  originalInstruction: string | null | undefined,
  reasons: string[],
) {
  const lines = [
    originalInstruction ? `Original user instruction: ${originalInstruction}` : null,
    "Fix-only rewrite of the previous message.",
    "Keep role and context intact, but satisfy all constraints below:",
    "- Natural, continuous prose with exactly 2 short body paragraphs.",
    "- Greeting first line and sign-off with sender name.",
    "- Soft conversational CTA.",
    "- No boastful language.",
    "- No numeric metrics unless explicitly requested.",
    "- No long dashes (em/en dash). Use commas, periods, or short hyphen.",
    "Issues to fix:",
    ...reasons.map((reason) => `- ${reason}`),
  ].filter((line): line is string => Boolean(line));

  return lines.join("\n");
}

async function generateMessageFromPrompt(client: OpenAI, model: string, prompt: string) {
  const completion = await client.responses.create({
    model,
    input: prompt,
    text: { format: { type: "text" } },
    max_output_tokens: 300,
  });
  return stripWrappingFences(completion.output_text?.trim() ?? "");
}

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = GenerateMessageInputSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { message: "Invalid message generation payload" } },
        { status: 400 },
      );
    }

    const apiKey = env.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: { message: "OPENAI_API_KEY is not configured" } },
        { status: 500 },
      );
    }

    const model = env.OPENAI_CHAT_MODEL ?? process.env.OPENAI_CHAT_MODEL ?? "gpt-5.2";
    const input = parsed.data;
    const normalizationOptions = {
      authorName: input.authorName ?? null,
      senderName: input.senderName ?? null,
      roleTitle: input.roleTitle,
      company: input.company ?? null,
      userRoleFitContext: input.userRoleFitContext ?? null,
      postUrl: input.postUrl ?? null,
    };
    const prompt = buildMessageGenerationPrompt({
      roleTitle: input.roleTitle,
      company: input.company ?? null,
      locations: input.locations,
      workMode: input.workMode ?? null,
      employmentType: input.employmentType ?? null,
      postText: input.postText ?? null,
      authorName: input.authorName ?? null,
      authorHeadline: input.authorHeadline ?? null,
      authorCompany: input.authorCompany ?? null,
      authorType: input.authorType ?? null,
      postUrl: input.postUrl ?? null,
      userRoleFitContext: input.userRoleFitContext ?? null,
      previousMessage: input.previousMessage ?? null,
      userInstruction: input.userInstruction ?? null,
      resumeRawText: input.resumeRawText ?? null,
      senderName: input.senderName ?? null,
      tone: input.tone ?? null,
      length: input.length ?? null,
    });

    const client = new OpenAI({ apiKey });
    const message = normalizeGeneratedMessageLayout(
      stripLongDashes(await generateMessageFromPrompt(client, model, prompt)),
      normalizationOptions,
    );
    if (!message) {
      return NextResponse.json(
        { ok: false, error: { message: "Message generation returned empty output" } },
        { status: 502 },
      );
    }

    const initialValidation = validateGeneratedMessage(message, input.userInstruction ?? null);
    if (initialValidation.isValid) {
      return NextResponse.json({ ok: true, data: { message } });
    }

    const correctionPrompt = buildMessageGenerationPrompt({
      roleTitle: input.roleTitle,
      company: input.company ?? null,
      locations: input.locations,
      workMode: input.workMode ?? null,
      employmentType: input.employmentType ?? null,
      postText: input.postText ?? null,
      authorName: input.authorName ?? null,
      authorHeadline: input.authorHeadline ?? null,
      authorCompany: input.authorCompany ?? null,
      authorType: input.authorType ?? null,
      postUrl: input.postUrl ?? null,
      userRoleFitContext: input.userRoleFitContext ?? null,
      previousMessage: message,
      userInstruction: buildCorrectionInstruction(
        input.userInstruction ?? null,
        initialValidation.reasons,
      ),
      resumeRawText: input.resumeRawText ?? null,
      senderName: input.senderName ?? null,
      tone: input.tone ?? null,
      length: input.length ?? null,
    });

    const correctedMessage = stripLongDashes(
      await generateMessageFromPrompt(client, model, correctionPrompt),
    );
    const normalizedCorrectedMessage = normalizeGeneratedMessageLayout(
      correctedMessage,
      normalizationOptions,
    );
    const correctedValidation = validateGeneratedMessage(
      normalizedCorrectedMessage,
      input.userInstruction ?? null,
    );
    if (!correctedValidation.isValid) {
      const deterministicFallback = normalizeGeneratedMessageLayout(
        buildDeterministicMessageFallback(normalizationOptions),
        normalizationOptions,
      );
      const deterministicValidation = validateGeneratedMessage(
        deterministicFallback,
        input.userInstruction ?? null,
      );
      console.warn("message_generation_quality_warning", {
        initialReasons: initialValidation.reasons,
        correctedReasons: correctedValidation.reasons,
        deterministicFallbackReasons: deterministicValidation.reasons,
      });
      return NextResponse.json({ ok: true, data: { message: deterministicFallback } });
    }

    return NextResponse.json({ ok: true, data: { message: normalizedCorrectedMessage } });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          message: error instanceof Error ? error.message : "Unexpected message generation error",
        },
      },
      { status: 500 },
    );
  }
}
