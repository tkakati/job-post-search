"use client";

import * as React from "react";
import { Copy, ExternalLink, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { LocationDisplayOutput } from "@/lib/location/display";
import {
  formatWorkMode,
  type AuthorTypeLabel,
} from "@/lib/post-feed/formatters";
import {
  POST_REVIEW_STATUS_LABELS,
  POST_REVIEW_STATUS_UI,
  POST_REVIEW_STATUS_VALUES,
  type PostReviewStatus,
} from "@/lib/post-feed/status";
import {
  buildPostCardDisplayModel,
  type PostCardTagTone,
} from "@/lib/post-feed/post-card-display";

export type PostCardProps = {
  title: string;
  company?: string | null;
  locationDisplay: LocationDisplayOutput;
  postAuthor?: string | null;
  authorHeadline?: string | null;
  authorCompany?: string | null;
  authorTypeLabel: AuthorTypeLabel;
  postedAt?: string | null;
  workMode?: string | null;
  leadScore?: number | null;
  roleMatchScore?: number | null;
  locationMatchScore?: number | null;
  authorStrengthScore?: number | null;
  hiringIntentScore?: number | null;
  // Backward-compatible alias for pre-migration payloads.
  engagementScore?: number | null;
  employmentTypeScore?: number | null;
  baseScore?: number | null;
  intentBoost?: number | null;
  finalScore100?: number | null;
  gatedToZero?: boolean;
  gateReason?: "hiring_intent_zero" | "employment_type_mismatch" | "hard_location_mismatch" | null;
  sourceBadge?: "retrieved" | "fresh" | "both" | null;
  isNew?: boolean;
  postUrl?: string | null;
  selectedLocation?: string | null;
  onGenerateMessage?: () => void;
  onRegenerateMessage?: () => void;
  isMessageGenerating?: boolean;
  messageDraft?: string | null;
  messageError?: string | null;
  onDismissMessageError?: () => void;
  onCopyMessage?: () => void;
  isMessageCopied?: boolean;
  onOpenMessageDrawer?: () => void;
  showResumeNudge?: boolean;
  status?: PostReviewStatus;
  onStatusChange?: (status: PostReviewStatus) => void;
  isLocationLowConfidence?: boolean;
  isCompanyLowConfidence?: boolean;
  isPostedByCompany?: boolean;
};

type TruncationHoverTooltipProps = {
  text?: string | null;
  children: React.ReactNode;
  className?: string;
  tooltipClassName?: string;
};

function TruncationHoverTooltip({
  text,
  children,
  className,
  tooltipClassName,
}: TruncationHoverTooltipProps) {
  const content = typeof text === "string" ? text.trim() : "";
  const textRef = React.useRef<HTMLDivElement | null>(null);
  const [isOverflowing, setIsOverflowing] = React.useState(false);

  React.useEffect(() => {
    const node = textRef.current;
    if (!node) return;

    const updateOverflow = () => {
      const next =
        node.scrollWidth > node.clientWidth || node.scrollHeight > node.clientHeight;
      setIsOverflowing(next);
    };

    updateOverflow();
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(node);
    window.addEventListener("resize", updateOverflow);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateOverflow);
    };
  }, [content, children]);

  if (!content) return <>{children}</>;

  return (
    <div className={`group/fast relative ${className ?? ""}`}>
      <div ref={textRef}>{children}</div>
      {isOverflowing ? (
        <div
          className={`pointer-events-none absolute left-0 top-full z-30 mt-1 hidden max-w-[320px] rounded-md border border-border/70 bg-white px-2 py-1 text-[11px] text-foreground shadow-md group-hover/fast:block dark:bg-popover dark:text-popover-foreground ${tooltipClassName ?? ""}`}
        >
          {content}
        </div>
      ) : null}
    </div>
  );
}

function tagToneClassName(tone: PostCardTagTone) {
  if (tone === "green") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300";
  }
  if (tone === "yellow") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300";
  }
  if (tone === "red") {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300";
  }
  if (tone === "blue") {
    return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-300";
  }
  if (tone === "purple") {
    return "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-300";
  }
  if (tone === "gray") {
    return "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300";
  }
  if (tone === "soft-gray") {
    return "border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300";
  }
  if (tone === "orange") {
    return "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-300";
  }
  return "border-stone-200 bg-stone-100 text-stone-700 dark:border-stone-800 dark:bg-stone-900/60 dark:text-stone-300";
}

function toHttpUrlOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function toPercentLabel(score: number | null | undefined) {
  if (typeof score !== "number" || !Number.isFinite(score)) return "n/a";
  const clamped = Math.max(0, Math.min(1, score));
  return `${Math.round(clamped * 100)}%`;
}

function toFactorLabel(score: number | null | undefined) {
  if (typeof score !== "number" || !Number.isFinite(score)) return "n/a";
  const clamped = Math.max(0, Math.min(1, score));
  return clamped.toFixed(2);
}

function toScore100Label(score: number | null | undefined) {
  if (typeof score !== "number" || !Number.isFinite(score)) return "n/a";
  return String(Math.round(Math.max(0, Math.min(100, score))));
}

function gateReasonLabel(
  gateReason: PostCardProps["gateReason"],
): string | null {
  if (gateReason === "hiring_intent_zero") return "Score 0: Hiring intent is 0";
  if (gateReason === "employment_type_mismatch") return "Score 0: Employment type mismatch";
  if (gateReason === "hard_location_mismatch") {
    return "Score 0: Location mismatch under hard filter";
  }
  return null;
}

function toDaysAgoLabel(value: string | null | undefined) {
  if (!value) return "";
  const posted = new Date(value);
  if (Number.isNaN(posted.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - posted.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
}

export function PostCard({
  title,
  company,
  locationDisplay,
  postAuthor,
  authorHeadline,
  authorTypeLabel,
  postedAt,
  workMode,
  leadScore,
  roleMatchScore,
  locationMatchScore,
  authorStrengthScore,
  hiringIntentScore,
  engagementScore,
  employmentTypeScore,
  baseScore,
  intentBoost,
  finalScore100,
  gatedToZero = false,
  gateReason = null,
  sourceBadge,
  isNew,
  postUrl,
  selectedLocation,
  onGenerateMessage,
  onRegenerateMessage,
  isMessageGenerating,
  messageDraft,
  messageError,
  onDismissMessageError,
  onCopyMessage,
  isMessageCopied,
  onOpenMessageDrawer,
  showResumeNudge = false,
  status = "not_reviewed",
  onStatusChange,
  isLocationLowConfidence = false,
  isCompanyLowConfidence = false,
  isPostedByCompany = false,
}: PostCardProps) {
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const [isMessagePanelOpen, setIsMessagePanelOpen] = React.useState(false);
  const selectedLocationNormalized = selectedLocation?.trim().toLowerCase() ?? "";
  const safePostUrl = React.useMemo(() => toHttpUrlOrNull(postUrl), [postUrl]);
  const display = React.useMemo(
    () =>
      buildPostCardDisplayModel({
        title,
        company,
        locationDisplay,
        postAuthor,
        authorHeadline,
        authorTypeLabel,
        leadScore,
        sourceBadge,
        isNew,
      }),
    [
      title,
      company,
      locationDisplay,
      postAuthor,
      authorHeadline,
      authorTypeLabel,
      leadScore,
      sourceBadge,
      isNew,
    ],
  );
  const hasScoreBreakdownTooltip =
    (typeof leadScore === "number" && Number.isFinite(leadScore)) ||
    (typeof roleMatchScore === "number" && Number.isFinite(roleMatchScore)) ||
    (typeof locationMatchScore === "number" && Number.isFinite(locationMatchScore)) ||
    (typeof authorStrengthScore === "number" && Number.isFinite(authorStrengthScore)) ||
    (typeof hiringIntentScore === "number" && Number.isFinite(hiringIntentScore)) ||
    (typeof engagementScore === "number" && Number.isFinite(engagementScore)) ||
    (typeof employmentTypeScore === "number" && Number.isFinite(employmentTypeScore)) ||
    (typeof baseScore === "number" && Number.isFinite(baseScore)) ||
    (typeof intentBoost === "number" && Number.isFinite(intentBoost)) ||
    (typeof finalScore100 === "number" && Number.isFinite(finalScore100)) ||
    gatedToZero ||
    gateReason !== null;
  const resolvedHiringIntentScore =
    typeof hiringIntentScore === "number" && Number.isFinite(hiringIntentScore)
      ? hiringIntentScore
      : engagementScore;
  const resolvedScore100 =
    typeof finalScore100 === "number" && Number.isFinite(finalScore100)
      ? finalScore100
      : typeof leadScore === "number" && Number.isFinite(leadScore)
        ? Math.round(Math.max(0, Math.min(1, leadScore)) * 100)
        : null;
  const resolvedIntentBoost =
    typeof intentBoost === "number" && Number.isFinite(intentBoost)
      ? intentBoost
      : typeof resolvedHiringIntentScore === "number" && Number.isFinite(resolvedHiringIntentScore)
        ? Math.round(Math.max(0, Math.min(1, resolvedHiringIntentScore)) * 15)
        : null;
  const gateSummary = gatedToZero ? gateReasonLabel(gateReason) : null;
  const newTag = display.tags.find((tag) => tag.key === "new");
  const matchTag = display.tags.find((tag) => tag.key === "match_strength");
  const recruiterTag = display.tags.find((tag) => tag.key === "author_type");
  const daysAgoLabel = React.useMemo(() => toDaysAgoLabel(postedAt), [postedAt]);
  const statusUi = POST_REVIEW_STATUS_UI[status];
  const keepCardInView = React.useCallback(() => {
    const node = cardRef.current;
    if (!node) return;
    window.requestAnimationFrame(() => {
      node.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    });
  }, []);

  React.useEffect(() => {
    if (isMessagePanelOpen) keepCardInView();
  }, [isMessagePanelOpen, keepCardInView]);

  React.useEffect(() => {
    if (!isMessagePanelOpen) return;
    if (!isMessageGenerating && !messageDraft && !messageError) return;
    keepCardInView();
  }, [isMessagePanelOpen, isMessageGenerating, messageDraft, messageError, keepCardInView]);

  return (
    <Card
      ref={cardRef}
      className="scroll-mt-24 space-y-2 rounded-lg border border-[var(--intent-muted-border)] bg-background p-3 transition-[border-color,box-shadow] duration-200 hover:border-[color-mix(in_srgb,var(--intent-primary)_20%,var(--intent-muted-border))]"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,35%)_minmax(0,15%)_minmax(0,20%)_minmax(0,15%)_minmax(0,15%)] lg:items-start">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <TruncationHoverTooltip text={display.roleCompany.title} className="min-w-0">
              <h3 className="line-clamp-1 text-sm font-semibold">{display.roleCompany.title}</h3>
            </TruncationHoverTooltip>
            {safePostUrl ? (
              <a
                href={safePostUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Open LinkedIn post"
                title="Open LinkedIn post"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>
          <div className="flex min-w-0 items-center gap-1">
            <TruncationHoverTooltip text={display.roleCompany.company} className="min-w-0">
              <p className="line-clamp-1 text-xs text-muted-foreground">
                {display.roleCompany.company}
              </p>
            </TruncationHoverTooltip>
            {isCompanyLowConfidence ? (
              <span className="group relative inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-amber-300 bg-amber-50 text-[10px] text-amber-700">
                i
                <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border/70 bg-white px-2 py-1 text-[11px] text-foreground shadow-md group-hover:block dark:bg-popover dark:text-popover-foreground">
                  Company inferred from author profile (low confidence)
                </span>
              </span>
            ) : null}
          </div>
          <TruncationHoverTooltip text={display.location.full} className="min-w-0">
            <p className="line-clamp-1 text-xs text-muted-foreground">
              {display.location.hasAny
                ? display.location.tokens.map((token, locationIndex, arr) => {
                    const tokenLower = token.toLowerCase();
                    const isMatch =
                      selectedLocationNormalized.length > 0 &&
                      (tokenLower.includes(selectedLocationNormalized) ||
                        selectedLocationNormalized.includes(tokenLower));
                    return (
                      <React.Fragment key={`${token}-${locationIndex}`}>
                        <span className={isMatch ? "font-medium text-foreground" : undefined}>
                          {token}
                        </span>
                        {locationIndex < arr.length - 1 ? " • " : ""}
                      </React.Fragment>
                    );
                  })
                : ""}
              {display.location.omittedCount > 0 ? ` • +${display.location.omittedCount} more` : ""}
              {display.location.hasAny && isLocationLowConfidence ? (
                <span
                  className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-amber-300 bg-amber-50 text-[10px] text-amber-700"
                  title="Location inferred from author profile (low confidence)"
                >
                  i
                </span>
              ) : null}
            </p>
          </TruncationHoverTooltip>
          <TruncationHoverTooltip
            text={`Work mode: ${formatWorkMode({ workMode })}`}
            className="min-w-0"
          >
            <p className="line-clamp-1 text-[11px] text-muted-foreground">
              Work mode: {formatWorkMode({ workMode })}
            </p>
          </TruncationHoverTooltip>
        </div>

        <div className="min-w-0 lg:border-l lg:border-[var(--intent-muted-border)] lg:pl-3">
          <div className="flex flex-col items-start gap-1">
            {newTag ? (
                <Badge
                  variant="secondary"
                  className={`h-5 px-1.5 text-[10px] font-semibold ${tagToneClassName(newTag.tone)}`}
                >
                  {newTag.label}
                </Badge>
            ) : null}
            {matchTag ? (
              <div className="inline-flex items-center gap-1">
                <Badge
                  variant="secondary"
                  className={`h-5 px-1.5 text-[10px] font-semibold ${tagToneClassName(matchTag.tone)} inline-flex items-center gap-1`}
                >
                  <span>{matchTag.label} • {toPercentLabel(leadScore)}</span>
                  {hasScoreBreakdownTooltip ? (
                    <span className="group relative inline-flex items-center">
                      <button
                        type="button"
                        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-current/60 bg-background/90 text-current transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/35"
                        aria-label="Show match score details"
                      >
                        <Eye className="h-2.5 w-2.5" />
                      </button>
                      <div className="pointer-events-none absolute left-0 top-5 z-20 hidden w-72 rounded-md border border-border/70 bg-white p-2 text-left text-[11px] text-foreground shadow-md group-hover:block group-focus-within:block dark:bg-popover dark:text-popover-foreground">
                        {gateSummary ? (
                          <p>{gateSummary}</p>
                        ) : (
                          <p>
                            Score {toScore100Label(resolvedScore100)} = Role{" "}
                            {toFactorLabel(roleMatchScore)}× + Loc{" "}
                            {toFactorLabel(locationMatchScore)} + Poster{" "}
                            {toFactorLabel(authorStrengthScore)} + Intent +
                            {typeof resolvedIntentBoost === "number"
                              ? resolvedIntentBoost
                              : "n/a"}
                          </p>
                        )}
                      </div>
                    </span>
                  ) : null}
                </Badge>
              </div>
            ) : null}
            {recruiterTag && recruiterTag.label.trim().toLowerCase() !== "unknown" ? (
              <Badge
                variant="secondary"
                className={`h-5 px-1.5 text-[10px] font-semibold ${tagToneClassName(recruiterTag.tone)}`}
              >
                {recruiterTag.label}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="min-w-0 space-y-0.5 lg:border-l lg:border-[var(--intent-muted-border)] lg:pl-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            POSTED BY
          </p>
          <TruncationHoverTooltip text={display.author.name} className="min-w-0">
            <p className="line-clamp-1 text-xs font-medium">{display.author.name}</p>
          </TruncationHoverTooltip>
          <TruncationHoverTooltip text={display.author.headline ?? ""} className="min-w-0">
            <p className="line-clamp-1 text-[11px] text-muted-foreground">
              {display.author.headline ?? ""}
            </p>
          </TruncationHoverTooltip>
          <p className="text-[11px] text-muted-foreground" suppressHydrationWarning>
            {daysAgoLabel}
          </p>
        </div>

        <div className="flex h-full min-w-[132px] items-center justify-center lg:border-l lg:border-[var(--intent-muted-border)] lg:pl-3">
          {isPostedByCompany ? (
            <div className="group relative inline-flex">
              <Button
                size="sm"
                type="button"
                className="h-8 px-3 text-xs"
                disabled
                aria-label="Generate Message unavailable"
              >
                Generate Message
              </Button>
              <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border/70 bg-white px-2 py-1 text-[11px] text-foreground shadow-md group-hover:block dark:bg-popover dark:text-popover-foreground">
                Messages can be generated only when the poster is a person
              </div>
            </div>
          ) : (
            <Button
              size="sm"
              type="button"
              className="h-8 px-3 text-xs"
              onClick={() => {
                setIsMessagePanelOpen(true);
                onGenerateMessage?.();
              }}
              disabled={Boolean(isMessageGenerating) || isMessagePanelOpen}
            >
              {isMessageGenerating ? "Generating..." : "Generate Message"}
            </Button>
          )}
        </div>

        <div className="flex h-full min-w-[132px] flex-col items-start gap-2 lg:border-l lg:border-[var(--intent-muted-border)] lg:pl-3">
          <div>
            <div className="flex items-center gap-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                STATUS
              </p>
              <span className="group relative inline-flex">
                <button
                  type="button"
                  aria-label="Status help"
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border/70 text-[10px] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--intent-primary)_32%,transparent)]"
                >
                  i
                </button>
                <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border/70 bg-white px-2 py-1 text-[11px] text-foreground shadow-md group-hover:block group-focus-within:block dark:bg-popover dark:text-popover-foreground">
                  Self tracking
                </span>
              </span>
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <span
                className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${statusUi.dotClassName}`}
                aria-hidden="true"
                title={statusUi.ariaLabel}
              />
              <select
                aria-label="Post status"
                value={status}
                onChange={(event) => onStatusChange?.(event.target.value as PostReviewStatus)}
                className={`h-8 rounded-md border px-2 text-xs transition-colors duration-200 hover:border-[color-mix(in_srgb,var(--intent-primary)_24%,var(--input))] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--intent-primary)_32%,transparent)] ${statusUi.selectClassName}`}
              >
                {POST_REVIEW_STATUS_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {POST_REVIEW_STATUS_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-out ${
          isMessagePanelOpen ? "max-h-[420px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        {isMessagePanelOpen ? (
          <div className="space-y-2 border-t border-[var(--intent-muted-border)] bg-muted/30 pt-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-foreground">Generated Message</p>
              <div className="flex items-center gap-1.5">
                {onCopyMessage && messageDraft ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    className="h-7 px-2 text-[11px]"
                    onClick={onCopyMessage}
                  >
                    {isMessageCopied ? "Copied" : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                ) : null}
              </div>
            </div>
            {showResumeNudge ? (
              <p className="text-[11px] text-muted-foreground">
                Tip: Upload your resume for stronger personalization.
              </p>
            ) : null}
            {isMessageGenerating ? (
              <p className="rounded-md border border-[var(--intent-muted-border)] bg-background p-2.5 text-xs text-muted-foreground">
                Generating a tailored message...
              </p>
            ) : messageError ? (
              <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
                <p className="truncate text-xs text-destructive" title={messageError}>
                  {messageError}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    type="button"
                    className="h-7 px-2 text-xs"
                    onClick={onRegenerateMessage}
                  >
                    Retry
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      if (onDismissMessageError) {
                        onDismissMessageError();
                        return;
                      }
                      setIsMessagePanelOpen(false);
                    }}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            ) : messageDraft ? (
              <>
                <div className="max-h-44 overflow-y-auto rounded-md border border-[var(--intent-muted-border)] bg-background p-3">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {messageDraft}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {onOpenMessageDrawer ? (
                    <Button
                      size="sm"
                      type="button"
                      className="h-7 px-2 text-xs"
                      onClick={onOpenMessageDrawer}
                    >
                      Open in drawer
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="secondary"
                    type="button"
                    className="h-7 px-2 text-xs"
                    onClick={onRegenerateMessage}
                  >
                    Regenerate
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    className="h-7 px-2 text-xs"
                    onClick={() => setIsMessagePanelOpen(false)}
                  >
                    Close
                  </Button>
                </div>
              </>
            ) : (
              <p className="rounded-md border border-[var(--intent-muted-border)] bg-background p-2.5 text-xs text-muted-foreground">
                Click Generate Message to create a message draft for this post.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
