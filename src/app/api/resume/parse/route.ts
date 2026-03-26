import { NextResponse } from "next/server";

import { parseResumeBuffer } from "@/lib/resume/parse";

export const runtime = "nodejs";

const MAX_RESUME_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: { message: "Resume file is required." } },
        { status: 400 },
      );
    }

    const fileName = typeof file.name === "string" ? file.name.trim() : "";
    if (!fileName) {
      return NextResponse.json(
        { ok: false, error: { message: "Resume file name is missing." } },
        { status: 400 },
      );
    }
    if (file.size <= 0) {
      return NextResponse.json(
        { ok: false, error: { message: "Resume file is empty." } },
        { status: 400 },
      );
    }
    if (file.size > MAX_RESUME_BYTES) {
      return NextResponse.json(
        {
          ok: false,
          error: { message: "Resume file is too large. Maximum size is 5 MB." },
        },
        { status: 400 },
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseResumeBuffer({
      fileName,
      mimeType: file.type,
      fileBuffer,
    });

    return NextResponse.json({
      ok: true,
      data: {
        fileName,
        rawText: parsed.rawText,
        inferredName: parsed.inferredName,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          message:
            error instanceof Error
              ? error.message
              : "Failed to parse resume file.",
        },
      },
      { status: 500 },
    );
  }
}
