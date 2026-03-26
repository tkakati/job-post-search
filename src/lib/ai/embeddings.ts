import OpenAI from "openai";
import { env } from "@/lib/env";

const EMBEDDING_MODEL = "text-embedding-3-small";

function hasValidNumbers(values: unknown[]): values is number[] {
  return values.every((v) => typeof v === "number" && Number.isFinite(v));
}

export async function getEmbedding(text: string): Promise<number[] | null> {
  const input = typeof text === "string" ? text.trim() : "";
  if (!input) return null;

  const apiKey = env.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input,
    });

    const embedding = response.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || !hasValidNumbers(embedding)) return null;
    return embedding;
  } catch {
    return null;
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    const av = a[i];
    const bv = b[i];
    if (!Number.isFinite(av) || !Number.isFinite(bv)) return 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
