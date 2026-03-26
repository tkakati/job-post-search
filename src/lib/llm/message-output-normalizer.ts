export type MessageOutputNormalizerOptions = {
  authorName?: string | null;
  senderName?: string | null;
  roleTitle?: string | null;
  company?: string | null;
  userRoleFitContext?: string | null;
  postUrl?: string | null;
};

function normalizeText(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function collapseInlineWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripLongDashes(value: string) {
  return value.replace(/[—–]/g, "-");
}

function normalizeFirstName(authorName: string | null | undefined) {
  const safe = normalizeText(authorName);
  if (!safe) return "there";
  const first = safe.split(/\s+/).find((token) => token.length > 0);
  if (!first) return "there";
  return first.replace(/[^\p{L}\p{N}'-]/gu, "") || "there";
}

function normalizeSenderName(senderName: string | null | undefined) {
  return normalizeText(senderName) ?? "[Your Name]";
}

function ensureSentenceTerminalPunctuation(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/[.!?]$/.test(trimmed)) return trimmed;
  return `${trimmed}.`;
}

function splitIntoSentences(value: string) {
  const normalized = collapseInlineWhitespace(value);
  if (!normalized) return [];
  const matches = normalized.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [];
  return matches
    .map((sentence) =>
      ensureSentenceTerminalPunctuation(
        collapseInlineWhitespace(
          sentence.replace(/^[\-\*\d.\)\s]+/, "").replace(/\s*[-]{2,}\s*/g, " "),
        ),
      ),
    )
    .filter((sentence) => sentence.length > 0);
}

function buildTwoBodyParagraphs(bodyText: string, options: MessageOutputNormalizerOptions) {
  const existingParagraphs = bodyText
    .split(/\n\s*\n+/)
    .map((paragraph) => collapseInlineWhitespace(paragraph))
    .filter((paragraph) => paragraph.length > 0);

  if (existingParagraphs.length >= 2) {
    return [existingParagraphs[0], existingParagraphs[1]] as const;
  }

  const sentences = splitIntoSentences(existingParagraphs.join(" "));
  if (sentences.length === 0) {
    return buildFallbackBodyParagraphs(options);
  }
  if (sentences.length === 1) {
    const [, fallbackP2] = buildFallbackBodyParagraphs(options);
    return [sentences[0], fallbackP2] as const;
  }
  if (sentences.length === 2) {
    return [sentences[0], sentences[1]] as const;
  }
  if (sentences.length === 3) {
    return [`${sentences[0]} ${sentences[1]}`, sentences[2]] as const;
  }
  return [`${sentences[0]} ${sentences[1]}`, `${sentences[2]} ${sentences[3]}`] as const;
}

function buildFallbackBodyParagraphs(options: MessageOutputNormalizerOptions) {
  const role = normalizeText(options.roleTitle) ?? "this role";
  const company = normalizeText(options.company);
  const fitContext = normalizeText(options.userRoleFitContext);
  const postUrl = normalizeText(options.postUrl);

  const paragraphOne = company
    ? `I am reaching out about the ${role} role at ${company}, and I would welcome a quick conversation about fit.`
    : `I am reaching out about ${role}, and I would welcome a quick conversation about fit.`;

  const paragraphTwoBase = fitContext
    ? ensureSentenceTerminalPunctuation(fitContext)
    : "I can share a concise summary of relevant experience if helpful.";
  const paragraphTwo = postUrl
    ? `${paragraphTwoBase} If useful, I can also send a brief note tied directly to the post.`
    : paragraphTwoBase;

  return [paragraphOne, paragraphTwo] as const;
}

export function buildDeterministicMessageFallback(options: MessageOutputNormalizerOptions) {
  const greeting = `Hi ${normalizeFirstName(options.authorName)},`;
  const sender = normalizeSenderName(options.senderName);
  const [paragraphOne, paragraphTwo] = buildFallbackBodyParagraphs(options);

  return [greeting, "", paragraphOne, "", paragraphTwo, "", "Best,", sender].join("\n");
}

export function normalizeGeneratedMessageLayout(
  rawMessage: string,
  options: MessageOutputNormalizerOptions,
) {
  let cleaned = stripLongDashes(
    rawMessage
      .replace(/\r/g, "\n")
      .replace(/\t/g, " ")
      .replace(/[ \u00a0]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );

  if (!cleaned) {
    return buildDeterministicMessageFallback(options);
  }

  let senderFromSignoff: string | null = null;
  const multilineSignoffMatch = cleaned.match(/\n\s*Best,\s*\n\s*([^\n]+)\s*$/i);
  if (multilineSignoffMatch && typeof multilineSignoffMatch.index === "number") {
    senderFromSignoff = collapseInlineWhitespace(multilineSignoffMatch[1] ?? "")
      .replace(/[.,;:]+$/g, "")
      .trim();
    cleaned = cleaned.slice(0, multilineSignoffMatch.index).trim();
  } else {
    const inlineSignoffMatch = cleaned.match(/\sBest,\s*([^\n]+)\s*$/i);
    if (inlineSignoffMatch && typeof inlineSignoffMatch.index === "number") {
      const candidateSender = collapseInlineWhitespace(inlineSignoffMatch[1] ?? "")
        .replace(/[.,;:]+$/g, "")
        .trim();
      if (candidateSender && candidateSender.length <= 80) {
        senderFromSignoff = candidateSender;
        cleaned = cleaned.slice(0, inlineSignoffMatch.index).trim();
      }
    }
  }

  const lines = cleaned.split("\n");
  const trimmedLines = lines.map((line) => line.trim());

  const greetingLineIndex = trimmedLines.findIndex((line) => /^hi\b/i.test(line));
  const bestLineIndex = trimmedLines.findIndex((line) => /^best,\s*$/i.test(line));

  let inlineGreetingBody = "";
  if (greetingLineIndex >= 0) {
    const greetingLine = trimmedLines[greetingLineIndex];
    const commaIndex = greetingLine.indexOf(",");
    if (commaIndex >= 0 && commaIndex < greetingLine.length - 1) {
      inlineGreetingBody = collapseInlineWhitespace(greetingLine.slice(commaIndex + 1));
    }
  }

  const bodyStart = greetingLineIndex >= 0 ? greetingLineIndex + 1 : 0;
  const bodyEnd = bestLineIndex >= 0 && bestLineIndex > bodyStart ? bestLineIndex : lines.length;
  let bodyBlock = lines.slice(bodyStart, bodyEnd).join("\n").trim();
  if (inlineGreetingBody) {
    bodyBlock = [inlineGreetingBody, bodyBlock].filter(Boolean).join("\n");
  }

  const senderFromOutput = senderFromSignoff
    ? senderFromSignoff
    : bestLineIndex >= 0
      ? (trimmedLines.slice(bestLineIndex + 1).find((line) => line.length > 0) ?? null)
      : null;

  const [paragraphOne, paragraphTwo] = buildTwoBodyParagraphs(bodyBlock, options);
  const greeting = `Hi ${normalizeFirstName(options.authorName)},`;
  const sender = normalizeText(senderFromOutput) ?? normalizeSenderName(options.senderName);

  return [
    greeting,
    "",
    ensureSentenceTerminalPunctuation(paragraphOne),
    "",
    ensureSentenceTerminalPunctuation(paragraphTwo),
    "",
    "Best,",
    sender,
  ].join("\n");
}
