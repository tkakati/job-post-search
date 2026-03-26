import { env } from "@/lib/env";
import { emitDebugApiCall, redactApifyUrl } from "@/lib/debug/api-call-sink";
import type {
  ProviderQueryInput,
  ProviderRawResult,
  SearchExecutionProvider,
} from "@/lib/search/provider";

type ApifyDatasetItem = {
  url?: string;
  postUrl?: string;
  inputUrl?: string;
  title?: string;
  text?: string;
  description?: string;
  company?: string;
  author?: unknown;
  location?: string;
  postedAt?: string;
};

type ApifyRunData = {
  defaultDatasetId?: string;
  status?: string;
};

type ApifyRunResponse = {
  data?: ApifyRunData;
};

const APIFY_MAX_ITEMS = 10;

function toIsoOrNull(value: string | undefined) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toAuthorString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const direct =
      (typeof obj.name === "string" && obj.name) ||
      (typeof obj.fullName === "string" && obj.fullName) ||
      (typeof obj.headline === "string" && obj.headline) ||
      "";
    if (direct.trim()) return direct.trim();
    const first = typeof obj.firstName === "string" ? obj.firstName : "";
    const last = typeof obj.lastName === "string" ? obj.lastName : "";
    const combined = `${first} ${last}`.trim();
    return combined || null;
  }
  return null;
}

function normalizeApifyItem(item: ApifyDatasetItem): ProviderRawResult | null {
  const url = item.postUrl ?? item.url;
  const titleOrRole = item.title ?? item.text?.slice(0, 80) ?? "";
  if (!url || !titleOrRole) return null;
  return {
    url,
    titleOrRole,
    company: item.company ?? null,
    location: item.location ?? null,
    author: toAuthorString(item.author),
    snippet: item.description ?? item.text ?? null,
    fullText: item.text ?? null,
    postedAt: toIsoOrNull(item.postedAt),
    metadata: {
      provider: "apify-linkedin-content",
      inputUrl: item.inputUrl ?? null,
    },
  };
}

export async function executeApifyLinkedinContentSearch(
  input: ProviderQueryInput,
): Promise<ProviderRawResult[]> {
  const debug = await runApifyLinkedinContentDebug({
    sourceUrl: input.sourceUrl,
    queryText: input.queryText,
  });
  return debug.normalizedItems;
}

function extractKeywordsFromLinkedInContentUrl(sourceUrl: string) {
  try {
    const url = new URL(sourceUrl);
    const raw = url.searchParams.get("keywords");
    return raw ? decodeURIComponent(raw).replace(/\s+/g, " ").trim() : "";
  } catch {
    return "";
  }
}

export async function runApifyLinkedinContentDebug(input: {
  sourceUrl: string;
  queryText?: string;
  maxPayloadAttempts?: number;
  strictCostMode?: boolean;
}) {
  if (!env.APIFY_API_TOKEN || !env.APIFY_ACTOR_ID) {
    throw new Error(
      "Missing APIFY_API_TOKEN/APIFY_ACTOR_ID for apify-linkedin-content provider.",
    );
  }

  const queryText = input.queryText?.trim() || extractKeywordsFromLinkedInContentUrl(input.sourceUrl);
  const runSyncItemsEndpoint = `https://api.apify.com/v2/acts/${encodeURIComponent(env.APIFY_ACTOR_ID)}/run-sync-get-dataset-items?token=${encodeURIComponent(env.APIFY_API_TOKEN)}&clean=true&limit=${APIFY_MAX_ITEMS}&maxItems=${APIFY_MAX_ITEMS}`;
  const endpoint = `https://api.apify.com/v2/acts/${encodeURIComponent(env.APIFY_ACTOR_ID)}/runs?token=${encodeURIComponent(env.APIFY_API_TOKEN)}&waitForFinish=120&maxItems=${APIFY_MAX_ITEMS}`;
  const strictCostMode = Boolean(input.strictCostMode);
  const strictPayload: Record<string, unknown> = {
    urls: [input.sourceUrl],
    maxItems: APIFY_MAX_ITEMS,
    limitPerSource: APIFY_MAX_ITEMS,
    maxResults: APIFY_MAX_ITEMS,
    maxPosts: APIFY_MAX_ITEMS,
  };
  const candidateInputs: Array<Record<string, unknown>> = [
    {
      maxItems: APIFY_MAX_ITEMS,
      urls: [input.sourceUrl],
      search: queryText,
    },
    {
      maxItems: APIFY_MAX_ITEMS,
      urls: [input.sourceUrl],
      query: queryText,
    },
    {
      maxItems: APIFY_MAX_ITEMS,
      urls: [input.sourceUrl],
    },
    {
      maxItems: APIFY_MAX_ITEMS,
      startUrls: [{ url: input.sourceUrl }],
      search: queryText,
    },
    {
      maxItems: APIFY_MAX_ITEMS,
      query: queryText,
    },
    {
      maxItems: APIFY_MAX_ITEMS,
      keyword: queryText,
    },
    {
      maxItems: APIFY_MAX_ITEMS,
      searchKeyword: queryText,
    },
    {
      maxItems: APIFY_MAX_ITEMS,
      url: input.sourceUrl,
    },
    {
      maxItems: APIFY_MAX_ITEMS,
      startUrls: [input.sourceUrl],
    },
  ];

  let runJson: ApifyRunResponse | null = null;
  let lastError = "";
  const attempts: Array<{
    payloadKeys: string[];
    status: number;
    errorPreview?: string;
    success: boolean;
  }> = [];
  let successfulPayloadKeys: string[] = [];
  // Preferred path: sync run + dataset items in same response.
  const limitedCandidateInputs = strictCostMode
    ? [strictPayload]
    : candidateInputs.slice(
        0,
        Math.max(1, input.maxPayloadAttempts ?? candidateInputs.length),
      );

  for (const payload of limitedCandidateInputs) {
    const syncRes = await fetch(runSyncItemsEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (syncRes.ok) {
      const items = ((await syncRes.json()) as ApifyDatasetItem[]).slice(
        0,
        APIFY_MAX_ITEMS,
      );
      const normalizedItems = items
        .map(normalizeApifyItem)
        .filter((x): x is ProviderRawResult => x !== null);
      emitDebugApiCall({
        node: "search",
        api: "Apify run-sync-get-dataset-items",
        method: "POST",
        url: redactApifyUrl(runSyncItemsEndpoint),
        input: {
          actorId: env.APIFY_ACTOR_ID,
          sourceUrl: input.sourceUrl,
          queryText,
          payload,
        },
        output: {
          status: syncRes.status,
          itemCount: items.length,
          normalizedCount: normalizedItems.length,
        },
      });
      successfulPayloadKeys = Object.keys(payload);
      attempts.push({
        payloadKeys: Object.keys(payload),
        status: syncRes.status,
        success: true,
      });
      return {
        queryText,
        sourceUrl: input.sourceUrl,
        actorId: env.APIFY_ACTOR_ID,
        datasetId: null,
        strictCostMode,
        attempts,
        selectedPayloadKeys: successfulPayloadKeys,
        rawItems: items,
        normalizedItems,
      };
    }
    const errText = await syncRes.text().catch(() => "");
    emitDebugApiCall({
      node: "search",
      api: "Apify run-sync-get-dataset-items",
      method: "POST",
      url: redactApifyUrl(runSyncItemsEndpoint),
      input: {
        actorId: env.APIFY_ACTOR_ID,
        sourceUrl: input.sourceUrl,
        queryText,
        payload,
      },
      output: {
        status: syncRes.status,
        errorPreview: errText.slice(0, 800),
      },
    });
    attempts.push({
      payloadKeys: Object.keys(payload),
      status: syncRes.status,
      errorPreview: errText.slice(0, 300),
      success: false,
    });
    lastError = `sync status=${syncRes.status} payloadKeys=${Object.keys(payload).join(",")} body=${errText.slice(0, 300)}`;
  }

  if (strictCostMode) {
    throw new Error(`Apify run failed (strict mode). ${lastError}`);
  }

  // Fallback path: async run + dataset fetch.
  for (const payload of limitedCandidateInputs) {
    const runRes = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (runRes.ok) {
      runJson = (await runRes.json()) as ApifyRunResponse;
      emitDebugApiCall({
        node: "search",
        api: "Apify actor runs (async waitForFinish)",
        method: "POST",
        url: redactApifyUrl(endpoint),
        input: {
          actorId: env.APIFY_ACTOR_ID,
          sourceUrl: input.sourceUrl,
          queryText,
          payload,
        },
        output: {
          status: runRes.status,
          defaultDatasetId: runJson.data?.defaultDatasetId ?? null,
          runStatus: runJson.data?.status ?? null,
        },
      });
      successfulPayloadKeys = Object.keys(payload);
      attempts.push({
        payloadKeys: Object.keys(payload),
        status: runRes.status,
        success: true,
      });
      break;
    }
    const errText = await runRes.text().catch(() => "");
    emitDebugApiCall({
      node: "search",
      api: "Apify actor runs (async waitForFinish)",
      method: "POST",
      url: redactApifyUrl(endpoint),
      input: {
        actorId: env.APIFY_ACTOR_ID,
        sourceUrl: input.sourceUrl,
        queryText,
        payload,
      },
      output: {
        status: runRes.status,
        errorPreview: errText.slice(0, 800),
      },
    });
    attempts.push({
      payloadKeys: Object.keys(payload),
      status: runRes.status,
      errorPreview: errText.slice(0, 300),
      success: false,
    });
    lastError = `async status=${runRes.status} payloadKeys=${Object.keys(payload).join(",")} body=${errText.slice(0, 300)}`;
  }
  if (!runJson) {
    throw new Error(`Apify run failed. ${lastError}`);
  }

  const datasetId = runJson.data?.defaultDatasetId;
  if (!datasetId) {
    emitDebugApiCall({
      node: "search",
      api: "Apify actor run result",
      method: "INFO",
      input: { sourceUrl: input.sourceUrl, queryText },
      output: { note: "No defaultDatasetId on run response; skipping dataset fetch." },
    });
    return {
      queryText,
      sourceUrl: input.sourceUrl,
      actorId: env.APIFY_ACTOR_ID,
      datasetId: null,
      strictCostMode,
      attempts,
      selectedPayloadKeys: successfulPayloadKeys,
      rawItems: [],
      normalizedItems: [],
    };
  }

  // If the actor did not finish within waitForFinish window, give it a short grace period.
  if (runJson.data?.status && runJson.data.status !== "SUCCEEDED") {
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  const datasetItemsUrl = `https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?token=${encodeURIComponent(env.APIFY_API_TOKEN)}&clean=true&desc=true&limit=${APIFY_MAX_ITEMS}`;
  const datasetRes = await fetch(datasetItemsUrl);
  if (!datasetRes.ok) {
    const errBody = await datasetRes.text().catch(() => "");
    emitDebugApiCall({
      node: "search",
      api: "Apify dataset items",
      method: "GET",
      url: redactApifyUrl(datasetItemsUrl),
      input: { datasetId },
      output: {
        status: datasetRes.status,
        errorPreview: errBody.slice(0, 800),
      },
    });
    throw new Error(`Apify dataset fetch failed with status ${datasetRes.status}`);
  }
  const items = ((await datasetRes.json()) as ApifyDatasetItem[]).slice(
    0,
    APIFY_MAX_ITEMS,
  );
  const normalizedItems = items
    .map(normalizeApifyItem)
    .filter((x): x is ProviderRawResult => x !== null);
  emitDebugApiCall({
    node: "search",
    api: "Apify dataset items",
    method: "GET",
    url: redactApifyUrl(datasetItemsUrl),
    input: { datasetId },
    output: {
      status: datasetRes.status,
      itemCount: items.length,
      normalizedCount: normalizedItems.length,
    },
  });
  return {
    queryText,
    sourceUrl: input.sourceUrl,
    actorId: env.APIFY_ACTOR_ID,
    datasetId,
    strictCostMode,
    attempts,
    selectedPayloadKeys: successfulPayloadKeys,
    rawItems: items,
    normalizedItems,
  };
}

export async function runApifyLinkedinContentBatchDebug(input: {
  sources: Array<{ sourceUrl: string; queryText?: string }>;
  maxPayloadAttempts?: number;
  strictCostMode?: boolean;
}) {
  if (!env.APIFY_API_TOKEN || !env.APIFY_ACTOR_ID) {
    throw new Error(
      "Missing APIFY_API_TOKEN/APIFY_ACTOR_ID for apify-linkedin-content provider.",
    );
  }
  if (!input.sources.length) {
    return {
      actorId: env.APIFY_ACTOR_ID,
      datasetId: null as string | null,
      strictCostMode: Boolean(input.strictCostMode),
      attempts: [] as Array<{
        payloadKeys: string[];
        status: number;
        errorPreview?: string;
        success: boolean;
      }>,
      selectedPayloadKeys: [] as string[],
      rawItems: [] as ApifyDatasetItem[],
      normalizedItems: [] as ProviderRawResult[],
      sourceUrls: [] as string[],
    };
  }

  const strictCostMode = Boolean(input.strictCostMode);
  const sourceUrls = input.sources.map((s) => s.sourceUrl).filter(Boolean);
  const maxTotalItems = APIFY_MAX_ITEMS * Math.max(1, sourceUrls.length);
  const runSyncItemsEndpoint = `https://api.apify.com/v2/acts/${encodeURIComponent(env.APIFY_ACTOR_ID)}/run-sync-get-dataset-items?token=${encodeURIComponent(env.APIFY_API_TOKEN)}&clean=true&limit=${maxTotalItems}&maxItems=${maxTotalItems}`;

  const strictPayload: Record<string, unknown> = {
    urls: sourceUrls,
    maxItems: maxTotalItems,
    limitPerSource: APIFY_MAX_ITEMS,
    maxResults: maxTotalItems,
    maxPosts: maxTotalItems,
  };
  const fallbackPayload: Record<string, unknown> = {
    urls: sourceUrls,
    maxItems: maxTotalItems,
    limitPerSource: APIFY_MAX_ITEMS,
    maxResults: maxTotalItems,
    maxPosts: maxTotalItems,
  };
  const candidateInputs: Array<Record<string, unknown>> = strictCostMode
    ? [strictPayload]
    : [strictPayload, fallbackPayload];
  const limitedCandidateInputs = candidateInputs.slice(
    0,
    Math.max(1, input.maxPayloadAttempts ?? candidateInputs.length),
  );

  const attempts: Array<{
    payloadKeys: string[];
    status: number;
    errorPreview?: string;
    success: boolean;
  }> = [];
  let successfulPayloadKeys: string[] = [];
  let lastError = "";

  for (const payload of limitedCandidateInputs) {
    const syncRes = await fetch(runSyncItemsEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (syncRes.ok) {
      const items = ((await syncRes.json()) as ApifyDatasetItem[]).slice(
        0,
        maxTotalItems,
      );
      const normalizedItems = items
        .map(normalizeApifyItem)
        .filter((x): x is ProviderRawResult => x !== null);
      emitDebugApiCall({
        node: "search",
        api: "Apify run-sync-get-dataset-items (batch)",
        method: "POST",
        url: redactApifyUrl(runSyncItemsEndpoint),
        input: {
          actorId: env.APIFY_ACTOR_ID,
          sourceUrlCount: sourceUrls.length,
          sourceUrls,
          payload,
        },
        output: {
          status: syncRes.status,
          itemCount: items.length,
          normalizedCount: normalizedItems.length,
        },
      });
      successfulPayloadKeys = Object.keys(payload);
      attempts.push({
        payloadKeys: Object.keys(payload),
        status: syncRes.status,
        success: true,
      });
      return {
        actorId: env.APIFY_ACTOR_ID,
        datasetId: null as string | null,
        strictCostMode,
        attempts,
        selectedPayloadKeys: successfulPayloadKeys,
        rawItems: items,
        normalizedItems,
        sourceUrls,
      };
    }
    const errText = await syncRes.text().catch(() => "");
    emitDebugApiCall({
      node: "search",
      api: "Apify run-sync-get-dataset-items (batch)",
      method: "POST",
      url: redactApifyUrl(runSyncItemsEndpoint),
      input: {
        actorId: env.APIFY_ACTOR_ID,
        sourceUrlCount: sourceUrls.length,
        sourceUrls,
        payload,
      },
      output: {
        status: syncRes.status,
        errorPreview: errText.slice(0, 800),
      },
    });
    attempts.push({
      payloadKeys: Object.keys(payload),
      status: syncRes.status,
      errorPreview: errText.slice(0, 300),
      success: false,
    });
    lastError = `sync status=${syncRes.status} payloadKeys=${Object.keys(payload).join(",")} body=${errText.slice(0, 300)}`;
  }

  throw new Error(`Apify batched run failed. ${lastError}`);
}

export const apifyLinkedinContentProvider: SearchExecutionProvider = {
  name: "apify-linkedin-content",
  async execute(input: ProviderQueryInput): Promise<ProviderRawResult[]> {
    return executeApifyLinkedinContentSearch(input);
  },
};

