export type LinkedinPostContext = {
  isRepost: boolean;
  primaryPostUrl: string | null;
  primaryAuthorName: string | null;
  primaryAuthorProfileUrl: string | null;
  primaryText: string | null;
  reposterAuthorName: string | null;
  reposterAuthorProfileUrl: string | null;
  reposterText: string | null;
};

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toAuthorString(value: unknown): string | null {
  if (typeof value === "string") return readString(value);
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const direct =
    readString(source.name) ??
    readString(source.fullName) ??
    readString(source.headline) ??
    readString(source.occupation);
  if (direct) return direct;
  const first = readString(source.firstName);
  const last = readString(source.lastName);
  if (!first && !last) return null;
  return [first, last].filter((part): part is string => Boolean(part)).join(" ");
}

function readAuthorName(value: Record<string, unknown>): string | null {
  return readString(value.authorName) ?? toAuthorString(value.author);
}

function readAuthorProfileUrl(value: Record<string, unknown>): string | null {
  const direct = readString(value.authorProfileUrl);
  if (direct) return direct;
  const author =
    value.author && typeof value.author === "object"
      ? (value.author as Record<string, unknown>)
      : null;
  return author ? readString(author.profileUrl) : null;
}

function readPostUrl(value: Record<string, unknown>): string | null {
  return readString(value.postUrl) ?? readString(value.url);
}

function readPostText(value: Record<string, unknown>): string | null {
  return (
    readString(value.text) ??
    readString(value.description) ??
    readString(value.title)
  );
}

export function resolveLinkedinPostContext(
  raw: Record<string, unknown>,
): LinkedinPostContext {
  const resharedPost =
    raw.resharedPost && typeof raw.resharedPost === "object"
      ? (raw.resharedPost as Record<string, unknown>)
      : null;
  const isRepost = raw.isRepost === true || Boolean(resharedPost);

  const reposterAuthorName = readAuthorName(raw);
  const reposterAuthorProfileUrl = readAuthorProfileUrl(raw);
  const reposterText = readPostText(raw);
  const reposterPostUrl = readPostUrl(raw);

  const originalPostUrl = resharedPost ? readPostUrl(resharedPost) : null;
  const originalAuthorName = resharedPost ? readAuthorName(resharedPost) : null;
  const originalAuthorProfileUrl = resharedPost ? readAuthorProfileUrl(resharedPost) : null;
  const originalText = resharedPost ? readPostText(resharedPost) : null;

  return {
    isRepost,
    primaryPostUrl: originalPostUrl ?? reposterPostUrl,
    primaryAuthorName: originalAuthorName ?? reposterAuthorName,
    primaryAuthorProfileUrl: originalAuthorProfileUrl ?? reposterAuthorProfileUrl,
    primaryText: originalText ?? reposterText,
    reposterAuthorName,
    reposterAuthorProfileUrl,
    reposterText,
  };
}
