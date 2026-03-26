import { randomUUID } from "crypto";

export type ApiErrorShape = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
  };
};

export function apiOk<T>(data: T, status = 200) {
  return Response.json({ ok: true, data }, { status });
}

export function apiError(input: {
  status: number;
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}) {
  const requestId = input.requestId ?? randomUUID();
  const body: ApiErrorShape = {
    ok: false,
    error: {
      code: input.code,
      message: input.message,
      details: input.details,
      requestId,
    },
  };
  return Response.json(body, { status: input.status });
}

