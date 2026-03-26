import { z } from "zod";
import { RecencyPreferenceSchema } from "@/lib/schemas/common";

export const DiscoverInputSchema = z.object({
  role: z.string().min(1).max(80),
  location: z.string().min(1).max(80),
  recencyPreference: RecencyPreferenceSchema,
});

export type DiscoverInput = z.infer<typeof DiscoverInputSchema>;

