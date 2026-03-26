export type MessageAuthorType = "Hiring Manager" | "Recruiter" | "Unknown";

export type MessageTone = "neutral" | "warm" | "direct";
export type MessageLength = "short" | "medium";

export type MessageGenerationPromptInput = {
  authorName?: string | null;
  authorHeadline?: string | null;
  authorCompany?: string | null;
  authorType?: MessageAuthorType | null;
  senderName?: string | null;
  resumeRawText?: string | null;
  company?: string | null;
  roleTitle: string;
  workMode?: string | null;
  employmentType?: string | null;
  locations: string[];
  postText?: string | null;
  postUrl?: string | null;
  userRoleFitContext?: string | null;
  previousMessage?: string | null;
  userInstruction?: string | null;
  // Optional for future product controls. Keep defaults for now.
  tone?: MessageTone | null;
  length?: MessageLength | null;
};

function toOrUnknown(value: string | null | undefined, fallback = "Unknown") {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function clampText(value: string | null | undefined, maxChars: number): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars)}...`;
}

function firstNameFromAuthor(authorName: string | null | undefined) {
  const normalized = toOrUnknown(authorName, "there");
  const first = normalized.split(/\s+/).find((token) => token.length > 0);
  return first ?? "there";
}

function resolveSenderName(senderName: string | null | undefined) {
  return normalizeText(senderName) ?? "[Your Name]";
}

export function buildMessageGenerationPrompt(input: MessageGenerationPromptInput): string {
  const systemPrompt = [
    "You write high-quality LinkedIn outreach messages for hiring posts.",
    "The goal is to produce messages that feel human, specific, thoughtful, and worth replying to.",
    "Avoid generic recruiter-style language.",
    "",
    "INPUTS",
    "- author_first_name: string",
    "- role_detected: string",
    "- company_detected: string",
    "- post_text: string",
    "- resume_raw_text: string | null",
    "- sender_name: string",
    "- previous_message: string | null",
    "- user_instruction: string | null",
    "",
    "OUTPUT FORMAT (STRICT)",
    "Hi {author_first_name},",
    "",
    "{Paragraph 1}",
    "",
    "{Paragraph 2}",
    "",
    "Best,",
    "{sender_name}",
    "",
    "STRUCTURE",
    "Paragraph 1 (max 2 sentences):",
    "- Reference the hiring context clearly (role + company).",
    "- Show you understood the post or hiring intent.",
    "- Avoid generic phrasing.",
    "Paragraph 2 (max 2 sentences):",
    "- Show why you are relevant using resume (if available).",
    "- Explain why that experience connects to the role.",
    "- End with a natural, low-friction CTA.",
    "",
    "RESUME USAGE RULE (CRITICAL)",
    "If resume_raw_text is provided:",
    "1) Extract 1-2 highly relevant signals aligned to the role.",
    "2) Convert those into conversational proof.",
    "3) Prefer depth over breadth: one strong signal over multiple weak signals.",
    "If resume_raw_text is missing or weak:",
    "- Use a general but credible positioning.",
    "- Do not hallucinate specifics.",
    "",
    "CTA RULE",
    "- Use a soft, natural closing line.",
    "- Avoid pushy closing lines.",
    "",
    "WRITING RULES",
    "- Total length: 80-130 words.",
    "- Exactly 2 paragraphs.",
    "- Each paragraph must be complete and natural.",
    "- No sentence fragments.",
    "- No repetition of the role awkwardly.",
    "- No robotic phrasing.",
    "",
    "TONE",
    "- Warm but not flattering.",
    "- Confident but not pushy.",
    "- Clear and concise.",
    "- No buzzwords.",
    "- No filler.",
    "",
    "BANNED PATTERNS",
    "- hope you're doing well",
    "- I came across your post",
    "- I love what you're doing",
    "- generic admiration",
    "- repeated role mentions",
    "",
    "METRICS RULE",
    "- Do not include numbers, percentages, or quantified impact by default.",
    "- Only include metrics if user_instruction explicitly asks for them.",
    "",
    "PUNCTUATION RULE",
    "- Do not use long dashes (em dash or en dash). Use commas or periods instead.",
    "",
    "REGENERATION LOGIC",
    "- If previous_message is null: generate from scratch.",
    "- If previous_message exists: treat it as base and apply user_instruction as targeted edit.",
    "- Preserve structure unless instruction says otherwise.",
    "- Do not fully rewrite unless instruction says rewrite.",
    "- If user_instruction conflicts with format/safety rules, keep format/safety rules.",
    "",
    "INSTRUCTION MAPPING",
    "- shorter: tighten wording and reduce length.",
    "- more direct: clearer CTA and sharper phrasing.",
    "- more aggressive: stronger ask while staying professional.",
    "- more formal: cleaner and more polished tone.",
    "- more casual: lighter tone while staying credible.",
    "- add X: incorporate X without breaking structure.",
    "- remove X: remove cleanly and rebalance.",
    "- rewrite: full rewrite allowed.",
    "",
    "SPECIFICITY RULE (CRITICAL)",
    "- Must include at least one meaningful reference to the role or hiring context, OR a strong relevant signal from resume.",
    "- Avoid vague claims.",
    "",
    "QUALITY CHECK BEFORE OUTPUT",
    "- Ensure no fragments, no repetition, and no generic phrasing.",
    "- Ensure both paragraphs feel natural and human.",
    "",
    "Return plain text only. No markdown.",
  ].join("\n");

  const normalizedLocations = input.locations
    .map((loc) => loc.trim())
    .filter((loc) => loc.length > 0);
  const authorFirstName = firstNameFromAuthor(input.authorName);

  const inputPayload = {
    author_first_name: authorFirstName && authorFirstName !== "there" ? authorFirstName : "there",
    role_detected: toOrUnknown(input.roleTitle),
    company_detected: toOrUnknown(input.company),
    post_text: toOrUnknown(input.postText, "Not provided"),
    resume_raw_text: clampText(input.resumeRawText, 12000),
    sender_name: resolveSenderName(input.senderName),
    previous_message: input.previousMessage ?? null,
    user_instruction: input.userInstruction ?? null,
    location_detected: normalizedLocations.length > 0 ? normalizedLocations.join(" • ") : null,
    work_mode: normalizeText(input.workMode),
    employment_type: normalizeText(input.employmentType),
    post_url: normalizeText(input.postUrl),
    user_profile_summary: normalizeText(input.userRoleFitContext),
  };

  return [
    systemPrompt,
    "",
    "Inputs (JSON):",
    JSON.stringify(inputPayload, null, 2),
    "",
    "Return only the final message.",
  ].join("\n");
}
