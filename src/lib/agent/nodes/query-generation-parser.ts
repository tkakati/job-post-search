import { z } from "zod";

export const QueryGenerationLlmResponseSchema = z.object({
  queries: z
    .array(
      z.object({
        queryText: z.string().min(1),
        queryKind: z.enum(["explore", "exploit"]),
        isExplore: z.boolean(),
      }),
    )
    .min(1),
});

export type QueryGenerationLlmResponse = z.infer<
  typeof QueryGenerationLlmResponseSchema
>;

export function parseQueryGenerationLlmResponse(input: unknown) {
  return QueryGenerationLlmResponseSchema.parse(input);
}

