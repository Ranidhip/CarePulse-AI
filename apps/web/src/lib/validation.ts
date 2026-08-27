/**
 * Zod schemas for the provider web app's write-side forms. These validate
 * on submit, before the network call — they don't replace the backend's
 * own Pydantic validation (still the source of truth), they just catch
 * mistakes locally with a clearer message and without a round trip.
 */

import { z } from "zod";

export const followUpFormSchema = z.object({
  notes: z
    .string()
    .trim()
    .min(1, "Notes are required before an alert can be marked Resolved or saved."),
  next_advice: z.string().trim().max(1000, "Next advice is too long.").optional().or(z.literal("")),
});

export type FollowUpFormInput = z.infer<typeof followUpFormSchema>;

export const feedbackNoteSchema = z
  .string()
  .trim()
  .min(1, "Add a short note about what's wrong with this summary.")
  .max(1000, "Note is too long.");

export const overrideReasonSchema = z
  .string()
  .trim()
  .min(1, "A reason is required to override the risk level.")
  .max(1000, "Reason is too long.");

/**
 * Runs a zod schema and returns either the parsed data or the first
 * human-readable error message — the shape every form's handleSave()
 * already expects (a single `error` string to show in its validation box).
 */
export function validateOrError<T>(
  schema: z.ZodType<T>,
  input: unknown
): { ok: true; data: T } | { ok: false; error: string } {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, error: result.error.issues[0]?.message ?? "Invalid input." };
}
