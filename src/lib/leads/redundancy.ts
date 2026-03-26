type JsonRecord = Record<string, unknown>;

const REDUNDANCY_SIMILARITY_THRESHOLD = 0.72;
const MIN_TOKENS_FOR_FUZZY_COMPARE = 8;

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeWhitespace(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeLooseText(value: string): string {
  return normalizeWhitespace(
    value
      .toLowerCase()
      .replace(/[\u2013\u2014]/g, " ")
      .replace(/[^a-z0-9\s]/g, " "),
  );
}

function normalizeUrlForPoster(value: string): string {
  try {
    const url = new URL(value.trim());
    url.hash = "";
    url.search = "";
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return normalizeWhitespace(value);
  }
}

function readPostContext(
  sourceMetadataJson: JsonRecord | null | undefined,
): {
  primaryAuthorName: string | null;
  primaryAuthorProfileUrl: string | null;
} | null {
  if (!sourceMetadataJson) return null;
  const postContextRaw =
    sourceMetadataJson.postContext && typeof sourceMetadataJson.postContext === "object"
      ? (sourceMetadataJson.postContext as JsonRecord)
      : null;
  if (!postContextRaw) return null;

  return {
    primaryAuthorName: readTrimmedString(postContextRaw.primaryAuthorName),
    primaryAuthorProfileUrl: readTrimmedString(postContextRaw.primaryAuthorProfileUrl),
  };
}

function readExtractionRole(sourceMetadataJson: JsonRecord | null | undefined): string | null {
  if (!sourceMetadataJson) return null;
  const extractionRaw =
    sourceMetadataJson.extraction && typeof sourceMetadataJson.extraction === "object"
      ? (sourceMetadataJson.extraction as JsonRecord)
      : null;
  if (!extractionRaw) return null;
  return readTrimmedString(extractionRaw.role);
}

function resolveContentText(input: RedundancyComparable): string | null {
  return (
    readTrimmedString(input.fullText) ??
    readTrimmedString(input.snippet) ??
    readTrimmedString(input.titleOrRole) ??
    readTrimmedString(input.jobTitle) ??
    readTrimmedString(input.title)
  );
}

function toIsoMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compareByTimestamp(aMs: number | null, bMs: number | null): number {
  if (aMs == null && bMs == null) return 0;
  if (aMs == null) return -1;
  if (bMs == null) return 1;
  if (aMs > bMs) return 1;
  if (aMs < bMs) return -1;
  return 0;
}

function defaultRichnessScore(value: RedundancyComparable): number {
  let score = 0;
  if (readTrimmedString(value.fullText)) score += 3;
  if (readTrimmedString(value.snippet)) score += 2;
  if (readTrimmedString(value.titleOrRole) || readTrimmedString(value.jobTitle)) score += 2;
  if (readTrimmedString(value.author) || readTrimmedString(value.postAuthor)) score += 1;
  const sourceMetadata =
    value.sourceMetadataJson && typeof value.sourceMetadataJson === "object"
      ? value.sourceMetadataJson
      : null;
  if (sourceMetadata) score += 1;
  return score;
}

export type RedundancyComparable = {
  sourceMetadataJson?: JsonRecord | null;
  postAuthor?: string | null;
  author?: string | null;
  jobTitle?: string | null;
  titleOrRole?: string | null;
  title?: string | null;
  fullText?: string | null;
  snippet?: string | null;
  postedAt?: string | null;
  fetchedAt?: string | null;
};

export type RedundancyContentFeatures = {
  normalizedText: string;
  tokens: string[];
};

export type RedundancyCluster<T> = {
  winner: T;
  members: T[];
};

export function buildPosterKey(input: RedundancyComparable): string | null {
  const sourceMetadata =
    input.sourceMetadataJson && typeof input.sourceMetadataJson === "object"
      ? input.sourceMetadataJson
      : null;
  const postContext = readPostContext(sourceMetadata);
  const authorProfileUrl =
    readTrimmedString(postContext?.primaryAuthorProfileUrl) ??
    readTrimmedString(sourceMetadata?.authorProfileUrl);
  if (authorProfileUrl) {
    return `profile:${normalizeUrlForPoster(authorProfileUrl)}`;
  }

  const authorName =
    readTrimmedString(postContext?.primaryAuthorName) ??
    readTrimmedString(input.postAuthor) ??
    readTrimmedString(input.author);
  if (!authorName) return null;
  return `name:${normalizeLooseText(authorName)}`;
}

export function buildRoleKey(input: RedundancyComparable): string | null {
  const sourceMetadata =
    input.sourceMetadataJson && typeof input.sourceMetadataJson === "object"
      ? input.sourceMetadataJson
      : null;
  const role =
    readExtractionRole(sourceMetadata) ??
    readTrimmedString(input.jobTitle) ??
    readTrimmedString(input.titleOrRole) ??
    readTrimmedString(input.title);
  return role ? normalizeLooseText(role) : null;
}

export function buildContentTokens(input: RedundancyComparable): RedundancyContentFeatures {
  const content = resolveContentText(input);
  if (!content) {
    return {
      normalizedText: "",
      tokens: [],
    };
  }

  const normalizedText = normalizeLooseText(content);
  const tokens = Array.from(new Set(normalizedText.split(/\s+/).filter((token) => token.length > 1)));
  return {
    normalizedText,
    tokens,
  };
}

export function nearDuplicateScore(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let overlap = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) overlap += 1;
  }
  return overlap / Math.max(leftSet.size, rightSet.size);
}

export function isRedundantPostPair(
  left: RedundancyComparable,
  right: RedundancyComparable,
): boolean {
  const leftPosterKey = buildPosterKey(left);
  const rightPosterKey = buildPosterKey(right);
  if (!leftPosterKey || !rightPosterKey || leftPosterKey !== rightPosterKey) return false;

  const leftRoleKey = buildRoleKey(left);
  const rightRoleKey = buildRoleKey(right);
  if (!leftRoleKey || !rightRoleKey || leftRoleKey !== rightRoleKey) return false;

  const leftContent = buildContentTokens(left);
  const rightContent = buildContentTokens(right);
  if (!leftContent.normalizedText || !rightContent.normalizedText) return false;

  if (
    Math.min(leftContent.tokens.length, rightContent.tokens.length) < MIN_TOKENS_FOR_FUZZY_COMPARE
  ) {
    return leftContent.normalizedText === rightContent.normalizedText;
  }

  return nearDuplicateScore(leftContent.tokens, rightContent.tokens) >= REDUNDANCY_SIMILARITY_THRESHOLD;
}

export function chooseMostRecent<T extends RedundancyComparable>(left: T, right: T): T {
  const postedComparison = compareByTimestamp(toIsoMs(left.postedAt), toIsoMs(right.postedAt));
  if (postedComparison < 0) return right;
  if (postedComparison > 0) return left;

  const fetchedComparison = compareByTimestamp(toIsoMs(left.fetchedAt), toIsoMs(right.fetchedAt));
  if (fetchedComparison < 0) return right;
  if (fetchedComparison > 0) return left;

  return defaultRichnessScore(right) > defaultRichnessScore(left) ? right : left;
}

export function dedupeRedundantLeads<T>(input: {
  items: T[];
  toComparable: (item: T) => RedundancyComparable;
  getRichnessScore?: (item: T) => number;
}): {
  deduped: T[];
  droppedCount: number;
  clusters: Array<RedundancyCluster<T>>;
} {
  const clusters: Array<{
    winner: T;
    winnerComparable: RedundancyComparable;
    members: T[];
  }> = [];

  for (const item of input.items) {
    const comparable = input.toComparable(item);
    const matchedCluster = clusters.find((cluster) =>
      isRedundantPostPair(comparable, cluster.winnerComparable),
    );

    if (!matchedCluster) {
      clusters.push({
        winner: item,
        winnerComparable: comparable,
        members: [item],
      });
      continue;
    }

    matchedCluster.members.push(item);

    const preferredComparable = chooseMostRecent(matchedCluster.winnerComparable, comparable);
    const winnerShouldSwitch =
      preferredComparable === comparable ||
      (preferredComparable.postedAt === matchedCluster.winnerComparable.postedAt &&
        preferredComparable.fetchedAt === matchedCluster.winnerComparable.fetchedAt &&
        typeof input.getRichnessScore === "function" &&
        input.getRichnessScore(item) > input.getRichnessScore(matchedCluster.winner));

    if (winnerShouldSwitch) {
      matchedCluster.winner = item;
      matchedCluster.winnerComparable = comparable;
    }
  }

  const deduped = clusters.map((cluster) => cluster.winner);
  return {
    deduped,
    droppedCount: input.items.length - deduped.length,
    clusters: clusters.map((cluster) => ({
      winner: cluster.winner,
      members: cluster.members,
    })),
  };
}
