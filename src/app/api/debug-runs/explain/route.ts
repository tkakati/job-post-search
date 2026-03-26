import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";

const ExplainInputSchema = z.object({
  node: z.string().min(1),
  iteration: z.number().int().min(0),
  logs: z.array(z.string()).default([]),
  runs: z.array(z.unknown()).default([]),
});

const ExplainOutputSchema = z.object({
  summary: z.string().min(1),
  inputs: z.array(z.string()),
  outputs: z.array(z.string()),
  state: z.array(z.string()),
});

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = ExplainInputSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { message: "Invalid explain payload" } },
        { status: 400 },
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: { message: "OPENAI_API_KEY is not configured" } },
        { status: 500 },
      );
    }

    const client = new OpenAI({ apiKey });
    const model = process.env.OPENAI_CHAT_MODEL || "gpt-5.2";
    const prompt = [
      "You are writing concise product UI explanations.",
      "Given the selected node and iteration data, return plain English only.",
      "No technical jargon, no markdown, no JSON comments.",
      "summary must be exactly 20 words.",
      "inputs/outputs/state should each be 2-4 short bullet texts.",
      "",
      `Selected node: ${parsed.data.node}`,
      `Iteration: ${parsed.data.iteration}`,
      `Logs: ${JSON.stringify(parsed.data.logs)}`,
      `Runs (input/output snapshots): ${JSON.stringify(parsed.data.runs)}`,
      "",
      "Return STRICT JSON with shape:",
      '{"summary":"...","inputs":["..."],"outputs":["..."],"state":["..."]}',
    ].join("\n");

    const completion = await client.responses.create({
      model,
      input: prompt,
      text: { format: { type: "text" } },
      max_output_tokens: 500,
    });

    const text = completion.output_text?.trim() ?? "";
    const maybeJson = text.startsWith("```")
      ? text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
      : text;
    const parsedOutput = ExplainOutputSchema.safeParse(JSON.parse(maybeJson));
    if (!parsedOutput.success) {
      return NextResponse.json(
        { ok: false, error: { message: "Failed to generate explanation" } },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, data: parsedOutput.data });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          message: error instanceof Error ? error.message : "Unexpected explain error",
        },
      },
      { status: 500 },
    );
  }
}

